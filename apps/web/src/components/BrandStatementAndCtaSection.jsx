import React from 'react';

export default function BrandStatementAndCtaSection({ onNavigateToServices }) {
  const handleClick = () => {
    if (onNavigateToServices) {
      onNavigateToServices('all');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <section className="brand-statement-cta-section" aria-label="Closing Brand Statement and Call to Action">
      <div className="max-w-container">
        {/* 1. Quiet Brand Statement */}
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem 3rem', borderBottom: '1px solid #ded7c8' }}>
          <p
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(1.75rem, 3.2vw, 2.45rem)',
              fontWeight: 500,
              fontStyle: 'italic',
              color: '#1e3a5f',
              lineHeight: 1.25,
              maxWidth: '680px',
              margin: '0 auto'
            }}
          >
            "Home repairs, handled with confidence."
          </p>
        </div>

        {/* 2. Quiet Editorial Final CTA */}
        <div style={{ textAlign: 'center', padding: '4rem 1rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#a9793c',
              marginBottom: '0.5rem'
            }}
          >
            NOT SURE WHERE TO START?
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(1.6rem, 2.5vw, 2rem)',
              fontWeight: 600,
              color: '#1e3a5f',
              margin: '0 0 1.5rem',
              lineHeight: 1.25
            }}
          >
            Tell us what's wrong.
          </h3>
          <button
            type="button"
            onClick={handleClick}
            className="btn-book-service-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.9rem 1.85rem',
              fontSize: '0.95rem'
            }}
          >
            <span>Tell us what's wrong</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
