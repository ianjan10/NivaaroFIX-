import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';

export default function MobileVerificationSheet({
  isOpen,
  onClose,
  phone,
  professionalId,
  onChangePhone,
  onVerified
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resendSeconds, setResendSeconds] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [statusState, setStatusState] = useState('idle'); // 'idle' | 'sending' | 'verifying' | 'error' | 'verified'
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);

  const inputRefs = useRef([]);
  const timerRef = useRef(null);

  // Send OTP on initial open
  useEffect(() => {
    if (!isOpen) {
      setDigits(['', '', '', '', '', '']);
      setStatusState('idle');
      setErrorMessage('');
      setCanResend(false);
      setResendSeconds(30);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    sendCode();

    // Focus first input on open
    setTimeout(() => {
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    }, 150);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Resend Countdown Timer
  const startTimer = () => {
    setCanResend(false);
    setResendSeconds(30);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    const cleanNumber = String(phone || '').replace(/\D/g, '').slice(-10);
    if (cleanNumber.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      setStatusState('error');
      return;
    }

    setStatusState('sending');
    setErrorMessage('');

    try {
      const res = await apiClient('/verification/mobile/send', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanNumber })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatusState('error');
        setErrorMessage(data.error || data.message || 'Could not send verification code.');
        return;
      }

      setStatusState('idle');
      startTimer();
    } catch (err) {
      setStatusState('error');
      setErrorMessage('Network error connecting to verification service.');
    }
  };

  const handleDigitChange = (index, val) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setErrorMessage('');

    if (char && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }

    // Auto-submit when all 6 digits are filled
    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      verifyCode(fullCode);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0 && inputRefs.current[index - 1]) {
        inputRefs.current[index - 1].focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1].focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!paste) return;

    const newDigits = [...digits];
    for (let i = 0; i < paste.length; i++) {
      newDigits[i] = paste[i];
    }
    setDigits(newDigits);
    setErrorMessage('');

    const focusIdx = Math.min(paste.length, 5);
    if (inputRefs.current[focusIdx]) {
      inputRefs.current[focusIdx].focus();
    }

    if (paste.length === 6) {
      verifyCode(paste);
    }
  };

  const verifyCode = async (codeStr) => {
    const cleanNumber = String(phone || '').replace(/\D/g, '').slice(-10);
    setStatusState('verifying');
    setErrorMessage('');

    try {
      const res = await apiClient('/verification/mobile/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: cleanNumber,
          code: codeStr,
          professionalId
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatusState('error');
        setDigits(['', '', '', '', '', '']);
        if (inputRefs.current[0]) inputRefs.current[0].focus();

        const errText = data.error || data.message || 'Incorrect verification code.';
        setErrorMessage(errText);
        setAttemptsRemaining((prev) => Math.max(0, prev - 1));
        return;
      }

      setStatusState('verified');
      if (onVerified) onVerified(cleanNumber);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatusState('error');
      setErrorMessage('Network error during verification.');
    }
  };

  if (!isOpen) return null;

  const cleanPhoneDisplay = String(phone || '').replace(/\D/g, '').slice(-10);
  const formattedPhone = cleanPhoneDisplay.length === 10
    ? `+91 ${cleanPhoneDisplay.slice(0, 5)} ${cleanPhoneDisplay.slice(5)}`
    : `+91 ${phone}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify mobile number"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 20, 16, 0.38)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && statusState !== 'verifying') onClose();
      }}
    >
      <div
        className="mobile-verif-sheet-card pro-glass-card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '28px 24px',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '18px',
          animation: 'fadeInUp 0.22s ease-out'
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close verification sheet"
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0, 0, 0, 0.05)',
            color: 'var(--text-primary, #111827)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease'
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ textAlign: 'left', paddingRight: '36px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
            Verify mobile number
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: 'var(--text-secondary, #4b5563)', lineHeight: 1.4 }}>
            We&apos;ve sent a 6-digit verification code to
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
              {formattedPhone}
            </span>
            {onChangePhone && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onChangePhone();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0d824d',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Change
              </button>
            )}
          </div>
        </div>

        {/* Status Notification / Error */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#b91c1c',
              fontSize: '0.84rem',
              lineHeight: 1.4
            }}
          >
            {errorMessage}
          </div>
        )}

        {statusState === 'verified' && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(13, 130, 77, 0.08)',
              border: '1px solid rgba(13, 130, 77, 0.3)',
              color: '#0d824d',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="#0d824d">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Mobile verified successfully!</span>
          </div>
        )}

        {/* 6-Digit OTP Boxes */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            margin: '8px 0'
          }}
          onPaste={handlePaste}
        >
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => (inputRefs.current[idx] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={statusState === 'verifying' || statusState === 'verified'}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              style={{
                width: '46px',
                height: '48px',
                borderRadius: '12px',
                border: digit ? '2px solid #0d824d' : '1px solid var(--border-neutral, rgba(0, 0, 0, 0.15))',
                background: 'rgba(255, 255, 255, 0.9)',
                textAlign: 'center',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--text-primary, #111827)',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              aria-label={`Digit ${idx + 1}`}
            />
          ))}
        </div>

        {/* Footer Actions: Resend Timer & Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem',
            color: 'var(--text-secondary, #4b5563)',
            marginTop: '4px'
          }}
        >
          {canResend ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={statusState === 'sending' || statusState === 'verifying'}
              style={{
                background: 'none',
                border: 'none',
                color: '#0d824d',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Resend code
            </button>
          ) : (
            <span>
              Resend code in <strong style={{ color: 'var(--text-primary, #111827)' }}>0:{resendSeconds.toString().padStart(2, '0')}</strong>
            </span>
          )}

          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            {statusState === 'sending' ? 'Sending code...' : (statusState === 'verifying' ? 'Verifying...' : '')}
          </span>
        </div>
      </div>
    </div>
  );
}

