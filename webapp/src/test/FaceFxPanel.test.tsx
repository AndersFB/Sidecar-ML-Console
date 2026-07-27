import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE, faceTransformFixture } from './msw/handlers';
import { server } from './msw/server';
import { HttpResponse, http } from 'msw';

function renderApp() {
  return render(
    <ConnectionProvider>
      <App />
    </ConnectionProvider>,
  );
}

async function openPanel() {
  renderApp();
  await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /Face Changer/ }));
}

describe('FaceFxPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  it('transforms a photo and shows the before/after wipe', async () => {
    await openPanel();

    const file = new File(['fake-png-bytes'], 'portrait.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('image-input'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Transform' }));

    expect(await screen.findByText('1 face(s)')).toBeInTheDocument();
    expect(screen.getByAltText('Result')).toBeInTheDocument();
    expect(screen.getByAltText('Original')).toBeInTheDocument();
  });

  it('reports zero faces as an unchanged image, not an error', async () => {
    server.use(
      http.post(`${BASE}/v1/face/transform`, () =>
        HttpResponse.json({ ...faceTransformFixture, faces: 0 }),
      ),
    );
    await openPanel();

    const file = new File(['fake-png-bytes'], 'landscape.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('image-input'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Transform' }));

    expect(await screen.findByText(/No face found/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads presets from the phone and applies one to the sliders', async () => {
    await openPanel();

    const cartoon = await screen.findByRole('button', { name: 'Cartoon' });
    await userEvent.click(cartoon);

    expect(cartoon).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Eye size')).toHaveValue('0.75');
  });

  it('renders the swap notes verbatim so the technique is not oversold', async () => {
    await openPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Face swap' }));

    const inputs = screen.getAllByTestId('image-input');
    const file = new File(['fake-png-bytes'], 'a.png', { type: 'image/png' });
    await userEvent.upload(inputs[0], file);
    await userEvent.upload(inputs[1], file);
    await userEvent.click(screen.getByRole('button', { name: 'Swap faces' }));

    expect(await screen.findByText(/not a generative face swap/)).toBeInTheDocument();
  });
});
