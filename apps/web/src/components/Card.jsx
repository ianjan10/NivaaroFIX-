import React from 'react';

/**
 * Shared Card Component for NivaaroFix Design System.
 * 
 * Features:
 * - Subtle raised elevation: 1px neutral border at ~8% opacity + layered soft shadow.
 * - Interactive micro-interactions: lift and bubble behavior on hover/press.
 * - Flat container variant to eliminate white-on-white nesting collisions.
 * - Zero added color (pure shadow & neutral border separation).
 * - Automatic dark mode support (lighter card surface + deeper black shadow).
 */
export default function Card({
  as: Component = 'div',
  children,
  interactive = false,
  flat = false,
  className = '',
  onClick,
  ...props
}) {
  const isClickable = interactive || Boolean(onClick);
  const classes = [
    'nivaaro-card',
    isClickable ? 'interactive' : '',
    flat ? 'flat' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component
      className={classes}
      onClick={onClick}
      {...(isClickable && Component !== 'button' ? { role: 'button', tabIndex: 0 } : {})}
      {...props}
    >
      {children}
    </Component>
  );
}
