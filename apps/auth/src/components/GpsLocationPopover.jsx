import React, { useEffect, useRef } from 'react';

/**
 * Minimalist Glass Location Popover
 * - Anchored under the Service base address field on desktop/tablet.
 * - Sliding bottom sheet below 480px.
 * - Non-modal role="dialog" with aria-labelledby="pro-location-popover-title".
 * - Never steals focus from the textarea; reachable with Tab, closes with Esc.
 * - Live region for progress and status messages.
 * - 180ms fade and small rise on enter; 140ms fade on exit; prefers-reduced-motion fades only.
 * - Brand green accent (#0d824d), no emojis.
 */
export default function GpsLocationPopover({
  isOpen,
  isLoading,
  onAllow,
  onDismiss,
  statusMessage
}) {
  const popoverRef = useRef(null);

  // Close with Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="pro-location-popover-title"
      className="pro-location-popover"
    >
      <div className="pro-location-popover-inner">
        {/* Header with small location icon and Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(13, 130, 77, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '1px'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="#0d824d"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="22" y1="12" x2="18" y2="12" />
              <line x1="6" y1="12" x2="2" y2="12" />
              <line x1="12" y1="6" x2="12" y2="2" />
              <line x1="12" y1="22" x2="12" y2="18" />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="pro-location-popover-title"
              style={{
                margin: 0,
                fontSize: '0.96rem',
                fontWeight: 600,
                color: 'var(--text-primary, #111827)',
                lineHeight: 1.3
              }}
            >
              Use your current location?
            </h3>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.84rem',
                color: 'var(--text-secondary, #4b5563)',
                lineHeight: 1.4
              }}
            >
              We'll fill in your permanent address. You can edit it anytime.
            </p>
          </div>
        </div>

        {/* Loading / Finding progress line */}
        {isLoading && (
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '12px',
              padding: '6px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: '#0d824d', fontWeight: 500 }}>
              <span>{statusMessage || 'Finding your location'}</span>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(13, 130, 77, 0.25)',
                  borderTopColor: '#0d824d',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
            </div>
            <div
              style={{
                width: '100%',
                height: '3px',
                background: 'rgba(13, 130, 77, 0.15)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}
            >
              <div className="pro-location-progress-bar" />
            </div>
          </div>
        )}

        {/* Action Buttons: Primary 'Allow' and quiet 'Not now' (44px touch targets) */}
        {!isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '14px'
            }}
          >
            <button
              type="button"
              onClick={onAllow}
              className="pro-location-allow-btn"
              style={{
                minHeight: '44px',
                padding: '0 18px',
                borderRadius: '10px',
                background: '#0d824d',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s ease'
              }}
            >
              Allow
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="pro-location-dismiss-btn"
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '10px',
                background: 'transparent',
                color: 'var(--text-secondary, #4b5563)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s ease'
              }}
            >
              Not now
            </button>
          </div>
        )}

        {/* Muted privacy note */}
        <p
          style={{
            margin: '12px 0 0 0',
            fontSize: '0.76rem',
            color: 'var(--text-muted, #6b7280)',
            lineHeight: 1.35
          }}
        >
          Your address is saved securely to your profile.
        </p>
      </div>
    </div>
  );
}

