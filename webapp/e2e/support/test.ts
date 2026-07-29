import { test as base, expect } from '@playwright/test';
import { phone, skipReason } from './phone.ts';
import { PanelSkip } from './console.ts';

export interface ConnectionSeed {
  baseUrl: string;
  token: string;
  /** Panel id to preselect; defaults to the app's own default ('chat'). */
  panel?: string;
}

/**
 * Every test gets a fresh BrowserContext, which is the only reliable reset:
 * a new context starts with empty localStorage *and* empty IndexedDB, and the
 * console persists input/results across both.
 *
 * The connection is seeded before any app script runs, so ConnectionProvider's
 * mount-time auto-connect uses the right address and the page is Online by the
 * time `goto` settles.
 */
export const test = base.extend<{ connection: ConnectionSeed }>({
  connection: [
    async ({}, use) => {
      await use({ baseUrl: phone.baseUrl, token: phone.token });
    },
    { option: true },
  ],

  context: async ({ context, connection }, use) => {
    await context.addInitScript((seed: ConnectionSeed) => {
      // ConnectionContext.tsx writes these two RAW via localStorage.setItem.
      localStorage.setItem('sidecar.baseUrl', seed.baseUrl);
      if (seed.token) localStorage.setItem('sidecar.token', seed.token);
      // usePersistentState keys are JSON-encoded — the quotes are load-bearing.
      if (seed.panel) localStorage.setItem('sidecar.panel', JSON.stringify(seed.panel));
    }, connection);
    await use(context);
  },
});

export { expect };

/**
 * Skips the enclosing describe, quoting the phone's own reason, when the device
 * cannot do the thing. Call at describe scope.
 *
 * The check is deferred into a beforeEach on purpose: Playwright builds the
 * test tree before globalSetup runs, so evaluating the capability at describe
 * scope would read an empty probe and gate nothing.
 */
export function gate(panelTitle: string): void {
  test.beforeEach(() => {
    const reason = skipReason(panelTitle);
    test.skip(reason !== null, reason ?? '');
  });
}

/** Same deferral, for conditions other than capability gating. */
export function skipWhen(condition: () => boolean, reason: string): void {
  test.beforeEach(() => {
    test.skip(condition(), reason);
  });
}

/**
 * Records that a test verified the request/response round trip but could not
 * prove the feature semantically — typically because the fixture is generated
 * rather than a real photo. The reporter renders these as PASS*, so a green run
 * never overstates what was actually checked.
 */
export function markStructural(reason: string): void {
  test.info().annotations.push({ type: 'structural', description: reason });
}

/**
 * Wraps a panel body so a 503 from the phone becomes a skip rather than a
 * failure. Anything else propagates.
 */
export async function tolerateUnavailable(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    if (error instanceof PanelSkip) test.skip(true, error.message);
    else throw error;
  }
}
