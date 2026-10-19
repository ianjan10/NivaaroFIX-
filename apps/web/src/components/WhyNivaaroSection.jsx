import React from 'react';

export default function WhyNivaaroSection() {
  const principles = [
    {
      num: '01',
      title: 'VERIFICATION',
      text: "Know who you're inviting into your home."
    },
    {
      num: '02',
      title: 'CLARITY',
      text: 'Understand the service before you commit.'
    },
    {
      num: '03',
      title: 'ACCOUNTABILITY',
      text: 'Keep a clear record from request to resolution.'
    }
  ];

  return (
    <section className="why-nivaaro-editorial-section" aria-label="Why NivaaroFix" style={{ padding: 'clamp(4.5rem, 7vw, 6rem) 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
      <div className="max-w-container">
        <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 3.5rem' }}>
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
            WHY NIVAAROFIX
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
              fontWeight: 600,
              color: '#0f172a',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              margin: 0
            }}
          >
            Good service starts with clear expectations.
          </h2>
        </div>

        {/* 3 Numbered Principles (Apple Feature Tile Cards) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem',
            maxWidth: '1060px',
            margin: '0 auto'
          }}
        >
          {principles.map((item) => (
            <div
              key={item.num}
              className="why-nivaaro-card"
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--brand-primary, #047857)',
                  letterSpacing: '-0.02em'
                }}
              >
                {item.num}
              </div>
              <h3
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#0f172a',
                  margin: 0
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontSize: '0.94rem',
                  color: '#64748b',
                  lineHeight: 1.6,
                  margin: 0
                }}
              >
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
