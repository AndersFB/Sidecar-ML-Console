import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import { openPanel, runPanelAction, waitForOnline } from '../support/console.ts';

test.describe('Generate Image', () => {
  gate('Generate Image');

  test('generates an image on the phone', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Generate Image');

    await panel.getByLabel('Image prompt').fill('a red sailboat on a calm blue sea at sunrise');

    await tolerateUnavailable(async () => {
      // Image generation is the heaviest route and runs 1-at-a-time; it also
      // needs the app in the foreground or the phone answers 503.
      await runPanelAction(page, 'Generate', { timeout: 180_000 });
      await expect(panel.getByAltText('Generated 1')).toBeVisible({ timeout: 180_000 });
    });
  });
});
