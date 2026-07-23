import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { cameraTrack, installCameraStubs, removeCameraStubs } from './cameraStubs';
import { BASE, bodyPoseFixture, facesFixture } from './msw/handlers';

describe('Live camera', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
    installCameraStubs();
  });

  afterEach(() => {
    removeCameraStubs();
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
    expect(cameraTrack.stop).toHaveBeenCalled();
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
    expect(cameraTrack.stop).toHaveBeenCalled();
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
