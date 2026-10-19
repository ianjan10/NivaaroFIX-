import React from 'react';

export default function ServicesPreviewSection({ onSelectCategory, onExploreServices }) {
  const services = [
    {
      id: 'electrician',
      category: 'electrician',
      title: 'Electrician',
      description: 'Switchboards, MCB distribution, wiring faults, lighting, and safety checks.',
      problems: ['Switchboard repair', 'MCB diagnostics', 'Light & fan fitting', 'Inverter wiring']
    },
    {
      id: 'plumber',
      category: 'plumber',
      title: 'Plumber',
      description: 'Tap leaks, cartridge replacement, pipe drainage, blockages, and bathroom fittings.',
      problems: ['Tap leak repair', 'Pipe leak fix', 'Drain clearing', 'Sanitary overhaul']
    }
  ];

  const handleServiceClick = (category) => {
    if (onSelectCategory) {
      onSelectCategory(category);
    } else if (onExploreServices) {
      onExploreServices(category);
    }
  };

  return (
    <section className="services-preview-section" aria-label="Services Preview" style={{ padding: 'clamp(4rem, 6vw, 5.5rem) 0' }}>
      <div className="max-w-container">
        <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 3rem' }}>
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
            SERVICES
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
            Start with what needs fixing.
          </h2>
        </div>

        {/* 2 Restrained Trade Cards (Apple Bento Style) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2rem',
            maxWidth: '960px',
            margin: '0 auto'
          }}
        >
          {services.map((item) => (
            <div
              key={item.id}
              className="services-preview-card"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-serif, "Fraunces", serif)',
                      fontSize: '1.65rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      letterSpacing: '-0.02em',
                      margin: 0
                    }}
                  >
                    {item.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleServiceClick(item.category)}
                    style={{
                      background: '#f5f5f7',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      color: 'var(--brand-primary, #047857)',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    aria-label={`Explore ${item.title} services`}
                  >
                    →
                  </button>
                </div>

                <p
                  style={{
                    fontSize: '0.92rem',
                    color: '#64748b',
                    lineHeight: 1.55,
                    margin: '0 0 1.35rem'
                  }}
                >
                  {item.description}
                </p>

                {/* Specific Problem Links (Apple Pill Chips) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '1.75rem' }}>
                  {item.problems.map((prob, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: '#1d1d1f',
                        background: '#f5f5f7',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                        borderRadius: '980px',
                        padding: '0.28rem 0.75rem'
                      }}
                    >
                      {prob}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ paddingTop: '1.1rem', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => handleServiceClick(item.category)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'transparent',
                    border: '1px solid var(--brand-primary, #047857)',
                    borderRadius: '980px',
                    color: 'var(--brand-primary, #047857)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0.42rem 1.15rem',
                    transition: 'all 0.16s ease'
                  }}
                >
                  <span>Explore {item.title} Services</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
