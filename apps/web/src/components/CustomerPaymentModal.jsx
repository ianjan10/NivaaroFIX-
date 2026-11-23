import React, { useState, useEffect, useRef } from 'react';
import './CustomerPaymentModal.css';

/**
 * Format INR with tabular digits and comma separation
 */
function formatINR(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Format date in Asia/Kolkata timezone
 */
function formatKolkataTime(isoString) {
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

/**
 * Capitalize first letter of each word (Title Case)
 */
function formatName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function CustomerPaymentModal({
  isOpen,
  onClose,
  booking,
  onPaymentSuccess,
  onOpenReceipt
}) {
  const [state, setState] = useState('idle'); // 'idle' | 'processing' | 'pending' | 'success' | 'failed'
  const [paymentMode, setPaymentMode] = useState('online'); // 'online' | 'cash'
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [selectedTags, setSelectedTags] = useState(['On-Time Arrival', 'Clean Workmanship']);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [mockSimulatorOpen, setMockSimulatorOpen] = useState(false);
  const [mockSimulatingMethod, setMockSimulatingMethod] = useState('upi');
  const [lastVerifyResult, setLastVerifyResult] = useState(null);

  const quickTags = [
    'On-Time Arrival',
    'Clean Workmanship',
    'Clear Explanations',
    'Fair Pricing',
    'Polite & Professional',
    'Fast Diagnostic'
  ];

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const bookingId = booking?.id || booking?.requestRef || booking?.service_request_code;
  const rawProName = booking?.proName ||
    booking?.acceptedProvider?.agentName ||
    booking?.technician_name ||
    booking?.assignedProfessionalName ||
    booking?.agent_name ||
    paymentDetails?.pro_name ||
    'Rahul';
  const proName = formatName(rawProName) || 'Certified Technician';
  const rawTrade = booking?.trade || booking?.category || 'Plumber';
  const proTrade = formatName(rawTrade);

  // Determine intelligent display title (prefer custom customer problem)
  const prob = (booking?.problemDescription || '').trim();
  const issue = (booking?.issueType || booking?.issue_type || '').trim();
  const rawTitle = booking?.serviceTitle || booking?.service_title || '';
  let serviceTitle = rawTitle;
  if (prob && !['general service', 'home service repair', 'inspection & repair'].includes(prob.toLowerCase())) {
    serviceTitle = prob.charAt(0).toUpperCase() + prob.slice(1);
  } else if (issue && !['general service', 'home service repair', 'inspection & repair'].includes(issue.toLowerCase())) {
    serviceTitle = issue.charAt(0).toUpperCase() + issue.slice(1);
  } else if (!serviceTitle || serviceTitle.toLowerCase().includes('taps, mixers & showers')) {
    serviceTitle = prob || issue || 'Taps, Mixers & Showers';
  }

  const rawAmount = paymentDetails?.amount ||
    booking?.amount ||
    booking?.final_amount ||
    booking?.quote_amount ||
    booking?.paymentAmount ||
    booking?.totalAmount ||
    booking?.acceptedProvider?.amount ||
    booking?.estimatedCost ||
    0;
  const numAmount = Number(rawAmount) || 0;

  // Completion photo thumbnail
  let completionPhoto = null;
  const rawPhotos = booking?.completionPhotos || booking?.completion_photos || booking?.completionPhoto || paymentDetails?.completionPhotos || paymentDetails?.completion_photos;
  if (Array.isArray(rawPhotos) && rawPhotos.length > 0) {
    completionPhoto = rawPhotos[0];
  } else if (typeof rawPhotos === 'string' && rawPhotos.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawPhotos);
      if (Array.isArray(parsed) && parsed.length > 0) {
        completionPhoto = parsed[0];
      } else {
        completionPhoto = rawPhotos;
      }
    } catch {
      completionPhoto = rawPhotos;
    }
  }

  // Fetch or restore payment state when modal opens
  useEffect(() => {
    if (!isOpen || !bookingId) return;

    let isMounted = true;
    setState('idle');
    setErrorMessage('');

    const checkExistingPayment = async () => {
      try {
        const res = await fetch(`/api/payments/${bookingId}`, {
          credentials: 'include'
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.payment) {
          setPaymentDetails(data.payment);
          if (data.payment.status === 'paid') {
            setState('success');
          } else if (data.payment.status === 'processing') {
            setState('processing');
          } else if (data.payment.status === 'failed') {
            setState('failed');
            setErrorMessage(data.payment.failure_reason || 'Previous payment attempt failed.');
          }
        }
      } catch (err) {
        console.warn('Payment status query notice:', err.message);
      }
    };

    checkExistingPayment();

    return () => {
      isMounted = false;
    };
  }, [isOpen, bookingId]);

  if (!isOpen) return null;

  const handleStartPayment = async () => {
    setState('processing');
    setErrorMessage('');

    try {
      const orderRes = await fetch(`/api/payments/${bookingId}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        throw new Error(orderData.error || 'Failed to initiate secure payment order.');
      }

      setPaymentDetails(orderData.payment);

      if (orderData.payment?.status === 'paid') {
        setState('success');
        return;
      }

      if (orderData.mock || orderData.keyId === 'rzp_test_mock' || !window.Razorpay) {
        setMockSimulatorOpen(true);
        setState('idle');
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'NivaaroFix Doorstep Services',
        description: `${serviceTitle} · Ref: ${booking?.requestRef || bookingId}`,
        order_id: orderData.orderId,
        prefill: {
          name: booking?.userName || booking?.user_name || '',
          email: booking?.userEmail || booking?.user_email || '',
          contact: booking?.userPhone || booking?.user_phone || ''
        },
        theme: {
          color: '#059669'
        },
        modal: {
          ondismiss: () => {
            setState('idle');
          }
        },
        handler: async (response) => {
          await verifyPaymentOnServer({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature
          });
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setState('failed');
        setErrorMessage(resp.error?.description || 'Payment was declined by your bank or card issuer.');
      });
      rzp.open();

    } catch (err) {
      console.error('Payment checkout initiation failed:', err);
      setState('failed');
      setErrorMessage(err.message || 'Unable to connect to payment provider.');
    }
  };

  const verifyPaymentOnServer = async ({ orderId, paymentId, signature }) => {
    setState('processing');
    try {
      const verifyRes = await fetch(`/api/payments/${bookingId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          paymentId,
          signature,
          rating,
          feedback,
          tags: selectedTags
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Payment signature verification failed.');
      }

      if (orderId && (orderId.startsWith('order_mock_') || /^\d{10,14}$/.test(orderId))) {
        await fetch('/api/webhooks/mock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment.captured',
            payload: {
              payment: {
                entity: {
                  id: paymentId,
                  order_id: orderId,
                  amount: Math.round(numAmount * 100),
                  status: 'captured',
                  method: mockSimulatingMethod
                }
              }
            }
          })
        }).catch(() => {});
      }

      setState('success');
      setLastVerifyResult(verifyData);
      setPaymentDetails((prev) => ({
        ...prev,
        status: 'paid',
        method: 'online',
        provider_payment_id: paymentId,
        payment_code: verifyData.paymentCode || prev?.payment_code
      }));
    } catch (err) {
      console.error('Payment verification failed:', err);
      setState('failed');
      setErrorMessage(err.message || 'Verification could not be confirmed.');
    }
  };

  const handleCashPayment = async () => {
    setState('processing');
    setErrorMessage('');
    try {
      const cashRes = await fetch(`/api/payments/${bookingId}/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          feedback,
          tags: selectedTags
        })
      });

      const data = await cashRes.json();
      if (!cashRes.ok || !data.success) {
        throw new Error(data.error || 'Failed to record cash on delivery.');
      }

      setState('success');
      setLastVerifyResult(data);
      setPaymentDetails({
        ...(data.payment || {}),
        status: 'paid',
        method: 'cash',
        amount: numAmount,
        payment_code: data.paymentCode || `PAY-${bookingId}`,
        captured_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Cash payment failed:', err);
      setState('failed');
      setErrorMessage(err.message || 'Unable to confirm cash payment.');
    }
  };

  const handleSimulateMockSuccess = async () => {
    setMockSimulatorOpen(false);
    setState('processing');

    try {
      const capDate = new Date();
      const yyyy = capDate.getFullYear();
      const mm = String(capDate.getMonth() + 1).padStart(2, '0');
      const dd = String(capDate.getDate()).padStart(2, '0');
      const seq = String(booking?.id || paymentDetails?.id || 1).replace(/\D/g, '').slice(-4).padStart(4, '0');
      const rawOrder = paymentDetails?.provider_order_id || paymentDetails?.order?.id || paymentDetails?.payment?.provider_order_id;
      const orderId = rawOrder && /^\d{8,16}$/.test(rawOrder) ? rawOrder : `${yyyy}${mm}${dd}01${seq.slice(-2)}`;
      const paymentId = `${yyyy}${mm}${dd}${seq}`; // 12-digit numeric: 202611220004
      const mockSignature = `mock_sig_${orderId}_${paymentId}`;

      await verifyPaymentOnServer({
        orderId,
        paymentId,
        signature: mockSignature
      });
    } catch (err) {
      setState('failed');
      setErrorMessage(err.message);
    }
  };

  const handleSimulateMockFailure = () => {
    setMockSimulatorOpen(false);
    setState('failed');
    setErrorMessage('Simulated card decline: Insufficient balance or bank timeout.');
  };

  const handleClose = () => {
    if (state === 'success' && onPaymentSuccess) {
      onPaymentSuccess(lastVerifyResult || { success: true });
    }
    onClose();
  };

  const handleDone = () => {
    handleClose();
  };

  const handleOpenReceiptFull = () => {
    if (onOpenReceipt) {
      onOpenReceipt({
        ...(booking || {}),
        ...(paymentDetails || {}),
        payment_code: paymentDetails?.payment_code || `PAY-${bookingId}`,
        amount: numAmount,
        serviceTitle: serviceTitle,
        proName: proName,
        trade: proTrade,
        proPartnerId: booking?.proPartnerId || booking?.partnerId || booking?.partner_id || paymentDetails?.partnerId || '202600001',
        partnerId: booking?.proPartnerId || booking?.partnerId || booking?.partner_id || paymentDetails?.partnerId || '202600001',
        customerName: booking?.userName || booking?.user_name || 'Valued Customer',
        captured_at: paymentDetails?.captured_at || new Date().toISOString()
      });
    }
  };

  return (
    <>
      <div
        className="pay-scrim-backdrop"
        onClick={() => {
          if (state !== 'processing') handleClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-sheet-title"
      >
        <div
          className="pay-card-container"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ================= STATE: IDLE / PAYMENT ENTRY ================= */}
          {state === 'idle' && (
            <div className="pay-modal-inner">
              {/* Top Header matching BookingRateModal */}
              <div className="pay-modal-header">
                <h2 id="pay-sheet-title" className="pay-modal-title">
                  Service Settlement &amp; Review
                </h2>

                <button
                  type="button"
                  className="pay-modal-close-btn"
                  onClick={handleClose}
                  aria-label="Close dialog"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Completed Work Proof Box (exact match to Screenshot 3) */}
              {completionPhoto && (
                <div className="pay-work-proof-box">
                  <div className="pay-proof-label">COMPLETED WORK PROOF</div>
                  <div className="pay-proof-row">
                    <button
                      type="button"
                      className="pay-proof-thumbnail-btn"
                      onClick={() => setShowPhotoModal(true)}
                      title="Click to view full photo"
                      aria-label="View full proof photo"
                    >
                      <img
                        src={completionPhoto}
                        alt="Completion snapshot"
                        className="pay-proof-thumbnail-img"
                      />
                      <span className="pay-proof-thumbnail-zoom" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          <line x1="11" y1="8" x2="11" y2="14" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                      </span>
                    </button>
                    <div className="pay-proof-caption-wrap">
                      <span className="pay-proof-caption-title">Work Completed</span>
                      <span className="pay-proof-caption-sub">Verified via door OTP and technician work snapshot.</span>
                    </div>
                  </div>
                  {booking.completionRemarks && (
                    <div className="pay-proof-remarks-text">
                      "{booking.completionRemarks}"
                    </div>
                  )}
                </div>
              )}

              {/* Total Amount Due Card with Interactive Fee Breakdown */}
              <div className="pay-amount-bill-card">
                <div className="pay-amount-label">TOTAL AMOUNT DUE</div>
                <div className="pay-amount-val-row">
                  <span className="pay-amount-symbol">₹</span>
                  <span className="pay-amount-digits">{numAmount.toLocaleString('en-IN')}</span>
                </div>

                {/* Interactive Fee Breakdown Badge */}
                <button
                  type="button"
                  className={`pay-fee-interactive-btn ${showBreakdown ? 'active' : ''}`}
                  onClick={() => setShowBreakdown(prev => !prev)}
                  aria-expanded={showBreakdown}
                  aria-label="Toggle tax and fee breakdown"
                >
                  <span className="pay-fee-dot-indicator" />
                  <span className="pay-fee-pill-text">Includes 5% GST &amp; 5% NivaaroFix Fee</span>
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pay-fee-chevron"
                    style={{
                      transform: showBreakdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Collapsible Micro-Breakdown */}
                {showBreakdown && (
                  <div className="pay-fee-collapsible-tray">
                    <div className="pay-fee-row">
                      <span className="pay-fee-name">Technician Service Share (90%)</span>
                      <span className="pay-fee-val font-tabular">₹{Math.round(numAmount * 0.9).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="pay-fee-row">
                      <span className="pay-fee-name">GST (5%)</span>
                      <span className="pay-fee-val font-tabular">₹{(numAmount * 0.05).toFixed(2)}</span>
                    </div>
                    <div className="pay-fee-row">
                      <span className="pay-fee-name">NivaaroFix Platform Fee (5%)</span>
                      <span className="pay-fee-val font-tabular">₹{(numAmount * 0.05).toFixed(2)}</span>
                    </div>
                    <div className="pay-fee-divider" />
                    <div className="pay-fee-row pay-fee-total-row">
                      <span className="pay-fee-name">Total Payable</span>
                      <span className="pay-fee-val font-tabular font-bold">₹{numAmount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="pay-fee-badge-guarantee">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Transparent Pricing · No hidden doorstep charges</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method Selector (2 Clean Columns) */}
              <div className="pay-section">
                <label className="pay-section-label">PAYMENT METHOD</label>
                <div className="pay-method-grid">
                  <button
                    type="button"
                    className={`pay-method-card ${paymentMode === 'online' ? 'selected' : ''}`}
                    onClick={() => setPaymentMode('online')}
                  >
                    <div className="pay-method-card-top">
                      <div className="pay-method-icon-box">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                      </div>
                      <div className={`pay-method-radio-circle ${paymentMode === 'online' ? 'checked' : ''}`}>
                        {paymentMode === 'online' && <div className="pay-radio-dot" />}
                      </div>
                    </div>
                    <div className="pay-method-title">Online Payment (Razorpay)</div>
                    <div className="pay-method-desc">UPI QR Code, PhonePe, GPay, Paytm, Cards, Netbanking</div>
                  </button>

                  <button
                    type="button"
                    className={`pay-method-card ${paymentMode === 'cash' ? 'selected' : ''}`}
                    onClick={() => setPaymentMode('cash')}
                  >
                    <div className="pay-method-card-top">
                      <div className="pay-method-icon-box">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <circle cx="12" cy="12" r="3" />
                          <line x1="6" y1="12" x2="6.01" y2="12" />
                          <line x1="18" y1="12" x2="18.01" y2="12" />
                        </svg>
                      </div>
                      <div className={`pay-method-radio-circle ${paymentMode === 'cash' ? 'checked' : ''}`}>
                        {paymentMode === 'cash' && <div className="pay-radio-dot" />}
                      </div>
                    </div>
                    <div className="pay-method-title">Cash on Delivery</div>
                    <div className="pay-method-desc">Pay cash directly to technician at doorstep</div>
                  </button>
                </div>
              </div>

              {/* Rate Technician Work (matching Screenshot 3) */}
              <div className="pay-section pay-rating-container">
                <label className="pay-section-label">RATE TECHNICIAN WORK</label>

                {/* Star Rating Row */}
                <div className="pay-star-row">
                  <div className="pay-stars-wrapper" role="radiogroup" aria-label="Technician Rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className="pay-star-btn"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(star)}
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="32"
                          height="32"
                          fill={(hoverRating || rating) >= star ? '#059669' : 'none'}
                          stroke={(hoverRating || rating) >= star ? '#059669' : '#cbd5e1'}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <div className="pay-star-score-label">
                    {rating === 5 && 'Outstanding Work'}
                    {rating === 4 && 'Very Good Service'}
                    {rating === 3 && 'Average Experience'}
                    {rating === 2 && 'Needs Improvement'}
                    {rating === 1 && 'Unsatisfactory'}
                  </div>
                </div>

                {/* Quick Compliment Tags */}
                <div className="pay-tags-container">
                  <div className="pay-sublabel">What stood out most?</div>
                  <div className="pay-tags-wrap">
                    {quickTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`rate-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {isSelected && (
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Written Feedback Note */}
                <div className="pay-feedback-container">
                  <label className="pay-sublabel" htmlFor="pay-feedback-textarea">
                    Service Experience &amp; Quality Remarks
                  </label>
                  <textarea
                    id="pay-feedback-textarea"
                    rows={2}
                    placeholder="Share observations regarding workmanship quality, punctuality, or professional standards..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="pay-feedback-textarea"
                    maxLength={400}
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pay-footer-actions">
                <button
                  type="button"
                  className="btn-pay-secondary"
                  onClick={onClose}
                >
                  Pay later
                </button>

                {paymentMode === 'online' ? (
                  <button
                    type="button"
                    className="btn-pay-primary"
                    onClick={handleStartPayment}
                  >
                    Pay {formatINR(numAmount)} via Razorpay
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-pay-primary"
                    onClick={handleCashPayment}
                  >
                    Confirm Cash Payment ({formatINR(numAmount)})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================= STATE: PROCESSING ================= */}
          {state === 'processing' && (
            <div className="pay-status-view">
              <div className="pay-spinner-ring" aria-hidden="true" />
              <h3 className="pay-status-title">
                {paymentMode === 'cash' ? 'Confirming doorstep cash payment...' : 'Connecting to secure payment gateway...'}
              </h3>
              <p className="pay-status-desc">
                {paymentMode === 'cash'
                  ? 'Recording doorstep cash settlement and rating. Please do not close this window.'
                  : 'Verifying secure payment authorization with your bank. Please do not refresh.'}
              </p>
              <div className="pay-trust-strip" style={{ marginTop: '24px' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>{paymentMode === 'cash' ? 'Instant ledger confirmation' : 'Encrypted 256-bit bank handshake'}</span>
              </div>
            </div>
          )}

          {/* ================= STATE: SUCCESS (Screenshot 2 Redesign) ================= */}
          {state === 'success' && (
            <div className="pay-success-view">
              <button
                type="button"
                className="pay-modal-close-btn"
                onClick={handleDone}
                aria-label="Close dialog"
                style={{ position: 'absolute', top: '1.25rem', right: '1.25rem' }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Radiant Green Circular Checkmark */}
              <div className="pay-success-icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="pay-success-heading">
                {(paymentDetails?.method === 'cash' || paymentMode === 'cash')
                  ? 'Cash Payment Confirmed'
                  : 'Payment Successful'}
              </h2>
              <div className="pay-success-amount-display">{formatINR(numAmount)}</div>

              {/* Transaction Summary Card */}
              <div className="pay-summary-card">
                <div className="pay-summary-row">
                  <span className="pay-summary-label">Payment Mode</span>
                  <span className="pay-summary-val">
                    {(paymentDetails?.method === 'cash' || paymentMode === 'cash')
                      ? 'Cash on Delivery (Doorstep)'
                      : 'Razorpay Online'}
                  </span>
                </div>

                <div className="pay-summary-row">
                  <span className="pay-summary-label">Payment Reference</span>
                  <span className="pay-summary-val font-tabular font-mono">
                    {paymentDetails?.payment_code || paymentDetails?.provider_payment_id || `PAY-${bookingId}`}
                  </span>
                </div>

                <div className="pay-summary-row">
                  <span className="pay-summary-label">Paid At (IST)</span>
                  <span className="pay-summary-val">
                    {formatKolkataTime(paymentDetails?.captured_at || new Date().toISOString())}
                  </span>
                </div>

                <div className="pay-summary-row">
                  <span className="pay-summary-label">Rating</span>
                  <span className="pay-summary-val rating-highlight">
                    <span style={{ color: '#059669', fontSize: '1.15rem', letterSpacing: '3px' }}>
                      {'★'.repeat(rating)}
                    </span>
                  </span>
                </div>

                {feedback && (
                  <div className="pay-summary-row feedback-row">
                    <span className="pay-summary-label">Feedback</span>
                    <span className="pay-summary-val feedback-italic">"{feedback}"</span>
                  </div>
                )}
              </div>

              {/* Dual Action Buttons matching Screenshot 3 */}
              <div className="pay-footer-actions dual-footer">
                <button
                  type="button"
                  className="btn-pay-secondary"
                  onClick={handleOpenReceiptFull}
                >
                  View &amp; Print Receipt
                </button>

                <button
                  type="button"
                  className="btn-pay-primary"
                  onClick={handleDone}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ================= STATE: FAILED ================= */}
          {state === 'failed' && (
            <div className="pay-status-view">
              <div className="pay-failed-icon-badge">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <h3 className="pay-status-title">Payment Didn't Go Through</h3>
              <p className="pay-status-desc">
                {errorMessage || 'Your card or account was not charged. You can try again or choose Cash on Delivery.'}
              </p>

              <div className="pay-footer-actions dual-footer" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn-pay-secondary"
                  onClick={onClose}
                >
                  Pay later
                </button>
                <button
                  type="button"
                  className="btn-pay-primary"
                  onClick={handleStartPayment}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Completion Photo Lightbox */}
      {showPhotoModal && completionPhoto && (
        <div
          className="pay-lightbox-backdrop"
          onClick={() => setShowPhotoModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pay-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pay-lightbox-close-btn"
              onClick={() => setShowPhotoModal(false)}
              aria-label="Close photo preview"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <img src={completionPhoto} alt="Doorstep service completion proof" className="pay-lightbox-img" />
            <div className="pay-lightbox-footer">
              <span>Technician Doorstep Work Proof · {serviceTitle}</span>
            </div>
          </div>
        </div>
      )}

      {/* Development / Mock Simulator Dialog */}
      {mockSimulatorOpen && (
        <div
          className="pay-mock-dialog-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="pay-mock-card">
            <div className="pay-mock-badge">TEST MODE · RAZORPAY SIMULATOR</div>
            <h4 className="pay-mock-title">Simulate Payment Checkout</h4>
            <p className="pay-mock-desc">
              Local environment simulation for order <code className="pay-mock-code">{paymentDetails?.provider_order_id || 'order_mock'}</code> (Amount: {formatINR(numAmount)}).
            </p>

            <div className="pay-mock-method-select">
              <label className="pay-mock-radio-item">
                <input
                  type="radio"
                  name="mockMethod"
                  value="upi"
                  checked={mockSimulatingMethod === 'upi'}
                  onChange={() => setMockSimulatingMethod('upi')}
                />
                <span>UPI (GPay, PhonePe, Paytm, Phone Number / VPA)</span>
              </label>
              <label className="pay-mock-radio-item">
                <input
                  type="radio"
                  name="mockMethod"
                  value="qr"
                  checked={mockSimulatingMethod === 'qr'}
                  onChange={() => setMockSimulatingMethod('qr')}
                />
                <span>UPI QR Code (Instant Scan & Pay)</span>
              </label>
              <label className="pay-mock-radio-item">
                <input
                  type="radio"
                  name="mockMethod"
                  value="card"
                  checked={mockSimulatingMethod === 'card'}
                  onChange={() => setMockSimulatingMethod('card')}
                />
                <span>Credit / Debit Card</span>
              </label>
              <label className="pay-mock-radio-item">
                <input
                  type="radio"
                  name="mockMethod"
                  value="netbanking"
                  checked={mockSimulatingMethod === 'netbanking'}
                  onChange={() => setMockSimulatingMethod('netbanking')}
                />
                <span>Netbanking (HDFC, SBI, ICICI)</span>
              </label>
            </div>

            <div className="pay-mock-actions">
              <button
                type="button"
                className="pay-mock-btn-success"
                onClick={handleSimulateMockSuccess}
              >
                Simulate Successful Payment
              </button>
              <button
                type="button"
                className="pay-mock-btn-fail"
                onClick={handleSimulateMockFailure}
              >
                Simulate Payment Failure
              </button>
              <button
                type="button"
                className="pay-mock-btn-cancel"
                onClick={() => setMockSimulatorOpen(false)}
              >
                Cancel Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
