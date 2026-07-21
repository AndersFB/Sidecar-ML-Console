import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE } from './msw/handlers';

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
});
