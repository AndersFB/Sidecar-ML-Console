import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button, Card, CopyButton, ErrorBanner, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function TranslatePanel() {
  const { config, status } = useConnection();
  const [text, setText] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [source, setSource] = useState('en');
  const [target, setTarget] = useState('de');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online') return;
    api
      .translationLanguages(config)
      .then((response) => setLanguages(response.languages))
      .catch(() => setLanguages([]));
  }, [config, status]);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.translate(config, [text], source || undefined, target);
      setResult(response.translations[0]?.text ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const options = languages.length > 0 ? languages : ['en', 'de', 'fr', 'es', 'da'];

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className={`${inputClass} w-full`}
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Text to translate…"
        aria-label="Text to translate"
      />
      <div className="flex items-center gap-2">
        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
          aria-label="Source language"
        >
          {options.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>
        <span className="text-ink-3">→</span>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
          aria-label="Target language"
        >
          {options.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>Translate</Button>
        {busy && <Spinner />}
      </div>
      <p className="text-xs text-ink-3">
        Language pairs must be downloaded on the iPhone first (ML Sidecar app → Settings →
        Translation).
      </p>
      {error && <ErrorBanner message={error} />}

      {result !== null && (
        <Card title={`Translation (${target})`} actions={<CopyButton text={result} />}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
        </Card>
      )}
    </div>
  );
}
