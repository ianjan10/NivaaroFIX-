import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import AnimatedStatNumber from './AnimatedStatNumber';

export default function TrustStrip() {
  const { t } = useLanguage();

  return (
    <section className="nivaaro-trust-strip" aria-label="Trust Metrics">
      <div className="max-w-container">
        <div className="trust-strip-flex">
          
          {/* Stat 1: 12,000+ verified pros */}
          <div className="trust-strip-item">
            <div className="trust-stat-number">
              <AnimatedStatNumber endValue={12000} suffix="+" />
            </div>
            <div className="trust-stat-label">
              {t.trustStripStat1Label || 'verified pros'}
            </div>
          </div>

          <div className="trust-hairline-divider" aria-hidden="true" />

          {/* Stat 2: 50,000+ repairs completed */}
          <div className="trust-strip-item">
            <div className="trust-stat-number">
              <AnimatedStatNumber endValue={50000} suffix="+" />
            </div>
            <div className="trust-stat-label">
              {t.trustStripStat2Label || 'repairs completed'}
            </div>
          </div>

          <div className="trust-hairline-divider" aria-hidden="true" />

          {/* Stat 3: 4.8/5 average rating */}
          <div className="trust-strip-item">
            <div className="trust-stat-number">
              <AnimatedStatNumber endValue={4.8} decimals={1} suffix="/5" />
            </div>
            <div className="trust-stat-label">
              {t.trustStripStat3Label || 'average rating'}
            </div>
          </div>

          <div className="trust-hairline-divider" aria-hidden="true" />

          {/* Stat 4: 30 cities */}
          <div className="trust-strip-item">
            <div className="trust-stat-number">
              <AnimatedStatNumber endValue={30} />
            </div>
            <div className="trust-stat-label">
              {t.trustStripStat4Label || 'cities across India'}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
