import { useCallback } from 'react';

/**
 * useFormAutoScroll
 * Custom React hook for guiding smooth downward scroll progression across form fields.
 */
export function useFormAutoScroll() {
  const smoothScrollTo = useCallback((target) => {
    if (!target) return;
    
    let el = target;
    if (typeof target === 'string') {
      el = document.querySelector(target);
    } else if (target && target.current) {
      el = target.current;
    }

    if (el && typeof el.scrollIntoView === 'function') {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
  }, []);

  return { smoothScrollTo };
}
