/**
 * Console logger for debugging the console ↔ phone connection.
 * Every line carries a "sidecar" badge so it can be filtered in DevTools.
 * Silenced under vitest to keep test output clean.
 */
const BADGE = '%csidecar';
const BADGE_STYLE =
  'background:#0e7490;color:#ecfeff;padding:1px 5px;border-radius:3px;font-weight:600';

const silent = import.meta.env.MODE === 'test';

function stamp(): string {
  return new Date().toLocaleTimeString(undefined, { hour12: false });
}

export const log = {
  info(...args: unknown[]): void {
    if (!silent) console.info(BADGE, BADGE_STYLE, stamp(), ...args);
  },
  warn(...args: unknown[]): void {
    if (!silent) console.warn(BADGE, BADGE_STYLE, stamp(), ...args);
  },
  error(...args: unknown[]): void {
    if (!silent) console.error(BADGE, BADGE_STYLE, stamp(), ...args);
  },
};
