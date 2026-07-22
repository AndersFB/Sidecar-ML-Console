import { useRef, useState } from 'react';
import { api } from '../api/client';
import { streamChat } from '../api/sse';
import type { ChatMessage } from '../api/types';
import { Button, ErrorBanner, inputClass } from '../components/Primitives';
import { useConnection } from '../state/ConnectionContext';
import { usePersistentState } from '../utils/usePersistentState';

export function ChatPanel() {
  const { config } = useConnection();
  const [messages, setMessages] = usePersistentState<ChatMessage[]>('sidecar.chat.history', []);
  const [input, setInput] = useState('');
  const [system, setSystem] = usePersistentState(
    'sidecar.chat.system',
    'You are a concise, helpful assistant.',
  );
  const [useStreaming, setUseStreaming] = usePersistentState('sidecar.chat.stream', true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setBusy(true);

    const outbound: ChatMessage[] = system.trim()
      ? [{ role: 'system', content: system.trim() }, ...history]
      : history;

    try {
      if (useStreaming) {
        setMessages([...history, { role: 'assistant', content: '' }]);
        abortRef.current = new AbortController();
        await streamChat(
          config,
          { messages: outbound },
          (delta) => {
            setMessages((current) => {
              // The user can clear the conversation mid-stream; drop late deltas.
              const last = current[current.length - 1];
              if (!last || last.role !== 'assistant') return current;
              const next = [...current];
              next[next.length - 1] = { ...last, content: last.content + delta };
              return next;
            });
          },
          abortRef.current.signal,
        );
      } else {
        const response = await api.chat(config, outbound);
        const content = response.choices[0]?.message.content ?? '';
        setMessages([...history, { role: 'assistant', content }]);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err));
        // Roll back the failed exchange — unless the user cleared mid-stream.
        setMessages((current) => {
          const last = current[current.length - 1];
          return last && last.role === 'assistant' ? history : current;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <details className="card p-3 text-sm">
        <summary className="cursor-pointer text-xs text-ink-2">System prompt</summary>
        <textarea
          className={`${inputClass} mt-2 w-full`}
          rows={2}
          value={system}
          onChange={(event) => setSystem(event.target.value)}
        />
      </details>

      <div className="card flex min-h-72 flex-col gap-3 p-4" data-testid="chat-transcript">
        {messages.length === 0 && (
          <p className="m-auto text-sm text-ink-3">
            Talk to the Apple Intelligence model running on the iPhone. Works with any OpenAI
            SDK too — point it at <code className="font-mono">{config.baseUrl}/v1</code>.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'self-end bg-indigo-a/30'
                : 'self-start border border-line bg-panel-2'
            }`}
          >
            {message.content || <span className="animate-pulse text-ink-3">▋</span>}
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className={`${inputClass} flex-1`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message the on-device model…"
          aria-label="Chat message"
        />
        {busy && useStreaming ? (
          <Button variant="danger" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={busy || !input.trim()}>
            Send
          </Button>
        )}
      </form>

      <div className="flex items-center justify-between text-xs text-ink-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={useStreaming}
            onChange={(event) => setUseStreaming(event.target.checked)}
          />
          Stream tokens (SSE)
        </label>
        <button type="button" className="hover:text-coral" onClick={() => setMessages([])}>
          Clear conversation
        </button>
      </div>
    </div>
  );
}
