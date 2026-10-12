import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import GoogleOAuthModal from './GoogleOAuthModal';
import AccountNotFoundModal from './AccountNotFoundModal';
import { initiateDirectGoogleOAuth, getStoredGoogleClientId } from '../services/googleAuthService';

export default function UserAuthModal({ isOpen, onClose, user, onLogin, onLogout }) {
  const { activeBookings } = useBooking();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const { t, activeLanguage } = useLanguage();

  if (!isOpen) return null;

  const handleGoogleSuccess = (googleUser) => {
    setIsGoogleModalOpen(false);
    onLogin({
      ...googleUser,
      isLoggedIn: true
    });
    onClose();
  };

  const handleGoogleButtonClick = async () => {
    const clientId = getStoredGoogleClientId();
    if (clientId) {
      await initiateDirectGoogleOAuth({
        role: 'customer',
        onStart: () => setLoading(true),
        onSuccess: (authData) => {
          setLoading(false);
          handleGoogleSuccess(authData);
        },
        onError: (err) => {
          setLoading(false);
          if (err.code === 'NO_CLIENT_ID') {
            setIsGoogleModalOpen(true);
          } else {
            alert(err.message || 'Google OAuth failed');
          }
        }
      });
    } else {
      setIsGoogleModalOpen(true);
    }
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (phoneNumber.length < 10) return;
    setErrorMessage('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setOtpStep(true);
    }, 400);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/auth/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91 ${phoneNumber}` })
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok || !data.success) {
        if (data.code === 'USER_NOT_FOUND' || res.status === 404) {
          setIsNotFoundModalOpen(true);
          return;
        }
        setErrorMessage(data.message || 'Verification failed. Please check your credentials.');
        return;
      }

      // Verified Real User from Database
      onLogin({
        ...data.user,
        isLoggedIn: true
      });
      onClose();
      setOtpStep(false);
      setPhoneNumber('');
    } catch (err) {
      setLoading(false);
      setErrorMessage('Unable to connect to authentication server. Please try again.');
    }
  };

  const handleOpenWebLoginCustomer = () => {
    window.location.href = `http://localhost:5500?portal=customer&lang=${activeLanguage || 'en'}`;
  };

  return (
    <div className="uber-lang-modal-backdrop open" onClick={onClose}>
      <div
        className="user-auth-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="user-auth-header">
          <div>
            <h2 className="user-auth-title">
              {user?.isLoggedIn ? 'Account Profile' : 'Log in to NivaaroFix'}
            </h2>
            <p className="user-auth-subtitle">
              {user?.isLoggedIn
                ? 'Manage your active bookings, door OTPs, and saved addresses.'
                : 'Enter your registered mobile number for instant verification.'}
            </p>
          </div>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {user?.isLoggedIn ? (
          /* Logged In View */
          <div className="user-profile-body">
            <div className="profile-hero-card">
              {user.avatarUrl && !avatarError ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="profile-avatar"
                  style={{ objectFit: 'cover' }}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="profile-avatar">
                  {(user.name || 'U').trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="profile-name">{user.name}</h3>
                <p className="profile-phone">
                  {user.phone || user.email}
                  {user.city ? ` • ${user.city}` : ''}
                </p>
              </div>
            </div>

            <div className="profile-detail-box">
              <span className="detail-label">Service Address</span>
              {user.address ? (
                <p className="detail-value">{user.address}</p>
              ) : (
                <p className="detail-value" style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.86rem' }}>
                  Not added yet (provided when booking a service)
                </p>
              )}
            </div>

            {/* Direct Link to WebLogin Profile Page */}
            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                className="btn-open-weblogin-profile"
                onClick={() => {
                  onClose();
                  const userPayload = encodeURIComponent(JSON.stringify(user));
                  window.location.href = `http://localhost:5500?portal=customer&action=profile&lang=${activeLanguage || 'en'}&user=${userPayload}`;
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--bg-card-border)',
                  borderRadius: '9px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Edit Full Profile, DOB & Address in WebLogin</span>
                </div>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* Real Customer Bookings Section */}
            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="detail-label" style={{ display: 'block', marginBottom: '0.45rem' }}>Your Service Bookings</span>
              {activeBookings && activeBookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {activeBookings.map((b) => (
                    <div
                      key={b.bookingId || b.bookingRef}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--bg-card-border)',
                        borderRadius: '10px',
                        padding: '0.75rem 0.9rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                          {b.bookingId || b.bookingRef}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
                          ● {b.status || 'Request Received'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {b.serviceTitle}
                      </span>
                      {b.problemDescription && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                          "{b.problemDescription.slice(0, 70)}{b.problemDescription.length > 70 ? '...' : ''}"
                        </p>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {b.photos && b.photos.length > 0 ? (
                            <>
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              <span>{b.photos.length} photo{b.photos.length > 1 ? 's' : ''}</span>
                            </>
                          ) : (
                            <span>No photos</span>
                          )}
                        </span>
                        {b.otpCode && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>OTP: {b.otpCode}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: 'var(--bg-input)', border: '1px dashed var(--bg-card-border)', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.2rem 0' }}>No bookings yet.</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Your service requests will appear here.</p>
                </div>
              )}
            </div>

            <div className="profile-actions">
              <button
                type="button"
                className="btn-auth-logout"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
              >
                Sign Out / Logout
              </button>
              <button
                type="button"
                className="btn-auth-primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Login Form */
          <div>
            {errorMessage && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                lineHeight: 1.4
              }}>
                {errorMessage}
              </div>
            )}

            {!otpStep ? (
              <form onSubmit={handleSendOtp}>
                <label className="auth-input-label">Registered Mobile Number</label>
                <div className="auth-phone-input-group">
                  <span className="auth-country-code">🇮🇳 +91</span>
                  <input
                    type="tel"
                    className="auth-phone-field"
                    placeholder="Enter 10-digit number"
                    maxLength={10}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-auth-submit"
                  disabled={loading || phoneNumber.length < 10}
                >
                  {loading ? 'Sending OTP...' : 'Continue with OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <div className="otp-verification-banner">
                  <span>Enter 4-digit code sent to +91 {phoneNumber}</span>
                  <button
                    type="button"
                    className="btn-change-number"
                    onClick={() => { setOtpStep(false); setErrorMessage(''); }}
                  >
                    Edit
                  </button>
                </div>

                <input
                  type="text"
                  className="auth-otp-field"
                  placeholder="• • • •"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  autoFocus
                  required
                />

                <button
                  type="submit"
                  className="btn-auth-submit"
                  disabled={loading}
                >
                  {loading ? 'Verifying with Database...' : 'Verify & Log In'}
                </button>
              </form>
            )}

            {/* Google OAuth Button */}
            <div className="auth-divider" style={{ margin: '1.25rem 0 0.85rem' }}>
              <span>{t.labelOr || 'OR'}</span>
            </div>

            <button
              type="button"
              className="btn-google-oauth-dash"
              onClick={handleGoogleButtonClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: '#ffffff',
                border: '1px solid #dadce0',
                borderRadius: '10px',
                color: '#3c4043',
                fontSize: '0.92rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.borderColor = '#c2c7d0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#dadce0'; }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{t.btnContinueGoogle || 'Continue with Google'}</span>
            </button>

            {/* Direct WebLogin Portal Integration Link */}
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleOpenWebLoginCustomer}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <span>Don't have an account? Create Account / WebLogin</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Google OAuth Modal for Dashboard */}
        <GoogleOAuthModal
          isOpen={isGoogleModalOpen}
          onClose={() => setIsGoogleModalOpen(false)}
          onSuccess={(googleUser) => {
            setIsGoogleModalOpen(false);
            onLogin({
              ...googleUser,
              isLoggedIn: true
            });
            onClose();
          }}
        />

        {/* Fullscreen Opaque Account Not Found Modal with 10s auto-dismiss */}
        <AccountNotFoundModal
          isOpen={isNotFoundModalOpen}
          role="customer"
          identifier={`+91 ${phoneNumber}`}
          duration={10}
          onRedirectToSignUp={() => {
            setIsNotFoundModalOpen(false);
            onClose();
            window.location.href = `http://localhost:5500?portal=customer&action=signup&phone=${phoneNumber}&lang=${activeLanguage || 'en'}`;
          }}
          onClose={() => setIsNotFoundModalOpen(false)}
        />
      </div>
    </div>
  );
}
