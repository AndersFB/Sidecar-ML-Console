import { useEffect, useState } from 'react';
import { api, envelopeToBlob } from '../api/client';
import {
  DEFAULT_FACE_PARAMETERS,
  FACE_LIMITS,
  type FaceParameters,
  type FacePreset,
  type FaceTransformResponse,
} from '../api/types';
import { BeforeAfter } from '../components/BeforeAfter';
import { ControlGroup, ModeTabs, ParameterSlider, PresetChips } from '../components/EffectControls';
import { ImageDropzone, revivePickedImage, type PickedImage } from '../components/ImageDropzone';
import { FaceBroadcastView, LiveFaceView } from '../components/LiveFaceView';
import { Button, Card, ErrorBanner, Field, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { useStoredMediaUrl } from '../utils/useStoredMedia';
import { usePersistentState } from '../utils/usePersistentState';
import { useStoredState } from '../utils/useStoredState';

type Mode = 'transform' | 'live';

const MODES: { id: Mode; label: string }[] = [
  { id: 'transform', label: 'Transform' },
  { id: 'live', label: 'Live' },
];

export function FaceFxPanel() {
  const { config, connectedConfig, status } = useConnection();
  const [mode, setMode] = usePersistentState<Mode>('sidecar.facefx.mode', 'transform');
  const [parameters, setParameters] = usePersistentState<FaceParameters>(
    'sidecar.facefx.parameters',
    DEFAULT_FACE_PARAMETERS,
  );
  const [presets, setPresets] = useState<FacePreset[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [presetId, setPresetId] = usePersistentState<string | null>('sidecar.facefx.preset', null);

  const [image, setImage] = useStoredState<PickedImage | null>(
    'sidecar.facefx.image',
    null,
    revivePickedImage,
  );
  const [result, setResult] = useStoredState<FaceTransformResponse | null>(
    'sidecar.facefx.result',
    null,
  );
  const [resultUrl, setResultUrl] = useStoredMediaUrl('sidecar.facefx.resultImage');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (status !== 'online' || !connectedConfig) return;
    let cancelled = false;
    api
      .facePresets(connectedConfig)
      .then((response) => {
        if (cancelled) return;
        setPresets(response.presets);
        setStyles(response.styles);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connectedConfig, status]);

  const set = <K extends keyof FaceParameters>(key: K, value: FaceParameters[K]) => {
    setParameters((current) => ({ ...current, [key]: value }));
    setPresetId(null);
  };

  const applyPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setParameters(preset.parameters);
    setPresetId(id);
  };

  const clear = () => {
    setImage(null);
    setResult(null);
    setResultUrl(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  const runTransform = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.faceTransform(config, image.file, parameters);
      setResult(response);
      setResultUrl(envelopeToBlob(response.result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const faceSliders = (
    <>
      <ControlGroup title="Shape">
        <ParameterSlider label="Eye size" value={parameters.eye_size} limits={FACE_LIMITS.signed} onChange={(v) => set('eye_size', v)} />
        <ParameterSlider label="Nose width" value={parameters.nose_width} limits={FACE_LIMITS.signed} onChange={(v) => set('nose_width', v)} />
        <ParameterSlider label="Mouth size" value={parameters.mouth_size} limits={FACE_LIMITS.signed} onChange={(v) => set('mouth_size', v)} />
        <ParameterSlider label="Chin length" value={parameters.chin_length} limits={FACE_LIMITS.signed} onChange={(v) => set('chin_length', v)} />
        <ParameterSlider label="Face width" value={parameters.face_width} limits={FACE_LIMITS.signed} onChange={(v) => set('face_width', v)} />
        <ParameterSlider label="Swirl" value={parameters.swirl} limits={FACE_LIMITS.signed} onChange={(v) => set('swirl', v)} />
      </ControlGroup>
      <ControlGroup title="Skin & colour">
        <ParameterSlider label="Smoothing" value={parameters.smoothing} limits={FACE_LIMITS.unit} onChange={(v) => set('smoothing', v)} />
        <ParameterSlider label="Warmth" value={parameters.warmth} limits={FACE_LIMITS.signed} onChange={(v) => set('warmth', v)} />
        <ParameterSlider label="Brightness" value={parameters.brightness} limits={FACE_LIMITS.signed} onChange={(v) => set('brightness', v)} />
        <ParameterSlider label="Saturation" value={parameters.saturation} limits={FACE_LIMITS.signed} onChange={(v) => set('saturation', v)} />
      </ControlGroup>
      <ControlGroup title="Style & mask">
        <Field label="Style">
          <select
            className={inputClass}
            value={parameters.style ?? 'none'}
            onChange={(event) => set('style', event.target.value)}
          >
            {(styles.length > 0 ? styles : ['none']).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </Field>
        <ParameterSlider
          label="Style amount"
          value={parameters.style_amount}
          limits={FACE_LIMITS.unit}
          onChange={(v) => set('style_amount', v)}
          resetTo={1}
        />
        <ParameterSlider label="Mask feather" value={parameters.mask_feather} limits={FACE_LIMITS.unit} onChange={(v) => set('mask_feather', v)} resetTo={0.5} />
        <ParameterSlider label="Mask expand" value={parameters.mask_expand} limits={FACE_LIMITS.mask_expand} onChange={(v) => set('mask_expand', v)} resetTo={0.08} />
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={parameters.mask_to_face}
            onChange={(event) => set('mask_to_face', event.target.checked)}
            className="accent-cyan-a"
          />
          Mask to face (leave the background untouched)
        </label>
      </ControlGroup>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <ModeTabs modes={MODES} active={mode} onSelect={setMode} />

      <PresetChips presets={presets} selected={presetId} onSelect={applyPreset} />
      {faceSliders}

      {mode === 'transform' && (
        <>
          <ImageDropzone
            key={inputKey}
            preview={image?.previewUrl ?? null}
            onPick={(picked) => {
              setImage(picked);
              setResult(null);
              setResultUrl(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runTransform()} disabled={!image || busy}>
              Transform
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy || (!image && !result)}>
              Clear
            </Button>
            {busy && <Spinner label="Transforming on-device…" />}
          </div>
          {result && resultUrl && image && (
            <Card
              title={
                result.faces === 0
                  ? 'No face found — returned unchanged'
                  : `${result.faces} face(s)`
              }
            >
              <BeforeAfter before={image.previewUrl} after={resultUrl} />
              <a href={resultUrl} download="face.png" className="mt-2 inline-block text-xs text-cyan-a">
                Download PNG
              </a>
            </Card>
          )}
        </>
      )}

      {mode === 'live' && (
        <LiveFaceSection parameters={parameters} presetId={presetId} onError={setError} />
      )}

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

/** Direction picker for live mode: send our camera, or watch the phone's. */
function LiveFaceSection({
  parameters,
  presetId,
  onError,
}: {
  parameters: FaceParameters;
  presetId: string | null;
  onError: (message: string | null) => void;
}) {
  const [direction, setDirection] = useState<'send' | 'watch'>('send');
  const [running, setRunning] = useState(false);

  const stop = () => {
    setRunning(false);
    onError(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ModeTabs
        modes={[
          { id: 'send' as const, label: 'Send my camera' },
          { id: 'watch' as const, label: "Watch the phone" },
        ]}
        active={direction}
        onSelect={(next) => {
          setRunning(false);
          onError(null);
          setDirection(next);
        }}
      />

      {running ? (
        <>
          {direction === 'send' ? (
            <LiveFaceView
              parameters={parameters}
              onError={(message) => {
                onError(message);
                setRunning(false);
              }}
              onClose={stop}
            />
          ) : (
            <FaceBroadcastView preset={presetId ?? undefined} />
          )}
          <div>
            <Button variant="danger" onClick={stop}>■ Stop</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { onError(null); setRunning(true); }}>
            {direction === 'send' ? '● Start live camera' : '▶ Watch'}
          </Button>
          <p className="text-xs text-ink-3">
            {direction === 'send'
              ? 'Streams your webcam to the phone and shows the transformed frames.'
              : "Shows the phone's own camera, transformed on-device."}
          </p>
        </div>
      )}
    </div>
  );
}
