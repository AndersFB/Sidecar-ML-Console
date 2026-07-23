import { useEffect, useRef, useState } from 'react';

export const CAMERA_CONTEXT_HINT =
  '(camera capture needs http://localhost or the downloaded console file)';

/**
 * Acquires a webcam stream, attaches it to the returned video ref, and
 * releases it on unmount or device switch. 1080p is requested so still
 * captures get full detail; consumers that post frames continuously
 * (live mode) downscale before sending. Device labels only populate after
 * permission is granted, so `devices` fills in once the stream is live.
 */
export function useCamera(): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Stream attached and playing — safe to read frames. */
  ready: boolean;
  /** Fatal acquisition failure (denied, no hardware, insecure context). */
  error: string | null;
  devices: MediaDeviceInfo[];
  deviceId: string;
  setDeviceId: (id: string) => void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    let disposed = false;
    const video = videoRef.current;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(`Camera unavailable in this context ${CAMERA_CONTEXT_HINT}`);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Muted inline video is exempt from autoplay blocking; a rejection
            // here means the element went away mid-start.
          }
        }
        if (disposed) return;
        setReady(true);
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!disposed) setDevices(all.filter((device) => device.kind === 'videoinput'));
        } catch {
          // Picker stays hidden; the default camera still works.
        }
      } catch (err) {
        if (disposed) return;
        setError(
          err instanceof Error
            ? `Camera unavailable: ${err.message} ${CAMERA_CONTEXT_HINT}`
            : 'Camera unavailable',
        );
      }
    })();
    return () => {
      disposed = true;
      setReady(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [deviceId]);

  return { videoRef, ready, error, devices, deviceId, setDeviceId };
}
