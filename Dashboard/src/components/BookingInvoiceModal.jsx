import React, { useRef } from 'react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export default function BookingInvoiceModal({ isOpen, onClose, booking }) {
  const modalRef = useRef(null);
  const invoiceRef = useRef(null);

  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen || !booking) return null;

  const invoiceNum = `INV-${(booking.bookingId || booking.bookingRef || 'NVF-24090000').replace(/[^0-9A-Z]/gi, '')}`;
  const invoiceDate = booking.completedAt
    ? new Date(booking.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : (booking.date || '14 Aug 2026');

  const totalAmount = parseFloat(booking.totalAmount || booking.price || 450);
  const partsAmount = booking.partsAmount ? parseFloat(booking.partsAmount) : (booking.breakdown?.parts || 0);
  const taxableLabor = Math.max(0, Math.round((totalAmount - partsAmount) / 1.18));
  const gstAmount = Math.max(0, Math.round(taxableLabor * 0.18));
  const cgst = Math.round(gstAmount / 2);
  const sgst = gstAmount - cgst;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate styled printable HTML Blob and trigger download
    const printableContent = invoiceRef.current ? invoiceRef.current.innerHTML : '';
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>NivaaroFix Tax Invoice - ${invoiceNum}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; color: #101820; margin: 0; padding: 20px; background: #ffffff; }
          .invoice-sheet { max-width: 780px; margin: 0 auto; border: 1px solid #e3ddd0; padding: 32px; border-radius: 8px; }
          .inv-header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 24px; }
          .inv-brand h1 { margin: 0; font-size: 24px; font-family: Georgia, serif; color: #1e3a5f; }
          .inv-brand p { margin: 4px 0 0 0; font-size: 12px; color: #5a6472; }
          .inv-meta { text-align: right; }
          .inv-meta h2 { margin: 0; font-size: 18px; color: #a9793c; }
          .inv-meta p { margin: 3px 0; font-size: 12px; color: #5a6472; }
          .inv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; padding: 16px; background: #f7f5f1; border-radius: 6px; }
          .inv-col h3 { margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; color: #1e3a5f; letter-spacing: 0.5px; }
          .inv-col p { margin: 2px 0; font-size: 13px; color: #101820; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { text-align: left; padding: 10px; background: #1e3a5f; color: #ffffff; font-size: 12px; }
          td { padding: 12px 10px; border-bottom: 1px solid #e3ddd0; font-size: 13px; }
          .text-right { text-align: right; }
          .totals-table { width: 280px; margin-left: auto; margin-bottom: 24px; }
          .totals-table td { padding: 6px 10px; }
          .total-row td { font-weight: bold; font-size: 15px; color: #0f4d3c; border-top: 2px solid #1e3a5f; }
          .inv-footer { border-top: 1px solid #e3ddd0; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #5a6472; }
          .warranty-seal { border: 1px solid #0f4d3c; background: rgba(15, 77, 60, 0.06); color: #0f4d3c; padding: 8px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="invoice-sheet">
          ${printableContent}
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${invoiceNum}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
              <span>Official Tax Invoice</span>
            </span>
            <h2 id="invoice-modal-title" className="booking-modal-title">
              {invoiceNum}
            </h2>
          </div>

          <div className="modal-header-actions">
            <button type="button" className="btn-icon-action" onClick={handlePrint} title="Print Invoice">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print</span>
            </button>

            <button type="button" className="btn-icon-action primary" onClick={handleDownload} title="Download HTML/PDF Invoice">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
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
              <p className="inv-company-name">NivaaroFix Home Services Private Limited</p>
              <p className="inv-company-addr">GSTIN: 33AABCN1234F1Z8 · State: Tamil Nadu (33)</p>
              <p className="inv-company-addr">Doorstep Verification Hub, Chennai - 600040</p>
            </div>

            <div className="inv-meta">
              <h3 className="inv-tax-heading">TAX INVOICE</h3>
              <p><strong>Invoice No:</strong> {invoiceNum}</p>
              <p><strong>Date:</strong> {invoiceDate}</p>
              <p><strong>Booking Ref:</strong> {booking.bookingId || booking.bookingRef}</p>
              <p><strong>Payment:</strong> {booking.paymentMethod || 'UPI / Instant Verified'}</p>
            </div>
          </div>

          {/* Customer & Technician Grid */}
          <div className="inv-grid">
            <div className="inv-col">
              <h4 className="inv-section-title">Billed To (Customer)</h4>
              <p className="inv-customer-name"><strong>{booking.userName || 'Customer'}</strong></p>
              <p>{booking.userPhone || '+91 ••••• •••••'}</p>
              <p>{booking.userEmail || 'customer@nivaarofix.in'}</p>
              <p className="inv-address-line">{booking.address || booking.locality || 'Service Address'}</p>
            </div>

            <div className="inv-col">
              <h4 className="inv-section-title">Professional</h4>
              <p><strong>{booking.technicianName || 'Assigned Professional'}</strong></p>
              <p>Professional ID: FIX-{booking.technicianPhone ? booking.technicianPhone.slice(-4) : (booking.partnerId ? booking.partnerId.slice(-4) : 'PRO')}</p>
              <p>Trade: {booking.technicianRole || (booking.category === 'plumber' ? 'Certified Master Plumber' : 'Certified Master Electrician')}</p>
              <p>Service Status: Completed & Verified</p>
            </div>
          </div>

          {/* Itemized Services Table */}
          <table className="inv-table" role="table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '45%' }}>Description of Service</th>
                <th scope="col" style={{ width: '15%' }} className="text-center">SAC Code</th>
                <th scope="col" style={{ width: '15%' }} className="text-right">Qty</th>
                <th scope="col" style={{ width: '25%' }} className="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{booking.serviceTitle || 'Inspection & Repair Visit'}</strong>
                  <div className="inv-table-sub">
                    {booking.issueType || 'Standard doorstep diagnostic and professional repair'}
                  </div>
                </td>
                <td className="text-center">998719</td>
                <td className="text-right">1 Visit</td>
                <td className="text-right">₹{taxableLabor.toFixed(2)}</td>
              </tr>

              {partsAmount > 0 && (
                <tr>
                  <td>
                    <strong>Genuine Replacement Parts</strong>
                    <div className="inv-table-sub">Approved OEM-grade replacement hardware</div>
                  </td>
                  <td className="text-center">998729</td>
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
                  <td>Taxable Value:</td>
                  <td className="text-right">₹{(taxableLabor + partsAmount).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>CGST (9%):</td>
                  <td className="text-right">₹{cgst.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>SGST (9%):</td>
                  <td className="text-right">₹{sgst.toFixed(2)}</td>
                </tr>
                <tr className="inv-total-final-row">
                  <td><strong>Total Paid (INR):</strong></td>
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
              <span className="auth-stamp-text">Digitally Authorized by NivaaroFix</span>
              <span className="auth-stamp-sub">Computer generated invoice. No physical signature required.</span>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="booking-modal-footer no-print">
          <button type="button" className="btn-secondary-neutral" onClick={onClose}>
            Close Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
