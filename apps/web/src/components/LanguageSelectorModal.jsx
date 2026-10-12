import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageSelectorModal() {
  const { isLangModalOpen, setIsLangModalOpen, supportedLanguages, selectLanguage, activeLanguage, lang, t } = useLanguage();

  if (!isLangModalOpen) return null;

  const currentLang = activeLanguage || lang || 'en';

  return (
    <div className="uber-lang-modal-backdrop open" onClick={() => setIsLangModalOpen(false)}>
      <div
        className="uber-lang-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Language Selector"
      >
        {/* Header with Title and Close Button */}
        <div className="uber-lang-modal-header">
          <h2 className="uber-lang-modal-title">
            {t.langModalTitle || 'Select your preferred language'}
          </h2>

          <button
            type="button"
            className="uber-lang-close-btn"
            onClick={() => setIsLangModalOpen(false)}
            aria-label="Close language selector"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* 10-Language Grid */}
        <div className="uber-lang-grid notranslate ignore" data-no-translate="true">
          {supportedLanguages.map((item) => {
            const isSelected = item.code === currentLang;
            return (
              <button
                key={item.code}
                type="button"
                className={`uber-lang-item notranslate ignore ${isSelected ? 'active' : ''}`}
                onClick={() => selectLanguage(item.code)}
                data-no-translate="true"
              >
                <div className="uber-lang-names">
                  <span className="uber-lang-native">{item.nativeName}</span>
                  <span className="uber-lang-english">{item.name}</span>
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
