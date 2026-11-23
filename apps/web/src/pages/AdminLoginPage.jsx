import React, { useState, useEffect, useRef } from 'react';
import Logo from '../components/Logo';
import { sanitizeAdminNextPath } from '../utils/adminUrlUtils.js';
import '../styles/admin.css';

export { sanitizeAdminNextPath };

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // Compute destination from URL search query (?next=...)
  const getNextDestination = () => {
    try {
      const search = window.location.search || '';
      const params = new URLSearchParams(search);
      const rawNext = params.get('next');
      return sanitizeAdminNextPath(rawNext);
    } catch {
      return '/admin';
    }
  };

  // 1. Initial check: If already authenticated, replace to destination immediately
  useEffect(() => {
    let isMounted = true;

    fetch('/admin/auth/session', {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data?.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        if (data?.authenticated) {
          const dest = getNextDestination();
          window.location.replace(dest);
        }
      })
      .catch(() => {
        fetch('/admin/auth/csrf', { credentials: 'include' })
          .then((res) => res.json())
          .then((csrfData) => {
            if (isMounted && csrfData?.csrfToken) {
              setCsrfToken(csrfData.csrfToken);
            }
          })
          .catch(() => {});
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Autofocus on username field on mount without triggering blur error
  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []);

  // Validation logic: required-field errors appear ONLY after a submit attempt, never on blur alone.
  // After the first submit attempt, each field validates live as the user types and clears its own error once valid.
  const showUsernameError = hasAttemptedSubmit && !username.trim();
  const showPasswordError = hasAttemptedSubmit && !password;

  // 3. Form submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isLoading || isLockedOut) return;

    setHasAttemptedSubmit(true);

    if (!username.trim() || !password) {
      if (!username.trim()) {
        usernameInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      let activeCsrf = csrfToken;
      if (!activeCsrf) {
        try {
          const csrfRes = await fetch('/admin/auth/csrf', { credentials: 'include' });
          const csrfData = await csrfRes.json();
          if (csrfData?.csrfToken) {
            activeCsrf = csrfData.csrfToken;
            setCsrfToken(activeCsrf);
          }
        } catch (_) {}
      }

      const response = await fetch('/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': activeCsrf || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          password,
          csrfToken: activeCsrf || ''
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success) {
        const dest = getNextDestination();
        window.location.replace(dest);
        return;
      }

      if (response.status === 429) {
        setIsLockedOut(true);
        setErrorMessage(data?.error || 'Too many attempts. Try again in a few minutes.');
      } else {
        // Uniform error message to prevent account enumeration
        setErrorMessage('Incorrect username or password.');
        // Clear password field, reset submission attempt so "Enter your password" doesn't flash
        setPassword('');
        setHasAttemptedSubmit(false);
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 50);
      }
    } catch (err) {
      setErrorMessage('Unable to connect to the authentication server. Please verify services are running.');
      setPassword('');
      setHasAttemptedSubmit(false);
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModifierKey = (e) => {
    if (e.getModifierState) {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  return (
    <div className="admin-scope">
      <div className="admin-login-wrapper">
        {/* Single Centered Column (Directly on white canvas, no card wrapper) */}
        <div className="admin-glass-card">
          {/* Stacked & Centered Header */}
          <header className="admin-login-card-header">
            <div className="admin-logo-centered">
              <svg
                viewBox="0 0 264 38"
                width="264"
                height="38"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="NivaaroFix"
                className="admin-logo-svg"
              >
                {/* Architectural shelter mark: 38px high, keeping official brand geometry */}
                <g transform="translate(-6.93, -7.55) scale(0.247557)">
                  <path
                    d="M 28 100 L 28 85 L 116 33 Q 120 30.5 124 33 L 212 85 L 212 100 L 124 48 Q 120 46 116 48 Z"
                    fill="#14181f"
                  />
                  <rect x="66" y="92" width="14" height="92" fill="#14181f" />
                  <polygon points="66,92 80,92 138,184 124,184" fill="#14181f" />
                  <rect x="124" y="92" width="14" height="92" fill="#14181f" />
                  <rect x="138" y="92" width="36" height="14" fill="#14181f" />
                  <rect x="138" y="134" width="28" height="13.5" fill="#14181f" />
                </g>
                {/* Wordmark: ~26px high, with clear padding so the 'x' is never clipped */}
                <g transform="translate(54.5, 32) scale(0.863636)">
                  <path
                    d="M8.61 0L4.41 0L4.41-29.40L7.85-29.40L27.30-5.25L25.49-5.25L25.49-29.40L29.69-29.40L29.69 0L26.25 0L6.80-24.15L8.61-24.15 M42.46 0L38.43 0L38.43-22.26L42.46-22.26L42.46 0M40.44-26.54Q39.27-26.54 38.49-27.30Q37.71-28.06 37.71-29.15Q37.71-30.28 38.49-31.04Q39.27-31.79 40.44-31.79Q41.62-31.79 42.39-31.06Q43.17-30.32 43.17-29.23Q43.17-28.10 42.42-27.32Q41.66-26.54 40.44-26.54 M60.60 0L56.48 0L46.74-22.26L50.94-22.26L59.59-2.10L57.57-2.10L66.39-22.26L70.34-22.26 M92.26 0L88.44 0L88.44-4.70L88.23-5.59L88.23-13.61Q88.23-16.17 86.74-17.58Q85.25-18.98 82.27-18.98Q80.29-18.98 78.40-18.33Q76.51-17.68 75.21-16.59L73.53-19.61Q75.25-21 77.67-21.74Q80.08-22.47 82.73-22.47Q87.31-22.47 89.78-20.24Q92.26-18.02 92.26-13.44L92.26 0M81.13 0.25Q78.65 0.25 76.79-0.59Q74.92-1.43 73.91-2.92Q72.90-4.41 72.90-6.30Q72.90-8.11 73.76-9.58Q74.62-11.05 76.58-11.93Q78.53-12.81 81.85-12.81L88.90-12.81L88.90-9.91L82.01-9.91Q78.99-9.91 77.94-8.90Q76.89-7.90 76.89-6.47Q76.89-4.83 78.19-3.84Q79.49-2.86 81.80-2.86Q84.07-2.86 85.77-3.86Q87.47-4.87 88.23-6.80L89.03-4.03Q88.23-2.06 86.21-0.90Q84.20 0.25 81.13 0.25 M117.88 0L114.06 0L114.06-4.70L113.85-5.59L113.85-13.61Q113.85-16.17 112.36-17.58Q110.86-18.98 107.88-18.98Q105.91-18.98 104.02-18.33Q102.13-17.68 100.83-16.59L99.15-19.61Q100.87-21 103.28-21.74Q105.70-22.47 108.34-22.47Q112.92-22.47 115.40-20.24Q117.88-18.02 117.88-13.44L117.88 0M106.75 0.25Q104.27 0.25 102.40-0.59Q100.53-1.43 99.52-2.92Q98.52-4.41 98.52-6.30Q98.52-8.11 99.38-9.58Q100.24-11.05 102.19-11.93Q104.14-12.81 107.46-12.81L114.52-12.81L114.52-9.91L107.63-9.91Q104.61-9.91 103.56-8.90Q102.51-7.90 102.51-6.47Q102.51-4.83 103.81-3.84Q105.11-2.86 107.42-2.86Q109.69-2.86 111.39-3.86Q113.09-4.87 113.85-6.80L114.64-4.03Q113.85-2.06 111.83-0.90Q109.81 0.25 106.75 0.25 M129.89 0L125.85 0L125.85-22.26L129.72-22.26L129.72-16.21L129.34-17.72Q130.26-20.03 132.45-21.25Q134.63-22.47 137.82-22.47L137.82-18.56Q137.57-18.61 137.34-18.61Q137.11-18.61 136.90-18.61Q133.67-18.61 131.78-16.67Q129.89-14.74 129.89-11.09 M153.11 0.25Q149.75 0.25 147.14-1.22Q144.54-2.69 143.03-5.27Q141.52-7.85 141.52-11.13Q141.52-14.45 143.03-17.01Q144.54-19.57 147.14-21.02Q149.75-22.47 153.11-22.47Q156.43-22.47 159.05-21.02Q161.68-19.57 163.17-17.03Q164.66-14.49 164.66-11.13Q164.66-7.81 163.17-5.25Q161.68-2.69 159.05-1.22Q156.43 0.25 153.11 0.25M153.11-3.28Q155.25-3.28 156.95-4.24Q158.65-5.21 159.62-6.99Q160.58-8.78 160.58-11.13Q160.58-13.52 159.62-15.27Q158.65-17.01 156.95-17.98Q155.25-18.94 153.11-18.94Q150.97-18.94 149.29-17.98Q147.61-17.01 146.60-15.27Q145.59-13.52 145.59-11.13Q145.59-8.78 146.60-6.99Q147.61-5.21 149.29-4.24Q150.97-3.28 153.11-3.28 M175.53 0L171.33 0L171.33-29.40L192.08-29.40L192.08-25.75L175.53-25.75L175.53 0M190.27-11.89L175.11-11.89L175.11-15.50L190.27-15.50 M201.95 0L197.91 0L197.91-22.26L201.95-22.26L201.95 0M199.93-26.54Q198.75-26.54 197.98-27.30Q197.20-28.06 197.20-29.15Q197.20-30.28 197.98-31.04Q198.75-31.79 199.93-31.79Q201.11-31.79 201.88-31.06Q202.66-30.32 202.66-29.23Q202.66-28.10 201.90-27.32Q201.15-26.54 199.93-26.54 M211.39 0L206.90 0L216.47-12.43L216.43-10.37L207.32-22.26L211.81-22.26L218.78-13.10L217.06-13.10L224.03-22.26L228.44-22.26L219.20-10.29L219.25-12.43L228.91 0L224.33 0L216.98-9.74L218.62-9.49"
                    fill="#14181f"
                  />
                </g>
              </svg>
            </div>
            <h1 className="admin-title-serif">Welcome</h1>
          </header>

          <form onSubmit={handleSubmit} noValidate className="admin-login-form">
            {/* Username Field */}
            <div className="admin-form-group">
              <label htmlFor="admin-username" className="admin-label">
                Username
              </label>
              <div className="admin-input-wrapper">
                <input
                  id="admin-username"
                  ref={usernameInputRef}
                  type="text"
                  name="username"
                  className={`admin-input ${showUsernameError ? 'has-error' : ''}`}
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  disabled={isLoading || isLockedOut}
                />
              </div>
              {showUsernameError && (
                <div className="admin-field-error" role="alert">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Enter your username</span>
                </div>
              )}
            </div>

            {/* Password Field */}
            <div className="admin-form-group">
              <label htmlFor="admin-password" className="admin-label">
                Password
              </label>
              <div className="admin-input-wrapper">
                <input
                  id="admin-password"
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  name="current-password"
                  className={`admin-input admin-input-password ${showPasswordError ? 'has-error' : ''}`}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  onKeyDown={handleModifierKey}
                  onKeyUp={handleModifierKey}
                  disabled={isLoading || isLockedOut}
                />
                <button
                  type="button"
                  className="admin-password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {showPasswordError && (
                <div className="admin-field-error" role="alert">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Enter your password</span>
                </div>
              )}
              {isCapsLockOn && (
                <div className="admin-caps-lock-hint" role="status">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l7 7h-4v10H9V10H5l7-7z" />
                  </svg>
                  <span>Caps Lock is on</span>
                </div>
              )}
            </div>

            {/* Inline Calm Error Alert Above Button */}
            {errorMessage && (
              <div
                className="admin-error-box"
                role="alert"
                aria-live="polite"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Full-width Ink Fill Button */}
            <button
              type="submit"
              className="admin-submit-btn"
              disabled={isLoading || isLockedOut}
            >
              {isLoading ? (
                <>
                  <span className="admin-spinner" aria-hidden="true" />
                  <span>Signing in</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer inside column (no hairline divider) */}
          <footer className="admin-card-footer">
            <p className="admin-card-footer-text">Protected area. Sign-ins are logged.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
