import React from 'react';

export default function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: "Tell us what's wrong.",
      desc: 'Describe the issue in a few words and attach a photo if helpful.'
    },
    {
      num: '02',
      title: 'Find the right service.',
      desc: 'We match the problem to the exact trade and scope required.'
    },
    {
      num: '03',
      title: "Book when you're ready.",
      desc: 'Choose an arrival time and track the visit with complete clarity.'
    }
  ];

  return (
    <section className="nivaaro-how-it-works-section" aria-label="How It Works" style={{ padding: 'clamp(4.5rem, 7vw, 6rem) 0', borderTop: '1px solid #f1f5f9' }}>
      <div className="max-w-container">
        {/* Section Header */}
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
            HOW IT WORKS
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
            From problem to professional.
          </h2>
        </div>

        {/* 3 Step Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem',
            maxWidth: '1060px',
            margin: '0 auto'
          }}
        >
          {steps.map((s) => (
            <div
              key={s.num}
              className="how-step-card nivaaro-card"
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--brand-primary, #047857)',
                  marginBottom: '0.85rem',
                  letterSpacing: '-0.02em'
                }}
              >
                {s.num}
              </div>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #0f172a)',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.3
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary, #64748b)',
                  lineHeight: 1.55,
                  margin: 0
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
