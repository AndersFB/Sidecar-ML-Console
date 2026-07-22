import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE, facesFixture } from './msw/handlers';

// jsdom's Image never loads; fire onload as soon as a src is assigned.
class InstantImage {
  naturalWidth = facesFixture.image.width;
  naturalHeight = facesFixture.image.height;
  onload: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('FacesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
    vi.stubGlobal('Image', InstantImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the overlay onto the canvas on the first detect', async () => {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Faces/ }));

    const file = new File(['fake-png-bytes'], 'faces.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('image-input'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Detect faces' }));

    expect(await screen.findByText(/1 face\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/roll 10° · yaw -4.1° · pitch 0.9°/)).toBeInTheDocument();

    // drawImageWithPoints resizes the canvas to the image before painting, so a
    // resized canvas proves the draw ran against the mounted canvas.
    const canvas = screen.getByTestId('faces-canvas') as HTMLCanvasElement;
    await waitFor(() => expect(canvas.width).toBe(facesFixture.image.width));
  });
});
