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
    <section className="why-nivaaro-editorial-section" aria-label="Why NivaaroFix">
      <div className="max-w-container">
        <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 3.5rem' }}>
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
            WHY NIVAAROFIX
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
            Good service starts with clear expectations.
          </h2>
        </div>

        {/* 3 Numbered Principles */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2.5rem',
            maxWidth: '1060px',
            margin: '0 auto'
          }}
        >
          {principles.map((item) => (
            <div
              key={item.num}
              style={{
                borderTop: '1.5px solid #ded7c8',
                paddingTop: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-serif, "Fraunces", serif)',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#a9793c'
                }}
              >
                {item.num}
              </div>
              <h3
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#1e3a5f',
                  margin: 0
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontSize: '0.94rem',
                  color: '#5A6472',
                  lineHeight: 1.55,
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
