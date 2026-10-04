import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import {
  allServicesList,
  servicesSearchConfig,
  problemFirstLinks,
  servicesDirectory
} from '../data/servicesCatalogData';
import electricianImg from '../assets/images/electrician.jpg';
import plumberImg from '../assets/images/plumber.png';

export default function ServicesPage({ currentUser, currentAgent, onOpenAuth, onAgentBlocked }) {
  const { t } = useLanguage();
  const {
    openServiceDetail,
    initiateProtectedBooking
  } = useBooking();

  const [searchQuery, setSearchQuery] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showEmptyNotice, setShowEmptyNotice] = useState(false);
  const searchInputRef = useRef(null);
  const placeholderTimerRef = useRef(null);

  // Rotating placeholder
  useEffect(() => {
    if (isFocused || searchQuery.trim().length > 0) return;

    placeholderTimerRef.current = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % servicesSearchConfig.cyclingExamples.length);
    }, 3000);

    return () => {
      if (placeholderTimerRef.current) clearInterval(placeholderTimerRef.current);
    };
  }, [isFocused, searchQuery]);

  // Handle protected booking action (Triggers auth check)
  const handleBookService = (serviceSlug, issue = null) => {
    initiateProtectedBooking({
      service: serviceSlug,
      issue,
      currentUser,
      currentAgent,
      onOpenAuth,
      onAgentBlocked
    });
  };

  // Handle service exploration (No login required)
  const handleExploreService = (serviceSlug, issue = null) => {
    openServiceDetail(serviceSlug, issue);
  };

  // Focus search input on CTA
  const handleFocusSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Filter suggestions
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchedSuggestions = trimmedQuery.length > 0
    ? servicesSearchConfig.suggestions.filter((item) =>
        item.query.includes(trimmedQuery) ||
        item.label.toLowerCase().includes(trimmedQuery) ||
        item.category.toLowerCase().includes(trimmedQuery)
      )
    : [];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (matchedSuggestions.length > 0) {
      handleExploreService(matchedSuggestions[0].serviceSlug, matchedSuggestions[0].label);
      setShowEmptyNotice(false);
    } else if (trimmedQuery.includes('plumb') || trimmedQuery.includes('tap') || trimmedQuery.includes('pipe') || trimmedQuery.includes('leak') || trimmedQuery.includes('drain')) {
      handleExploreService('plumber');
      setShowEmptyNotice(false);
    } else if (trimmedQuery.includes('elect') || trimmedQuery.includes('mcb') || trimmedQuery.includes('switch') || trimmedQuery.includes('wire') || trimmedQuery.includes('fan')) {
      handleExploreService('electrician');
      setShowEmptyNotice(false);
    } else if (trimmedQuery.length > 0) {
      setShowEmptyNotice(true);
    }
  };

  const currentPlaceholder = servicesSearchConfig.cyclingExamples[placeholderIdx] || servicesSearchConfig.defaultPlaceholder;

  return (
    <div className="services-page-wrapper" role="main">
      <div className="max-w-container">
        
        {/* 1. Services Hero Introduction (Compact Editorial) */}
        <header className="services-hero-section">
          <div className="services-eyebrow">
            OUR SERVICES
          </div>

          <h1 className="services-hero-headline">
            Expert help for<br className="services-break-desktop" /> what matters at home.
          </h1>

          <p className="services-hero-lead">
            Describe what's wrong or explore a service to find the right way forward.
          </p>
        </header>

        {/* 2. Main Creative Interaction — Problem Search */}
        <section className="services-search-area" aria-label="Find service by problem">
          <div className="services-search-label">
            WHAT NEEDS FIXING?
          </div>

          <div className="services-search-container">
            <form onSubmit={handleSearchSubmit} className="services-search-form" role="search">
              <div className="services-search-input-box">
                <svg
                  className="services-search-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>

                <input
                  ref={searchInputRef}
                  type="text"
                  className="services-search-field"
                  placeholder={currentPlaceholder}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (showEmptyNotice) setShowEmptyNotice(false);
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  aria-label="Describe what needs fixing at home"
                  autoComplete="off"
                />

                <button
                  type="submit"
                  className="services-search-arrow-btn"
                  aria-label="Search service"
                >
                  →
                </button>
              </div>
            </form>

            {/* Suggestions Dropdown */}
            {isFocused && matchedSuggestions.length > 0 && (
              <div className="services-suggestions-dropdown" role="listbox">
                {matchedSuggestions.map((sug) => (
                  <button
                    key={`${sug.serviceSlug}-${sug.label}`}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      handleExploreService(sug.serviceSlug, sug.label);
                    }}
                    role="option"
                    aria-selected="false"
                  >
                    <div className="suggestion-meta">
                      <span className="suggestion-icon">{sug.icon}</span>
                      <span className="suggestion-cat">{sug.category}</span>
                      <span className="suggestion-dot">·</span>
                      <span className="suggestion-label">{sug.label}</span>
                    </div>
                    <span className="suggestion-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}

            {/* Unrecognized search empty fallback notice */}
            {showEmptyNotice && (
              <div className="services-search-empty-box">
                <p className="empty-box-msg">
                  {servicesSearchConfig.emptyState.message}
                </p>
                <button
                  type="button"
                  className="empty-box-btn"
                  onClick={() => handleExploreService('electrician')}
                >
                  {servicesSearchConfig.emptyState.actionText}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 3. Main Service Discovery — Alternating Editorial Catalogue */}
        <section className="services-editorial-section" aria-label="Available services">
          <div className="section-mini-eyebrow" style={{ marginBottom: '0.5rem' }}>SERVICES</div>
          <h2 className="services-editorial-subtitle">Choose where you'd like to start.</h2>

          <div className="services-editorial-list">
            
            {/* Row 1: Electrician (Left: Info, Right: Photo) */}
            <article className="services-editorial-row featured-electrician" aria-labelledby="service-title-electrician">
              <div className="editorial-row-info">
                <span className="editorial-row-category">ELECTRICAL SERVICES</span>
                <h3 id="service-title-electrician" className="editorial-row-title">Electrician</h3>
                <p className="editorial-row-desc">
                  Electrical faults, installations, diagnostics and everyday residential repairs.
                </p>
                <div className="editorial-row-issues">
                  <span>MCB & Fuse</span>
                  <span className="bullet">·</span>
                  <span>Switchboard</span>
                  <span className="bullet">·</span>
                  <span>Wiring</span>
                  <span className="bullet">·</span>
                  <span>Fan Installation</span>
                  <span className="bullet">·</span>
                  <button
                    type="button"
                    className="more-link-btn"
                    onClick={() => handleExploreService('electrician')}
                    aria-label="Explore all electrical capabilities"
                  >
                    More →
                  </button>
                </div>

                <div className="editorial-row-actions">
                  <button
                    type="button"
                    className="service-tile-explore-btn"
                    onClick={() => handleExploreService('electrician')}
                    aria-label="Explore electrical service details"
                  >
                    <span>Explore service</span>
                    <span className="cta-arrow" aria-hidden="true">→</span>
                  </button>

                  <button
                    type="button"
                    className="service-tile-book-btn"
                    onClick={() => handleBookService('electrician')}
                    aria-label="Book an Electrician"
                  >
                    <span>Book an Electrician →</span>
                  </button>
                </div>
              </div>

              <div
                className="editorial-row-media"
                onClick={() => handleExploreService('electrician')}
                onKeyDown={(e) => e.key === 'Enter' && handleExploreService('electrician')}
                tabIndex={0}
                role="button"
                aria-label="View electrical service details"
              >
                <img
                  src={electricianImg}
                  alt="Professional electrician conducting diagnostics and electrical maintenance"
                  className="editorial-row-photo"
                  loading="lazy"
                />
              </div>
            </article>

            {/* Hairline Divider */}
            <hr className="services-editorial-divider-line" aria-hidden="true" />

            {/* Row 2: Plumber (Left: Photo, Right: Info) */}
            <article className="services-editorial-row reverse complementary-plumber" aria-labelledby="service-title-plumber">
              <div
                className="editorial-row-media"
                onClick={() => handleExploreService('plumber')}
                onKeyDown={(e) => e.key === 'Enter' && handleExploreService('plumber')}
                tabIndex={0}
                role="button"
                aria-label="View plumbing service details"
              >
                <img
                  src={plumberImg}
                  alt="Certified plumber performing residential pipe and fixture maintenance"
                  className="editorial-row-photo"
                  loading="lazy"
                />
              </div>

              <div className="editorial-row-info">
                <span className="editorial-row-category">PLUMBING SERVICES</span>
                <h3 id="service-title-plumber" className="editorial-row-title">Plumber</h3>
                <p className="editorial-row-desc">
                  Plumbing repairs and maintenance for everyday problems around the home.
                </p>
                <div className="editorial-row-issues">
                  <span>Tap & Mixer</span>
                  <span className="bullet">·</span>
                  <span>Drain Blockage</span>
                  <span className="bullet">·</span>
                  <span>Pipe Leaks</span>
                  <span className="bullet">·</span>
                  <span>Flush Systems</span>
                  <span className="bullet">·</span>
                  <button
                    type="button"
                    className="more-link-btn"
                    onClick={() => handleExploreService('plumber')}
                    aria-label="Explore all plumbing capabilities"
                  >
                    More →
                  </button>
                </div>

                <div className="editorial-row-actions">
                  <button
                    type="button"
                    className="service-tile-explore-btn"
                    onClick={() => handleExploreService('plumber')}
                    aria-label="Explore plumbing service details"
                  >
                    <span>Explore service</span>
                    <span className="cta-arrow" aria-hidden="true">→</span>
                  </button>

                  <button
                    type="button"
                    className="service-tile-book-btn"
                    onClick={() => handleBookService('plumber')}
                    aria-label="Book a Plumber"
                  >
                    <span>Book a Plumber →</span>
                  </button>
                </div>
              </div>
            </article>

          </div>
        </section>

        {/* 4. Unboxed Problem-First Index */}
        <section className="services-problem-editorial" aria-labelledby="problem-first-heading">
          <div className="section-mini-eyebrow" style={{ marginBottom: '0.5rem' }}>START WITH THE PROBLEM</div>
          <h3 id="problem-first-heading" className="problem-editorial-heading">
            Not sure which service you need? Start with what went wrong.
          </h3>

          <div className="problem-editorial-grid">
            {problemFirstLinks.map((item) => (
              <button
                key={item.label}
                type="button"
                className="problem-editorial-item"
                onClick={() => handleExploreService(item.serviceSlug, item.label)}
                aria-label={`Explore help for ${item.label}`}
              >
                <span className="problem-item-label">{item.label}</span>
                <span className="problem-item-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        {/* 5. Understated Compact Closing */}
        <div className="services-compact-closing">
          <button
            type="button"
            className="services-compact-closing-link"
            onClick={handleFocusSearch}
            aria-label="Still not sure? Tell us what's wrong"
          >
            <span>Still not sure? Tell us what's wrong</span>
            <span className="closing-arrow" aria-hidden="true">→</span>
          </button>
        </div>

      </div>
    </div>
  );
}
