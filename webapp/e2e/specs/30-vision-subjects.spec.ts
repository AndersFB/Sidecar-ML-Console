import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import { openPanel, panelError, runPanelAction, setImage, waitForOnline } from '../support/console.ts';
import { photoOrGenerated } from '../support/media.ts';

test.describe('Remove Background', () => {
  gate('Remove Background');

  test('lifts the subject out of the image', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Remove Background');

    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    await setImage(page, file);
    await panel.getByRole('combobox').first().selectOption('cutout');

    // /v1/vision/subject-mask is the one endpoint that answers 400 when the
    // image has no foreground subject. With a real photo that is a genuine
    // failure; with the generated stand-in it is a documented outcome.
    try {
      await tolerateUnavailable(async () => {
        await runPanelAction(page, 'Lift subject');
        await expect(panel.getByAltText('Subject cutout')).toBeVisible();
        await expect(panel.getByRole('link', { name: 'Download PNG' })).toBeVisible();
      });
    } catch (error) {
      const message = ((await panelError(page).first().textContent()) ?? '').trim();
      if (!isReal && /bad_request|no subject|400/i.test(message)) {
        test.skip(
          true,
          `no foreground subject in the generated fixture — 400 is the documented response (${message}). Supply fixtures/human/person.jpg to test this properly.`,
        );
      }
      throw error;
    }
  });
});

test.describe('Person Mask', () => {
  gate('Person Mask');

  test('segments people from the image', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Person Mask');

    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    test.skip(
      !isReal,
      'person segmentation needs a real photo of a person — supply fixtures/human/person.jpg',
    );

    await setImage(page, file);
    await panel.getByRole('combobox').first().selectOption('balanced');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Segment people');
      await expect(panel.getByAltText('Person segmentation mask')).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Person mask' })).toBeVisible();
    });
  });
});
