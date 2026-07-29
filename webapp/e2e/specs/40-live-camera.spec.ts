import { existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, gate, markStructural } from '../support/test.ts';
import { openPanel, waitForOnline } from '../support/console.ts';
import { GENERATED, human } from '../support/media.ts';

/**
 * Runs only in the `chromium-fakemedia` project, which supplies a fake camera
 * backed by e2e/fixtures/generated/webcam.y4m. There is no streaming endpoint —
 * LiveCameraView posts JPEG frames to the ordinary one-shot vision routes with
 * exactly one request in flight, so this exercises capture -> POST -> overlay.
 */
test.beforeEach(() => {
  test.skip(
    !existsSync(path.join(GENERATED, 'webcam.y4m')),
    'no fake-camera source — run: npm run e2e:fixtures',
  );
});

test.describe('Faces live camera', () => {
  gate('Faces');

  test('runs the live detection loop', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Faces');

    await panel.getByRole('button', { name: 'Live camera' }).click();

    await expect(panel.getByTestId('live-video')).toBeVisible();
    await expect(panel.getByTestId('live-overlay')).toBeVisible();

    // "Starting camera…" until the first response lands; then
    // "N face(s) · X.X fps". Reaching the fps readout proves whole round trips
    // completed against the phone.
    await expect(panel.getByTestId('live-status')).toHaveText(/\d+ face\(s\) · [\d.]+ fps/, {
      timeout: 60_000,
    });

    if (!human('person.jpg')) {
      markStructural('fake camera shows a generated image — face count not asserted');
    } else {
      await expect(panel.getByTestId('live-status')).toHaveText(/[1-9]\d* face\(s\)/, {
        timeout: 60_000,
      });
    }

    // Stopping must restore the still-image controls.
    await panel.getByRole('button', { name: '■ Stop live camera' }).click();
    await expect(panel.getByTestId('live-video')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Detect faces' })).toBeVisible();
  });
});

test.describe('Pose live camera', () => {
  gate('Pose');

  test('switches detection mode while live', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Pose');

    await panel.getByRole('combobox').first().selectOption('body');
    await panel.getByRole('button', { name: 'Live camera' }).click();

    await expect(panel.getByTestId('live-status')).toHaveText(/\d+ person\(s\) · [\d.]+ fps/, {
      timeout: 60_000,
    });

    // Changing mode clears stale detections so the wrong overlay is never drawn.
    await panel.getByRole('combobox').first().selectOption('hand');
    await expect(panel.getByTestId('live-status')).toHaveText(/hand\(s\)|Starting camera…/, {
      timeout: 60_000,
    });

    await panel.getByRole('button', { name: '■ Stop live camera' }).click();
    await expect(panel.getByTestId('live-video')).toHaveCount(0);
  });
});
