import React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function ScrollRevealSection({ children, className = '', as = 'div', ...props }) {
  const ref = useScrollReveal();
  const Component = as;

  return (
    <Component ref={ref} className={`scroll-reveal-section ${className}`} {...props}>
      {children}
    </Component>
  );
}
