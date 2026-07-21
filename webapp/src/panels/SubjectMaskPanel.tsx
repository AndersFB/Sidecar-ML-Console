import { useState } from 'react';
import { api, envelopeToDataUrl } from '../api/client';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function SubjectMaskPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [mode, setMode] = useState<'cutout' | 'mask'>('cutout');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const envelope = await api.subjectMask(config, image.file, mode);
      setResultUrl(envelopeToDataUrl(envelope));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ImageDropzone onPick={(picked) => { setImage(picked); setResultUrl(null); }} />
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
