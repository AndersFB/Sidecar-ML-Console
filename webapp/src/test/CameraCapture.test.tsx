import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { cameraTrack, installCameraStubs, removeCameraStubs } from './cameraStubs';
import { BASE } from './msw/handlers';

describe('Camera photo capture', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
    installCameraStubs();
  });

  afterEach(() => {
    removeCameraStubs();
    vi.restoreAllMocks();
  });

  async function openFacesPanel() {
    render(
      <ConnectionProvider>
        <App />
      </ConnectionProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Faces/ }));
  }

  it('takes a photo, releases the camera, and feeds the still pipeline', async () => {
    await openFacesPanel();
    await userEvent.click(
      screen.getByRole('button', { name: 'Take a photo with the camera' }),
    );

    expect(screen.getByTestId('camera-capture')).toBeInTheDocument();
    const shutter = await screen.findByRole('button', { name: 'Take photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await userEvent.click(shutter);

    // Viewfinder closes, the photo becomes the picked image, camera released.
    await waitFor(() =>
      expect(screen.queryByTestId('camera-capture')).not.toBeInTheDocument(),
    );
    expect(screen.getByAltText('Selected input')).toBeInTheDocument();
    expect(cameraTrack.stop).toHaveBeenCalled();

    // The captured photo flows through the normal detect path.
    await userEvent.click(screen.getByRole('button', { name: 'Detect faces' }));
    expect(await screen.findByText(/1 face\(s\)/)).toBeInTheDocument();
  });

  it('cancel closes the viewfinder without picking an image', async () => {
    await openFacesPanel();
    await userEvent.click(
      screen.getByRole('button', { name: 'Take a photo with the camera' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByTestId('camera-capture')).not.toBeInTheDocument(),
    );
    expect(screen.queryByAltText('Selected input')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detect faces' })).toBeDisabled();
    expect(cameraTrack.stop).toHaveBeenCalled();
  });
});
