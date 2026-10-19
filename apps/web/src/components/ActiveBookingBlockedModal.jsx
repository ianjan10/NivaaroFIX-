import React, { useEffect } from 'react';
import { useBooking } from '../context/BookingContext';

/**
 * Format status into customer-friendly professional status text
 */
function formatStatusLabel(status) {
  const s = (status || '').toLowerCase();
  if (s === 'en route' || s === 'on the way') return 'On the way · Approaching Doorstep';
  if (s === 'arrived') return 'Arrived · Doorstep Verification Pending';
  if (s === 'otp verified' || s === 'in progress') return 'In Progress · Service Underway';
  if (s === 'accepted' || s === 'confirmed') return 'Confirmed · Technician Departure Required';
  if (s === 'open' || s === 'broadcasting' || s === 'quoting') return 'Quoting · Matching Nearby Verified Professionals';
  return status || 'Active Service';
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Active Today';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${day}, ${time}`;
  } catch {
    return 'Active Today';
  }
}

export default function ActiveBookingBlockedModal({ onNavigateToBookings }) {
  const {
    isRunningBookingBlockedModalOpen,
    closeRunningBookingBlockedModal,
    runningBookingBlockedData,
    runningBooking
  } = useBooking();

  const activeJob = runningBookingBlockedData || runningBooking;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isRunningBookingBlockedModalOpen) {
        closeRunningBookingBlockedModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunningBookingBlockedModalOpen, closeRunningBookingBlockedModal]);

  if (!isRunningBookingBlockedModalOpen) return null;

  const handleTrackBooking = () => {
    closeRunningBookingBlockedModal();
    if (onNavigateToBookings) {
      onNavigateToBookings();
    } else {
      window.location.hash = '#/bookings';
    }
  };

  const statusText = formatStatusLabel(activeJob?.status);
  const isEnRouteOrInProgress = ['en route', 'on the way', 'arrived', 'in progress', 'otp verified', 'accepted', 'confirmed'].includes(
    (activeJob?.status || '').toLowerCase()
  );

  return (
    <div
      className="active-blocked-backdrop"
      onClick={closeRunningBookingBlockedModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-blocked-title"
    >
      <div
        className="active-blocked-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button (X) */}
        <button
          type="button"
          className="active-blocked-close-btn"
          onClick={closeRunningBookingBlockedModal}
          aria-label="Close active service notice"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Brand Icon Bubble */}
        <div className="active-blocked-icon-bubble">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--brand-primary, #047857)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        {/* Header Content */}
        <div className="active-blocked-header">
          <div className="active-blocked-eyebrow">NIVAAROFIX · DEDICATED SERVICE POLICY</div>
          <h2 id="active-blocked-title" className="active-blocked-title">
            Active Service in Progress
          </h2>
          <p className="active-blocked-desc">
            To guarantee 100% technician dedication and doorstep quality assurance, NivaaroFix provides dedicated 1-on-1 service. You cannot book another service until your active booking is completed.
          </p>
        </div>

        {/* Active Booking Card Spotlight */}
        {activeJob && (
          <div className="active-blocked-job-box">
            <div className="active-blocked-job-top">
              <div className="active-blocked-job-titles">
                <span className="active-blocked-job-service">
                  {activeJob.serviceTitle || (activeJob.category === 'plumber' ? 'Plumbing Repair' : 'Electrical Repair')}
                </span>
                {activeJob.requestRef && (
                  <span className="active-blocked-job-ref">
                    Ref: {activeJob.requestRef}
                  </span>
                )}
              </div>

              <div className={`active-blocked-status-pill ${isEnRouteOrInProgress ? 'live' : 'quoting'}`}>
                <span className="active-blocked-pulse-dot" />
                <span>{statusText}</span>
              </div>
            </div>

            <div className="active-blocked-grid">
              <div className="active-blocked-grid-item">
                <span className="active-blocked-grid-label">Location</span>
                <span className="active-blocked-grid-val" title={activeJob.address || 'Saved Address'}>
                  {activeJob.address ? activeJob.address.split(',').slice(0, 2).join(', ').trim() : 'Service Address Registered'}
                </span>
              </div>

              <div className="active-blocked-grid-item">
                <span className="active-blocked-grid-label">Technician</span>
                <span className="active-blocked-grid-val">
                  {activeJob.technicianName
                    ? `${activeJob.technicianName} (${activeJob.technicianTrade || 'Professional'})`
                    : 'Dispatching verified professionals'}
                </span>
              </div>

              <div className="active-blocked-grid-item">
                <span className="active-blocked-grid-label">Booked Date</span>
                <span className="active-blocked-grid-val">
                  {formatDisplayDate(activeJob.date || activeJob.createdAt)}
                </span>
              </div>

              <div className="active-blocked-grid-item">
                <span className="active-blocked-grid-label">Safety & Security</span>
                <span className="active-blocked-grid-val accent">
                  Door OTP Verified
                </span>
              </div>
            </div>

            <div className="active-blocked-notice-strip">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                As soon as your technician verifies the completion OTP at your door, your account will be instantly unlocked for new bookings.
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="active-blocked-actions">
          <button
            type="button"
            className="active-blocked-primary-btn"
            onClick={handleTrackBooking}
          >
            <span>Track Active Booking</span>
            <span className="active-blocked-arrow" aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            className="active-blocked-secondary-btn"
            onClick={closeRunningBookingBlockedModal}
          >
            Return to Services
          </button>
        </div>
      </div>
    </div>
  );
}
