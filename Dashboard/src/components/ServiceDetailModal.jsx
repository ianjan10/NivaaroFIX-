import React, { useEffect } from 'react';
import { useBooking } from '../context/BookingContext';

export default function ServiceDetailModal({ currentUser, currentAgent, onOpenAuth, onAgentBlocked }) {
  const {
    isDetailModalOpen,
    activeServiceDetail,
    closeServiceDetail,
    initiateProtectedBooking
  } = useBooking();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isDetailModalOpen) {
        closeServiceDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailModalOpen, closeServiceDetail]);

  if (!isDetailModalOpen || !activeServiceDetail) return null;

  const handleBookClick = () => {
    initiateProtectedBooking({
      service: activeServiceDetail.slug || activeServiceDetail.categoryId,
      currentUser,
      currentAgent,
      onOpenAuth,
      onAgentBlocked
    });
  };

  const isElectrician = (activeServiceDetail.slug || activeServiceDetail.categoryId) === 'electrician';
  const ctaLabel = isElectrician ? 'Book an Electrician →' : 'Book a Plumber →';

  return (
    <div
      className="service-detail-backdrop open"
      onClick={closeServiceDetail}
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
    >
      <div
        className="service-detail-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="service-detail-header">
          <div className="service-detail-meta">
            <span className="service-detail-category">
              {activeServiceDetail.category || (isElectrician ? 'ELECTRICAL SERVICES' : 'PLUMBING SERVICES')}
            </span>
            <h2 id="service-detail-title" className="service-detail-title">
              {activeServiceDetail.title}
            </h2>
          </div>

          <button
            type="button"
            className="service-detail-close-btn"
            onClick={closeServiceDetail}
            aria-label="Close service exploration"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="service-detail-body">
          <p className="service-detail-lead">
            {activeServiceDetail.description}
          </p>

          {activeServiceDetail.longDescription && (
            <p className="service-detail-subtext">
              {activeServiceDetail.longDescription}
            </p>
          )}

          {/* Section: What this service covers */}
          <div className="service-coverage-section">
            <div className="service-coverage-label">WHAT THIS SERVICE COVERS</div>
            <div className="service-coverage-grid">
              {activeServiceDetail.coverageItems && activeServiceDetail.coverageItems.length > 0 ? (
                activeServiceDetail.coverageItems.map((item) => (
                  <div key={item.title} className="coverage-card">
                    <div className="coverage-card-title">
                      <span className="coverage-icon">{isElectrician ? '⚡' : '💧'}</span>
                      <span>{item.title}</span>
                    </div>
                    <p className="coverage-card-desc">{item.desc}</p>
                  </div>
                ))
              ) : (
                (activeServiceDetail.issues || []).map((issue) => (
                  <div key={issue} className="coverage-card">
                    <div className="coverage-card-title">
                      <span className="coverage-icon">{isElectrician ? '⚡' : '💧'}</span>
                      <span>{issue}</span>
                    </div>
                    <p className="coverage-card-desc">
                      Inspection, diagnostics, precision replacement, and certified testing.
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Vetting Standard */}
          <div className="service-vetting-box">
            <span className="vetting-icon" aria-hidden="true">✓</span>
            <p className="vetting-text">
              {activeServiceDetail.vettingStandard ||
                'Every professional completes government ID verification, background vetting, and trade-skill evaluation prior to onboarding.'}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="service-detail-footer">
          <button
            type="button"
            className="service-detail-cancel-btn"
            onClick={closeServiceDetail}
          >
            Close exploration
          </button>

          <button
            type="button"
            className="service-detail-book-btn"
            onClick={handleBookClick}
          >
            <span>{ctaLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
