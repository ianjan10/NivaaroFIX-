import React, { useState, useEffect, useRef } from 'react';

/**
 * AdminPublishFeedbackModal
 *
 * Minimalist dialog to curate customer appreciations for the homepage.
 * - Public text textarea with 280-char counter and helper line
 * - "Name shown" text field prefilled with First Name + Last Initial (e.g. "Anjan K."), max 40 chars
 * - Client-side validation: rejects '@' and 7+ consecutive digits
 * - Live preview rendering the exact public card component
 * - Single-stroke line icons, calm ease-out transitions, zero emojis.
 * - Keyboard shortcuts: Ctrl/Cmd+Enter to publish, ESC to close.
 */
export default function AdminPublishFeedbackModal({
  isOpen,
  feedback,
  onClose,
  onPublish,
  isSubmitting = false
}) {
  const [publicText, setPublicText] = useState('');
  const [publicName, setPublicName] = useState('');
  const [textError, setTextError] = useState('');
  const [nameError, setNameError] = useState('');

  const modalRef = useRef(null);
  const textareaRef = useRef(null);
  const triggerRef = useRef(null);

  // Derive default first name + last initial from profile name (never from email)
  const computeInitialName = (item) => {
    if (item?.public_name && item.public_name !== 'Verified customer' && item.public_name !== 'Customer') {
      return item.public_name.slice(0, 40);
    }
    if (item?.suggestedName) {
      return item.suggestedName.slice(0, 40);
    }
    const rawName = item?.profile_name || '';
    const trimmed = rawName.trim();
    if (trimmed && !trimmed.includes('@')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 40);
      const first = parts[0];
      const lastInitial = parts[parts.length - 1][0].toUpperCase();
      return `${first} ${lastInitial}.`.slice(0, 40);
    }
    return '';
  };

  useEffect(() => {
    if (isOpen && feedback) {
      triggerRef.current = document.activeElement;
      const initialText = feedback.public_text || feedback.comment || '';
      setPublicText(initialText.slice(0, 280));
      setPublicName(computeInitialName(feedback));
      setTextError('');
      setNameError('');

      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current?.focus?.();
    }
  }, [isOpen, feedback]);

  // Handle ESC and Ctrl/Cmd+Enter shortcuts + Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handlePublishSubmit();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, publicText, publicName]);

  if (!isOpen || !feedback) return null;

  const rating = typeof feedback.rating === 'number' && feedback.rating >= 1 && feedback.rating <= 5 ? feedback.rating : null;
  const resolvedDisplayName = publicName.trim() || 'Customer';

  const validateName = (val) => {
    const trimmed = val.trim();
    if (!trimmed) return '';
    if (trimmed.includes('@')) {
      return 'Name cannot contain email addresses (@).';
    }
    if (/\d{7,}/.test(trimmed)) {
      return 'Name cannot contain phone numbers (7+ consecutive digits).';
    }
    return '';
  };

  const handleNameChange = (e) => {
    const val = e.target.value.slice(0, 40);
    setPublicName(val);
    setNameError(validateName(val));
  };

  const handlePublishSubmit = () => {
    const trimmedText = publicText.trim();
    if (!trimmedText) {
      setTextError('Public text cannot be empty.');
      textareaRef.current?.focus();
      return;
    }
    if (trimmedText.length > 280) {
      setTextError('Public text must be 280 characters or fewer.');
      return;
    }

    const nErr = validateName(publicName);
    if (nErr) {
      setNameError(nErr);
      return;
    }

    setTextError('');
    setNameError('');
    onPublish({
      publicText: trimmedText,
      publicName: resolvedDisplayName
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(20, 24, 31, 0.45)',
        backdropFilter: 'blur(3px)',
        animation: 'fadeIn 140ms ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: '100%',
          maxWidth: 640,
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e7e2d8',
          boxShadow: '0 20px 48px -12px rgba(20, 24, 31, 0.16)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid #e7e2d8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h2
              id="publish-dialog-title"
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: '#14181f',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              Publish to homepage
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Curate this appreciation for the public website.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 6,
              borderRadius: 8,
              color: '#6b7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: 'calc(85vh - 120px)', overflowY: 'auto' }}>
          
          {/* Public text field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label htmlFor="publish-public-text" style={{ fontSize: 13, fontWeight: 600, color: '#14181f' }}>
                Public text
              </label>
              <span style={{ fontSize: 12, color: publicText.length > 280 ? '#8a3b2f' : '#6b7280' }}>
                {publicText.length}/280
              </span>
            </div>

            <textarea
              id="publish-public-text"
              ref={textareaRef}
              value={publicText}
              onChange={(e) => setPublicText(e.target.value.slice(0, 280))}
              rows={4}
              placeholder="Enter public testimonial quote..."
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.5,
                color: '#14181f',
                background: '#ffffff',
                border: `1px solid ${textError ? '#8a3b2f' : '#dcd8cf'}`,
                borderRadius: 10,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0f4d3c';
                e.target.style.boxShadow = '0 0 0 3px rgba(15, 77, 60, 0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = textError ? '#8a3b2f' : '#dcd8cf';
                e.target.style.boxShadow = 'none';
              }}
            />
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              The original is kept unchanged.
            </div>
            {textError && (
              <div style={{ fontSize: 12, color: '#8a3b2f', marginTop: 4, fontWeight: 500 }}>
                {textError}
              </div>
            )}
          </div>

          {/* Name shown field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label htmlFor="publish-name-shown" style={{ fontSize: 13, fontWeight: 600, color: '#14181f' }}>
                Name shown
              </label>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {publicName.length}/40
              </span>
            </div>

            <input
              id="publish-name-shown"
              type="text"
              value={publicName}
              onChange={handleNameChange}
              placeholder="e.g. Anjan K. (falls back to Customer if blank)"
              maxLength={40}
              style={{
                width: '100%',
                height: 42,
                padding: '0 14px',
                fontSize: 14,
                color: '#14181f',
                background: '#ffffff',
                border: `1px solid ${nameError ? '#8a3b2f' : '#dcd8cf'}`,
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0f4d3c';
                e.target.style.boxShadow = '0 0 0 3px rgba(15, 77, 60, 0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = nameError ? '#8a3b2f' : '#dcd8cf';
                e.target.style.boxShadow = 'none';
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {publicName.trim() ? 'Customer display name.' : 'Falls back to "Customer" if left blank.'}
              </span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                Email and phone are never shown publicly.
              </span>
            </div>
            {nameError && (
              <div style={{ fontSize: 12, color: '#8a3b2f', marginTop: 4, fontWeight: 500 }}>
                {nameError}
              </div>
            )}
          </div>

          {/* Live Homepage Preview — Exact Public Card Component */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Live Homepage Card Preview
            </div>

            <div
              className="how-step-card nivaaro-card published-feedback-card"
              style={{
                background: '#ffffff',
                borderRadius: 16,
                padding: '2rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '180px',
                boxSizing: 'border-box'
              }}
            >
              {/* 1. Quote text: same font, size and muted body color as 'How it works' description copy */}
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                  color: 'var(--text-secondary, #64748b)',
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {publicText || 'Customer quote preview...'}
              </p>

              {/* 2. Flexible space: at least 24px */}
              <div style={{ flex: 1, minHeight: 24 }} />

              {/* 3. Footer row: name left, stars right */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                {/* Customer name (same dark semibold style as 'How it works' card titles) */}
                <span
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: 'var(--text-primary, #0f172a)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: rating ? 'calc(100% - 100px)' : '100%'
                  }}
                >
                  {resolvedDisplayName}
                </span>

                {/* Star rating: 5 solid stars, filled in dark ink var(--text-primary, #0f172a), empty in light grey var(--bg-card-border, #e2e8f0). NO GOLD. */}
                {rating ? (
                  <div
                    role="img"
                    aria-label={`Rated ${rating} out of 5`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      flexShrink: 0
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((starIdx) => {
                      const isFilled = starIdx <= rating;
                      return (
                        <svg
                          key={starIdx}
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill={isFilled ? 'var(--text-primary, #0f172a)' : 'var(--bg-card-border, #e2e8f0)'}
                          aria-hidden="true"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e7e2d8',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            <kbd style={{ padding: '2px 5px', background: '#f5f4ef', border: '1px solid #dcd8cf', borderRadius: 4, fontSize: 11,  }}>
              Ctrl/Cmd + Enter
            </kbd>{' '}
            to publish
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: '#ffffff',
                border: '1px solid #e7e2d8',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#14181f',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handlePublishSubmit}
              disabled={isSubmitting || !publicText.trim() || Boolean(nameError)}
              style={{
                background: '#0f4d3c',
                border: 'none',
                borderRadius: 8,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                color: '#ffffff',
                cursor: isSubmitting || !publicText.trim() || Boolean(nameError) ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || !publicText.trim() || Boolean(nameError) ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{isSubmitting ? 'Publishing...' : 'Publish to homepage'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
