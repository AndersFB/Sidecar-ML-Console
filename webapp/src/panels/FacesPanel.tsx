import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { FacesResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithPoints } from '../utils/overlay';

export function FacesPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<FacesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.faces(config, image.file);
      setResult(response);
      const canvas = canvasRef.current;
      if (canvas) {
        const element = new Image();
        element.onload = () =>
          drawImageWithPoints(
            canvas,
            element,
            response.faces.flatMap((face) => Object.values(face.landmarks)),
          );
        element.src = image.previewUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ImageDropzone onPick={(picked) => { setImage(picked); setResult(null); }} />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!image || busy}>Detect faces</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <Card title={`${result.faces.length} face(s)`}>
          <canvas ref={canvasRef} className="w-full rounded-lg" />
          <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-2">
            {result.faces.map((face, index) => (
              <li key={index} className="font-mono">
                #{index + 1} roll {face.roll_deg ?? '–'}° · yaw {face.yaw_deg ?? '–'}° · pitch{' '}
                {face.pitch_deg ?? '–'}°
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
