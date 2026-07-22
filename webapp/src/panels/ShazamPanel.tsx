import { useState } from 'react';
import { api } from '../api/client';
import type { ShazamResponse } from '../api/types';
import { AudioInput } from '../components/AudioInput';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { useStoredState } from '../utils/useStoredState';

export function ShazamPanel() {
  const { config } = useConnection();
  const [audio, setAudio] = useStoredState<Blob | null>('sidecar.shazam.audio', null);
  const [result, setResult] = useStoredState<ShazamResponse | null>('sidecar.shazam.result', null);
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
      setResult(await api.shazam(config, audio));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">
        Record ~10 seconds of a song. The fingerprint is computed on the phone; matching uses
        Apple's Shazam catalog (internet required).
      </p>
      <AudioInput key={inputKey} onAudio={(blob) => { setAudio(blob); setResult(null); }} />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={!audio || busy}>Identify song</Button>
        <Button variant="ghost" onClick={clear} disabled={busy || (!audio && !result && !error)}>
          Clear
        </Button>
        {busy && <Spinner label="Matching…" />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && !result.matched && (
        <Card><p className="text-sm text-ink-2">No match found.</p></Card>
      )}
      {result?.matched && result.media && (
        <Card title="Match">
          <div className="flex gap-4">
            {result.media.artwork_url && (
              <img
                src={result.media.artwork_url}
                alt="Album artwork"
                className="size-24 rounded-lg object-cover"
              />
            )}
            <div className="flex flex-col justify-center gap-1">
              <p className="text-lg font-bold">{result.media.title ?? 'Unknown title'}</p>
              <p className="text-sm text-ink-2">{result.media.artist ?? 'Unknown artist'}</p>
              {result.media.album && <p className="text-xs text-ink-3">{result.media.album}</p>}
              {result.media.apple_music_url && (
                <a
                  href={result.media.apple_music_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-a"
                >
                  Open in Apple Music ↗
                </a>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
