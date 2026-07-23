import { useEffect, useRef } from 'react';

/**
 * Calls `onClose` when the observed element stops being visible. Visited
 * panels stay mounted while hidden, so camera views need this to avoid
 * keeping the webcam live behind another panel.
 */
export function useCloseWhenHidden(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) onCloseRef.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
