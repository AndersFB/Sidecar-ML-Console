import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button, Card, ErrorBanner, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { usePersistentState } from '../utils/usePersistentState';

export function ImageGenPanel() {
  const { config, status } = useConnection();
  const [prompt, setPrompt] = useState('a cozy lighthouse on a cliff at sunset');
  const [styles, setStyles] = useState<string[]>([]);
  const [style, setStyle] = usePersistentState('sidecar.imagegen.style', '');
  const [count, setCount] = usePersistentState('sidecar.imagegen.count', 1);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'online') return;
    api
      .imageStyles(config)
      .then((result) => {
        setStyles(result.styles);
        // Keep a restored style if the phone still offers it; otherwise default.
        setStyle((current) =>
          current && result.styles.includes(current) ? current : (result.styles[0] ?? ''),
        );
      })
      .catch(() => setStyles([]));
  }, [config, status, setStyle]);

  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.imageGenerate(config, prompt, count, style || undefined);
      setImages(response.data.map((item) => `data:image/png;base64,${item.b64_json}`));
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
        rows={2}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        aria-label="Image prompt"
      />
      <div className="flex flex-wrap items-center gap-3">
        {styles.length > 0 && (
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
          >
            {styles.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        )}
        <select
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n} image{n > 1 ? 's' : ''}</option>
          ))}
        </select>
        <Button onClick={() => void run()} disabled={busy || !prompt.trim()}>Generate</Button>
        {busy && <Spinner label="Generating on-device…" />}
      </div>
      {error && <ErrorBanner message={error} />}

      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((url, index) => (
            <Card key={index}>
              <img src={url} alt={`Generated ${index + 1}`} className="w-full rounded-lg" />
              <a href={url} download={`generated-${index + 1}.png`} className="mt-2 inline-block text-xs text-cyan-a">
                Download
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
