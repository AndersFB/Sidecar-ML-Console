import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../support/test.ts';
import { openPanel, runPanelAction, waitForOnline } from '../support/console.ts';
import { phone } from '../support/phone.ts';

/**
 * The single-file console is the artifact the iOS app links to
 * (releases/latest/download/sidecar-ml-console.html). It is not committed, so
 * this leg needs `npm run build` first.
 *
 * Two differences from the dev-server leg:
 *  - localStorage on file:// is unreliable, so the address is typed into the UI
 *    rather than seeded.
 *  - the page's origin is `null`, which the phone's CORS policy (`*`) accepts.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(here, '../../dist/sidecar-ml-console.html');

test.describe('single-file console over file://', () => {
  test.beforeEach(() => {
    test.skip(
      !existsSync(bundle),
      'dist/sidecar-ml-console.html not built — run: npm run build',
    );
  });

  test('connects and runs a capability from disk', async ({ page }) => {
    await page.goto(`file://${bundle}`);

    await page.getByLabel('Server address').fill(phone.baseUrl);
    if (phone.token) {
      await page.getByRole('button', { name: 'token', exact: true }).click();
      await page.getByLabel('Bearer token').fill(phone.token);
    }
    // exact: true is required — a sidebar button's accessible name includes its
    // status-dot title, and a capability reason like "No internet connection."
    // contains "Connect".
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await waitForOnline(page);

    // NLP is documented as always available and needs no media, which makes it
    // the right probe for this leg.
    const panel = await openPanel(page, 'Text Analysis');
    await panel.getByLabel('Text to analyze').fill('Sidecar ML runs entirely on the iPhone.');
    await runPanelAction(page, 'Analyze');
    await expect(panel.getByRole('heading', { name: 'Language' })).toBeVisible();

    // The inlined assets must have survived the single-file build.
    await expect(page.locator('style')).not.toHaveCount(0);
    await expect(page.locator('script[src]')).toHaveCount(0);
  });
});
