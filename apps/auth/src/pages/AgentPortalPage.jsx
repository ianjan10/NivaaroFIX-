import { useLanguage } from '../context/LanguageContext';
import React, { useState, useRef, useEffect } from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';
import BrandLogo from '../components/BrandLogo';
import PhoneOtpModal from '../components/PhoneOtpModal';
import UnifiedOtpInput from '../components/UnifiedOtpInput';
import GoogleOAuthModal from '../components/GoogleOAuthModal';
import AccountNotFoundModal from '../components/AccountNotFoundModal';
import ExperienceStepper from '../components/ExperienceStepper';
import { initiateDirectGoogleOAuth, getStoredGoogleClientId } from '../services/googleAuthService';
import { setStoredSessionToken } from '../services/apiClient';

const AVAILABLE_TRADES = [
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' }
];

export default function AgentPortalPage({ onNavigateForgot, onSwitchPortal }) {
  const { t, activeLanguage } = useLanguage();
  const { showToast } = useToastNotification();

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'signup' || params.get('action') === 'signup' ? 'signup' : 'signin';
  });
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false);
  const [notFoundIdentifier, setNotFoundIdentifier] = useState('');

  // Agent Sign In State
  const [signInTab, setSignInTab] = useState('agentId'); // 'agentId' | 'phone'
  const [agentIdOrEmail, setAgentIdOrEmail] = useState('');
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

  // Partner Registration State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [experienceYears, setExperienceYears] = useState(0);
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
  const tradeInputRef = useRef(null);
  const experienceInputRef = useRef(null);
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

  // Sign In with Partner ID / Email & Password
  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    if (!agentIdOrEmail.trim() || !signInPassword) {
      showToast('Please enter both your Professional ID/Email and password.', 4000, 'error');
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agentIdOrEmail: agentIdOrEmail.trim(),
          password: signInPassword
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'AGENT_NOT_FOUND' || res.status === 404) {
          setNotFoundIdentifier(agentIdOrEmail.trim());
          setIsNotFoundModalOpen(true);
          return;
        }

        if (data.code === 'INVALID_PASSWORD' || res.status === 401) {
          showToast(data.message || 'Incorrect professional password. Please verify your credentials or reset your password.', 4500, 'error');
          if (signInPwRef.current) {
            signInPwRef.current.focus();
          }
          return;
        }

        showToast(data.message || 'Professional sign in failed. Please check your credentials.', 4000, 'error');
        return;
      }

      if (data.sessionToken || data.token) {
        setStoredSessionToken(data.sessionToken || data.token);
      }
      const verifiedAgent = { ...data.agent, isLoggedIn: true };
      localStorage.setItem('nivaaro-agent', JSON.stringify(verifiedAgent));
      localStorage.removeItem('nivaaro-user');
      showToast(`Welcome back, ${verifiedAgent.name}! Redirecting to Partner Console...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedAgent));
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`);
      }, 800);
    } catch (err) {
      console.error('Agent sign in error:', err);
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
      const res = await fetch('http://localhost:5000/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: `+91 ${signInPhone}`, otp: codeToVerify })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'AGENT_NOT_FOUND' || res.status === 404) {
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

      if (data.sessionToken || data.token) {
        setStoredSessionToken(data.sessionToken || data.token);
      }
      const verifiedAgent = { ...data.agent, isLoggedIn: true };
      localStorage.setItem('nivaaro-agent', JSON.stringify(verifiedAgent));
      localStorage.removeItem('nivaaro-user');
      showToast(`Welcome back, ${verifiedAgent.name}! Redirecting to Partner Console...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedAgent));
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`);
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
      case 'trade':
        return !val ? 'Choose your trade.' : null;
      case 'experienceYears': {
        if (val === '' || val === null || val === undefined) return null;
        if (val === 0 || val === '0' || String(val).toLowerCase() === 'fresher') return null;
        const num = Number(val);
        if (isNaN(num) || num < 0 || num > 50) return 'Experience must be between 0 and 50 years.';
        return null;
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
      fieldName === 'trade' ? trade :
      fieldName === 'experienceYears' ? experienceYears :
      fieldName === 'password' ? password : confirmPassword;
    const err = validateField(fieldName, val, { password });
    setFieldErrors((prev) => ({ ...prev, [fieldName]: err }));

    // Proactive background uniqueness check on blur
    if (!err && fieldName === 'email' && val && val.includes('@')) {
      fetch('http://localhost:5000/api/auth/check-agent-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val.toLowerCase().trim() })
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.available === false && (d.field === 'email' || d.code === 'ACCOUNT_EXISTS')) {
            setDuplicateEmailError(true);
          }
        })
        .catch(() => {});
    }

    if (!err && fieldName === 'phone' && val && val.length === 10) {
      fetch('http://localhost:5000/api/auth/check-agent-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: val })
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.available === false && (d.field === 'phone' || d.code === 'PHONE_EXISTS')) {
            setDuplicatePhoneError(true);
          }
        })
        .catch(() => {});
    }
  };

  // Sign Up Form Submit
  const handleSignUpSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setHasSubmitted(true);
    setDuplicateEmailError(false);
    setDuplicatePhoneError(false);

    const errs = {
      name: validateField('name', name),
      email: validateField('email', email),
      phone: validateField('phone', phone),
      trade: validateField('trade', trade),
      experienceYears: validateField('experienceYears', experienceYears),
      password: validateField('password', password),
      confirmPassword: validateField('confirmPassword', confirmPassword, { password })
    };

    setFieldErrors(errs);
    setTouched({
      name: true,
      email: true,
      phone: true,
      trade: true,
      experienceYears: true,
      password: true,
      confirmPassword: true
    });

    // Focus the first invalid field and scroll it into view
    const fieldOrder = [
      { key: 'name', ref: nameInputRef },
      { key: 'email', ref: emailInputRef },
      { key: 'phone', ref: phoneInputRef },
      { key: 'trade', ref: tradeInputRef },
      { key: 'experienceYears', ref: experienceInputRef },
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

    // Proactively verify uniqueness on server BEFORE popping up OTP modal
    setIsSubmitting(true);
    try {
      const cleanEmail = email.toLowerCase().trim();
      const cleanDigits = phone.replace(/\D/g, '').slice(-10);

      const checkRes = await fetch('http://localhost:5000/api/auth/check-agent-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, phone: cleanDigits })
      });
      const checkData = await checkRes.json();
      setIsSubmitting(false);

      if (checkData && checkData.available === false) {
        if (checkData.field === 'email' || checkData.code === 'ACCOUNT_EXISTS') {
          setDuplicateEmailError(true);
          showToast(checkData.message || 'This email address is already registered. Please sign in.', 4500, 'error');
          if (emailInputRef.current) {
            emailInputRef.current.focus();
            try {
              emailInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
          }
          return;
        }

        if (checkData.field === 'phone' || checkData.code === 'PHONE_EXISTS') {
          setDuplicatePhoneError(true);
          showToast(checkData.message || 'This mobile number is already registered. Please sign in.', 4500, 'error');
          if (phoneInputRef.current) {
            phoneInputRef.current.focus();
            try {
              phoneInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
          }
          return;
        }
      }
    } catch (_) {
      setIsSubmitting(false);
      // Proceed to OTP modal if pre-check is temporarily unreachable
    }

    // Open Mobile Verification OTP Modal
    setIsOtpModalOpen(true);
  };

  // Handle OTP verification success from modal
  const handleOtpVerified = async (enteredOtp) => {
    setIsOtpModalOpen(false);
    setIsSubmitting(true);
    await completeAgentRegistration(Boolean(enteredOtp && enteredOtp !== 'SKIPPED'));
  };

  const handleSkipOtpAndContinue = async () => {
    setIsOtpModalOpen(false);
    setIsSubmitting(true);
    await completeAgentRegistration(false);
  };

  // Perform API Registration
  const completeAgentRegistration = async (isPhoneVerified = false) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanPhoneDigits = phone.replace(/\D/g, '').slice(-10);
    const formattedPhone = cleanPhoneDigits ? `+91 ${cleanPhoneDigits}` : null;

    try {
      const res = await fetch('http://localhost:5000/api/auth/agent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          email: cleanEmail,
          phone: formattedPhone,
          trade: trade || 'electrician',
          experienceYears: Number(experienceYears) || 0,
          password,
          isPhoneVerified: Boolean(isPhoneVerified)
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsSubmitting(false);
        const errMsg = data.message || data.error || '';
        const isEmailDup = data.code === 'ACCOUNT_EXISTS' || errMsg.toLowerCase().includes('email');
        const isPhoneDup = data.code === 'PHONE_EXISTS' || errMsg.toLowerCase().includes('mobile') || errMsg.toLowerCase().includes('phone');

        if (isEmailDup) {
          setDuplicateEmailError(true);
          showToast(errMsg || 'A professional account with this email address already exists. Please sign in.', 4500, 'error');
          if (emailInputRef.current) {
            emailInputRef.current.focus();
            try {
              emailInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
          }
          return;
        }

        if (isPhoneDup) {
          setDuplicatePhoneError(true);
          showToast(errMsg || 'A professional account with this mobile number already exists. Please sign in.', 4500, 'error');
          if (phoneInputRef.current) {
            phoneInputRef.current.focus();
            try {
              phoneInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
          }
          return;
        }

        showToast(errMsg || 'Professional registration failed. Please check your details.', 4500, 'error');
        return;
      }

      if (data.sessionToken || data.token) {
        setStoredSessionToken(data.sessionToken || data.token);
      }
      const verifiedAgent = {
        ...data.agent,
        isPhoneVerified: Boolean(data.agent?.isPhoneVerified),
        isLoggedIn: true
      };
      localStorage.setItem('nivaaro-agent', JSON.stringify(verifiedAgent));
      localStorage.removeItem('nivaaro-user');
      if (isPhoneVerified) {
        showToast(`Professional account created! Welcome, ${verifiedAgent.name} (ID: ${verifiedAgent.partnerId}).`, 2500, 'success');
      } else {
        showToast(`Professional account created! Note: Mobile number is not verified yet.`, 3000, 'info');
      }

      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedAgent));
        // HISTORY RULE: Leave login view with replace so Back does not return to login form
        window.location.replace(`http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`);
      }, 800);
    } catch (e) {
      setIsSubmitting(false);
      console.error('Professional registration error:', e);
      showToast('Network error connecting to authentication server.', 4500, 'error');
    }
  };

  // Google OAuth Handlers
  const handleGoogleSuccess = (googleUser) => {
    setIsGoogleModalOpen(false);
    const agentData = {
      ...googleUser,
      isLoggedIn: true
    };
    localStorage.setItem('nivaaro-agent', JSON.stringify(agentData));
    localStorage.removeItem('nivaaro-user');
    showToast(`Welcome, ${agentData.name}! Connecting with Google...`, 2500, 'success');
    setTimeout(() => {
      const payload = encodeURIComponent(JSON.stringify(agentData));
      // HISTORY RULE: Leave login view with replace so Back does not return to login form
      window.location.replace(`http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`);
    }, 800);
  };

  const handleGoogleButtonClick = async () => {
    const clientId = getStoredGoogleClientId();
    if (clientId) {
      await initiateDirectGoogleOAuth({
        role: 'agent',
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
                  <BrandLogo variant="horizontal" size={32} isPartner={true} />
                </div>
                <h2>Welcome back</h2>
                <p>Log in to book and track your home services.</p>
              </div>

              {/* Minimal Tab Switcher */}
              <div className="auth-mode-switch" style={{ marginBottom: '20px' }}>
                <button
                  type="button"
                  className={`mode-tab ${signInTab === 'agentId' ? 'active' : ''}`}
                  onClick={() => setSignInTab('agentId')}
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

              {/* Partner ID / Email Sign In */}
              {signInTab === 'agentId' && (
                <form onSubmit={handleSignInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="input-group">
                    <label htmlFor="signin-agent-id" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                      Email or Partner ID
                    </label>
                    <input
                      id="signin-agent-id"
                      type="text"
                      value={agentIdOrEmail}
                      onChange={(e) => setAgentIdOrEmail(e.target.value)}
                      placeholder="e.g. 202500001 or name@domain.com"
                      autoComplete="username"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <label htmlFor="signin-agent-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)' }}>
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
                        id="signin-agent-password"
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
                        <label htmlFor="signin-agent-phone" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
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
                            id="signin-agent-phone"
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
                <span>New professional?</span>{' '}
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
                    onClick={() => onSwitchPortal('customer')}
                    style={{ color: 'var(--brand-primary, #047857)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Join as a customer
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= CREATE ACCOUNT (PROFESSIONAL SIGN UP) PANEL ================= */}
        {mode === 'signup' && (
          <div className="form-panel sign-up-panel">
            <div className="form-wrapper">
              
              {/* Form Header */}
              <div className="form-header">
                <div style={{ display: 'inline-flex', marginBottom: '16px' }}>
                  <BrandLogo variant="horizontal" size={32} isPartner={true} />
                </div>
                <h1>Create your account</h1>
                <p>Join NivaaroFix and start receiving jobs near you.</p>
              </div>

              {/* Form with Equal 20px Vertical Rhythm */}
              <form onSubmit={handleSignUpSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Full name */}
                <div className="input-group">
                  <label htmlFor="agent-name" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Full name
                  </label>
                  <input
                    id="agent-name"
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
                    placeholder="e.g. Rajesh Kumar"
                    autoComplete="name"
                    autoFocus
                    required
                    aria-invalid={(touched.name || hasSubmitted) && !!fieldErrors.name}
                    aria-describedby={(touched.name || hasSubmitted) && fieldErrors.name ? 'agent-name-error' : undefined}
                  />
                  {(touched.name || hasSubmitted) && fieldErrors.name && (
                    <span id="agent-name-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

                {/* 2. Email address */}
                <div className="input-group">
                  <label htmlFor="agent-email" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Email address
                  </label>
                  <input
                    id="agent-email"
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
                    placeholder="e.g. rajesh@servicepro.in"
                    autoComplete="email"
                    required
                    aria-invalid={(touched.email || hasSubmitted) && (!!fieldErrors.email || duplicateEmailError)}
                    aria-describedby={(touched.email || hasSubmitted) && (fieldErrors.email || duplicateEmailError) ? 'agent-email-error' : undefined}
                  />
                  {(touched.email || hasSubmitted) && fieldErrors.email && (
                    <span id="agent-email-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.email}
                    </span>
                  )}
                  {duplicateEmailError && (
                    <span id="agent-email-duplicate" role="alert" aria-live="polite" className="field-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px', color: '#dc2626' }}>
                      <span>An account with this email already exists.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAgentIdOrEmail(email);
                          setMode('signin');
                          setSignInTab('agentId');
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
                        Sign in with this email →
                      </button>
                    </span>
                  )}
                </div>

                {/* 3. Mobile number (+91 prefix, 10 digits) */}
                <div className="input-group">
                  <label htmlFor="agent-phone" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
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
                      id="agent-phone"
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
                      aria-describedby={(touched.phone || hasSubmitted) && (fieldErrors.phone || duplicatePhoneError) ? 'agent-phone-error' : undefined}
                    />
                  </div>
                  {(touched.phone || hasSubmitted) && fieldErrors.phone && (
                    <span id="agent-phone-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.phone}
                    </span>
                  )}
                  {duplicatePhoneError && (
                    <span id="agent-phone-duplicate" role="alert" aria-live="polite" className="field-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px', color: '#dc2626' }}>
                      <span>An account with this mobile number already exists.</span>
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
                        Sign in with this mobile →
                      </button>
                    </span>
                  )}
                </div>

                {/* 4. Trade specialization - Two options, one choice radio group */}
                <div className="input-group" style={{ marginBottom: '20px' }}>
                  <label id="agent-trade-label" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '8px', display: 'block', textAlign: 'left' }}>
                    Choose your trade
                  </label>
                  <div
                    role="radiogroup"
                    aria-labelledby="agent-trade-label"
                    ref={tradeInputRef}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = trade === 'electrician' ? 'plumber' : 'electrician';
                        setTrade(next);
                        setFieldErrors((prev) => ({ ...prev, trade: null }));
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevTrade = trade === 'plumber' ? 'electrician' : 'plumber';
                        setTrade(prevTrade);
                        setFieldErrors((prev) => ({ ...prev, trade: null }));
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '12px'
                    }}
                  >
                    {/* Electrician Card */}
                    <div
                      role="radio"
                      aria-checked={trade === 'electrician'}
                      tabIndex={trade === 'electrician' || !trade ? 0 : -1}
                      onClick={() => {
                        setTrade('electrician');
                        setFieldErrors((prev) => ({ ...prev, trade: null }));
                      }}
                      className={`trade-radio-card ${trade === 'electrician' ? 'selected' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: trade === 'electrician' ? '2px solid #0d824d' : '1px solid var(--border-neutral, rgba(0,0,0,0.12))',
                        background: trade === 'electrician' ? 'rgba(13, 130, 77, 0.05)' : 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        userSelect: 'none',
                        textAlign: 'center'
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: trade === 'electrician' ? 600 : 500, color: 'var(--text-primary, #111827)' }}>
                        Electrician
                      </span>
                    </div>

                    {/* Plumber Card */}
                    <div
                      role="radio"
                      aria-checked={trade === 'plumber'}
                      tabIndex={trade === 'plumber' ? 0 : -1}
                      onClick={() => {
                        setTrade('plumber');
                        setFieldErrors((prev) => ({ ...prev, trade: null }));
                      }}
                      className={`trade-radio-card ${trade === 'plumber' ? 'selected' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: trade === 'plumber' ? '2px solid #0d824d' : '1px solid var(--border-neutral, rgba(0,0,0,0.12))',
                        background: trade === 'plumber' ? 'rgba(13, 130, 77, 0.05)' : 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        userSelect: 'none',
                        textAlign: 'center'
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: trade === 'plumber' ? 600 : 500, color: 'var(--text-primary, #111827)' }}>
                        Plumber
                      </span>
                    </div>
                  </div>
                  {(touched.trade || hasSubmitted) && fieldErrors.trade && (
                    <span id="agent-trade-error" role="alert" aria-live="polite" className="field-error-msg" style={{ display: 'block', marginTop: '6px' }}>
                      {fieldErrors.trade}
                    </span>
                  )}
                </div>

                {/* 5. Experience (Fresher, 1 year, 2 years, ... stepper) */}
                <div className="input-group">
                  <label htmlFor="agent-experience" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', display: 'block', textAlign: 'left', marginBottom: '6px' }}>
                    Experience
                  </label>
                  <ExperienceStepper
                    id="agent-experience"
                    value={experienceYears}
                    onChange={(val) => {
                      setExperienceYears(val);
                      if (touched.experienceYears || hasSubmitted) {
                        setFieldErrors((prev) => ({ ...prev, experienceYears: null }));
                      }
                    }}
                  />
                  {(touched.experienceYears || hasSubmitted) && fieldErrors.experienceYears && (
                    <span id="agent-experience-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.experienceYears}
                    </span>
                  )}
                </div>

                {/* 6. Password */}
                <div className="input-group">
                  <label htmlFor="agent-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Password
                  </label>
                  <div className="password-wrapper" style={{ position: 'relative' }}>
                    <input
                      id="agent-password"
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
                      aria-describedby={(touched.password || hasSubmitted) && fieldErrors.password ? 'agent-password-error' : undefined}
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
                    <span id="agent-password-error" role="alert" aria-live="polite" className="field-error-msg">
                      {fieldErrors.password}
                    </span>
                  )}
                </div>

                {/* 7. Confirm password */}
                <div className="input-group">
                  <label htmlFor="agent-confirm-password" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary, #111827)', marginBottom: '6px', display: 'block', textAlign: 'left' }}>
                    Confirm password
                  </label>
                  <div className="password-wrapper" style={{ position: 'relative' }}>
                    <input
                      id="agent-confirm-password"
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
                      aria-describedby={(touched.confirmPassword || hasSubmitted) && fieldErrors.confirmPassword ? 'agent-confirm-password-error' : undefined}
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
                    <span id="agent-confirm-password-error" role="alert" aria-live="polite" className="field-error-msg">
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
                      <span>Registering...</span>
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
                    onClick={() => onSwitchPortal('customer')}
                    style={{
                      color: 'var(--brand-primary, #047857)',
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Join as a customer
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
        role="agent"
        onSuccess={handleGoogleSuccess}
      />

      {/* Account Not Found Modal */}
      <AccountNotFoundModal
        isOpen={isNotFoundModalOpen}
        role="agent"
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
