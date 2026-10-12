import React from 'react';

/**
 * Shared Button Component for NivaaroFix Design System.
 * 
 * Supports:
 * - Variants: 'outline' (default brand green outline), 'primary' (solid green),
 *   'secondary' (neutral outline/surface), 'destructive' (red alert), 'ghost' (borderless).
 * - Sizes: 'sm', 'md' (standard 38-40px), 'lg'.
 * - Full accessibility: focus-visible, hover, and pressed (active) states.
 */
export default function Button({
  children,
  variant = 'outline',
  size = 'md',
  type = 'button',
  disabled = false,
  className = '',
  onClick,
  ...props
}) {
  const variantClass = {
    outline: 'btn-outline-brand',
    'outline-brand': 'btn-outline-brand',
    primary: 'btn-primary-brand',
    secondary: 'btn-secondary-neutral',
    ghost: 'btn-ghost-neutral',
    danger: 'btn-destructive-action',
    destructive: 'btn-destructive-action'
  }[variant] || 'btn-outline-brand';

  const sizeClass = {
    sm: 'btn-size-sm',
    md: 'btn-size-md',
    lg: 'btn-size-lg'
  }[size] || 'btn-size-md';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`app-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
