import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { OcrResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, CopyButton, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithBoxes } from '../utils/overlay';

export function OcrPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<OcrResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.ocr(config, image.file);
      setResult(response);
      const canvas = canvasRef.current;
      if (canvas) {
        const element = new Image();
        element.onload = () =>
          drawImageWithBoxes(
            canvas,
            element,
            response.lines.map((line) => ({ box: line.box_px, label: line.text })),
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
        <Button onClick={() => void run()} disabled={!image || busy}>Read text</Button>
        {busy && <Spinner label="Recognizing…" />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <>
          <Card title={`Detected ${result.lines.length} line(s)`}>
            <canvas ref={canvasRef} className="w-full rounded-lg" data-testid="ocr-canvas" />
          </Card>
          <Card
            title="Extracted text"
            actions={<CopyButton text={result.text} />}
          >
            <pre className="whitespace-pre-wrap font-mono text-sm text-ink" data-testid="ocr-text">
              {result.text || '(no text found)'}
            </pre>
          </Card>
        </>
      )}
    </div>
  );
}
