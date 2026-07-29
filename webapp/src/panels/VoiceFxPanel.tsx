import { useEffect, useState } from 'react';
import { api, audioEnvelopeToBlob } from '../api/client';
import {
  DEFAULT_VOICE_PARAMETERS,
  VOICE_LIMITS,
  type Voice,
  type VoiceParameters,
  type VoicePreset,
  type VoiceRespeakResponse,
} from '../api/types';
import { AudioInput } from '../components/AudioInput';
import { ControlGroup, ModeTabs, ParameterSlider, PresetChips } from '../components/EffectControls';
import { LiveVoiceView, VoiceBroadcastView } from '../components/LiveVoiceView';
import { Button, Card, ErrorBanner, Field, Spinner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { usePersistentState } from '../utils/usePersistentState';
import { useStoredMediaUrl } from '../utils/useStoredMedia';
import { useStoredState } from '../utils/useStoredState';

type Mode = 'transform' | 'live' | 'respeak';

const MODES: { id: Mode; label: string }[] = [
  { id: 'transform', label: 'Transform' },
  { id: 'live', label: 'Live' },
  { id: 'respeak', label: 'Re-speak' },
];

export function VoiceFxPanel() {
  const { config, connectedConfig, status } = useConnection();
  const [mode, setMode] = usePersistentState<Mode>('sidecar.voicefx.mode', 'transform');
  const [parameters, setParameters] = usePersistentState<VoiceParameters>(
    'sidecar.voicefx.parameters',
    DEFAULT_VOICE_PARAMETERS,
  );
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [distortionPresets, setDistortionPresets] = useState<string[]>([]);
  const [reverbPresets, setReverbPresets] = useState<string[]>([]);
  const [presetId, setPresetId] = usePersistentState<string | null>(
    'sidecar.voicefx.preset',
    null,
  );

  const [audio, setAudio] = useStoredState<Blob | null>('sidecar.voicefx.audio', null);
  const [resultUrl, setResultUrl] = useStoredMediaUrl('sidecar.voicefx.result');
  const [sourceUrl, setSourceUrl] = useStoredMediaUrl('sidecar.voicefx.source');

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = usePersistentState('sidecar.voicefx.voice', '');
  const [locale, setLocale] = usePersistentState('sidecar.voicefx.locale', '');
  const [respeak, setRespeak] = useStoredState<VoiceRespeakResponse | null>(
    'sidecar.voicefx.respeak',
    null,
  );
  const [respeakUrl, setRespeakUrl] = useStoredMediaUrl('sidecar.voicefx.respeakAudio');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  // Preset and voice tables come from the phone so the console can never offer
  // a name the server would reject.
  useEffect(() => {
    if (status !== 'online' || !connectedConfig) return;
    let cancelled = false;
    api
      .voicePresets(connectedConfig)
      .then((result) => {
        if (cancelled) return;
        setPresets(result.presets);
        setDistortionPresets(result.distortion_presets);
        setReverbPresets(result.reverb_presets);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    api
      .voices(connectedConfig)
      .then((result) => {
        if (!cancelled) setVoices(result.voices);
      })
      .catch(() => {
        if (!cancelled) setVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connectedConfig, status]);

  const set = <K extends keyof VoiceParameters>(key: K, value: VoiceParameters[K]) => {
    setParameters((current) => ({ ...current, [key]: value }));
    // Any manual edit means the result is no longer exactly the named preset.
    setPresetId(null);
  };

  const applyPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    // A preset replaces the whole object, matching the server's
    // preset-then-explicit precedence.
    setParameters(preset.parameters);
    setPresetId(id);
  };

  const clear = () => {
    setAudio(null);
    setResultUrl(null);
    setSourceUrl(null);
    setError(null);
    setInputKey((key) => key + 1);
  };

  const runTransform = async () => {
    if (!audio) return;
    setBusy(true);
    setError(null);
    try {
      const envelope = await api.voiceTransform(config, audio, parameters);
      setResultUrl(audioEnvelopeToBlob(envelope));
      setSourceUrl(audio);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runRespeak = async () => {
    if (!audio) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.voiceRespeak(
        config,
        audio,
        voice || undefined,
        locale || undefined,
        parameters,
      );
      setRespeak(result);
      setRespeakUrl(audioEnvelopeToBlob(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sliders = (
    <>
      <ControlGroup title="Voice">
        <ParameterSlider
          label="Pitch"
          value={parameters.pitch_cents}
          limits={VOICE_LIMITS.pitch_cents}
          onChange={(value) => set('pitch_cents', value)}
          format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} cents`}
          hint="±1200 is an octave."
        />
        <ParameterSlider
          label="Rate"
          value={parameters.rate}
          limits={VOICE_LIMITS.rate}
          onChange={(value) => set('rate', value)}
          resetTo={1}
          format={(value) => `${value.toFixed(2)}×`}
          hint="Also changes the output duration."
        />
        <ParameterSlider
          label="Brightness"
          value={parameters.brightness}
          limits={VOICE_LIMITS.brightness}
          onChange={(value) => set('brightness', value)}
          hint="Negative darkens (chesty), positive brightens (nasal)."
        />
        <ParameterSlider
          label="Throat"
          value={parameters.throat}
          limits={VOICE_LIMITS.throat}
          onChange={(value) => set('throat', value)}
          hint="Mid-band emphasis — thickens or hollows out."
        />
        <ParameterSlider
          label="Gain"
          value={parameters.gain_db}
          limits={VOICE_LIMITS.gain_db}
          onChange={(value) => set('gain_db', value)}
          format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
        />
      </ControlGroup>
      <ControlGroup title="Character">
        <ParameterSlider
          label="Distortion"
          value={parameters.distortion}
          limits={VOICE_LIMITS.distortion}
          onChange={(value) => set('distortion', value)}
        />
        <Field label="Distortion preset">
          <select
            className={inputClass}
            value={parameters.distortion_preset ?? ''}
            onChange={(event) => set('distortion_preset', event.target.value || null)}
          >
            <option value="">None</option>
            {distortionPresets.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </Field>
        <ParameterSlider
          label="Reverb"
          value={parameters.reverb}
          limits={VOICE_LIMITS.reverb}
          onChange={(value) => set('reverb', value)}
        />
        <Field label="Reverb preset">
          <select
            className={inputClass}
            value={parameters.reverb_preset ?? ''}
            onChange={(event) => set('reverb_preset', event.target.value || null)}
          >
            <option value="">None</option>
            {reverbPresets.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </Field>
      </ControlGroup>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <ModeTabs modes={MODES} active={mode} onSelect={setMode} />

      <PresetChips presets={presets} selected={presetId} onSelect={applyPreset} />
      {sliders}

      {mode === 'transform' && (
        <>
          <AudioInput
            key={inputKey}
            onAudio={(blob) => {
              setAudio(blob);
              setResultUrl(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runTransform()} disabled={!audio || busy}>
              Transform
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy || (!audio && !resultUrl)}>
              Clear
            </Button>
            {busy && <Spinner label="Transforming on-device…" />}
          </div>
          {resultUrl && (
            <Card title="Result">
              <audio src={resultUrl} controls className="w-full" data-testid="voicefx-result" />
              <a href={resultUrl} download="voice.wav" className="mt-2 inline-block text-xs text-cyan-a">
                Download WAV
              </a>
              {sourceUrl && (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-ink-3">Original</p>
                  <audio src={sourceUrl} controls className="w-full" />
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {mode === 'live' && (
        <LiveVoiceSection parameters={parameters} presetId={presetId} onError={setError} />
      )}

      {mode === 'respeak' && (
        <>
          <p className="text-sm text-ink-2">
            Transcribes the clip and speaks it back through a system voice — a
            genuinely different speaker, at the cost of the original prosody.
          </p>
          <AudioInput key={`r${inputKey}`} onAudio={(blob) => { setAudio(blob); setRespeak(null); }} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Voice">
              <select
                className={inputClass}
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
              >
                <option value="">Default</option>
                {voices.map((item) => (
                  <option key={item.identifier} value={item.identifier}>
                    {item.name} ({item.language})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locale">
              <input
                className={`${inputClass} w-28`}
                value={locale}
                placeholder="auto"
                onChange={(event) => setLocale(event.target.value)}
              />
            </Field>
            <Button onClick={() => void runRespeak()} disabled={!audio || busy}>
              Re-speak
            </Button>
            {busy && <Spinner label="Transcribing and speaking…" />}
          </div>
          {respeak && (
            <Card title="Re-spoken">
              <p className="mb-2 text-sm leading-relaxed">{respeak.text}</p>
              {respeakUrl && (
                <>
                  <audio src={respeakUrl} controls className="w-full" />
                  <a
                    href={respeakUrl}
                    download="respeak.wav"
                    className="mt-2 inline-block text-xs text-cyan-a"
                  >
                    Download WAV
                  </a>
                </>
              )}
            </Card>
          )}
        </>
      )}

      {error && <ErrorBanner message={error} />}
    </div>
  );
}

/** Direction picker for live mode: send our mic, or listen to the phone's. */
function LiveVoiceSection({
  parameters,
  presetId,
  onError,
}: {
  parameters: VoiceParameters;
  presetId: string | null;
  onError: (message: string | null) => void;
}) {
  const [direction, setDirection] = useState<'send' | 'listen'>('send');
  const [running, setRunning] = useState(false);

  const stop = () => {
    setRunning(false);
    onError(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ModeTabs
        modes={[
          { id: 'send' as const, label: 'Send my microphone' },
          { id: 'listen' as const, label: "Listen to the phone" },
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
            <LiveVoiceView
              parameters={parameters}
              onError={(message) => {
                onError(message);
                setRunning(false);
              }}
              onClose={stop}
            />
          ) : (
            <VoiceBroadcastView preset={presetId ?? undefined} />
          )}
          <div>
            <Button variant="danger" onClick={stop}>■ Stop</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { onError(null); setRunning(true); }}>
            {direction === 'send' ? '● Start live voice' : '▶ Listen'}
          </Button>
          <p className="text-xs text-ink-3">
            {direction === 'send'
              ? 'Streams your microphone to the phone and plays the transformed voice back. Use headphones.'
              : "Plays the phone's own microphone, transformed on-device."}
          </p>
        </div>
      )}
    </div>
  );
}
