import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function FaqAccordionSection() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState(0); // Default open first FAQ item

  const faqs = [
    {
      q: t.faq1Q || 'How fast can a technician arrive at my doorstep?',
      a: t.faq1A || 'Our intelligent sector dispatch assigns the closest background-verified master technician in your neighborhood. Average arrival time is 30 to 45 minutes for urgent bookings.'
    },
    {
      q: t.faq2Q || 'How does the 90-day warranty protection work?',
      a: t.faq2A || 'Every completed repair comes with an unconditional 90-day service warranty. If the exact same issue recurs within 90 days, our certified pro returns and fixes it at zero extra cost.'
    },
    {
      q: t.faq3Q || 'Are all NivaaroFix technicians background-checked?',
      a: t.faq3A || 'Yes, 100%. Every professional undergoes mandatory government ID and police verification, trade skill examinations, and continuous quality audits before taking doorstep jobs.'
    },
    {
      q: t.faq4Q || 'What if I need to cancel or reschedule my booking?',
      a: t.faq4A || 'You can reschedule or cancel for free anytime before the technician arrives at your door via your customer portal or by calling our 24/7 helpline.'
    },
    {
      q: t.faq5Q || 'How is pricing calculated and when do I pay?',
      a: t.faq5A || 'You receive an upfront standardized digital rate card with itemized labor and parts. You only pay securely after the job is completed and inspected to your satisfaction.'
    }
  ];

  const handleToggle = (idx) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="nivaaro-faq-section" aria-label="Frequently Asked Questions">
      <div className="max-w-container">
        
        <div className="editorial-section-header">
          <span className="editorial-eyebrow">
            {t.faqEyebrow || 'Common questions'}
          </span>
          <h2 className="editorial-serif-heading">
            {t.faqTitle || 'Frequently Asked Questions'}
          </h2>
        </div>

        <div className="faq-accordion-list">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className={`faq-accordion-item ${isOpen ? 'is-expanded' : ''}`}
              >
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => handleToggle(idx)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${idx}`}
                  id={`faq-btn-${idx}`}
                >
                  <span className="faq-question-text">{faq.q}</span>
                  <span className="faq-icon-rotator" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" className="faq-line-vertical" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </button>

                <div
                  id={`faq-answer-${idx}`}
                  className="faq-answer-collapse"
                  role="region"
                  aria-labelledby={`faq-btn-${idx}`}
                  hidden={!isOpen}
                >
                  <div className="faq-answer-inner">
                    <p>{faq.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
