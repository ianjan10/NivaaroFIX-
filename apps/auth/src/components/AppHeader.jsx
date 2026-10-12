import React from 'react';
import BrandLogo from './BrandLogo';
import { useLanguage } from '../context/LanguageContext';

export default function AppHeader({ currentPortal }) {
  const { activeLanguageObj, setIsLangModalOpen, activeLanguage } = useLanguage();

  const handleReturnToDashboard = () => {
    try {
      if (currentPortal === 'agent') {
        const savedAgent = localStorage.getItem('nivaaro-agent');
        if (savedAgent) {
          const payload = encodeURIComponent(savedAgent);
          window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}&view=home#home`;
          return;
        }
      } else {
        const savedUser = localStorage.getItem('nivaaro-user');
        if (savedUser) {
          const payload = encodeURIComponent(savedUser);
          window.location.href = `http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}&view=home#home`;
          return;
        }
      }
    } catch (e) {
      console.error('Session preservation error', e);
    }
    window.location.href = `http://localhost:5173?lang=${activeLanguage || 'en'}&view=home#home`;
  };

  return (
    <header className="auth-header-bar" role="banner">
      <div className="auth-header-inner">
        <div className="auth-header-left">
          <button
            type="button"
            className="brand-logo-btn"
            onClick={handleReturnToDashboard}
            title="Return to NivaaroFix Home"
            aria-label="Return to NivaaroFix Home"
          >
            <BrandLogo size="medium" isPartner={currentPortal === 'agent'} />
          </button>
        </div>

        <div className="auth-header-right">
          {/* Subtle Compact Language Switcher Trigger */}
          <button
            type="button"
            className="auth-lang-trigger-btn notranslate ignore"
            onClick={() => setIsLangModalOpen(true)}
            title="Select language / भाषा चुनें"
            aria-label="Select language"
            data-no-translate="true"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="notranslate ignore" data-no-translate="true">{(activeLanguage || 'en').toUpperCase()}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
