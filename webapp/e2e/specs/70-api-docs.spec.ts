import { test, expect } from '../support/test.ts';
import { openPanel, waitForOnline } from '../support/console.ts';
import { phone } from '../support/phone.ts';

test.describe('API Reference', () => {
  test('lists the endpoints against the live phone address', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'API Reference');

    // The docs panel has no capabilityId, so it must never show the
    // "Unavailable on this device" banner.
    await expect(page.getByRole('alert').filter({ hasText: 'Unavailable on this device' })).toHaveCount(0);

    // The examples substitute the connected address rather than a placeholder.
    await expect(panel).toContainText(`${phone.baseUrl}/health`);

    // Independent, browser-side check of the same invariant the Vitest tripwire
    // guards: apiReference.ts must document all 30 server routes.
    await expect(panel.getByLabel('Filter endpoints')).toHaveAttribute(
      'placeholder',
      /^Filter 30 endpoints/,
    );
  });

  test('filters endpoints', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'API Reference');

    await panel.getByLabel('Filter endpoints').fill('ocr');
    await expect(panel.getByText('/v1/vision/ocr').first()).toBeVisible();
    await expect(panel.getByText('/v1/chat/completions')).toHaveCount(0);

    await panel.getByLabel('Filter endpoints').fill('zzzz');
    // Note the curly quotes in the app's own string.
    await expect(panel.getByText('No endpoints match “zzzz”.')).toBeVisible();
  });
});
