import { useEffect, useRef, useState } from 'react';
import { LiveSocket, liveSocketUrl, streamUrl } from '../api/liveStream';
import type { FaceParameters } from '../api/types';
import { useConnection } from '../state/ConnectionContext';
import { useCamera } from '../utils/useCamera';
import { useCloseWhenHidden } from '../utils/useCloseWhenHidden';

/** Longest edge of the frames posted to the phone — matches LiveCameraView. */
const MAX_FRAME_EDGE = 1280;
const JPEG_QUALITY = 0.7;
/** Floor between frames (~15 fps ceiling). */
const MIN_FRAME_INTERVAL_MS = 66;

/**
 * Streams webcam frames to `GET /v1/face/stream` and shows the frames the phone
 * sends back.
 *
 * The difference from `LiveCameraView` is what comes back: the vision
 * endpoints return coordinates, so that view draws an overlay on top of the
 * raw `<video>`. Here the response *is* the picture, so the camera element is
 * hidden and only the phone's output is shown.
 *
 * Pacing is the same drop-while-busy rule — exactly one frame outstanding, and
 * frames the camera produces while the phone works are never captured.
 */
export function LiveFaceView({
  parameters,
  onError,
  onClose,
}: {
  parameters: FaceParameters;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { config } = useConnection();
  const containerRef = useRef<HTMLDivElement>(null);
  const { videoRef, ready: cameraReady, error: cameraError, devices, deviceId, setDeviceId } =
    useCamera();

  const socketRef = useRef<LiveSocket | null>(null);
  const pendingRef = useRef(0);
  const outputRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [live, setLive] = useState(false);
  const [fps, setFps] = useState(0);
  const [mirror, setMirror] = useState(true);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useCloseWhenHidden(containerRef, onClose);

  useEffect(() => {
    if (cameraError) onErrorRef.current(cameraError);
  }, [cameraError]);

  // Socket lifecycle. Independent of the camera so a slow permission prompt
  // doesn't tear down a healthy connection.
  useEffect(() => {
    const socket = new LiveSocket(liveSocketUrl(config, '/v1/face/stream'), {
      onReady: () => {
        socket.send({ type: 'parameters', parameters });
        setLive(true);
      },
      onMedia: (data) => {
        pendingRef.current = 0;
        const url = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
        // Each frame pins its blob until revoked; release the one it replaces.
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        if (outputRef.current) outputRef.current.src = url;
      },
      onError: (message) => {
        pendingRef.current = 0;
        onErrorRef.current(message);
      },
      onClose: () => setLive(false),
    });
    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      setLive(false);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
    // `parameters` is deliberately not a dependency: retuning is a control
    // frame, not a reconnect. The effect below sends it.
  }, [config]);

  // Retune in place.
  useEffect(() => {
    if (live) socketRef.current?.send({ type: 'parameters', parameters });
  }, [parameters, live]);

  // Capture loop.
  useEffect(() => {
    if (!cameraReady || !live) return;
    let cancelled = false;
    let timer: number | null = null;
    const capture = document.createElement('canvas');
    let ema = 0;
    let lastSent = 0;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        typeof capture.toBlob !== 'function' ||
        pendingRef.current > 0
      ) {
        timer = window.setTimeout(tick, MIN_FRAME_INTERVAL_MS);
        return;
      }
      const scale = Math.min(
        1,
        MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight),
      );
      capture.width = Math.max(1, Math.round(video.videoWidth * scale));
      capture.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = capture.getContext('2d');
      if (!ctx) {
        timer = window.setTimeout(tick, MIN_FRAME_INTERVAL_MS);
        return;
      }
      ctx.drawImage(video, 0, 0, capture.width, capture.height);
      capture.toBlob(
        (blob) => {
          if (cancelled || !blob) {
            timer = window.setTimeout(tick, MIN_FRAME_INTERVAL_MS);
            return;
          }
          void blob.arrayBuffer().then((bytes) => {
            if (cancelled) return;
            pendingRef.current = 1;
            socketRef.current?.sendMedia(bytes);
            const now = performance.now();
            if (lastSent > 0) {
              const instant = 1000 / Math.max(1, now - lastSent);
              ema = ema === 0 ? instant : ema * 0.8 + instant * 0.2;
              setFps(ema);
            }
            lastSent = now;
            timer = window.setTimeout(tick, MIN_FRAME_INTERVAL_MS);
          });
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [cameraReady, live, videoRef]);

  const flip = mirror ? '-scale-x-100' : '';

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div className="relative min-h-40 overflow-hidden rounded-xl border border-line bg-navy/60">
        {/* Frame source only — the phone's output is what the user sees. */}
        <video ref={videoRef} autoPlay playsInline muted data-testid="live-face-source" className="hidden" />
        <img
          ref={outputRef}
          alt="Transformed camera frame"
          data-testid="live-face-output"
          className={`block w-full ${flip}`}
        />
        <span
          data-testid="live-face-status"
          className="absolute left-2 top-2 rounded-md bg-navy/80 px-2 py-1 font-mono text-xs text-cyan-a"
        >
          {live ? `● live${fps > 0 ? ` · ${fps.toFixed(1)} fps` : ''}` : 'Connecting to the phone…'}
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
      </div>
      <p className="text-xs text-ink-3">
        Frames stream to the phone one at a time and are transformed on-device;
        nothing is recorded. Moving a slider retunes the effect without
        interrupting the stream. Only one face stream runs at a time.
      </p>
    </div>
  );
}

/**
 * The opposite direction: the phone's *own* camera, already transformed, as
 * MJPEG. A bare `<img>` renders `multipart/x-mixed-replace` natively.
 */
export function FaceBroadcastView({ preset }: { preset?: string }) {
  const { config } = useConnection();
  const src = streamUrl(config, '/v1/face/broadcast', { preset });
  return (
    <div className="flex flex-col gap-2">
      <img
        src={src}
        alt="Live camera from the phone"
        data-testid="face-broadcast"
        className="w-full rounded-xl border border-line"
      />
      <p className="text-xs text-ink-3">
        The phone's own camera, transformed on-device and streamed as MJPEG.
        Answers 503 when the app isn't supplying capture.
      </p>
    </div>
  );
}
