import { useLanguage } from '../context/LanguageContext';
import React, { useState, useRef, useEffect } from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';
import BrandLogo from '../components/BrandLogo';
import PhoneOtpModal from '../components/PhoneOtpModal';
import UnifiedOtpInput from '../components/UnifiedOtpInput';
import GoogleOAuthModal from '../components/GoogleOAuthModal';
import AccountNotFoundModal from '../components/AccountNotFoundModal';
import { initiateDirectGoogleOAuth, getStoredGoogleClientId } from '../services/googleAuthService';

export default function CustomerPortalPage({ onNavigateForgot, onSwitchPortal }) {
  const { t, activeLanguage } = useLanguage();
  const { showToast } = useToastNotification();

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState('signin');
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false);
  const [notFoundIdentifier, setNotFoundIdentifier] = useState('');

  // Sign In State
  const [signInTab, setSignInTab] = useState('email'); // 'email' | 'phone'
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPw, setShowSignInPw] = useState(false);

  // Sign In Phone OTP Flow
  const [signInPhone, setSignInPhone] = useState('');
  const [signInOtpStep, setSignInOtpStep] = useState('phone'); // 'phone' | 'verify'
  const [signInOtp, setSignInOtp] = useState('');
  const [signInOtpError, setSignInOtpError] = useState('');
  const [isSignInSubmitting, setIsSignInSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Urban Company / Uber 30s OTP Resend Countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Sign Up State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignUpPw, setShowSignUpPw] = useState(false);
  const [showSignUpConfirmPw, setShowSignUpConfirmPw] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sign Up Validation & Touched Tracking
  const [touched, setTouched] = useState({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [duplicateEmailError, setDuplicateEmailError] = useState(false);
  const [duplicatePhoneError, setDuplicatePhoneError] = useState(false);

  // OTP Modal for Mobile Verification Step
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);

  // Refs for Autofocus & Element Navigation
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const signInPwRef = useRef(null);

  // Handle prefill from sessionStorage (set by AccountNotFoundModal or navigation)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('nivaarofix_signup_prefill');
      if (raw) {
        sessionStorage.removeItem('nivaarofix_signup_prefill');
        let val = raw;
        let type = null;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.value) {
            val = parsed.value;
            type = parsed.type;
          }
        } catch (_) {}

        const clean = String(val || '').trim();
        if (type === 'email' || clean.includes('@')) {
          setEmail(clean);
        } else {
          const digits = clean.replace(/\D/g, '').slice(-10);
          if (digits) setPhone(digits);
        }
      }
    } catch (_) {}
  }, [mode]);

  // Autofocus first field when mode changes
  useEffect(() => {
    if (mode === 'signup') {
      const timer = setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // Handle multi-step flow history (Sign-in <-> Sign-up, Phone <-> OTP verification)
  useEffect(() => {
    const handlePopState = (e) => {
      const state = e.state;
      if (state?.authStep === 'otp') {
        setSignInOtpStep('verify');
      } else if (state?.authStep === 'signup') {
        setMode('signup');
        setSignInOtpStep('phone');
      } else {
        // Missing state on refresh or back out of step gracefully defaults to the first step
        setMode('signin');
        setSignInOtpStep('phone');
        setIsOtpModalOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const goToSignUp = () => {
    window.history.pushState({ authStep: 'signup' }, '', window.location.href);
    setMode('signup');
  };

  const goToSignIn = () => {
    if (window.history.state?.authStep === 'signup') {
      window.history.back();
    } else {
      setMode('signin');
    }
  };

  // Helper to preserve return destination
  const getReturnTarget = () => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo') || params.get('next');
    if (returnTo) {
      const trimmed = returnTo.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !trimmed.includes('://')) {
        if (trimmed.includes('book') && !trimmed.includes('bookings')) {
          return { targetHash: '#/services', returnToQuery: `&returnTo=${encodeURIComponent(trimmed)}` };
        }
        if (trimmed.includes('bookings') || trimmed.includes('my-bookings')) {
          return { targetHash: '#/bookings', returnToQuery: `&returnTo=${encodeURIComponent(trimmed)}` };
        }
        if (trimmed.includes('services')) {
          return { targetHash: '#/services', returnToQuery: `&returnTo=${encodeURIComponent(trimmed)}` };
        }
        return { targetHash: '#/', returnToQuery: `&returnTo=${encodeURIComponent(trimmed)}` };
      }
    }
    return { targetHash: '#/', returnToQuery: '' };
  };

  // Sign In with Email & Password
  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    if (!signInEmail.trim() || !signInPassword) {
      showToast('Please enter both your email and password.', 4000, 'error');
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/auth/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: signInEmail.trim(),
          password: signInPassword
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'USER_NOT_FOUND' || res.status === 404) {
          setNotFoundIdentifier(signInEmail.trim());
          setIsNotFoundModalOpen(true);
          return;
        }

        if (data.code === 'INVALID_PASSWORD' || res.status === 401) {
          showToast(data.message || 'Incorrect password. Please verify your credentials or reset your password.', 4500, 'error');
          if (signInPwRef.current) {
            signInPwRef.current.focus();
          }
          return;
        }

        showToast(data.message || 'Sign in failed. Please check your credentials.', 4000, 'error');
        return;
      }

      const verifiedUser = { ...data.user, isLoggedIn: true };
      localStorage.setItem('nivaaro-user', JSON.stringify(verifiedUser));
      localStorage.removeItem('nivaaro-agent');
      showToast(`Welcome back, ${verifiedUser.name}! Redirecting to Dashboard...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedUser));
        const { targetHash, returnToQuery } = getReturnTarget();
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}${returnToQuery}${targetHash}`);
      }, 800);
    } catch (err) {
      console.error('Sign in error:', err);
      showToast('Network error connecting to authentication server.', 4500, 'error');
    }
  };

  // Request OTP for Phone Sign In
  const handleRequestOtp = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (signInPhone.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number.', 4000, 'error');
      return;
    }
    setSignInOtp('');
    setSignInOtpError('');
    setResendCooldown(30);
    // Push step state so Back goes back to phone entry step first
    window.history.pushState({ authStep: 'otp' }, '', window.location.href);
    setSignInOtpStep('verify');
    try {
      await fetch('http://localhost:5000/api/auth/send-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: signInPhone })
      });
      showToast(`Verification code sent to +91 ${signInPhone}`, 3000, 'success');
    } catch {}
  };

  // Sign In with Phone OTP
  const handlePhoneOtpSignIn = async (e, directOtp) => {
    if (e && e.preventDefault) e.preventDefault();
    const codeToVerify = typeof directOtp === 'string' ? directOtp : signInOtp;
    if (signInPhone.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number.', 4000, 'error');
      return;
    }
    if (!codeToVerify || codeToVerify.length !== 6) {
      showToast('Please enter all 6 digits of the verification code.', 4000, 'error');
      return;
    }

    setIsSignInSubmitting(true);
    try {
      const res = await fetch('http://localhost:5000/api/auth/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: `+91 ${signInPhone}`, otp: codeToVerify })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'USER_NOT_FOUND' || res.status === 404) {
          setNotFoundIdentifier(`+91 ${signInPhone}`);
          setIsNotFoundModalOpen(true);
          setIsSignInSubmitting(false);
          return;
        }

        setSignInOtpError(data.message || 'Incorrect verification code. Please try again.');
        showToast(data.message || 'Phone sign in failed.', 4000, 'error');
        setIsSignInSubmitting(false);
        return;
      }

      const verifiedUser = { ...data.user, isLoggedIn: true };
      localStorage.setItem('nivaaro-user', JSON.stringify(verifiedUser));
      localStorage.removeItem('nivaaro-agent');
      showToast(`Welcome back, ${verifiedUser.name}! Redirecting to Dashboard...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedUser));
        const { targetHash, returnToQuery } = getReturnTarget();
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}${returnToQuery}${targetHash}`);
      }, 800);
    } catch (err) {
      showToast('Network error connecting to authentication server.', 4500, 'error');
      setIsSignInSubmitting(false);
    }
  };

  // Validation helper with exact specified error messages
  const validateField = (fieldName, val, allValues = {}) => {
    switch (fieldName) {
      case 'name':
        return !val || !val.trim() ? 'Enter your full name.' : null;
      case 'email':
        return !val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()) ? 'Enter a valid email address.' : null;
      case 'phone': {
        const digits = (val || '').replace(/\D/g, '').slice(-10);
        return digits.length !== 10 ? 'Enter a 10-digit mobile number.' : null;
      }
      case 'password':
        return !val || val.length < 8 ? 'Use at least 8 characters.' : null;
      case 'confirmPassword': {
        const pw = allValues.password !== undefined ? allValues.password : password;
        if (!val || val !== pw) return "Passwords don't match.";
        return null;
      }
      default:
        return null;
    }
  };

  // Blur validation handlers (only marks field touched and evaluates error)
  const handleBlurField = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const val =
      fieldName === 'name' ? name :
      fieldName === 'email' ? email :
      fieldName === 'phone' ? phone :
      fieldName === 'password' ? password : confirmPassword;
    const err = validateField(fieldName, val, { password });
    setFieldErrors((prev) => ({ ...prev, [fieldName]: err }));
  };

  // Sign Up Form Submit
  const handleSignUpSubmit = (e) => {
    e.preventDefault();
    setHasSubmitted(true);
    setDuplicateEmailError(false);
    setDuplicatePhoneError(false);

    const errs = {
      name: validateField('name', name),
      email: validateField('email', email),
      phone: validateField('phone', phone),
      password: validateField('password', password),
      confirmPassword: validateField('confirmPassword', confirmPassword, { password })
    };


    setFieldErrors(errs);
    setTouched({ name: true, email: true, phone: true, password: true, confirmPassword: true });

    // Focus the first invalid field and scroll it into view
    const fieldOrder = [
      { key: 'name', ref: nameInputRef },
      { key: 'email', ref: emailInputRef },
      { key: 'phone', ref: phoneInputRef },
      { key: 'password', ref: passwordInputRef },
      { key: 'confirmPassword', ref: confirmPasswordInputRef }
    ];

    const firstInvalid = fieldOrder.find((f) => errs[f.key]);
    if (firstInvalid) {
      const focusTarget = () => {
        if (firstInvalid.ref && firstInvalid.ref.current) {
          firstInvalid.ref.current.focus();
          try {
            firstInvalid.ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (_) {}
        }
      };
      focusTarget();
      setTimeout(focusTarget, 60);
      return;
    }

    // Open Mobile Verification OTP Modal
    setIsOtpModalOpen(true);
  };

  // Handle OTP verification success from modal
  const handleOtpVerified = async (enteredOtp) => {
    setIsOtpModalOpen(false);
    setIsSubmitting(true);
    await completeCustomerRegistration(Boolean(enteredOtp && enteredOtp !== 'SKIPPED'));
  };

  const handleSkipOtpAndContinue = async () => {
    setIsOtpModalOpen(false);
    setIsSubmitting(true);
    await completeCustomerRegistration(false);
  };

  // Perform API Registration
  const completeCustomerRegistration = async (isPhoneVerified = false) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhoneDigits = phone.replace(/\D/g, '').slice(-10);
    const formattedPhone = cleanPhoneDigits ? `+91 ${cleanPhoneDigits}` : null;

    try {
      const res = await fetch('http://localhost:5000/api/auth/customer-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          email: cleanEmail,
          phone: formattedPhone,
          password,
          isPhoneVerified: Boolean(isPhoneVerified)
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsSubmitting(false);
        if (data.code === 'ACCOUNT_EXISTS' || (data.message && data.message.toLowerCase().includes('email'))) {
          setDuplicateEmailError(true);
          return;
        }
        if (data.code === 'PHONE_EXISTS' || (data.message && data.message.toLowerCase().includes('mobile'))) {
          setDuplicatePhoneError(true);
          return;
        }
        showToast(data.message || 'Registration failed. Please check your details.', 4500, 'error');
        return;
      }

      const verifiedUser = {
        ...data.user,
        isPhoneVerified: Boolean(data.user?.isPhoneVerified),
        isLoggedIn: true
      };
      localStorage.setItem('nivaaro-user', JSON.stringify(verifiedUser));
      localStorage.removeItem('nivaaro-agent');
      if (isPhoneVerified) {
        showToast(`Account created successfully! Welcome, ${verifiedUser.name}.`, 2500, 'success');
      } else {
        showToast(`Account created! Note: Mobile number is not verified yet.`, 3000, 'info');
      }

      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedUser));
        const { targetHash, returnToQuery } = getReturnTarget();
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}${returnToQuery}${targetHash}`);
      }, 800);
    } catch (e) {
      setIsSubmitting(false);
      console.error('Customer registration error:', e);
      showToast('Network error connecting to authentication server.', 4500, 'error');
    }
  };

  // Google OAuth Handlers
  const handleGoogleSuccess = (googleUser) => {
    setIsGoogleModalOpen(false);
    const customerData = {
      ...googleUser,
      isLoggedIn: true
    };
    localStorage.setItem('nivaaro-user', JSON.stringify(customerData));
    localStorage.removeItem('nivaaro-agent');
    showToast(`Welcome, ${customerData.name}! Connecting with Google...`, 2500, 'success');
    setTimeout(() => {
      const payload = encodeURIComponent(JSON.stringify(customerData));
      const { targetHash, returnToQuery } = getReturnTarget();
      // HISTORY RULE: Leave login view with replace so Back does not return to login form
      window.location.replace(`http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}${returnToQuery}${targetHash}`);
    }, 800);
  };

  const handleGoogleButtonClick = async () => {
    const clientId = getStoredGoogleClientId();
    if (clientId) {
      await initiateDirectGoogleOAuth({
        role: 'customer',
        onStart: () => showToast('Connecting to your Google account...', 2000, 'info'),
        onSuccess: handleGoogleSuccess,
        onError: (err) => {
          if (err.code === 'NO_CLIENT_ID') {
            setIsGoogleModalOpen(true);
          } else {
            showToast(err.message || 'Google sign-in was cancelled.', 4000, 'error');
          }
        }
      });
    } else {
      setIsGoogleModalOpen(true);
    }
  };

  return (
    <div className="auth-card-container">
      <div className={`auth-card ${mode === 'signup' ? 'sign-up-mode' : ''}`}>
        {/* ================= SIGN IN PANEL ================= */}
        {mode === 'signin' && (
          <div className="form-panel sign-in-panel">
            <div className="form-wrapper">
              <div className="form-header">
                <div style={{ display: 'inline-flex', marginBottom: '16px' }}>
                  <BrandLogo variant="horizontal" size={32} isPartner={false} />
                </div>
                <h2>Welcome back</h2>
                <p>Log in to book and track your home services.</p>
              </div>

              {/* Minimal Tab Switcher */}
              <div className="auth-mode-switch" style={{ marginBottom: '20px' }}>
                <button
                  type="button"
                  className={`mode-tab ${signInTab === 'email' ? 'active' : ''}`}
                  onClick={() => setSignInTab('email')}
                >
                  Email
                </button>
                <button
                  type="button"
                  className={`mode-tab ${signInTab === 'phone' ? 'active' : ''}`}
                  onClick={() => setSignInTab('phone')}
                >
                  Mobile OTP
                </button>
              </div>

              {/* Email Sign In */}
              {signInTab === 'email' && (
                <form onSubmit={handleSignInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="input-group">
                    <label htmlFor="signin-email" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                      {t.emailAddressLabel || 'Email address'}
                    </label>
                    <input
                      id="signin-email"
                      type="email"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="name@domain.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <label htmlFor="signin-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)' }}>
                        Password
                      </label>
                      <button
                        type="button"
                        className="forgot-link"
                        onClick={onNavigateForgot}
                        style={{ fontSize: '13px', color: 'var(--brand-primary, #047857)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="password-wrapper" style={{ position: 'relative' }}>
                      <input
                        id="signin-password"
                        ref={signInPwRef}
                        type={showSignInPw ? 'text' : 'password'}
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        style={{ paddingRight: '44px' }}
                      />
                      <button
                        type="button"
                        className="btn-toggle-pw"
                        onClick={() => setShowSignInPw(!showSignInPw)}
                        tabIndex={-1}
                        aria-label={showSignInPw ? 'Hide password' : 'Show password'}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0 }}
                      >
                        {showSignInPw ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isSignInSubmitting}
                  >
                    {isSignInSubmitting ? 'Logging in...' : 'Log in'}
                  </button>
                </form>
              )}

              {/* Phone OTP Sign In */}
              {signInTab === 'phone' && (
                <div>
                  {signInOtpStep === 'phone' ? (
                    <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="input-group">
                        <label htmlFor="signin-phone" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                          Mobile number
                        </label>
                        <div className="phone-input-wrapper">
                          <span
                            style={{
                              padding: '0 12px',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: 'var(--text-primary, #111827)',
                              borderRight: '1px solid rgba(0, 0, 0, 0.12)',
                              height: '100%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              userSelect: 'none'
                            }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>IN</span>
                            <span>+91</span>
                          </span>
                          <input
                            id="signin-phone"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={10}
                            value={signInPhone}
                            onChange={(e) => setSignInPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="98765 43210"
                            autoComplete="tel-national"
                            required
                            style={{
                              fontSize: '15px',
                              letterSpacing: '0.02em'
                            }}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={signInPhone.length !== 10}
                      >
                        Request OTP
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={(e) => handlePhoneOtpSignIn(e, signInOtp)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="otp-header-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                        <span>Code sent to <strong>+91 {signInPhone}</strong></span>
                        <button
                          type="button"
                          className="btn-change-number"
                          onClick={() => {
                            if (window.history.state?.authStep === 'otp') {
                              window.history.back();
                            } else {
                              setSignInOtpStep('phone');
                            }
                            setSignInOtp('');
                            setSignInOtpError('');
                          }}
                          style={{ color: 'var(--brand-primary, #047857)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                        >
                          Edit
                        </button>
                      </div>

                      <div style={{ marginTop: '2px' }}>
                        <UnifiedOtpInput
                          length={6}
                          value={signInOtp}
                          onChange={(val) => {
                            setSignInOtp(val);
                            setSignInOtpError('');
                          }}
                          onComplete={(code) => handlePhoneOtpSignIn(null, code)}
                          error={signInOtpError}
                          disabled={isSignInSubmitting}
                          autoFocus={true}
                          ariaLabel="Enter 6-digit phone login OTP"
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '-4px', fontSize: '13px' }}>
                        {resendCooldown > 0 ? (
                          <span style={{ color: 'var(--text-secondary, #6B7280)' }}>
                            Resend code in <strong>0:{resendCooldown < 10 ? '0' : ''}{resendCooldown}</strong>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--brand-primary, #047857)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '4px 8px',
                              fontSize: '13px'
                            }}
                          >
                            Didn't get code? Resend OTP
                          </button>
                        )}
                      </div>

                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={signInOtp.length !== 6 || isSignInSubmitting}
                        style={{ marginTop: '4px' }}
                      >
                        {isSignInSubmitting ? 'Logging in...' : 'Log in'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              <div className="divider" style={{ margin: '20px 0' }}>
                <span>OR</span>
              </div>

              <button
                type="button"
                className="btn-google"
                onClick={handleGoogleButtonClick}
                style={{ width: '100%', height: '48px', minHeight: '48px', borderRadius: '12px', fontSize: '14px', fontWeight: 600 }}
              >
                <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <p style={{ fontSize: '11.5px', color: '#6B7280', textAlign: 'center', marginTop: '14px', marginBottom: '0', lineHeight: 1.4 }}>
                By continuing, you agree to NivaaroFix Terms of Service and Privacy Policy.
              </p>

              <div className="card-switch-footer" style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: '#4B5563' }}>
                <span>New to NivaaroFix?</span>{' '}
                <button
                  type="button"
                  className="btn-link"
                  onClick={goToSignUp}
                  style={{ color: 'var(--brand-primary, #047857)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Create account
                </button>
              </div>

              {onSwitchPortal && (
                <div className="card-switch-footer card-switch-role-footer" style={{ marginTop: '12px', textAlign: 'center', fontSize: '13px' }}>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => onSwitchPortal('agent')}
                    style={{ color: 'var(--brand-primary, #047857)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Join as a professional
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= CREATE ACCOUNT (SIGN UP) PANEL ================= */}
        {mode === 'signup' && (
          <div className="form-panel sign-up-panel">
            <div className="form-wrapper">
              
              {/* Form Header */}
              <div className="form-header">
                <div style={{ display: 'inline-flex', marginBottom: '16px' }}>
                  <BrandLogo variant="horizontal" size={32} isPartner={false} />
                </div>
                <h1>Create your account</h1>
                <p>Book trusted electricians and plumbers in minutes.</p>
              </div>

              {/* Form with Equal 20px Vertical Rhythm */}
              <form onSubmit={handleSignUpSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Full name */}
                <div className="input-group">
                  <label htmlFor="customer-name" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Full name
                  </label>
                  <input
                    id="customer-name"
                    ref={nameInputRef}
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setName(val);
                      if (touched.name || hasSubmitted) {
                        setFieldErrors((prev) => ({ ...prev, name: validateField('name', val) }));
                      }
                    }}
                    onBlur={() => handleBlurField('name')}
                    placeholder="e.g. Rohit Sharma"
                    autoComplete="name"
                    autoFocus
                    required
                    aria-invalid={(touched.name || hasSubmitted) && !!fieldErrors.name}
                    aria-describedby={(touched.name || hasSubmitted) && fieldErrors.name ? 'customer-name-error' : undefined}
                  />
                  {(touched.name || hasSubmitted) && fieldErrors.name && (
                    <span id="customer-name-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

                {/* 2. Email address */}
                <div className="input-group">
                  <label htmlFor="customer-email" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Email address
                  </label>
                  <input
                    id="customer-email"
                    ref={emailInputRef}
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEmail(val);
                      setDuplicateEmailError(false);
                      if (touched.email || hasSubmitted) {
                        setFieldErrors((prev) => ({ ...prev, email: validateField('email', val) }));
                      }
                    }}
                    onBlur={() => handleBlurField('email')}
                    placeholder="e.g. rohit@example.com"
                    autoComplete="email"
                    required
                    aria-invalid={(touched.email || hasSubmitted) && (!!fieldErrors.email || duplicateEmailError)}
                    aria-describedby={(touched.email || hasSubmitted) && (fieldErrors.email || duplicateEmailError) ? 'customer-email-error' : undefined}
                  />
                  {(touched.email || hasSubmitted) && fieldErrors.email && (
                    <span id="customer-email-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.email}
                    </span>
                  )}
                  {duplicateEmailError && (
                    <span id="customer-email-duplicate" role="alert" aria-live="polite" className="field-error-msg">
                      This email is already registered.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setSignInEmail(email);
                          setMode('signin');
                          setSignInTab('email');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--brand-primary, #047857)',
                          fontWeight: 600,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        Log in
                      </button>
                    </span>
                  )}
                </div>

                {/* 3. Mobile number (+91 prefix, 10 digits) */}
                <div className="input-group">
                  <label htmlFor="customer-phone" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Mobile number
                  </label>
                  <div className="phone-input-wrapper">
                    <span
                      style={{
                        padding: '0 12px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary, #111827)',
                        borderRight: '1px solid rgba(0, 0, 0, 0.12)',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        userSelect: 'none'
                      }}
                    >
                      +91
                    </span>
                    <input
                      id="customer-phone"
                      ref={phoneInputRef}
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhone(digits);
                        setDuplicatePhoneError(false);
                        if (touched.phone || hasSubmitted) {
                          setFieldErrors((prev) => ({ ...prev, phone: validateField('phone', digits) }));
                        }
                      }}
                      onBlur={() => handleBlurField('phone')}
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                      required
                      aria-invalid={(touched.phone || hasSubmitted) && (!!fieldErrors.phone || duplicatePhoneError)}
                      aria-describedby={(touched.phone || hasSubmitted) && (fieldErrors.phone || duplicatePhoneError) ? 'customer-phone-error' : undefined}
                    />
                  </div>
                  {(touched.phone || hasSubmitted) && fieldErrors.phone && (
                    <span id="customer-phone-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.phone}
                    </span>
                  )}
                  {duplicatePhoneError && (
                    <span id="customer-phone-duplicate" role="alert" aria-live="polite" className="field-error-msg">
                      This mobile number is already registered.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setSignInPhone(phone);
                          setMode('signin');
                          setSignInTab('phone');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--brand-primary, #047857)',
                          fontWeight: 600,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        Log in
                      </button>
                    </span>
                  )}
                </div>

                {/* 4. Password */}
                <div className="input-group">
                  <label htmlFor="customer-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Password
                  </label>
                  <div className="password-wrapper" style={{ position: 'relative' }}>
                    <input
                      id="customer-password"
                      ref={passwordInputRef}
                      name="password"
                      type={showSignUpPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPassword(val);
                        if (touched.password || hasSubmitted) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            password: validateField('password', val),
                            ...(touched.confirmPassword || hasSubmitted ? { confirmPassword: validateField('confirmPassword', confirmPassword, { password: val }) } : {})
                          }));
                        } else if (confirmPassword && (touched.confirmPassword || hasSubmitted)) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            confirmPassword: validateField('confirmPassword', confirmPassword, { password: val })
                          }));
                        }
                      }}
                      onBlur={() => handleBlurField('password')}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      required
                      style={{ paddingRight: '44px' }}
                      aria-invalid={(touched.password || hasSubmitted) && !!fieldErrors.password}
                      aria-describedby={(touched.password || hasSubmitted) && fieldErrors.password ? 'customer-password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="btn-toggle-pw"
                      onClick={() => setShowSignUpPw(!showSignUpPw)}
                      tabIndex={-1}
                      aria-label={showSignUpPw ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6B7280',
                        padding: 0
                      }}
                    >
                      {showSignUpPw ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  {(touched.password || hasSubmitted) && fieldErrors.password && (
                    <span id="customer-password-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.password}
                    </span>
                  )}
                </div>

                {/* 5. Confirm password */}
                <div className="input-group">
                  <label htmlFor="customer-confirm-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Confirm password
                  </label>
                  <div className="password-wrapper" style={{ position: 'relative' }}>
                    <input
                      id="customer-confirm-password"
                      ref={confirmPasswordInputRef}
                      name="confirmPassword"
                      type={showSignUpConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfirmPassword(val);
                        if (val === password) {
                          setFieldErrors((prev) => ({ ...prev, confirmPassword: null }));
                        } else if (touched.confirmPassword || hasSubmitted) {
                          setFieldErrors((prev) => ({ ...prev, confirmPassword: validateField('confirmPassword', val, { password }) }));
                        }
                      }}
                      onBlur={() => handleBlurField('confirmPassword')}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      required
                      style={{ paddingRight: '44px' }}
                      aria-invalid={(touched.confirmPassword || hasSubmitted) && !!fieldErrors.confirmPassword}
                      aria-describedby={(touched.confirmPassword || hasSubmitted) && fieldErrors.confirmPassword ? 'customer-confirm-password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="btn-toggle-pw"
                      onClick={() => setShowSignUpConfirmPw(!showSignUpConfirmPw)}
                      tabIndex={-1}
                      aria-label={showSignUpConfirmPw ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6B7280',
                        padding: 0
                      }}
                    >
                      {showSignUpConfirmPw ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  {(touched.confirmPassword || hasSubmitted) && fieldErrors.confirmPassword && (
                    <span id="customer-confirm-password-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.confirmPassword}
                    </span>
                  )}
                </div>

                {/* Primary Button: Full Width, 48px, Brand Green, Loading State */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{ marginTop: '4px' }}
                >
                  {isSubmitting ? (
                    <>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTopColor: '#ffffff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }}
                      />
                      <span>Creating account...</span>
                    </>
                  ) : (
                    <span>Create account</span>
                  )}
                </button>
              </form>

              {/* Already have an account? Log in */}
              <div className="card-switch-footer" style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary, #4B5563)' }}>
                <span>Already have an account?</span>{' '}
                <button
                  type="button"
                  onClick={goToSignIn}
                  style={{
                    color: 'var(--brand-primary, #047857)',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Log in
                </button>
              </div>

              {onSwitchPortal && (
                <div className="card-switch-footer card-switch-role-footer" style={{ marginTop: '12px', textAlign: 'center', fontSize: '13px' }}>
                  <button
                    type="button"
                    onClick={() => onSwitchPortal('agent')}
                    style={{
                      color: 'var(--brand-primary, #047857)',
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Join as a professional
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shared Mobile OTP Verification Modal */}
      <PhoneOtpModal
        isOpen={isOtpModalOpen}
        phoneDigits={phone.replace(/\D/g, '').slice(-10)}
        onClose={() => setIsOtpModalOpen(false)}
        onVerifySuccess={handleOtpVerified}
        onContinueWithoutOtp={handleSkipOtpAndContinue}
      />

      {/* Google OAuth Modal */}
      <GoogleOAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        role="customer"
        onSuccess={handleGoogleSuccess}
      />

      {/* Account Not Found Modal */}
      <AccountNotFoundModal
        isOpen={isNotFoundModalOpen}
        role="customer"
        identifier={notFoundIdentifier}
        onRedirectToSignUp={(idVal, idType) => {
          setIsNotFoundModalOpen(false);
          goToSignUp();
          if (idType === 'email' || (idVal && idVal.includes('@'))) {
            setEmail(idVal.trim());
          } else if (idVal) {
            setPhone(idVal.replace(/\D/g, '').slice(-10));
          }
        }}
        onClose={() => setIsNotFoundModalOpen(false)}
      />
    </div>
  );
}
