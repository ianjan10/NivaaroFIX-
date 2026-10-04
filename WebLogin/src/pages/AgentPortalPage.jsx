import { useLanguage } from '../context/LanguageContext';
import React, { useState, useRef } from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';
import { useFormAutoScroll } from '../hooks/useFormAutoScroll';
import IndianPhoneInput from '../components/IndianPhoneInput';
import DateOfBirthSelector from '../components/DateOfBirthSelector';
import LocationCascadingSelect from '../components/LocationCascadingSelect';
import { PasswordStrengthMeter, ConfirmPasswordMatch, evaluatePasswordStrength } from '../components/PasswordStrengthValidator';
import PhoneOtpModal from '../components/PhoneOtpModal';
import GoogleOAuthModal from '../components/GoogleOAuthModal';
import AccountNotFoundModal from '../components/AccountNotFoundModal';
import { initiateDirectGoogleOAuth, getStoredGoogleClientId } from '../services/googleAuthService';

export default function AgentPortalPage({ onNavigateForgot, onSwitchPortal }) {
  const { t, activeLanguage } = useLanguage();
  const { showToast } = useToastNotification();
  const { smoothScrollTo } = useFormAutoScroll();

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState('signin');
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
  const [signInOtp, setSignInOtp] = useState(['', '', '', '', '', '']);

  // Partner Registration State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignUpPw, setShowSignUpPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // OTP Modal
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);

  // Refs for guided auto-scroll & focus
  const signInPwRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const dobRef = useRef(null);
  const stateRef = useRef(null);
  const signUpPwRef = useRef(null);
  const confirmPwRef = useRef(null);
  const signUpSubmitRef = useRef(null);

  // Strict warning refs
  const hasShownWeakRef = useRef(false);
  const hasShownGoodRef = useRef(false);

  // Email-before-password guard on Sign In
  const handleSignInPasswordFocus = (e) => {
    if (!agentIdOrEmail.trim()) {
      e.target.blur();
      showToast('Please enter your email address first.', 5000, 'error');
    }
  };

  const handleSignInPasswordKeyDown = (e) => {
    if (!agentIdOrEmail.trim()) {
      e.preventDefault();
      e.target.blur();
      showToast('Please enter your email address first.', 5000, 'error');
    }
  };

  // Email-before-password guard on Registration
  const handleSignUpPasswordFocus = (e) => {
    if (!email.trim()) {
      e.target.blur();
      showToast('Please enter your email address first.', 5000, 'error');
      return;
    }

    if (password) {
      const { level } = evaluatePasswordStrength(password);
      if (level === 'weak' && !hasShownWeakRef.current) {
        hasShownWeakRef.current = true;
        showToast('Password is weak. Make it strong.', 4500, 'error');
      }
    }
  };

  const handleSignUpPasswordKeyDown = (e) => {
    if (!email.trim()) {
      e.preventDefault();
      e.target.blur();
      showToast('Please enter your email address first.', 5000, 'error');
    }
  };

  // Confirm Password Check & Auto-Scroll
  const handleConfirmPasswordFocus = (e) => {
    if (!password.trim()) {
      e.target.blur();
      showToast('Please enter your password first before confirming.', 5000, 'error');
      if (signUpPwRef.current) {
        signUpPwRef.current.focus();
        smoothScrollTo(signUpPwRef);
      }
    }
  };

  const handleConfirmPasswordKeyDown = (e) => {
    if (!password.trim()) {
      e.preventDefault();
      e.target.blur();
      showToast('Please enter your password first before confirming.', 5000, 'error');
      if (signUpPwRef.current) {
        signUpPwRef.current.focus();
        smoothScrollTo(signUpPwRef);
      }
    }
  };

  const handleConfirmPasswordChange = (e) => {
    if (!password.trim()) {
      showToast('Please enter your password first before confirming.', 5000, 'error');
      return;
    }
    const val = e.target.value;
    setConfirmPassword(val);

    if (password && val === password) {
      const { level } = evaluatePasswordStrength(password);
      if (level === 'good' && !hasShownGoodRef.current) {
        hasShownGoodRef.current = true;
        showToast('Make password strong if you want more security.', 5500, 'info');
      }
      smoothScrollTo(signUpSubmitRef);
    }
  };

  // Complete Partner Registration and Persist in Database
  const completeAgentSignUpAndRedirect = async (agentName, agentEmail, agentPhone, isPhoneVerified = false) => {
    try {
      const cleanEmail = (agentEmail || '').toLowerCase().trim();
      const agentPayload = {
        name: (agentName || '').trim(),
        email: cleanEmail,
        phone: agentPhone || null,
        trade: 'electrician',
        experienceYears: 0,
        dob: dob || null,
        state: state || null,
        city: city || null,
        address: null,
        password,
        isPhoneVerified: Boolean(isPhoneVerified)
      };

      const res = await fetch('http://localhost:5000/api/auth/agent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentPayload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.message || 'Professional registration failed. Please check your details.', 4500, 'error');
        return;
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
        window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`;
      }, 800);
    } catch (e) {
      console.error('Partner registration error:', e);
      showToast('Network error connecting to authentication server.', 4500, 'error');
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

      // Successful verified authentication
      const verifiedAgent = { ...data.agent, isLoggedIn: true };
      localStorage.setItem('nivaaro-agent', JSON.stringify(verifiedAgent));
      localStorage.removeItem('nivaaro-user');
      showToast(`Welcome back, ${verifiedAgent.name}! Redirecting to Professional Console...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedAgent));
        window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`;
      }, 800);
    } catch (err) {
      console.error('Partner sign in error:', err);
      showToast('Network error connecting to authentication server.', 4500, 'error');
    }
  };

  // Sign In with Registered Phone OTP
  const handlePhoneOtpSignIn = async (e) => {
    e.preventDefault();
    if (signInPhone.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number.', 4000, 'error');
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91 ${signInPhone}` })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'AGENT_NOT_FOUND' || res.status === 404) {
          setNotFoundIdentifier(`+91 ${signInPhone}`);
          setIsNotFoundModalOpen(true);
          return;
        }

        showToast(data.message || 'Professional phone sign in failed.', 4000, 'error');
        return;
      }

      // Successful verified authentication
      const verifiedAgent = { ...data.agent, isLoggedIn: true };
      localStorage.setItem('nivaaro-agent', JSON.stringify(verifiedAgent));
      localStorage.removeItem('nivaaro-user');
      showToast(`Welcome back, ${verifiedAgent.name}! Redirecting to Professional Console...`, 2000, 'success');
      setTimeout(() => {
        const payload = encodeURIComponent(JSON.stringify(verifiedAgent));
        window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`;
      }, 800);
    } catch (err) {
      showToast('Network error connecting to authentication server.', 4500, 'error');
    }
  };

  // Partner Registration Submit with Strict Password Matching Lock
  const handleSignUpSubmit = (e) => {
    e.preventDefault();

    if (!name || !email || !phone || !dob.day || !dob.month || !dob.year || !state || !city || !password || !confirmPassword) {
      showToast('Please fill in all required registration fields.', 4000, 'error');
      return;
    }

    if (phone.length !== 10) {
      showToast('Please enter a valid 10-digit Indian mobile number (+91).', 5000, 'error');
      smoothScrollTo(phoneRef);
      return;
    }

    const { level } = evaluatePasswordStrength(password);
    if (level === 'weak') {
      showToast('Password is weak. Make it strong.', 4500, 'error');
      if (signUpPwRef.current) signUpPwRef.current.focus();
      return;
    }

    // STRICT PASSWORD MISMATCH GUARD
    if (password !== confirmPassword) {
      if (confirmPwRef.current) {
        confirmPwRef.current.focus();
        smoothScrollTo(confirmPwRef);
      }
      return;
    }

    setIsOtpModalOpen(true);
  };

  const handleOtpVerified = (enteredOtp) => {
    setIsOtpModalOpen(false);
    const isRealVerified = enteredOtp && enteredOtp !== 'SKIPPED';
    completeAgentSignUpAndRedirect(name, email, `+91 ${phone}`, isRealVerified);
  };

  const handleSkipOtpAndContinue = () => {
    setIsOtpModalOpen(false);
    completeAgentSignUpAndRedirect(name, email, `+91 ${phone}`, false);
  };

  const handleGoogleSuccess = (googleAgent) => {
    setIsGoogleModalOpen(false);
    const agentData = {
      ...googleAgent,
      isLoggedIn: true
    };
    localStorage.setItem('nivaaro-agent', JSON.stringify(agentData));
    localStorage.removeItem('nivaaro-user');
    showToast(`Professional verified! Welcome, ${agentData.name}. Redirecting to Console...`, 2500, 'success');
    setTimeout(() => {
      const payload = encodeURIComponent(JSON.stringify(agentData));
      window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}#partner`;
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
        
        {/* ================= AGENT SIGN IN PANEL ================= */}
        {mode === 'signin' && (
          <div className="form-panel sign-in-panel">
            <div className="form-wrapper">
              <div className="form-header">
                <span className="form-eyebrow">{t.partnerPortalEyebrow || 'Professional Portal'}</span>
                <h2>{t.partnerSignInHeading || 'Welcome back, Professional'}</h2>
                <p>{t.partnerSignInSubhead || 'Sign in to manage your jobs, schedule, and payouts.'}</p>
              </div>

              {/* Minimal Tab Switcher */}
              <div className="auth-mode-switch">
                <button
                  type="button"
                  className={`mode-tab ${signInTab === 'agentId' ? 'active' : ''}`}
                  onClick={() => setSignInTab('agentId')}
                >
                  {t.tabAgentIdEmail || 'Professional ID / Email'}
                </button>
                <button
                  type="button"
                  className={`mode-tab ${signInTab === 'phone' ? 'active' : ''}`}
                  onClick={() => setSignInTab('phone')}
                >
                  {t.tabPhoneOtp || 'Phone OTP'}
                </button>
              </div>

              {/* Agent ID Sign In */}
              {signInTab === 'agentId' && (
                <form onSubmit={handleSignInSubmit}>
                  <div className="input-group">
                    <label>{t.agentIdOrEmailLabel || 'Professional ID or Email address'}</label>
                    <input
                      type="text"
                      value={agentIdOrEmail}
                      onChange={(e) => setAgentIdOrEmail(e.target.value)}
                      placeholder={t.agentIdPlaceholder || 'e.g. PRO-8842 or professional@domain.com'}
                      autoComplete="username"
                      required
                    />
                  </div>

                  <div className="input-group">
                    <div className="label-row">
                      <label>{t.passwordLabel || 'Password'}</label>
                      <button
                        type="button"
                        className="forgot-link"
                        onClick={onNavigateForgot}
                      >
                        {t.forgotPassword || 'Forgot password?'}
                      </button>
                    </div>
                    <div className="password-wrapper">
                      <input
                        ref={signInPwRef}
                        type={showSignInPw ? 'text' : 'password'}
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        onFocus={handleSignInPasswordFocus}
                        onKeyDown={handleSignInPasswordKeyDown}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="btn-toggle-pw"
                        onClick={() => setShowSignInPw(!showSignInPw)}
                        tabIndex={-1}
                      >
                        {showSignInPw ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary">
                    {t.btnAgentSignIn || 'Professional Sign In'}
                  </button>
                </form>
              )}

              {/* Phone OTP Sign In */}
              {signInTab === 'phone' && (
                <div>
                  {signInOtpStep === 'phone' ? (
                    <form onSubmit={(e) => { e.preventDefault(); if (signInPhone.length === 10) setSignInOtpStep('verify'); }}>
                      <div className="input-group">
                        <label>{t.registeredPhoneLabel || t.phoneLabel || 'Registered Mobile Number'}</label>
                        <IndianPhoneInput
                          value={signInPhone}
                          onChange={setSignInPhone}
                          onComplete={() => setSignInOtpStep('verify')}
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={signInPhone.length !== 10}
                      >
                        {t.btnRequestOtp || 'Request OTP'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handlePhoneOtpSignIn}>
                      <div className="otp-header-info">
                        <span>OTP sent to <strong>+91 {signInPhone}</strong></span>
                        <button
                          type="button"
                          className="btn-change-number"
                          onClick={() => setSignInOtpStep('phone')}
                        >
                          Change
                        </button>
                      </div>
                      <div className="otp-inputs-grid">
                        {signInOtp.map((d, i) => (
                          <input
                            key={i}
                            type="text"
                            className="otp-box"
                            maxLength={1}
                            value={d}
                            onChange={(e) => {
                              const newOtp = [...signInOtp];
                              newOtp[i] = e.target.value.slice(-1);
                              setSignInOtp(newOtp);
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '12px' }}>
                        <button type="submit" className="btn-primary">
                          {t.btnSignIn || 'Verify & Sign In'}
                        </button>
                        <button
                          type="button"
                          className="btn-continue-unverified"
                          onClick={handlePhoneOtpSignIn}
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
                  )}
                </div>
              )}

              <div className="divider">
                <span>{t.labelOr || 'OR'}</span>
              </div>

              <button
                type="button"
                className="btn-google"
                onClick={handleGoogleButtonClick}
              >
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{t.btnContinueGoogle || 'Professional Google Sign In'}</span>
              </button>

              <div className="card-switch-footer">
                <span>{t.switchPartnerSignUp ? t.switchPartnerSignUp.split('?')[0] + '?' : 'Want to offer services?'}</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setMode('signup')}
                >
                  {t.switchPartnerSignUp ? t.switchPartnerSignUp.split('?')[1] || 'Join as Professional' : 'Join as Professional'}
                </button>
              </div>

              {onSwitchPortal && (
                <div className="card-switch-footer card-switch-role-footer">
                  <span>{t.switchCustomerSignIn ? t.switchCustomerSignIn.split('?')[0] + '?' : 'Looking to book a repair?'}</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => onSwitchPortal('customer')}
                  >
                    {t.switchCustomerSignIn ? t.switchCustomerSignIn.split('?')[1] || 'Switch to customer sign in' : 'Switch to customer sign in'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= PARTNER REGISTRATION PANEL ================= */}
        {mode === 'signup' && (
          <div className="form-panel sign-up-panel">
            <div className="form-wrapper">
              <div className="form-header">
                <span className="form-eyebrow">{t.agentSignUpTitle || 'Grow With Us'}</span>
                <h2>{t.agentSignUpTitle || 'Build your business with us'}</h2>
                <p>{t.agentSignUpSub || 'Register as a certified professional and start taking verified local jobs.'}</p>
              </div>

              <form onSubmit={handleSignUpSubmit}>
                {/* Full Name */}
                <div className="input-group">
                  <label>{t.fullNameLabel || 'Full Name / Business Name'}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name or business name"
                    autoComplete="name"
                    required
                  />
                </div>

                {/* Email address */}
                <div className="input-group">
                  <label>{t.emailAddressLabel || 'Email address'}</label>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="professional@domain.com"
                    autoComplete="email"
                    required
                  />
                </div>

                {/* Phone Number */}
                <div className="input-group" ref={phoneRef}>
                  <label>{t.phoneLabel || 'Mobile Number'}</label>
                  <IndianPhoneInput
                    value={phone}
                    onChange={setPhone}
                    onComplete={() => smoothScrollTo(dobRef)}
                  />
                </div>

                {/* Date of Birth (DOB) */}
                <div className="input-group" ref={dobRef}>
                  <label>{t.dobLabel || 'Date of Birth'}</label>
                  <DateOfBirthSelector
                    day={dob.day}
                    month={dob.month}
                    year={dob.year}
                    onChange={setDob}
                    onComplete={() => smoothScrollTo(stateRef)}
                  />
                </div>

                {/* Location: State & City */}
                <div ref={stateRef}>
                  <LocationCascadingSelect
                    state={state}
                    city={city}
                    onStateChange={setState}
                    onCityChange={setCity}
                    onComplete={() => smoothScrollTo(signUpPwRef)}
                  />
                </div>

                {/* Password */}
                <div className="input-group">
                  <label>{t.passwordLabel || 'Password'}</label>
                  <div className="password-wrapper">
                    <input
                      ref={signUpPwRef}
                      type={showSignUpPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={handleSignUpPasswordFocus}
                      onKeyDown={handleSignUpPasswordKeyDown}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="btn-toggle-pw"
                      onClick={() => setShowSignUpPw(!showSignUpPw)}
                      tabIndex={-1}
                    >
                      {showSignUpPw ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  <PasswordStrengthMeter password={password} />
                </div>

                {/* Confirm Password */}
                <div className="input-group">
                  <label>{t.confirmPasswordLabel || 'Confirm Password'}</label>
                  <div className="password-wrapper">
                    <input
                      ref={confirmPwRef}
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={handleConfirmPasswordChange}
                      onFocus={handleConfirmPasswordFocus}
                      onKeyDown={handleConfirmPasswordKeyDown}
                      disabled={!password.trim()}
                      placeholder={!password.trim() ? "Enter password above first" : "••••••••••••"}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="btn-toggle-pw"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      disabled={!password.trim()}
                      tabIndex={-1}
                    >
                      {showConfirmPw ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  <ConfirmPasswordMatch password={password} confirmPassword={confirmPassword} />
                </div>

                <button
                  ref={signUpSubmitRef}
                  type="submit"
                  className="btn-primary"
                >
                  Join as Professional
                </button>
              </form>

              <div className="card-switch-footer">
                <span>Already registered as a professional?</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setMode('signin')}
                >
                  Professional Sign In
                </button>
              </div>

              {onSwitchPortal && (
                <div className="card-switch-footer card-switch-role-footer">
                  <span>Looking to book a repair?</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => onSwitchPortal('customer')}
                  >
                    Switch to customer sign in
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Focused Phone OTP Verification Modal */}
      <PhoneOtpModal
        isOpen={isOtpModalOpen}
        phoneDigits={phone}
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

      {/* Fullscreen Opaque Partner Not Found Alert Modal (with 10s auto-dismiss) */}
      <AccountNotFoundModal
        isOpen={isNotFoundModalOpen}
        role="agent"
        identifier={notFoundIdentifier}
        duration={10}
        onRedirectToSignUp={() => {
          setIsNotFoundModalOpen(false);
          setMode('signup');
          if (notFoundIdentifier.includes('@')) {
            setEmail(notFoundIdentifier.trim());
          } else if (notFoundIdentifier.includes('+91')) {
            setPhone(notFoundIdentifier.replace('+91', '').trim());
          }
          setTimeout(() => {
            if (emailRef.current) {
              emailRef.current.focus();
              smoothScrollTo(emailRef);
            }
          }, 250);
        }}
        onNavigateForgot={onNavigateForgot}
        onClose={() => setIsNotFoundModalOpen(false)}
      />
    </div>
  );
}
