import React, { useState, useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingRescheduleModal({ isOpen, onClose, booking, onConfirmReschedule }) {
  const modalRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState('tomorrow');
  const [selectedSlot, setSelectedSlot] = useState('14:00 - 17:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const proName = booking.technicianName || 'Certified Technician';
  const serviceName = booking.serviceTitle || 'Home Service';

  const dateOptions = [
    { id: 'today', label: 'Today (Express Slot)', sub: 'Subject to priority availability' },
    { id: 'tomorrow', label: 'Tomorrow', sub: 'Guaranteed 30-min arrival window' },
    { id: 'day_after', label: 'Day After Tomorrow', sub: 'Standard dispatch window' }
  ];

  const slotOptions = [
    { id: '09:00 - 12:00', label: 'Morning Slot', time: '09:00 AM – 12:00 PM' },
    { id: '14:00 - 17:00', label: 'Afternoon Slot', time: '02:00 PM – 05:00 PM' },
    { id: '18:00 - 20:30', label: 'Evening Slot', time: '06:00 PM – 08:30 PM' }
  ];

  const handleExecuteReschedule = async () => {
    setIsSubmitting(true);
    const dateLabel = dateOptions.find(d => d.id === selectedDate)?.label.split(' (')[0] || 'Tomorrow';
    const slotLabel = slotOptions.find(s => s.id === selectedSlot)?.time || '02:00 PM – 05:00 PM';
    const newScheduledTime = `${dateLabel}, ${slotLabel}`;

    try {
      await onConfirmReschedule(booking, newScheduledTime);
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert('Failed to reschedule visit. Please try again.');
    }
  };

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-booking-title"
    >
      <div
        className="booking-modal-card reschedule-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header">
          <div className="booking-modal-title-group">
            <span className="live-status-pill brass-pill">
              <span>Change Slot</span>
            </span>
            <h2 id="reschedule-booking-title" className="booking-modal-title">
              Reschedule your visit
            </h2>
            <p className="booking-modal-sub">
              Choose a new date and time for your {serviceName} with {proName}.
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close reschedule dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="reschedule-modal-body">
          {/* Step 1: Select Date */}
          <div className="reschedule-section">
            <label className="reschedule-section-label">1. Choose Date</label>
            <div className="reschedule-date-grid">
              {dateOptions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`reschedule-date-card ${selectedDate === d.id ? 'active' : ''}`}
                  onClick={() => setSelectedDate(d.id)}
                >
                  <span className="reschedule-date-title">{d.label}</span>
                  <span className="reschedule-date-sub">{d.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Select Time Slot */}
          <div className="reschedule-section" style={{ marginTop: '1.25rem' }}>
            <label className="reschedule-section-label">2. Choose Preferred Arrival Window</label>
            <div className="reschedule-slot-grid">
              {slotOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`reschedule-slot-card ${selectedSlot === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedSlot(s.id)}
                >
                  <div className="slot-icon-row">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="slot-title">{s.label}</span>
                  </div>
                  <span className="slot-time-range">{s.time}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="reschedule-guarantee-note">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>Your technician assignment and warranty coverage will transfer automatically to the new slot.</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="booking-modal-footer dual-action-footer">
          <button type="button" className="btn-secondary-neutral" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary-confirm" onClick={handleExecuteReschedule} disabled={isSubmitting}>
            {isSubmitting ? 'Rescheduling...' : 'Confirm New Slot'}
          </button>
        </div>
      </div>
    </div>
  );
}
