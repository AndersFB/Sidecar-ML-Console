import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Streaming updates state once per SSE token, and every write re-serializes
 * the whole value — so writes are batched to at most one per interval and
 * flushed on pagehide/hidden/unmount, which keeps reload-survival intact.
 */
const WRITE_DELAY_MS = 250;

/**
 * Drop-in useState that survives reloads: the initial value comes from
 * localStorage (JSON-encoded under `key`) and changes are written back,
 * batched. Falls back to `initial` on missing/corrupt entries or unavailable
 * storage.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      // corrupt entry or storage unavailable — use the default
    }
    return initial;
  });

  const pendingRef = useRef<{ key: string; value: T } | null>(null);
  const timerRef = useRef<number | null>(null);
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      localStorage.setItem(pending.key, JSON.stringify(pending.value));
    } catch {
      // storage full/unavailable — state still works, it just won't persist
    }
  };

  useEffect(() => {
    pendingRef.current = { key, value };
    if (timerRef.current === null) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        flushRef.current();
      }, WRITE_DELAY_MS);
    }
  }, [key, value]);

  useEffect(() => {
    const flush = () => flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  return [value, setValue];
}
