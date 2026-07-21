import { useState } from 'react';
import { api } from '../api/client';
import type { SimilarityResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function SimilarityPanel() {
  const { config } = useConnection();
  const [imageA, setImageA] = useState<PickedImage | null>(null);
  const [imageB, setImageB] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<SimilarityResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!imageA || !imageB) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.similarity(config, imageA.file, imageB.file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">
        Compares Vision feature-print embeddings — the same tech behind reverse image search
        and photo de-duplication. Lower distance = more similar.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageDropzone label="Image A" onPick={(picked) => { setImageA(picked); setResult(null); }} />
        <ImageDropzone label="Image B" onPick={(picked) => { setImageB(picked); setResult(null); }} />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!imageA || !imageB || busy}>Compare</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <Card title="Result">
          <div className="flex items-baseline gap-4">
            <span className="text-4xl font-bold text-cyan-a">{result.distance.toFixed(3)}</span>
            <span className="text-sm text-ink-2">distance → “{result.similarity_hint}”</span>
          </div>
        </Card>
      )}
    </div>
  );
}
