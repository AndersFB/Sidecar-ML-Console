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
});
