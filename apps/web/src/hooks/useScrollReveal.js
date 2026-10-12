import { useEffect, useRef } from 'react';

/**
 * Custom hook for smooth once-only scroll reveals.
 * Fades in and rises 8–12px into place as it enters the viewport.
 * Never loops or re-triggers on scroll-back.
 * Respects prefers-reduced-motion: reduce.
 */
export function useScrollReveal(options = { threshold: 0.15 }) {
  const elementRef = useRef(null);

  const threshold = options?.threshold ?? 0.15;
  const rootMargin = options?.rootMargin ?? '0px';

  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !elementRef.current) {
      if (elementRef.current) {
        elementRef.current.classList.add('is-revealed');
      }
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      if (elementRef.current) {
        elementRef.current.classList.add('is-revealed');
      }
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry && entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold, rootMargin });

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return elementRef;
}
