import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import { openPanel, runPanelAction, setImage, waitForOnline } from '../support/console.ts';
import { generated } from '../support/media.ts';
import { BARCODE_PAYLOAD, OCR_TOKEN } from '../fixtures/build-fixtures.mjs';

test.describe('OCR', () => {
  gate('OCR');

  test('reads the generated text image', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'OCR');

    await setImage(page, generated('ocr-text.png'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Read text');

      await expect(panel.getByRole('heading', { name: /^Detected [1-9]\d* line\(s\)$/ })).toBeVisible();
      await expect(panel.getByTestId('ocr-canvas')).toBeVisible();

      // Semantic assertion: the fixture is generated, so we know exactly what
      // the phone should have read back.
      const text = ((await panel.getByTestId('ocr-text').textContent()) ?? '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
      expect(text).toContain(OCR_TOKEN);
    });
  });

  test('Clear resets the panel', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'OCR');

    await setImage(page, generated('ocr-text.png'));
    await panel.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(panel.getByAltText('Selected input')).toHaveCount(0);
    await expect(panel.getByTestId('ocr-text')).toHaveCount(0);
  });
});

test.describe('Barcodes & QR', () => {
  gate('Barcodes & QR');

  test('decodes the generated Code 39 barcode', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Barcodes & QR');

    await setImage(page, generated('barcode-code39.png'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Scan codes');

      await expect(panel.getByRole('heading', { name: /^[1-9]\d* code\(s\) found$/ })).toBeVisible();
      await expect(panel).toContainText(BARCODE_PAYLOAD);
    });
  });
});
