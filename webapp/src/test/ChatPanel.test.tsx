import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE } from './msw/handlers';
import { server } from './msw/server';

describe('ChatPanel (non-streaming)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  it('sends a message and renders the assistant reply', async () => {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());

    // Switch off streaming so the MSW JSON handler is used.
    await userEvent.click(screen.getByLabelText(/Stream tokens/));

    const input = screen.getByLabelText('Chat message');
    await userEvent.type(input, 'ping');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Pong from the phone!')).toBeInTheDocument();
    expect(screen.getByText('ping')).toBeInTheDocument();
  });

  it('stays cleared when the conversation is cleared mid-stream', async () => {
    const encoder = new TextEncoder();
    let push!: (data: string) => void;
    let close!: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (data) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        close = () => controller.close();
      },
    });
    server.use(
      http.post(`${BASE}/v1/chat/completions`, () =>
        new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
      ),
    );

    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Chat message'), 'tell me a story');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    push('{"choices":[{"delta":{"content":"Once"}}]}');
    expect(await screen.findByText('Once')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));

    // Deltas still in flight must not crash or resurrect the cleared history.
    push('{"choices":[{"delta":{"content":" upon a time"}}]}');
    push('[DONE]');
    close();

    // Wait for the stream to finish (Stop reverts to Send); a crash in the
    // delta updater would unmount the tree here instead.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
    expect(screen.getByText(/Talk to the Apple Intelligence model/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('tell me a story')).not.toBeInTheDocument();
    expect(screen.queryByText(/Once/)).not.toBeInTheDocument();
  });
});
