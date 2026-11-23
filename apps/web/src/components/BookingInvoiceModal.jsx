import React, { useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingInvoiceModal({ isOpen, onClose, booking }) {
  const modalRef = useRef(null);
  const invoiceRef = useRef(null);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const invoiceNum = `SUM-${(booking.bookingId || booking.bookingRef || 'NVF-PREVIEW').replace(/[^0-9A-Z]/gi, '')}`;
  const invoiceDate = booking.completedAt
    ? new Date(booking.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : (booking.date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));

  const totalAmount = parseFloat(booking.totalAmount || booking.price || booking.approvedCharges || booking.estimatedTotal || 0);
  const partsAmount = booking.partsAmount ? parseFloat(booking.partsAmount) : (booking.breakdown?.parts || 0);
  const laborAmount = Math.max(0, totalAmount - partsAmount);

  // Authoritative platform commission configuration
  const PLATFORM_COMMISSION_PERCENT = 15;
  const platformCommission = (totalAmount * PLATFORM_COMMISSION_PERCENT) / 100;

  // Strict payment status derivation: Completed does NOT imply Paid.
  // Must be verified via explicit ledger/transaction status.
  const isExplicitlyPaid = booking.paymentStatus === 'PAID' || 
                           booking.payment_status === 'PAID' || 
                           booking.isPaid === true ||
                           Boolean(booking.transactionId && booking.settledAt);

  const paymentStatusDisplay = isExplicitlyPaid
    ? 'Paid & Settled'
    : (booking.paymentStatus ? String(booking.paymentStatus) : 'Payment Pending Verification');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="uber-lang-modal-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
    >
      <div
        className="booking-modal-card invoice-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="booking-modal-header no-print">
          <div className="booking-modal-title-group">
            <span className="live-status-pill forest-pill">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Service Summary & Invoice Preview</span>
            </span>
            <h2 id="invoice-modal-title" className="booking-modal-title">
              {invoiceNum}
            </h2>
          </div>

          <div className="modal-header-actions">
            <button type="button" className="btn-icon-action primary" onClick={handlePrint} title="Print / Save as PDF">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print / Save as PDF</span>
            </button>

            <button type="button" className="uber-lang-close-btn" onClick={onClose} aria-label="Close invoice">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet Container */}
        <div className="invoice-sheet-container" ref={invoiceRef}>
          {/* Brand Header */}
          <div className="inv-header">
            <div className="inv-brand">
              <div className="inv-brand-logo">
                <img
                  src="/brand/logo-horizontal.png"
                  alt="NivaaroFix"
                  style={{ height: '36px', width: 'auto', display: 'block', marginBottom: '6px' }}
                />
              </div>
              <p className="inv-company-name">NivaaroFix Marketplace</p>
              <p className="inv-company-addr">Hyperlocal On-Demand Home Services</p>
              <p className="inv-company-addr">Platform Service Receipt & Statement</p>
            </div>

            <div className="inv-meta">
              <h3 className="inv-tax-heading" style={{ color: '#047857' }}>SERVICE SUMMARY</h3>
              <p><strong>Reference No:</strong> {invoiceNum}</p>
              <p><strong>Date:</strong> {invoiceDate}</p>
              <p><strong>Booking Ref:</strong> {booking.bookingId || booking.bookingRef || 'N/A'}</p>
              <p><strong>Payment Status:</strong> {paymentStatusDisplay}</p>
            </div>
          </div>

          {/* Customer & Technician Grid */}
          <div className="inv-grid">
            <div className="inv-col">
              <h4 className="inv-section-title">Customer Details</h4>
              <p className="inv-customer-name"><strong>{booking.userName || 'Customer'}</strong></p>
              <p>{booking.userPhone || '+91 ••••• •••••'}</p>
              <p>{booking.userEmail || 'customer@nivaarofix.in'}</p>
              <p className="inv-address-line">{booking.address || booking.locality || 'Service Address'}</p>
            </div>

            <div className="inv-col">
              <h4 className="inv-section-title">Service Professional</h4>
              <p><strong>{booking.technicianName || 'Assigned Professional'}</strong></p>
              <p>Professional ID: FIX-{booking.technicianPhone ? booking.technicianPhone.slice(-4) : (booking.partnerId ? booking.partnerId.slice(-4) : 'PRO')}</p>
              <p>Trade: {booking.technicianRole || (booking.category === 'plumber' ? 'Verified Plumber' : 'Verified Electrician')}</p>
              <p>Status: {booking.status || 'Verified Visit'}</p>
            </div>
          </div>

          {/* Itemized Services Table */}
          <table className="inv-table" role="table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '60%' }}>Service Description</th>
                <th scope="col" style={{ width: '15%' }} className="text-right">Units</th>
                <th scope="col" style={{ width: '25%' }} className="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{booking.serviceTitle || 'Doorstep Diagnostic & Repair Visit'}</strong>
                  <div className="inv-table-sub">
                    {booking.issueType || 'Standard doorstep diagnostic and professional repair service'}
                  </div>
                </td>
                <td className="text-right">1 Visit</td>
                <td className="text-right">₹{laborAmount.toFixed(2)}</td>
              </tr>

              {partsAmount > 0 && (
                <tr>
                  <td>
                    <strong>Replacement Materials / Hardware</strong>
                    <div className="inv-table-sub">Approved technician replacement parts</div>
                  </td>
                  <td className="text-right">1 Lot</td>
                  <td className="text-right">₹{partsAmount.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals Summary */}
          <div className="inv-totals-box">
            <table className="inv-totals-table">
              <tbody>
                <tr>
                  <td>Labor & Inspection:</td>
                  <td className="text-right">₹{laborAmount.toFixed(2)}</td>
                </tr>
                {partsAmount > 0 && (
                  <tr>
                    <td>Parts & Hardware:</td>
                    <td className="text-right">₹{partsAmount.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="inv-total-final-row">
                  <td><strong>Total Service Charges:</strong></td>
                  <td className="text-right"><strong>₹{totalAmount.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Warranty & Authorization Stamp */}
          <div className="inv-footer-strip">
            <div className="inv-warranty-seal">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>30-Day Doorstep Guarantee Protection Active</span>
            </div>

            <div className="inv-digital-auth">
              <span className="auth-stamp-text">Electronically Generated Record</span>
              <span className="auth-stamp-sub">Official tax invoices are issued upon payment gateway settlement.</span>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="booking-modal-footer no-print">
          <button type="button" className="btn-secondary-neutral" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
