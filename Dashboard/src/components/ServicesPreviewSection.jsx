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
    <section className="services-preview-section" aria-label="Services Preview">
      <div className="max-w-container">
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
            SERVICES
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
            Start with what needs fixing.
          </h2>
        </div>

        {/* 2 Restrained Trade Cards */}
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
              style={{
                background: '#ffffff',
                border: '1px solid #ded7c8',
                borderRadius: '18px',
                padding: '2.25rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 4px 20px -2px rgba(16, 24, 32, 0.04)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-serif, "Fraunces", serif)',
                      fontSize: '1.65rem',
                      fontWeight: 600,
                      color: '#1e3a5f',
                      margin: 0
                    }}
                  >
                    {item.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleServiceClick(item.category)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#a9793c',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
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
                    color: '#5A6472',
                    lineHeight: 1.55,
                    margin: '0 0 1.5rem'
                  }}
                >
                  {item.description}
                </p>

                {/* Specific Problem Links */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.75rem' }}>
                  {item.problems.map((prob, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#1e3a5f',
                        background: '#faf8f4',
                        border: '1px solid #e8e2d5',
                        borderRadius: '6px',
                        padding: '0.3rem 0.65rem'
                      }}
                    >
                      {prob}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleServiceClick(item.category)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'none',
                    border: 'none',
                    color: '#1e3a5f',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
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
