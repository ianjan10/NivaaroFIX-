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
        <div style={{ textAlign: 'center', padding: '4.5rem 1rem 3.5rem', borderBottom: '1px solid #f1f5f9' }}>
          <p
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(1.85rem, 3.5vw, 2.6rem)',
              fontWeight: 500,
              fontStyle: 'italic',
              color: '#0f172a',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              maxWidth: '700px',
              margin: '0 auto'
            }}
          >
            "Home repairs, handled with confidence."
          </p>
        </div>

        {/* 2. Quiet Editorial Final CTA */}
        <div style={{ textAlign: 'center', padding: '4.5rem 1rem 3.5rem', maxWidth: '600px', margin: '0 auto' }}>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--brand-primary, #047857)',
              marginBottom: '0.75rem'
            }}
          >
            NOT SURE WHERE TO START?
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(1.75rem, 2.8vw, 2.25rem)',
              fontWeight: 600,
              color: '#0f172a',
              letterSpacing: '-0.02em',
              margin: '0 0 1.5rem',
              lineHeight: 1.2
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
              padding: '0.85rem 2.25rem',
              fontSize: '0.94rem',
              fontWeight: 600,
              borderRadius: '980px',
              background: 'var(--brand-primary, #047857)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
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
