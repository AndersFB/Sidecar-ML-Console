import { useState } from 'react';
import { api, envelopeToDataUrl } from '../api/client';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function PersonSegPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [quality, setQuality] = useState('balanced');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const envelope = await api.personSegmentation(config, image.file, quality);
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
          value={quality}
          onChange={(event) => setQuality(event.target.value)}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="accurate">Accurate</option>
        </select>
        <Button onClick={() => void run()} disabled={!image || busy}>Segment people</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {resultUrl && image && (
        <div className="grid grid-cols-2 gap-3">
          <Card title="Original">
            <img src={image.previewUrl} alt="Original" className="w-full rounded-lg" />
          </Card>
          <Card title="Person mask">
            <img src={resultUrl} alt="Person segmentation mask" className="w-full rounded-lg" />
          </Card>
        </div>
      )}
    </div>
  );
}
