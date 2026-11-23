import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * AccountNotFoundModal
 *
 * Refined glass dialog / mobile bottom-sheet shown when a user enters non-existent credentials.
 * Features:
 * - App font inherited at 16px, weight 600 for buttons
 * - Close (X) button in card's top-right corner (36px circle, 16px inset, ghost hover fill)
 * - Padding 28px desktop / 24px mobile; title to text 8px; text to buttons 24px; buttons 12px apart
 * - Identifier in medium weight with overflow-wrap: anywhere and text-wrap: balance
 * - Glass surface: rgba(255, 255, 255, 0.82), blur(24px) saturate(140%), 1px border, 24px radius
 * - Scrim backdrop: rgba(10, 20, 16, 0.32), blur(6px)
 * - Primary button focused on open; focus trapped; returns to opener on dismiss
 * - Enter: 200ms scale (.96 to 1) + rise; Exit: 150ms reverse; reduced-motion: fade only
 * - Mobile <= 480px: Bottom sheet with drag handle, swipe-down dismiss, safe-area padding
 */
export default function AccountNotFoundModal({
  isOpen,
  role = 'customer',
  identifier = '',
  onRedirectToSignUp,
  onClose
}) {
  const modalRef = useRef(null);
  const openerRef = useRef(null);
  const primaryBtnRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  const cleanIdentifier = String(identifier || '').trim();
  const isPhone = !cleanIdentifier.includes('@') && /^\+?[0-9\s-]{5,15}$/.test(cleanIdentifier);
  const secondaryLabel = isPhone ? 'Use a different number' : 'Use a different email';

  // Smooth closing with 150ms exit animation
  const handleDismiss = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setDragY(0);
    }, 150);
  }, [isClosing, onClose]);

  // Focus management: save opener, focus primary button on open, restore on close
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setDragY(0);
      openerRef.current = document.activeElement;
      const timer = setTimeout(() => {
        if (primaryBtnRef.current) {
          primaryBtnRef.current.focus();
        } else if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (openerRef.current) {
      try {
        openerRef.current.focus();
      } catch (_) {}
    }
  }, [isOpen]);

  // Focus trap & Escape key
  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing, handleDismiss]);

  // Swipe-down gesture for mobile bottom sheet
  const handleTouchStart = (e) => {
    if (window.innerWidth > 480) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (window.innerWidth > 480) return;
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (window.innerWidth > 480) return;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 70) {
      handleDismiss();
    }
    setDragY(0);
  };

  if (!isOpen) return null;

  const handleCreateAccount = () => {
    try {
      if (cleanIdentifier) {
        sessionStorage.setItem('nivaarofix_signup_prefill', JSON.stringify({
          value: cleanIdentifier,
          type: isPhone ? 'phone' : 'email'
        }));
      }
    } catch (_) {}

    if (onRedirectToSignUp) {
      onRedirectToSignUp(cleanIdentifier, isPhone ? 'phone' : 'email');
    }
    handleDismiss();
  };

  return (
    <div
      className={`anf-modal-backdrop ${isClosing ? 'anf-backdrop-exit' : ''}`}
      onClick={handleDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 20, 16, 0.32)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-not-found-title"
        className={`anf-modal-card ${isClosing ? 'anf-card-exit' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '440px',
          maxHeight: 'min(92vh, 92dvh)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          margin: 'auto',
          boxSizing: 'border-box',
          outline: 'none',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : undefined
        }}
      >
        <style>{`
          /* Keyframe Animations */
          @keyframes anfFadeRise {
            0% {
              opacity: 0;
              transform: translateY(8px) scale(0.96);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes anfFadeExit {
            0% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
            100% {
              opacity: 0;
              transform: translateY(8px) scale(0.96);
            }
          }
          @keyframes anfBackdropFadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes anfBackdropFadeOut {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes anfSheetSlideUp {
            0% {
              opacity: 0;
              transform: translateY(100%);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes anfSheetSlideDown {
            0% {
              opacity: 1;
              transform: translateY(0);
            }
            100% {
              opacity: 0;
              transform: translateY(100%);
            }
          }

          .anf-modal-backdrop {
            animation: anfBackdropFadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .anf-modal-backdrop.anf-backdrop-exit {
            animation: anfBackdropFadeOut 150ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }

          .anf-modal-card {
            background: rgba(255, 255, 255, 0.82);
            backdrop-filter: blur(24px) saturate(140%);
            -webkit-backdrop-filter: blur(24px) saturate(140%);
            border: 1px solid rgba(255, 255, 255, 0.55);
            border-radius: 24px;
            box-shadow: 0 8px 32px rgba(16, 32, 26, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.60);
            padding: 28px;
            color: var(--text-primary, #101820);
            animation: anfFadeRise 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .anf-modal-card.anf-card-exit {
            animation: anfFadeExit 150ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }

          /* Fallbacks */
          @supports not (backdrop-filter: blur(24px)) {
            .anf-modal-card {
              background: #f4f6f5;
            }
          }
          @media (prefers-reduced-transparency: reduce) {
            .anf-modal-card {
              background: #ffffff !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
            }
          }
          @media (prefers-contrast: more) {
            .anf-modal-card {
              background: #ffffff !important;
              border: 2px solid #000000 !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .anf-modal-card,
            .anf-modal-card.anf-card-exit,
            .anf-modal-backdrop,
            .anf-modal-backdrop.anf-backdrop-exit {
              animation: none !important;
              transform: none !important;
              transition: opacity 150ms ease !important;
            }
          }

          /* Close Button (Ghost Style with Hover Fill) */
          .anf-btn-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: transparent;
            color: var(--text-muted, #6B7280);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            padding: 0;
            transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 2;
          }
          .anf-btn-close:hover {
            background-color: rgba(0, 0, 0, 0.05);
            color: var(--text-primary, #101820);
          }
          .anf-btn-close:active {
            background-color: rgba(0, 0, 0, 0.08);
            transform: scale(0.95);
          }
          .anf-btn-close:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #047857;
          }

          /* Drag handle for mobile */
          .anf-drag-handle {
            display: none;
            width: 36px;
            height: 4px;
            background: rgba(0, 0, 0, 0.20);
            border-radius: 9999px;
            margin: 0 auto 12px;
            cursor: grab;
          }

          /* Buttons System */
          .anf-primary-btn,
          .anf-secondary-btn {
            font-family: inherit;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: -0.01em;
            width: 100%;
            height: 48px;
            min-height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-sizing: border-box;
            transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
          }

          .anf-primary-btn {
            background: var(--brand-primary, #047857);
            color: #FFFFFF;
            border: none;
          }
          .anf-primary-btn:hover {
            background-color: #065F46;
          }
          .anf-primary-btn:active {
            background-color: #064E3B;
            transform: scale(0.99);
          }
          .anf-primary-btn:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #047857;
          }

          .anf-secondary-btn {
            background: transparent !important;
            background-color: transparent !important;
            color: var(--text-primary, #101820);
            border: 1px solid var(--border-color, rgba(16, 24, 32, 0.18));
          }
          .anf-secondary-btn:hover {
            background-color: rgba(0, 0, 0, 0.04) !important;
          }
          .anf-secondary-btn:active {
            background-color: rgba(0, 0, 0, 0.08) !important;
            transform: scale(0.99);
          }
          .anf-secondary-btn:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #047857;
          }

          /* Mobile Bottom-Sheet (<= 480px) */
          @media (max-width: 480px) {
            .anf-modal-backdrop {
              align-items: flex-end !important;
              padding: 0 !important;
            }
            .anf-modal-card {
              border-radius: 24px 24px 0 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              max-height: 90dvh !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch !important;
              margin: 0 !important;
              border-left: none !important;
              border-right: none !important;
              border-bottom: none !important;
              padding: 16px 24px calc(24px + env(safe-area-inset-bottom, 0px)) 24px !important;
              animation: anfSheetSlideUp 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
            }
            .anf-modal-card.anf-card-exit {
              animation: anfSheetSlideDown 150ms cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
            }
            .anf-drag-handle {
              display: block !important;
            }
          }

          /* Dark Theme Support */
          .dark-theme .anf-modal-card {
            background: rgba(18, 27, 23, 0.62) !important;
            border-color: rgba(255, 255, 255, 0.10) !important;
            color: #f3f4f6 !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.10) !important;
          }
          .dark-theme .anf-modal-card h2 {
            color: #f9fafb !important;
          }
          .dark-theme .anf-modal-card p {
            color: #d1d5db !important;
          }
          .dark-theme .anf-identifier {
            color: #f9fafb !important;
          }
          .dark-theme .anf-drag-handle {
            background: rgba(255, 255, 255, 0.25) !important;
          }
          .dark-theme .anf-btn-close {
            color: #9ca3af !important;
          }
          .dark-theme .anf-btn-close:hover {
            background-color: rgba(255, 255, 255, 0.08) !important;
            color: #ffffff !important;
          }
          .dark-theme .anf-secondary-btn {
            color: #f3f4f6 !important;
            border-color: rgba(255, 255, 255, 0.22) !important;
          }
          .dark-theme .anf-secondary-btn:hover {
            background-color: rgba(255, 255, 255, 0.06) !important;
          }
        `}</style>

        {/* Mobile Drag Handle */}
        <div className="anf-drag-handle" aria-hidden="true" />

        {/* Top-Right Corner Close (X) button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close dialog"
          className="anf-btn-close"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Title starts at top padding, with right padding so it never collides with close button */}
        <h2
          id="account-not-found-title"
          style={{
            fontFamily: 'var(--font-serif, "Fraunces", Georgia, serif)',
            fontSize: '1.5rem',
            fontWeight: 500,
            margin: '0 0 8px 0',
            paddingRight: '44px',
            lineHeight: 1.25,
            color: 'var(--text-primary, #101820)'
          }}
        >
          Account not found
        </h2>

        {/* Message: 8px from title, 24px to buttons, balanced wrap, overflow-wrap anywhere */}
        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.5,
            color: 'var(--text-secondary, #4B5563)',
            margin: '0 0 24px 0',
            textWrap: 'balance',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        >
          {cleanIdentifier ? (
            <>
              We couldn't find an account for{' '}
              <span className="anf-identifier" style={{ fontWeight: 500, color: 'var(--text-primary, #101820)' }}>
                {cleanIdentifier}
              </span>
              .
            </>
          ) : (
            <>We couldn't find an account matching the provided details.</>
          )}
        </p>

        {/* Two Stacked Buttons (12px apart, 48px tall, 12px radius, app font 16px 600) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          {/* Primary: Create a new account */}
          <button
            ref={primaryBtnRef}
            type="button"
            className="anf-primary-btn"
            onClick={handleCreateAccount}
          >
            Create a new account
          </button>

          {/* Secondary Outline: Use a different email / Use a different number */}
          <button
            type="button"
            className="anf-secondary-btn"
            onClick={handleDismiss}
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
