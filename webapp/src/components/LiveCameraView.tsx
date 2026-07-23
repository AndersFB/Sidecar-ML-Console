import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ApiConfig } from '../api/client';
import { useConnection } from '../state/ConnectionContext';
import { drawLiveOverlay, type LiveDetections, type LiveMode } from '../utils/overlay';
import { useCamera } from '../utils/useCamera';
import { useCloseWhenHidden } from '../utils/useCloseWhenHidden';

/**
 * Longest edge of the frames posted to the phone. Matches the 720p capture
 * the phone's own live camera mode uses — bigger frames cost upload and
 * decode time without helping the detectors.
 */
const MAX_FRAME_EDGE = 1280;
const JPEG_QUALITY = 0.7;
/**
 * Floor between frame posts (~15 fps ceiling). The loop keeps exactly one
 * request in flight and drops frames while the phone works, so the real rate
 * self-throttles to what the phone sustains; the floor just keeps a fast
 * phone from being saturated with vision requests (it runs two concurrently,
 * shared with every other client).
 */
const MIN_FRAME_INTERVAL_MS = 66;
/** A frame that takes this long has hung (phone asleep, Wi-Fi drop) — abort it. */
const FRAME_TIMEOUT_MS = 15_000;
/** Pause after a transient failure (429 busy, network hiccup) before retrying. */
const RETRY_DELAY_MS = 500;
/** Consecutive failures before giving up and closing live mode. */
const MAX_CONSECUTIVE_FAILURES = 8;

/** Statuses that repeating the same frame can never fix. */
const FATAL_STATUS = new Set([401, 403, 404, 405, 413, 501, 503]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function analyzeFrame(
  config: ApiConfig,
  mode: LiveMode,
  frame: Blob,
  signal: AbortSignal,
): Promise<LiveDetections> {
  switch (mode) {
    case 'faces': {
      const result = await api.faces(config, frame, signal);
      return { mode, frame: result.image, faces: result.faces };
    }
    case 'body': {
      const result = await api.bodyPose(config, frame, signal);
      return { mode, frame: result.image, persons: result.persons };
    }
    case 'hands': {
      const result = await api.handPose(config, frame, signal);
      return { mode, frame: result.image, hands: result.hands };
    }
  }
}

function summarize(detections: LiveDetections): string {
  switch (detections.mode) {
    case 'faces':
      return `${detections.faces?.length ?? 0} face(s)`;
    case 'body':
      return `${detections.persons?.length ?? 0} person(s)`;
    case 'hands': {
      const hands = detections.hands ?? [];
      const sides = hands.map((hand) => hand.chirality ?? 'unknown').join(', ');
      return `${hands.length} hand(s)${sides ? `: ${sides}` : ''}`;
    }
  }
}

/**
 * Streams webcam frames to the phone and draws the detections over the live
 * preview: capture a frame, POST it to the mode's vision endpoint, paint the
 * result, repeat. The `<video>` shows the camera natively; a transparent
 * canvas sized to the analyzed frame sits on top, so server pixel
 * coordinates apply 1:1 and CSS keeps the two aligned.
 */
export function LiveCameraView({
  mode,
  onClose,
  onError,
}: {
  mode: LiveMode;
  /** Live mode must end without a user click (panel hidden, tab switched). */
  onClose: () => void;
  /** Fatal problem (camera denied, auth failure) — host shows it and closes. */
  onError: (message: string) => void;
}) {
  const { config } = useConnection();
  const containerRef = useRef<HTMLDivElement>(null);
  const { videoRef, ready, error: cameraError, devices, deviceId, setDeviceId } = useCamera();

  const [detections, setDetections] = useState<LiveDetections | null>(null);
  const [fps, setFps] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mirror, setMirror] = useState(true);

  // The loop must call the latest callback without restarting on re-renders.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useCloseWhenHidden(containerRef, onClose);

  useEffect(() => {
    if (cameraError) onErrorRef.current(cameraError);
  }, [cameraError]);

  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Inference loop: one frame in flight at a time; frames the camera produces
  // while the phone is busy are simply never captured (drop-while-busy).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let controller: AbortController | null = null;
    const capture = document.createElement('canvas');

    const grabFrame = (): Promise<Blob | null> => {
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        typeof capture.toBlob !== 'function'
      ) {
        return Promise.resolve(null);
      }
      const s = Math.min(1, MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
      capture.width = Math.max(1, Math.round(video.videoWidth * s));
      capture.height = Math.max(1, Math.round(video.videoHeight * s));
      const ctx = capture.getContext('2d');
      if (!ctx) return Promise.resolve(null);
      ctx.drawImage(video, 0, 0, capture.width, capture.height);
      return new Promise((resolve) => capture.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    };

    void (async () => {
      let ema = 0;
      let consecutiveFailures = 0;
      while (!cancelled) {
        const started = performance.now();
        const frame = await grabFrame();
        if (cancelled) break;
        if (!frame) {
          await sleep(200); // Camera still warming up.
          continue;
        }
        try {
          controller = new AbortController();
          const timeout = setTimeout(() => controller?.abort(), FRAME_TIMEOUT_MS);
          let result: LiveDetections;
          try {
            result = await analyzeFrame(config, mode, frame, controller.signal);
          } finally {
            clearTimeout(timeout);
            controller = null;
          }
          if (cancelled) break;
          consecutiveFailures = 0;
          setDetections(result);
          setRequestError(null);
          const instant = 1000 / Math.max(1, performance.now() - started);
          ema = ema === 0 ? instant : ema * 0.8 + instant * 0.2;
          setFps(ema);
        } catch (error) {
          if (cancelled) break;
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof ApiError && FATAL_STATUS.has(error.status)) {
            onErrorRef.current(`Live camera stopped: ${message}`);
            return;
          }
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            onErrorRef.current(`Live camera stopped — the phone stopped responding (${message})`);
            return;
          }
          const aborted = error instanceof DOMException && error.name === 'AbortError';
          setRequestError(aborted ? 'Frame timed out — retrying…' : `${message} — retrying…`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        const elapsed = performance.now() - started;
        await sleep(elapsed < MIN_FRAME_INTERVAL_MS ? MIN_FRAME_INTERVAL_MS - elapsed : 0);
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [ready, mode, config, videoRef]);

  // Paint the newest detections onto the overlay layer.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    if (!detections) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawLiveOverlay(canvas, detections);
  }, [detections]);

  // Stale results from the previous mode would draw the wrong overlay shape.
  useEffect(() => {
    setDetections(null);
    setFps(0);
    setRequestError(null);
  }, [mode]);

  const flip = mirror ? '-scale-x-100' : '';
  const status = detections
    ? `${summarize(detections)}${fps > 0 ? ` · ${fps.toFixed(1)} fps` : ''}`
    : 'Starting camera…';

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div className="relative min-h-40 overflow-hidden rounded-xl border border-line bg-navy/60">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-testid="live-video"
          className={`block w-full ${flip}`}
        />
        <canvas
          ref={overlayRef}
          data-testid="live-overlay"
          className={`pointer-events-none absolute inset-0 h-full w-full ${flip}`}
        />
        <span
          data-testid="live-status"
          className="absolute left-2 top-2 rounded-md bg-navy/80 px-2 py-1 font-mono text-xs text-cyan-a"
        >
          {status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            aria-label="Camera"
            className="rounded-lg border border-line bg-navy/70 px-2 py-1 text-xs"
          >
            <option value="">Default camera</option>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={mirror}
            onChange={(event) => setMirror(event.target.checked)}
            className="accent-cyan-a"
          />
          Mirror
        </label>
        {requestError && <span className="text-xs text-amber-a">{requestError}</span>}
      </div>
      <p className="text-xs text-ink-3">
        Frames stream to the phone one at a time and are analyzed on-device; nothing is recorded.
      </p>
    </div>
  );
}
