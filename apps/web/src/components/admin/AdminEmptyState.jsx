import React from 'react';

/**
 * Shared Empty State Component
 * Centered in card both horizontally and vertically.
 * Fraunces title, Plus Jakarta Sans muted text, line icon, optional action button.
 */
export default function AdminEmptyState({
  icon = 'inbox',
  title = 'No records found',
  subtitle = 'Nothing to display for this period or filter.',
  actionLabel = null,
  onAction = null,
  style = {}
}) {
  return (
    <div className="admin-empty-state-shared" style={style}>
      <div className="admin-empty-icon-wrap" aria-hidden="true">
        {icon === 'inbox' && (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a9793c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        )}
        {icon === 'search' && (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a9793c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
        {icon === 'users' && (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a9793c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        )}
        {icon === 'briefcase' && (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a9793c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        )}
        {icon === 'check-circle' && (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0f4d3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
      </div>

      <h3 className="admin-empty-shared-title">{title}</h3>
      <p className="admin-empty-shared-subtitle">{subtitle}</p>

      {actionLabel && onAction && (
        <button
          type="button"
          className="admin-btn-secondary"
          onClick={onAction}
          style={{ marginTop: 16 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

