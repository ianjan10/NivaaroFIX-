import React from 'react';
import Logo from './Logo';

/**
 * BrandLogo
 * Official NivaaroFix Brand Identity featuring the handcrafted architectural shelter & monogram
 * and refined typography ("NIVAAROFIX — Elevating the Everyday").
 */
export default function BrandLogo({
  className = '',
  size = 'medium',
  variant = 'horizontal', // 'horizontal' | 'horizontal-tagline' | 'stacked' | 'full' | 'emblem' | 'mark'
  isPartner = false,
  isDarkHeader = false,
  onClick
}) {
  const normalizedVariant = (variant === 'stacked' || variant === 'full')
    ? 'full'
    : (variant === 'horizontal-tagline')
      ? 'horizontal-tagline'
      : (variant === 'emblem')
        ? 'emblem'
        : (variant === 'mark')
          ? 'mark'
          : 'horizontal';

  const handleLogoClick = (e) => {
    if (onClick) {
      onClick(e);
      return;
    }
    try {
      window.location.hash = '#/';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (_) {
      window.location.href = '/#/';
    }
  };

  return (
    <div
      className={`brand-logo-wrapper ${className}`}
      onClick={handleLogoClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'pointer',
        textDecoration: 'none'
      }}
    >
      <Logo
        variant={normalizedVariant}
        tone={isDarkHeader ? 'light' : 'dark'}
        size={size}
        isPartner={isPartner}
        alt="NivaaroFix — Elevating the Everyday"
        onClick={handleLogoClick}
      />
    </div>
  );
}
