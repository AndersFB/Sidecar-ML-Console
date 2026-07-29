import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import {
  activePanel,
  openPanel,
  runPanelAction,
  setImage,
  settlePersistence,
  waitForIdbKey,
  waitForOnline,
} from '../support/console.ts';
import { generated } from '../support/media.ts';

test.describe.configure({ mode: 'serial' });

test.describe('state survives a reload', () => {
  gate('OCR');

  test('restores the selected panel, the picked image and the result', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    const panel = await openPanel(page, 'OCR');
    await setImage(page, generated('ocr-text.png'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Read text');
      await expect(panel.getByTestId('ocr-text')).toBeVisible();
    });

    // Results live in IndexedDB; wait for the write rather than sleeping.
    await waitForIdbKey(page, 'sidecar.ocr.result');
    await waitForIdbKey(page, 'sidecar.ocr.image');
    // The selected panel lives in localStorage behind a 250 ms debounce.
    await settlePersistence(page);

    await page.reload();
    await waitForOnline(page);

    // sidecar.panel restored OCR without any clicking.
    await expect(page.getByRole('heading', { level: 2, name: 'OCR' })).toBeVisible();
    await expect(activePanel(page)).toHaveCount(1);

    // useStoredState hydrates asynchronously after mount, so allow generous time.
    await expect(activePanel(page).getByAltText('Selected input')).toBeVisible({ timeout: 15_000 });
    await expect(activePanel(page).getByTestId('ocr-text')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('text inputs survive a reload', () => {
  gate('Text Analysis');

  test('restores the analysis text', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    const panel = await openPanel(page, 'Text Analysis');
    const sentinel = 'Reload sentinel from the e2e suite.';
    await panel.getByLabel('Text to analyze').fill(sentinel);

    // Do not reload inside the debounce window.
    await settlePersistence(page);
    await page.reload();
    await waitForOnline(page);

    await expect(activePanel(page).getByLabel('Text to analyze')).toHaveValue(sentinel, {
      timeout: 15_000,
    });
  });
});
