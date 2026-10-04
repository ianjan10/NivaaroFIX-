import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getStoredGoogleClientId, setStoredGoogleClientId, initiateDirectGoogleOAuth } from '../services/googleAuthService';

export default function GoogleOAuthModal({ isOpen, onClose, role = 'customer', onSuccess }) {
  const { t } = useLanguage();
  const [clientIdInput, setClientIdInput] = useState(() => getStoredGoogleClientId());
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleConnectWithGoogle = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const cleanClientId = clientIdInput.trim();
    if (!cleanClientId) {
      setErrorMessage('Please enter your Google OAuth Client ID to connect with your real Google account.');
      return;
    }

    setStoredGoogleClientId(cleanClientId);

    await initiateDirectGoogleOAuth({
      clientId: cleanClientId,
      role,
      onStart: () => {
        setIsConnecting(true);
      },
      onSuccess: (authData) => {
        setIsConnecting(false);
        onSuccess(authData);
      },
      onError: (err) => {
        setIsConnecting(false);
        setErrorMessage(err.message || 'Google OAuth failed. Please verify your Client ID and authorized origins in Google Cloud Console.');
      }
    });
  };

  return (
    <div className="uber-lang-modal-backdrop open" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="google-oauth-config-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          maxWidth: '480px',
          width: '92%',
          padding: '2.25rem 2rem',
          position: 'relative',
          animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'none',
            border: 'none',
            color: '#5f6368',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Google Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" style={{ marginBottom: '0.75rem' }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#202124', margin: '0 0 0.35rem 0' }}>
            {role === 'agent' ? 'Connect Partner Google Account' : 'Connect Customer Google Account'}
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#5f6368', margin: 0, lineHeight: 1.5 }}>
            Sign in with your official Google account to save your real name, email, and verified profile into the PostgreSQL database.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div style={{
            background: '#fce8e6',
            color: '#c5221f',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.84rem',
            lineHeight: 1.4,
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem'
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Real Google OAuth Connection Form */}
        <form onSubmit={handleConnectWithGoogle}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#3c4043', marginBottom: '0.4rem' }}>
              Google OAuth Client ID
            </label>
            <input
              type="text"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="e.g. 10829384756-xxxxxxxx.apps.googleusercontent.com"
              style={{
                width: '100%',
                padding: '0.75rem 0.9rem',
                fontSize: '0.88rem',
                border: '1.5px solid #dadce0',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'monospace'
              }}
              onFocus={(e) => e.target.style.borderColor = '#1a73e8'}
              onBlur={(e) => e.target.style.borderColor = '#dadce0'}
              required
            />
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#70757a', marginTop: '0.35rem' }}>
              From Google Cloud Console &rarr; APIs & Services &rarr; Credentials (Web Application)
            </span>
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            style={{
              width: '100%',
              padding: '0.85rem 1.25rem',
              background: '#1a73e8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isConnecting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { if (!isConnecting) e.currentTarget.style.background = '#1557b0'; }}
            onMouseLeave={(e) => { if (!isConnecting) e.currentTarget.style.background = '#1a73e8'; }}
          >
            {isConnecting ? (
              <>
                <div style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#ffffff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <span>Opening Google Sign-In Popup...</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Launch Real Google Sign-In Popup</span>
              </>
            )}
          </button>
        </form>

        {/* 3-Step Setup Guide */}
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #f1f3f4',
          fontSize: '0.78rem',
          color: '#5f6368',
          lineHeight: 1.5
        }}>
          <div style={{ fontWeight: 700, color: '#202124', marginBottom: '0.35rem' }}>
            Quick Setup (takes 1 minute):
          </div>
          <ol style={{ margin: '0 0 0 1.1rem', padding: 0 }}>
            <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: '#1a73e8', textDecoration: 'underline' }}>Google Cloud Console Credentials</a>.</li>
            <li>Create an <strong>OAuth 2.0 Client ID</strong> (Web Application type).</li>
            <li>Add Authorized JavaScript origins: <code>http://localhost:5500</code> and <code>http://localhost:5173</code>.</li>
            <li>Paste your Client ID above and click to connect your real Google account!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
