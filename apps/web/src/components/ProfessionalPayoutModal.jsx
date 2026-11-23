import React, { useState } from 'react';
import './ProfessionalPayoutModal.css';

// Known IFSC prefix dictionary for instant fallback lookup
const IFSC_DIRECTORY = {
  'HDFC': 'HDFC Bank',
  'SBIN': 'State Bank of India',
  'ICIC': 'ICICI Bank',
  'UTIB': 'Axis Bank',
  'KKBK': 'Kotak Mahindra Bank',
  'PUNB': 'Punjab National Bank',
  'BARB': 'Bank of Baroda',
  'CNRB': 'Canara Bank',
  'UBIN': 'Union Bank of India',
  'IDIB': 'Indian Bank',
  'YESB': 'Yes Bank',
  'IDFB': 'IDFC FIRST Bank',
  'INDB': 'IndusInd Bank'
};

export default function ProfessionalPayoutModal({
  isOpen,
  onClose,
  currentStatus,
  onSetupSuccess
}) {
  const [step, setStep] = useState(1); // 1: Personal KYC (Name, PAN), 2: Bank Details, 3: Success
  const [legalName, setLegalName] = useState('');
  const [pan, setPan] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccount, setConfirmAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Realtime IFSC lookup
  const handleIfscChange = async (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    setIfsc(val);

    if (val.length >= 4) {
      const prefix = val.slice(0, 4);
      if (IFSC_DIRECTORY[prefix]) {
        setBankName(IFSC_DIRECTORY[prefix]);
      }
    }

    if (val.length === 11) {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${val}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.BANK) {
            setBankName(data.BANK);
          }
        }
      } catch (err) {
        // Fallback already assigned
      }
    }
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!legalName.trim() || legalName.trim().length < 3) {
      setErrorMsg('Please enter your full legal name as it appears on your bank account.');
      return;
    }

    const panClean = pan.toUpperCase().trim();
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panClean)) {
      setErrorMsg('Please enter a valid 10-character PAN number (e.g. ABCDE1234F).');
      return;
    }

    setStep(2);
  };

  const handleSubmitBank = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const acc = accountNumber.trim();
    if (!acc || acc.length < 8 || acc.length > 20 || !/^\d+$/.test(acc)) {
      setErrorMsg('Please enter a valid bank account number (8 to 20 digits).');
      return;
    }

    if (acc !== confirmAccount.trim()) {
      setErrorMsg('Account numbers do not match. Please re-check.');
      return;
    }

    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifsc)) {
      setErrorMsg('Please enter a valid 11-character IFSC code (e.g. HDFC0001234).');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/agents/payout-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          legalName: legalName.trim(),
          pan: pan.toUpperCase().trim(),
          accountNumber: acc,
          ifsc: ifsc.trim(),
          bankName: bankName || 'Bank Account'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to link payout account with payment provider.');
      }

      setStep(3); // Success
      if (onSetupSuccess) {
        onSetupSuccess(data);
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred while linking your bank account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="payout-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-modal-title"
    >
      <div className="payout-card" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          type="button"
          className="payout-close-btn"
          onClick={onClose}
          aria-label="Close setup modal"
          disabled={isLoading}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* STEP 1: LEGAL NAME & PAN */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="payout-form">
            <div className="payout-step-indicator">Step 1 of 2 · Identity Verification</div>
            <h3 id="payout-modal-title" className="payout-modal-title">
              Bank Payout Setup
            </h3>
            <p className="payout-modal-desc">
              Your service earnings are automatically transferred to your verified bank account via Razorpay Route upon job completion.
            </p>

            {errorMsg && (
              <div className="payout-alert-error" role="alert">
                {errorMsg}
              </div>
            )}

            <div className="payout-field-group">
              <label htmlFor="payout-legal-name" className="payout-label">
                Legal Name (as on Bank Account)
              </label>
              <input
                id="payout-legal-name"
                type="text"
                className="payout-input"
                placeholder="Full name as printed in passbook"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="payout-field-group">
              <label htmlFor="payout-pan" className="payout-label">
                Permanent Account Number (PAN)
              </label>
              <input
                id="payout-pan"
                type="text"
                className="payout-input font-uppercase"
                placeholder="ABCDE1234F"
                maxLength={10}
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                required
              />
              <span className="payout-hint">Required by Indian banking regulations for direct settlement transfers.</span>
            </div>

            <div className="payout-actions">
              <button type="submit" className="payout-btn-primary">
                Continue to Bank Details
              </button>
              <button type="button" className="payout-btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: BANK ACCOUNT & IFSC */}
        {step === 2 && (
          <form onSubmit={handleSubmitBank} className="payout-form">
            <div className="payout-step-indicator">Step 2 of 2 · Bank Account</div>
            <h3 className="payout-modal-title">
              Enter Bank Details
            </h3>
            <p className="payout-modal-desc">
              No sensitive account details are stored in plain text. Direct tokenization is handled securely by Razorpay.
            </p>

            {errorMsg && (
              <div className="payout-alert-error" role="alert">
                {errorMsg}
              </div>
            )}

            <div className="payout-field-group">
              <label htmlFor="payout-acc-num" className="payout-label">
                Bank Account Number
              </label>
              <input
                id="payout-acc-num"
                type="password"
                className="payout-input font-tabular"
                placeholder="Enter bank account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="payout-field-group">
              <label htmlFor="payout-acc-confirm" className="payout-label">
                Confirm Bank Account Number
              </label>
              <input
                id="payout-acc-confirm"
                type="text"
                className="payout-input font-tabular"
                placeholder="Re-enter account number"
                value={confirmAccount}
                onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="payout-field-group">
              <label htmlFor="payout-ifsc" className="payout-label">
                IFSC Code
              </label>
              <input
                id="payout-ifsc"
                type="text"
                className="payout-input font-uppercase"
                placeholder="e.g. HDFC0001234"
                maxLength={11}
                value={ifsc}
                onChange={handleIfscChange}
                required
              />
              {bankName && (
                <div className="payout-bank-tag">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>{bankName}</span>
                </div>
              )}
            </div>

            <div className="payout-actions">
              <button
                type="submit"
                className="payout-btn-primary"
                disabled={isLoading}
              >
                {isLoading ? 'Verifying with Provider...' : 'Verify & Activate Payouts'}
              </button>
              <button
                type="button"
                className="payout-btn-secondary"
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                Back
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 3 && (
          <div className="payout-form payout-success-view">
            <div className="payout-success-circle">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="payout-modal-title" style={{ marginTop: '16px' }}>
              Payouts Active
            </h3>
            <p className="payout-modal-desc">
              Earnings will transfer to your bank account ({bankName || 'Bank'} •••• {accountNumber.slice(-4)}) automatically after each completed job.
            </p>

            <div className="payout-active-card">
              <div className="payout-active-dot" />
              <div className="payout-active-meta">
                <div className="payout-active-name">{legalName}</div>
                <div className="payout-active-sub">Direct Route Settlement Enabled</div>
              </div>
            </div>

            <div className="payout-actions" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="payout-btn-primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

