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
    <section className="nivaaro-how-it-works-section" aria-label="How It Works">
      <div className="max-w-container">
        {/* Section Header */}
        <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 3rem' }}>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#a9793c',
              marginBottom: '0.65rem'
            }}
          >
            HOW IT WORKS
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-serif, "Fraunces", serif)',
              fontSize: 'clamp(1.85rem, 3.2vw, 2.5rem)',
              fontWeight: 500,
              color: '#1e3a5f',
              lineHeight: 1.2,
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
              style={{
                background: '#ffffff',
                border: '1px solid #ded7c8',
                borderRadius: '16px',
                padding: '2rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(16, 24, 32, 0.03)'
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-serif, "Fraunces", serif)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#a9793c',
                  marginBottom: '0.75rem'
                }}
              >
                {s.num}
              </div>
              <h3
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: '#1e3a5f',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.3
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#5A6472',
                  lineHeight: 1.5,
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
