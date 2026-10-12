import React, { createContext, useContext, useState, useEffect } from 'react';
import { supportedLanguages, translations } from '../data/languageData';
import universalTranslator from '../services/universalTranslator';

export { supportedLanguages, translations };

const defaultLanguageContext = {
  activeLanguage: 'en',
  lang: 'en',
  activeLanguageObj: supportedLanguages[0],
  supportedLanguages,
  isLangModalOpen: false,
  setIsLangModalOpen: () => {},
  selectLanguage: () => {},
  t: translations['en'] || {},
  getLocalizedService: (rawService) => rawService
};

const LanguageContext = createContext(defaultLanguageContext);

export function LanguageProvider({ children }) {
  const [activeLanguage, setActiveLanguage] = useState(() => {
    try {
      // 1. Check URL query parameter first: ?lang=hi
      const params = new URLSearchParams(window.location.search);
      const urlLang = params.get('lang');
      if (urlLang && translations[urlLang]) {
        return urlLang;
      }
      // 2. Check localStorage
      const savedLang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-lang');
      if (savedLang && translations[savedLang]) {
        return savedLang;
      }
      return 'en';
    } catch {
      return 'en';
    }
  });

  const [isLangModalOpen, setIsLangModalOpen] = useState(false);

  // Sync to universal DOM translator, localStorage, document lang, and URL params
  useEffect(() => {
    try {
      localStorage.setItem('nivaarofix-lang', activeLanguage);
      localStorage.setItem('nivaaro-lang', activeLanguage);
      document.documentElement.lang = activeLanguage;

      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('lang') !== activeLanguage) {
        currentUrl.searchParams.set('lang', activeLanguage);
        window.history.replaceState({}, '', currentUrl.toString());
      }

      // Trigger world-class universal DOM translation engine across all elements & text
      universalTranslator.setLanguage(activeLanguage);
    } catch (e) {
      console.warn('Language sync error:', e);
    }
  }, [activeLanguage]);

  // Synchronize across tabs/windows in real time
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'nivaarofix-lang' && e.newValue && translations[e.newValue]) {
        setActiveLanguage(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const selectLanguage = (code) => {
    if (translations[code]) {
      setActiveLanguage(code);
      try {
        localStorage.setItem('nivaarofix-lang', code);
        localStorage.setItem('nivaaro-lang', code);
        document.documentElement.lang = code;
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('lang', code);
        window.history.replaceState({}, '', currentUrl.toString());
        universalTranslator.setLanguage(code);
      } catch (e) {
        console.warn('LocalStorage write error:', e);
      }
    }
    setIsLangModalOpen(false);
  };

  const t = translations[activeLanguage] || translations['en'] || {};
  const activeLanguageObj = supportedLanguages.find((l) => l.code === activeLanguage) || supportedLanguages[0];

  const getLocalizedService = (rawService) => {
    if (!rawService) return rawService;
    return rawService;
  };

  const value = {
    activeLanguage,
    lang: activeLanguage, // Alias for backwards compatibility
    activeLanguageObj,
    supportedLanguages,
    isLangModalOpen,
    setIsLangModalOpen,
    selectLanguage,
    t,
    getLocalizedService
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  return context || defaultLanguageContext;
}
