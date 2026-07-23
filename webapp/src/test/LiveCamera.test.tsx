import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { BASE, bodyPoseFixture, facesFixture } from './msw/handlers';

// jsdom has no camera, no <video> playback, and no 2D canvas — stub the
// pieces the live loop touches so it runs end-to-end against MSW.
const track = { stop: vi.fn() };
const fakeStream = {
  getTracks: () => [track],
  getVideoTracks: () => [track],
} as unknown as MediaStream;

function ctxStub(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D;
}

describe('Live camera', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
    track.stop.mockClear();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      writable: true,
      value: null,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 480,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctxStub());
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      writable: true,
      value(callback: BlobCallback) {
        callback(new Blob(['frame'], { type: 'image/jpeg' }));
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'srcObject');
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoWidth');
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoHeight');
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'readyState');
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toBlob');
    vi.restoreAllMocks();
  });

  async function openPanel(name: RegExp) {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name }));
  }

  it('streams webcam frames to the faces endpoint and overlays detections', async () => {
    await openPanel(/Faces/);
    await userEvent.click(screen.getByRole('button', { name: /Live camera/ }));

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('live-status')).toHaveTextContent(/1 face\(s\)/),
    );

    // drawLiveOverlay sizes the overlay canvas to the analyzed frame the
    // server echoed, proving the response reached the drawing layer.
    const overlay = screen.getByTestId('live-overlay') as HTMLCanvasElement;
    await waitFor(() => expect(overlay.width).toBe(facesFixture.image.width));

    await userEvent.click(screen.getByRole('button', { name: /Stop live camera/ }));
    expect(screen.queryByTestId('live-video')).not.toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });

  it('streams body-pose frames when the Pose panel goes live', async () => {
    await openPanel(/Pose/);
    await userEvent.click(screen.getByRole('button', { name: /Live camera/ }));

    await waitFor(() =>
      expect(screen.getByTestId('live-status')).toHaveTextContent(/1 person\(s\)/),
    );
    const overlay = screen.getByTestId('live-overlay') as HTMLCanvasElement;
    await waitFor(() => expect(overlay.width).toBe(bodyPoseFixture.image.width));

    await userEvent.click(screen.getByRole('button', { name: /Stop live camera/ }));
    expect(track.stop).toHaveBeenCalled();
  });

  it('surfaces camera failures and leaves live mode', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Permission denied'),
    );
    await openPanel(/Faces/);
    await userEvent.click(screen.getByRole('button', { name: /Live camera/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Permission denied/);
    expect(screen.queryByTestId('live-video')).not.toBeInTheDocument();
  });
});
