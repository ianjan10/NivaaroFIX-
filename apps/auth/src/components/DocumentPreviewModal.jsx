import React from 'react';

export default function DocumentPreviewModal({ isOpen, onClose, title, fileUrl, fileName }) {
  if (!isOpen) return null;

  const isPdf = fileName?.toLowerCase().endsWith('.pdf') || fileUrl?.startsWith('data:application/pdf');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} preview`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 20, 16, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pro-glass-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '24px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.25)',
          animation: 'fadeInUp 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
              {title}
            </h3>
            {fileName && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6b7280)' }}>
                {fileName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0, 0, 0, 0.06)',
              color: 'var(--text-primary, #111827)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '320px',
            background: 'rgba(0, 0, 0, 0.02)'
          }}
        >
          {isPdf ? (
            <iframe
              src={fileUrl}
              title={title}
              style={{ width: '100%', height: '500px', border: 'none', borderRadius: '12px' }}
            />
          ) : (
            <img
              src={fileUrl || '/images/document-placeholder.png'}
              alt={title}
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

