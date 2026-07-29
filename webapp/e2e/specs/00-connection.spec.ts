import { test, expect } from '../support/test.ts';
import { phone, PANEL_CAPABILITY, capability } from '../support/phone.ts';
import { openPanel, waitForOnline, waitForOffline } from '../support/console.ts';

test.describe('connection', () => {
  test('auto-connects from stored address and reports the phone', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    // The status line appends "· {app} {version}" once health has landed.
    await expect(page.locator('aside form')).toContainText(phone.health.app);
    await expect(page.locator('aside form')).toContainText(phone.health.version);

    // The "Not connected" banner must be gone.
    await expect(page.getByRole('alert').filter({ hasText: 'Not connected' })).toHaveCount(0);
  });

  test('capability dots reflect what the phone reported', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    const nav = page.getByRole('navigation', { name: 'Capabilities' });
    for (const [title, capabilityId] of Object.entries(PANEL_CAPABILITY)) {
      if (!capabilityId) continue;
      const cap = capability(capabilityId);
      if (!cap) continue;
      const button = nav.getByRole('button', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) });
      const dot = button.locator('span[title]');
      await expect(dot).toHaveAttribute('title', cap.available ? 'Ready' : (cap.reason ?? 'Unknown'));
    }
  });

  test('records the address in the history datalist', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    await expect(page.locator(`#sidecar-url-history option[value="${phone.baseUrl}"]`)).toHaveCount(1);
  });
});

test.describe('failure paths', () => {
  // 127.0.0.1:1 refuses instantly. A routable-but-dead LAN address would sit in
  // TCP timeout for ~75 s and make this test look hung.
  test.use({ connection: { baseUrl: 'http://127.0.0.1:1', token: '' } });

  test('a bad address shows Offline and the not-connected banner, then recovers', async ({ page }) => {
    await page.goto('/');
    await waitForOffline(page);

    await expect(page.getByRole('alert').filter({ hasText: 'Not connected' })).toBeVisible();

    // Every capability dot goes grey/unknown while disconnected.
    const dot = page
      .getByRole('navigation', { name: 'Capabilities' })
      .getByRole('button', { name: /^Chat\b/ })
      .locator('span[title]');
    await expect(dot).toHaveAttribute('title', 'Unknown');

    // Typing the real address and pressing Connect must recover in place.
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
    await expect(page.getByRole('alert').filter({ hasText: 'Not connected' })).toHaveCount(0);
  });
});

test.describe('unavailable capability banner', () => {
  test('shows the phone\'s own reason', async ({ page }) => {
    const unavailable = phone.capabilities.find((c) => !c.available);
    test.skip(
      !unavailable,
      'phone reports all capabilities available — the unavailable banner cannot be exercised',
    );

    const title = Object.entries(PANEL_CAPABILITY).find(
      ([, id]) => id === unavailable!.id,
    )?.[0];
    test.skip(!title, `no panel is backed by capability ${unavailable!.id}`);

    await page.goto('/');
    await waitForOnline(page);
    await openPanel(page, title!);

    await expect(
      page.getByRole('alert').filter({ hasText: 'Unavailable on this device' }),
    ).toContainText(unavailable!.reason ?? '');
  });
});
