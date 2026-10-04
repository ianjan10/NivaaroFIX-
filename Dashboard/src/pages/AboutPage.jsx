import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import AboutClosingStatement from '../components/AboutClosingStatement';

export default function AboutPage({ onNavigateToServices }) {
  const { activeLanguage } = useLanguage();

  const principlesList = [
    {
      num: '01',
      title: 'Verification',
      quote: 'Professionals should earn trust before they earn a booking.',
      desc: 'Mandatory government ID verification, strict trade skill checks, and background vetting before any professional takes on doorstep repairs.'
    },
    {
      num: '02',
      title: 'Clarity',
      quote: 'Customers should understand what they are booking and what it will cost.',
      desc: 'Standardized upfront rate cards with clear work scope. No guesswork, no sudden price surges, and no hidden diagnostic fees.'
    },
    {
      num: '03',
      title: 'Responsiveness',
      quote: 'Finding help should feel simple, local, and straightforward.',
      desc: 'Intuitive problem-based discovery connecting homeowners directly with vetted technicians in their immediate neighborhood.'
    },
    {
      num: '04',
      title: 'Accountability',
      quote: 'A completed repair should not feel like the end of the relationship.',
      desc: 'Every completed fix is backed by an unconditional 30-day rework warranty and direct customer support for peace of mind.'
    }
  ];

  const journeySteps = [
    {
      num: '01',
      title: "Tell us what's wrong",
      desc: 'Describe the issue naturally or pick a common repair from our catalog.'
    },
    {
      num: '02',
      title: 'Find the right professional',
      desc: 'Get matched with vetted, qualified local technicians equipped for the job.'
    },
    {
      num: '03',
      title: 'Understand the service',
      desc: 'Review transparent standardized pricing and clear warranty coverage upfront.'
    },
    {
      num: '04',
      title: 'Book with confidence',
      desc: 'Schedule doorstep arrival with verified tracking and 30-day warranty protection.'
    }
  ];

  return (
    <div className="about-page-wrapper" role="main">
      <div className="max-w-container">
        
        {/* 1. Editorial Hero Section (Confident Brand Manifesto) */}
        <header className="about-hero-section">
          <div className="about-eyebrow">
            ABOUT NIVAAROFIX
          </div>

          <h1 className="about-hero-headline">
            Better home repairs<br className="about-break-desktop" /> start with better trust.
          </h1>

          <p className="about-hero-lead">
            NivaaroFix exists to make finding dependable home-service professionals simpler, clearer, and more trustworthy.
          </p>

          <p className="about-hero-sublead">
            We connect customers with skilled electricians and plumbers, creating a better way to discover, understand, and book local help.
          </p>
        </header>

        {/* 2. Section: Why We're Building This */}
        <section className="about-story-section" aria-labelledby="why-heading">
          <div className="about-story-grid">
            <div className="story-content-col">
              <div className="section-mini-eyebrow">THE MOTIVATION</div>
              <h2 id="why-heading" className="story-heading">
                Home repairs shouldn't require guesswork.
              </h2>
              <p className="story-text">
                When something breaks, people should not have to spend hours searching through uncertain listings, chasing calls, or wondering whether a quoted price is reasonable.
              </p>
              <p className="story-text">
                NivaaroFix is designed around a simpler experience: describe the problem, find the right professional, understand the service, and book with confidence.
              </p>
            </div>

            <div className="story-image-col">
              <div className="story-image-wrap">
                <img
                  src="/project_image/5.png"
                  alt="Certified technician methodically inspecting a residential electrical installation"
                  className="story-img"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 3. Section: The NivaaroFix Standard (Four Principles) */}
        <section className="about-principles-section" aria-labelledby="principles-heading">
          <div className="section-center-header">
            <div className="section-mini-eyebrow">THE NIVAAROFIX STANDARD</div>
            <h2 id="principles-heading" className="principles-main-heading">
              What we're building around.
            </h2>
            <p className="principles-sub-desc">
              Four fundamental principles that guide every feature, policy, and workflow we build.
            </p>
          </div>

          <div className="principles-grid">
            {principlesList.map((item) => (
              <div key={item.num} className="principle-card" tabIndex={0}>
                <div className="principle-num" aria-hidden="true">{item.num}</div>
                <h3 className="principle-title">{item.title}</h3>
                <div className="principle-line" aria-hidden="true" />
                <p className="principle-quote">"{item.quote}"</p>
                <p className="principle-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Section: How It Should Work (Journey Visual) */}
        <section className="about-journey-section" aria-labelledby="journey-heading">
          <div className="section-center-header">
            <div className="section-mini-eyebrow">THE EXPERIENCE</div>
            <h2 id="journey-heading" className="journey-main-heading">
              How home repairs should work.
            </h2>
            <p className="journey-sub-desc">
              A straightforward process from identifying an issue to having it expertly resolved.
            </p>
          </div>

          <div className="journey-grid">
            {journeySteps.map((step, idx) => (
              <div key={step.num} className="journey-card">
                <div className="journey-step-header">
                  <span className="journey-step-num">{step.num}</span>
                  {idx < journeySteps.length - 1 && (
                    <span className="journey-step-connector" aria-hidden="true" />
                  )}
                </div>
                <h3 className="journey-step-title">{step.title}</h3>
                <p className="journey-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Section: Where We Start (Refined 2-Panel Service Showcase) */}
        <section className="about-services-start-section" aria-labelledby="where-we-start-heading">
          <div className="services-start-header-wrap">
            <span className="section-mini-eyebrow">WHERE WE START</span>
            <h2 id="where-we-start-heading" className="services-start-main-heading">
              Trusted help for the work your home needs.
            </h2>
            <p className="services-start-lead-text">
              NivaaroFix connects customers with skilled professionals for essential home repairs.
            </p>
          </div>

          <div className="services-start-panels-grid">
            {/* 01: Electrical Services */}
            <div
              className="service-start-panel"
              onClick={() => onNavigateToServices && onNavigateToServices('electrician')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigateToServices && onNavigateToServices('electrician');
                }
              }}
            >
              <div className="panel-num-tag">01</div>
              <div className="panel-category-label">ELECTRICAL SERVICES</div>
              <h3 className="panel-service-title">Electrician</h3>
              <p className="panel-service-desc">
                Electrical faults, installations, diagnostics and everyday residential repairs.
              </p>
              <div className="panel-common-issues">
                <span>MCB & Fuse</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span>Switchboard</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span>Wiring</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span className="issues-more-link">
                  <span>More</span>
                  <span className="panel-arrow-shift" aria-hidden="true">→</span>
                </span>
              </div>
            </div>

            {/* 02: Plumbing Services */}
            <div
              className="service-start-panel"
              onClick={() => onNavigateToServices && onNavigateToServices('plumber')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigateToServices && onNavigateToServices('plumber');
                }
              }}
            >
              <div className="panel-num-tag">02</div>
              <div className="panel-category-label">PLUMBING SERVICES</div>
              <h3 className="panel-service-title">Plumber</h3>
              <p className="panel-service-desc">
                Plumbing repairs and maintenance for everyday problems around the home.
              </p>
              <div className="panel-common-issues">
                <span>Tap & Mixer</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span>Drain Blockage</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span>Pipe Leaks</span>
                <span className="issues-dot" aria-hidden="true">·</span>
                <span className="issues-more-link">
                  <span>More</span>
                  <span className="panel-arrow-shift" aria-hidden="true">→</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Section: Editorial Brand Closing Manifesto */}
        <AboutClosingStatement
          onNavigateToServices={onNavigateToServices}
          activeLanguage={activeLanguage}
        />

      </div>
    </div>
  );
}
