import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { api } from '../api/client';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE } from './msw/handlers';

function renderApp() {
  return render(
    <ConnectionProvider>
      <App />
    </ConnectionProvider>,
  );
}

describe('App shell + connection', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects on load and shows capability status', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    expect(screen.getByText(/Sidecar ML 1.0/)).toBeInTheDocument();
    // Nav lists panels
    expect(screen.getByRole('button', { name: /OCR/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Song ID/ })).toBeInTheDocument();
  });

  it('shows unavailable banner for capabilities the phone cannot run', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Generate Image/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Needs Apple Intelligence.');
  });

  it('switches panels from the sidebar', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Text Analysis/ }));
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
  });

  it('does not refetch capability lists while a new address is being typed', async () => {
    const voicesSpy = vi.spyOn(api, 'voices');
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Speak/ }));
    await waitFor(() => expect(voicesSpy).toHaveBeenCalledTimes(1));

    // Editing the address must not re-fire the fetch until Connect succeeds.
    await userEvent.type(screen.getByLabelText('Server address'), ':9999');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(voicesSpy).toHaveBeenCalledTimes(1);
  });
});
