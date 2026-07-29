import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const generated = path.join(here, 'e2e/fixtures/generated');

/**
 * Some environments (containers, CI images) ship a prebuilt Chromium that does
 * not match this Playwright release's expected revision. Point
 * SIDECAR_E2E_CHROMIUM at that binary instead of downloading a second copy.
 */
const executablePath = process.env.SIDECAR_E2E_CHROMIUM || undefined;

/**
 * Chrome can gate localhost -> 192.168.x.x behind Private/Local Network Access.
 * The phone already sends Access-Control-Allow-Private-Network, but the flags
 * keep older/newer channels consistent. Harmless where the feature is absent.
 */
const NETWORK_ARGS = [
  '--disable-features=BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks',
];

const FAKE_MEDIA_ARGS = [
  ...NETWORK_ARGS,
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-capture',
  `--use-file-for-fake-video-capture=${path.join(generated, 'webcam.y4m')}`,
  `--use-file-for-fake-audio-capture=${path.join(generated, 'speech-48k.wav')}`,
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/.artifacts/test-results',
  globalSetup: './e2e/global-setup.ts',

  // The phone serialises chat/speech/sound/shazam/image-gen at 1 concurrent
  // request and vision at 2, and queues the rest server-side rather than
  // rejecting. Parallel workers would just blow client timeouts.
  fullyParallel: false,
  workers: 1,
  retries: 1,

  // The server's own ceiling is 120 s; leave room for upload + render on top.
  timeout: 180_000,
  expect: { timeout: 30_000 },

  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/.artifacts/results.json' }],
    ['html', { open: 'never', outputFolder: 'e2e/.artifacts/html' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/40-live-camera.spec.ts', '**/85-singlefile.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath, args: NETWORK_ARGS },
      },
    },
    {
      // Only this project gets a fake camera/mic, so a dropzone test can never
      // accidentally acquire a real stream.
      name: 'chromium-fakemedia',
      testMatch: '**/40-live-camera.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: { executablePath, args: FAKE_MEDIA_ARGS },
      },
    },
    {
      // The released single-file console, opened from disk. No baseURL: the
      // spec navigates to a file:// URL.
      name: 'singlefile',
      testMatch: '**/85-singlefile.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: undefined,
        launchOptions: { executablePath, args: NETWORK_ARGS },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: here,
  },
});
