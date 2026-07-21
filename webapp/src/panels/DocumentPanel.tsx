import { useState } from 'react';
import { api, envelopeToDataUrl } from '../api/client';
import type { DocumentResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function DocumentPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<DocumentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.document(config, image.file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">
        Photograph a document at an angle — the phone finds it and returns a
        perspective-corrected scan.
      </p>
      <ImageDropzone onPick={(picked) => { setImage(picked); setResult(null); }} />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!image || busy}>Scan document</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && !result.detected && (
        <Card><p className="text-sm text-ink-2">No document found in this image.</p></Card>
      )}
      {result?.detected && result.corrected && image && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Original">
            <img src={image.previewUrl} alt="Original" className="w-full rounded-lg" />
          </Card>
          <Card title={`Corrected scan (confidence ${(result.confidence ?? 0).toFixed(2)})`}>
            <img
              src={envelopeToDataUrl(result.corrected)}
              alt="Corrected document"
              className="w-full rounded-lg"
            />
            <a
              href={envelopeToDataUrl(result.corrected)}
              download="scan.png"
              className="mt-2 inline-block text-xs text-cyan-a"
            >
              Download PNG
            </a>
          </Card>
        </div>
      )}
    </div>
  );
}
