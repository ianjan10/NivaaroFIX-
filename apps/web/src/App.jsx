import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LocationProvider } from './context/LocationContext';
import { BookingProvider, useBooking } from './context/BookingContext';
import { PartnerProvider, usePartner } from './context/PartnerContext';
import { LanguageProvider } from './context/LanguageContext';
import TopNavbar from './components/TopNavbar';
import HomePage from './pages/HomePage';
import ServicesPage from './pages/ServicesPage';
import AboutPage from './pages/AboutPage';
import InteractiveBookingModal from './components/InteractiveBookingModal';
import ServiceDetailModal from './components/ServiceDetailModal';
import AgentRoleNoticeModal from './components/AgentRoleNoticeModal';
import LanguageSelectorModal from './components/LanguageSelectorModal';
import UserAuthModal from './components/UserAuthModal';
import CustomerProfileIncompleteModal from './components/CustomerProfileIncompleteModal';
import ActiveBookingBlockedModal from './components/ActiveBookingBlockedModal';
import PartnerConsolePage from './pages/PartnerConsolePage';
import PartnerEarningsPage from './pages/PartnerEarningsPage';
import MyBookingsPage from './pages/MyBookingsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminLandingPage from './pages/AdminLandingPage';

// Extract active view from URL hash or pathname with bulletproof matching
// ROOT CAUSE FIX: Never execute side-effect redirects or force 'home' from inside getViewFromHash.
// Pure function only, preserving the actual user view.
function getViewFromHash() {
  const hash = (window.location.hash || '').toLowerCase();
  const path = (window.location.pathname || '').toLowerCase();
  if (path.startsWith('/admin/login') || hash.startsWith('#/admin/login')) return 'admin-login';
  if (path.startsWith('/admin') || hash.startsWith('#/admin')) return 'admin';
  if (hash.includes('partner/settlements') || hash.includes('partner-settlements') || hash.includes('partner/payouts') || path.includes('partner/settlements') || path.includes('partner-settlements')) return 'partner-settlements';
  if (hash.includes('book') && !hash.includes('bookings') && !path.includes('bookings')) return 'book';
  if (path === '/book') return 'book';
  if (hash.includes('bookings') || hash.includes('booking') || path.includes('bookings') || path.includes('booking')) return 'bookings';
  if (hash.includes('partner') || path.includes('partner')) return 'partner';
  if (hash.includes('services') || path.includes('services')) return 'services';
  if (hash.includes('about') || path.includes('about')) return 'about';
  if (hash.includes('home') || hash === '#/' || hash === '' || path === '/') return 'home';
  return 'home';
}

function DashboardAppContent() {
  const [currentView, setCurrentView] = useState(getViewFromHash);
  const [isSessionValidating, setIsSessionValidating] = useState(true);
  const [roleNoticeMessage, setRoleNoticeMessage] = useState('');
  const [bookingsNavNonce, setBookingsNavNonce] = useState(() => (getViewFromHash() === 'bookings' ? 1 : 0));
  const [partnerNavNonce, setPartnerNavNonce] = useState(() => (getViewFromHash() === 'partner' ? 1 : 0));
  const [selectedServiceCategory, setSelectedServiceCategory] = useState('all');
  const [isUserAuthOpen, setIsUserAuthOpen] = useState(false);
  const [isRouteNavigating, setIsRouteNavigating] = useState(false);
  const routeNavTimeoutRef = useRef(null);

  // If visitor lands directly on legacy #/login, replace history entry into auth portal (no Back bounce)
  useEffect(() => {
    const hash = (window.location.hash || '').toLowerCase();
    const path = (window.location.pathname || '').toLowerCase();
    if ((hash.includes('login') || path.includes('login')) && !path.includes('/admin') && !hash.includes('/admin')) {
      const lang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-fix-lang') || 'en';
      const hashQuery = window.location.hash.split('?')[1] || window.location.search.replace(/^\?/, '') || '';
      const params = new URLSearchParams(hashQuery);
      const next = params.get('next') || params.get('returnTo') || '/';
      window.location.replace(`http://localhost:5500?portal=customer&lang=${lang}&returnTo=${encodeURIComponent(next)}`);
    }
  }, []);

  const {
    resumeBookingIntentIfPresent,
    openAgentNotice,
    closeAgentNotice,
    loadUserBookings,
    loadMyRequests,
    isProfileIncompleteModalOpen,
    closeProfileIncompleteModal
  } = useBooking();

  // User state (authenticated user from localStorage or WebLogin)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nivaaro-user');
      if (saved) {
        const parsed = JSON.parse(saved);
        const digits = (parsed?.phone || '').replace(/\D/g, '');
        if (digits === '9876543210' || digits === '9876543220' || digits === '9876543211' || digits === '9840123456') {
          parsed.phone = null;
        }
        localStorage.setItem('nivaaro-user', JSON.stringify(parsed));
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Agent state (authenticated partner from localStorage or WebLogin)
  const [agent, setAgent] = useState(() => {
    try {
      const saved = localStorage.getItem('nivaaro-agent');
      if (saved) {
        const parsed = JSON.parse(saved);
        const digits = (parsed?.phone || '').replace(/\D/g, '');
        if (digits === '9876543210' || digits === '9876543220' || digits === '9876543211' || digits === '9840123456') {
          parsed.phone = null;
        }
        localStorage.setItem('nivaaro-agent', JSON.stringify(parsed));
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Load genuine user bookings whenever user changes
  useEffect(() => {
    if (user?.isLoggedIn) {
      loadUserBookings(user);
      if (loadMyRequests) {
        loadMyRequests(user);
      }
    }
  }, [user, loadUserBookings, loadMyRequests]);

  // Validate server-side session on mount with PostgreSQL session store
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        if (data?.authenticated) {
          if (data.role === 'customer' && data.user) {
            setUser({ ...data.user, isLoggedIn: true });
            setAgent(null);
            localStorage.removeItem('nivaaro-agent');
            localStorage.setItem('nivaaro-user', JSON.stringify({ ...data.user, isLoggedIn: true }));
          } else if (data.role === 'agent' && data.agent) {
            setAgent({ ...data.agent, isLoggedIn: true });
            setUser(null);
            localStorage.removeItem('nivaaro-user');
            localStorage.setItem('nivaaro-agent', JSON.stringify({ ...data.agent, isLoggedIn: true }));
          }
        }
      })
      .catch(() => {
        // If not authenticated on server, purge stale storage
        setUser(null);
        setAgent(null);
        localStorage.removeItem('nivaaro-user');
        localStorage.removeItem('nivaaro-agent');
      })
      .finally(() => {
        setIsSessionValidating(false);
      });
  }, []);

  // Validate Customer profile with PostgreSQL
  useEffect(() => {
    if (user?.email) {
      fetch(`/api/auth/customer-profile?email=${encodeURIComponent(user.email)}`, { credentials: 'include' })
        .then((res) => {
          if (res.status === 404 || res.status === 401) {
            console.warn('Session user not found or unauthenticated. Purging stale local session.');
            localStorage.removeItem('nivaaro-user');
            setUser(null);
          } else if (res.ok) {
            return res.json();
          }
        })
        .then((data) => {
          if (data?.success && data?.user) {
            setUser((prev) => ({ ...prev, ...data.user, isLoggedIn: true }));
          }
        })
        .catch(() => {});
    }
  }, [user?.email]);

  // Validate Agent profile with PostgreSQL
  useEffect(() => {
    if (agent?.email) {
      fetch(`/api/agents/profile/${encodeURIComponent(agent.email)}`, { credentials: 'include' })
        .then((res) => {
          if (res.status === 404 || res.status === 401) {
            console.warn('Session agent not found or unauthenticated. Purging stale local session.');
            localStorage.removeItem('nivaaro-agent');
            setAgent(null);
          } else if (res.ok) {
            return res.json();
          }
        })
        .then((data) => {
          if (data?.success && data?.agent) {
            setAgent((prev) => ({ ...prev, ...data.agent, isLoggedIn: true }));
          }
        })
        .catch(() => {});
    }
  }, [agent?.email]);

  // Cross-Origin Session Receiver (When returning from WebLogin on port 5500)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userParam = params.get('user');
    const agentParam = params.get('agent');
    const langParam = params.get('lang');
    const returnToParam = params.get('returnTo');
    const viewParam = params.get('view');
    const targetHash = (window.location.hash || '').toLowerCase();

    if (langParam) {
      try {
        localStorage.setItem('nivaaro-fix-lang', langParam);
      } catch (e) {
        console.error('Error saving lang param', e);
      }
    }

    if (userParam) {
      try {
        const parsedUser = JSON.parse(decodeURIComponent(userParam));
        const userDigits = (parsedUser?.phone || '').replace(/\D/g, '');
        if (userDigits === '9876543210' || userDigits === '9876543220' || userDigits === '9876543211' || userDigits === '9840123456') {
          parsedUser.phone = null;
        }
        setUser(parsedUser);
        setAgent(null);
        localStorage.removeItem('nivaaro-agent');
        localStorage.setItem('nivaaro-user', JSON.stringify(parsedUser));
        
        let destHash = '#/';
        // If returnTo specified /services, switch to services view
        if (returnToParam && returnToParam.includes('services')) {
          setCurrentView('services');
          destHash = '#/services';
        } else if (returnToParam && returnToParam.includes('book') && !returnToParam.includes('bookings')) {
          setCurrentView('services');
          destHash = '#/services';
          setTimeout(() => {
            resumeBookingIntentIfPresent(parsedUser);
          }, 300);
        } else if (returnToParam && (returnToParam.includes('bookings') || returnToParam.includes('my-bookings'))) {
          setCurrentView('bookings');
          destHash = '#/bookings';
        } else {
          setCurrentView('home');
          destHash = '#/';
        }
        window.history.replaceState({}, '', window.location.pathname + destHash);
      } catch (e) {
        console.error('Error parsing user payload', e);
      }
    }

    if (agentParam) {
      try {
        const parsedAgent = JSON.parse(decodeURIComponent(agentParam));
        const agentDigits = (parsedAgent?.phone || '').replace(/\D/g, '');
        if (agentDigits === '9876543210' || agentDigits === '9876543220' || agentDigits === '9876543211' || agentDigits === '9840123456') {
          parsedAgent.phone = null;
        }
        setAgent(parsedAgent);
        setUser(null);
        localStorage.removeItem('nivaaro-user');
        localStorage.setItem('nivaaro-agent', JSON.stringify(parsedAgent));

        let destHash = '#/partner';
        if (viewParam === 'home' || returnToParam === 'home' || targetHash.includes('home')) {
          setCurrentView('home');
          destHash = '#/';
        } else {
          setCurrentView('partner');
          destHash = '#/partner';
        }
        window.history.replaceState({}, '', window.location.pathname + destHash);
      } catch (e) {
        console.error('Error parsing agent payload', e);
      }
    }
  }, []);

  // Check and resume booking intent when user logs in
  useEffect(() => {
    if (user?.isLoggedIn) {
      resumeBookingIntentIfPresent(user);
    }
  }, [user, resumeBookingIntentIfPresent]);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('nivaaro-user', JSON.stringify(userData));
    setIsUserAuthOpen(false);
    resumeBookingIntentIfPresent(userData);
  };

  const handleLogout = async () => {
    const prevUser = user;
    setUser(null);
    localStorage.removeItem('nivaaro-user');
    if (currentView === 'bookings' || currentView === 'book') {
      navigateTo('home');
      window.location.hash = '#/';
    }
    try {
      await fetch('/api/auth/customer-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: prevUser?.email, userId: prevUser?.id })
      });
    } catch (err) {
      console.warn('Customer logout cleanup error:', err.message);
    }
  };

  const handleLogoutAgent = async () => {
    const prevAgent = agent;
    setAgent(null);
    localStorage.removeItem('nivaaro-agent');
    if (currentView === 'partner') {
      navigateTo('home');
      window.location.hash = '#/';
    }
    try {
      await fetch('/api/auth/agent-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: prevAgent?.email, partnerId: prevAgent?.partnerId, id: prevAgent?.id })
      });
    } catch (err) {
      console.warn('Agent logout cleanup error:', err.message);
    }
  };

  // Route Guards Enforcement
  useEffect(() => {
    // If session validation is still in progress, wait for genuine server state
    if (isSessionValidating) return;

    // 1. Customer-only routes: My Bookings, Booking flow
    if (currentView === 'bookings' || currentView === 'book') {
      if (!user?.isLoggedIn) {
        const currentPath = currentView === 'book' ? '/book' : '/my-bookings';
        setRoleNoticeMessage('');
        const lang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-fix-lang') || 'en';
        // HISTORY RULE: Use replace for guard redirects so Back never lands on a protected URL that loops
        window.location.replace(`http://localhost:5500?portal=customer&lang=${lang}&returnTo=${encodeURIComponent(currentPath)}`);
        return;
      }
      if (agent?.isLoggedIn && !user?.isLoggedIn) {
        setRoleNoticeMessage('This page is for customer accounts');
        setCurrentView('partner');
        window.history.replaceState({}, '', '#/partner');
        return;
      }
    }

    // 2. Professional-only routes: Professional Console & Settlements
    if (currentView === 'partner' || currentView === 'partner-settlements') {
      if (!agent?.isLoggedIn) {
        setRoleNoticeMessage('');
        const lang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-fix-lang') || 'en';
        const returnPath = currentView === 'partner-settlements' ? '/partner/settlements' : '/partner';
        // HISTORY RULE: Use replace for guard redirects so Back never lands on a protected URL that loops
        window.location.replace(`http://localhost:5500?portal=agent&lang=${lang}&returnTo=${encodeURIComponent(returnPath)}`);
        return;
      }
      if (user?.isLoggedIn && !agent?.isLoggedIn) {
        setRoleNoticeMessage('This area is for professional accounts');
        setCurrentView('home');
        window.history.replaceState({}, '', '#/');
        return;
      }
    }

    // 3. Logged-in Customer on /book route -> resume intent immediately
    if (currentView === 'book' && user?.isLoggedIn) {
      setCurrentView('services');
      setTimeout(() => {
        resumeBookingIntentIfPresent(user);
      }, 150);
    }
  }, [currentView, user, agent, resumeBookingIntentIfPresent]);

  // Global 401 Session Expiry Interceptor & Credentials Decorator
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init = {}) => {
      // Ensure credentials: 'include' for API calls to ensure cookies are sent
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.includes('localhost:5000') || url.startsWith('/api') || url.startsWith('/')) {
        init = { ...init, credentials: init.credentials || 'include' };
      }
      const response = await originalFetch(input, init);
      if (response.status === 401) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          if (data?.code === 'SESSION_EXPIRED' || data?.code === 'UNAUTHORIZED') {
            const activeInputs = document.querySelectorAll('input[type="text"], textarea');
            const drafts = {};
            activeInputs.forEach((inp) => {
              if (inp.value && (inp.id || inp.name)) {
                drafts[inp.id || inp.name] = inp.value;
              }
            });
            if (Object.keys(drafts).length > 0) {
              sessionStorage.setItem('nivaarofix_draft_text', JSON.stringify(drafts));
            }
            setUser(null);
            setAgent(null);
            localStorage.removeItem('nivaaro-user');
            localStorage.removeItem('nivaaro-agent');
            // Only redirect if visitor is currently on a protected route
            const activeView = getViewFromHash();
            if (activeView === 'bookings' || activeView === 'book' || activeView === 'partner' || activeView === 'partner-settlements') {
              setRoleNoticeMessage('Your session has expired. Please sign in to continue.');
              const currentHash = window.location.hash.replace(/^#\/?/, '/') || '/';
              const nextPath = currentHash.startsWith('/') ? currentHash : `/${currentHash}`;
              const lang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-fix-lang') || 'en';
              // Use replace on session expiry so Back never loops on expired endpoints
              window.location.replace(`http://localhost:5500?portal=customer&lang=${lang}&returnTo=${encodeURIComponent(nextPath)}`);
            }
          }
        } catch (_) {}
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Synchronize state with browser back/forward buttons and page returns
  useEffect(() => {
    const handleUrlChange = () => {
      const targetView = getViewFromHash();
      setCurrentView(targetView);
      if (targetView === 'bookings') {
        setBookingsNavNonce((prev) => prev + 1);
      }
      if (targetView === 'partner') {
        setPartnerNavNonce((prev) => prev + 1);
      }
      setIsRouteNavigating(true);
      if (routeNavTimeoutRef.current) clearTimeout(routeNavTimeoutRef.current);
      routeNavTimeoutRef.current = setTimeout(() => {
        setIsRouteNavigating(false);
      }, 250);
    };

    const handleStorageSync = () => {
      try {
        const savedUser = localStorage.getItem('nivaaro-user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
        } else {
          setUser(null);
        }
        const savedAgent = localStorage.getItem('nivaaro-agent');
        if (savedAgent) {
          const parsed = JSON.parse(savedAgent);
          setAgent(parsed);
        } else {
          setAgent(null);
        }
      } catch (e) {}
    };

    // HISTORY RULE: On bfcache restore (pageshow), never force home.
    // Re-evaluate current view from hash and re-verify session with API.
    const handlePageShow = async () => {
      handleUrlChange();
      handleStorageSync();
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.authenticated && data?.user) {
            setUser({ ...data.user, isLoggedIn: true });
          } else if (data?.authenticated && data?.agent) {
            setAgent({ ...data.agent, isLoggedIn: true });
          } else {
            setUser(null);
            setAgent(null);
            localStorage.removeItem('nivaaro-user');
            localStorage.removeItem('nivaaro-agent');
          }
        } else if (res.status === 401) {
          setUser(null);
          setAgent(null);
          localStorage.removeItem('nivaaro-user');
          localStorage.removeItem('nivaaro-agent');
        }
      } catch (_) {}
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleStorageSync);

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleStorageSync);
      if (routeNavTimeoutRef.current) clearTimeout(routeNavTimeoutRef.current);
    };
  }, []);

  // Update theme class and scroll to top on view change
  useEffect(() => {
    if (currentView === 'partner' || currentView === 'partner-settlements') {
      document.body.classList.add('agent-portal');
    } else {
      document.body.classList.remove('agent-portal');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  const navigateTo = (view, category = 'all') => {
    setSelectedServiceCategory(category);
    setCurrentView(view);
    if (view === 'bookings') {
      setBookingsNavNonce((prev) => prev + 1);
    }
    if (view === 'partner') {
      setPartnerNavNonce((prev) => prev + 1);
    }
    const targetHash = view === 'home' ? '#/' : (view === 'partner-settlements' ? '#/partner/settlements' : `#/${view}`);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    // Route progress indicator: 2px tall in brand green, appears only during navigation, removed when loading ends
    setIsRouteNavigating(true);
    if (routeNavTimeoutRef.current) clearTimeout(routeNavTimeoutRef.current);
    routeNavTimeoutRef.current = setTimeout(() => {
      setIsRouteNavigating(false);
    }, 250);
  };

  const openLogin = (next = '', role = 'customer') => {
    const lang = localStorage.getItem('nivaarofix-lang') || localStorage.getItem('nivaaro-fix-lang') || 'en';
    let sanitizedNext = '';
    if (next && typeof next === 'string') {
      const trimmed = next.trim();
      // Relative path validation: must start with a single '/' and not '//', no host, scheme or backslashes
      if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !trimmed.includes('://')) {
        sanitizedNext = trimmed;
      }
    }
    // Default return destination to current view/hash if not explicitly provided
    if (!sanitizedNext) {
      const currentHash = window.location.hash.replace(/^#\/?/, '') || (currentView === 'home' ? '' : currentView);
      sanitizedNext = currentHash ? `/${currentHash}` : '/';
    }
    const nextQuery = sanitizedNext ? `&returnTo=${encodeURIComponent(sanitizedNext)}` : '';
    const portal = role === 'agent' || role === 'professional' ? 'agent' : 'customer';
    // User-initiated action pushes onto history
    window.location.href = `http://localhost:5500?portal=${portal}&lang=${lang}${nextQuery}`;
  };

  return (
    <div className="dashboard-app-wrapper">
      {/* Route-Loading Progress Bar (2px brand green, only visible during navigation) */}
      {isRouteNavigating && <div className="route-nav-progress-bar" aria-hidden="true" />}

      {/* Top Navbar (Hidden on Admin Operations Console) */}
      {!currentView.startsWith('admin') && (
        <TopNavbar
          currentView={currentView}
          onNavigate={navigateTo}
          user={user}
          agent={agent}
          onOpenUserAuth={() => openLogin()}
          onLogoutUser={handleLogout}
          onLogoutAgent={handleLogoutAgent}
        />
      )}

      {/* Role Mismatch or Session Notice Banner */}
      {!currentView.startsWith('admin') && roleNoticeMessage && (
        <div
          className="global-role-notice-banner"
          style={{
            maxWidth: '1200px',
            margin: '0.75rem auto',
            padding: '0.75rem 1.25rem',
            background: '#ecfdf5',
            border: '1px solid #047857',
            borderRadius: '8px',
            color: '#047857',
            fontSize: '0.9rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{roleNoticeMessage}</span>
          <button
            type="button"
            onClick={() => setRoleNoticeMessage('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#047857',
              fontSize: '1.25rem',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0 0.5rem'
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <main>
        {currentView === 'home' && (
          /* 1. Dedicated Front Home Page */
          <HomePage
            onNavigateToServices={(cat) => navigateTo('services', cat)}
            onNavigateToPartner={() => navigateTo('partner')}
            onNavigateToAbout={() => navigateTo('about')}
            onNavigateToBookings={() => navigateTo('bookings')}
            onOpenAuth={(next = '/book') => openLogin(next)}
            user={user}
            agent={agent}
            onLogoutUser={handleLogout}
            onLogoutAgent={handleLogoutAgent}
          />
        )}

        {currentView === 'services' && (
          /* 2. Dedicated Services Marketplace Page */
          <ServicesPage
            defaultCategory={selectedServiceCategory}
            currentUser={user}
            currentAgent={currentView === 'partner' ? agent : null}
            onOpenAuth={(next = '/book') => openLogin(next)}
            onAgentBlocked={() => openAgentNotice()}
            onNavigateToHome={() => navigateTo('home')}
            onNavigateToPartner={() => navigateTo('partner')}
            onNavigateToBookings={() => navigateTo('bookings')}
          />
        )}

        {currentView === 'about' && (
          /* 3. Dedicated About Page */
          <AboutPage
            onNavigateToHome={() => navigateTo('home')}
            onNavigateToServices={() => navigateTo('services')}
            onNavigateToPartner={() => navigateTo('partner')}
          />
        )}

        {currentView === 'partner' && (
          /* 4. Dedicated Service Partner / Agent Console Page */
          <PartnerConsolePage agent={agent} partnerNavNonce={partnerNavNonce} onNavigate={navigateTo} />
        )}

        {currentView === 'partner-settlements' && (
          /* Dedicated Professional Payouts & Settlements Page */
          <PartnerEarningsPage agent={agent} onNavigate={navigateTo} />
        )}

        {currentView === 'bookings' && (
          /* 5. Dedicated My Bookings / Orders History Page */
          <MyBookingsPage
            currentUser={user}
            onNavigateToHome={() => navigateTo('home')}
            onNavigateToServices={(cat) => navigateTo('services', cat)}
            onOpenAuth={() => openLogin('/my-bookings')}
            bookingsNavNonce={bookingsNavNonce}
          />
        )}

        {currentView === 'admin-login' && (
          <AdminLoginPage />
        )}

        {currentView === 'admin' && (
          <AdminLandingPage />
        )}
      </main>

      {/* User Login & Profile Modal */}
      {!currentView.startsWith('admin') && (
        <>
          <UserAuthModal
            isOpen={isUserAuthOpen}
            onClose={() => setIsUserAuthOpen(false)}
            user={user}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />

          {/* Service Detail Exploration Modal (No login required) */}
          <ServiceDetailModal
            currentUser={user}
            currentAgent={currentView === 'partner' ? agent : null}
            onOpenAuth={(next = '/book') => openLogin(next)}
            onAgentBlocked={() => openAgentNotice()}
          />

          {/* Agent Role Warning Notice Modal */}
          <AgentRoleNoticeModal
            onSwitchToCustomer={() => {
              if (closeAgentNotice) closeAgentNotice();
              openLogin('/book');
            }}
          />

          {/* Customer Profile Incomplete Warning Modal (100% checklist required before booking) */}
          <CustomerProfileIncompleteModal
            isOpen={isProfileIncompleteModalOpen}
            onClose={closeProfileIncompleteModal}
            user={user}
          />

          {/* Active Service In Progress Blocked Modal (Dedicated Service Policy) */}
          <ActiveBookingBlockedModal
            onNavigateToBookings={() => navigateTo('bookings')}
          />

          {/* Interactive Booking Modal / Drawer */}
          <InteractiveBookingModal
            currentUser={user}
            onOpenAuth={(next = '/book') => openLogin(next)}
          />

          {/* Uber-Style Full Language Modal */}
          <LanguageSelectorModal />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <LocationProvider>
          <BookingProvider>
            <PartnerProvider>
              <DashboardAppContent />
            </PartnerProvider>
          </BookingProvider>
        </LocationProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
