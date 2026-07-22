import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { idbGet, idbSet } from './idb';

/**
 * Drop-in useState that survives reloads via IndexedDB — for values
 * localStorage can't hold (Files, Blobs, large results). The stored value is
 * hydrated once after mount; every later change is written back.
 *
 * `revive` maps the raw stored value before use — e.g. to rebuild an object
 * URL for a stored File, since blob: URLs die with the page.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  revive?: (stored: T) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  // Writes are held until hydration resolves, so the initial value can't
  // overwrite the stored one; a user change before that wins over the store.
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  // Hydration itself must not echo back into the store — values here can be
  // multi-MB Files/results, and re-writing them on every page load is pure
  // structured-clone I/O.
  const skipWriteRef = useRef(false);
  const reviveRef = useRef(revive);
  reviveRef.current = revive;

  useEffect(() => {
    let cancelled = false;
    void idbGet<T>(key).then((stored) => {
      if (cancelled) return;
      if (stored !== undefined && !dirtyRef.current) {
        skipWriteRef.current = true;
        setValue(reviveRef.current ? reviveRef.current(stored) : stored);
      }
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    void idbSet(key, value);
  }, [key, value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    dirtyRef.current = true;
    hydratedRef.current = true;
    // A real change always writes, even if hydration queued a skip.
    skipWriteRef.current = false;
    setValue(action);
  }, []);

  return [value, set];
}
