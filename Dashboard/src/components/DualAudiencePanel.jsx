import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import homeownerImg from '../assets/images/homeowner-dual.jpg';
import technicianImg from '../assets/images/technician-dual.jpg';

export default function DualAudiencePanel({ onNavigateToCustomer, onNavigateToPartner }) {
  const { t, activeLanguage } = useLanguage();
  const [hoveredPanel, setHoveredPanel] = useState(null); // 'homeowner' | 'partner' | null

  const handleCustomerClick = () => {
    if (onNavigateToCustomer) {
      onNavigateToCustomer('all');
    }
  };

  const handlePartnerClick = () => {
    if (onNavigateToPartner) {
      onNavigateToPartner();
    } else {
      window.location.href = `http://localhost:5500?role=agent&mode=signup&lang=${activeLanguage || 'en'}`;
    }
  };

  return (
    <section className="dual-audience-section" aria-label="Audience Selector">
      <div className="max-w-container">
        <div className={`dual-audience-grid ${hoveredPanel ? `hovered-${hoveredPanel}` : ''}`}>
          
          {/* Left Panel: Homeowners */}
          <div
            className={`audience-panel-card audience-panel-customer ${hoveredPanel === 'partner' ? 'is-dimmed' : ''}`}
            onClick={handleCustomerClick}
            onMouseEnter={() => setHoveredPanel('homeowner')}
            onMouseLeave={() => setHoveredPanel(null)}
            role="button"
            tabIndex={0}
            aria-label="For homeowners - Book a verified pro in minutes"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCustomerClick();
              }
            }}
          >
            <img
              src={homeownerImg}
              alt="Homeowner booking repair service"
              className="audience-bg-photo"
              loading="lazy"
            />
            <div className="audience-scrim-overlay" />
            <div className="audience-color-grade-wash" aria-hidden="true" />

            <div className="audience-card-content">
              <span className="audience-eyebrow-chip">
                {t.dualAudienceHomeEyebrow || 'For homeowners'}
              </span>
              <h2 className="audience-headline">
                {t.dualAudienceHomeTitle || 'Need something fixed?'}
              </h2>
              <p className="audience-subhead">
                {t.dualAudienceHomeSub || 'Book a verified pro in minutes'}
              </p>
              <div className="audience-action-row">
                <span className="audience-link-arrow">
                  {t.dualAudienceHomeCta || 'Book a Verified Pro →'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel: Professionals */}
          <div
            className={`audience-panel-card audience-panel-partner ${hoveredPanel === 'homeowner' ? 'is-dimmed' : ''}`}
            onClick={handlePartnerClick}
            onMouseEnter={() => setHoveredPanel('partner')}
            onMouseLeave={() => setHoveredPanel(null)}
            role="button"
            tabIndex={0}
            aria-label="For professionals - Join as a certified professional"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePartnerClick();
              }
            }}
          >
            <img
              src={technicianImg}
              alt="Professional technician at work"
              className="audience-bg-photo"
              loading="lazy"
            />
            <div className="audience-scrim-overlay audience-partner-scrim" />
            <div className="audience-color-grade-wash audience-partner-wash" aria-hidden="true" />

            <div className="audience-card-content">
              <span className="audience-eyebrow-chip audience-partner-chip">
                {t.dualAudiencePartnerEyebrow || 'For professionals'}
              </span>
              <h2 className="audience-headline">
                {t.dualAudiencePartnerTitle || 'Ready to do the fixing?'}
              </h2>
              <p className="audience-subhead">
                {t.dualAudiencePartnerSub || 'Join as a certified professional'}
              </p>
              <div className="audience-action-row">
                <span className="audience-link-arrow audience-partner-link">
                  {t.dualAudiencePartnerCta || 'Register as Professional →'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
