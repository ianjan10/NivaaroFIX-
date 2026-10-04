import React, { useRef } from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';

export default function IndianPhoneInput({ id, value, onChange, placeholder = "Enter 10-digit mobile number", required = false, onComplete }) {
  const { showToast } = useToastNotification();
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (
      ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End'].includes(e.key) ||
      (e.ctrlKey || e.metaKey)
    ) {
      return;
    }

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      showToast('Only numbers are allowed in mobile number.', 5500, 'error');
      return;
    }

    const currentDigits = (value || '').replace(/\D/g, '');
    const hasSelection = inputRef.current ? inputRef.current.selectionStart !== inputRef.current.selectionEnd : false;

    if (currentDigits.length >= 10 && !hasSelection) {
      e.preventDefault();
      showToast('Maximum 10 digits allowed for Indian mobile number (+91).', 5000, 'info');
    }
  };

  const handleInputChange = (e) => {
    const rawVal = e.target.value;
    if (/[^\d]/.test(rawVal)) {
      showToast('Only numbers are allowed in mobile number.', 5500, 'error');
    }
    const cleanDigits = rawVal.replace(/\D/g, '').slice(0, 10);
    onChange(cleanDigits);

    if (cleanDigits.length === 10 && onComplete) {
      onComplete(cleanDigits);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteText = (e.clipboardData || window.clipboardData).getData('text') || '';
    if (/[^\d]/.test(pasteText)) {
      showToast('Only numbers are allowed in mobile number.', 5500, 'error');
    }
    const cleanPaste = pasteText.replace(/\D/g, '').slice(0, 10);
    onChange(cleanPaste);

    if (cleanPaste.length === 10 && onComplete) {
      onComplete(cleanPaste);
    }
  };

  return (
    <div className="phone-input-wrapper">
      <span className="phone-prefix-badge">🇮🇳 +91</span>
      <input
        ref={inputRef}
        type="tel"
        id={id}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        maxLength={10}
        autoComplete="tel"
        inputMode="numeric"
        required={required}
      />
    </div>
  );
}
