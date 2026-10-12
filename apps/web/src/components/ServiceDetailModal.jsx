import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBooking } from '../context/BookingContext';

export default function ServiceDetailModal({ currentUser, currentAgent, onOpenAuth, onAgentBlocked }) {
  const {
    isDetailModalOpen,
    activeServiceDetail,
    highlightedIssue,
    closeServiceDetail,
    initiateProtectedBooking
  } = useBooking();

  const [selectedItemId, setSelectedItemId] = useState(null);
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  // Derive catalog items and metadata
  const slug = activeServiceDetail?.slug || activeServiceDetail?.categoryId || 'electrician';
  const tradeTitle = activeServiceDetail?.title || (slug === 'plumber' ? 'Plumber' : 'Electrician');
  const description = activeServiceDetail?.description || (slug === 'plumber'
    ? 'Leaks, blockages, and fittings fixed for your home.'
    : 'Faults, repairs, and new installations for your home.');
  const items = activeServiceDetail?.items || activeServiceDetail?.coverageItems || [];
  const trustLine = activeServiceDetail?.trustLine || (slug === 'plumber'
    ? 'Every plumber is ID-verified and background-checked.'
    : 'Every electrician is ID-verified and background-checked.');
  const footerNote = activeServiceDetail?.footerNote || 'Compare quotes from nearby professionals, then accept the one you prefer.';
  const defaultCta = activeServiceDetail?.defaultCta || (slug === 'plumber' ? 'Book a Plumber' : 'Book an Electrician');

  // Sync / pre-select if highlightedIssue is provided
  useEffect(() => {
    if (!isDetailModalOpen) {
      setSelectedItemId(null);
      return;
    }

    if (highlightedIssue && items.length > 0) {
      const query = String(highlightedIssue).trim().toLowerCase();
      const matched = items.find(it => {
        const itemTitle = (it.title || '').toLowerCase();
        const itemId = (it.id || '').toLowerCase();
        return itemTitle === query || itemId === query || query.includes(itemTitle) || itemTitle.includes(query);
      });
      if (matched) {
        setSelectedItemId(matched.id || matched.title);
      }
    } else {
      setSelectedItemId(null);
    }
  }, [isDetailModalOpen, highlightedIssue, items]);

  // Focus trap & Escape key
  useEffect(() => {
    if (!isDetailModalOpen) return;

    previousActiveElementRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeServiceDetail();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isDetailModalOpen, closeServiceDetail]);

  const handleToggleItem = useCallback((item) => {
    const key = item.id || item.title;
    setSelectedItemId(prev => prev === key ? null : key);
  }, []);

  const handleCtaClick = () => {
    const selectedItem = items.find(it => (it.id || it.title) === selectedItemId);
    const issueToPreFill = selectedItem ? selectedItem.title : null;

    initiateProtectedBooking({
      service: slug,
      issue: issueToPreFill,
      currentUser,
      currentAgent,
      onOpenAuth,
      onAgentBlocked
    });
  };

  if (!isDetailModalOpen || !activeServiceDetail) return null;

  // Render neutral/brand stroke line icon for the trade
  const renderTradeStrokeIcon = () => {
    if (slug === 'electrician' || activeServiceDetail?.iconType === 'electrician') {
      return (
        <svg
          className="service-detail-trade-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    }
    if (slug === 'plumber' || activeServiceDetail?.iconType === 'plumber') {
      return (
        <svg
          className="service-detail-trade-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    }
    return (
      <svg
        className="service-detail-trade-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    );
  };

  const ctaLabel = selectedItemId ? 'Continue' : defaultCta;

  return (
    <div
      className="service-detail-backdrop open"
      onClick={closeServiceDetail}
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
    >
      <div
        ref={modalRef}
        className="service-detail-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="service-detail-sheet-handle" aria-hidden="true" />

        {/* Fixed Header */}
        <div className="service-detail-header">
          <div className="service-detail-header-main">
            <div className="service-detail-title-row">
              {renderTradeStrokeIcon()}
              <h2 id="service-detail-title" className="service-detail-title">
                {tradeTitle}
              </h2>
            </div>
            <p className="service-detail-desc">{description}</p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="service-detail-close-btn"
            onClick={closeServiceDetail}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrolling Body */}
        <div className="service-detail-body">
          <div className="service-detail-section-label">What's included</div>

          <div className="service-detail-list" role="radiogroup" aria-label="Included services">
            {items.map((item) => {
              const itemKey = item.id || item.title;
              const isSelected = selectedItemId === itemKey;

              return (
                <div
                  key={itemKey}
                  className={`service-detail-item-row ${isSelected ? 'is-selected' : ''}`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => handleToggleItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleToggleItem(item);
                    }
                  }}
                >
                  <div className="service-detail-item-content">
                    <h3 className="service-detail-item-title">{item.title}</h3>
                    <p className="service-detail-item-desc">{item.desc}</p>
                  </div>

                  <div className="service-detail-item-radio" aria-hidden="true">
                    <span className={`service-detail-radio-circle ${isSelected ? 'checked' : ''}`}>
                      {isSelected && (
                        <svg
                          viewBox="0 0 12 12"
                          width="10"
                          height="10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="2.5 6 5 8.5 9.5 3.5" />
                        </svg>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust line above the footer */}
          <div className="service-detail-trust-line">
            <svg
              className="service-detail-trust-icon"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            <span>{trustLine}</span>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="service-detail-footer">
          <p className="service-detail-footer-note">{footerNote}</p>
          <button
            type="button"
            className="service-detail-primary-btn service-detail-book-btn"
            onClick={handleCtaClick}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
