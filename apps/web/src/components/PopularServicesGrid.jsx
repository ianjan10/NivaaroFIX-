import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { allServicesList } from '../data/servicesCatalogData';

export default function PopularServicesGrid({ onSelectCategory, onExploreServices }) {
  const { t } = useLanguage();
  const { openBookingFor } = useBooking();

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
    },
    {
      id: 'appliance',
      name: t.svcAcAppliance || 'AC & Appliance',
      desc: t.svcAcApplianceDesc || 'Service, gas refill & motor fix',
      price: 299,
      prosCount: 12,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="6" y1="8" x2="6.01" y2="8" />
          <line x1="10" y1="8" x2="10.01" y2="8" />
        </svg>
      )
    },
    {
      id: 'carpentry',
      name: t.svcCarpentry || 'Carpentry',
      desc: t.svcCarpentryDesc || 'Door locks, hinges & furniture',
      price: 199,
      prosCount: 9,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2l4 4-8.5 8.5-4-4L14 2z" />
          <path d="M3 21l3.5-3.5" />
          <path d="M18 10l3 3-3.5 3.5-3-3" />
        </svg>
      )
    },
    {
      id: 'painting',
      name: t.svcPainting || 'Painting',
      desc: t.svcPaintingDesc || 'Wall polish, primer & touchups',
      price: 499,
      prosCount: 7,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
          <path d="M9 8c-2 3-4 3.5-7 4l8 8c.5-3 1-5 4-7" />
          <path d="M14.5 17.5 4.5 7.5" />
        </svg>
      )
    },
    {
      id: 'pestcontrol',
      name: t.svcPestControl || 'Pest Control',
      desc: t.svcPestControlDesc || 'Termite, cockpit & hygiene',
      price: 399,
      prosCount: 15,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <path d="M12 22v-4" />
          <path d="m19.07 19.07-2.83-2.83" />
          <path d="M22 12h-4" />
          <path d="m19.07 4.93-2.83 2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      )
    }
  ];

  const handleCardClick = (svc) => {
    // Check if we have matching item in catalog
    const matching = allServicesList.find(s => s.categoryId === svc.id || s.category === svc.id);
    if (matching) {
      openBookingFor(matching);
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
