import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp';
import '../styles/UnifiedOtpInput.css';

/**
 * Single Slot Renderer for UnifiedOtpInput
 */
function OtpSlot({ char, isActive, hasFakeCaret, isError, isSuccess, isDisabled }) {
  let stateClass = '';
  if (isError) {
    stateClass = 'is-error';
  } else if (isSuccess) {
    stateClass = 'is-success';
  } else if (isActive) {
    stateClass = 'is-active';
  } else if (char) {
    stateClass = 'is-filled';
  }

  if (isDisabled) {
    stateClass += ' is-disabled';
  }

  return (
    <div className={`nivaaro-otp-slot ${stateClass}`} aria-hidden="true">
      {isSuccess && !char ? (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8.5 6.5 12 13 4" />
        </svg>
      ) : (
        char
      )}
      {hasFakeCaret && !isDisabled && !isSuccess && (
        <span className="nivaaro-otp-caret" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * UnifiedOtpInput
 * Reusable, data-driven OTP input powered headlessly by input-otp
 */
export default function UnifiedOtpInput({
  value = '',
  onChange,
  onComplete,
  length = 4,
  disabled = false,
  autoFocus = true,
  error = '',
  isSuccess = false,
  lockedUntil = null,
  id = 'nivaaro-otp-field',
  label = '',
  ariaLabel = 'Enter one-time verification code',
  showSubmitFallback = false,
  fallbackSubmitText = 'Verify OTP',
  className = ''
}) {
  const [internalValue, setInternalValue] = useState(value || '');
  const [lockedSeconds, setLockedSeconds] = useState(0);
  const inputRef = useRef(null);
  const prevErrorRef = useRef(error);

  // Sync prop value
  useEffect(() => {
    if (value !== undefined && value !== internalValue) {
      setInternalValue(value);
    }
  }, [value]);

  // Clean pasted input (strip spaces, dashes, all non-digits)
  const handleValueChange = useCallback((nextVal) => {
    const cleaned = String(nextVal || '').replace(/[\s-]/g, '').replace(/\D/g, '').slice(0, length);
    setInternalValue(cleaned);
    if (onChange) {
      onChange(cleaned);
    }
  }, [onChange, length]);

  // Auto-submit on completion
  const handleComplete = useCallback((completedVal) => {
    const cleaned = String(completedVal || '').replace(/[\s-]/g, '').replace(/\D/g, '').slice(0, length);
    if (onComplete) {
      onComplete(cleaned);
    }
  }, [onComplete, length]);

  // Handle Error State: Clear value & refocus automatically, without shake/bounce
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      handleValueChange('');
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevErrorRef.current = error;
  }, [error, handleValueChange]);

  // Countdown timer for locked state
  useEffect(() => {
    if (!lockedUntil) {
      setLockedSeconds(0);
      return;
    }

    const calculateRemaining = () => {
      const targetTime = typeof lockedUntil === 'number' ? lockedUntil : new Date(lockedUntil).getTime();
      const diff = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      return diff;
    };

    const initialRemaining = calculateRemaining();
    setLockedSeconds(initialRemaining);

    if (initialRemaining <= 0) return;

    const interval = setInterval(() => {
      const rem = calculateRemaining();
      setLockedSeconds(rem);
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedSeconds > 0;
  const isInputDisabled = disabled || isLocked;

  // Format MM:SS for locked countdown
  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className={`nivaaro-otp-root ${className}`}
      data-length={length}
    >
      {label && (
        <label htmlFor={id} className="nivaaro-otp-label">
          {label}
        </label>
      )}

      <OTPInput
        ref={inputRef}
        id={id}
        maxLength={length}
        value={internalValue}
        onChange={handleValueChange}
        onComplete={handleComplete}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        disabled={isInputDisabled}
        autoFocus={autoFocus && !isInputDisabled}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        containerClassName="nivaaro-otp-container"
        pasteTransformer={(p) => p.replace(/\D/g, '')}
        render={({ slots }) => (
          <div className="nivaaro-otp-slots-track" role="group" aria-label={`OTP digits, length ${length}`}>
            {slots.map((slot, idx) => (
              <OtpSlot
                key={idx}
                {...slot}
                isError={Boolean(error)}
                isSuccess={isSuccess}
                isDisabled={isInputDisabled}
              />
            ))}
          </div>
        )}
      />

      {/* Error state message */}
      {error && !isLocked && (
        <div className="nivaaro-otp-error-msg" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      {/* Locked state countdown message */}
      {isLocked && (
        <div className="nivaaro-otp-locked-msg" role="status" aria-live="polite">
          Door OTP entry temporarily locked due to 5 incorrect attempts. Try again in {formatCountdown(lockedSeconds)}.
        </div>
      )}

      {/* Success brief indicator */}
      {isSuccess && (
        <div className="nivaaro-otp-success-indicator" role="status" aria-live="polite">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8.5 6.5 12 13 4" />
          </svg>
          <span>Verified</span>
        </div>
      )}

      {/* Fallback button for accessibility */}
      {showSubmitFallback && (
        <button
          type="button"
          className="nivaaro-otp-fallback-btn"
          disabled={isInputDisabled || internalValue.length < length}
          onClick={() => handleComplete(internalValue)}
        >
          {fallbackSubmitText}
        </button>
      )}
    </div>
  );
}
