import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function PhoneOtpModal({ isOpen, phoneDigits, onClose, onVerifySuccess, onContinueWithoutOtp }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);
  const { t } = useLanguage();

  useEffect(() => {
    let interval = null;
    if (isOpen) {
      setOtp(['', '', '', '', '', '']);
      setTimer(30);
      setCanResend(false);

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

      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleResend = () => {
    if (!canResend) return;
    setOtp(['', '', '', '', '', '']);
    setTimer(30);
    setCanResend(false);
    if (inputRefs.current[0]) inputRefs.current[0].focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length === 6) {
      onVerifySuccess(fullOtp);
    }
  };

  const handleContinueUnverified = () => {
    if (onContinueWithoutOtp) {
      onContinueWithoutOtp();
    } else {
      onVerifySuccess('SKIPPED');
    }
  };

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

        <form onSubmit={handleSubmit}>
          <div className="otp-inputs-grid">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                className="otp-box"
                maxLength={1}
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                required
              />
            ))}
          </div>

          <div className="otp-resend-row">
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '16px' }}>
            <button
              type="submit"
              className="btn-primary btn-success-glow"
              disabled={otp.join('').length < 6}
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
