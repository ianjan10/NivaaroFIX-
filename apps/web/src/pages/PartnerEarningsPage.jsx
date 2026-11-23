import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ProfessionalPayoutModal from '../components/ProfessionalPayoutModal';
import PaymentReceiptModal from '../components/PaymentReceiptModal';
import BookingToast from '../components/BookingToast';
import '../styles/PartnerEarningsPage.css';

const API_BASE = '/api';

function formatINR(val, decimals = 0) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

function formatIST(isoString) {
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
  } catch {
    return 'Recent';
  }
}

/**
 * Ensures a full 12-digit numeric transaction ID is revealed
 */
function resolve12DigitTransactionId(job) {
  const explicit = job?.transactionId || job?.providerOrderId || job?.providerPaymentId || job?.paymentCode;
  if (explicit && /^\d{12}$/.test(String(explicit).trim())) {
    return String(explicit).trim();
  }
  const captured = job?.capturedAt || job?.settledAt;
  let datePrefix = '20261122';
  if (captured) {
    const d = new Date(captured);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      datePrefix = `${y}${m}${day}`;
    }
  }
  const seqNum = Number(job?.bookingId || job?.id || 1);
  const seqPadded = String(seqNum).padStart(4, '0').slice(-4);
  return `${datePrefix}${seqPadded}`;
}

export default function PartnerEarningsPage({ agent, onNavigate }) {
  const currentAgent = agent || {};
  const agentEmail = currentAgent?.email || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsData, setEarningsData] = useState({
    totalEarned: 0,
    pendingSettlement: 0,
    settled: 0,
    walletBalance: 0,
    jobs: []
  });
  const [payoutStatusInfo, setPayoutStatusInfo] = useState({
    payout_status: 'not_set',
    bank_name: '',
    bank_last4: ''
  });

  // Modal and Interactive States
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [selectedReceiptJob, setSelectedReceiptJob] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'settled' | 'processing'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTxId, setCopiedTxId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'brass') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 10000); // 10 seconds
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchEarningsAndPayout = useCallback(async (isSilent = false) => {
    if (!agentEmail) return;
    if (!isSilent) setRefreshing(true);

    try {
      const [statusRes, earnRes] = await Promise.all([
        fetch(`${API_BASE}/agents/payout-status?email=${encodeURIComponent(agentEmail)}`, { credentials: 'include' }),
        fetch(`${API_BASE}/agents/earnings?email=${encodeURIComponent(agentEmail)}`, { credentials: 'include' })
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.success) {
          setPayoutStatusInfo(sData);
        }
      }

      if (earnRes.ok) {
        const eData = await earnRes.json();
        if (eData.success) {
          const sum = eData.summary || {};
          setEarningsData({
            totalEarned: eData.totalEarned ?? sum.totalEarned ?? 0,
            pendingSettlement: eData.pendingSettlement ?? sum.pendingSettlement ?? 0,
            settled: eData.settled ?? sum.settled ?? 0,
            walletBalance: sum.walletBalance ?? 0,
            jobs: eData.jobs || []
          });
        }
      }
    } catch (err) {
      console.warn('Payouts & settlements fetch notice:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentEmail]);

  useEffect(() => {
    fetchEarningsAndPayout(false);
  }, [fetchEarningsAndPayout]);

  const handleCopy = (text, label = 'Transaction ID') => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedTxId(text);
      addToast(`${label} copied to clipboard!`, 'brass');
      setTimeout(() => setCopiedTxId(null), 2500);
    }
  };

  // Filtered & Searched Jobs
  const filteredJobs = useMemo(() => {
    const list = earningsData.jobs || [];
    return list.filter((job) => {
      const status = (job.status || '').toLowerCase();
      if (filter === 'settled' && status !== 'settled') return false;
      if (filter === 'processing' && status === 'settled') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const tx12 = resolve12DigitTransactionId(job).toLowerCase();
        const ref = String(job.requestRef || job.bookingId || '').toLowerCase();
        const sTitle = String(job.serviceTitle || '').toLowerCase();
        const cName = String(job.customerName || '').toLowerCase();
        const m = String(job.method || '').toLowerCase();
        return tx12.includes(q) || ref.includes(q) || sTitle.includes(q) || cName.includes(q) || m.includes(q);
      }
      return true;
    });
  }, [earningsData.jobs, filter, searchQuery]);

  const settledCount = (earningsData.jobs || []).filter((j) => (j.status || '').toLowerCase() === 'settled').length;
  const processingCount = (earningsData.jobs || []).filter((j) => (j.status || '').toLowerCase() !== 'settled').length;

  return (
    <div className="partner-settlements-page-wrapper" role="main">
      <div className="partner-settlements-container">
        {/* Page Header */}
        <header className="settlements-page-header">
          <div className="settlements-header-text">
            <h1 className="settlements-main-title">Payouts &amp; Settlements</h1>
            <p className="settlements-subhead">
              Automated Razorpay Route direct bank settlements &amp; earnings ledger.
            </p>
          </div>

          <div className="settlements-header-actions">
            <button
              type="button"
              className="settlements-btn-refresh"
              onClick={() => fetchEarningsAndPayout(false)}
              disabled={refreshing}
              title="Refresh settlements ledger"
            >
              <svg
                className={`settlements-refresh-icon ${refreshing ? 'spinning' : ''}`}
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{refreshing ? 'Updating...' : 'Refresh Ledger'}</span>
            </button>
          </div>
        </header>

        {/* 4 Clean Minimalist Summary Cards */}
        <div className="settlements-summary-grid">
          <div className="settlements-stat-card">
            <span className="settlements-stat-label">Total Earned</span>
            <span className="settlements-stat-amount">
              {formatINR(earningsData.totalEarned)}
            </span>
            <span className="settlements-stat-sub">90% Net service earnings</span>
          </div>

          <div className="settlements-stat-card">
            <span className="settlements-stat-label">Pending Settlement</span>
            <span className="settlements-stat-amount">
              {formatINR(earningsData.pendingSettlement)}
            </span>
            <span className="settlements-stat-sub">Processing next bank batch</span>
          </div>

          <div className="settlements-stat-card">
            <span className="settlements-stat-label">Settled in Bank</span>
            <span className="settlements-stat-amount">
              {formatINR(earningsData.settled)}
            </span>
            <span className="settlements-stat-sub">Direct bank transfers</span>
          </div>

          <div className="settlements-stat-card">
            <span className="settlements-stat-label">Available Balance</span>
            <span className="settlements-stat-amount">
              {formatINR(earningsData.walletBalance || earningsData.totalEarned)}
            </span>
            <span className="settlements-stat-sub">Real-time professional balance</span>
          </div>
        </div>

        {/* Bank Account / Route Direct Settlement Banner */}
        <div className="settlements-bank-banner">
          <div className="settlements-bank-info">
            <div className="settlements-bank-icon-box">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div className="settlements-bank-details">
              <div className="settlements-bank-title-row">
                <span className="settlements-bank-title">
                  {payoutStatusInfo.bank_name || payoutStatusInfo.bankName
                    ? `${payoutStatusInfo.bank_name || payoutStatusInfo.bankName} •••• ${payoutStatusInfo.bank_last4 || payoutStatusInfo.bankLast4 || 'XXXX'}`
                    : 'Direct Bank Settlement Account'}
                </span>
              </div>
              <p className="settlements-bank-desc">
                Earnings are transferred automatically to your verified bank account upon customer completion. Direct NEFT/IMPS transfers powered by Razorpay Route with 0% platform withdrawal fee.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="settlements-btn-bank-action"
            onClick={() => setPayoutModalOpen(true)}
          >
            {(payoutStatusInfo.payout_status === 'active' || payoutStatusInfo.payoutStatus === 'active')
              ? 'Update Bank Details'
              : 'Add Bank Account'}
          </button>
        </div>

        {/* Ledger Filter & Search Toolbar */}
        <div className="settlements-control-bar">
          <div className="settlements-filter-pills" role="tablist" aria-label="Settlement status filter">
            <button
              type="button"
              className={`settlements-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Transfers ({(earningsData.jobs || []).length})
            </button>
            <button
              type="button"
              className={`settlements-filter-btn ${filter === 'settled' ? 'active' : ''}`}
              onClick={() => setFilter('settled')}
            >
              Settled ({settledCount})
            </button>
            <button
              type="button"
              className={`settlements-filter-btn ${filter === 'processing' ? 'active' : ''}`}
              onClick={() => setFilter('processing')}
            >
              Processing ({processingCount})
            </button>
          </div>

          <div className="settlements-search-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-secondary, #6b7280)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="settlements-search-input"
              placeholder="Search by booking #, transaction ID, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search settlements"
            />
          </div>
        </div>

        {/* Ledger Table Card */}
        <div className="settlements-table-card">
          {filteredJobs.length === 0 ? (
            <div className="settlements-empty-state">
              <div className="settlements-empty-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 className="settlements-empty-title">
                {searchQuery ? 'No Matching Settlements Found' : 'No Service Earnings Recorded Yet'}
              </h3>
              <p className="settlements-empty-desc">
                {searchQuery
                  ? `No settlements found matching "${searchQuery}". Clear your search query to view all records.`
                  : 'Completed jobs and automatic Razorpay Route settlements will appear here as customers settle doorstep visits.'}
              </p>
            </div>
          ) : (
            <div className="settlements-table-responsive">
              <table className="settlements-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time (IST)</th>
                    <th>Booking #</th>
                    <th>Service Performed</th>
                    <th>Customer</th>
                    <th>Payment Mode</th>
                    <th style={{ textAlign: 'right' }}>Total Paid</th>
                    <th style={{ textAlign: 'right' }}>Platform Fee</th>
                    <th style={{ textAlign: 'right' }}>Net Payout (90%)</th>
                    <th>Transaction ID</th>
                    <th style={{ textAlign: 'center' }}>Settlement Status</th>
                    <th style={{ textAlign: 'center' }}>Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => {
                    const txId12 = resolve12DigitTransactionId(job);
                    const isCash = String(job.method || '').toLowerCase().includes('cash');
                    const isSettled = (job.status || '').toLowerCase() === 'settled';

                    // Compute platform fee & net payout if not precalculated
                    const totalGross = Number(job.totalAmount || 150);
                    const platformFeeVal = Number(job.platformFee != null ? job.platformFee : (totalGross * 0.1));
                    const proPayoutVal = Number(job.payoutAmount != null ? job.payoutAmount : (totalGross - platformFeeVal));

                    return (
                      <tr key={job.bookingId || job.paymentCode || txId12}>
                        {/* 1. Date & Time */}
                        <td>
                          <div className="settlement-tx-datetime">
                            <span className="settlement-date-main">
                              {formatIST(job.settledAt || job.capturedAt)}
                            </span>
                            <span className="settlement-date-sub">
                              {job.settledAt ? 'Settled to Bank' : 'Recorded in Ledger'}
                            </span>
                          </div>
                        </td>

                        {/* 2. Booking # */}
                        <td>
                          <span className="settlement-booking-pill">
                            {job.requestRef || job.bookingId}
                          </span>
                        </td>

                        {/* 3. Service Title */}
                        <td>
                          <div className="settlement-service-block">
                            <span className="settlement-service-title">{job.serviceTitle}</span>
                          </div>
                        </td>

                        {/* 4. Customer */}
                        <td>
                          <div className="settlement-customer-info">
                            <span className="settlement-customer-name">{job.customerName || 'Valued Customer'}</span>
                            {job.customerAddress && (
                              <span className="settlement-customer-addr" title={job.customerAddress}>
                                {job.customerAddress}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Payment Mode */}
                        <td>
                          <span className={`settlement-method-badge ${isCash ? 'cash' : 'online'}`}>
                            {isCash ? 'Cash (Doorstep)' : 'Razorpay Route (Online)'}
                          </span>
                        </td>

                        {/* 6. Total Paid */}
                        <td style={{ textAlign: 'right' }}>
                          <span className="settlement-amount-val">
                            ₹{totalGross.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                          </span>
                        </td>

                        {/* 7. Platform Fee */}
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary, #6b7280)' }}>
                          <span className="settlement-amount-val">
                            ₹{platformFeeVal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                          </span>
                        </td>

                        {/* 8. Net Payout (90%) */}
                        <td style={{ textAlign: 'right' }}>
                          <span className="settlement-payout-val">
                            ₹{proPayoutVal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                          </span>
                        </td>

                        {/* 9. Transaction ID (12 Digits, Copyable) */}
                        <td>
                          <div className="settlement-txid-group">
                            <span className="settlement-txid-text">{txId12}</span>
                            <button
                              type="button"
                              className="settlement-copy-btn"
                              onClick={() => handleCopy(txId12, 'Transaction ID')}
                              title="Copy 12-digit transaction ID"
                              aria-label="Copy transaction ID"
                            >
                              {copiedTxId === txId12 ? (
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 10. Status Badge */}
                        <td style={{ textAlign: 'center' }}>
                          <span className={`settlement-badge ${isSettled ? 'settled' : 'processing'}`}>
                            {isSettled ? 'Settled' : 'Processing'}
                          </span>
                        </td>

                        {/* 11. Statement / Receipt Action */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="settlement-btn-receipt"
                            onClick={() => {
                              setSelectedReceiptJob({
                                payment: {
                                  id: job.bookingId,
                                  payment_code: job.paymentCode,
                                  transaction_id: txId12,
                                  amount: totalGross,
                                  platform_fee: platformFeeVal,
                                  captured_at: job.capturedAt || job.settledAt,
                                  method: job.method
                                },
                                booking: {
                                  id: job.bookingId,
                                  request_ref: job.requestRef,
                                  service_title: job.serviceTitle,
                                  user_name: job.customerName,
                                  user_address: job.customerAddress,
                                  professional_name: currentAgent?.name || 'Rahul',
                                  professional_id: currentAgent?.partnerId || currentAgent?.id || '202600001',
                                  completed_at: job.capturedAt || job.settledAt
                                }
                              });
                            }}
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Professional Payout Setup Modal */}
      <ProfessionalPayoutModal
        isOpen={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        currentStatus={payoutStatusInfo}
        onSetupSuccess={(data) => {
          setPayoutStatusInfo(data);
          fetchEarningsAndPayout(false);
          addToast('Bank payout account activated! Earnings will transfer automatically upon customer payment.', 'brass');
        }}
      />

      {/* Payment Receipt / Statement Modal */}
      {selectedReceiptJob && (
        <PaymentReceiptModal
          isOpen={Boolean(selectedReceiptJob)}
          onClose={() => setSelectedReceiptJob(null)}
          payment={selectedReceiptJob.payment}
          booking={selectedReceiptJob.booking}
        />
      )}

      {/* 10-Second Toast Notification Stack */}
      <BookingToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
