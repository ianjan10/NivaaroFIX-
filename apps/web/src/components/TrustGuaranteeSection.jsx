import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function TrustGuaranteeSection() {
  const { t } = useLanguage();

  const callouts = [
    {
      title: 'Verified Professionals',
      desc: 'Rigorous multi-point identity verification, police background checks, and trade skill certifications for every technician.',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B8862F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      )
    },
    {
      title: 'Transparent Pricing',
      desc: 'Fixed rate cards and upfront digital estimates before any work begins. No unexpected call-out charges or surprises.',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B8862F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    },
    {
      title: 'Fast Local Response',
      desc: 'Real-time proximity matching with certified technicians stationed across your city for prompt 30-45 minute arrivals.',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B8862F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    },
    {
      title: '90-Day Service Warranty',
      desc: 'Every repair is backed by our full 90-day peace-of-mind guarantee. If any issue reoccurs, we re-service it free.',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B8862F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    }
  ];

  return (
    <section className="nivaaro-why-section" aria-label="Why NivaaroFix">
      <div className="max-w-container">
        
        <div className="editorial-section-header">
          <span className="editorial-eyebrow">
            {t.whyEyebrow || 'Why NivaaroFix'}
          </span>
          <h2 className="editorial-serif-heading">
            {t.whyTitle || 'Reliable help, without the uncertainty.'}
          </h2>
        </div>

        <div className="why-features-grid">
          {callouts.map((item, idx) => (
            <div key={idx} className="why-feature-card">
              <div className="why-icon-badge">
                {item.icon}
              </div>
              <h3 className="why-feature-title">{item.title}</h3>
              <p className="why-feature-desc">{item.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
