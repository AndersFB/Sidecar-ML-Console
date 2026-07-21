import { encodeWav } from './wavEncoder';

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
      await this.context.audioWorklet.addModule('/recorder-worklet.js');
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
