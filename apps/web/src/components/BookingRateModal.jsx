import React, { useState, useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingRateModal({ isOpen, onClose, booking, onSubmitRating }) {
  const modalRef = useRef(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [selectedTags, setSelectedTags] = useState(['On-Time Arrival', 'Clean Workmanship']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const proName = booking.technicianName || 'Certified Technician';
  const serviceName = booking.serviceTitle || 'Home Service';

  const quickTags = [
    'On-Time Arrival',
    'Clean Workmanship',
    'Clear Explanations',
    'Fair Pricing',
    'Polite & Professional',
    'Fast Diagnostic'
  ];

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmitRating(booking, { rating, feedback, tags: selectedTags });
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert('Failed to submit rating. Please try again.');
    }
  };

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-visit-title"
    >
      <div
        className="booking-modal-card rate-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header">
          <div className="booking-modal-title-group">
            <h2 id="rate-visit-title" className="booking-modal-title">
              Rate your visit with {proName}
            </h2>
            <p className="booking-modal-sub">
              {serviceName}
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close rating dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Completion Proof (Photos & Remarks) */}
        {((booking.completionPhotos && booking.completionPhotos.length > 0) || booking.completionRemarks) && (
          <div style={{ margin: '1rem 1.5rem 0.5rem', padding: '0.85rem 1rem', background: 'var(--bg-surface-subtle, #f9fafb)', borderRadius: '10px', border: '1px solid var(--bg-card-border, #e5e7eb)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Completed Work Proof
            </div>
            {booking.completionPhotos && booking.completionPhotos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: booking.completionRemarks ? '0.5rem' : 0 }}>
                {booking.completionPhotos.map((photo, i) => (
                  <img
                    key={i}
                    src={photo}
                    alt={`Completion ${i + 1}`}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                  />
                ))}
              </div>
            )}
            {booking.completionRemarks && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-primary, #111827)', fontStyle: 'italic' }}>
                "{booking.completionRemarks}"
              </div>
            )}
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="rate-modal-body">
          {/* Star Rating Row */}
          <div className="star-rating-row">
            <div className="stars-wrapper" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="star-btn"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="32"
                    height="32"
                    fill={(hoverRating || rating) >= star ? '#059669' : 'none'}
                    stroke={(hoverRating || rating) >= star ? '#059669' : 'var(--bg-input-border)'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="star-score-label">
              {rating === 5 && 'Outstanding Work'}
              {rating === 4 && 'Very Good Service'}
              {rating === 3 && 'Average Experience'}
              {rating === 2 && 'Needs Improvement'}
              {rating === 1 && 'Unsatisfactory'}
            </div>
          </div>

          {/* Quick Compliment Tags */}
          <div className="rate-tags-section">
            <label className="rate-label">What stood out most?</label>
            <div className="rate-tags-wrap">
              {quickTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rate-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Written Feedback */}
          <div className="rate-textarea-section">
            <label className="rate-label" htmlFor="rate-comment-input">
              Optional feedback or technician note
            </label>
            <textarea
              id="rate-comment-input"
              rows={3}
              placeholder="e.g. Prompt arrival, clearly explained the issue and fixed the board neatly..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="rate-textarea"
              maxLength={400}
            />
          </div>

          {/* Footer Actions */}
          <div className="booking-modal-footer dual-action-footer">
            <button type="button" className="btn-secondary-neutral" onClick={onClose} disabled={isSubmitting}>
              Rate later
            </button>
            <button type="submit" className="btn-primary-confirm" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
