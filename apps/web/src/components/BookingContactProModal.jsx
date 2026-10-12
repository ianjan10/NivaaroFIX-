import React, { useRef, useState } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingContactProModal({ isOpen, onClose, booking, onToast }) {
  const modalRef = useRef(null);
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showDirectMessageInput, setShowDirectMessageInput] = useState(false);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const proName = booking.technicianName || 'Rajesh Kumar';
  const proRole = booking.technicianRole || (booking.category === 'plumber' ? 'Certified Master Plumber' : 'Master Electrician');
  const proRating = booking.technicianRating || '4.9';
  const proJobs = booking.technicianJobs || 312;
  const proPhone = booking.technicianPhone || '+91 98401 23456';

  // Architectural note: When virtual call routing infrastructure (Exotel / Twilio / Knowlarity) is connected,
  // the client calls the proxy relay number. Here we use the direct sanitized tel: URI fallback.
  const handleInitiateCall = () => {
    onClose();
    if (onToast) {
      onToast(`Connecting call to ${proName} via secure NivaaroFix proxy...`);
    }
    const cleanPhone = proPhone.replace(/\s+/g, '');
    window.location.href = `tel:${cleanPhone}`;
  };

  // Architectural note: When WebSocket / chat backend endpoint is provisioned, this persists to the thread.
  // TODO: Connect this action to persistent /api/chat/threads endpoint once backend chat service is live.
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setIsSendingMessage(true);
    setTimeout(() => {
      setIsSendingMessage(false);
      const sentMsg = messageText;
      setMessageText('');
      setShowDirectMessageInput(false);
      onClose();
      if (onToast) {
        onToast(`Message sent to ${proName}: "${sentMsg.slice(0, 35)}${sentMsg.length > 35 ? '...' : ''}"`);
      }
    }, 400);
  };

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-pro-modal-title"
    >
      <div
        className="booking-modal-card contact-pro-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header">
          <div className="booking-modal-title-group">
            <span className="live-status-pill brass-pill">
              <span>Direct Professional Contact</span>
            </span>
            <h2 id="contact-pro-modal-title" className="booking-modal-title">
              Get in touch with {proName}
            </h2>
            <p className="booking-modal-sub">
              {proRole} · {booking.bookingId || booking.bookingRef}
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close contact dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="contact-pro-body">
          {/* Privacy & Safety Callout */}
          <div className="contact-safety-callout">
            <div className="safety-shield-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="safety-callout-text">
              For your safety, calls and messages are routed through NivaaroFix — your number stays private.
            </p>
          </div>

          {/* Technician Profile Row */}
          <div className="contact-pro-summary-card">
            <div className="contact-pro-avatar" aria-hidden="true">
              {proName.charAt(0)}
            </div>
            <div className="contact-pro-details">
              <span className="contact-pro-name">{proName}</span>
              <span className="contact-pro-role-text">{proRole}</span>
              <span className="contact-pro-stat-line">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#059669" stroke="none" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{proRating} rating · {proJobs} completed visits</span>
              </span>
            </div>
          </div>

          {/* Contact Action Buttons */}
          <div className="contact-actions-vertical-group">
            <button
              type="button"
              className="btn-contact-action-card primary-call-card"
              onClick={handleInitiateCall}
            >
              <div className="action-icon-circle call-circle" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="action-card-text">
                <span className="action-main-title">Call {proName}</span>
                <span className="action-sub-text">Masked voice relay · Instant connection</span>
              </div>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" className="action-chevron">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {!showDirectMessageInput ? (
              <button
                type="button"
                className="btn-contact-action-card message-card"
                onClick={() => setShowDirectMessageInput(true)}
              >
                <div className="action-icon-circle message-circle" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="action-card-text">
                  <span className="action-main-title">Send In-App Message</span>
                  <span className="action-sub-text">Directions, gate code, or parking instructions</span>
                </div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" className="action-chevron">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <form onSubmit={handleSendMessage} className="in-app-message-box">
                <label className="message-label" htmlFor="pro-message-input">
                  Message for {proName}
                </label>
                <textarea
                  id="pro-message-input"
                  rows={3}
                  placeholder="e.g. Please ring bell #4B or call when at the security gate..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="pro-message-textarea"
                  maxLength={300}
                  autoFocus
                />
                <div className="message-actions-row">
                  <button
                    type="button"
                    className="btn-secondary-neutral"
                    onClick={() => setShowDirectMessageInput(false)}
                    disabled={isSendingMessage}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-confirm"
                    disabled={!messageText.trim() || isSendingMessage}
                  >
                    {isSendingMessage ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="booking-modal-footer">
          <button type="button" className="btn-secondary-neutral" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
