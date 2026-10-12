import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageSelectionModal() {
  const { supportedLanguages, activeLanguage, selectLanguage, isLangModalOpen, setIsLangModalOpen, t } = useLanguage();

  if (!isLangModalOpen) return null;

  return (
    <div className="uber-lang-modal-backdrop open" onClick={() => setIsLangModalOpen(false)}>
      <div
        className="uber-lang-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Language Selector"
      >
        <div className="uber-lang-modal-header">
          <div className="uber-lang-modal-title">
            {t.langModalTitle || 'Select your preferred language'}
          </div>
          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={() => setIsLangModalOpen(false)}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="uber-lang-grid notranslate ignore" data-no-translate="true">
          {supportedLanguages.map((lang) => {
            const isSelected = activeLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                className={`uber-lang-item notranslate ignore ${isSelected ? 'active' : ''}`}
                onClick={() => selectLanguage(lang.code)}
                data-no-translate="true"
              >
                <div className="uber-lang-names">
                  <span className="uber-lang-native">{lang.nativeName}</span>
                  <span className="uber-lang-english">{lang.name}</span>
                </div>

                {isSelected && (
                  <div className="uber-lang-checkmark">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
