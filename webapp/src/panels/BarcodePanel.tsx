import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { BarcodesResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, CopyButton, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithBoxes } from '../utils/overlay';

export function BarcodePanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<BarcodesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.barcodes(config, image.file);
      setResult(response);
      const canvas = canvasRef.current;
      if (canvas) {
        const element = new Image();
        element.onload = () =>
          drawImageWithBoxes(
            canvas,
            element,
            response.barcodes.map((barcode) => ({
              box: barcode.box_px,
              label: barcode.symbology,
            })),
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
        <Button onClick={() => void run()} disabled={!image || busy}>Scan codes</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <>
          <Card title={`${result.barcodes.length} code(s) found`}>
            <canvas ref={canvasRef} className="w-full rounded-lg" />
          </Card>
          {result.barcodes.map((barcode, index) => (
            <Card key={index} title={barcode.symbology} actions={barcode.payload ? <CopyButton text={barcode.payload} /> : undefined}>
              <p className="break-all font-mono text-sm">{barcode.payload ?? '(no payload)'}</p>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
