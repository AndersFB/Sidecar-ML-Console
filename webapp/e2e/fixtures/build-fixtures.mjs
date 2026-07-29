/**
 * Builds every generated fixture into e2e/fixtures/generated/ (gitignored).
 *
 * Two sources, no binaries in git and no native image dependency:
 *   1. Chromium renders generator.html and screenshots elements by id.
 *   2. The phone itself synthesises speech (POST /v1/speech/speak), which the
 *      Transcribe spec then feeds back in — a genuine round trip rather than a
 *      canned blob.
 *
 * Human-supplied media (faces, bodies, hands, music) cannot be synthesised;
 * see fixtures/human/README.md. Panels needing it skip cleanly when absent.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { code39Html } from './code39.mjs';
import { decodeWav, encodeWav, resample, toneWav } from './wav.mjs';
import { rgbaToY4m } from './y4m.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED = path.join(here, 'generated');
export const HUMAN = process.env.SIDECAR_E2E_MEDIA_DIR || path.join(here, 'human');

/** Text rendered into the OCR fixture; the spec asserts this survives the round trip. */
export const OCR_TOKEN = 'INVOICE 12345';
/** Payload encoded into the Code 39 fixture. */
export const BARCODE_PAYLOAD = 'SIDECAR-E2E-2026';
/** Phrase sent to the phone's TTS and expected back from transcription. */
export const SPOKEN_PHRASE =
  'The quick brown fox jumps over the lazy dog near the river bank.';

const SHOTS = [
  { id: 'ocr', file: 'ocr-text.png', type: 'png' },
  { id: 'shapes-a', file: 'shapes-a.png', type: 'png' },
  { id: 'shapes-b', file: 'shapes-b.png', type: 'png' },
  { id: 'different', file: 'different.png', type: 'png' },
  { id: 'document', file: 'document-skew.jpg', type: 'jpeg' },
  { id: 'subject', file: 'subject.png', type: 'png' },
  { id: 'barcode', file: 'barcode-code39.png', type: 'png' },
];

/** Path to a human-supplied file, or null when it was not provided. */
export function humanFixture(name) {
  const full = path.join(HUMAN, name);
  return existsSync(full) ? full : null;
}

async function speakToWav(baseUrl, token, text) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/speech/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`POST /v1/speech/speak -> HTTP ${response.status}`);
  const envelope = await response.json();
  return Buffer.from(envelope.data_base64, 'base64');
}

/**
 * @param {object} [options]
 * @param {string} [options.baseUrl] Phone address; without it audio falls back to a tone.
 * @param {string} [options.token]
 * @param {(message: string) => void} [options.log]
 */
export async function buildFixtures({ baseUrl = '', token = '', log = () => {} } = {}) {
  mkdirSync(GENERATED, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.SIDECAR_E2E_CHROMIUM || undefined,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(`file://${path.join(here, 'generator.html')}`);

    await page.evaluate(
      ({ html, payload }) => {
        const host = document.getElementById('barcode');
        host.innerHTML = `${html}<div class="label">${payload}</div>`;
      },
      { html: code39Html(BARCODE_PAYLOAD), payload: BARCODE_PAYLOAD },
    );

    for (const shot of SHOTS) {
      const target = path.join(GENERATED, shot.file);
      await page.locator(`#${shot.id}`).screenshot({
        path: target,
        type: shot.type,
        ...(shot.type === 'jpeg' ? { quality: 92 } : {}),
      });
      log(`  fixture: ${shot.file}`);
    }

    // Fake webcam source. Prefer a real photo so the live-camera spec can make a
    // semantic assertion; fall back to the generated subject image, which still
    // proves the capture -> POST -> overlay loop runs.
    const webcamSource = humanFixture('person.jpg') ?? path.join(GENERATED, 'subject.png');
    const { rgba, width, height } = await page.evaluate(async (dataUrl) => {
      const canvas = document.getElementById('webcam-canvas');
      const context = canvas.getContext('2d');
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = dataUrl;
      });
      // Letterbox into 1280x720 so the aspect ratio survives.
      context.fillStyle = '#202030';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      const w = Math.floor((image.width * scale) / 2) * 2;
      const h = Math.floor((image.height * scale) / 2) * 2;
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      return {
        rgba: Array.from(data.data),
        width: canvas.width,
        height: canvas.height,
      };
    }, `data:image/${webcamSource.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(webcamSource).toString('base64')}`);

    writeFileSync(
      path.join(GENERATED, 'webcam.y4m'),
      rgbaToY4m(Uint8Array.from(rgba), width, height),
    );
    log(`  fixture: webcam.y4m (from ${path.basename(webcamSource)})`);

    await page.close();
  } finally {
    await browser.close();
  }

  // Audio, bootstrapped from the phone so the speech tests are a real round trip.
  const speechPath = path.join(GENERATED, 'speech-en.wav');
  let speech;
  try {
    speech = await speakToWav(baseUrl, token, SPOKEN_PHRASE);
    writeFileSync(speechPath, speech);
    log('  fixture: speech-en.wav (synthesised by the phone)');
  } catch (error) {
    speech = toneWav();
    writeFileSync(speechPath, speech);
    log(`  fixture: speech-en.wav FALLBACK tone — TTS unavailable (${String(error)})`);
  }

  // Chromium's fake microphone wants 48 kHz.
  try {
    const { sampleRate, samples } = decodeWav(speech);
    writeFileSync(
      path.join(GENERATED, 'speech-48k.wav'),
      encodeWav(resample(samples, sampleRate, 48_000), 48_000),
    );
    log('  fixture: speech-48k.wav');
  } catch (error) {
    writeFileSync(path.join(GENERATED, 'speech-48k.wav'), toneWav(3, 48_000));
    log(`  fixture: speech-48k.wav FALLBACK tone (${String(error)})`);
  }
}

// Allow `npm run e2e:fixtures` without the suite.
if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.env.SIDECAR_URL?.replace(/\/+$/, '') ?? '';
  if (!baseUrl) console.warn('SIDECAR_URL not set — audio fixtures will fall back to a tone.');
  await buildFixtures({ baseUrl, token: process.env.SIDECAR_TOKEN ?? '', log: console.log });
  console.log(`Fixtures written to ${GENERATED}`);
}
