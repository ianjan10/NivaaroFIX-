import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function AppFooter() {
  const { t } = useLanguage();

  return (
    <footer className="auth-floating-footer" role="contentinfo">
      <div className="footer-legal-links">
        <a href="#privacy" className="footer-legal-link" onClick={(e) => e.preventDefault()}>
          {t.privacyPolicy || 'Privacy Policy'}
        </a>
        <span className="footer-sep-dot" aria-hidden="true">•</span>
        <a href="#terms" className="footer-legal-link" onClick={(e) => e.preventDefault()}>
          {t.termsOfService || 'Terms of Service'}
        </a>
        <span className="footer-sep-dot" aria-hidden="true">•</span>
        <a href="#support" className="footer-legal-link" onClick={(e) => e.preventDefault()}>
          {t.warrantyTerms || '30-Day Warranty Terms'}
        </a>
      </div>
      <p className="footer-copyright-text">
        {t.footerCopyright || `© ${new Date().getFullYear()} NivaaroFix Technologies Private Limited. All rights reserved.`}
      </p>
    </footer>
  );
}

