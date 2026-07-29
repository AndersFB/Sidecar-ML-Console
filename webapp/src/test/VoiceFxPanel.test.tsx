import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

async function openPanel() {
  renderApp();
  await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /Voice Changer/ }));
}

const clip = () => new File(['fake-wav-bytes'], 'clip.wav', { type: 'audio/wav' });

describe('VoiceFxPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  it('transforms a clip and offers the result alongside the original', async () => {
    await openPanel();

    await userEvent.upload(screen.getByTestId('audio-input'), clip());
    await userEvent.click(screen.getByRole('button', { name: 'Transform' }));

    expect(await screen.findByTestId('voicefx-result')).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('loads presets from the phone and applies one to the sliders', async () => {
    await openPanel();

    const giant = await screen.findByRole('button', { name: 'Giant' });
    await userEvent.click(giant);

    expect(giant).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Pitch')).toHaveValue('-800');
    expect(screen.getByLabelText('Rate')).toHaveValue('0.9');
  });

  it('drops the preset selection once a slider is moved by hand', async () => {
    await openPanel();

    const giant = await screen.findByRole('button', { name: 'Giant' });
    await userEvent.click(giant);
    expect(giant).toHaveAttribute('aria-pressed', 'true');

    // The result is no longer exactly the named preset. A range input is not
    // editable text, so drive it the way the browser does.
    fireEvent.change(screen.getByLabelText('Gain'), { target: { value: '3' } });

    expect(giant).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Gain')).toHaveValue('3');
  });

  it('re-speaks a clip and shows the transcript with the audio', async () => {
    await openPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Re-speak' }));

    await userEvent.upload(screen.getByTestId('audio-input'), clip());
    await userEvent.click(screen.getByRole('button', { name: 'Re-speak' }));

    expect(await screen.findByText('hello from the phone')).toBeInTheDocument();
  });
});
