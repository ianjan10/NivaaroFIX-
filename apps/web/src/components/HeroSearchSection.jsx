import React, { useState, useEffect, useRef } from 'react';
import { allServicesList } from '../data/servicesCatalogData';
import { useBooking } from '../context/BookingContext';
import { useLanguage } from '../context/LanguageContext';

// Doorstep Technician Photography
const heroPhotoAssets = [
  {
    id: 1,
    src: '/project_image/5.png',
    title: 'Master Electrician: MCB & Electrical Diagnostics'
  },
  {
    id: 2,
    src: '/project_image/6.png',
    title: 'Master Plumber: Washbasin & Leak Waterproofing'
  },
  {
    id: 3,
    src: '/project_image/7.png',
    title: 'Certified Electrician: Fixture & Safety Fitting'
  },
  {
    id: 4,
    src: '/project_image/8.png',
    title: 'Master Plumber: Sanitation & Drainage Overhaul'
  }
];

const HERO_PHOTO_INTERVAL = 5000;
const ROTATING_WORD_INTERVAL = 3800;
const rotatingWords = ['confidence', 'care', 'precision'];

export default function HeroSearchSection({ onNavigateToServices }) {
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  
  const searchInputRef = useRef(null);
  const searchFormRef = useRef(null);
  const { openBookingFor } = useBooking();
  const { getLocalizedService, t } = useLanguage();

  // 1. Subtle photo transition
  useEffect(() => {
    const photoTimer = setInterval(() => {
      setCurrentPhotoIdx((prev) => (prev + 1) % heroPhotoAssets.length);
    }, HERO_PHOTO_INTERVAL);
    return () => clearInterval(photoTimer);
  }, []);

  // 2. Subtle headline word transition (confidence, care, precision)
  useEffect(() => {
    const wordTimer = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % rotatingWords.length);
    }, ROTATING_WORD_INTERVAL);
    return () => clearInterval(wordTimer);
  }, []);

  // 3. Subtle scroll-driven parallax for background photograph
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY || 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 4. Close search suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target)) {
        setIsSearching(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuggestions = searchTerm.trim().length > 1
    ? allServicesList.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.shortDesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.commonIssues && s.commonIssues.some(iss => iss.name.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0, 5)
    : [];

  const handleSelectService = (service) => {
    setSearchTerm('');
    setIsSearching(false);
    openBookingFor(service);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (filteredSuggestions.length > 0) {
      handleSelectService(filteredSuggestions[0]);
    } else if (onNavigateToServices) {
      onNavigateToServices('all');
    }
  };

  const handlePopularSearchClick = (item) => {
    const matching = allServicesList.find(s =>
      s.title.toLowerCase().includes(item.query) ||
      s.shortDesc.toLowerCase().includes(item.query) ||
      (s.commonIssues && s.commonIssues.some(iss => iss.name.toLowerCase().includes(item.query)))
    );
    if (matching) {
      openBookingFor(matching);
    } else if (onNavigateToServices) {
      onNavigateToServices(item.category);
    }
  };

  const parallaxScale = Math.max(1.0, 1.03 - (scrollY * 0.00012));
  const parallaxTranslateY = Math.min(60, scrollY * 0.12);

  return (
    <section className="nivaaro-hero-section" aria-label="NivaaroFix Hero Section">
      {/* 1. Edge-to-Edge Hero Photographic Background */}
      <div className="hero-photo-stage" aria-hidden="true">
        {heroPhotoAssets.map((photo, idx) => {
          const isActive = idx === currentPhotoIdx;
          const isPrev = idx === (currentPhotoIdx - 1 + heroPhotoAssets.length) % heroPhotoAssets.length;
          return (
            <div
              key={photo.id}
              className={`hero-photo-layer ${isActive ? 'active' : isPrev ? 'prev' : ''}`}
              style={{
                transform: `scale(${parallaxScale}) translateY(${parallaxTranslateY}px)`
              }}
            >
              <img
                src={photo.src}
                alt={photo.title}
                className="hero-photo-img"
                loading={idx === 0 ? 'eager' : 'lazy'}
              />
            </div>
          );
        })}
        {/* Soft overlay for high photographic clarity and crisp text contrast */}
        <div className="hero-light-overlay" />
      </div>

      {/* 2. Hero Foreground Content */}
      <div className="max-w-container hero-container-inner">
        <div className="hero-content-wrap hero-settle-in">
          
          {/* Display Serif Headline */}
          <h1 className="hero-display-headline">
            Fixes, handled<br className="hero-break-desktop" /> with{' '}
            <span className="hero-rotating-word-wrap">
              <span key={currentWordIdx} className="hero-rotating-word">
                {rotatingWords[currentWordIdx]}
              </span>
            </span>.
          </h1>

          {/* Single Supporting Sentence */}
          <p className="hero-primary-supporting">
            Tell us what's wrong and find the right professional for the job.
          </p>

          {/* Service Finder Search Box */}
          <div style={{ width: '100%', maxWidth: '640px', margin: '1.5rem auto 0', textAlign: 'left' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#a9793c',
                marginBottom: '0.5rem'
              }}
            >
              WHAT NEEDS FIXING?
            </span>

            <form className="hero-search-form" onSubmit={handleSearchSubmit} ref={searchFormRef} style={{ margin: 0 }}>
              <div className="hero-search-shell">
                <div className="search-input-group">
                  <svg className="search-leading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  
                  <input
                    type="text"
                    ref={searchInputRef}
                    className="search-field-input"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsSearching(true);
                    }}
                    onFocus={() => {
                      setIsInputFocused(true);
                      setIsSearching(true);
                    }}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder={t.searchPlaceholder || "What's wrong at home?"}
                    aria-label={t.searchPlaceholder || "What's wrong at home?"}
                  />
                </div>

                <button
                  type="submit"
                  className="search-submit-cta"
                  id="hero-find-pro-btn"
                  aria-label={t.findAProBtn || 'Find a Pro'}
                >
                  <span>{t.findAProBtn || 'Find a Pro'}</span>
                  <span className="cta-arrow-hover" aria-hidden="true">→</span>
                </button>
              </div>

              {/* Live Autocomplete Suggestions Panel */}
              {isSearching && filteredSuggestions.length > 0 && (
                <div className="search-dropdown-menu" role="listbox">
                  <div className="dropdown-label-header">
                    Matching Services ({filteredSuggestions.length})
                  </div>
                  {filteredSuggestions.map((raw) => {
                    const s = getLocalizedService ? getLocalizedService(raw) : raw;
                    return (
                      <div
                        key={s.id}
                        className="dropdown-result-row"
                        onClick={() => handleSelectService(s)}
                        role="option"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectService(s);
                          }
                        }}
                      >
                        <div className="result-info">
                          <div className="result-title">{s.title}</div>
                          <div className="result-meta">
                            {(s.categoryId === 'electrician' || s.category === 'electrician') ? (t.proTradeElectrician || 'Electrician') : (t.proTradePlumber || 'Plumber')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </form>

            {/* Supported Popular Searches Row */}
            <div className="hero-popular-searches-row">
              <span className="popular-searches-label">
                {t.popularSearches || 'Popular searches'}
              </span>
              <div className="popular-searches-list">
                {[
                  { label: 'MCB trip', category: 'electrician', query: 'mcb' },
                  { label: 'Switchboard', category: 'electrician', query: 'switchboard' },
                  { label: 'Tap leak', category: 'plumber', query: 'tap' },
                  { label: 'Pipe leak', category: 'plumber', query: 'pipe' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="search-chip-link"
                    onClick={() => handlePopularSearchClick(item)}
                  >
                    <span>{item.label}</span>
                    <span className="chip-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
