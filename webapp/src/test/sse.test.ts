import { describe, expect, it } from 'vitest';
import { parseSSEStream } from '../api/sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const data of parseSSEStream(stream)) {
    out.push(data);
  }
  return out;
}

describe('parseSSEStream', () => {
  it('parses whole frames', async () => {
    const events = await collect(streamOf('data: {"a":1}\n\ndata: [DONE]\n\n'));
    expect(events).toEqual(['{"a":1}', '[DONE]']);
  });

  it('handles frames split across network chunks', async () => {
    const events = await collect(
      streamOf('data: {"content":"hel', 'lo"}\n\nda', 'ta: {"content":"world"}\n\n'),
    );
    expect(events).toEqual(['{"content":"hello"}', '{"content":"world"}']);
  });

  it('handles multiple frames in one chunk', async () => {
    const events = await collect(streamOf('data: 1\n\ndata: 2\n\ndata: 3\n\n'));
    expect(events).toEqual(['1', '2', '3']);
  });

  it('tolerates data: without trailing space', async () => {
    const events = await collect(streamOf('data:{"x":1}\n\n'));
    expect(events).toEqual(['{"x":1}']);
  });
});
