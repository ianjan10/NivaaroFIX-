import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';

// Import authentic photography from project_image and images directories
import sceneSearchImg from '../assets/images/homeowner-dual.jpg';
import sceneMatchImg from '../assets/project_image/5.png';
import sceneFixImg from '../assets/project_image/6.png';
import sceneCheckImg from '../assets/project_image/7.png';
import sceneFinishImg from '../assets/project_image/4.png';

/**
 * =========================================================================
 * FUTURE UPGRADE PATH (V2 Continuous Video Scrub):
 * -------------------------------------------------------------------------
 * When a continuous commissioned video shoot becomes available (one
 * uninterrupted camera movement through an actual home repair visit),
 * this section can be upgraded to true frame-by-frame canvas scroll scrubbing:
 * 1. Extract video frames as high-efficiency WebP tiles via ffmpeg.
 * 2. Render current frame index onto a high-DPI <canvas> keyed to scroll progress.
 * 3. The 5-scene crossfade below provides the exact production-ready v1 baseline.
 * =========================================================================
 */

const SCENES_DATA = [
  {
    id: 1,
    counter: '01 / 05',
    title: 'The search',
    tagline: 'Noticing the fault',
    description: 'A flickering breaker, a silent leak, or a sudden power trip — the moment a homeowner describes the issue and requests expert help.',
    image: sceneSearchImg,
    alt: 'Homeowner noticing electrical fault and seeking verified assistance',
    panDirection: { startX: -10, startY: -5, endX: 10, endY: 5 }
  },
  {
    id: 2,
    counter: '02 / 05',
    title: 'The match',
    tagline: 'Dispatched with purpose',
    description: 'A certified specialist reviews the exact problem description, selects calibrated diagnostic tools, and departs for the doorstep.',
    image: sceneMatchImg,
    alt: 'Certified technician equipped with diagnostic gear arriving at customer location',
    panDirection: { startX: 8, startY: -8, endX: -8, endY: 8 }
  },
  {
    id: 3,
    counter: '03 / 05',
    title: 'The fix',
    tagline: 'Hands-on precision',
    description: 'Multimeter diagnostics, safe circuit isolation, and meticulous component repair — executed with genuine parts and zero shortcuts.',
    image: sceneFixImg,
    alt: 'Hands-on precision repair and pipe diagnostics under sink with professional tools',
    panDirection: { startX: -8, startY: 8, endX: 8, endY: -8 }
  },
  {
    id: 4,
    counter: '04 / 05',
    title: 'The check',
    tagline: 'Verified testing',
    description: 'Testing the completed installation under full operational load and demonstrating safety compliance alongside the homeowner.',
    image: sceneCheckImg,
    alt: 'Technician testing and verifying restored light fixture with customer',
    panDirection: { startX: 8, startY: 5, endX: -8, endY: -5 }
  },
  {
    id: 5,
    counter: '05 / 05',
    title: 'The finish',
    tagline: 'Restored comfort',
    description: 'Tools packed, work area swept clean, door OTP confirmed, and transparent warranty activated for total peace of mind.',
    image: sceneFinishImg,
    alt: 'Clean finished plumbing repair with tools neatly arranged',
    panDirection: { startX: 0, startY: -8, endX: 0, endY: 8 }
  }
];

export default function InsideVisitScrollStory({ onExploreServices }) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const stickyRef = useRef(null);
  const carouselRef = useRef(null);

  // Responsive & Accessibility State
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [imagesPreloaded, setImagesPreloaded] = useState(false);

  // Desktop Scroll Scrub State
  const [scrollProgress, setScrollProgress] = useState(0); // 0.0 to 1.0
  const [activeSceneIndex, setActiveSceneIndex] = useState(0); // 0 to 4
  const [activeMobileCard, setActiveMobileCard] = useState(0);

  // 1. Detect Screen Breakpoint & Reduced Motion Preference
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    const mediaQueryMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQueryMotion.matches);

    const handleMotionChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQueryMotion.addEventListener('change', handleMotionChange);

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQueryMotion.removeEventListener('change', handleMotionChange);
    };
  }, []);

  // 2. IntersectionObserver for Lazy-Loading and Image Preloading
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsNearViewport(true);
          }
        });
      },
      { rootMargin: '400px 0px' }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // 3. Preload all 5 real images once section approaches viewport
  useEffect(() => {
    if (!isNearViewport || imagesPreloaded) return;

    let loadedCount = 0;
    SCENES_DATA.forEach((scene) => {
      const img = new Image();
      img.src = scene.image;
      img.onload = img.onerror = () => {
        loadedCount++;
        if (loadedCount >= SCENES_DATA.length) {
          setImagesPreloaded(true);
        }
      };
    });
  }, [isNearViewport, imagesPreloaded]);

  // 4. Desktop 60fps Scroll Position Math
  const handleScroll = useCallback(() => {
    if (isMobile || prefersReducedMotion || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const navbarHeight = 72; // Height of fixed/sticky top navigation bar
    const viewportHeight = window.innerHeight;
    const stickyHeight = viewportHeight - navbarHeight;
    const totalScrollableDistance = rect.height - stickyHeight;

    if (totalScrollableDistance <= 0) return;

    // Progress from 0 (top entering below navbar) to 1 (bottom leaving)
    const rawProgress = (navbarHeight - rect.top) / totalScrollableDistance;
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));

    setScrollProgress(clampedProgress);

    // Calculate active scene index (0 to 4) centered evenly around keyframes
    const totalScenes = SCENES_DATA.length;
    const sceneIndex = Math.min(
      Math.max(0, Math.round(clampedProgress * (totalScenes - 1))),
      totalScenes - 1
    );
    setActiveSceneIndex(sceneIndex);
  }, [isMobile, prefersReducedMotion]);

  useEffect(() => {
    if (isMobile || prefersReducedMotion) return;

    let animationFrameId = null;

    const onScroll = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isMobile, prefersReducedMotion, handleScroll]);

  // Jump to specific scene when clicking a progress tab
  const jumpToScene = (index) => {
    if (!containerRef.current) return;
    const navbarHeight = 72;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const containerTop = rect.top + scrollTop;
    const stickyHeight = window.innerHeight - navbarHeight;
    const totalScrollableDistance = containerRef.current.offsetHeight - stickyHeight;
    const targetScrollY = containerTop - navbarHeight + (index / (SCENES_DATA.length - 1)) * totalScrollableDistance;

    window.scrollTo({
      top: Math.max(0, targetScrollY),
      behavior: 'smooth'
    });
    setActiveSceneIndex(index);
  };

  // Mobile Carousel Scroll Listener
  const handleMobileScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    const index = Math.round(scrollLeft / clientWidth);
    setActiveMobileCard(Math.max(0, Math.min(SCENES_DATA.length - 1, index)));
  };

  const scrollToMobileScene = (index) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollTo({
      left: index * carouselRef.current.clientWidth,
      behavior: 'smooth'
    });
    setActiveMobileCard(index);
  };

  // Calculate Opacity and Ken Burns Transform for Scene in Desktop Scrub
  const calculateSceneVisuals = (index) => {
    const totalScenes = SCENES_DATA.length;
    // Continuous index from 0.0 to 4.0 across the scroll track
    const continuousIndex = scrollProgress * (totalScenes - 1);
    const dist = Math.abs(continuousIndex - index);

    // Smooth continuous crossfade where sum of adjacent opacities is always 1.0
    let opacity = 0;
    if (dist <= 1) {
      opacity = 1 - dist;
    }

    // Smoothstep interpolation for luxurious cinematic fade
    const smoothOpacity = opacity * opacity * (3 - 2 * opacity);

    // Ken Burns subtle pan/zoom
    const segmentStart = Math.max(0, (index - 0.5) / (totalScenes - 1));
    const segmentEnd = Math.min(1, (index + 0.5) / (totalScenes - 1));
    let progressInSegment = (scrollProgress - segmentStart) / (segmentEnd - segmentStart || 1);
    progressInSegment = Math.max(0, Math.min(1, progressInSegment));

    const scene = SCENES_DATA[index];
    const scale = 1.0 + 0.035 * progressInSegment;
    const panX = scene.panDirection.startX + (scene.panDirection.endX - scene.panDirection.startX) * progressInSegment;
    const panY = scene.panDirection.startY + (scene.panDirection.endY - scene.panDirection.startY) * progressInSegment;

    return {
      opacity: Math.max(0, Math.min(1, smoothOpacity)),
      transform: `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`,
      zIndex: activeSceneIndex === index ? 10 : (smoothOpacity > 0.05 ? 5 : 1)
    };
  };

  // =========================================================================
  // Render Mode A: Prefers Reduced Motion (Static Stacked Fallback)
  // =========================================================================
  if (prefersReducedMotion) {
    return (
      <section className="scroll-story-section reduced-motion-flow" aria-label="Inside a NivaaroFix visit narrative">
        <div className="max-w-container">
          <div className="scroll-story-section-header">
            <span className="scroll-story-eyebrow">INSIDE A VISIT</span>
            <h2 className="scroll-story-main-headline">How a real repair unfolds.</h2>
            <p className="scroll-story-main-subtitle">
              From the first diagnostic inspection to verified testing — one continuous standard of care.
            </p>
          </div>

          <div className="reduced-motion-scenes-grid">
            {SCENES_DATA.map((scene) => (
              <article key={scene.id} className="reduced-motion-scene-card">
                <div className="reduced-motion-image-wrap">
                  <img src={scene.image} alt={scene.alt} className="reduced-motion-img" loading="lazy" />
                  <div className="story-color-grade-overlay" aria-hidden="true" />
                </div>
                <div className="reduced-motion-caption">
                  <span className="story-counter-tag">{scene.counter}</span>
                  <h3 className="story-scene-title">{scene.title}</h3>
                  <span className="story-scene-tagline">{scene.tagline}</span>
                  <p className="story-scene-desc">{scene.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // Render Mode B: Mobile / Tablet (Horizontal Swipeable Carousel Fallback)
  // =========================================================================
  if (isMobile) {
    return (
      <section className="scroll-story-section mobile-carousel-flow" aria-label="Inside a NivaaroFix visit narrative">
        <div className="scroll-story-mobile-header">
          <span className="scroll-story-eyebrow">INSIDE A VISIT</span>
          <h2 className="scroll-story-main-headline">How a real repair unfolds.</h2>
          <p className="scroll-story-main-subtitle">
            Swipe through a genuine doorstep service visit from diagnosis to completed finish.
          </p>
        </div>

        {/* Swipeable Track */}
        <div
          ref={carouselRef}
          className="scroll-story-mobile-track"
          onScroll={handleMobileScroll}
          role="region"
          aria-label="Service visit steps carousel"
        >
          {SCENES_DATA.map((scene, idx) => (
            <div key={scene.id} className="mobile-story-card">
              <div className="mobile-story-image-wrap">
                <img
                  src={scene.image}
                  alt={scene.alt}
                  className="mobile-story-img"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
                <div className="story-color-grade-overlay" aria-hidden="true" />
                <div className="story-scrim-bottom" aria-hidden="true" />

                {/* Floating Caption inside image card */}
                <div className="mobile-story-caption-overlay">
                  <span className="story-counter-tag">{scene.counter}</span>
                  <h3 className="story-scene-title">{scene.title}</h3>
                  <span className="story-scene-tagline">{scene.tagline}</span>
                  <p className="story-scene-desc">{scene.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile Navigation Dots & Step Badges */}
        <div className="mobile-story-controls">
          <div className="mobile-step-dots" role="tablist" aria-label="Scene navigation">
            {SCENES_DATA.map((scene, idx) => (
              <button
                key={scene.id}
                type="button"
                role="tab"
                aria-selected={activeMobileCard === idx}
                aria-label={`Go to scene ${scene.counter}: ${scene.title}`}
                className={`mobile-dot-btn ${activeMobileCard === idx ? 'active' : ''}`}
                onClick={() => scrollToMobileScene(idx)}
              />
            ))}
          </div>

          <div className="mobile-carousel-actions">
            <button
              type="button"
              className="btn-mobile-nav"
              disabled={activeMobileCard === 0}
              onClick={() => scrollToMobileScene(activeMobileCard - 1)}
              aria-label="Previous scene"
            >
              ←
            </button>
            <span className="mobile-step-counter-text">
              {SCENES_DATA[activeMobileCard].counter}
            </span>
            <button
              type="button"
              className="btn-mobile-nav"
              disabled={activeMobileCard === SCENES_DATA.length - 1}
              onClick={() => scrollToMobileScene(activeMobileCard + 1)}
              aria-label="Next scene"
            >
              →
            </button>
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // Render Mode C: Desktop Primary Build (Pinned Scroll-Driven Crossfade Sequence)
  // =========================================================================
  const activeScene = SCENES_DATA[activeSceneIndex] || SCENES_DATA[0];

  return (
    <div
      ref={containerRef}
      className="scroll-story-outer-track"
      aria-label="Inside a NivaaroFix visit interactive scroll narrative"
    >
      {/* Sticky Viewport Stage (100vh pinned) */}
      <div ref={stickyRef} className="scroll-story-sticky-stage">
        {/* Full-Bleed Photographic Visual Canvas */}
        <div className="scroll-story-visual-canvas">
          {SCENES_DATA.map((scene, idx) => {
            const visuals = calculateSceneVisuals(idx);
            return (
              <div
                key={scene.id}
                className="scroll-story-image-layer"
                style={{
                  opacity: visuals.opacity,
                  zIndex: visuals.zIndex
                }}
                aria-hidden={visuals.opacity < 0.2}
              >
                <img
                  src={scene.image}
                  alt={scene.alt}
                  className="scroll-story-photo"
                  style={{
                    transform: visuals.transform
                  }}
                  loading={idx <= 1 ? 'eager' : 'lazy'}
                />
              </div>
            );
          })}

          {/* Cinematic Color Grade & Vignette Scrim */}
          <div className="story-color-grade-overlay" aria-hidden="true" />
          <div className="story-vignette-scrim" aria-hidden="true" />
        </div>

        {/* Top Header Bar: Section Title (Left) + Interactive Step Tabs (Right) */}
        <div className="scroll-story-top-bar">
          <div className="scroll-story-content-container scroll-story-top-inner">
            <div className="scroll-story-top-left">
              <span className="scroll-story-eyebrow">INSIDE A NIVAAROFIX VISIT</span>
              <h2 className="scroll-story-header-title">How a real repair unfolds.</h2>
            </div>

            <nav className="scroll-story-tabs-nav" aria-label="Story scene selectors">
              {SCENES_DATA.map((scene, idx) => {
                const isPassed = activeSceneIndex >= idx;
                const isCurrent = activeSceneIndex === idx;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    className={`story-tab-pill ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''}`}
                    onClick={() => jumpToScene(idx)}
                    aria-label={`Jump to ${scene.title}`}
                  >
                    <span className="tab-pill-num">0{idx + 1}</span>
                    <span className="tab-pill-title">{scene.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Floating Narrative Editorial Card (Bottom Left) + Arrow Controls (Bottom Right) */}
        <div className="scroll-story-bottom-area">
          <div className="scroll-story-content-container scroll-story-bottom-inner">
            <div className="story-caption-card" key={activeScene.id}>
              <div className="story-caption-topline">
                <span className="story-counter-tag">{activeScene.counter}</span>
                <span className="story-tagline-pill">{activeScene.tagline}</span>
              </div>

              <h3 className="story-scene-title">{activeScene.title}</h3>
              <p className="story-scene-desc">{activeScene.description}</p>
            </div>

            {/* Previous / Next Arrow Controls (Bottom Right) */}
            <div className="story-arrow-controls">
              <button
                type="button"
                className="btn-story-arrow"
                disabled={activeSceneIndex === 0}
                onClick={() => jumpToScene(activeSceneIndex - 1)}
                aria-label="Previous story scene"
              >
                ←
              </button>
              <span className="story-arrow-counter">{activeScene.counter}</span>
              <button
                type="button"
                className="btn-story-arrow"
                disabled={activeSceneIndex === SCENES_DATA.length - 1}
                onClick={() => jumpToScene(activeSceneIndex + 1)}
                aria-label="Next story scene"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Full-Width Scrub Progress Line */}
        <div className="scroll-scrub-indicator" aria-hidden="true">
          <div
            className="scroll-scrub-fill"
            style={{ width: `${(scrollProgress * 100).toFixed(1)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
