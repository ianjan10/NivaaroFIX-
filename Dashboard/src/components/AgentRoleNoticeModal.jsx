import React, { useEffect } from 'react';
import { useBooking } from '../context/BookingContext';

export default function AgentRoleNoticeModal({ onSwitchToCustomer }) {
  const { isAgentNoticeOpen, closeAgentNotice } = useBooking();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isAgentNoticeOpen) {
        closeAgentNotice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAgentNoticeOpen, closeAgentNotice]);

  if (!isAgentNoticeOpen) return null;

  const handleLoginAsUser = () => {
    closeAgentNotice();
    if (onSwitchToCustomer) {
      onSwitchToCustomer();
    } else {
      window.location.href = `http://localhost:5500?portal=customer&returnTo=/services&lang=${localStorage.getItem('nivaarofix-lang') || 'en'}`;
    }
  };

  return (
    <div
      className="agent-notice-backdrop open"
      onClick={closeAgentNotice}
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-notice-title"
    >
      <div
        className="agent-notice-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="agent-notice-icon-bubble">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#B8862F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>

        <div className="agent-notice-content">
          <div className="agent-notice-eyebrow">ACCOUNT ROLE NOTICE</div>
          <h3 id="agent-notice-title" className="agent-notice-title">
            Bookings are available from a customer account.
          </h3>
          <p className="agent-notice-desc">
            You are currently signed in as a <strong>Professional</strong>. To book a repair for your home, please switch or sign in to a customer account.
          </p>
        </div>

        <div className="agent-notice-actions">
          <button
            type="button"
            className="agent-notice-cancel-btn"
            onClick={closeAgentNotice}
          >
            Continue as Professional
          </button>

          <button
            type="button"
            className="agent-notice-switch-btn"
            onClick={handleLoginAsUser}
          >
            <span>Log in as User →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
