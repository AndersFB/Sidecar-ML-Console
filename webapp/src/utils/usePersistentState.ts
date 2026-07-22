import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Drop-in useState that survives reloads: the initial value comes from
 * localStorage (JSON-encoded under `key`) and every change is written back.
 * Falls back to `initial` on missing/corrupt entries or unavailable storage.
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

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full/unavailable — state still works, it just won't persist
    }
  }, [key, value]);

  return [value, setValue];
}
