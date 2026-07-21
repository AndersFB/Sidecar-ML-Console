import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
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
});
