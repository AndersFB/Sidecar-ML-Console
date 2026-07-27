import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LiveSocket, liveSocketUrl, streamUrl } from '../api/liveStream';
import { floatToPcm16, pcm16ToFloat } from '../utils/pcm';

const CONFIG = { baseUrl: 'http://phone.test:8080' };
const AUTHED = { baseUrl: 'http://phone.test:8080', token: 'sekrit' };

/**
 * The streaming routes are the only place the console sends a token as a query
 * parameter, so both halves of that decision are pinned here: it is present on
 * these paths, and it is the reason `ws://` has to be built by hand rather than
 * reusing `request()`.
 */
describe('streaming URLs', () => {
  it('builds a plain URL when no token is set', () => {
    expect(streamUrl(CONFIG, '/v1/face/broadcast')).toBe(
      'http://phone.test:8080/v1/face/broadcast',
    );
  });

  it('carries the token as ?token= — a browser cannot set a header here', () => {
    const url = new URL(streamUrl(AUTHED, '/v1/face/broadcast', { preset: 'cartoon' }));
    expect(url.searchParams.get('preset')).toBe('cartoon');
    expect(url.searchParams.get('token')).toBe('sekrit');
  });

  it('drops undefined query values rather than sending "undefined"', () => {
    const url = new URL(streamUrl(CONFIG, '/v1/voice/broadcast', { preset: undefined }));
    expect(url.searchParams.has('preset')).toBe(false);
  });

  it('switches http to ws for the socket routes', () => {
    expect(liveSocketUrl(CONFIG, '/v1/voice/stream')).toBe(
      'ws://phone.test:8080/v1/voice/stream',
    );
    expect(liveSocketUrl({ baseUrl: 'https://phone.test' }, '/v1/face/stream')).toBe(
      'wss://phone.test/v1/face/stream',
    );
  });
});

describe('PCM16 framing', () => {
  it('round-trips samples within 16-bit precision', () => {
    const input = new Float32Array([0, 0.5, -0.5, 0.999]);
    const output = pcm16ToFloat(floatToPcm16(input));
    expect(output.length).toBe(input.length);
    for (let i = 0; i < input.length; i += 1) {
      expect(output[i]).toBeCloseTo(input[i], 4);
    }
  });

  it('clamps out-of-range samples instead of wrapping around', () => {
    const output = pcm16ToFloat(floatToPcm16(new Float32Array([2, -2])));
    expect(output[0]).toBeGreaterThan(0.99);
    expect(output[1]).toBeLessThan(-0.99);
  });

  it('ignores a trailing odd byte rather than over-reading the last sample', () => {
    expect(pcm16ToFloat(new ArrayBuffer(5)).length).toBe(2);
  });
});

/** Minimal stand-in — MSW does not intercept WebSockets. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 1;
  binaryType = '';
  sent: (string | ArrayBuffer | Uint8Array)[] = [];
  closed = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string | ArrayBuffer | Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  emitText(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  emitBinary(data: ArrayBuffer) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('LiveSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('surfaces the ready frame and its session id', () => {
    const onReady = vi.fn();
    new LiveSocket('ws://phone.test/v1/voice/stream', { onReady });
    FakeWebSocket.instances[0].emitText({ type: 'ready', session: 'abc' });
    expect(onReady).toHaveBeenCalledWith('abc');
  });

  it('reports an admission failure as an error, not a silent close', () => {
    const onError = vi.fn();
    new LiveSocket('ws://phone.test/v1/face/stream', { onError });
    FakeWebSocket.instances[0].emitText({
      type: 'error',
      message: 'Another client is already streaming face.',
    });
    expect(onError).toHaveBeenCalledWith('Another client is already streaming face.');
  });

  it('routes binary frames to onMedia and leaves them untouched', () => {
    const onMedia = vi.fn();
    new LiveSocket('ws://phone.test/v1/face/stream', { onMedia });
    const frame = new ArrayBuffer(8);
    FakeWebSocket.instances[0].emitBinary(frame);
    expect(onMedia).toHaveBeenCalledWith(frame);
  });

  it('re-sends the last control frame so a paused stream is not reaped at 30s', () => {
    const socket = new LiveSocket('ws://phone.test/v1/voice/stream', {});
    const fake = FakeWebSocket.instances[0];
    socket.send({ type: 'parameters', parameters: { pitch_cents: -800 } });
    expect(fake.sent).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1]).toBe(fake.sent[0]);
  });

  it('stops the keepalive when closed, so nothing fires after teardown', () => {
    const socket = new LiveSocket('ws://phone.test/v1/voice/stream', {});
    const fake = FakeWebSocket.instances[0];
    socket.send({ type: 'parameters', parameters: {} });
    socket.close();

    vi.advanceTimersByTime(60_000);
    expect(fake.sent).toHaveLength(1);
    expect(fake.closed).toBe(true);
  });

  it('does not emit onClose twice when the caller closes first', () => {
    const onClose = vi.fn();
    const socket = new LiveSocket('ws://phone.test/v1/voice/stream', { onClose });
    socket.close();
    expect(onClose).not.toHaveBeenCalled();
  });
});
