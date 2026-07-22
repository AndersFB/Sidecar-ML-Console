import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE } from './msw/handlers';

describe('OcrPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  it('uploads an image and shows extracted text', async () => {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /OCR/ }));

    const file = new File(['fake-png-bytes'], 'photo.png', { type: 'image/png' });
    const input = screen.getByTestId('image-input');
    await userEvent.upload(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Read text' }));

    const text = await screen.findByTestId('ocr-text');
    expect(text).toHaveTextContent('HELLO SIDECAR');
    expect(screen.getByText(/Detected 1 line/)).toBeInTheDocument();
  });

  it('keeps input and result across panel switches until Clear is pressed', async () => {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /OCR/ }));

    const file = new File(['fake-png-bytes'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('image-input'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Read text' }));
    await screen.findByTestId('ocr-text');

    // Switch away: the panel stays mounted but hidden.
    await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByTestId('ocr-text')).not.toBeVisible();

    // Switch back: input preview and result are still there.
    await userEvent.click(screen.getByRole('button', { name: /OCR/ }));
    expect(screen.getByTestId('ocr-text')).toBeVisible();
    expect(screen.getByAltText('Selected input')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('ocr-text')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Selected input')).not.toBeInTheDocument();
    expect(screen.getByText(/Drop an image or click to browse/)).toBeInTheDocument();
  });
});
