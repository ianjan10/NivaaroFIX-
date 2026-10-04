import React from 'react';

/**
 * BrandLogo
 * Official NivaaroFix Brand Identity featuring the authentic metallic golden house & infinity-tools
 * emblem and refined typography ("NIVAAROFIX - BEYOND THE FIX").
 */
export default function BrandLogo({
  className = '',
  size = 'medium',
  variant = 'horizontal', // 'horizontal' | 'stacked' | 'emblem'
  isPartner = false,
  isDarkHeader = false,
  onClick
}) {
  const logoHeights = {
    small: { height: 30, maxW: 165 },
    medium: { height: 40, maxW: 215 },
    large: { height: 54, maxW: 285 }
  };

  const currentSize = logoHeights[size] || logoHeights.medium;

  let imageSrc = '/brand/logo-horizontal.png';
  if (variant === 'stacked') {
    imageSrc = '/brand/logo-stacked.png';
  } else if (variant === 'emblem') {
    imageSrc = '/brand/logo-emblem.png';
  }

  const handleLogoClick = (e) => {
    if (onClick) {
      onClick(e);
      return;
    }
    try {
      const agentRaw = localStorage.getItem('nivaaro-agent');
      const userRaw = localStorage.getItem('nivaaro-user');
      if (agentRaw) {
        window.location.href = `http://localhost:5173?agent=${encodeURIComponent(agentRaw)}&view=home#home`;
      } else if (userRaw) {
        window.location.href = `http://localhost:5173?user=${encodeURIComponent(userRaw)}&view=home#home`;
      } else {
        window.location.href = 'http://localhost:5173/#/';
      }
    } catch (_) {
      window.location.href = 'http://localhost:5173/#/';
    }
  };

  return (
    <div
      className={`brand-logo-wrapper ${className}`}
      onClick={handleLogoClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleLogoClick(e);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        cursor: 'pointer',
        textDecoration: 'none',
        userSelect: 'none',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease'
      }}
      aria-label="NivaaroFix Home"
    >
      <img
        src={imageSrc}
        alt="NivaaroFix — Beyond The Fix"
        className="brand-logo-img"
        style={{
          height: `${currentSize.height}px`,
          width: 'auto',
          maxWidth: `${currentSize.maxW}px`,
          display: 'block',
          objectFit: 'contain',
          filter: isDarkHeader ? 'brightness(1.18) contrast(1.05)' : 'none'
        }}
      />
    </div>
  );
}
