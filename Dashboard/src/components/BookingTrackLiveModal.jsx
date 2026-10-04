import React, { useState, useEffect, useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingTrackLiveModal({ isOpen, onClose, booking, onContactPro }) {
  const modalRef = useRef(null);
  const [currentEta, setCurrentEta] = useState(() => booking?.etaMinutes || 18);

  useModalFocusTrap(isOpen, onClose, modalRef);

  // Note: Simulated real-time ETA countdown for client demonstration.
  // TODO: Connect this feed to the backend GPS WebSocket / Telematics telemetry stream when available.
  useEffect(() => {
    if (!isOpen || !booking) return;
    setCurrentEta(booking.etaMinutes || 18);
    const interval = setInterval(() => {
      setCurrentEta((prev) => (prev > 2 ? prev - 1 : 2));
    }, 45000);
    return () => clearInterval(interval);
  }, [isOpen, booking]);

  if (!isOpen || !booking) return null;

  const proName = booking.technicianName || 'Assigned Professional';
  const proRole = booking.technicianRole || (booking.category === 'plumber' ? 'Senior Plumbing Specialist' : 'Master Electrician');
  const proRating = booking.technicianRating || 'New';
  const proJobs = booking.technicianJobs || 0;
  const proPhone = booking.technicianPhone || '';
  const locality = booking.address || booking.locality || 'Service Address';

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-track-title"
    >
      <div
        className="booking-modal-card live-track-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header">
          <div className="booking-modal-title-group">
            <div className="modal-badge-row">
              <span className="live-status-pill brass-pill">
                <span className="pulsing-live-dot" aria-hidden="true" />
                <span>En Route · Live Dispatch</span>
              </span>
              <span className="booking-ref-mono">{booking.bookingId || booking.bookingRef}</span>
            </div>
            {/* Header copy: [technicianName] is on the way */}
            <h2 id="live-track-title" className="booking-modal-title">
              {proName} is on the way
            </h2>
            <p className="booking-modal-sub">
              {booking.serviceTitle} · Doorstep destination: <strong style={{ color: 'var(--text-primary)' }}>{locality.split(',')[0]}</strong>
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close live tracking dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Live Map Dispatch Simulation */}
        <div className="live-map-viewport">
          <div className="map-grid-overlay" />
          <svg className="map-route-svg" viewBox="0 0 500 200" preserveAspectRatio="none" aria-hidden="true">
            {/* Route Path */}
            <path
              d="M 50 150 Q 180 80 280 120 T 450 60"
              fill="none"
              stroke="rgba(5, 150, 105, 0.3)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 50 150 Q 180 80 280 120 T 450 60"
              fill="none"
              stroke="#059669"
              strokeWidth="4"
              strokeDasharray="8 6"
              strokeLinecap="round"
              className="animated-route-dash"
            />

            {/* Destination Marker */}
            <circle cx="450" cy="60" r="14" fill="#059669" opacity="0.18" />
            <circle cx="450" cy="60" r="7" fill="#059669" />
            
            {/* Pro Moving Marker */}
            <circle cx="280" cy="120" r="20" fill="#059669" opacity="0.2" className="pulse-map-ring" />
            <circle cx="280" cy="120" r="9" fill="#059669" stroke="#ffffff" strokeWidth="2" />
          </svg>

          {/* Map Badges */}
          <div className="map-badge-destination">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{locality.split(',')[0]}</span>
          </div>

          <div className="map-badge-eta">
            <div className="eta-big-number">{currentEta}</div>
            <div className="eta-unit-label">min away</div>
          </div>
        </div>

        {/* Live Dispatch Steps Timeline */}
        <div className="live-timeline-container">
          <div className="timeline-item passed">
            <div className="timeline-dot-wrapper">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="timeline-content">
              <span className="timeline-title">Booking Confirmed</span>
              <span className="timeline-sub">Slot scheduled & order verified</span>
            </div>
          </div>

          <div className="timeline-item passed">
            <div className="timeline-dot-wrapper">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="timeline-content">
              <span className="timeline-title">Technician Assigned</span>
              <span className="timeline-sub">{proName} accepted job</span>
            </div>
          </div>

          <div className="timeline-item current">
            <div className="timeline-dot-wrapper current-dot">
              <span className="inner-dot" />
            </div>
            <div className="timeline-content">
              <span className="timeline-title">En Route to Your Door</span>
              <span className="timeline-sub">Live distance: ~3.4 km</span>
            </div>
          </div>

          <div className="timeline-item pending">
            <div className="timeline-dot-wrapper pending-dot" />
            <div className="timeline-content">
              <span className="timeline-title">Service & Inspection</span>
              <span className="timeline-sub">Estimated duration: 35-45 mins</span>
            </div>
          </div>
        </div>

        {/* Technician Profile & Direct Contact Box */}
        <div className="live-pro-contact-card">
          <div className="pro-avatar-badge">
            <span className="pro-initials">{proName.charAt(0)}</span>
            <span className="verified-shield-icon" title="Identity Verified & Background Checked">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
          </div>

          <div className="pro-details-col">
            <div className="pro-name-row">
              <span className="pro-fullname">{proName}</span>
              <span className="pro-rating-badge">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#059669" stroke="none" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{proRating} ({proJobs} jobs)</span>
              </span>
            </div>
            <span className="pro-role-subtitle">{proRole}</span>
            <span className="pro-vaccine-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>NivaaroFix Certified & Background-Vetted</span>
            </span>
          </div>

          <div className="pro-contact-actions">
            <button
              type="button"
              className="pro-action-btn primary-btn"
              onClick={() => {
                onClose();
                if (onContactPro) onContactPro(booking);
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Contact Pro</span>
            </button>
          </div>
        </div>

        {/* Doorstep Verification PIN / OTP Notice */}
        {booking.otpCode && (
          <div className="doorstep-otp-strip">
            <div className="otp-info-group">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <span className="otp-title">Doorstep Start OTP</span>
                <span className="otp-desc">Share only when the technician arrives in person</span>
              </div>
            </div>
            <div className="otp-digits-box" aria-label={`Doorstep OTP is ${booking.otpCode}`}>
              {booking.otpCode}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="booking-modal-footer">
          <button type="button" className="btn-secondary-neutral" onClick={onClose}>
            Close Tracker
          </button>
        </div>
      </div>
    </div>
  );
}
