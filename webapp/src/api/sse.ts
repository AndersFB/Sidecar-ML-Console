import type { ApiConfig } from './client';
import { ApiError, joinUrl } from './client';
import type { ChatChunk, ChatMessage } from './types';

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
  const response = await fetch(joinUrl(config.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

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
    throw new ApiError(response.status, code, message);
  }

  for await (const data of parseSSEStream(response.body)) {
    if (data === '[DONE]') return;
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

/** Yields the payload of each `data:` frame, handling chunk-boundary splits. */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

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
    }
  } finally {
    reader.releaseLock();
  }
}
