import React, { useState, useEffect, useRef } from 'react';

/**
 * FeedbackModal - Minimalist, Interactive Feedback & Problem Definition Modal
 * Allows any visitor, customer, or professional (logged in or guest) to:
 * - Select an interactive 1-5 star rating
 * - Choose a problem / feedback topic pill
 * - Write their thoughts or define an issue
 * - Provide optional contact info (or auto-attach logged-in account details)
 * - Submit via POST /api/feedback with instant, calm confirmation
 */

const CATEGORIES = [
  { id: 'problem', label: 'Problem / Bug' },
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'service', label: 'Service Quality' },
  { id: 'experience', label: 'Website / Flow' },
  { id: 'other', label: 'Other' }
];

const RATING_LABELS = {
  1: 'Needs improvement',
  2: 'Below expectations',
  3: 'Satisfactory',
  4: 'Good experience',
  5: 'Outstanding'
};

export default function FeedbackModal({
  isOpen = false,
  onClose = () => {},
  user = null,
  agent = null
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('problem');
  const [comment, setComment] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const modalRef = useRef(null);
  const commentInputRef = useRef(null);

  // Determine user identity if logged in
  const isLoggedIn = Boolean(user?.isLoggedIn || agent?.isLoggedIn || user?.id || agent?.id);
  const userRole = agent?.isLoggedIn ? 'professional' : user?.isLoggedIn ? 'customer' : 'guest';
  const loggedInName = agent?.name || user?.name || user?.fullName || agent?.phone || user?.phone || user?.email || '';

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setHoverRating(0);
      setCategory('problem');
      setComment('');
      setContactInfo('');
      setErrorMsg('');
      setIsSubmitted(false);
      setIsSubmitting(false);

      // Focus textarea smoothly
      const timer = setTimeout(() => {
        commentInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setErrorMsg('');

    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      setErrorMsg('Please describe what happened or what you would like to share.');
      commentInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        rating: rating > 0 ? rating : null,
        category,
        problemDefinition: CATEGORIES.find(c => c.id === category)?.label || category,
        comment: trimmedComment,
        contactInfo: contactInfo.trim() || loggedInName || null,
        userId: user?.id || agent?.id || null,
        userRole,
        deviceInfo: {
          userAgent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }
      };

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit feedback.');
      }

      setIsSubmitted(true);
      // Auto close after 2.8s
      setTimeout(() => {
        onClose();
      }, 2800);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStarCount = hoverRating || rating;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(20, 24, 31, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'nivaaroFeedbackFadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>{`
        @keyframes nivaaroFeedbackFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nivaaroFeedbackScaleIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .nivaaro-star-btn:hover {
          transform: scale(1.15);
        }
        .nivaaro-topic-chip:hover {
          border-color: #0f4d3c !important;
          background: #faf9f6 !important;
        }
        .nivaaro-fb-input:focus {
          border-color: #0f4d3c !important;
          box-shadow: 0 0 0 3px rgba(15, 77, 60, 0.12) !important;
        }
      `}</style>

      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e7e2d8',
          boxShadow: '0 24px 48px -12px rgba(20, 24, 31, 0.14)',
          overflow: 'hidden',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          color: '#14181f',
          animation: 'nivaaroFeedbackScaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxSizing: 'border-box'
        }}
      >
        {isSubmitted ? (
          /* =========================================================================
             Success Confirmation State
             ========================================================================= */
          <div
            style={{
              padding: '48px 32px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(15, 77, 60, 0.08)',
                border: '1px solid rgba(15, 77, 60, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f4d3c'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <div>
              <h3
                id="feedback-modal-title"
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontSize: '22px',
                  fontWeight: 500,
                  margin: '0 0 8px 0',
                  color: '#14181f'
                }}
              >
                Thank you for your feedback
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#5a5648', lineHeight: 1.5 }}>
                We review every note carefully to elevate our service standards.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: '12px',
                background: '#14181f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 140ms ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0f4d3c'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#14181f'; }}
            >
              Close
            </button>
          </div>
        ) : (
          /* =========================================================================
             Interactive Feedback Form
             ========================================================================= */
          <div style={{ margin: 0 }}>
            {/* Header */}
            <div
              style={{
                padding: '24px 28px 16px 28px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f0ece2'
              }}
            >
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    color: '#a9793c',
                    textTransform: 'uppercase',
                    marginBottom: '4px'
                  }}
                >
                  NivaaroFix Feedback
                </span>
                <h3
                  id="feedback-modal-title"
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: '22px',
                    fontWeight: 500,
                    margin: 0,
                    color: '#14181f',
                    lineHeight: 1.2
                  }}
                >
                  Share your experience
                </h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close feedback dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px',
                  cursor: 'pointer',
                  color: '#5a5648',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 120ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#14181f';
                  e.currentTarget.style.background = '#faf9f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#5a5648';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. Minimalist Star Rating */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#14181f' }}>
                    Rating <span style={{ fontSize: '11px', fontWeight: 400, color: '#888478' }}>(optional)</span>
                  </label>
                  {activeStarCount > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#0f4d3c' }}>
                      {RATING_LABELS[activeStarCount]}
                    </span>
                  )}
                </div>

                <div
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  onMouseLeave={() => setHoverRating(0)}
                  role="radiogroup"
                  aria-label="Rating out of 5 stars"
                >
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled = activeStarCount >= starVal;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        role="radio"
                        aria-checked={rating === starVal}
                        aria-label={`${starVal} star${starVal > 1 ? 's' : ''}`}
                        className="nivaaro-star-btn"
                        onClick={() => setRating(starVal === rating ? 0 : starVal)}
                        onMouseEnter={() => setHoverRating(starVal)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '4px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isFilled ? '#a9793c' : '#dcd8cf',
                          transition: 'transform 120ms ease, color 120ms ease'
                        }}
                      >
                        <svg
                          width="26"
                          height="26"
                          viewBox="0 0 24 24"
                          fill={isFilled ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Problem / Topic Definition Pills */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#14181f', marginBottom: '8px' }}>
                  Topic
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="nivaaro-topic-chip"
                        onClick={() => setCategory(cat.id)}
                        style={{
                          border: isSelected ? '1px solid #0f4d3c' : '1px solid #e7e2d8',
                          background: isSelected ? 'rgba(15, 77, 60, 0.08)' : '#ffffff',
                          color: isSelected ? '#0f4d3c' : '#5a5648',
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: '12px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 120ms ease'
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Comment / Problem Textarea */}
              <div>
                <label
                  htmlFor="nivaaro-feedback-text"
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#14181f', marginBottom: '8px' }}
                >
                  {category === 'problem' ? 'Describe the issue' : 'Your feedback'}
                </label>
                <textarea
                  id="nivaaro-feedback-text"
                  ref={commentInputRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    category === 'problem'
                      ? 'What went wrong? Any details help us resolve it quickly...'
                      : 'Tell us how we can make your experience smoother...'
                  }
                  rows={4}
                  className="nivaaro-fb-input"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                    color: '#14181f',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e7e2d8',
                    borderRadius: '10px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    transition: 'border-color 140ms ease, box-shadow 140ms ease'
                  }}
                />
              </div>

              {/* 4. Contact Info: Guest or Logged In Badge */}
              {isLoggedIn ? (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 77, 60, 0.05)',
                    border: '1px solid rgba(15, 77, 60, 0.14)',
                    fontSize: '12px',
                    color: '#0f4d3c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>
                    Submitting as <strong>{loggedInName || userRole}</strong> ({userRole})
                  </span>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="nivaaro-feedback-contact"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#14181f', marginBottom: '6px' }}
                  >
                    Email or phone <span style={{ fontSize: '11px', fontWeight: 400, color: '#888478' }}>(optional)</span>
                  </label>
                  <input
                    id="nivaaro-feedback-contact"
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="In case we need to follow up"
                    className="nivaaro-fb-input"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      color: '#14181f',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e7e2d8',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 140ms ease, box-shadow 140ms ease'
                    }}
                  />
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div
                  role="alert"
                  style={{
                    fontSize: '13px',
                    color: '#8a3b2f',
                    backgroundColor: 'rgba(138, 59, 47, 0.08)',
                    border: '1px solid rgba(138, 59, 47, 0.2)',
                    padding: '8px 12px',
                    borderRadius: '8px'
                  }}
                >
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div
              style={{
                padding: '16px 28px 24px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px',
                borderTop: '1px solid #f0ece2'
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  background: 'transparent',
                  border: '1px solid #e7e2d8',
                  color: '#5a5648',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 140ms ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.color = '#14181f';
                    e.currentTarget.style.borderColor = '#c9c4b8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.color = '#5a5648';
                    e.currentTarget.style.borderColor = '#e7e2d8';
                  }
                }}
              >
                Cancel
              </button>

              <button
                id="nivaaro-feedback-submit-btn"
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{
                  background: isSubmitting ? '#5a5648' : '#14181f',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 140ms ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) e.currentTarget.style.background = '#0f4d3c';
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) e.currentTarget.style.background = '#14181f';
                }}
              >
                {isSubmitting ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send feedback</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
