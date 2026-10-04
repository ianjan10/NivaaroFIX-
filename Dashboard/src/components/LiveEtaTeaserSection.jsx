import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LiveEtaTeaserSection({ onExploreServices }) {
  const { t } = useLanguage();

  return (
    <section className="live-eta-section" aria-label="Live Express ETA Dispatch">
      <div className="max-w-container">
        <div className="live-eta-card">
          <div className="live-eta-grid">
            
            {/* Left Content Column */}
            <div className="live-eta-info-col">
              <div className="live-eta-badge">
                <span className="live-eta-pulse-dot" aria-hidden="true" />
                <span>{t.liveEtaBadge || '30–45 Min Live Doorstep Dispatch'}</span>
              </div>

              <h2 className="live-eta-title">
                {t.liveEtaTitle || 'Track Your Verified Pro in Real Time.'}
              </h2>

              <p className="live-eta-desc">
                {t.liveEtaDesc || 'From the moment you confirm, our intelligent dispatch assigns the nearest police-verified electrician or plumber with live ETA and door OTP security.'}
              </p>

              <div className="live-eta-stats-row">
                <div className="eta-stat-item">
                  <span className="eta-stat-val">30–45m</span>
                  <span className="eta-stat-lbl">{t.liveEtaAvgResponse || 'Average Response'}</span>
                </div>
                <div className="eta-stat-divider" aria-hidden="true" />
                <div className="eta-stat-item">
                  <span className="eta-stat-val">100%</span>
                  <span className="eta-stat-lbl">{t.liveEtaBgChecked || 'Background Checked'}</span>
                </div>
                <div className="eta-stat-divider" aria-hidden="true" />
                <div className="eta-stat-item">
                  <span className="eta-stat-val">90 Days</span>
                  <span className="eta-stat-lbl">{t.liveEtaWarranty || 'Service Warranty'}</span>
                </div>
              </div>
            </div>

            {/* Right Interactive Signature Motion Visual */}
            <div className="live-eta-visual-col">
              <div className="live-eta-route-container" role="img" aria-label="Technician en route to doorstep">
                
                {/* Route Header Status Bar */}
                <div className="route-status-bar">
                  <div className="route-tech-profile">
                    <div className="route-tech-avatar">RK</div>
                    <div>
                      <div className="route-tech-name">{t.liveEtaTechStatus || 'Ramesh Kumar (Master Wireman)'}</div>
                      <div className="route-tech-badge">{t.liveEtaTechRating || '★ 4.94 (1,280 repairs) • En Route'}</div>
                    </div>
                  </div>
                  <div className="route-eta-pill">
                    <span className="eta-pill-time">{t.liveEtaMins || '28 mins'}</span>
                  </div>
                </div>

                {/* The Signature Motion Track: Pro moving along route line to house pin */}
                <div className="route-track-canvas">
                  <svg className="route-track-svg" viewBox="0 0 420 120" fill="none" preserveAspectRatio="none">
                    <path
                      d="M 40 60 C 120 20, 200 100, 370 60"
                      stroke="#e2ded4"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <path
                      className="route-active-line"
                      d="M 40 60 C 120 20, 200 100, 370 60"
                      stroke="#0f4d3c"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Start Point Pin (Dispatch Hub) */}
                  <div className="route-pin pin-start" title="Sector Dispatch Hub">
                    <div className="pin-dot-inner" />
                    <span className="pin-label">{t.liveEtaSectorHub || 'Sector Hub'}</span>
                  </div>

                  {/* Animated Signature Motion Pro Marker */}
                  <div className="route-pro-marker-animated" title="Active Technician en route">
                    <div className="pro-marker-bubble">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                    <div className="pro-marker-shadow" />
                  </div>

                  {/* End Destination Pin (Customer Doorstep) */}
                  <div className="route-pin pin-dest" title="Your Doorstep">
                    <div className="pin-dest-bubble">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#101820" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </div>
                    <span className="pin-label">{t.liveEtaYourDoor || 'Your Door'}</span>
                  </div>
                </div>

                {/* Safety OTP Footer */}
                <div className="route-security-footer">
                  <div className="security-otp-text">
                    <span className="shield-icon">🛡️</span>
                    <span>{t.liveEtaOtpText || 'Door OTP Security: 4892'}</span>
                  </div>
                  <span className="security-guarantee-tag">{t.liveEtaProtected || '90-Day Warranty Protected'}</span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
