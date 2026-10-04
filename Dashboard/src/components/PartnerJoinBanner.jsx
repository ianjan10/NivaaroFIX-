import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function PartnerJoinBanner({ onSwitchToPartner }) {
  const { t, activeLanguage } = useLanguage();

  const handlePartnerClick = () => {
    window.location.href = `http://localhost:5500?portal=agent&lang=${activeLanguage || 'en'}`;
  };

  return (
    <section className="partner-banner-section">
      <div className="max-w-container">
        <div className="partner-banner-card">
          <div className="partner-banner-text">
            <span className="partner-banner-badge">{t.partnerBannerBadge || '★ Professional Network'}</span>
            <h2 className="partner-banner-title">
              {t.partnerBannerTitle}
            </h2>
            <p className="partner-banner-desc">
              {t.partnerBannerDesc}
            </p>
          </div>

          <button
            type="button"
            className="btn-partner-cta"
            onClick={handlePartnerClick}
          >
            <span>{t.partnerBannerBtn}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
