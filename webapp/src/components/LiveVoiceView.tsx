import { useEffect, useRef, useState } from 'react';
import { LiveSocket, liveSocketUrl, streamUrl } from '../api/liveStream';
import type { VoiceParameters } from '../api/types';
import { useConnection } from '../state/ConnectionContext';
import { floatToPcm16, pcm16ToFloat, PcmPlayer } from '../utils/pcm';
import { MicStreamer } from '../utils/recorder';
import { useCloseWhenHidden } from '../utils/useCloseWhenHidden';

/**
 * Streams the microphone to `GET /v1/voice/stream` and plays the transformed
 * audio back as it returns.
 *
 * Unlike the live camera — which posts one-shot frames and keeps a single
 * request in flight — this is a persistent WebSocket, so the effect retunes
 * mid-stream: changing a slider sends a control frame and the very next chunk
 * comes back with the new settings, with no gap in the audio.
 */
export function LiveVoiceView({
  parameters,
  onError,
  onClose,
}: {
  parameters: VoiceParameters;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { config } = useConnection();
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<LiveSocket | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const micRef = useRef<MicStreamer | null>(null);
  const readyRef = useRef(false);
  const monitorRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [monitor, setMonitor] = useState(true);
  const [sent, setSent] = useState(0);
  const [received, setReceived] = useState(0);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useCloseWhenHidden(containerRef, onClose);

  // Mute has to reach the socket callback without restarting the stream.
  useEffect(() => {
    monitorRef.current = monitor;
    if (!monitor) playerRef.current?.stop();
  }, [monitor]);

  // One effect owns the whole session: mic → socket → speaker. It deliberately
  // does not depend on `parameters` — retuning is a control frame, not a
  // reconnect (see the separate effect below).
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const mic = new MicStreamer((samples) => {
        if (!readyRef.current) return; // Slot not claimed yet; drop.
        socketRef.current?.sendMedia(floatToPcm16(samples));
        setSent((count) => count + 1);
      });

      try {
        await mic.start();
      } catch (error) {
        if (disposed) return;
        onErrorRef.current(
          error instanceof Error
            ? `Microphone unavailable: ${error.message} (mic capture needs http://localhost)`
            : 'Microphone unavailable',
        );
        return;
      }
      if (disposed) {
        mic.stop();
        return;
      }
      micRef.current = mic;

      const sampleRate = mic.sampleRate;
      const player = new PcmPlayer(sampleRate);
      playerRef.current = player;

      socketRef.current = new LiveSocket(liveSocketUrl(config, '/v1/voice/stream'), {
        onReady: () => {
          // The rate must be agreed before the first audio frame — a socket
          // handler never sees the HTTP request, so it cannot be a query
          // parameter. Without this the phone assumes 44100 and every voice
          // comes back at the wrong pitch.
          socketRef.current?.send({ type: 'format', sample_rate: sampleRate });
          socketRef.current?.send({ type: 'parameters', parameters });
          readyRef.current = true;
          setReady(true);
        },
        onMedia: (data) => {
          setReceived((count) => count + 1);
          if (monitorRef.current) player.push(pcm16ToFloat(data));
        },
        onError: (message) => {
          onErrorRef.current(message);
        },
        onClose: () => {
          readyRef.current = false;
          setReady(false);
        },
      });
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      micRef.current?.stop();
      micRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [config]);

  // Retune in place. This is the whole point of a socket over a POST.
  useEffect(() => {
    if (ready) socketRef.current?.send({ type: 'parameters', parameters });
  }, [parameters, ready]);

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div className="rounded-xl border border-amber-a/30 bg-amber-a/10 px-4 py-3 text-sm text-amber-a">
        <strong>Use headphones.</strong> Monitoring through speakers feeds the
        transformed voice straight back into the microphone and howls.
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-navy/60 px-4 py-3">
        <span
          data-testid="live-voice-status"
          className="font-mono text-xs text-cyan-a"
        >
          {ready ? `● live · ${sent} sent · ${received} back` : 'Connecting to the phone…'}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={monitor}
            onChange={(event) => setMonitor(event.target.checked)}
            className="accent-cyan-a"
          />
          Monitor
        </label>
      </div>
      <p className="text-xs text-ink-3">
        Audio streams to the phone in 100 ms chunks and is transformed on-device;
        nothing is recorded. Moving a slider retunes the effect without
        interrupting the stream. Only one voice stream runs at a time.
      </p>
    </div>
  );
}

/**
 * The opposite direction: the phone's *own* microphone, already transformed,
 * as a streaming WAV. Plays in a bare `<audio>` — no client library involved.
 */
export function VoiceBroadcastView({ preset }: { preset?: string }) {
  const { config } = useConnection();
  const src = streamUrl(config, '/v1/voice/broadcast', { preset });
  return (
    <div className="flex flex-col gap-2">
      <audio src={src} controls autoPlay className="w-full" data-testid="voice-broadcast" />
      <p className="text-xs text-ink-3">
        The phone's own microphone, transformed on-device and streamed as WAV.
        Answers 503 when the app isn't supplying capture.
      </p>
    </div>
  );
}
