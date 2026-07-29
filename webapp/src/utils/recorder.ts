import { encodeWav } from './wavEncoder';
import workletSource from './recorder-worklet.js?raw';

// The worklet is bundled as source text and loaded through a Blob URL instead
// of being fetched from the server, so recording also works when the console
// runs as a single downloaded HTML file with nothing served next to it.
let workletModuleUrl: string | undefined;
function workletUrl(): string {
  workletModuleUrl ??= URL.createObjectURL(
    new Blob([workletSource], { type: 'application/javascript' }),
  );
  return workletModuleUrl;
}

/**
 * Microphone capture → WAV blob, via AudioWorklet (with a ScriptProcessor
 * fallback). Requires a secure context: use http://localhost during dev.
 */
export class MicRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private cleanup: (() => void) | null = null;

  get isRecording(): boolean {
    return this.context !== null;
  }

  async start(): Promise<void> {
    if (this.context) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();
    this.chunks = [];
    const source = this.context.createMediaStreamSource(this.stream);

    try {
      await this.context.audioWorklet.addModule(workletUrl());
      const worklet = new AudioWorkletNode(this.context, 'recorder-processor');
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.chunks.push(event.data);
      };
      source.connect(worklet);
      this.cleanup = () => {
        worklet.port.onmessage = null;
        source.disconnect();
        worklet.disconnect();
      };
    } catch {
      // Older engines: ScriptProcessor fallback.
      const processor = this.context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(this.context.destination);
      this.cleanup = () => {
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
      };
    }
  }

  /**
   * Stops capture and drops the buffered audio without encoding — for
   * teardown paths (unmount, errors) where nobody wants the WAV. Without
   * this, an abandoned recorder keeps the mic live and grows ~11.5 MB/min.
   */
  discard(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.chunks = [];
  }

  async stop(): Promise<Blob> {
    const context = this.context;
    if (!context) throw new Error('Not recording');
    this.cleanup?.();
    this.cleanup = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const sampleRate = context.sampleRate;
    await context.close();
    this.context = null;

    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return encodeWav(merged, sampleRate);
  }
}

/** Milliseconds of audio per emitted chunk. The worklet fires every render
 * quantum (128 frames — under 3 ms), which is far too chatty for one socket
 * frame each; batching to this trades a little latency for a sane frame rate. */
const STREAM_CHUNK_MS = 100;

/**
 * Microphone capture → fixed-size Float32 chunks, for the live voice socket.
 *
 * The buffering counterpart of `MicRecorder`: same worklet, same secure-context
 * requirement, but samples are handed straight to a callback instead of being
 * accumulated for a WAV at the end. Nothing is retained, so a stream can run
 * for as long as the user leaves it open.
 */
export class MicStreamer {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private cleanup: (() => void) | null = null;
  private pending: Float32Array[] = [];
  private pendingLength = 0;
  private chunkSize = 0;

  constructor(private onChunk: (samples: Float32Array) => void) {}

  get isStreaming(): boolean {
    return this.context !== null;
  }

  /** Valid only once `start()` has resolved. */
  get sampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  async start(): Promise<void> {
    if (this.context) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();
    this.chunkSize = Math.round((this.context.sampleRate * STREAM_CHUNK_MS) / 1000);
    this.pending = [];
    this.pendingLength = 0;
    const source = this.context.createMediaStreamSource(this.stream);

    const accept = (samples: Float32Array) => {
      this.pending.push(samples);
      this.pendingLength += samples.length;
      while (this.pendingLength >= this.chunkSize) this.emitChunk();
    };

    try {
      await this.context.audioWorklet.addModule(workletUrl());
      const worklet = new AudioWorkletNode(this.context, 'recorder-processor');
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => accept(event.data);
      source.connect(worklet);
      this.cleanup = () => {
        worklet.port.onmessage = null;
        source.disconnect();
        worklet.disconnect();
      };
    } catch {
      // Older engines: ScriptProcessor fallback.
      const processor = this.context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        accept(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(this.context.destination);
      this.cleanup = () => {
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
      };
    }
  }

  /** Splices exactly `chunkSize` samples out of the pending queue and emits. */
  private emitChunk(): void {
    const chunk = new Float32Array(this.chunkSize);
    let filled = 0;
    while (filled < this.chunkSize) {
      const head = this.pending[0];
      const take = Math.min(head.length, this.chunkSize - filled);
      chunk.set(take === head.length ? head : head.subarray(0, take), filled);
      filled += take;
      if (take === head.length) this.pending.shift();
      else this.pending[0] = head.subarray(take);
    }
    this.pendingLength -= this.chunkSize;
    this.onChunk(chunk);
  }

  stop(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.pending = [];
    this.pendingLength = 0;
  }
}
