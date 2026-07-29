import { test, expect, gate, tolerateUnavailable } from '../support/test.ts';
import { activePanel, openPanel, runPanelAction, setImage, waitForOnline } from '../support/console.ts';
import { generated, photoOrGenerated } from '../support/media.ts';

test.describe('Classify', () => {
  gate('Classify');

  test('returns labels or an honest "nothing recognized"', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Classify');

    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    await setImage(page, file);

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Classify');

      await expect(panel.getByRole('heading', { name: 'Labels' })).toBeVisible();
      const labels = panel.getByRole('heading', { name: 'Labels' }).locator('xpath=../..').locator('li');

      if (isReal) {
        // A real photo should produce at least one classification.
        await expect(labels.first()).toBeVisible();
      } else {
        // Generated art may legitimately classify to nothing; both branches are
        // valid 200s, so this only proves the round trip.
        const count = await labels.count();
        const empty = await panel.getByText('Nothing confidently recognized.').count();
        expect(count + empty).toBeGreaterThan(0);
      }
    });
  });
});

test.describe('Image Similarity', () => {
  gate('Image Similarity');

  // A self-check that needs no real-world content: a near-duplicate must score
  // closer than an obviously different image.
  test('scores a near-duplicate closer than a different image', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Image Similarity');

    const readDistance = async (): Promise<number> => {
      const text =
        (await panel.getByRole('heading', { name: 'Result' }).locator('xpath=../..').textContent()) ?? '';
      const match = text.match(/(\d+\.\d+)/);
      expect(match, `no distance in "${text}"`).not.toBeNull();
      return Number(match![1]);
    };

    await setImage(page, generated('shapes-a.png'), 0);
    await setImage(page, generated('shapes-b.png'), 1);

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Compare');
      await expect(panel.getByRole('heading', { name: 'Result' })).toBeVisible();
      const near = await readDistance();

      await setImage(page, generated('different.png'), 1);
      await runPanelAction(page, 'Compare');
      await expect(activePanel(page).getByRole('heading', { name: 'Result' })).toBeVisible();
      const far = await readDistance();

      expect(
        near,
        `near-duplicate distance ${near} should be below the unrelated distance ${far}`,
      ).toBeLessThan(far);
    });
  });
});
