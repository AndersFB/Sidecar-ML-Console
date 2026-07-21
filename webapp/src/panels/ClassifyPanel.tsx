import { useState } from 'react';
import { api } from '../api/client';
import type { ClassifyResponse } from '../api/types';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function ClassifyPanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.classify(config, image.file, 12));
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
        <Button onClick={() => void run()} disabled={!image || busy}>Classify</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <Card title="Labels">
          {result.classifications.length === 0 && (
            <p className="text-sm text-ink-3">Nothing confidently recognized.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {result.classifications.map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate">{item.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-a to-cyan-a"
                    style={{ width: `${Math.round(item.confidence * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-xs text-ink-2">
                  {(item.confidence * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
