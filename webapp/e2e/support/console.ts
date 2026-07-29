import { expect, type Locator, type Page } from '@playwright/test';

/**
 * App.tsx keeps every *visited* panel mounted and hides it with the `hidden`
 * attribute, so stale DOM from earlier steps stays queryable forever: after
 * five panels, `Clear` matches five buttons. Every panel-scoped locator must
 * therefore derive from this.
 *
 * Layout is  main > div > { <header>, div[role=alert]*, div(hidden?)* }
 */
export function activePanel(page: Page): Locator {
  return page.locator('main > div > div:not([hidden]):not([role="alert"])');
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The connection status span reads "Online· Sidecar ML 1.0" (the version is a
 * nested span), so an exact-text match never fires. "Offline" does not contain
 * "Online" as a substring, so this stays unambiguous.
 */
export async function waitForOnline(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('aside form')).toContainText('Online', { timeout });
}

export async function waitForOffline(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('aside form')).toContainText('Offline', { timeout });
}

/**
 * Panels are reachable only by clicking the sidebar — the console has no
 * router, no hash and no query state.
 *
 * The name is matched with an anchored regex rather than `exact: true`: the
 * button contains a status dot <span title="Ready|<reason>|Unknown"> whose
 * title Chromium folds into the button's accessible name.
 */
export async function openPanel(page: Page, title: string): Promise<Locator> {
  await page
    .getByRole('navigation', { name: 'Capabilities' })
    .getByRole('button', { name: new RegExp(`^${escapeRe(title)}\\b`) })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
  await expect(activePanel(page)).toHaveCount(1);
  return activePanel(page);
}

/**
 * The file inputs are `hidden`; setInputFiles works on them by design.
 * An explicit mimeType is mandatory — the phone cannot decode WebM/Opus or Ogg,
 * and an inferred type is the single most common fixture failure.
 */
export async function setImage(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  nth = 0,
): Promise<void> {
  await activePanel(page).getByTestId('image-input').nth(nth).setInputFiles(file);
  await expect(activePanel(page).getByAltText('Selected input').nth(nth)).toBeVisible();
}

export async function setAudio(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await activePanel(page).getByTestId('audio-input').setInputFiles(file);
}

/** Any ErrorBanner rendered inside the visible panel (not the app-level ones). */
export function panelError(page: Page): Locator {
  return activePanel(page).locator('[role="alert"]');
}

export class PanelSkip extends Error {}

/**
 * Clicks a panel's action button and waits for it to settle, then classifies
 * whatever the phone said.
 *
 *  - busy / 429 / transient network -> retry (up to `attempts`)
 *  - 503 capability_unavailable     -> PanelSkip (device limitation, not a bug)
 *  - anything else                  -> throws (real failure)
 */
export async function runPanelAction(
  page: Page,
  buttonName: string,
  { attempts = 3, timeout = 180_000 }: { attempts?: number; timeout?: number } = {},
): Promise<void> {
  const panel = activePanel(page);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await panel.getByRole('button', { name: buttonName, exact: true }).click();

    // The action buttons disable themselves while busy; wait for the spinner
    // to appear-and-go rather than racing the first render.
    await expect(panel.locator('[role="status"]')).toHaveCount(0, { timeout });

    const errors = panel.locator('[role="alert"]');
    if ((await errors.count()) === 0) return;
    const message = ((await errors.first().textContent()) ?? '').trim();

    if (/busy|429|rate.?limit/i.test(message) || /failed to fetch|networkerror|aborted/i.test(message)) {
      if (attempt < attempts) {
        await page.waitForTimeout(2_000);
        continue;
      }
      throw new Error(`"${buttonName}" still failing after ${attempts} attempts: ${message}`);
    }
    if (/503|capability_unavailable/i.test(message)) throw new PanelSkip(message);
    if (/payload_too_large|413/i.test(message)) {
      throw new Error(`fixture too large (this is a test bug, not a phone bug): ${message}`);
    }
    throw new Error(`"${buttonName}" failed: ${message}`);
  }
}

/**
 * Waits for the assistant's reply to fill in, or for the panel to surface an
 * error — whichever happens first.
 *
 * Racing the two matters: on failure ChatPanel rolls the exchange back to one
 * bubble and shows an ErrorBanner, so waiting on a bubble count alone would sit
 * there until the test timeout instead of reporting what the phone said.
 *
 * A stream that ends with [DONE] is not automatically a pass either —
 * mid-stream failures arrive as a data:{"error"} frame and land in the banner.
 */
export async function awaitChatReply(page: Page, timeout = 180_000): Promise<string> {
  const panel = activePanel(page);
  const bubbles = panel.getByTestId('chat-transcript').locator('> div');
  const errors = panel.locator('[role="alert"]');

  await expect
    .poll(
      async () => {
        if (await errors.count()) return 'error';
        const texts = await bubbles.allTextContents();
        const reply = texts[texts.length - 1]?.trim() ?? '';
        // "▋" is the pending-token placeholder.
        if (texts.length >= 2 && reply && reply !== '▋') return 'done';
        return 'pending';
      },
      { timeout, intervals: [400] },
    )
    .not.toBe('pending');

  if (await errors.count()) {
    throw new Error(`chat failed: ${((await errors.first().textContent()) ?? '').trim()}`);
  }
  return ((await bubbles.last().textContent()) ?? '').trim();
}

/**
 * usePersistentState batches localStorage writes (WRITE_DELAY_MS = 250) and
 * flushes on pagehide/visibilitychange/unmount. Always settle past the debounce
 * before reloading, rather than trusting the pagehide flush to have run.
 */
export async function settlePersistence(page: Page): Promise<void> {
  await page.waitForTimeout(400);
}

/**
 * webapp/src/utils/idb.ts caches the open IDBDatabase for the page's lifetime,
 * so deleteDatabase() fires `onblocked` unless we navigate away first.
 */
export async function hardResetStorage(page: Page): Promise<void> {
  await page.goto('about:blank');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('sidecar-console');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      }),
  );
}

/** Reads a key out of the console's IndexedDB store from inside the page. */
export async function readIdbKey<T = unknown>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(
    (k) =>
      new Promise((resolve) => {
        const open = indexedDB.open('sidecar-console', 1);
        open.onerror = () => resolve(undefined);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('kv')) return resolve(undefined);
          const get = db.transaction('kv', 'readonly').objectStore('kv').get(k);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(undefined);
        };
      }),
    key,
  ) as Promise<T | undefined>;
}

/** Waits until a key exists in IndexedDB — use instead of sleeping before a reload. */
export async function waitForIdbKey(page: Page, key: string, timeout = 15_000): Promise<void> {
  await expect
    .poll(async () => (await readIdbKey(page, key)) !== undefined, { timeout })
    .toBe(true);
}

/** Pulls a stored Blob out of IndexedDB as a Buffer (used for the TTS round-trip). */
export async function readIdbBlob(page: Page, key: string): Promise<Buffer | null> {
  const base64 = await page.evaluate(
    (k) =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('sidecar-console', 1);
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('kv')) return resolve(null);
          const get = db.transaction('kv', 'readonly').objectStore('kv').get(k);
          get.onerror = () => resolve(null);
          get.onsuccess = () => {
            const value = get.result;
            if (!(value instanceof Blob)) return resolve(null);
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(value);
          };
        };
      }),
    key,
  );
  return base64 ? Buffer.from(base64, 'base64') : null;
}
