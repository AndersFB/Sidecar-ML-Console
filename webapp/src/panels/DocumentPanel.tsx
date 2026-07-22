import { useMemo, useState } from 'react';
import { api, envelopeToDataUrl } from '../api/client';
import type { DocumentResponse } from '../api/types';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { useStoredState } from '../utils/useStoredState';

export function DocumentPanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.document.image',
    null,
    revivePickedImage,
  );
  const [result, setResult] = useStoredState<DocumentResponse | null>('sidecar.document.result', null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  // The corrected scan can be multiple MB of base64 — build its URL once per
  // result, not twice per render.
  const correctedUrl = useMemo(
    () => (result?.corrected ? envelopeToDataUrl(result.corrected) : null),
    [result],
  );

  const clear = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

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
      {result?.detected && correctedUrl && image && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Original">
            <img src={image.previewUrl} alt="Original" className="w-full rounded-lg" />
          </Card>
          <Card title={`Corrected scan (confidence ${(result.confidence ?? 0).toFixed(2)})`}>
            <img
              src={correctedUrl}
              alt="Corrected document"
              className="w-full rounded-lg"
            />
            <a
              href={correctedUrl}
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
