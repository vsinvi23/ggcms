import { useEffect, useRef } from 'react';

/** Calls onVisible once, the first time the element is at least half visible. */
export const useImpression = <T extends Element>(onVisible: () => void) => {
  const ref = useRef<T>(null);
  const callback = useRef(onVisible);

  useEffect(() => {
    callback.current = onVisible;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          callback.current();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
};
