import React from 'react';

/**
 * AboutClosingStatement
 * A sophisticated editorial closing statement and brand manifesto for the NivaaroFix About page.
 * Replaces generic SaaS CTA cards with a clean, confident, magazine-style layout.
 */
export default function AboutClosingStatement({ onNavigateToServices, activeLanguage = 'en' }) {
  const handleRegisterPartner = () => {
    window.location.href = `http://localhost:5500?portal=agent&lang=${activeLanguage}`;
  };

  return (
    <section className="about-closing-statement" aria-labelledby="closing-manifesto-heading">
      <div className="closing-content-wrapper">
        
        <div className="closing-main-col">
          <div className="closing-eyebrow">
            THE NIVAAROFIX WAY
          </div>

          <h2 id="closing-manifesto-heading" className="closing-headline">
            Home repairs,<br />handled differently.
          </h2>

          <p className="closing-supporting">
            Less uncertainty. Better professionals. Clearer service.<br className="closing-break-desktop" />
            A simpler way to get the help your home needs.
          </p>

          <p className="closing-signature">
            Find the right help. Know what to expect.{' '}
            <span className="closing-gold-accent">Feel confident choosing.</span>
          </p>

          <div className="closing-actions-wrap">
            <button
              type="button"
              className="closing-explore-link"
              onClick={() => onNavigateToServices && onNavigateToServices('all')}
              aria-label="Explore NivaaroFix Services"
            >
              <span className="closing-link-text">Explore NivaaroFix</span>
              <span className="closing-link-arrow" aria-hidden="true">→</span>
            </button>
          </div>

          <div className="closing-pro-sublink">
            <span className="pro-sublink-label">For skilled professionals → </span>
            <button
              type="button"
              className="pro-sublink-btn"
              onClick={handleRegisterPartner}
            >
              Join NivaaroFix
            </button>
          </div>
        </div>

        {/* Editorial Magazine Typographic Element */}
        <div className="closing-editorial-col" aria-hidden="true">
          <div className="closing-watermark-text">
            <span>TRUST</span>
            <span>BEFORE</span>
            <span>THE FIX.</span>
          </div>
        </div>

      </div>
    </section>
  );
}
