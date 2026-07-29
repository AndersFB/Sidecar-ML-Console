/**
 * Minimal 16-bit PCM WAV helpers.
 *
 * The phone cannot decode WebM/Opus or Ogg, so every audio fixture in this
 * suite is WAV. These helpers exist for the fallback tone and for resampling
 * the phone's own TTS output to 48 kHz, which is what Chromium's
 * --use-file-for-fake-audio-capture expects.
 */

export function encodeWav(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

/** Parses a mono/stereo 16-bit PCM WAV into { sampleRate, samples } (mono, -1..1). */
export function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let offset = 12;
  let sampleRate = 22050;
  let channels = 1;
  let bitsPerSample = 16;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bitsPerSample !== 16) throw new Error(`unsupported bit depth ${bitsPerSample}`);
      const frames = Math.floor(size / 2 / channels);
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        // Downmix to mono by taking the first channel.
        samples[i] = buffer.readInt16LE(body + i * 2 * channels) / 32768;
      }
      return { sampleRate, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('no data chunk');
}

/** Linear resample — good enough for a fake microphone source. */
export function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = to / from;
  const out = new Float32Array(Math.floor(samples.length * ratio));
  for (let i = 0; i < out.length; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const frac = position - index;
    const a = samples[index] ?? 0;
    const b = samples[index + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** A two-tone chirp, used only when the phone's TTS is unavailable. */
export function toneWav(seconds = 3, sampleRate = 22050) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const frequency = 440 + 220 * Math.sin(t * 1.5);
    samples[i] = 0.4 * Math.sin(2 * Math.PI * frequency * t);
  }
  return encodeWav(samples, sampleRate);
}
