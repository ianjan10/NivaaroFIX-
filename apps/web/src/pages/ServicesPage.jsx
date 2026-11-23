import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import {
  allServicesList,
  servicesSearchConfig,
  problemFirstLinks,
  servicesDirectory
} from '../data/servicesCatalogData';
const electricianSlides = [
  {
    src: '/images/electrician-mcb.jpg',
    alt: 'Certified master electrician performing residential MCB distribution board diagnostics and repair',
    badge: 'MCB & Distribution Panel',
    objectPosition: 'center 26%'
  },
  {
    src: '/images/electrician-ac.jpg',
    alt: 'Certified electrician servicing indoor split air conditioner cooling unit',
    badge: 'Electrical & Power Diagnostics',
    objectPosition: 'center 24%'
  }
];

const plumberSlides = [
  {
    src: '/images/plumber-tap.jpg',
    alt: 'Master plumber installing and servicing bathroom angle valve, tap, and waterline fixtures',
    badge: 'Tap, Valve & Waterline Repair',
    objectPosition: 'center 42%'
  },
  {
    src: '/images/plumber-basin.jpg',
    alt: 'Certified plumber repairing washbasin drainage trap and resolving pipe leakages',
    badge: 'Washbasin & Drain Diagnostics',
    objectPosition: 'center 30%'
  }
];
const plumberImg = '/images/plumber.png';

export default function ServicesPage({
  currentUser,
  currentAgent,
  onOpenAuth,
  onAgentBlocked,
  onNavigateToBookings
}) {
  const { t } = useLanguage();
  const {
    openServiceDetail,
    initiateProtectedBooking,
    hasRunningBooking,
    runningBooking,
    openRunningBookingBlockedModal
  } = useBooking();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelMaxHeight, setPanelMaxHeight] = useState(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [showEmptyNotice, setShowEmptyNotice] = useState(false);

  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Auto-swapping photo showcase for Electrician (4.5s swap with pause on hover)
  const [electricianSlideIdx, setElectricianSlideIdx] = useState(0);
  const [isElectricianHovered, setIsElectricianHovered] = useState(false);

  useEffect(() => {
    if (isElectricianHovered) return;

    const timer = setInterval(() => {
      setElectricianSlideIdx((prev) => (prev + 1) % electricianSlides.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [isElectricianHovered]);

  // Auto-swapping photo showcase for Plumber (4.5s swap with pause on hover)
  const [plumberSlideIdx, setPlumberSlideIdx] = useState(0);
  const [isPlumberHovered, setIsPlumberHovered] = useState(false);

  useEffect(() => {
    if (isPlumberHovered) return;

    const timer = setInterval(() => {
      setPlumberSlideIdx((prev) => (prev + 1) % plumberSlides.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [isPlumberHovered]);

  // Debounce search query ~120ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Calculate panel max-height based on remaining space in viewport (and visualViewport)
  const updatePanelHeight = () => {
    if (!searchContainerRef.current) return;
    const rect = searchContainerRef.current.getBoundingClientRect();
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const spaceRemaining = vh - rect.bottom - 24;
    const computed = Math.max(160, Math.min(400, spaceRemaining));
    setPanelMaxHeight(computed);
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePanelHeight();
    const handleResize = () => updatePanelHeight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, [isOpen]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Normalization helper (case-insensitive, diacritics ignored, extra whitespace stripped)
  const normalize = (str) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  // Relevance ranking: startsWith -> word startsWith -> contains -> keyword/synonym
  const getRank = (item, query) => {
    const normLabel = normalize(item.label);
    const normQuery = normalize(query);
    if (!normQuery) return null;

    if (normLabel.startsWith(normQuery)) {
      return { tier: 1, index: 0 };
    }

    const words = normLabel.split(/\s+/);
    const wordIdx = words.findIndex((w) => w.startsWith(normQuery));
    if (wordIdx !== -1) {
      return { tier: 2, index: wordIdx };
    }

    const containsIdx = normLabel.indexOf(normQuery);
    if (containsIdx !== -1) {
      return { tier: 3, index: containsIdx };
    }

    const keywords = item.keywords || [];
    for (const kw of keywords) {
      const normKw = normalize(kw);
      if (normKw.startsWith(normQuery) || normKw.includes(normQuery)) {
        return { tier: 4, index: 0, matchedKeyword: kw };
      }
    }

    return null;
  };

  const trimmedQuery = debouncedQuery.trim();
  const isQueryActive = trimmedQuery.length >= 2;

  // Filter & rank suggestions
  let filteredResults = [];
  if (isQueryActive) {
    const scored = [];
    for (const item of servicesSearchConfig.suggestions) {
      const rank = getRank(item, trimmedQuery);
      if (rank) {
        scored.push({ item, rank });
      }
    }

    const nameMatches = scored.filter((s) => s.rank.tier <= 3);
    let finalMatches = [];
    if (nameMatches.length > 0) {
      nameMatches.sort((a, b) => {
        if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
        return a.rank.index - b.rank.index;
      });
      finalMatches = nameMatches;
    } else {
      // Show synonym match only when no name match exists in the first 6
      const synonymMatches = scored.filter((s) => s.rank.tier === 4);
      finalMatches = synonymMatches;
    }

    // Limit to 6 results total, at most 4 per category
    const categoryCounts = {};
    for (const { item, rank } of finalMatches) {
      const cat = item.category;
      categoryCounts[cat] = categoryCounts[cat] || 0;
      if (categoryCounts[cat] < 4 && filteredResults.length < 6) {
        categoryCounts[cat]++;
        filteredResults.push({ ...item, matchTier: rank.tier });
      }
    }
  }

  // Grouping: Popular services when < 2 chars, or Category groups when >= 2 chars
  const displayGroups = [];
  if (!isQueryActive) {
    displayGroups.push({
      id: 'popular-services-group',
      category: 'Popular services',
      items: (servicesSearchConfig.popularServices || []).slice(0, 6)
    });
  } else if (filteredResults.length > 0) {
    const catMap = new Map();
    for (const item of filteredResults) {
      if (!catMap.has(item.category)) {
        const group = {
          id: `category-${normalize(item.category).replace(/\s+/g, '-')}`,
          category: item.category,
          items: []
        };
        catMap.set(item.category, group);
        displayGroups.push(group);
      }
      catMap.get(item.category).items.push(item);
    }
  }

  // Flat list of selectable options for keyboard navigation
  const selectableOptions = [];
  for (const group of displayGroups) {
    for (const item of group.items) {
      selectableOptions.push({
        type: 'service',
        domId: `option-${item.id || item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        data: item
      });
    }
  }

  // Last row: Search for “<typed text>” (always present when there is text)
  if (searchQuery.trim().length > 0) {
    selectableOptions.push({
      type: 'freetext',
      domId: 'option-search-freetext',
      query: searchQuery.trim()
    });
  }

  // Reset activeIndex when query updates
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery]);

  // Screen reader announcements
  useEffect(() => {
    if (!isOpen) return;
    if (isQueryActive) {
      if (filteredResults.length > 0) {
        setLiveAnnouncement(`${filteredResults.length} suggestions available`);
      } else {
        setLiveAnnouncement('No suggestions');
      }
    } else {
      setLiveAnnouncement(`${(servicesSearchConfig.popularServices || []).length} suggestions available`);
    }
  }, [filteredResults.length, isQueryActive, isOpen]);

  // Selection handler
  const handleSelectOption = (option) => {
    if (!option) return;
    if (option.type === 'service') {
      handleExploreService(option.data.serviceSlug, option.data.label);
      setIsOpen(false);
      setShowEmptyNotice(false);
    } else if (option.type === 'freetext') {
      handleSearchSubmit(null, option.query);
    }
  };

  const handleSearchSubmit = (e, customQuery = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = (customQuery !== null ? customQuery : searchQuery).trim();
    if (!q) return;

    const qLower = q.toLowerCase();
    const exact = servicesSearchConfig.suggestions.find(
      (s) => s.label.toLowerCase() === qLower
    );
    if (exact) {
      handleExploreService(exact.serviceSlug, exact.label);
      setIsOpen(false);
      setShowEmptyNotice(false);
      return;
    }

    if (filteredResults.length > 0) {
      handleExploreService(filteredResults[0].serviceSlug, filteredResults[0].label);
      setIsOpen(false);
      setShowEmptyNotice(false);
    } else if (
      qLower.includes('plumb') ||
      qLower.includes('tap') ||
      qLower.includes('pipe') ||
      qLower.includes('leak') ||
      qLower.includes('drain')
    ) {
      handleExploreService('plumber');
      setIsOpen(false);
      setShowEmptyNotice(false);
    } else if (
      qLower.includes('elect') ||
      qLower.includes('mcb') ||
      qLower.includes('switch') ||
      qLower.includes('wire') ||
      qLower.includes('fan')
    ) {
      handleExploreService('electrician');
      setIsOpen(false);
      setShowEmptyNotice(false);
    } else {
      setShowEmptyNotice(true);
      setIsOpen(false);
    }
  };

  // Keyboard navigation for combobox
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else if (selectableOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % selectableOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(selectableOptions.length - 1);
      } else if (selectableOptions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + selectableOptions.length) % selectableOptions.length);
      }
    } else if (e.key === 'Home') {
      if (isOpen && selectableOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(0);
      }
    } else if (e.key === 'End') {
      if (isOpen && selectableOptions.length > 0) {
        e.preventDefault();
        setActiveIndex(selectableOptions.length - 1);
      }
    } else if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && selectableOptions[activeIndex]) {
        e.preventDefault();
        handleSelectOption(selectableOptions[activeIndex]);
      } else {
        handleSearchSubmit(e);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      } else if (searchQuery.length > 0) {
        e.preventDefault();
        setSearchQuery('');
        setDebouncedQuery('');
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  // Text highlighting: matched characters render at weight 600, rest regular
  const renderHighlightedText = (label, query) => {
    if (!query || query.trim().length < 2) {
      return <span>{label}</span>;
    }
    const q = query.trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = label.split(regex);
    return parts.map((part, i) => {
      if (part.toLowerCase() === q.toLowerCase()) {
        return <strong key={i}>{part}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const activeOption = activeIndex >= 0 ? selectableOptions[activeIndex] : null;
  const activeDomId = activeOption ? activeOption.domId : undefined;

  return (
    <div className="services-page-wrapper" role="main">
      <div className="max-w-container">
        
        {/* 1. Services Hero Introduction (Compact Editorial) */}
        <header className="services-hero-section">
          <div className="services-eyebrow">OUR SERVICES</div>

          <h1 className="services-hero-headline">
            Expert help for<br className="services-break-desktop" />what matters at home.
          </h1>

          <p className="services-hero-lead">
            Describe the problem, or browse by service.
          </p>
        </header>

        {/* 2. Main Creative Interaction — Problem Search */}
        <section className="services-search-area" aria-label="Find service by problem">
          <div className="services-search-label">WHAT NEEDS FIXING?</div>

          <div ref={searchContainerRef} className="services-search-container">
            {/* Screen Reader Live Announcement */}
            <div className="services-search-sr-only" aria-live="polite" aria-atomic="true">
              {liveAnnouncement}
            </div>

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
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  aria-controls="services-suggestions-listbox"
                  aria-activedescendant={activeDomId}
                  enterKeyHint="search"
                  className="services-search-field"
                  placeholder='Try “MCB keeps tripping” or “tap leaking”'
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsOpen(true);
                    if (showEmptyNotice) setShowEmptyNotice(false);
                  }}
                  onFocus={() => {
                    setIsOpen(true);
                    updatePanelHeight();
                  }}
                  onClick={() => {
                    setIsOpen(true);
                    updatePanelHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  aria-label="Describe what needs fixing at home"
                  autoComplete="off"
                />

                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    className="services-search-clear-btn"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedQuery('');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </form>

            {/* Suggestions Dropdown Panel */}
            {isOpen && (
              <div
                ref={dropdownRef}
                id="services-suggestions-listbox"
                className="services-suggestions-dropdown"
                role="listbox"
                style={{ maxHeight: panelMaxHeight ? `${panelMaxHeight}px` : undefined }}
              >
                {/* Quiet no results message when query >= 2 and zero results */}
                {isQueryActive && filteredResults.length === 0 && (
                  <div className="services-no-results" role="status">
                    <p className="services-no-results-primary">No matching service.</p>
                    <p className="services-no-results-secondary">Press Enter to describe the problem instead.</p>
                  </div>
                )}

                {/* Groups */}
                {displayGroups.map((group) => (
                  <div
                    key={group.id}
                    className="services-group-container"
                    role="group"
                    aria-labelledby={`${group.id}-heading`}
                  >
                    <div id={`${group.id}-heading`} className="services-group-heading">
                      {group.category}
                    </div>

                    {group.items.map((item) => {
                      const domId = `option-${item.id || item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                      const optIndex = selectableOptions.findIndex((o) => o.domId === domId);
                      const isSelected = activeIndex === optIndex;

                      return (
                        <button
                          key={domId}
                          id={domId}
                          type="button"
                          role="option"
                          aria-selected={isSelected ? 'true' : 'false'}
                          className={`services-suggestion-row ${isSelected ? 'is-active' : ''}`}
                          onMouseEnter={() => setActiveIndex(optIndex)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectOption(selectableOptions[optIndex])}
                        >
                          <span className="services-suggestion-text">
                            {isQueryActive ? renderHighlightedText(item.label, trimmedQuery) : item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Last row: Search for “<typed text>” (always present when there is text) */}
                {searchQuery.trim().length > 0 && (() => {
                  const freeTextOptIndex = selectableOptions.findIndex((o) => o.type === 'freetext');
                  const isFreeTextSelected = activeIndex === freeTextOptIndex;

                  return (
                    <button
                      id="option-search-freetext"
                      type="button"
                      role="option"
                      aria-selected={isFreeTextSelected ? 'true' : 'false'}
                      className={`services-suggestion-row ${isFreeTextSelected ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(freeTextOptIndex)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectOption(selectableOptions[freeTextOptIndex])}
                    >
                      <span className="services-suggestion-text">
                        Search for “{searchQuery.trim()}”
                      </span>
                    </button>
                  );
                })()}
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

          {/* Active Booking In Progress Warning Strip */}
          {hasRunningBooking && runningBooking && (
            <div className="services-active-booking-strip" role="status" aria-live="polite">
              <div className="services-active-strip-left">
                <span className="services-active-strip-dot" />
                <span className="services-active-strip-label">Active Service Running:</span>
                <strong className="services-active-strip-title">{runningBooking.serviceTitle}</strong>
                {runningBooking.requestRef && (
                  <span className="services-active-strip-ref">Ref: {runningBooking.requestRef}</span>
                )}
              </div>
              <div className="services-active-strip-right">
                <button
                  type="button"
                  className="services-active-track-btn"
                  onClick={() => onNavigateToBookings ? onNavigateToBookings() : (window.location.hash = '#/bookings')}
                >
                  <span>Track Live Job →</span>
                </button>
                <button
                  type="button"
                  className="services-active-policy-btn"
                  onClick={() => openRunningBookingBlockedModal(runningBooking)}
                >
                  <span>Policy Note</span>
                </button>
              </div>
            </div>
          )}

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
                className="editorial-row-media editorial-row-media-carousel"
                onClick={() => handleExploreService('electrician')}
                onKeyDown={(e) => e.key === 'Enter' && handleExploreService('electrician')}
                onMouseEnter={() => setIsElectricianHovered(true)}
                onMouseLeave={() => setIsElectricianHovered(false)}
                tabIndex={0}
                role="button"
                aria-label="View electrical service details"
              >
                {/* Crossfading High-Res Photos */}
                {electricianSlides.map((slide, idx) => {
                  const isActive = idx === electricianSlideIdx;
                  return (
                    <img
                      key={slide.src}
                      src={slide.src}
                      alt={slide.alt}
                      className={`editorial-row-photo editorial-carousel-photo ${isActive ? 'active' : ''}`}
                      style={{ objectPosition: slide.objectPosition }}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/images/electrician.jpg';
                      }}
                    />
                  );
                })}

                {/* Minimal Segmented Frosted Indicators */}
                <div
                  className="editorial-swap-indicators"
                  role="tablist"
                  aria-label="Photo carousel pagination"
                  onClick={(e) => e.stopPropagation()}
                >
                  {electricianSlides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`editorial-swap-dot ${idx === electricianSlideIdx ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setElectricianSlideIdx(idx);
                      }}
                      aria-label={`Show photo ${idx + 1}`}
                      aria-selected={idx === electricianSlideIdx}
                      role="tab"
                    />
                  ))}
                </div>
              </div>
            </article>

            {/* Hairline Divider */}
            <hr className="services-editorial-divider-line" aria-hidden="true" />

            {/* Row 2: Plumber (Left: Photo, Right: Info) */}
            <article className="services-editorial-row reverse complementary-plumber" aria-labelledby="service-title-plumber">
              <div
                className="editorial-row-media editorial-row-media-carousel"
                onClick={() => handleExploreService('plumber')}
                onKeyDown={(e) => e.key === 'Enter' && handleExploreService('plumber')}
                onMouseEnter={() => setIsPlumberHovered(true)}
                onMouseLeave={() => setIsPlumberHovered(false)}
                tabIndex={0}
                role="button"
                aria-label="View plumbing service details"
              >
                {/* Crossfading High-Res Photos */}
                {plumberSlides.map((slide, idx) => {
                  const isActive = idx === plumberSlideIdx;
                  return (
                    <img
                      key={slide.src}
                      src={slide.src}
                      alt={slide.alt}
                      className={`editorial-row-photo editorial-carousel-photo ${isActive ? 'active' : ''}`}
                      style={{ objectPosition: slide.objectPosition }}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/images/plumber.png';
                      }}
                    />
                  );
                })}

                {/* Minimal Segmented Frosted Indicators */}
                <div
                  className="editorial-swap-indicators"
                  role="tablist"
                  aria-label="Plumbing photo carousel pagination"
                  onClick={(e) => e.stopPropagation()}
                >
                  {plumberSlides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`editorial-swap-dot ${idx === plumberSlideIdx ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlumberSlideIdx(idx);
                      }}
                      aria-label={`Show plumbing photo ${idx + 1}`}
                      aria-selected={idx === plumberSlideIdx}
                      role="tab"
                    />
                  ))}
                </div>
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
