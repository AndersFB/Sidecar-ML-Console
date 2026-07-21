import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { TranscribeResponse } from '../api/types';
import { AudioInput } from '../components/AudioInput';
import { Button, Card, CopyButton, ErrorBanner, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function TranscribePanel() {
  const { config, status } = useConnection();
  const [audio, setAudio] = useState<Blob | null>(null);
  const [locale, setLocale] = useState('en-US');
  const [installed, setInstalled] = useState<string[]>([]);
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online') return;
    api
      .transcribeLocales(config)
      .then((locales) => setInstalled(locales.installed))
      .catch(() => setInstalled([]));
  }, [config, status]);

  const run = async () => {
    if (!audio) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.transcribe(config, audio, locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AudioInput onAudio={(blob) => { setAudio(blob); setResult(null); }} />
      <div className="flex items-center gap-3">
        <input
          className={`${inputClass} w-28`}
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          aria-label="Locale"
        />
        <Button onClick={() => void run()} disabled={!audio || busy}>Transcribe</Button>
        {busy && <Spinner label="Transcribing on-device…" />}
      </div>
      {installed.length > 0 && (
        <p className="text-xs text-ink-3">Installed models: {installed.join(', ')}</p>
      )}
      {error && <ErrorBanner message={error} />}

      {result && (
        <>
          <Card title={`Transcript (${result.locale})`} actions={<CopyButton text={result.text} />}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.text || '(silence)'}</p>
          </Card>
          {result.segments.length > 0 && (
            <Card title="Segments">
              <ul className="flex flex-col gap-1 font-mono text-xs text-ink-2">
                {result.segments.map((segment, index) => (
                  <li key={index}>
                    <span className="text-cyan-a">
                      {segment.start_s.toFixed(1)}–{segment.end_s.toFixed(1)}s
                    </span>{' '}
                    {segment.text}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
