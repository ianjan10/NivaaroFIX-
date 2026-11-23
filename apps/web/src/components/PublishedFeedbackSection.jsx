import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

/**
 * PublishedFeedbackSection - Split Layout Interactive Flashcard Showcase
 *
 * Left side:
 * - Catchy, interactive heading: "What our customers say" (Fraunces serif)
 * - Understated editorial eyebrow and supportive description
 * - Intuitive interactive controls: Previous, Next, Pause/Play toggle (WCAG 2.2.2)
 * - Modern step counter indicator ("01 / 03") and interactive slide progress pills
 *
 * Right side:
 * - Dynamic "Flashcard" display matching the "How it works" card styling:
 *   pure white background, 16px radius, soft diffuse shadow, no visible border,
 *   muted body text quote, dark customer name, and dark ink solid star rating (no gold).
 * - Tactile layered underlay giving an authentic flashcard deck depth.
 * - Auto-advances every 5 seconds ("after 5 sec other come then other like that").
 * - Auto-pauses on hover, keyboard focus, touch interaction, hidden tab, or <50% in-view.
 * - Touch swipe support for mobile devices.
 * - Zero published records: returns null (completely absent from DOM).
 */

// In-memory module session cache
let sessionFeedbacksCache = null;

export default function PublishedFeedbackSection() {
  const [items, setItems] = useState(() => sessionFeedbacksCache || []);
  const [isLoaded, setIsLoaded] = useState(() => sessionFeedbacksCache !== null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasUserNavigated, setHasUserNavigated] = useState(false);

  // Pause states
  const [isUserPaused, setIsUserPaused] = useState(() => {
    try {
      return sessionStorage.getItem('nivaarofix_feedback_paused') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [isInView, setIsInView] = useState(false);

  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const revealRef = useScrollReveal();
  const autoplayTimerRef = useRef(null);
  const touchStartXRef = useRef(0);

  // Fetch feedback for public display once after first paint
  useEffect(() => {
    if (sessionFeedbacksCache !== null) {
      setItems(sessionFeedbacksCache);
      setIsLoaded(true);
      return;
    }

    let isMounted = true;
    fetch('/api/public/feedback', { credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const testimonials = Array.isArray(data.testimonials) ? data.testimonials : [];
        sessionFeedbacksCache = testimonials;
        setItems(testimonials);
        setIsLoaded(true);
      })
      .catch(() => {
        if (isMounted) {
          sessionFeedbacksCache = [];
          setItems([]);
          setIsLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleMediaChange = (e) => setPrefersReducedMotion(e.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
      return () => mediaQuery.removeListener(handleMediaChange);
    }
  }, []);

  // Track document visibility
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // IntersectionObserver: active only when at least 50% is visible
  useEffect(() => {
    const target = sectionRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.2);
      },
      { threshold: [0, 0.2, 0.5] }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [items.length]);

  // Navigate to Next slide
  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setHasUserNavigated(true);
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  // Navigate to Previous slide
  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setHasUserNavigated(true);
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  // Toggle Play / Pause
  const handleTogglePlayPause = () => {
    setIsUserPaused((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('nivaarofix_feedback_paused', String(next));
      } catch (_) {}
      return next;
    });
  };

  // Keyboard navigation on stage
  const handleKeyDown = (e) => {
    if (items.length <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  // Touch Swipe handlers
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsInteracting(true);
  };

  const handleTouchEnd = (e) => {
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setIsInteracting(false);
  };

  // Autoplay loop: advances every 5s like flashcards
  const isPlaying =
    items.length > 1 &&
    !isUserPaused &&
    !isHovered &&
    !isFocused &&
    !isInteracting &&
    !isTabHidden &&
    isInView &&
    !prefersReducedMotion;

  useEffect(() => {
    if (!isPlaying) {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
      return;
    }

    autoplayTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 5000);

    return () => {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    };
  }, [isPlaying, items.length]);

  // Focus tracking
  const handleFocus = () => setIsFocused(true);
  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsFocused(false);
    }
  };

  // If nothing is published or failed/slow request: return null before rendering ANY markup
  if (!isLoaded || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex] || items[0];
  const displayName = currentItem.publicName && currentItem.publicName.trim() ? currentItem.publicName.trim() : 'Customer';
  const hasRating = typeof currentItem.rating === 'number' && currentItem.rating >= 1 && currentItem.rating <= 5;
  const hasMultiple = items.length > 1;

  return (
    <section
      ref={(node) => {
        sectionRef.current = node;
        if (typeof revealRef === 'function') revealRef(node);
        else if (revealRef) revealRef.current = node;
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Customer feedback showcase"
      className="published-feedback-section scroll-reveal-section"
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{
        background: '#ffffff',
        padding: 'clamp(3.5rem, 5.5vw, 5rem) 0',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div className="max-w-container" style={{ margin: '0 auto', maxWidth: 1200, padding: '0 24px' }}>
        
        {/* Split Layout: Left Header & Controls, Right Interactive Flashcard */}
        <div className="feedback-split-layout">
          
          {/* Left Column: Shifted Heading & Interactive Controls */}
          <div className="feedback-left-column">
            
            {/* Catchy Left-Aligned Heading */}
            <h2
              style={{
                fontFamily: "var(--font-serif, 'Fraunces', Georgia, serif)",
                fontSize: 'clamp(30px, 3.6vw, 42px)',
                fontWeight: 500,
                lineHeight: 1.15,
                color: 'var(--text-primary, #0f172a)',
                margin: '0 0 0.75rem 0',
                letterSpacing: '-0.02em'
              }}
            >
              What our customers say
            </h2>

            {/* Catchy 3-word Sublead */}
            <p
              style={{
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                fontSize: 'clamp(0.95rem, 1.3vw, 1.05rem)',
                fontWeight: 500,
                color: 'var(--text-secondary, #64748b)',
                lineHeight: 1.4,
                margin: '0 0 1.75rem 0'
              }}
            >
              Real homeowner stories.
            </p>

            {/* Interactive Navigation & Step Counter */}
            {hasMultiple && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                  marginBottom: '1.25rem'
                }}
              >
                {/* Previous & Next Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous feedback card"
                    className="feedback-carousel-arrow"
                    style={{
                      width: '38px',
                      height: '38px',
                      minWidth: '44px',
                      minHeight: '44px',
                      padding: '4px',
                      borderRadius: '50%',
                      border: '1px solid var(--bg-card-border, #e2e8f0)',
                      background: '#ffffff',
                      color: 'var(--text-primary, #0f172a)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 150ms ease, box-shadow 150ms ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--text-muted, #94a3b8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--bg-card-border, #e2e8f0)';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next feedback card"
                    className="feedback-carousel-arrow"
                    style={{
                      width: '38px',
                      height: '38px',
                      minWidth: '44px',
                      minHeight: '44px',
                      padding: '4px',
                      borderRadius: '50%',
                      border: '1px solid var(--bg-card-border, #e2e8f0)',
                      background: '#ffffff',
                      color: 'var(--text-primary, #0f172a)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 150ms ease, box-shadow 150ms ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--text-muted, #94a3b8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--bg-card-border, #e2e8f0)';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* Pause / Play Toggle (WCAG 2.2.2) */}
                  <button
                    type="button"
                    onClick={handleTogglePlayPause}
                    aria-label={isUserPaused ? 'Play feedback rotation' : 'Pause feedback rotation'}
                    className="feedback-carousel-arrow"
                    style={{
                      width: '38px',
                      height: '38px',
                      minWidth: '44px',
                      minHeight: '44px',
                      padding: '4px',
                      borderRadius: '50%',
                      border: '1px solid var(--bg-card-border, #e2e8f0)',
                      background: '#ffffff',
                      color: 'var(--text-primary, #0f172a)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 150ms ease, box-shadow 150ms ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--text-muted, #94a3b8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--bg-card-border, #e2e8f0)';
                    }}
                  >
                    {isUserPaused ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="6 4 20 12 6 20 6 4" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="10" y1="5" x2="10" y2="19" />
                        <line x1="14" y1="5" x2="14" y2="19" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Step Counter Indicator */}
                <div
                  style={{
                    fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #64748b)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    userSelect: 'none'
                  }}
                  aria-hidden="true"
                >
                  <span style={{ color: 'var(--text-primary, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                    {String(currentIndex + 1).padStart(2, '0')}
                  </span>
                  <span style={{ opacity: 0.4 }}>/</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {String(items.length).padStart(2, '0')}
                  </span>
                </div>
              </div>
            )}

            {/* Interactive Progress Segment Pills */}
            {hasMultiple && (
              <div
                role="tablist"
                aria-label="Feedback card selection"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {items.map((_, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Show feedback card ${idx + 1}`}
                      onClick={() => {
                        setHasUserNavigated(true);
                        setCurrentIndex(idx);
                      }}
                      style={{
                        height: '4px',
                        width: isActive ? '32px' : '14px',
                        borderRadius: '2px',
                        background: isActive ? 'var(--text-primary, #0f172a)' : 'var(--bg-card-border, #e2e8f0)',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: prefersReducedMotion ? 'none' : 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Interactive Flashcard Stage */}
          <div className="feedback-right-column">
            
            {/* Live region for accessibility announcements */}
            <div className="sr-only" aria-live={hasUserNavigated ? 'polite' : 'off'} aria-atomic="true">
              {`${displayName}: ${currentItem.publicText}`}
            </div>

            {/* Flashcard Stage */}
            <div
              ref={stageRef}
              tabIndex={hasMultiple ? 0 : -1}
              onKeyDown={handleKeyDown}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="feedback-flashcard-stage"
              style={{
                position: 'relative',
                width: '100%',
                outline: 'none',
                minHeight: '220px'
              }}
            >
              {/* Tactile Ambient Underlay Card (Physical Deck Aesthetic) */}
              {hasMultiple && (
                <div
                  aria-hidden="true"
                  className="feedback-flashcard-underlay"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    right: '-8px',
                    bottom: '-8px',
                    background: '#f8fafc',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-card)',
                    border: '1px solid var(--bg-card-border, rgba(16, 24, 40, 0.08))',
                    zIndex: 0,
                    pointerEvents: 'none'
                  }}
                />
              )}

              {/* Active Flashcard: Exact 'How it works' Container Style */}
              <article
                key={currentItem.id}
                aria-label={`Feedback by ${displayName}`}
                className="how-step-card nivaaro-card published-feedback-card feedback-flashcard-active"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  minHeight: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  cursor: 'default',
                  animation: prefersReducedMotion ? 'none' : 'flashcardEnter 400ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                {/* Quote text: same font, size and muted body color as 'How it works' description copy */}
                <p
                  className="published-feedback-text"
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                    fontSize: '0.94rem',
                    lineHeight: 1.6,
                    color: 'var(--text-secondary, #64748b)',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {currentItem.publicText}
                </p>

                {/* Flexible space: at least 28px so footer always sits at bottom */}
                <div style={{ flex: 1, minHeight: '28px' }} />

                {/* Footer row: name left in dark semibold, star rating right in dark ink / light grey */}
                <div
                  className="published-feedback-footer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  {/* Customer Name (same dark semibold style as 'How it works' card titles) */}
                  <span
                    className="published-feedback-name"
                    style={{
                      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                      fontSize: '1.05rem',
                      fontWeight: 600,
                      lineHeight: 1.3,
                      color: 'var(--text-primary, #0f172a)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: hasRating ? 'calc(100% - 100px)' : '100%'
                    }}
                  >
                    {displayName}
                  </span>

                  {/* Five 16px solid stars with 2px gap: filled in dark ink, empty in light grey. No accent color. */}
                  {hasRating && (
                    <div
                      role="img"
                      aria-label={`Rated ${currentItem.rating} out of 5`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        flexShrink: 0
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((starIdx) => {
                        const isFilled = starIdx <= currentItem.rating;
                        return (
                          <svg
                            key={starIdx}
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill={isFilled ? 'var(--text-primary, #0f172a)' : 'var(--bg-card-border, #e2e8f0)'}
                            aria-hidden="true"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
