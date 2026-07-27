/**
 * Raw 16-bit little-endian PCM framing for the live voice socket.
 *
 * The wire format carries samples only — no WAV header per chunk, because the
 * sample rate is negotiated once by the `format` control message. This is the
 * browser counterpart of the server's `PCMChunkCodec`; `wavEncoder.ts` still
 * owns whole-file RIFF/WAVE for the one-shot endpoints.
 */

/** Float samples → interleaved PCM16 LE. */
export function floatToPcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(clamped * 32767), true);
  }
  return buffer;
}

/** Interleaved PCM16 LE → float samples. */
export function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  // An odd trailing byte would over-read the last sample; drop it.
  const count = Math.floor(buffer.byteLength / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

/**
 * Gapless playback of PCM chunks arriving from the network.
 *
 * Each chunk becomes an `AudioBufferSourceNode` scheduled to start exactly
 * where the previous one ended, so jitter in arrival times doesn't become
 * audible gaps. When the clock has already passed the next start time — the
 * network fell behind — playback restarts a short lead ahead rather than
 * scheduling in the past, which browsers silently play immediately and
 * overlapping.
 */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();

  /** Seconds of slack when (re)anchoring the schedule. */
  private static readonly LEAD_S = 0.08;

  constructor(private sampleRate: number) {}

  /** Playback context, created on first push so no context exists until needed. */
  private ensureContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  push(samples: Float32Array): void {
    if (samples.length === 0) return;
    const context = this.ensureContext();
    void context.resume();

    const buffer = context.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const earliest = context.currentTime + PcmPlayer.LEAD_S;
    const startAt = Math.max(this.nextStart, earliest);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;

    // Without this the set grows for the lifetime of the stream.
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
  }

  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already ended — stop() on a finished node throws.
      }
      source.disconnect();
    }
    this.sources.clear();
    this.nextStart = 0;
    void this.context?.close();
    this.context = null;
  }
}
