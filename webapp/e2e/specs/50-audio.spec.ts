import { test, expect, gate, markStructural, tolerateUnavailable } from '../support/test.ts';
import {
  openPanel,
  readIdbBlob,
  runPanelAction,
  setAudio,
  waitForIdbKey,
  waitForOnline,
} from '../support/console.ts';
import { generated, human, toUpload } from '../support/media.ts';
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

test.describe('Speak', () => {
  gate('Speak');

  test('synthesises audio on the phone', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Speak');

    await panel.getByLabel('Text to speak').fill(SPOKEN_PHRASE);
    if (phone.voices.length) {
      await panel.getByLabel('Voice').selectOption(phone.voices[0].identifier);
    }

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Synthesize');

      await expect(panel.getByRole('heading', { name: /^Generated \d+\.\d+s of audio$/ })).toBeVisible();
      await expect(panel.locator('audio[controls]')).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Download WAV' })).toBeVisible();

      const duration = await panel.locator('audio').evaluate(
        (el: HTMLAudioElement) =>
          new Promise<number>((resolve) => {
            if (Number.isFinite(el.duration) && el.duration > 0) return resolve(el.duration);
            el.onloadedmetadata = () => resolve(el.duration);
            setTimeout(() => resolve(el.duration), 5_000);
          }),
      );
      // Non-zero is the real signal: 0/NaN means the phone returned an empty
      // or undecodable envelope. Don't pin a length — it varies by voice+rate.
      expect(duration).toBeGreaterThan(0);
    });
  });
});

test.describe('Transcribe', () => {
  gate('Transcribe');

  test('round-trips the phone\'s own speech back to text', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);

    // Prefer audio the phone just generated in this browser session: it makes
    // this a true speak -> transcribe round trip rather than a replay.
    let audio = generated('speech-en.wav');
    const speakGate = phone.capabilities.find((c) => c.id === 'speech-speak');
    if (speakGate?.available) {
      const speak = await openPanel(page, 'Speak');
      await speak.getByLabel('Text to speak').fill(SPOKEN_PHRASE);
      await runPanelAction(page, 'Synthesize');
      await waitForIdbKey(page, 'sidecar.speak.audio');
      const buffer = await readIdbBlob(page, 'sidecar.speak.audio');
      if (buffer?.length) audio = toUpload('speech.wav', 'audio/wav', buffer);
    }

    const panel = await openPanel(page, 'Transcribe');
    await setAudio(page, audio);
    await panel.getByLabel('Locale').fill('en-US');

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Transcribe');

      await expect(panel.getByRole('heading', { name: /^Transcript \(en-US\)$/ })).toBeVisible();
      const transcript = ((await panel
        .getByRole('heading', { name: /^Transcript \(en-US\)$/ })
        .locator('xpath=../..')
        .textContent()) ?? '').trim();

      expect(transcript, 'the phone transcribed silence').not.toContain('(silence)');

      const overlap = wordOverlap(SPOKEN_PHRASE, transcript);
      expect(
        overlap,
        `transcript "${transcript}" shares only ${(overlap * 100).toFixed(0)}% of the spoken words`,
      ).toBeGreaterThan(0.5);
    });
  });
});

test.describe('Sound Events', () => {
  gate('Sound Events');

  test('classifies sounds across a timeline', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Sound Events');

    await setAudio(page, generated('speech-en.wav'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Detect sounds');

      await expect(
        panel.getByRole('heading', { name: /^Top sounds across \d+\.\d+s$/ }),
      ).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Timeline' })).toBeVisible();
      markStructural('asserts the timeline renders, not which labels the phone chose');
    });
  });
});

test.describe('Song ID', () => {
  gate('Song ID');

  test('matches a song, or honestly reports no match', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Song ID');

    const song = human('music.m4a');
    await setAudio(page, song ?? generated('speech-en.wav'));

    await tolerateUnavailable(async () => {
      await runPanelAction(page, 'Identify song');

      const match = panel.getByRole('heading', { name: 'Match' });
      const noMatch = panel.getByText('No match found.');

      if (song) {
        // A real recording should match; Shazam is the one route that leaves
        // the device, so a miss here is worth seeing.
        await expect(match).toBeVisible();
      } else {
        // {"matched": false} at 200 is a normal answer for speech.
        await expect(match.or(noMatch).first()).toBeVisible();
        markStructural('no music clip supplied — "No match found." is the expected 200');
      }
    });
  });
});
