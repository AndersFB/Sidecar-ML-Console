import { test, expect, gate, markStructural, tolerateUnavailable } from '../support/test.ts';
import {
  openPanel,
  readIdbBlob,
  runPanelAction,
  setAudio,
  setImage,
  waitForIdbKey,
  waitForOnline,
} from '../support/console.ts';
import { generated, photoOrGenerated } from '../support/media.ts';
import { SPOKEN_PHRASE } from '../fixtures/build-fixtures.mjs';
import { phone } from '../support/phone.ts';

/** Fraction of `expected`'s words that appear in `actual`. */
function wordOverlap(expected: string, actual: string): number {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const wanted = normalise(expected);
  const got = new Set(normalise(actual));
  if (!wanted.length) return 0;
  return wanted.filter((word) => got.has(word)).length / wanted.length;
}

/**
 * Both changers *alter* media rather than describing it, so the assertion that
 * actually proves the phone did the work is that the bytes came back different
 * from the bytes we sent. Every panel here stores its result as a Blob in
 * IndexedDB, which makes that comparison available without decoding audio.
 */
test.describe('Voice Changer', () => {
  gate('Voice Changer');

  test('transforms a clip into audio different from the source', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Voice Changer');

    // The preset table is the phone's, not the console's — applying one proves
    // the round trip and gives the effect something audible to do.
    const presets = panel.getByRole('group', { name: 'Presets' }).getByRole('button');
    await expect(presets.first()).toBeVisible();
    const giant = presets.filter({ hasText: /^Giant$/ });
    const chosen = (await giant.count()) ? giant.first() : presets.nth(1);
    const chosenName = ((await chosen.textContent()) ?? '').trim();
    await chosen.click();
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');

    const source = generated('speech-en.wav');
    await setAudio(page, source);

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Transform');

      await expect(panel.getByRole('heading', { name: 'Result' })).toBeVisible();
      await expect(panel.getByTestId('voicefx-result')).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Download WAV' })).toBeVisible();
      // The panel keeps the original alongside the result to compare against.
      await expect(panel.getByText('Original')).toBeVisible();

      await waitForIdbKey(page, 'sidecar.voicefx.result');
      const result = await readIdbBlob(page, 'sidecar.voicefx.result');

      expect(result, 'the console stored no result blob').not.toBeNull();
      expect(result!.length, 'the phone returned an empty envelope').toBeGreaterThan(44);
      expect(result!.subarray(0, 4).toString('ascii'), 'result is not a WAV').toBe('RIFF');
      expect(
        result!.equals(source.buffer),
        `"${chosenName}" returned the source unchanged — the effect chain did not run`,
      ).toBe(false);
    });
  });

  test('re-speaks a clip through a system voice', async ({ page }) => {
    // /v1/voice/respeak transcribes before it speaks, so it needs a speech model
    // even though voice-fx itself is plain DSP and always available. This gates
    // the one test rather than the panel — Transform needs no speech model.
    const installed = phone.transcribeLocales.installed;
    test.skip(
      !installed.some((locale) => locale.toLowerCase().startsWith('en')),
      `no en-* transcription model installed (installed: ${installed.join(', ') || 'none'})`,
    );

    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Voice Changer');

    await panel.getByRole('tab', { name: 'Re-speak' }).click();
    await setAudio(page, generated('speech-en.wav'));
    await panel.getByLabel('Locale').fill('en-US');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Re-speak');

      await expect(panel.getByRole('heading', { name: 'Re-spoken' })).toBeVisible();
      await expect(panel.locator('audio[controls]')).toBeVisible();

      // The transcript is JSON-path-only by design, so its presence also proves
      // the console read the envelope rather than just the audio bytes.
      const transcript = ((await panel
        .getByRole('heading', { name: 'Re-spoken' })
        .locator('xpath=../..')
        .textContent()) ?? '').trim();

      const overlap = wordOverlap(SPOKEN_PHRASE, transcript);
      expect(
        overlap,
        `re-spoken text "${transcript}" shares only ${(overlap * 100).toFixed(0)}% of the spoken words`,
      ).toBeGreaterThan(0.5);
    });
  });
});

test.describe('Face Changer', () => {
  gate('Face Changer');

  test('applies a phone preset and transforms a photo', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Face Changer');

    const presets = panel.getByRole('group', { name: 'Presets' }).getByRole('button');
    await expect(presets.first()).toBeVisible();
    const cartoon = presets.filter({ hasText: /^Cartoon$/ });
    const chosen = (await cartoon.count()) ? cartoon.first() : presets.nth(1);
    await chosen.click();
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');

    // Apple's landmark detector does not fire on drawn shapes, so a generated
    // fixture can only prove the round trip. A real portrait upgrades this to
    // an assertion that the phone actually found and reshaped a face.
    const { file, isReal } = photoOrGenerated('person.jpg', 'subject.png');
    await setImage(page, file);

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Transform');

      const found = panel.getByRole('heading', { name: /^\d+ face\(s\)$/ });
      const none = panel.getByRole('heading', { name: 'No face found — returned unchanged' });
      await expect(found.or(none).first()).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Download PNG' })).toBeVisible();
      // BeforeAfter stacks the result over the original for a wipe comparison.
      await expect(panel.getByAltText('Result')).toBeVisible();
      await expect(panel.getByAltText('Original')).toBeVisible();

      await waitForIdbKey(page, 'sidecar.facefx.resultImage');
      const result = await readIdbBlob(page, 'sidecar.facefx.resultImage');
      expect(result, 'the console stored no result image').not.toBeNull();
      expect(result!.length, 'the phone returned an empty envelope').toBeGreaterThan(0);

      if (isReal) {
        await expect(found).toBeVisible();
        expect(
          result!.equals(file.buffer),
          'the phone returned the photo unchanged despite finding a face',
        ).toBe(false);
      } else {
        // Zero faces is a documented 200, not a failure: the phone hands the
        // image back untouched so a client can say "no face found".
        markStructural('no real portrait supplied — face count and reshaping not asserted');
      }
    });
  });

  test('offers Transform and Live, and no swap mode', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Face Changer');

    // POST /v1/face/swap was removed from the app; the tab it backed must not
    // come back, and neither should the live stream's donor-photo controls.
    await expect(panel.getByRole('tab')).toHaveText(['Transform', 'Live']);
    await expect(panel.getByRole('tab', { name: /swap/i })).toHaveCount(0);
  });
});
