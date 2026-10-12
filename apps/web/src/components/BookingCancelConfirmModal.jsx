import React, { useState, useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingCancelConfirmModal({
  isOpen,
  onClose,
  booking,
  onConfirmCancel
}) {
  const modalRef = useRef(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const proName = booking.technicianName || 'your assigned technician';
  const serviceName = booking.serviceTitle || 'Home Service';
  const bookingId = booking.bookingId || booking.bookingRef || 'NVF-24090000';

  const cancellationReasons = [
    { id: 'found_another_provider', label: 'Found another provider' },
    { id: 'no_longer_needed', label: 'No longer needed' },
    { id: 'price_concern', label: 'Price concern' },
    { id: 'rescheduling_instead', label: 'Rescheduling instead' },
    { id: 'other', label: 'Other' }
  ];

  const handleExecuteCancel = async () => {
    setIsCancelling(true);
    let finalReason = selectedReason
      ? (cancellationReasons.find(r => r.id === selectedReason)?.label || selectedReason)
      : 'No reason specified';
    if (selectedReason === 'other' && otherText.trim()) {
      finalReason = `Other: ${otherText.trim()}`;
    }

    try {
      await onConfirmCancel(booking, finalReason);
      setIsCancelling(false);
      onClose();
    } catch (err) {
      setIsCancelling(false);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-booking-dialog-title"
    >
      <div
        className="booking-modal-card cancel-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header">
          <div className="booking-modal-title-group">
            <span className="live-status-pill neutral-pill">
              <span>Cancellation Confirmation</span>
            </span>
            <h2 id="cancel-booking-dialog-title" className="booking-modal-title">
              Cancel this booking?
            </h2>
            <p className="booking-modal-sub">
              Your {serviceName} ({bookingId}) with {proName} will be cancelled. This can't be undone.
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close cancel dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Reason Selection */}
        <div className="cancel-modal-body">
          <label className="cancel-question-label" htmlFor="cancel-reason-select">
            Help us improve — why are you cancelling? (optional)
          </label>

          <div className="cancel-reasons-list" role="radiogroup" aria-label="Cancellation reasons">
            {cancellationReasons.map((r) => (
              <label
                key={r.id}
                className={`cancel-radio-card ${selectedReason === r.id ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name="cancellation_reason"
                  value={r.id}
                  checked={selectedReason === r.id}
                  onChange={() => setSelectedReason(r.id)}
                  className="cancel-radio-input"
                />
                <span className="cancel-radio-check-circle">
                  {selectedReason === r.id && <span className="inner-radio-dot" />}
                </span>
                <span className="cancel-radio-text">{r.label}</span>
              </label>
            ))}
          </div>

          {selectedReason === 'other' && (
            <div className="cancel-other-input-group">
              <input
                type="text"
                placeholder="Please describe your reason..."
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className="cancel-other-input"
                maxLength={180}
              />
            </div>
          )}

          {/* Cancellation Policy Banner */}
          <div className="cancellation-policy-note">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>Zero Cancellation Fee:</strong> You will not be charged. If you need a different time instead, you can reschedule without cancelling.
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="booking-modal-footer dual-action-footer">
          <button
            type="button"
            className="btn-secondary-neutral"
            onClick={onClose}
            disabled={isCancelling}
          >
            Keep booking
          </button>

          <button
            type="button"
            className="btn-destructive-confirm"
            onClick={handleExecuteCancel}
            disabled={isCancelling}
          >
            {isCancelling ? 'Cancelling...' : 'Confirm cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
}
