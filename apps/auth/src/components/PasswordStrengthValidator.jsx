import React from 'react';

export function evaluatePasswordStrength(password) {
  if (!password) return { level: 'none', label: '', score: 0 };
  
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z\d]/.test(password)) score++;

  if (password.length < 6 || score <= 1) {
    return { level: 'weak', label: 'Weak password', score: 1 };
  } else if (score === 2 || score === 3) {
    return { level: 'good', label: 'Good password', score: 2 };
  } else {
    return { level: 'strong', label: 'Strong password', score: 3 };
  }
}

export function PasswordStrengthMeter({ password }) {
  if (!password) return null;

  const { level, label } = evaluatePasswordStrength(password);

  return (
    <div className={`pw-strength-wrapper ${password ? 'visible' : ''}`}>
      <div className="strength-track">
        <div className={`strength-fill ${level}`} />
      </div>
      <span className={`strength-text ${level}`}>{label}</span>
    </div>
  );
}

export function ConfirmPasswordMatch({ password, confirmPassword }) {
  if (!confirmPassword) return null;

  const isMatch = password === confirmPassword && password.length > 0;

  return (
    <div
      className={`confirm-pw-match-text visible ${isMatch ? 'match' : 'mismatch'}`}
    >
      {isMatch ? '✓ Passwords match' : '✕ Passwords do not match'}
    </div>
  );
}
