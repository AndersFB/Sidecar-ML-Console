import { useEffect, useState } from 'react';
import { api, audioEnvelopeToBlob } from '../api/client';
import {
  DEFAULT_VOICE_PARAMETERS,
  VOICE_LIMITS,
  type Voice,
  type VoiceMatchResponse,
  type VoiceParameters,
  type VoicePreset,
  type VoiceProfile,
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

type Mode = 'transform' | 'live' | 'match' | 'respeak';

const MODES: { id: Mode; label: string }[] = [
  { id: 'transform', label: 'Transform' },
  { id: 'live', label: 'Live' },
  { id: 'match', label: 'Match a voice' },
  { id: 'respeak', label: 'Re-speak' },
];

function ProfileCard({ title, profile }: { title: string; profile: VoiceProfile }) {
  const hz = (value: number | null | undefined) => (value == null ? '–' : `${value.toFixed(1)} Hz`);
  return (
    <Card title={title}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-ink-2">
        <dt>median F0</dt>
        <dd className="text-cyan-a">{hz(profile.median_f0_hz)}</dd>
        <dt>range</dt>
        <dd>{hz(profile.f0_low_hz)} – {hz(profile.f0_high_hz)}</dd>
        <dt>centroid</dt>
        <dd>{hz(profile.spectral_centroid_hz)}</dd>
        <dt>voiced</dt>
        <dd>{(profile.voiced_ratio * 100).toFixed(1)}%</dd>
        <dt>duration</dt>
        <dd>{profile.duration_s.toFixed(2)}s</dd>
      </dl>
      {profile.voiced_ratio < 0.1 && (
        <p className="mt-2 text-xs text-amber-a">
          Barely any voiced speech in this clip — the pitch estimate is not
          trustworthy.
        </p>
      )}
    </Card>
  );
}

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

  const [matchSource, setMatchSource] = useStoredState<Blob | null>('sidecar.voicefx.matchA', null);
  const [matchTarget, setMatchTarget] = useStoredState<Blob | null>('sidecar.voicefx.matchB', null);
  const [match, setMatch] = useStoredState<VoiceMatchResponse | null>(
    'sidecar.voicefx.match',
    null,
  );
  const [matchUrl, setMatchUrl] = useStoredMediaUrl('sidecar.voicefx.matchAudio');

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

  const runMatch = async (alsoRender: boolean) => {
    if (!matchSource || !matchTarget) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.voiceMatch(config, matchSource, matchTarget, alsoRender);
      setMatch(result);
      setMatchUrl(result.audio ? audioEnvelopeToBlob(result.audio) : null);
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

      {mode !== 'match' && (
        <>
          <PresetChips presets={presets} selected={presetId} onSelect={applyPreset} />
          {sliders}
        </>
      )}

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

      {mode === 'match' && (
        <>
          <p className="text-sm text-ink-2">
            Profiles both clips and derives the settings that move the first
            voice toward the second's register and brightness. This matches
            pitch and timbre — it is <strong>not</strong> voice cloning, and no
            new identity is synthesized.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-ink-2">Your voice (source)</p>
              <AudioInput key={`a${inputKey}`} onAudio={(blob) => { setMatchSource(blob); setMatch(null); }} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-ink-2">Reference voice (target)</p>
              <AudioInput key={`b${inputKey}`} onAudio={(blob) => { setMatchTarget(blob); setMatch(null); }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runMatch(false)} disabled={!matchSource || !matchTarget || busy}>
              Analyze
            </Button>
            <Button
              variant="ghost"
              onClick={() => void runMatch(true)}
              disabled={!matchSource || !matchTarget || busy}
            >
              Analyze + render
            </Button>
            {busy && <Spinner label="Analyzing on-device…" />}
          </div>
          {match && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <ProfileCard title="Source" profile={match.source} />
                <ProfileCard title="Target" profile={match.target} />
              </div>
              <Card
                title="Derived settings"
                actions={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setParameters(match.parameters);
                      setPresetId(null);
                      setMode('transform');
                    }}
                  >
                    Use these settings
                  </Button>
                }
              >
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-ink-2 sm:grid-cols-4">
                  <dt>pitch</dt>
                  <dd className="text-cyan-a">{match.parameters.pitch_cents.toFixed(0)} cents</dd>
                  <dt>brightness</dt>
                  <dd className="text-cyan-a">{match.parameters.brightness.toFixed(2)}</dd>
                </dl>
                {matchUrl && (
                  <div className="mt-3">
                    <audio src={matchUrl} controls className="w-full" />
                  </div>
                )}
              </Card>
            </>
          )}
        </>
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
