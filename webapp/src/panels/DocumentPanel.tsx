import { useEffect, useState } from 'react';
import { api, envelopeToBlob } from '../api/client';
import type { DocumentResponse } from '../api/types';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { useStoredMediaUrl } from '../utils/useStoredMedia';
import { useStoredState } from '../utils/useStoredState';

export function DocumentPanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.document.image',
    null,
    revivePickedImage,
  );
  // The corrected scan lives as a Blob under its own key; `result` keeps only
  // the metadata (detected/quad/confidence, with `corrected` stripped).
  const [result, setResult] = useStoredState<DocumentResponse | null>('sidecar.document.result', null);
  const [scanUrl, setScan] = useStoredMediaUrl('sidecar.document.scan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  // Migrate legacy records that stored the scan as base64 inside `result`.
  useEffect(() => {
    if (result?.corrected) {
      setScan(envelopeToBlob(result.corrected));
      setResult({ ...result, corrected: undefined });
    }
  }, [result, setScan, setResult]);

  const clear = () => {
    setImage(null);
    setResult(null);
    setScan(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      // JPEG scans are typically 5-10x smaller than the default PNG.
      const response = await api.document(config, image.file, 'jpeg');
      setScan(response.corrected ? envelopeToBlob(response.corrected) : null);
      setResult({ ...response, corrected: undefined });
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
      <ImageDropzone
        key={inputKey}
        preview={image?.previewUrl ?? null}
        onPick={(picked) => { setImage(picked); setResult(null); }}
      />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!image || busy}>Scan document</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!image && !result && !error)}>
          Clear
        </Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && !result.detected && (
        <Card><p className="text-sm text-ink-2">No document found in this image.</p></Card>
      )}
      {result?.detected && scanUrl && image && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Original">
            <img src={image.previewUrl} alt="Original" className="w-full rounded-lg" />
          </Card>
          <Card title={`Corrected scan (confidence ${(result.confidence ?? 0).toFixed(2)})`}>
            <img
              src={scanUrl}
              alt="Corrected document"
              className="w-full rounded-lg"
            />
            <a
              href={scanUrl}
              download="scan.jpg"
              className="mt-2 inline-block text-xs text-cyan-a"
            >
              Download scan
            </a>
          </Card>
        </div>
      )}
    </div>
  );
}
