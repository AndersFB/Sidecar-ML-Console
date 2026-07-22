import { useRef, useState } from 'react';
import { api } from '../api/client';
import { ImageDropzone, type PickedImage } from '../components/ImageDropzone';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithPoints, drawSkeletons } from '../utils/overlay';
import { usePersistentState } from '../utils/usePersistentState';

export function PosePanel() {
  const { config } = useConnection();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [mode, setMode] = usePersistentState<'body' | 'hand'>('sidecar.pose.mode', 'body');
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = canvasRef.current;
      if (mode === 'body') {
        const response = await api.bodyPose(config, image.file);
        setSummary(`${response.persons.length} person(s) detected`);
        if (canvas) {
          const element = new Image();
          element.onload = () => drawSkeletons(canvas, element, response.persons);
          element.src = image.previewUrl;
        }
      } else {
        const response = await api.handPose(config, image.file);
        setSummary(
          `${response.hands.length} hand(s): ${response.hands
            .map((hand) => hand.chirality ?? 'unknown')
            .join(', ') || '—'}`,
        );
        if (canvas) {
          const element = new Image();
          element.onload = () =>
            drawImageWithPoints(
              canvas,
              element,
              response.hands.map((hand) => Object.values(hand.joints)),
            );
          element.src = image.previewUrl;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ImageDropzone onPick={(picked) => { setImage(picked); setSummary(null); }} />
      <div className="flex items-center gap-3">
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as 'body' | 'hand')}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          <option value="body">Body skeleton</option>
          <option value="hand">Hand joints</option>
        </select>
        <Button onClick={() => void run()} disabled={!image || busy}>Detect pose</Button>
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {summary && (
        <Card title={summary}>
          <canvas ref={canvasRef} className="w-full rounded-lg" />
        </Card>
      )}
    </div>
  );
}
