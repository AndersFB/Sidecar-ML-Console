import { useState } from 'react';
import { api } from '../api/client';
import type { NlpAnalyzeResponse } from '../api/types';
import { Button, Card, ErrorBanner, JsonViewer, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

const ENTITY_COLORS: Record<string, string> = {
  person: 'bg-indigo-a/40',
  place: 'bg-cyan-a/30',
  organization: 'bg-mint/30',
};

function HighlightedText({ text, result }: { text: string; result: NlpAnalyzeResponse }) {
  const entities = [...(result.entities ?? [])].sort((a, b) => a.start - b.start);
  if (entities.length === 0) return <p className="text-sm">{text}</p>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  entities.forEach((entity, index) => {
    if (entity.start > cursor) {
      parts.push(<span key={`plain-${index}`}>{text.slice(cursor, entity.start)}</span>);
    }
    parts.push(
      <mark
        key={`entity-${index}`}
        className={`rounded px-1 text-ink ${ENTITY_COLORS[entity.type] ?? 'bg-amber-a/30'}`}
        title={entity.type}
      >
        {text.slice(entity.start, entity.end)}
      </mark>,
    );
    cursor = entity.end;
  });
  parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <p className="text-sm leading-relaxed">{parts}</p>;
}

export function NlpPanel() {
  const { config } = useConnection();
  const [text, setText] = useState(
    'Tim Cook announced that Apple will open a new research lab in Copenhagen next spring.',
  );
  const [result, setResult] = useState<NlpAnalyzeResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.nlpAnalyze(config, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sentiment = result?.sentiment ?? null;

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className={`${inputClass} w-full`}
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Text to analyze"
      />
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>Analyze</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {result && (
        <>
          <Card title="Entities">
            <HighlightedText text={text} result={result} />
            <div className="mt-3 flex gap-3 text-[10px] text-ink-3">
              <span><span className="mr-1 inline-block size-2 rounded-sm bg-indigo-a/40" />person</span>
              <span><span className="mr-1 inline-block size-2 rounded-sm bg-cyan-a/30" />place</span>
              <span><span className="mr-1 inline-block size-2 rounded-sm bg-mint/30" />organization</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card title="Language">
              <p className="text-2xl font-bold text-cyan-a">{result.language ?? '?'}</p>
              <ul className="mt-1 text-xs text-ink-3">
                {result.language_hypotheses?.map((hypothesis) => (
                  <li key={hypothesis.language}>
                    {hypothesis.language}: {(hypothesis.confidence * 100).toFixed(0)}%
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Sentiment">
              {sentiment === null ? (
                <p className="text-sm text-ink-3">n/a</p>
              ) : (
                <>
                  <p
                    className={`text-2xl font-bold ${
                      sentiment > 0.05 ? 'text-mint' : sentiment < -0.05 ? 'text-coral' : 'text-ink-2'
                    }`}
                  >
                    {sentiment.toFixed(2)}
                  </p>
                  <p className="text-xs text-ink-3">−1 (negative) … +1 (positive)</p>
                </>
              )}
            </Card>
          </div>

          <button
            type="button"
            className="self-start text-xs text-ink-3 hover:text-cyan-a"
            onClick={() => setShowRaw((value) => !value)}
          >
            {showRaw ? 'Hide' : 'Show'} raw response (lemmas, POS tags…)
          </button>
          {showRaw && <JsonViewer value={result} />}
        </>
      )}
    </div>
  );
}
