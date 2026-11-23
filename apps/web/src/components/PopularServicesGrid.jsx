import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { allServicesList } from '../data/servicesCatalogData';

export default function PopularServicesGrid({ onSelectCategory, onExploreServices, currentUser = null, onOpenAuth = null }) {
  const { t } = useLanguage();
  const { openBookingFor, initiateProtectedBooking, openServiceDetail } = useBooking();

  const services = [
    {
      id: 'electrician',
      name: t.svcElectrician || 'Electrician',
      desc: t.svcElectricianDesc || 'MCB, wiring, switches & fans',
      price: 149,
      prosCount: 24,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    },
    {
      id: 'plumber',
      name: t.svcPlumber || 'Plumber',
      desc: t.svcPlumberDesc || 'Leaks, taps, sinks & pumps',
      price: 149,
      prosCount: 18,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      )
    }
  ];

  const handleCardClick = (svc) => {
    if (openServiceDetail) {
      openServiceDetail(svc.id, svc.name);
    } else if (onSelectCategory) {
      onSelectCategory(svc.id);
    } else if (onExploreServices) {
      onExploreServices(svc.id);
    }
  };

  return (
    <section className="nivaaro-popular-services-section" aria-label="Popular Services">
      <div className="max-w-container">
        
        <div className="editorial-section-header">
          <span className="editorial-eyebrow">
            {t.popularServicesEyebrow || 'Services Marketplace'}
          </span>
          <h2 className="editorial-serif-heading">
            {t.popularServicesTitle || 'Home services, handled by verified professionals.'}
          </h2>
        </div>

        <div className="popular-services-grid">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="popular-service-card"
              onClick={() => handleCardClick(svc)}
              role="button"
              tabIndex={0}
              aria-label={`${svc.name} - Starts at ₹${svc.price}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(svc);
                }
              }}
            >
              <div className="service-card-top-row">
                <div className="service-card-icon-badge">
                  {svc.icon}
                </div>
                <span className="service-rate-pill">
                  {t.fromPrice || 'From ₹'}{svc.price}
                </span>
              </div>

              <div className="service-card-main-content">
                <h3 className="service-card-title">{svc.name}</h3>
                <p className="service-card-desc">{svc.desc}</p>
              </div>

              <div className="service-card-bottom-row">
                <span className="service-hover-pros">
                  {svc.prosCount} {t.prosNearbyText || 'verified pros'}
                </span>
                <span className="service-card-arrow-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
