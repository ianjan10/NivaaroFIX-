import React, { useState, useEffect, useCallback } from 'react';
import { fastDeepEqual } from '../hooks/useSilentRealtime';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminApprovalsQueuePage from './admin/AdminApprovalsQueuePage';
import AdminProfessionalReviewPage from './admin/AdminProfessionalReviewPage';
import AdminCustomerRegistryPage from './admin/AdminCustomerRegistryPage';
import AdminCustomerDetailPage from './admin/AdminCustomerDetailPage';
import AdminProfessionalRegistryPage from './admin/AdminProfessionalRegistryPage';
import AdminProfessionalDetailPage from './admin/AdminProfessionalDetailPage';
import AdminFeedbackPage from './admin/AdminFeedbackPage';
import AdminTransactionsPage from './admin/AdminTransactionsPage';
import AdminSupportPage from './admin/AdminSupportPage';
import AdminAnalyticsDashboard from '../components/admin/AdminAnalyticsDashboard';
import '../styles/admin.css';

export default function AdminLandingPage() {
  const [adminUser, setAdminUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Collapse persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('nivaarofix_admin_sidebar_collapsed');
      if (saved !== null) return saved === 'true';
      return window.innerWidth < 1024;
    } catch (_) {
      return false;
    }
  });

  // Mobile sidebar drawer open/close
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [summary, setSummary] = useState({ pendingCount: 0, newCustomerCount: 0 });
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  // Adapt on window resize (maintain manual user preference or collapse on narrow screens)
  useEffect(() => {
    const handleResize = () => {
      try {
        const saved = localStorage.getItem('nivaarofix_admin_sidebar_collapsed');
        if (saved !== null) {
          setIsSidebarCollapsed(saved === 'true');
        } else {
          setIsSidebarCollapsed(window.innerWidth < 1024);
        }
      } catch (_) {
        setIsSidebarCollapsed(window.innerWidth < 1024);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist collapse state
  const handleToggleCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nivaarofix_admin_sidebar_collapsed', String(next));
      } catch (_) {}
      return next;
    });
  };

  // 1. Session verification on mount
  useEffect(() => {
    let isMounted = true;
    const destPath = window.location.pathname + window.location.search;

    fetch('/admin/auth/session', {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) throw new Error('Session request failed');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (!data?.authenticated || !data?.user) {
          window.location.replace(`/admin/login?next=${encodeURIComponent(destPath)}`);
          return;
        }

        setAdminUser(data.user);
        setCsrfToken(data.csrfToken || '');
        setIsLoadingSession(false);
      })
      .catch(() => {
        if (isMounted) {
          window.location.replace(`/admin/login?next=${encodeURIComponent(destPath)}`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch approvals summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/admin/approvals/summary', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setSummary((prev) => (fastDeepEqual(prev, data) ? prev : data));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isLoadingSession && adminUser) {
      fetchSummary();
    }
  }, [isLoadingSession, adminUser, fetchSummary]);

  // Silent refresh on tab focus and every 60 seconds (no visible indicators)
  useEffect(() => {
    if (isLoadingSession || !adminUser) return;

    const onFocus = () => {
      fetchSummary();
    };
    window.addEventListener('focus', onFocus);

    const interval = setInterval(() => {
      fetchSummary();
    }, 60000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isLoadingSession, adminUser, fetchSummary]);

  // 3. Listen to popstate (Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigation helper: pushes state for new pages without auto-collapsing sidebar
  const handleNavigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(window.location.pathname);
  };

  // Sign out handler
  const handlePerformLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/admin/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include'
      });
    } catch (_) {
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
      window.location.replace('/admin/login');
    }
  };

  if (isLoadingSession) {
    return (
      <div className="admin-scope" style={{ minHeight: '100vh', background: '#ffffff' }} />
    );
  }

  // Determine active view from currentPath
  const proReviewMatch = currentPath.match(/^\/admin\/approvals\/professionals\/([a-zA-Z0-9_-]+)/);
  const isReviewPage = Boolean(proReviewMatch);
  const reviewRequestId = proReviewMatch ? proReviewMatch[1] : null;

  const proDetailMatch = currentPath.match(/^\/admin\/professionals\/([a-zA-Z0-9_-]+)/);
  const isProDetailPage = Boolean(proDetailMatch);
  const detailProId = proDetailMatch ? proDetailMatch[1] : null;

  const custDetailMatch = currentPath.match(/^\/admin\/customers\/([a-zA-Z0-9_-]+)/);
  const isCustDetailPage = Boolean(custDetailMatch);
  const detailCustId = custDetailMatch ? custDetailMatch[1] : null;

  const isApprovalsQueue = currentPath.startsWith('/admin/approvals');
  const isCustomersPage = currentPath.startsWith('/admin/customers');
  const isProfessionalsPage = currentPath.startsWith('/admin/professionals');
  const isTransactionsPage = currentPath.startsWith('/admin/transactions');
  const isFeedbackPage = currentPath.startsWith('/admin/feedback');
  const isSupportPage = currentPath.startsWith('/admin/support');

  const activeNavTab = isReviewPage || isApprovalsQueue
    ? 'approvals'
    : isCustomersPage
    ? 'customers'
    : isProfessionalsPage || isProDetailPage
    ? 'professionals'
    : isTransactionsPage
    ? 'transactions'
    : isFeedbackPage
    ? 'feedback'
    : isSupportPage
    ? 'support'
    : 'dashboard';

  const userInitial = (adminUser?.username || 'A').slice(0, 2).toUpperCase();
  const userRole = adminUser?.role === 'owner' ? 'Owner' : adminUser?.role === 'verifier' ? 'Verifier' : 'Operator';

  return (
    <div className="admin-scope">
      <div className="admin-shell-layout">
        {/* Full-Height Navigation Sidebar (Admin Identity Pinned Bottom-Left) */}
        <AdminSidebar
          activeTab={activeNavTab}
          pendingCount={summary?.pendingCount || 0}
          adminUser={adminUser}
          onNavigate={handleNavigate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onLogoutClick={() => setShowLogoutModal(true)}
          onAccountClick={() => setShowAccountModal(true)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Stage (100dvh, scrolls on its own, 32px top / 40px side padding) */}
        <main className={`admin-main-stage ${isReviewPage ? 'review-mode' : ''}`} id="admin-main-content">
          {/* Mobile top floating bar with menu button */}
          <div className="admin-mobile-header">
            <button
              type="button"
              className="admin-mobile-menu-trigger"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open administration navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="admin-mobile-title">NivaaroFix Admin</span>
          </div>

          {/* View Router */}
          {isReviewPage ? (
            <AdminProfessionalReviewPage
              requestId={reviewRequestId}
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isApprovalsQueue ? (
            <AdminApprovalsQueuePage
              adminUser={adminUser}
              csrfToken={csrfToken}
              summary={summary}
              onRefreshSummary={fetchSummary}
              onNavigate={handleNavigate}
            />
          ) : isCustDetailPage ? (
            <AdminCustomerDetailPage
              customerId={detailCustId}
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isCustomersPage ? (
            <AdminCustomerRegistryPage
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isProDetailPage ? (
            <AdminProfessionalDetailPage
              proId={detailProId}
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isProfessionalsPage ? (
            <AdminProfessionalRegistryPage
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isTransactionsPage ? (
            <AdminTransactionsPage
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isFeedbackPage ? (
            <AdminFeedbackPage
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : isSupportPage ? (
            <AdminSupportPage
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          ) : (
            <AdminAnalyticsDashboard
              adminUser={adminUser}
              csrfToken={csrfToken}
              onNavigate={handleNavigate}
            />
          )}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="admin-modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="admin-modal-dialog admin-logout-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 className="admin-modal-title">Sign out of Admin Console?</h3>
            <p className="admin-modal-desc">
              Your active administrative session will be terminated and you will be redirected to the sign-in page.
            </p>

            <div className="admin-modal-actions" style={{ marginTop: 24 }}>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary admin-btn-danger"
                onClick={handlePerformLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile & Account Information Modal */}
      {showAccountModal && (
        <div className="admin-modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="admin-modal-title" style={{ margin: 0 }}>Admin Account Profile</h3>
              <button
                type="button"
                className="admin-drawer-close"
                onClick={() => setShowAccountModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 10, marginBottom: 16 }}>
              <div className="admin-avatar-navy" style={{ width: 44, height: 44, fontSize: 16 }}>{userInitial}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--admin-ink)' }}>{adminUser?.username}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>{userRole}</span>
                  <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>• Operator ID #{adminUser?.id || 1}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--admin-border)' }}>
                <span style={{ color: 'var(--admin-muted)' }}>Account Status</span>
                <span style={{ fontWeight: 600, color: 'var(--admin-forest)' }}>Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--admin-border)' }}>
                <span style={{ color: 'var(--admin-muted)' }}>Role Permissions</span>
                <span style={{ fontWeight: 500, color: 'var(--admin-ink)' }}>
                  {adminUser?.role === 'owner' ? 'Full System & Customer Access' : adminUser?.role === 'support' ? 'Full Support Access' : 'Professional Verifications Only'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--admin-border)' }}>
                <span style={{ color: 'var(--admin-muted)' }}>Session Security</span>
                <span style={{ color: 'var(--admin-ink)' }}>Encrypted HttpOnly Cookie</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
