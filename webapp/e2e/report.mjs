/**
 * Turns the Playwright JSON result + the phone probe into the markdown table
 * the runbook asks the operator (or agent) to report.
 *
 * Distinguishes four outcomes, because "green" alone would overstate what was
 * actually proved:
 *   PASS   — asserted semantically
 *   PASS*  — round trip verified, semantics not provable with the fixture used
 *   SKIP   — the device cannot do it; the phone's own reason is quoted
 *   FAIL   — a real defect
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(here, '.artifacts');

/** Playwright colourises error messages; the table must stay plain text. */
// eslint-disable-next-line no-control-regex
const stripAnsi = (value) => String(value ?? '').replace(/\[[0-9;]*m/g, '');

function readJson(file) {
  const full = path.join(ARTIFACTS, file);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, 'utf8'));
}

function* walkSuites(suites, trail = []) {
  for (const suite of suites ?? []) {
    const next = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) yield { spec, trail: next };
    yield* walkSuites(suite.suites, next);
  }
}

const results = readJson('results.json');
const phone = readJson('phone.json');

if (!results) {
  console.error('No e2e/.artifacts/results.json — run `npm run e2e` first.');
  process.exit(1);
}

const rows = [];
for (const { spec, trail } of walkSuites(results.suites)) {
  // Newest run of each spec.
  const test = spec.tests?.[spec.tests.length - 1];
  const result = test?.results?.[test.results.length - 1];
  if (!result) continue;

  const annotations = [...(test.annotations ?? []), ...(result.annotations ?? [])];
  const structural = annotations.find((a) => a.type === 'structural');
  const note = annotations.find((a) => a.type === 'note');

  let status;
  let detail = '';
  if (result.status === 'skipped') {
    status = 'SKIP';
    detail =
      annotations.find((a) => a.type === 'skip')?.description ||
      result.error?.message ||
      'skipped';
  } else if (result.status === 'passed') {
    status = structural ? 'PASS*' : 'PASS';
    detail = structural?.description ?? note?.description ?? '';
  } else {
    status = 'FAIL';
    detail = (result.error?.message ?? 'failed').split('\n')[0];
  }

  rows.push({
    group: trail.filter(Boolean).slice(1).join(' › ') || trail.join(' › '),
    title: spec.title,
    status,
    detail: stripAnsi(detail).replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 160),
    duration: result.duration ? `${(result.duration / 1000).toFixed(1)}s` : '–',
  });
}

const tally = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
const order = { FAIL: 0, 'PASS*': 1, SKIP: 2, PASS: 3 };
rows.sort((a, b) => (order[a.status] - order[b.status]) || a.group.localeCompare(b.group));

const lines = ['## Sidecar ML Console — E2E smoke', ''];
if (phone) {
  lines.push(
    `Phone: ${phone.health.app} ${phone.health.version} @ ${phone.baseUrl} (up ${phone.health.uptime_s}s)`,
  );
  const unavailable = phone.capabilities.filter((c) => !c.available);
  lines.push(
    `Capabilities: ${phone.capabilities.length - unavailable.length}/${phone.capabilities.length} available` +
      (unavailable.length ? ` — unavailable: ${unavailable.map((c) => c.id).join(', ')}` : ''),
  );
  lines.push(`Probed at: ${phone.reachedAt}`);
}
lines.push(
  '',
  `Result: ${tally.PASS ?? 0} pass · ${tally['PASS*'] ?? 0} pass* · ${tally.SKIP ?? 0} skip · ${tally.FAIL ?? 0} fail`,
  '',
  '| Area | Test | Status | Detail | Time |',
  '|---|---|---|---|---|',
);
for (const row of rows) {
  lines.push(`| ${row.group} | ${row.title} | ${row.status} | ${row.detail} | ${row.duration} |`);
}
lines.push(
  '',
  'PASS* = the request/response round trip was verified, but the fixture could not prove the feature semantically (usually: no real photo supplied).',
  '',
  `Artifacts: webapp/e2e/.artifacts/{html/,results.json,test-results/}`,
  'Trace for a failure: npx playwright show-trace webapp/e2e/.artifacts/test-results/<test>/trace.zip',
);

console.log(lines.join('\n'));
process.exit(tally.FAIL ? 1 : 0);
