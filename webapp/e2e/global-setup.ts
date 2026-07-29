import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, summarise } from './support/preflight.ts';
import { buildFixtures } from './fixtures/build-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS = path.join(here, '.artifacts');
export const PHONE_JSON = path.join(ARTIFACTS, 'phone.json');

/**
 * Runs once, before any worker starts a browser. Two jobs: fail fast on an
 * unreachable phone, and capture the device's own view of itself so every
 * later skip can quote the phone's reason verbatim.
 */
export default async function globalSetup() {
  mkdirSync(ARTIFACTS, { recursive: true });

  const result = await probe();
  console.log(`\n${summarise(result)}\n`);

  writeFileSync(PHONE_JSON, JSON.stringify(result, null, 2));
  writeFileSync(
    path.join(ARTIFACTS, 'capabilities.json'),
    JSON.stringify(result.capabilities, null, 2),
  );

  // Fixtures are cheap to rebuild and stale ones cause confusing failures.
  await buildFixtures({ baseUrl: result.baseUrl, token: result.token, log: console.log });
}
