import React from 'react';
import './CustomerPaymentModal.css';

function formatINR(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

export default function UnpaidCompletedJobModal({
  isOpen,
  onClose,
  unpaidJob,
  onPayNow
}) {
  if (!isOpen || !unpaidJob) return null;

  const jobRef = unpaidJob.requestRef || unpaidJob.service_request_code || unpaidJob.id;
  const serviceTitle = unpaidJob.serviceTitle || unpaidJob.service_title || 'Previous Home Service';
  const proName = unpaidJob.proName || unpaidJob.technician_name || unpaidJob.assignedProfessionalName || 'Service Technician';
  const amount = Number(unpaidJob.amount || unpaidJob.quote_amount || 0);

  return (
    <div
      className="pay-scrim-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unpaid-modal-title"
    >
      <div className="pay-glass-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="pay-sheet-close-btn"
          onClick={onClose}
          aria-label="Close alert"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="pay-status-state" style={{ padding: '8px 0' }}>
          <div className="pay-failed-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h3 id="unpaid-modal-title" className="pay-state-title" style={{ marginTop: '16px' }}>
            Pay for your previous service first
          </h3>
          <p className="pay-state-desc">
            To book another repair, please complete payment for your finished job. Your technician's payout is queued for Route bank transfer upon payment.
          </p>

          <div className="pay-success-meta-card" style={{ marginTop: '20px', textAlign: 'left' }}>
            <div className="pay-meta-row">
              <span className="pay-meta-label">Completed Service</span>
              <span className="pay-meta-val">{serviceTitle}</span>
            </div>
            <div className="pay-meta-row">
              <span className="pay-meta-label">Technician</span>
              <span className="pay-meta-val">{proName}</span>
            </div>
            <div className="pay-meta-row">
              <span className="pay-meta-label">Job Reference</span>
              <span className="pay-meta-val font-tabular">{jobRef}</span>
            </div>
            <div className="pay-meta-row" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: '6px', paddingTop: '6px' }}>
              <span className="pay-meta-label"><strong>Amount Due</strong></span>
              <span className="pay-meta-val font-tabular" style={{ fontSize: '1rem', color: '#047857' }}>
                <strong>{formatINR(amount)}</strong>
              </span>
            </div>
          </div>

          <div className="pay-actions-group" style={{ width: '100%', marginTop: '20px' }}>
            <button
              type="button"
              className="pay-btn-primary"
              onClick={() => {
                onClose();
                if (onPayNow) onPayNow(unpaidJob);
              }}
            >
              Pay now ({formatINR(amount)})
            </button>
            <button
              type="button"
              className="pay-btn-secondary"
              onClick={onClose}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

