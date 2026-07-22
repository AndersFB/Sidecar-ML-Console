import { useState } from 'react';
import { api, envelopeToBlob } from '../api/client';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { usePersistentState } from '../utils/usePersistentState';
import { useStoredMediaUrl } from '../utils/useStoredMedia';
import { useStoredState } from '../utils/useStoredState';

export function SubjectMaskPanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.subjectmask.image',
    null,
    revivePickedImage,
  );
  const [mode, setMode] = usePersistentState<'cutout' | 'mask'>('sidecar.subjectmask.mode', 'cutout');
  const [resultUrl, setResult] = useStoredMediaUrl('sidecar.subjectmask.result');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

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
      const envelope = await api.subjectMask(config, image.file, mode);
      setResult(envelopeToBlob(envelope));
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
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as 'cutout' | 'mask')}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          <option value="cutout">Cutout (transparent background)</option>
          <option value="mask">Mask only</option>
        </select>
        <Button onClick={() => void run()} disabled={!image || busy}>Lift subject</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!image && !resultUrl && !error)}>
          Clear
        </Button>
        {busy && <Spinner label="Segmenting…" />}
      </div>
      {error && <ErrorBanner message={error} />}

      {resultUrl && image && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Original">
            <img src={image.previewUrl} alt="Original" className="w-full rounded-lg" />
          </Card>
          <Card title="Result">
            <div
              className="rounded-lg"
              style={{
                background:
                  'repeating-conic-gradient(#1b2344 0% 25%, #131a32 0% 50%) 0 / 20px 20px',
              }}
            >
              <img src={resultUrl} alt="Subject cutout" className="w-full" />
            </div>
            <a href={resultUrl} download="subject.png" className="mt-2 inline-block text-xs text-cyan-a">
              Download PNG
            </a>
          </Card>
        </div>
      )}
    </div>
  );
}
