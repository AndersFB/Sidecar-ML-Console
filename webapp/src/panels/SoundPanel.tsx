import { useState } from 'react';
import { api } from '../api/client';
import type { SoundClassifyResponse } from '../api/types';
import { AudioInput } from '../components/AudioInput';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function SoundPanel() {
  const { config } = useConnection();
  const [audio, setAudio] = useState<Blob | null>(null);
  const [result, setResult] = useState<SoundClassifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const clear = () => {
    setAudio(null);
    setResult(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  const run = async () => {
    if (!audio) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.soundClassify(config, audio));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AudioInput key={inputKey} onAudio={(blob) => { setAudio(blob); setResult(null); }} />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!audio || busy}>Detect sounds</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!audio && !result && !error)}>
          Clear
        </Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <>
          <Card title={`Top sounds across ${result.duration_s.toFixed(1)}s`}>
            <ul className="flex flex-col gap-1.5">
              {result.top.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-sm">
                  <span className="w-44 truncate">{item.label.replaceAll('_', ' ')}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-a to-cyan-a"
                      style={{ width: `${Math.round(item.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-xs text-ink-2">
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Timeline">
            <ul className="flex flex-col gap-1 font-mono text-xs text-ink-2">
              {result.windows.map((window, index) => (
                <li key={index}>
                  <span className="text-cyan-a">
                    {window.start_s.toFixed(1)}–{window.end_s.toFixed(1)}s
                  </span>{' '}
                  {window.classifications
                    .slice(0, 3)
                    .map((item) => `${item.label} ${(item.confidence * 100).toFixed(0)}%`)
                    .join(' · ') || '—'}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
