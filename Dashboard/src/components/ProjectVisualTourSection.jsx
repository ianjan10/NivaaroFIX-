import React, { useState } from 'react';
import '../styles/ProjectVisualTourSection.css';

const visualPillars = [
  {
    id: 1,
    category: 'specs',
    title: 'Customer Portal & 30-Min Booking',
    shortTag: '1. Customer Flow',
    badge: 'Homeowner Experience',
    icon: '👤',
    image: '/project_image/1.png',
    headline: 'Instant, Verified Doorstep Repairs in 3 Simple Steps',
    description: 'A seamless, frictionless customer onboarding and booking experience designed to eliminate repair anxiety. Features fast phone OTP verification, segmented Date-of-Birth selectors, real-time address validation, and instant dispatch of master electricians and plumbers.',
    highlights: [
      { label: '⚡ Instant 30-Min Dispatch', detail: 'Rapid response master electricians & plumbers at your doorstep' },
      { label: '🔒 Phone OTP Verification', detail: 'Zero-friction login without needing to remember complex passwords' },
      { label: '🛡️ 90-Day Repair Warranty', detail: 'Unconditional free rework warranty on all completed doorstep repairs' },
      { label: '₹ Upfront Standardized Pricing', detail: 'Fixed rate card with no hidden charges or surprise call-out fees' }
    ],
    ctaText: 'Experience Customer Sign-In Flow →',
    ctaLink: 'http://localhost:5500?portal=customer',
    specDetails: 'Resolution: High-Res UI Spec • 306 KB • Multi-Language Ready',
    hotspots: [
      { top: '22%', left: '35%', title: 'Direct Google OAuth & Phone OTP', desc: 'Instant authentication with real database verification' },
      { top: '55%', left: '40%', title: 'Segmented DOB Selector', desc: 'Ergonomic day/month/year selector for smooth profile completion' },
      { top: '80%', left: '50%', title: 'Account Mismatch Modal', desc: 'Intelligent fallback dialog localized in 10 Indian languages' }
    ]
  },
  {
    id: 2,
    category: 'specs',
    title: 'Professional Onboarding',
    shortTag: '2. Professional Flow',
    badge: 'Professional Platform',
    icon: '🛠️',
    image: '/project_image/2.png',
    headline: 'Empowering Master Tradesmen with Verified Digital Credentials',
    description: 'A purpose-built registration and KYC portal for electricians, plumbers, and multi-trade technicians. Collects trade domain specializations, years of verified field experience, state/city cascading service areas, and generates unique professional IDs (e.g. FIX-PRO-XXXX).',
    highlights: [
      { label: '🎖️ Skill & Police Verification', detail: 'Government ID validation and mandatory trade skill screening' },
      { label: '💼 Dual-Trade Classification', detail: 'Support for certified electricians, master plumbers, or dual-specialists' },
      { label: '🗺️ Cascading Service Hubs', detail: 'District & city territory mapping across all 28 Indian states' },
      { label: '💰 Automated Weekly Payouts', detail: 'Direct wallet earnings deposit with 0% platform commission on day 1' }
    ],
    ctaText: 'Register as Professional →',
    ctaLink: 'http://localhost:5500?portal=agent',
    specDetails: 'Resolution: Blueprint Architecture • 599 KB • Multi-State KYC',
    hotspots: [
      { top: '25%', left: '48%', title: 'Trade Classification Badge', desc: 'Electrician, Plumber, or Dual-Trade Specialist' },
      { top: '52%', left: '52%', title: 'Cascading Indian State Dropdown', desc: 'Select from 28 states and hundreds of certified service cities' },
      { top: '78%', left: '45%', title: 'Unique Professional ID Generator', desc: 'Automated FIX-PRO credentialing for immediate live dispatch' }
    ]
  },
  {
    id: 3,
    category: 'specs',
    title: 'Marketplace & Service Catalog',
    shortTag: '3. Marketplace',
    badge: 'Core Service Catalog',
    icon: '⚡',
    image: '/project_image/3.png',
    headline: '50+ Standardized Electrical & Plumbing Home Fixes',
    description: 'The front-facing editorial service marketplace featuring live instant search, transparent rate cards, verified customer reviews, 90-day warranty badges, and multi-lingual accessibility across 10 Indian regional languages.',
    highlights: [
      { label: '🔍 Real-Time Issue Search', detail: 'Search by symptom (e.g. switchboard burn, tap leak, MCB tripping)' },
      { label: '⭐ 4.9+ Star Master Pros', detail: 'Over 50,000+ verified customer ratings and real photographic reviews' },
      { label: '🌐 10 Indian Languages', detail: 'Full native localization in Hindi, Marathi, Bengali, Tamil, Telugu & more' },
      { label: '🏷️ Fixed Rate Protection', detail: 'Price starting from ₹129 with complete cost breakdown before booking' }
    ],
    ctaText: 'Explore Service Catalog →',
    ctaAction: 'exploreServices',
    specDetails: 'Resolution: Master Layout Spec • 939 KB • Responsive Grid',
    hotspots: [
      { top: '15%', left: '50%', title: 'Hero Predictive Search', desc: 'Instant autocomplete matching specific electrical & plumbing symptoms' },
      { top: '42%', left: '30%', title: 'Dual-Audience Magazine Split', desc: 'Immediate routing for Homeowners vs Service Technicians' },
      { top: '75%', left: '50%', title: 'Standardized Rate Cards', desc: 'Transparent starting prices with 90-day warranty guarantee' }
    ]
  },
  {
    id: 4,
    category: 'specs',
    title: 'Live Dispatcher & Partner Console',
    shortTag: '4. Live Dispatch',
    badge: 'Operations & Tracking',
    icon: '📡',
    image: '/project_image/4.png',
    headline: 'Real-Time Geolocation ETA Routing & Dispatch Queue',
    description: 'The real-time operational engine connecting active job requests with nearby certified technicians within a 5km radius. Displays live status progression (Assigned → En Route → In Progress → Completed) and secure 4-digit OTP job closing.',
    highlights: [
      { label: '📍 Live Geolocation Radius', detail: 'Precision technician dispatch based on GPS proximity and availability' },
      { label: '⏱️ 30-Min Arrival Countdown', detail: 'Live countdown timer and direct technician calling line' },
      { label: '🔐 4-Digit Job OTP Security', detail: 'Work is only marked complete when the customer verifies the OTP' },
      { label: '📊 Technician Earnings Console', detail: 'Live wallet balance, job history, and customer performance metrics' }
    ],
    ctaText: 'Open Partner Dispatch Console →',
    ctaAction: 'partnerConsole',
    specDetails: 'Resolution: Operations Blueprint • 782 KB • Live Telemetry',
    hotspots: [
      { top: '20%', left: '50%', title: 'Live Job Queue Stream', desc: 'Real-time incoming customer booking requests with instant accept' },
      { top: '50%', left: '35%', title: 'Active Booking Status Tracker', desc: 'Progressive status badges from Dispatch to OTP verification' },
      { top: '80%', left: '55%', title: 'Wallet & Payout Dashboard', desc: 'Real-time daily earnings summary with instant withdrawal' }
    ]
  },
  {
    id: 5,
    category: 'photos',
    title: 'Master Electrician: MCB & Board Service',
    shortTag: '5. MCB & Wiring',
    badge: 'Live Doorstep Fix',
    icon: '⚡',
    image: '/project_image/5.png',
    headline: 'Certified Electrical Diagnostics & Circuit Protection',
    description: 'Real-life doorstep repair by background-verified master electricians. Technicians diagnose tripping MCBs, replace overloaded circuit breakers, balance phase loads, and install surge protection with insulated 1000V rated safety tools.',
    highlights: [
      { label: '⚡ 1000V VDE Insulated Tools', detail: 'Strict electrical safety standard to eliminate shock & hazard risks' },
      { label: '🔍 Multi-Circuit Load Test', detail: 'Phase balance and leakage diagnosis to protect sensitive home appliances' },
      { label: '🛡️ 90-Day Repair Warranty', detail: 'Free rework coverage on all distribution board rewiring & replacements' },
      { label: '⏱️ 30-Min Fast Doorstep Arrival', detail: 'Instant emergency electrical dispatch across all certified hubs' }
    ],
    ctaText: 'Book Master Electrician Now →',
    ctaAction: 'exploreServices',
    specDetails: 'Resolution: High-Res Live Photography • 1.96 MB • Field Verified',
    hotspots: [
      { top: '35%', left: '78%', title: 'DIN Rail MCB Assembly', desc: 'Miniature circuit breaker wiring & thermal overload check' },
      { top: '48%', left: '72%', title: 'Insulated Safety Screwdriver', desc: '1000V tested equipment used for all high-voltage connections' },
      { top: '92%', left: '25%', title: 'Master Tool Belt Kit', desc: 'Dedicated digital multimeters, test leads, and wire strippers' }
    ]
  },
  {
    id: 6,
    category: 'photos',
    title: 'Master Plumber: Washbasin & Pipe Fix',
    shortTag: '6. Pipe & Sink Fix',
    badge: 'Live Doorstep Fix',
    icon: '🔧',
    image: '/project_image/6.png',
    headline: 'Precision Chrome Pipe Overhaul & Leak Waterproofing',
    description: 'Expert doorstep plumbing service handling persistent sink leaks, corroded trap assemblies, low pressure, and vanity drainage faults. Master plumbers replace damaged gaskets, align chrome traps, and conduct high-pressure watertight seal checks.',
    highlights: [
      { label: '🚰 Chrome P-Trap Overhaul', detail: 'Anti-clog chrome bottleneck and PVC trap replacements' },
      { label: '💧 High-Pressure Leak Test', detail: '10-minute continuous hydrostatic test to guarantee zero drip' },
      { label: '🛡️ Genuine Spares Guaranteed', detail: 'Standardized brass & CP fittings with manufacturer warranty' },
      { label: '🧹 Clean Workstation Promise', detail: 'Zero mess left behind with sanitary cleanup post-repair' }
    ],
    ctaText: 'Book Master Plumber Now →',
    ctaAction: 'exploreServices',
    specDetails: 'Resolution: High-Res Live Photography • 2.00 MB • Field Verified',
    hotspots: [
      { top: '48%', left: '72%', title: 'Precision Pipe Wrench', desc: 'Adjustable heavy-duty wrench for damage-free nut tightening' },
      { top: '56%', left: '85%', title: 'Chrome Bottle Trap', desc: 'Sanitary washbasin drainage trap aligned with silicone seal' },
      { top: '88%', left: '85%', title: 'Organizer Tool Caddy', desc: 'Full assortment of spanners, PTFE thread tape & spare gaskets' }
    ]
  },
  {
    id: 7,
    category: 'photos',
    title: 'Certified Electrician: Fixture Fitting',
    shortTag: '7. Light Fixtures',
    badge: 'Live Doorstep Fix',
    icon: '💡',
    image: '/project_image/7.png',
    headline: 'Designer Pendant & Overhead Fixture Installation',
    description: 'Safe, elevated electrical fixture mounting for chandeliers, smart pendant lights, recessed downlights, and ceiling fans. Verified pros utilize step-ladder safety protocols, insulated gloves, and laser-guided leveling.',
    highlights: [
      { label: '💡 Designer Light Fitting', detail: 'Careful handling of fragile glass, crystal & modern LED fixtures' },
      { label: '🪜 Heavy-Duty Ladder Protocol', detail: 'Non-slip rubberized step ladders compliant with height safety' },
      { label: '🧤 VDE Safety Gloves', detail: 'Anti-static insulated protective gear for live wire maneuvering' },
      { label: '🛡️ 90-Day Fitting Warranty', detail: 'Structural anchor and wiring stability guarantee for 90 days' }
    ],
    ctaText: 'Book Lighting Pro Now →',
    ctaAction: 'exploreServices',
    specDetails: 'Resolution: High-Res Live Photography • 1.78 MB • Field Verified',
    hotspots: [
      { top: '22%', left: '70%', title: 'LED Fixture Junction', desc: 'Secure ceiling rose mounting and heat-resistant terminal block' },
      { top: '32%', left: '68%', title: 'Insulated Safety Gloves', desc: 'High-dexterity electrical safety gloves protecting technician' },
      { top: '88%', left: '75%', title: 'Reinforced Step Ladder', desc: 'Stable non-slip platform for overhead precision work' }
    ]
  },
  {
    id: 8,
    category: 'photos',
    title: 'Master Plumber: Sanitation & Drainage',
    shortTag: '8. Sanitation Fix',
    badge: 'Live Doorstep Fix',
    icon: '🚽',
    image: '/project_image/8.png',
    headline: 'High-Power Toilet & Sanitary Drain Clearance',
    description: 'Professional unclogging and sanitation repair for commodes, floor drains, and sewer pipes. Master technicians deploy heavy-duty suction tools, motorized snake augers, and anti-bacterial flush treatments to restore 100% smooth flow.',
    highlights: [
      { label: '🚽 Heavy-Duty Suction Tool', detail: 'High-pressure seal plunger for instantaneous clog clearance' },
      { label: '🌊 Hydro-Flow Verification', detail: 'Multi-flush velocity check ensuring unobstructed drainage' },
      { label: '🧼 Anti-Bacterial Sanitization', detail: 'Complete chemical disinfection after clearing clogs' },
      { label: '🛡️ Fixed Rate Card', detail: 'Clear, transparent pricing with no surprise plumbing surcharges' }
    ],
    ctaText: 'Book Plumbing Clearance Now →',
    ctaAction: 'exploreServices',
    specDetails: 'Resolution: High-Res Live Photography • 1.91 MB • Field Verified',
    hotspots: [
      { top: '55%', left: '60%', title: 'Ergonomic Plunger Seal', desc: 'Heavy-duty hydraulic seal tool for toilet trap clearance' },
      { top: '70%', left: '68%', title: 'Ceramic Trap Alignment', desc: 'Wax ring seal and outlet alignment check to prevent odors' },
      { top: '80%', left: '8%', title: 'Sanitary Master Toolbox', desc: 'Equipped with drain snakes, pipe grips & replacement valves' }
    ]
  }
];

export default function ProjectVisualTourSection({ onNavigateToServices, onNavigateToPartner }) {
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'photos' | 'specs'
  const [activePillarId, setActivePillarId] = useState(1);
  const [activeLightboxImage, setActiveLightboxImage] = useState(null);
  const [activeHotspot, setActiveHotspot] = useState(null);

  const displayedPillars = activeCategory === 'all'
    ? visualPillars
    : visualPillars.filter(p => p.category === activeCategory);

  const activePillar = visualPillars.find(p => p.id === activePillarId) || displayedPillars[0] || visualPillars[0];

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    const matching = cat === 'all' ? visualPillars : visualPillars.filter(p => p.category === cat);
    if (matching.length > 0 && !matching.some(p => p.id === activePillarId)) {
      setActivePillarId(matching[0].id);
    }
    setActiveHotspot(null);
  };

  const handleAction = (pillar) => {
    if (pillar.ctaAction === 'exploreServices' && onNavigateToServices) {
      onNavigateToServices('all');
    } else if (pillar.ctaAction === 'partnerConsole' && onNavigateToPartner) {
      onNavigateToPartner();
    } else if (pillar.ctaLink) {
      window.location.href = pillar.ctaLink;
    }
  };

  return (
    <section className="nivaaro-visual-tour-section" id="visual-tour" aria-label="Platform Visual Blueprint & Field Tour">
      <div className="max-w-container">
        
        {/* Section Header */}
        <div className="tour-section-header">
          <div className="tour-eyebrow-badge">
            <span className="tour-pulse-dot" />
            <span>Interactive Visual Architecture & Field Photography</span>
          </div>

          <h2 className="tour-main-heading">
            See What NivaaroFix Does — Live Blueprints & Verified Field Repairs
          </h2>

          <p className="tour-sub-heading">
            Explore our end-to-end platform design blueprints and high-definition photography of certified master electricians & plumbers delivering doorstep repairs.
          </p>

          {/* Category Toggle Group */}
          <div className="tour-category-filters" role="group" aria-label="Filter visual gallery">
            <button
              type="button"
              className={`tour-filter-pill ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('all')}
            >
              All Assets (8)
            </button>
            <button
              type="button"
              className={`tour-filter-pill ${activeCategory === 'photos' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('photos')}
            >
              ⚡ Live Doorstep Repairs (4)
            </button>
            <button
              type="button"
              className={`tour-filter-pill ${activeCategory === 'specs' ? 'active' : ''}`}
              onClick={() => handleCategoryChange('specs')}
            >
              📐 Architecture Blueprints (4)
            </button>
          </div>
        </div>

        {/* Segmented Flow Navigation Pills */}
        <div className="tour-nav-tabs" role="tablist">
          {displayedPillars.map((pillar) => {
            const isActive = pillar.id === activePillarId;
            return (
              <button
                key={pillar.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tour-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActivePillarId(pillar.id);
                  setActiveHotspot(null);
                }}
              >
                <span className="tour-tab-icon">{pillar.icon}</span>
                <span className="tour-tab-text">{pillar.shortTag}</span>
                {isActive && <span className="tour-active-indicator" />}
              </button>
            );
          })}
        </div>

        {/* Active Pillar Presentation Showcase */}
        <div className="tour-showcase-panel">
          
          {/* Left Column: Descriptive Content & Feature Highlights */}
          <div className="tour-content-col">
            <div className="tour-pillar-badge">{activePillar.badge}</div>
            
            <h3 className="tour-pillar-headline">{activePillar.headline}</h3>
            
            <p className="tour-pillar-desc">{activePillar.description}</p>

            {/* 4 Feature Highlights Grid */}
            <div className="tour-highlights-grid">
              {activePillar.highlights.map((item, idx) => (
                <div key={idx} className="tour-highlight-card">
                  <div className="highlight-label">{item.label}</div>
                  <div className="highlight-detail">{item.detail}</div>
                </div>
              ))}
            </div>

            {/* Interactive Flow Trigger Button */}
            <div className="tour-cta-wrap">
              <button
                type="button"
                className="tour-primary-btn"
                onClick={() => handleAction(activePillar)}
              >
                <span>{activePillar.ctaText}</span>
              </button>

              <button
                type="button"
                className="tour-inspect-btn"
                onClick={() => setActiveLightboxImage(activePillar)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                <span>Inspect High-Res Blueprint</span>
              </button>
            </div>
          </div>

          {/* Right Column: High-Res Interactive Spec Frame with Hotspots */}
          <div className="tour-media-col">
            <div className="tour-spec-frame" onClick={() => setActiveLightboxImage(activePillar)}>
              
              {/* Image Container with Luxury Bevel & Tilt */}
              <div className="tour-spec-image-box">
                <img
                  src={activePillar.image}
                  alt={activePillar.title}
                  className="tour-spec-img"
                  loading="lazy"
                />

                {/* Interactive Hotspot Pins */}
                {activePillar.hotspots.map((spot, idx) => (
                  <div
                    key={idx}
                    className="tour-hotspot-pin"
                    style={{ top: spot.top, left: spot.left }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveHotspot(activeHotspot === idx ? null : idx);
                    }}
                    onMouseEnter={() => setActiveHotspot(idx)}
                    onMouseLeave={() => setActiveHotspot(null)}
                    title={spot.title}
                  >
                    <span className="hotspot-pulse" />
                    <span className="hotspot-dot">{idx + 1}</span>

                    {/* Hotspot Tooltip */}
                    {activeHotspot === idx && (
                      <div className="hotspot-tooltip" onClick={(e) => e.stopPropagation()}>
                        <div className="tooltip-title">{spot.title}</div>
                        <div className="tooltip-desc">{spot.desc}</div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Hover Click-to-Expand Overlay */}
                <div className="tour-spec-hover-hint">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 3h6v6" />
                    <path d="M9 21H3v-6" />
                    <path d="M21 3l-7 7" />
                    <path d="M3 21l7-7" />
                  </svg>
                  <span>Click to view full architecture</span>
                </div>
              </div>

              {/* Spec Metadata Footer */}
              <div className="tour-spec-meta-bar">
                <span className="meta-spec-tag">📐 {activePillar.specDetails}</span>
                <span className="meta-spec-action">Tap to zoom</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div 
          className="tour-lightbox-overlay"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div 
            className="tour-lightbox-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-top-bar">
              <div className="lightbox-info">
                <span className="lightbox-spec-badge">{activeLightboxImage.badge}</span>
                <h3 className="lightbox-spec-title">{activeLightboxImage.title}</h3>
              </div>

              <div className="lightbox-ctrls">
                <button
                  type="button"
                  className="lightbox-close-icon"
                  onClick={() => setActiveLightboxImage(null)}
                  aria-label="Close Lightbox"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="lightbox-image-viewport">
              <img
                src={activeLightboxImage.image}
                alt={activeLightboxImage.title}
                className="lightbox-full-img"
              />
            </div>

            <div className="lightbox-bottom-bar">
              <p>{activeLightboxImage.description}</p>
              <div className="lightbox-pill-nav">
                {visualPillars.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`nav-thumb ${activeLightboxImage.id === p.id ? 'active' : ''}`}
                    onClick={() => setActiveLightboxImage(p)}
                  >
                    <span>0{p.id}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
