import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function PortalSelectionPage({ onSelectPortal }) {
  const { t } = useLanguage();

  return (
    <div className="access-stage-wrapper">
      {/* Floating Heading Group Directly Over Background */}
      <div className="access-header-group">
        <span className="access-eyebrow">
          {t.selectAccessTitle || 'NIVAAROFIX ACCESS'}
        </span>
        <h1 className="access-display-heading">
          {t.selectLoginTitle || 'Log in to NivaaroFix'}
        </h1>
        <p className="access-subheadline">
          {t.selectLoginSub || 'Select your account type to continue'}
        </p>
      </div>

      {/* Primary Account Selection Cards */}
      <div className="access-cards-group" role="group" aria-label="Select Account Type">
        
        {/* Card 1: Login as User */}
        <button
          type="button"
          className="account-select-card account-card-user"
          onClick={() => onSelectPortal('customer')}
          aria-label="Login as User - Book & track repairs, electricians & plumbers"
        >
          <div className="account-icon-box user-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          <div className="account-text-group">
            <div className="account-title">
              {t.roleUserTitle || 'Login as User'}
            </div>
            <div className="account-desc">
              {t.roleUserDesc || 'Book & track repairs, electricians & plumbers'}
            </div>
          </div>

          <div className="account-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </button>

        {/* Card 2: Login as Professional */}
        <button
          type="button"
          className="account-select-card account-card-agent"
          onClick={() => onSelectPortal('agent')}
          aria-label="Login as Professional - Service jobs, professional ID, schedules & payouts"
        >
          <div className="account-icon-box agent-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#101820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>

          <div className="account-text-group">
            <div className="account-title">
              {t.roleAgentTitle || 'Login as Professional'}
            </div>
            <div className="account-desc">
              {t.roleAgentDesc || 'Service jobs, professional ID, schedules & payouts'}
            </div>
          </div>

          <div className="account-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </button>

      </div>

      {/* Refined Registration Message */}
      <div className="access-register-note">
        <p className="register-note-main">
          {t.needRegisterAccount || 'Need to register a new account?'}
        </p>
        <p className="register-note-sub">
          {t.chooseAccountAbove || 'Choose your account type above to create one.'}
        </p>
      </div>
    </div>
  );
}

