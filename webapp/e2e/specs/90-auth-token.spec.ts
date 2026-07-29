import { test, expect, skipWhen } from '../support/test.ts';
import { openPanel, panelError, runPanelAction, setImage, waitForOnline } from '../support/console.ts';
import { generated } from '../support/media.ts';
import { phone } from '../support/phone.ts';

/**
 * Auth is off by default on the phone. Enable the bearer token in the app's
 * Settings tab and re-run with SIDECAR_TOKEN set to exercise this.
 *
 * The interesting asymmetry: GET / and GET /health are the only routes that
 * never require the token, so a *wrong* token can still produce a green
 * "Online" badge while every capability call fails.
 */
test.describe('bearer token', () => {
  skipWhen(() => !phone.token, 'auth not enabled — set SIDECAR_TOKEN to run these');

  test('a correct token reaches a capability', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    await openPanel(page, 'OCR');
    await setImage(page, generated('ocr-text.png'));
    await runPanelAction(page, 'Read text');
    await expect(
      page.getByRole('heading', { name: /^Detected \d+ line\(s\)$/ }),
    ).toBeVisible();
  });
});

test.describe('a wrong bearer token', () => {
  skipWhen(() => !phone.token, 'auth not enabled — set SIDECAR_TOKEN to run these');
  test.use({
    connection: {
      baseUrl: process.env.SIDECAR_URL ?? '',
      token: `${process.env.SIDECAR_TOKEN ?? ''}-wrong`,
    },
  });

  test('fails at the capability, not at the health check', async ({ page }) => {
    await page.goto('/');

    // /v1/capabilities does require the token, so connect() normally fails and
    // the console lands on Offline. Some builds tolerate it and stay Online,
    // failing only inside a panel — accept either and record which.
    const status = page.locator('aside form');
    await expect(status).toContainText(/Online|Offline/, { timeout: 30_000 });

    if ((await status.textContent())?.includes('Offline')) {
      await expect(page.getByRole('alert').filter({ hasText: 'Not connected' })).toBeVisible();
      test.info().annotations.push({
        type: 'note',
        description: 'wrong token -> Offline (GET /v1/capabilities rejected it)',
      });
      return;
    }

    await openPanel(page, 'OCR');
    await setImage(page, generated('ocr-text.png'));
    await page.getByRole('button', { name: 'Read text', exact: true }).click();
    await expect(panelError(page).first()).toContainText(/401|unauthor/i, { timeout: 60_000 });
    test.info().annotations.push({
      type: 'note',
      description: 'wrong token -> Online, panel surfaced 401 (health needs no auth)',
    });
  });
});
