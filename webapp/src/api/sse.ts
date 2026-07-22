import type { ApiConfig } from './client';
import { ApiError, joinUrl } from './client';
import type { ChatChunk, ChatMessage } from './types';
import { log } from '../utils/log';

/**
 * Streams a chat completion over SSE. EventSource can't POST, so this parses
 * `data:` frames from a fetch ReadableStream — frames may arrive split across
 * network chunks.
 */
export async function streamChat(
  config: ApiConfig,
  body: { messages: ChatMessage[]; max_tokens?: number },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = joinUrl(config.baseUrl, '/v1/chat/completions');
  log.info(`→ POST ${url} (SSE stream)`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (error) {
    log.error(`✕ POST ${url} (SSE stream) failed:`, error);
    throw error;
  }

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    let code = 'http_error';
    try {
      const errorBody = await response.json();
      message = errorBody?.error?.message ?? message;
      code = errorBody?.error?.code ?? code;
    } catch {
      // ignore
    }
    log.warn(`← ${response.status} POST /v1/chat/completions (stream) [${code}]: ${message}`);
    throw new ApiError(response.status, code, message);
  }

  for await (const data of parseSSEStream(response.body)) {
    if (data === '[DONE]') {
      log.info('← SSE stream complete');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    // Mid-stream errors arrive as an error envelope event.
    const asError = parsed as { error?: { code?: string; message?: string } };
    if (asError.error) {
      throw new ApiError(500, asError.error.code ?? 'stream_error', asError.error.message ?? 'stream error');
    }
    const chunk = parsed as ChatChunk;
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  }
}

/**
 * Yields the payload of each `data:` frame, handling chunk-boundary splits.
 * The SSE spec allows CRLF, LF or CR line endings — all are normalized to LF.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  // A chunk-final CR is held back: it may be half of a CRLF pair whose LF
  // arrives in the next chunk.
  let carry = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (carry) buffer += '\n';
      } else {
        let text = carry + decoder.decode(value, { stream: true });
        carry = '';
        if (text.endsWith('\r')) {
          carry = '\r';
          text = text.slice(0, -1);
        }
        buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      }

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split('\n')) {
          if (line.startsWith('data: ')) {
            yield line.slice(6);
          } else if (line.startsWith('data:')) {
            yield line.slice(5).trimStart();
          }
        }
        boundary = buffer.indexOf('\n\n');
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
