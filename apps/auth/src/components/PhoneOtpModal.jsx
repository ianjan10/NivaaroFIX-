import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import UnifiedOtpInput from './UnifiedOtpInput';

export default function PhoneOtpModal({ isOpen, phoneDigits, onClose, onVerifySuccess, onContinueWithoutOtp }) {
  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    let interval = null;
    if (isOpen) {
      setOtp('');
      setTimer(30);
      setCanResend(false);
      setOtpError('');
      setIsSuccess(false);

      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  const handleResend = async () => {
    if (!canResend) return;
    setOtp('');
    setTimer(30);
    setCanResend(false);
    setOtpError('');
    setIsSuccess(false);

    try {
      if (phoneDigits) {
        await fetch('http://localhost:5000/api/auth/send-phone-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneDigits })
        });
      }
    } catch {}
  };

  const handleAutoVerify = useCallback((fullOtp) => {
    if (!fullOtp || fullOtp.length < 6) return;
    setIsSuccess(true);
    setTimeout(() => {
      onVerifySuccess(fullOtp);
    }, 200);
  }, [onVerifySuccess]);

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (otp.length === 6) {
      handleAutoVerify(otp);
    }
  };

  const handleContinueUnverified = () => {
    if (onContinueWithoutOtp) {
      onContinueWithoutOtp();
    } else {
      onVerifySuccess('SKIPPED');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`otp-verification-modal ${isOpen ? 'active' : ''}`}>
      <div className="otp-modal-card">
        <button
          type="button"
          className="btn-close-modal"
          onClick={onClose}
          aria-label="Close OTP Verification"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="modal-header">
          <h3>{t.otpModalTitle || 'Phone Verification'}</h3>
          <p>{t.otpModalSub || 'Enter the 6-digit OTP code sent via SMS to'}</p>
        </div>

        <p className="verify-dest-info">
          Sent to <strong>+91 {phoneDigits}</strong>
        </p>

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', margin: '0.75rem 0' }}>
            <UnifiedOtpInput
              length={6}
              value={otp}
              onChange={setOtp}
              onComplete={handleAutoVerify}
              error={otpError}
              isSuccess={isSuccess}
              ariaLabel="Enter 6-digit SMS verification code"
            />
          </div>

          <div className="otp-resend-row" style={{ width: '100%' }}>
            <span>
              {canResend ? (
                "Didn't receive code?"
              ) : (
                <>Resend code in <strong>00:{timer < 10 ? `0${timer}` : timer}</strong></>
              )}
            </span>
            <button
              type="button"
              className="btn-link"
              onClick={handleResend}
              disabled={!canResend}
              style={{ opacity: canResend ? 1 : 0.4, cursor: canResend ? 'pointer' : 'not-allowed' }}
            >
              Resend OTP
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '16px', width: '100%' }}>
            <button
              type="submit"
              className="btn-primary btn-success-glow"
              disabled={otp.length < 6}
            >
              {t.btnVerifyOtp || 'Verify Code'}
            </button>

            <button
              type="button"
              className="btn-continue-unverified"
              onClick={handleContinueUnverified}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#374151',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>Continue (Verify Later)</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
