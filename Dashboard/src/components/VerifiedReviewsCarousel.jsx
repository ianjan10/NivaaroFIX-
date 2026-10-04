import React from 'react';
import { customerTestimonials } from '../data/testimonialsData';
import { useLanguage } from '../context/LanguageContext';

export default function VerifiedReviewsCarousel() {
  const { t } = useLanguage();

  return (
    <section className="reviews-section">
      <div className="max-w-container">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">{t.reviewsTitle || 'Built around trust, not guesswork.'}</h2>
            <p className="section-desc">{t.reviewsDesc || 'Real experiences from verified homeowners who booked certified pros through NivaaroFix.'}</p>
          </div>
          <div style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {t.reviewsRatingText || '★ 4.9/5 from 1,200+ Verified Bookings'}
          </div>
        </div>

        <div className="reviews-grid">
          {customerTestimonials.map((rev) => (
            <div key={rev.id} className="review-card">
              <div>
                {/* 5-Star Row */}
                <div className="review-stars-row">
                  {[...Array(rev.rating)].map((_, i) => (
                    <svg key={i} className="rating-star" viewBox="0 0 24 24">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path>
                    </svg>
                  ))}
                </div>

                <p className="review-comment">"{rev.comment}"</p>
              </div>

              <div className="review-user-info">
                <div className="review-avatar" style={{ backgroundColor: rev.avatarBg }}>
                  {rev.avatarInitials}
                </div>
                <div>
                  <div className="review-user-name">{rev.customerName}</div>
                  <div className="review-user-city">
                    {rev.city} • <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{rev.serviceTitle}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
