import { useEffect, useState } from 'react';
import { api, audioEnvelopeToDataUrl } from '../api/client';
import type { Voice } from '../api/types';
import { Button, Card, ErrorBanner, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';

export function SpeakPanel() {
  const { config, status } = useConnection();
  const [text, setText] = useState('Hello! I am your iPhone, speaking over the local network.');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(0.5);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online') return;
    api
      .voices(config)
      .then((result) => setVoices(result.voices))
      .catch(() => setVoices([]));
  }, [config, status]);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const envelope = await api.speak(config, text, voice || undefined, rate);
      setAudioUrl(audioEnvelopeToDataUrl(envelope));
      setDuration(envelope.duration_s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className={`${inputClass} w-full`}
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Text to speak"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={voice}
          onChange={(event) => setVoice(event.target.value)}
          className="max-w-64 rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
          aria-label="Voice"
        >
          <option value="">Default voice (en-US)</option>
          {voices.map((item) => (
            <option key={item.identifier} value={item.identifier}>
              {item.name} · {item.language} ({item.quality}
              {item.is_personal ? ', personal' : ''})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          Rate
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.05}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
          />
        </label>
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>Synthesize</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {audioUrl && (
        <Card title={duration ? `Generated ${duration.toFixed(1)}s of audio` : 'Audio'}>
          <audio controls src={audioUrl} className="w-full" />
          <a href={audioUrl} download="speech.wav" className="mt-2 inline-block text-xs text-cyan-a">
            Download WAV
          </a>
        </Card>
      )}
    </div>
  );
}
