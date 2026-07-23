import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { BodyPoseResponse, HandPoseResponse } from '../api/types';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { Icon } from '../components/Icon';
import { LiveCameraView } from '../components/LiveCameraView';
import { Button, Card, ErrorBanner, Spinner } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { drawImageWithPoints, drawSkeletons } from '../utils/overlay';
import { usePersistentState } from '../utils/usePersistentState';
import { useStoredState } from '../utils/useStoredState';

type PoseResult =
  | { kind: 'body'; response: BodyPoseResponse }
  | { kind: 'hand'; response: HandPoseResponse };

export function PosePanel() {
  const { config } = useConnection();
  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.pose.image',
    null,
    revivePickedImage,
  );
  const [mode, setMode] = usePersistentState<'body' | 'hand'>('sidecar.pose.mode', 'body');
  const [result, setResult] = useStoredState<PoseResult | null>('sidecar.pose.result', null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const clear = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  const toggleLive = () => {
    setError(null);
    setLive((value) => !value);
  };

  // The canvas only mounts once `result` renders, so drawing must happen here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result || !image) return;
    const element = new Image();
    element.onload = () => {
      if (result.kind === 'body') {
        drawSkeletons(canvas, element, result.response.persons);
      } else {
        drawImageWithPoints(
          canvas,
          element,
          result.response.hands.map((hand) => Object.values(hand.joints)),
        );
      }
    };
    element.src = image.previewUrl;
    return () => {
      element.onload = null;
    };
  }, [result, image, live]);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'body') {
        setResult({ kind: 'body', response: await api.bodyPose(config, image.file) });
      } else {
        setResult({ kind: 'hand', response: await api.handPose(config, image.file) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const summary =
    result === null
      ? null
      : result.kind === 'body'
        ? `${result.response.persons.length} person(s) detected`
        : `${result.response.hands.length} hand(s): ${result.response.hands
            .map((hand) => hand.chirality ?? 'unknown')
            .join(', ') || '—'}`;

  return (
    <div className="flex flex-col gap-3">
      {live ? (
        <LiveCameraView
          mode={mode === 'body' ? 'body' : 'hands'}
          onClose={() => setLive(false)}
          onError={(message) => {
            setError(message);
            setLive(false);
          }}
        />
      ) : (
        <ImageDropzone
          key={inputKey}
          preview={image?.previewUrl ?? null}
          onPick={(picked) => { setImage(picked); setResult(null); }}
        />
      )}
      <div className="flex items-center gap-3">
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as 'body' | 'hand')}
          className="rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm"
        >
          <option value="body">Body skeleton</option>
          <option value="hand">Hand joints</option>
        </select>
        {!live && (
          <Button onClick={() => void run()} disabled={!image || busy}>Detect pose</Button>
        )}
        <Button variant={live ? 'danger' : 'ghost'} onClick={toggleLive} disabled={busy}>
          {live ? (
            '■ Stop live camera'
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="video" size={15} /> Live camera
            </span>
          )}
        </Button>
        {!live && (
          <Button variant="ghost" onClick={clear} disabled={busy || (!image && !result && !error)}>
            Clear
          </Button>
        )}
        {busy && <Spinner />}
      </div>
      {error && <ErrorBanner message={error} />}

      {!live && summary && (
        <Card title={summary}>
          <canvas ref={canvasRef} className="w-full rounded-lg" />
        </Card>
      )}
    </div>
  );
}
