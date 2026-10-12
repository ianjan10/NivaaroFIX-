import React, { useState, useEffect, useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import UberStyleTrackingMap from './UberStyleTrackingMap';

export default function BookingTrackLiveModal({ isOpen, onClose, booking, onContactPro }) {
  const modalRef = useRef(null);
  // Simulated real-time ETA countdown (TODO: Connect this feed to the backend GPS WebSocket if telemetry has no route ETA)
  const [currentEta, setCurrentEta] = useState(() => booking?.etaMinutes || 15);
  const [liveStatus, setLiveStatus] = useState(() => booking?.status || 'Confirmed');

  useModalFocusTrap(isOpen, onClose, modalRef);

  useEffect(() => {
    if (!isOpen || !booking) return;
    setLiveStatus(booking.status || 'Confirmed');
    if (booking.etaMinutes) setCurrentEta(booking.etaMinutes);
  }, [isOpen, booking]);

  // Listen to SSE status changes for real-time transitions (e.g. Arrived, In progress)
  useEffect(() => {
    if (!isOpen || !booking) return;
    const ref = booking.bookingRef || booking.bookingId || booking.requestRef;
    if (!ref) return;

    let sse = null;
    try {
      sse = new EventSource(`/api/dispatch/request/${ref}/events`);
      sse.addEventListener('status.arrived', (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveStatus('Arrived');
          if (payload.otpCode && booking) {
            booking.otpCode = payload.otpCode;
          }
        } catch {}
      });
      sse.addEventListener('status.in_progress', () => setLiveStatus('In progress'));
      sse.addEventListener('status.completed', () => setLiveStatus('Completed'));
      sse.addEventListener('status.en_route', () => setLiveStatus('On the way'));
    } catch {}

    return () => {
      if (sse) sse.close();
    };
  }, [isOpen, booking]);

  if (!isOpen || !booking) return null;

  const proName = (booking.technicianName || booking.agentName || '').trim() || 'Professional';
  const proTrade = booking.trade || (booking.category === 'plumber' ? 'Plumber' : 'Electrician');
  const proRating = booking.technicianRating || booking.agentRating;
  const proJobs = booking.technicianJobs !== undefined ? booking.technicianJobs : (booking.agentCompletedJobs || 0);
  const locality = booking.userAddress || booking.address || booking.locality || 'Service Address';

  // 5 Canonical Tracker Steps: Confirmed, On the way, Arrived, In progress, Completed
  const TRACKER_STEPS = [
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'on_the_way', label: 'On the way' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' }
  ];

  const normStatus = (liveStatus || '').toLowerCase();
  let currentStepIndex = 0;
  if (normStatus === 'confirmed' || normStatus === 'accepted') currentStepIndex = 0;
  else if (normStatus === 'on the way' || normStatus === 'en route') currentStepIndex = 1;
  else if (normStatus === 'arrived') currentStepIndex = 2;
  else if (normStatus === 'in progress' || normStatus === 'otp verified') currentStepIndex = 3;
  else if (normStatus === 'completed') currentStepIndex = 4;

  const isArrivedOrLater = currentStepIndex >= 2;

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
                <span>
                  {currentStepIndex === 1 ? 'On the way' : TRACKER_STEPS[currentStepIndex].label}
                </span>
              </span>
            </div>
            <h2 id="live-track-title" className="booking-modal-title">
              {currentStepIndex >= 2 ? `${proName} has arrived` : `${proName} is on the way`}
            </h2>
            <p className="booking-modal-sub">
              {booking.serviceTitle} · {locality.split(',')[0]}
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

        {/* Real Uber-Styled Tracking Map */}
        <UberStyleTrackingMap
          jobRef={booking.bookingRef || booking.bookingId || booking.requestRef}
          destLat={booking.lat || booking.service_lat}
          destLng={booking.lng || booking.service_lng}
          initialProLat={booking.technicianLat}
          initialProLng={booking.technicianLng}
          initialEtaMinutes={booking.etaMinutes || 15}
          onEtaChange={setCurrentEta}
        />

        {/* 5-Step Tracker: Confirmed, On the way, Arrived, In progress, Completed */}
        <div
          className="tracker-steps-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            background: '#ffffff',
            borderBottom: '1px solid #f3f4f6'
          }}
        >
          {TRACKER_STEPS.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <React.Fragment key={step.key}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: isCompleted || isCurrent ? '#059669' : '#e5e7eb',
                      color: isCompleted || isCurrent ? '#ffffff' : '#6b7280',
                      boxShadow: isCurrent ? '0 0 0 3px rgba(5,150,105,0.2)' : 'none'
                    }}
                  >
                    {isCompleted ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? '#111827' : (isCompleted ? '#059669' : '#9ca3af')
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < TRACKER_STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: '2px',
                      background: idx < currentStepIndex ? '#059669' : '#e5e7eb',
                      margin: '0 4px',
                      marginBottom: '18px'
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Technician Profile Card (Real details only, no hardcoding) */}
        <div className="live-pro-contact-card" style={{ margin: '1rem 1.25rem' }}>
          <div className="pro-avatar-badge">
            <span className="pro-initials">{proName.charAt(0)}</span>
            <span className="verified-shield-icon" title="Identity Verified">
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
                <span>
                  {proRating && Number(proRating) > 0 ? Number(proRating).toFixed(1) : 'New'} ({proJobs} jobs)
                </span>
              </span>
            </div>
            <span className="pro-role-subtitle">
              {booking.isMaster ? `Master ${proTrade}` : proTrade}
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

        {/* Doorstep Verification OTP: Revealed ONLY after arrival! */}
        {isArrivedOrLater && booking.otpCode && (
          <div className="doorstep-otp-strip" style={{ margin: '0 1.25rem 1.25rem' }}>
            <div className="otp-info-group">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <span className="otp-title">Door Verification OTP</span>
                <span className="otp-desc">Share with {proName} to start service</span>
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
