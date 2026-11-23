import React, { useState, useRef, useEffect } from 'react';
import Logo from '../Logo';

export default function AdminSidebar({
  activeTab = 'dashboard',
  pendingCount = 0,
  adminUser = null,
  onNavigate = () => {},
  isCollapsed = false,
  onToggleCollapse = () => {},
  onLogoutClick = () => {},
  onAccountClick = () => {},
  isMobileOpen = false,
  onCloseMobile = () => {}
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef(null);
  const userButtonRef = useRef(null);

  const isVerifier = adminUser?.role === 'verifier';
  const roleName = adminUser?.role === 'owner' ? 'Owner' : adminUser?.role === 'verifier' ? 'Verifier' : 'Operator';
  const username = adminUser?.username || 'admin';
  const initials = username.slice(0, 2).toUpperCase();

  // Close popover on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !userButtonRef.current?.contains(e.target)) {
        setIsPopoverOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPopoverOpen) {
        setIsPopoverOpen(false);
        userButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverOpen]);

  const handleNav = (path) => {
    onNavigate(path);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="admin-sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`admin-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Admin Navigation"
      >
        {/* Sidebar Header with Logo (No bottom divider) */}
        <div className="admin-sidebar-header-clean">
          <div className="admin-sidebar-logo-area">
            <Logo
              variant={isCollapsed ? 'mark' : 'horizontal'}
              size={isCollapsed ? 36 : 46}
              tone="dark"
              alt="NivaaroFix"
              onClick={() => handleNav('/admin')}
              style={{ cursor: 'pointer' }}
              title={isCollapsed ? 'NivaaroFix Dashboard' : undefined}
            />
          </div>

          <button
            type="button"
            className="admin-sidebar-collapse-toggle"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {isCollapsed ? (
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Sidebar Navigation Links */}
        <nav className="admin-sidebar-nav" aria-label="Main Administration">
          {/* Operations / Dashboard */}
          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNav('/admin')}
            title="Operations"
          >
            <div className="admin-nav-left">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
              </svg>
              <span className="admin-nav-label">Operations</span>
            </div>
          </button>

          {/* Approvals */}
          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'approvals' ? 'active' : ''}`}
            onClick={() => handleNav('/admin/approvals')}
            title="Approvals"
          >
            <div className="admin-nav-left">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M7.5 10L9.5 12L13.5 8M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="admin-nav-label">Approvals</span>
            </div>
          </button>

          {/* Customers (Hidden for Verifier role) */}
          {!isVerifier && (
            <button
              type="button"
              className={`admin-nav-item ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => handleNav('/admin/customers')}
              title="Customers"
            >
              <div className="admin-nav-left">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M16 17v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 15.5V17M10 8.5a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="admin-nav-label">Customers</span>
              </div>
            </button>
          )}

          {/* Professionals */}
          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'professionals' ? 'active' : ''}`}
            onClick={() => handleNav('/admin/professionals')}
            title="Professionals"
          >
            <div className="admin-nav-left">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M14 6V4a2 2 0 00-2-2H8a2 2 0 00-2 2v2M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v3M7 12.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="admin-nav-label">Professionals</span>
            </div>
          </button>

          {/* Transactions */}
          {!isVerifier && (
            <button
              type="button"
              className={`admin-nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => handleNav('/admin/transactions')}
              title="Transactions"
            >
              <div className="admin-nav-left">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
                  <path d="M2.5 8.5H17.5" stroke="currentColor" strokeWidth="1.75" />
                  <path d="M6 12.5H8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
                <span className="admin-nav-label">Transactions</span>
              </div>
            </button>
          )}

          {/* Support Tickets & Help Desk */}
          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => handleNav('/admin/support')}
            title="Support Desk"
          >
            <div className="admin-nav-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="13" x2="13" y2="13" />
              </svg>
              <span className="admin-nav-label">Support</span>
            </div>
          </button>

          {/* Feedback */}
          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => handleNav('/admin/feedback')}
            title="Feedback"
          >
            <div className="admin-nav-left">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M16 10C16 13.3137 13.3137 16 10 16C8.89 16 7.85 15.69 6.96 15.15L4 16L4.85 13.04C4.31 12.15 4 11.11 4 10C4 6.68629 6.68629 4 10 4C13.3137 4 16 6.68629 16 10Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 10H7.51M10 10H10.01M12.5 10H12.51" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="admin-nav-label">Feedback</span>
            </div>
          </button>
        </nav>

        {/* Admin Identity Pinned Bottom-Left */}
        <div className="admin-sidebar-footer-pinned">
          {/* Popover above identity */}
          {isPopoverOpen && (
            <div
              className="admin-dropdown-menu admin-identity-popover"
              ref={popoverRef}
              role="menu"
              aria-label="Account options"
            >
              <div className="admin-dropdown-user-header">
                <div className="admin-avatar-navy">{initials}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)' }}>{username}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>{roleName}</div>
                </div>
              </div>

              <div className="admin-dropdown-divider" />

              <button
                type="button"
                className="admin-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onAccountClick();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Profile & Account</span>
              </button>

              <div className="admin-dropdown-divider" />

              <button
                type="button"
                className="admin-dropdown-item admin-dropdown-item-danger"
                role="menuitem"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onLogoutClick();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 14H3.333A1.333 1.333 0 012 12.667V3.333C2 2.597 2.597 2 3.333 2H6M10.667 11.333L14 8m0 0l-3.333-3.333M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          )}

          <button
            ref={userButtonRef}
            type="button"
            className={`admin-user-btn admin-sidebar-user-card ${isPopoverOpen ? 'active' : ''}`}
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsPopoverOpen((prev) => !prev);
              }
            }}
            aria-haspopup="true"
            aria-expanded={isPopoverOpen}
            aria-label={`Admin account menu for ${username}`}
            title={isCollapsed ? `${username} (${roleName})` : undefined}
          >
            {/* Navy avatar with cream initials */}
            <div className="admin-avatar-navy" aria-hidden="true">
              {initials}
            </div>

            <div className="admin-user-details-stacked">
              <span className="admin-username-line">{username}</span>
              <span className="admin-role-muted">{roleName}</span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
