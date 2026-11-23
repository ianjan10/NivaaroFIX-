import React, { useState, useEffect } from 'react';

/**
 * Format experience number to human-readable string:
 * 0 => "Fresher"
 * 1 => "1 year"
 * n => "n years"
 */
export function formatExperience(val) {
  if (val === null || val === undefined || val === '') return 'Fresher';
  const num = typeof val === 'number' ? val : parseInt(String(val).replace(/\D/g, ''), 10);
  if (isNaN(num) || num <= 0) return 'Fresher';
  if (num === 1) return '1 year';
  return `${num} years`;
}

export default function ExperienceStepper({
  id = 'experience-stepper',
  value = 0,
  onChange,
  disabled = false,
  className = ''
}) {
  const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'string' && v.toLowerCase().includes('fresh')) return 0;
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : Math.min(Math.max(n, 0), 50);
  };

  const currentNum = parseNum(value);
  const [isFocused, setIsFocused] = useState(false);
  const [typedText, setTypedText] = useState(formatExperience(currentNum));

  useEffect(() => {
    if (!isFocused) {
      setTypedText(formatExperience(currentNum));
    }
  }, [currentNum, isFocused]);

  const handleStep = (delta) => {
    if (disabled) return;
    const next = Math.min(Math.max(currentNum + delta, 0), 50);
    if (onChange) onChange(next);
  };

  const handleFocus = () => {
    if (disabled) return;
    setIsFocused(true);
    setTypedText(String(currentNum));
  };

  const handleBlur = () => {
    setIsFocused(false);
    let next = parseNum(typedText);
    if (onChange) onChange(next);
    setTypedText(formatExperience(next));
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    setTypedText(raw);
    const n = parseNum(raw);
    if (onChange) onChange(n);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep(-1);
    } else if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div
      className={`pro-experience-stepper-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
        height: '44px',
        backgroundColor: disabled ? '#f9fafb' : '#ffffff',
        border: isFocused ? '1.5px solid #0d824d' : '1px solid rgba(0, 0, 0, 0.15)',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: isFocused ? '0 0 0 3px rgba(13, 130, 77, 0.12)' : '0 1px 2px rgba(16, 24, 40, 0.04)',
        transition: 'all 0.15s ease'
      }}
    >
      {/* Minus Button */}
      <button
        type="button"
        onClick={() => handleStep(-1)}
        disabled={disabled || currentNum <= 0}
        aria-label="Decrease experience"
        style={{
          width: '44px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          color: currentNum <= 0 || disabled ? '#9ca3af' : '#111827',
          cursor: currentNum <= 0 || disabled ? 'not-allowed' : 'pointer',
          padding: 0,
          userSelect: 'none',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (currentNum > 0 && !disabled) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Center Typed / Formatted Input */}
      <input
        id={id}
        type="text"
        value={isFocused ? typedText : formatExperience(currentNum)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Years of experience"
        style={{
          flex: 1,
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          textAlign: 'center',
          fontSize: '0.94rem',
          fontWeight: 600,
          color: '#111827',
          fontFamily: 'inherit',
          padding: '0 8px'
        }}
      />

      {/* Plus Button */}
      <button
        type="button"
        onClick={() => handleStep(1)}
        disabled={disabled || currentNum >= 50}
        aria-label="Increase experience"
        style={{
          width: '44px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
          color: currentNum >= 50 || disabled ? '#9ca3af' : '#111827',
          cursor: currentNum >= 50 || disabled ? 'not-allowed' : 'pointer',
          padding: 0,
          userSelect: 'none',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (currentNum < 50 && !disabled) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

