import { test, expect, gate, markStructural, tolerateUnavailable } from '../support/test.ts';
import { openPanel, runPanelAction, setImage, waitForOnline } from '../support/console.ts';
import { generated, human, photoOrGenerated } from '../support/media.ts';

test.describe('Faces', () => {
  gate('Faces');

  test('detects faces in the supplied image', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Faces');

    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    await setImage(page, file);

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Detect faces');

      if (isReal) {
        await expect(panel.getByRole('heading', { name: /^[1-9]\d* face\(s\)$/ })).toBeVisible();
      } else {
        // Apple's detector will not fire on drawn shapes. The round trip and
        // the render are still verified; detection is not.
        markStructural('no real photo supplied — face count not asserted');
        await expect(panel.getByRole('heading', { name: /^\d+ face\(s\)$/ })).toBeVisible();
      }
      await expect(panel.getByTestId('faces-canvas')).toBeVisible();
    });
  });
});

test.describe('Pose', () => {
  gate('Pose');

  test('detects a body pose', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Pose');

    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    await setImage(page, file);
    await panel.getByRole('combobox').first().selectOption('body');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Detect pose');

      if (isReal) {
        await expect(
          panel.getByRole('heading', { name: /^[1-9]\d* person\(s\) detected$/ }),
        ).toBeVisible();
      } else {
        markStructural('no real photo supplied — person count not asserted');
        await expect(panel.getByRole('heading', { name: /^\d+ person\(s\) detected$/ })).toBeVisible();
      }
    });
  });

  test('detects hand joints', async ({ page }) => {
    const hand = human('hand.jpg');
    test.skip(!hand, 'hand pose needs a real photo — supply fixtures/human/hand.jpg');

    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Pose');

    await setImage(page, hand!);
    await panel.getByRole('combobox').first().selectOption('hand');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Detect pose');
      await expect(panel.getByRole('heading', { name: /^[1-9]\d* hand\(s\):/ })).toBeVisible();
    });
  });
});

test.describe('Document Scan', () => {
  gate('Document Scan');

  test('scans a page photographed at an angle', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Document Scan');

    const real = human('document.jpg');
    await setImage(page, real ?? generated('document-skew.jpg'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Scan document');

      // {detected:false} at 200 is a documented, content-dependent response —
      // not a failure. Record which branch happened.
      const corrected = panel.getByRole('heading', {
        name: /^Corrected scan \(confidence \d\.\d{2}\)$/,
      });
      const notFound = panel.getByText('No document found in this image.');

      await expect(corrected.or(notFound).first()).toBeVisible();

      if (await notFound.count()) {
        markStructural(
          real
            ? 'phone answered detected:false for the supplied photo (a valid 200)'
            : 'phone answered detected:false for the generated page (a valid 200)',
        );
      } else {
        await expect(panel.getByAltText('Corrected document')).toBeVisible();
      }
    });
  });
});
