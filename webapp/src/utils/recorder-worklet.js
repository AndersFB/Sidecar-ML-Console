// AudioWorklet that forwards raw Float32 PCM frames to the main thread.
// The main thread accumulates them and encodes a 16-bit WAV (the ML Sidecar
// server can't decode browser-native webm/opus recordings).
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy: the engine reuses the buffer between calls.
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
