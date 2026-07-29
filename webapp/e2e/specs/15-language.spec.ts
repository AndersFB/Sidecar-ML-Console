import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import { openPanel, runPanelAction, waitForOnline } from '../support/console.ts';

test.describe('Translate', () => {
  gate('Translate');

  test('translates English to German', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Translate');

    await panel.getByLabel('Text to translate').fill('Good morning, how are you today?');
    await panel.getByLabel('Source language').selectOption('en');
    await panel.getByLabel('Target language').selectOption('de');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Translate');

      await expect(panel.getByRole('heading', { name: 'Translation (de)' })).toBeVisible();
      const output = ((await panel.getByRole('heading', { name: 'Translation (de)' })
        .locator('xpath=../..')
        .textContent()) ?? '').trim();
      expect(output.length).toBeGreaterThan(0);
      expect(output).not.toContain('Good morning, how are you today?');
    });
  });
});

test.describe('Text Analysis', () => {
  gate('Text Analysis');

  test('reports language, sentiment and entities', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Text Analysis');

    await panel
      .getByLabel('Text to analyze')
      .fill('Tim Cook announced the new iPhone in Cupertino on Tuesday, and it was wonderful.');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Analyze');

      await expect(panel.getByRole('heading', { name: 'Language' })).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Sentiment' })).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Entities' })).toBeVisible();
      // NLP is always-available per the docs, so a real result is expected.
      await expect(panel.getByRole('heading', { name: 'Language' }).locator('xpath=../..')).toContainText(
        /[a-z]{2}/,
      );
    });
  });
});
