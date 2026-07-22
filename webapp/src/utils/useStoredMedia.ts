import { useCallback, useEffect, useState } from 'react';
import { useStoredState } from './useStoredState';

/**
 * Media results are stored as Blobs and rendered through object URLs. The
 * previous approach kept multi-MB base64 data-URLs alive three times over —
 * in React state, in IndexedDB, and inside DOM src/href attributes.
 *
 * Stored values may also be strings: legacy records written as data-URLs
 * before this hook existed. They render as-is and get replaced by Blobs the
 * next time the panel stores a result.
 */
type StoredMedia = Blob | string;

function toUrl(media: StoredMedia): string {
  return media instanceof Blob ? URL.createObjectURL(media) : media;
}

function releaseUrl(media: StoredMedia, url: string): void {
  if (media instanceof Blob) URL.revokeObjectURL(url);
}

/** A single stored media result (image or audio) exposed as a URL. */
export function useStoredMediaUrl(
  key: string,
): [string | null, (blob: Blob | null) => void] {
  const [stored, setStored] = useStoredState<StoredMedia | null>(key, null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (stored === null) {
      setUrl(null);
      return undefined;
    }
    const next = toUrl(stored);
    setUrl(next);
    return () => releaseUrl(stored, next);
  }, [stored]);

  const setMedia = useCallback((blob: Blob | null) => setStored(blob), [setStored]);
  return [url, setMedia];
}

/** A list of stored media results exposed as URLs (e.g. generated images). */
export function useStoredMediaUrls(key: string): [string[], (blobs: Blob[]) => void] {
  const [stored, setStored] = useStoredState<StoredMedia[]>(key, []);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const next = stored.map(toUrl);
    setUrls(next);
    return () => {
      stored.forEach((media, index) => releaseUrl(media, next[index]));
    };
  }, [stored]);

  const setMedia = useCallback((blobs: Blob[]) => setStored(blobs), [setStored]);
  return [urls, setMedia];
}
