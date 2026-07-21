import { describe, expect, it } from 'vitest';
import { encodeWav, encodeWavBytes } from '../utils/wavEncoder';

describe('encodeWav', () => {
  it('writes a correct RIFF header (golden bytes)', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const buffer = encodeWavBytes(samples, 16000);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    expect(bytes.length).toBe(44 + 8);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);

    // Sample values: 0, ~16384, ~-16384, 32767
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBeCloseTo(16384, -1);
    expect(view.getInt16(48, true)).toBeCloseTo(-16384, -1);
    expect(view.getInt16(50, true)).toBe(32767);
  });

  it('clamps out-of-range samples', () => {
    const view = new DataView(encodeWavBytes(new Float32Array([2, -2]), 8000));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });

  it('wraps the bytes in an audio/wav blob', () => {
    const blob = encodeWav(new Float32Array([0]), 8000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(46);
  });
});
