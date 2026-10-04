import { useLanguage } from '../context/LanguageContext';
import React, { useState, useRef } from 'react';
import { useToastNotification } from '../context/ToastNotificationContext';
import { useFormAutoScroll } from '../hooks/useFormAutoScroll';
import IndianPhoneInput from '../components/IndianPhoneInput';
import DateOfBirthSelector from '../components/DateOfBirthSelector';
import { PasswordStrengthMeter, ConfirmPasswordMatch, evaluatePasswordStrength } from '../components/PasswordStrengthValidator';

export default function CustomerForgotPasswordPage({ isAgent = false, onBackToSignIn }) {
  const { t } = useLanguage();
  const { showToast } = useToastNotification();
  const { smoothScrollTo } = useFormAutoScroll();

  const [step, setStep] = useState(1); // 1: Identity, 2: OTP, 3: New Password

  // Step 1: Form
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [phone, setPhone] = useState('');

  // Step 2: OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const otpRefs = useRef([]);

  // Step 3: New Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Auto-scroll refs
  const dobRef = useRef(null);
  const phoneRef = useRef(null);
  const step1SubmitRef = useRef(null);
  const newPwRef = useRef(null);
  const confirmPwRef = useRef(null);
  const step3SubmitRef = useRef(null);

  const hasShownWeakRef = useRef(false);
  const hasShownGoodRef = useRef(false);

  // Step 1 Submit
  const handleStep1Submit = (e) => {
    e.preventDefault();
    if (!email || !dob.day || !dob.month || !dob.year || !phone) return;

    if (phone.length !== 10) {
      showToast('Please enter a valid 10-digit Indian mobile number (+91).', 5000, 'error');
      smoothScrollTo(phoneRef);
      return;
    }

    showToast('Verification code dispatched to your registered mobile number.', 4000, 'info');
    setStep(2);
    setTimer(30);
    setCanResend(false);

    // Timer countdown
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Step 2: OTP Change
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5 && otpRefs.current[index + 1]) {
      otpRefs.current[index + 1].focus();
    }
  };

  const handleStep2Submit = (e) => {
    e.preventDefault();
    if (otp.join('').length !== 6) return;
    showToast('Code verified successfully! Set your new password.', 3000, 'success');
    setStep(3);
  };

  // Step 3: Password Focus & Confirm Check
  const handleNewPwFocus = () => {
    if (newPassword) {
      const { level } = evaluatePasswordStrength(newPassword);
      if (level === 'weak' && !hasShownWeakRef.current) {
        hasShownWeakRef.current = true;
        showToast('Password is weak. Make it strong.', 4500, 'error');
      }
    }
  };

  const handleConfirmPwFocus = (e) => {
    if (!newPassword.trim()) {
      e.target.blur();
      showToast('Please enter your new password first before confirming.', 5000, 'error');
      if (newPwRef.current) {
        newPwRef.current.focus();
        smoothScrollTo(newPwRef);
      }
    }
  };

  const handleConfirmPwKeyDown = (e) => {
    if (!newPassword.trim()) {
      e.preventDefault();
      e.target.blur();
      showToast('Please enter your new password first before confirming.', 5000, 'error');
      if (newPwRef.current) {
        newPwRef.current.focus();
        smoothScrollTo(newPwRef);
      }
    }
  };

  const handleConfirmPwChange = (e) => {
    if (!newPassword.trim()) {
      showToast('Please enter your new password first before confirming.', 5000, 'error');
      return;
    }
    const val = e.target.value;
    setConfirmPassword(val);

    if (newPassword && val === newPassword) {
      const { level } = evaluatePasswordStrength(newPassword);
      if (level === 'good' && !hasShownGoodRef.current) {
        hasShownGoodRef.current = true;
        showToast('Make password strong if you want more security.', 5500, 'info');
      }
      smoothScrollTo(step3SubmitRef);
    }
  };

  const handleStep3Submit = (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;

    const { level } = evaluatePasswordStrength(newPassword);
    if (level === 'weak') {
      showToast('Password is weak. Make it strong.', 4500, 'error');
      if (newPwRef.current) newPwRef.current.focus();
      return;
    }

    // STRICT PASSWORD MISMATCH GUARD
    if (newPassword !== confirmPassword) {
      if (confirmPwRef.current) {
        confirmPwRef.current.focus();
        smoothScrollTo(confirmPwRef);
      }
      return;
    }

    showToast('Password updated successfully! Redirecting to sign in...', 3500, 'success');
    setTimeout(() => {
      onBackToSignIn();
    }, 1200);
  };

  return (
    <div className="auth-card-container">
      <div className="auth-card">
        <div className="form-panel">
          <div className="form-wrapper">
            
            {/* ================= STEP 1: IDENTITY ================= */}
            {step === 1 && (
              <div>
                <div className="form-header">
                  <span className="form-eyebrow">Account Recovery</span>
                  <h2>{t.forgotTitle || "Let's get you back in"}</h2>
                  <p>
                    {isAgent
                      ? (t.forgotSub || "Verify your professional identity to reset your service account password.")
                      : (t.forgotSub || "Verify your identity using your registered details to reset your password.")}
                  </p>
                </div>

                <form onSubmit={handleStep1Submit}>
                  {/* Email address */}
                  <div className="input-group">
                    <label>{t.emailAddressLabel || 'Email address'}</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@domain.com"
                      autoComplete="email"
                      required
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
                      onComplete={() => smoothScrollTo(phoneRef)}
                    />
                  </div>

                  {/* Registered Mobile Phone */}
                  <div className="input-group" ref={phoneRef}>
                    <label>{t.registeredPhoneLabel || t.phoneLabel || 'Registered Mobile Number'}</label>
                    <IndianPhoneInput
                      value={phone}
                      onChange={setPhone}
                      onComplete={() => smoothScrollTo(step1SubmitRef)}
                    />
                  </div>

                  <button
                    ref={step1SubmitRef}
                    type="submit"
                    className="btn-primary"
                  >
                    {t.btnSendOtp || 'Send Verification Code'}
                  </button>
                </form>
              </div>
            )}

            {/* ================= STEP 2: VERIFY OTP ================= */}
            {step === 2 && (
              <div>
                <div className="form-header">
                  <span className="form-eyebrow">Step 2 of 3</span>
                  <h2>Check your phone</h2>
                  <p>Enter the 6-digit code we just sent to your registered number.</p>
                </div>

                <p className="verify-dest-info">
                  Code sent to <strong>+91 {phone}</strong>
                </p>

                <form onSubmit={handleStep2Submit}>
                  <div className="otp-inputs-grid">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpRefs.current[i] = el)}
                        type="text"
                        className="otp-box"
                        maxLength={1}
                        inputMode="numeric"
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        required
                      />
                    ))}
                  </div>

                  <div className="otp-resend-row">
                    <span>
                      {canResend ? (
                        "Didn't receive the code?"
                      ) : (
                        <>Resend code in <strong>00:{timer < 10 ? `0${timer}` : timer}</strong></>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setTimer(30);
                        setCanResend(false);
                        showToast('New verification code sent to +91 ' + phone, 4000, 'info');
                      }}
                      disabled={!canResend}
                      style={{ opacity: canResend ? 1 : 0.4, cursor: canResend ? 'pointer' : 'not-allowed' }}
                    >
                      Resend OTP
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary btn-success-glow"
                    disabled={otp.join('').length < 6}
                  >
                    Verify & Proceed
                  </button>
                </form>
              </div>
            )}

            {/* ================= STEP 3: NEW PASSWORD ================= */}
            {step === 3 && (
              <div>
                <div className="form-header">
                  <span className="form-eyebrow">Step 3 of 3</span>
                  <h2>Choose a new password</h2>
                  <p>Make it strong — this is what keeps your account yours.</p>
                </div>

                <form onSubmit={handleStep3Submit}>
                  {/* New Password */}
                  <div className="input-group">
                    <label>{t.newPasswordLabel || 'New Password'}</label>
                    <div className="password-wrapper">
                      <input
                        ref={newPwRef}
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onFocus={handleNewPwFocus}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="btn-toggle-pw"
                        onClick={() => setShowNewPw(!showNewPw)}
                        tabIndex={-1}
                      >
                        {showNewPw ? (
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
                    <PasswordStrengthMeter password={newPassword} />
                  </div>

                  {/* Confirm Password */}
                  <div className="input-group">
                    <label>{t.confirmNewPasswordLabel || 'Confirm New Password'}</label>
                    <div className="password-wrapper">
                      <input
                        ref={confirmPwRef}
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={handleConfirmPwChange}
                        onFocus={handleConfirmPwFocus}
                        onKeyDown={handleConfirmPwKeyDown}
                        disabled={!newPassword.trim()}
                        placeholder={!newPassword.trim() ? "Enter new password above first" : "••••••••••••"}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="btn-toggle-pw"
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        disabled={!newPassword.trim()}
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
                    <ConfirmPasswordMatch password={newPassword} confirmPassword={confirmPassword} />
                  </div>

                  <button
                    ref={step3SubmitRef}
                    type="submit"
                    className="btn-primary"
                  >
                    {t.btnResetPassword || 'Update Password'}
                  </button>
                </form>
              </div>
            )}

            {/* Back to Sign In Link */}
            <div className="card-switch-footer">
              <span>Remembered your password?</span>
              <button
                type="button"
                className="btn-link"
                onClick={onBackToSignIn}
              >
                {t.backToSignIn || 'Back to Sign In'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
