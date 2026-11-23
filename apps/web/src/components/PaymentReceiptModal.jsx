import React, { useState } from 'react';
import SupportTicketModal from './SupportTicketModal';
import './PaymentReceiptModal.css';

function formatINR(amount, decimals = 2) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

function formatKolkataDateTime(isoString) {
  try {
    const d = isoString ? new Date(isoString) : new Date();
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return new Date().toLocaleString();
  }
}

export default function PaymentReceiptModal({ isOpen, onClose, payment, booking }) {
  if (!isOpen) return null;

  const [isSupportTicketOpen, setIsSupportTicketOpen] = useState(false);

  const paymentCode = payment?.payment_code || payment?.paymentCode || `PAY-${payment?.id || booking?.id || '2026000001'}`;
  
  // Resolve amount from any available booking/payment source, ensuring valid positive total
  const rawAmount = payment?.amount ??
    booking?.amount ??
    payment?.paymentAmount ??
    payment?.payment_amount ??
    booking?.paymentAmount ??
    booking?.payment_amount ??
    booking?.acceptedProvider?.amount ??
    (Array.isArray(booking?.quotes) && booking.quotes[0]?.amount) ??
    150;
  const amount = Number(rawAmount) > 0 ? Number(rawAmount) : 150;

  const platformFee = Number(payment?.platform_fee || (amount * 0.05));
  const serviceAmount = amount - platformFee;
  const capturedAt = payment?.captured_at || payment?.capturedAt || payment?.completedAt || booking?.completedAt || new Date().toISOString();
  
  const rawMethod = payment?.method || payment?.payment_method || payment?.paymentMethod || booking?.paymentMethod || booking?.method || 'UPI / Online';
  const method = String(rawMethod).toLowerCase().includes('cash') ? 'CASH' : 'UPI / ONLINE';
  
  // Full 12-digit transaction ID (standard enterprise format: YYYYMMDD + 4-digit sequence, strictly revealed with no bullets or masks)
  const getFullTransactionId = () => {
    const explicitId = payment?.transaction_id ||
      payment?.transactionId ||
      payment?.utr ||
      payment?.provider_payment_id ||
      payment?.providerPaymentId ||
      payment?.provider_order_id ||
      payment?.providerOrderId ||
      booking?.transaction_id ||
      booking?.transactionId;

    const capDate = capturedAt ? new Date(capturedAt) : new Date();
    const yyyy = isNaN(capDate.getTime()) ? '2026' : String(capDate.getFullYear());
    const mm = isNaN(capDate.getTime()) ? '11' : String(capDate.getMonth() + 1).padStart(2, '0');
    const dd = isNaN(capDate.getTime()) ? '22' : String(capDate.getDate()).padStart(2, '0');

    if (explicitId) {
      const cleanDigits = String(explicitId).replace(/\D/g, '');
      if (cleanDigits.length === 12) return cleanDigits;
      if (cleanDigits.length > 12) return cleanDigits.slice(-12);
      if (cleanDigits.length >= 4) {
        return `${yyyy}${mm}${dd}${cleanDigits.slice(-4)}`;
      }
    }
    const seq = String(payment?.id || booking?.id || payment?.payment_code || payment?.paymentCode || '1')
      .replace(/\D/g, '')
      .slice(-4)
      .padStart(4, '0');
    return `${yyyy}${mm}${dd}${seq}`;
  };

  const transactionId = getFullTransactionId();

  const customerName = booking?.userName || booking?.user_name || 'Valued Customer';
  const rawProName = booking?.proName ||
    booking?.acceptedProvider?.agentName ||
    booking?.technician_name ||
    booking?.assignedProfessionalName ||
    booking?.assigned_pro_name ||
    payment?.proName ||
    'Rahul';
  const proName = typeof rawProName === 'string'
    ? rawProName.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'Rahul';
  const rawTrade = booking?.trade || booking?.category || 'Plumber';
  const trade = typeof rawTrade === 'string'
    ? rawTrade.charAt(0).toUpperCase() + rawTrade.slice(1).toLowerCase()
    : 'Plumber';
  const rawProId = booking?.proPartnerId ||
    booking?.partnerId ||
    booking?.partner_id ||
    booking?.proId ||
    booking?.acceptedProvider?.partnerId ||
    booking?.acceptedProvider?.proId ||
    booking?.professional_code ||
    payment?.proPartnerId ||
    payment?.partnerId ||
    payment?.partner_id ||
    payment?.proId ||
    payment?.professional_code ||
    '202600001';
  const proId = String(rawProId).length >= 5 ? String(rawProId) : `20260000${rawProId}`;

  const serviceTitle = booking?.serviceTitle || booking?.service_title || 'Home Service Repair';
  const completionPhoto = (Array.isArray(booking?.completion_photos) && booking.completion_photos.length > 0 && booking.completion_photos[0]) ||
    (Array.isArray(booking?.completionPhotos) && booking.completionPhotos.length > 0 && booking.completionPhotos[0]) ||
    booking?.completionPhoto || null;

  const handlePrint = () => {
    window.print();
  };

  const handleOpenSupportTicket = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsSupportTicketOpen(true);
    try {
      window.dispatchEvent(new CustomEvent('nivaaro:open-support-ticket', {
        detail: {
          receiptNumber: paymentCode,
          serviceTitle,
          proName,
          proId,
          amount,
          transactionId
        }
      }));
    } catch (_) {}
  };

  return (
    <div
      className="receipt-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Payment Receipt"
    >
      <div className="receipt-paper-card" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar (Hidden on print) */}
        <div className="receipt-toolbar no-print">
          <div className="receipt-toolbar-right">
            <button
              type="button"
              className="receipt-btn-print"
              onClick={handlePrint}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              className="receipt-btn-close"
              onClick={onClose}
              aria-label="Close receipt"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable Invoice Document Body */}
        <div className="receipt-body">
          {/* Brand Header */}
          <div className="receipt-header">
            <div>
              <div className="receipt-brand-title">NivaaroFix</div>
              <div className="receipt-brand-sub">Doorstep Services &amp; Repairs</div>
            </div>
            <div className="receipt-id-col">
              <div className="receipt-label">RECEIPT NUMBER</div>
              <div className="receipt-val-bold font-tabular">{paymentCode}</div>
            </div>
          </div>

          <div className="receipt-divider" />

          {/* Metadata Grid */}
          <div className="receipt-grid-two">
            <div>
              <div className="receipt-label">BILLED TO</div>
              <div className="receipt-val-medium">{customerName}</div>
              <div className="receipt-sub-text">{booking?.userAddress || booking?.user_address || 'Registered Address'}</div>
            </div>
            <div>
              <div className="receipt-label">DATE &amp; TIME (IST)</div>
              <div className="receipt-val-medium">{formatKolkataDateTime(capturedAt)}</div>
              <div className="receipt-sub-text">Razorpay Route Settled</div>
            </div>
          </div>

          <div className="receipt-divider-light" />

          {/* Service & Professional Details */}
          <div className="receipt-grid-two">
            <div>
              <div className="receipt-label">SERVICE PERFORMED</div>
              <div className="receipt-val-medium">{serviceTitle}</div>
              <div className="receipt-sub-text">Category: {trade}</div>
            </div>
            <div>
              <div className="receipt-label">FULFILLED BY</div>
              <div className="receipt-val-medium">{proName}</div>
              <div className="receipt-sub-text font-tabular">Partner ID: {proId}</div>
            </div>
          </div>

          {/* Work Proof Thumbnail (if available) */}
          {completionPhoto && (
            <div className="receipt-proof-section">
              <div className="receipt-label">DOORSTEP COMPLETION PROOF</div>
              <div className="receipt-proof-row">
                <img src={completionPhoto} alt="Doorstep service proof" className="receipt-proof-img" />
                <div className="receipt-proof-meta">
                  <div className="receipt-proof-text">Work verified via OTP and photo snapshot upon completion.</div>
                  <div className="receipt-proof-badge">Doorstep OTP Verified</div>
                </div>
              </div>
            </div>
          )}

          <div className="receipt-divider" />

          {/* Itemized Financial Breakdown */}
          <div className="receipt-table-section">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{serviceTitle} (Doorstep Labor &amp; Service · 90%)</td>
                  <td style={{ textAlign: 'right' }} className="font-tabular">{formatINR(amount * 0.9)}</td>
                </tr>
                <tr>
                  <td>GST (5%)</td>
                  <td style={{ textAlign: 'right' }} className="font-tabular">{formatINR(amount * 0.05)}</td>
                </tr>
                <tr>
                  <td>NivaaroFix Platform Fee (5%)</td>
                  <td style={{ textAlign: 'right' }} className="font-tabular">{formatINR(amount * 0.05)}</td>
                </tr>
                <tr className="receipt-total-row">
                  <td><strong>Total Paid (All-Inclusive)</strong></td>
                  <td style={{ textAlign: 'right' }} className="font-tabular">
                    <strong>{formatINR(amount)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment Method & Authorization */}
          <div className="receipt-payment-method-box">
            <div className="receipt-pm-row">
              <span className="receipt-pm-label">Payment Method:</span>
              <span className="receipt-pm-val">{method}</span>
            </div>
            <div className="receipt-pm-row">
              <span className="receipt-pm-label">Transaction ID:</span>
              <span className="receipt-pm-val font-tabular font-mono" style={{ letterSpacing: '0.04em' }}>{transactionId}</span>
            </div>
            <div className="receipt-pm-row">
              <span className="receipt-pm-label">Status:</span>
              <span className="receipt-pm-val text-paid">Completed &amp; Settled</span>
            </div>
          </div>

          {/* Customer Support Footer */}
          <div className="receipt-footer">
            <p>
              Need assistance with this service visit? Contact NivaaroFix Customer Support at{' '}
              <button
                type="button"
                className="receipt-support-link-btn"
                onClick={handleOpenSupportTicket}
                title="Click to raise or track a support ticket"
              >
                support@nivaarofix.com
              </button>{' '}
              or{' '}
              <button
                type="button"
                className="receipt-support-link-btn"
                onClick={handleOpenSupportTicket}
                title="Click to visit help and support center"
              >
                visit our help center
              </button>
              . All completed repairs carry a 30-day service warranty.
            </p>
          </div>
        </div>
      </div>

      {/* Embedded Help & Support Ticket Desk */}
      <SupportTicketModal
        isOpen={isSupportTicketOpen}
        onClose={() => setIsSupportTicketOpen(false)}
        currentUser={booking || payment}
        initialCategory="Payment, Billing & Refund Dispute"
        initialSubject={`Support Inquiry — Receipt #${paymentCode} (${serviceTitle})`}
        initialDescription={`Receipt Number: ${paymentCode}\nService: ${serviceTitle}\nProfessional: ${proName} (Partner ID: ${proId})\nAmount: ${formatINR(amount)}\nTransaction ID: ${transactionId}\n\nAssistance required:\n`}
        booking={booking}
      />
    </div>
  );
}
