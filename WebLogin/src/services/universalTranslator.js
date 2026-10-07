/**
 * Universal End-to-End DOM Translation Engine for NivaaroFix WebLogin
 * Inspired by GitHub's world-class translation architectures (xnx3/translate, i18next).
 */

import { translations } from '../data/languageData.js';

const runtimeCache = new Map();
const pendingRequests = new Map();
const dictionary = {};
const exactDictionary = {};

function initDictionary() {
  const enTranslations = translations.en || {};

  for (const [lang, langMap] of Object.entries(translations)) {
    if (lang === 'en') continue;
    dictionary[lang] = new Map();
    exactDictionary[lang] = new Map();

    for (const [key, enVal] of Object.entries(enTranslations)) {
      const targetVal = langMap[key];
      if (enVal && targetVal && typeof enVal === 'string' && typeof targetVal === 'string') {
        const cleanEn = enVal.trim();
        const normalized = cleanEn.toLowerCase().replace(/\s+/g, ' ');
        dictionary[lang].set(normalized, targetVal.trim());
        exactDictionary[lang].set(cleanEn, targetVal.trim());
      }
    }
  }
}

initDictionary();

function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
}

async function fetchDeepTranslation(text, targetLang) {
  const cacheKey = `${targetLang}:${text}`;
  if (runtimeCache.has(cacheKey)) {
    return runtimeCache.get(cacheKey);
  }

  const storageKey = `nivaarofix_t_${targetLang}_${hashStr(text)}`;
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      runtimeCache.set(cacheKey, cached);
      return cached;
    }
  } catch (e) {}

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data[0]) {
        const translated = data[0].map((item) => item[0]).join('');
        runtimeCache.set(cacheKey, translated);
        try {
          localStorage.setItem(storageKey, translated);
        } catch (e) {}
        return translated;
      }
    } catch (err) {}
    return text;
  })();

  pendingRequests.set(cacheKey, promise);
  const result = await promise;
  pendingRequests.delete(cacheKey);
  return result;
}

function translateStringSync(text, targetLang) {
  if (!text || targetLang === 'en' || !dictionary[targetLang]) return text;

  const trimmed = text.trim();
  if (!trimmed || /^[\d\s.,:;!?()[\]{}/*#@&%$₹+\-_=<>|\\/'"`]+$/.test(trimmed)) {
    return text;
  }

  if (exactDictionary[targetLang]?.has(trimmed)) {
    const translated = exactDictionary[targetLang].get(trimmed);
    return text.replace(trimmed, translated);
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (dictionary[targetLang]?.has(normalized)) {
    const translated = dictionary[targetLang].get(normalized);
    return text.replace(trimmed, translated);
  }

  const cacheKey = `${targetLang}:${trimmed}`;
  if (runtimeCache.has(cacheKey)) {
    return text.replace(trimmed, runtimeCache.get(cacheKey));
  }

  return null;
}

class UniversalDOMTranslator {
  constructor() {
    this.currentLang = 'en';
    this.observer = null;
    this.isTranslating = false;
    this.initObserver();
  }

  initObserver() {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;

    this.observer = new MutationObserver((mutations) => {
      if (this.isTranslating || this.currentLang === 'en') return;

      let hasNodesToTranslate = false;
      const nodesToTranslate = [];

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (this.shouldIgnoreNode(node)) continue;
            hasNodesToTranslate = true;
            nodesToTranslate.push(node);
          }
        } else if (mutation.type === 'characterData') {
          const target = mutation.target;
          if (target && !this.shouldIgnoreNode(target.parentNode)) {
            if (target.__nivaaro_lastTranslated !== target.nodeValue) {
              hasNodesToTranslate = true;
              nodesToTranslate.push(target);
            }
          }
        }
      }

      if (hasNodesToTranslate) {
        this.isTranslating = true;
        try {
          for (const node of nodesToTranslate) {
            this.walkAndTranslate(node, this.currentLang);
          }
        } finally {
          this.isTranslating = false;
        }
      }
    });
  }

  shouldIgnoreNode(node) {
    if (!node) return true;
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'code' || tag === 'pre' || tag === 'noscript') {
      return true;
    }
    if (node.classList && (node.classList.contains('notranslate') || node.classList.contains('ignore'))) {
      return true;
    }
    if (node.hasAttribute && (node.hasAttribute('data-no-translate') || node.getAttribute('translate') === 'no')) {
      return true;
    }
    return false;
  }

  walkAndTranslate(rootNode, lang) {
    if (!rootNode || this.shouldIgnoreNode(rootNode)) return;

    if (rootNode.nodeType === Node.TEXT_NODE) {
      this.translateTextNode(rootNode, lang);
      return;
    }

    if (rootNode.nodeType === Node.ELEMENT_NODE) {
      this.translateElementAttributes(rootNode, lang);
      let child = rootNode.firstChild;
      while (child) {
        this.walkAndTranslate(child, lang);
        child = child.nextSibling;
      }
    }
  }

  translateTextNode(node, lang) {
    if (!node || !node.nodeValue) return;

    if (node.__nivaaro_orig === undefined) {
      node.__nivaaro_orig = node.nodeValue;
    }

    const origText = node.__nivaaro_orig;
    if (!origText || !origText.trim()) return;

    if (lang === 'en') {
      if (node.nodeValue !== origText) {
        node.nodeValue = origText;
      }
      node.__nivaaro_lastTranslated = origText;
      return;
    }

    const syncTranslated = translateStringSync(origText, lang);
    if (syncTranslated !== null) {
      node.nodeValue = syncTranslated;
      node.__nivaaro_lastTranslated = syncTranslated;
      return;
    }

    const trimmed = origText.trim();
    if (trimmed.length > 1) {
      fetchDeepTranslation(trimmed, lang).then((asyncTranslated) => {
        if (asyncTranslated && this.currentLang === lang && node.__nivaaro_orig === origText) {
          const finalVal = origText.replace(trimmed, asyncTranslated);
          this.isTranslating = true;
          try {
            node.nodeValue = finalVal;
            node.__nivaaro_lastTranslated = finalVal;
          } finally {
            this.isTranslating = false;
          }
        }
      });
    }
  }

  translateElementAttributes(el, lang) {
    if (!el || !el.getAttribute) return;

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const placeholder = el.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) {
        if (el.dataset.origPlaceholder === undefined) {
          el.dataset.origPlaceholder = placeholder;
        }
        const orig = el.dataset.origPlaceholder;
        if (lang === 'en') {
          el.setAttribute('placeholder', orig);
        } else {
          const trans = translateStringSync(orig, lang);
          if (trans) {
            el.setAttribute('placeholder', trans);
          } else {
            fetchDeepTranslation(orig, lang).then((asyncTrans) => {
              if (this.currentLang === lang) el.setAttribute('placeholder', asyncTrans);
            });
          }
        }
      }
    }

    const title = el.getAttribute('title');
    if (title && title.trim()) {
      if (el.dataset.origTitle === undefined) {
        el.dataset.origTitle = title;
      }
      const orig = el.dataset.origTitle;
      if (lang === 'en') {
        el.setAttribute('title', orig);
      } else {
        const trans = translateStringSync(orig, lang);
        if (trans) el.setAttribute('title', trans);
      }
    }
  }

  setLanguage(langCode) {
    if (!langCode) return;
    this.currentLang = langCode;

    if (typeof document === 'undefined') return;

    document.documentElement.lang = langCode;
    if (langCode === 'ur') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }

    this.isTranslating = true;
    try {
      if (document.body) {
        this.walkAndTranslate(document.body, langCode);
      }
    } finally {
      this.isTranslating = false;
    }

    if (this.observer && document.body) {
      this.observer.disconnect();
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }
}

const universalTranslator = new UniversalDOMTranslator();

export default universalTranslator;
export { universalTranslator, translateStringSync, fetchDeepTranslation };
