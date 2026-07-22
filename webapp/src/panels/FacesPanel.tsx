import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { FacesResponse } from '../api/types';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithPoints } from '../utils/overlay';
import { useStoredState } from '../utils/useStoredState';

export function FacesPanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.faces.image',
    null,
    revivePickedImage,
  );
  const [result, setResult] = useStoredState<FacesResponse | null>('sidecar.faces.result', null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const clear = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  // The canvas only mounts once `result` renders, so drawing must happen here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result || !image) return;
    const element = new Image();
    element.onload = () =>
      drawImageWithPoints(
        canvas,
        element,
        result.faces.flatMap((face) => Object.values(face.landmarks)),
      );
    element.src = image.previewUrl;
    return () => {
      element.onload = null;
    };
  }, [result, image]);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.faces(config, image.file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ImageDropzone
        key={inputKey}
        preview={image?.previewUrl ?? null}
        onPick={(picked) => { setImage(picked); setResult(null); }}
      />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!image || busy}>Detect faces</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!image && !result && !error)}>
          Clear
        </Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <Card title={`${result.faces.length} face(s)`}>
          <canvas ref={canvasRef} className="w-full rounded-lg" data-testid="faces-canvas" />
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
