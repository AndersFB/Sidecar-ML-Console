import { joinUrl, type ApiConfig } from './client';
import { log } from '../utils/log';

/**
 * Client for the phone's live routes.
 *
 * Two directions, two transports:
 *
 * - **Ingest** (`GET /v1/{voice,face}/stream`) is a WebSocket. Binary frames
 *   carry media, text frames carry JSON control, so the effect can be retuned
 *   mid-stream without interrupting the media — the entire reason to stream
 *   rather than post a file.
 * - **Broadcast** (`GET /v1/{voice,face}/broadcast`) is a plain chunked GET of
 *   the *phone's own* camera/mic, consumed by an `<img>` or `<audio>` element.
 *
 * Both accept the bearer token as `?token=` instead of a header, because a
 * browser can set neither on a WebSocket handshake nor on `<img src>`. The
 * server scopes that fallback to exactly these four paths.
 */

/** Absolute http(s) URL for a streaming route, carrying the token as a query. */
export function streamUrl(
  config: ApiConfig,
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(joinUrl(config.baseUrl, path));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (config.token) url.searchParams.set('token', config.token);
  return url.toString();
}

/** Same, as a ws(s) URL for the WebSocket ingest routes. */
export function liveSocketUrl(config: ApiConfig, path: string): string {
  const url = new URL(streamUrl(config, path));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Server → client text frames. */
export interface LiveStatus {
  type: 'ready' | 'error' | string;
  message?: string;
  session?: string;
}

export interface LiveSocketHandlers {
  /** The slot was claimed; the stream is open for media. */
  onReady?: (session: string | undefined) => void;
  /**
   * A server-side problem. Admission failures (another client already holds
   * the modality's single slot) and the 30 s idle reap both arrive this way —
   * a socket has no status code once it is open, so errors travel as messages.
   */
  onError?: (message: string) => void;
  onMedia?: (data: ArrayBuffer) => void;
  onClose?: () => void;
}

/**
 * The server reaps a session that sends nothing for 30 s. Anything at all
 * counts as activity, so a re-send of the current parameters well inside that
 * window keeps a paused stream alive without a bespoke ping frame.
 */
const KEEPALIVE_MS = 10_000;

export class LiveSocket {
  private socket: WebSocket | null = null;
  private keepalive: number | null = null;
  private lastControl: unknown = null;
  private closed = false;

  constructor(url: string, private handlers: LiveSocketHandlers) {
    log.info(`→ WS ${url.replace(/token=[^&]*/, 'token=***')}`);
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === 'string') {
        this.handleStatus(event.data);
      } else {
        this.handlers.onMedia?.(event.data);
      }
    };
    socket.onerror = () => {
      // The browser deliberately withholds the cause of a socket failure, so
      // the address is the only actionable thing left to say.
      if (!this.closed) this.handlers.onError?.('Could not reach the phone’s live stream.');
    };
    socket.onclose = () => {
      this.stopKeepalive();
      if (!this.closed) {
        this.closed = true;
        this.handlers.onClose?.();
      }
    };
    this.keepalive = window.setInterval(() => this.touch(), KEEPALIVE_MS);
  }

  private handleStatus(text: string) {
    let status: LiveStatus;
    try {
      status = JSON.parse(text) as LiveStatus;
    } catch {
      log.warn(`live stream sent an unparseable status frame: ${text}`);
      return;
    }
    if (status.type === 'ready') {
      log.info(`live session ready (${status.session ?? 'no id'})`);
      this.handlers.onReady?.(status.session);
    } else if (status.type === 'error') {
      log.warn(`live stream error: ${status.message ?? 'unknown'}`);
      this.handlers.onError?.(status.message ?? 'The phone reported a stream error.');
    }
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Sends a JSON control frame and remembers it for the keepalive. */
  send(control: unknown): void {
    if (!this.isOpen) return;
    this.lastControl = control;
    this.socket?.send(JSON.stringify(control));
  }

  /** Sends a binary media frame — PCM16 chunks for voice, JPEG for face. */
  sendMedia(bytes: ArrayBuffer | Uint8Array): void {
    if (!this.isOpen) return;
    this.socket?.send(bytes);
  }

  /** Re-sends the last control frame purely to reset the server's idle clock. */
  private touch(): void {
    if (this.isOpen && this.lastControl !== null) {
      this.socket?.send(JSON.stringify(this.lastControl));
    }
  }

  private stopKeepalive(): void {
    if (this.keepalive !== null) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
  }

  close(): void {
    this.closed = true;
    this.stopKeepalive();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  }
}
