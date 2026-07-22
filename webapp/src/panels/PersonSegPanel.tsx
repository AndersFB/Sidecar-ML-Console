import { useState } from 'react';
import { api, envelopeToBlob } from '../api/client';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { usePersistentState } from '../utils/usePersistentState';
import { useStoredMediaUrl } from '../utils/useStoredMedia';
import { useStoredState } from '../utils/useStoredState';

export function PersonSegPanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.personseg.image',
    null,
    revivePickedImage,
  );
  const [quality, setQuality] = usePersistentState('sidecar.personseg.quality', 'balanced');
  const [resultUrl, setResult] = useStoredMediaUrl('sidecar.personseg.result');
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
      const envelope = await api.personSegmentation(config, image.file, quality);
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
          value={quality}
          onChange={(event) => setQuality(event.target.value)}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="accurate">Accurate</option>
        </select>
        <Button onClick={() => void run()} disabled={!image || busy}>Segment people</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!image && !resultUrl && !error)}>
          Clear
        </Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {resultUrl && image && (
        <div className="grid gap-3 sm:grid-cols-2">
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
