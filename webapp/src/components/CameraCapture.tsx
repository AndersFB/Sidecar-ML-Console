import { useRef, useState } from 'react';
import { Button } from './Primitives';
import { useCamera } from '../utils/useCamera';
import { useCloseWhenHidden } from '../utils/useCloseWhenHidden';

const PHOTO_JPEG_QUALITY = 0.92;

/**
 * Webcam viewfinder with a shutter button — the browser-side counterpart of
 * taking a photo with the phone's camera. The preview can be mirrored for a
 * natural selfie view, but the captured photo is always the true, unmirrored
 * frame (mirrored stills would flip text for OCR and swap hand chirality).
 */
export function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (photo: File) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { videoRef, ready, error, devices, deviceId, setDeviceId } = useCamera();
  const [mirror, setMirror] = useState(true);

  useCloseWhenHidden(containerRef, onCancel);

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY),
    );
    if (!blob) return;
    const stamp = new Date().toISOString().slice(11, 19).replaceAll(':', '-');
    onCapture(new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }));
  };

  return (
    <div ref={containerRef} data-testid="camera-capture" className="flex flex-col gap-2">
      <div className="relative min-h-40 overflow-hidden rounded-xl border border-line bg-navy/60">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-testid="capture-video"
          className={`block w-full ${mirror ? '-scale-x-100' : ''}`}
        />
        {!ready && !error && (
          <span className="absolute left-2 top-2 rounded-md bg-navy/80 px-2 py-1 font-mono text-xs text-cyan-a">
            Starting camera…
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void takePhoto()} disabled={!ready}>
          Take photo
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
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
          Mirror preview
        </label>
      </div>
      {error && <p className="text-xs text-amber-a">{error}</p>}
    </div>
  );
}
