import React, { useState, useEffect } from 'react';
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
import PartnerConsolePage from './pages/PartnerConsolePage';
import MyBookingsPage from './pages/MyBookingsPage';

// Extract active view from URL hash or pathname with bulletproof matching
function getViewFromHash() {
  const hash = (window.location.hash || '').toLowerCase();
  const path = (window.location.pathname || '').toLowerCase();
  if (hash.includes('home') || hash === '#/' || hash === '') return 'home';
  if (hash.includes('about') || path.includes('about')) return 'about';
  if (hash.includes('services') || path.includes('services')) return 'services';
  if (hash.includes('partner') || path.includes('partner')) return 'partner';
  if (hash.includes('bookings') || hash.includes('booking') || path.includes('bookings') || path.includes('booking')) return 'bookings';
  return 'home';
}

function DashboardAppContent() {
  const [currentView, setCurrentView] = useState(getViewFromHash);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState('all');
  const [isUserAuthOpen, setIsUserAuthOpen] = useState(false);

  const {
    resumeBookingIntentIfPresent,
    openAgentNotice,
    closeAgentNotice,
    loadUserBookings,
    isProfileIncompleteModalOpen,
    closeProfileIncompleteModal
  } = useBooking();

  // User state (authenticated user from localStorage or WebLogin)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nivaaro-user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.dob && (JSON.stringify(parsed.dob).includes('1992') || JSON.stringify(parsed.dob).includes('2050'))) {
          parsed.dob = null;
        }
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
        if (parsed?.dob && (JSON.stringify(parsed.dob).includes('1988') || JSON.stringify(parsed.dob).includes('1992') || JSON.stringify(parsed.dob).includes('2050'))) {
          parsed.dob = null;
        }
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
    }
  }, [user, loadUserBookings]);

  // Validate Customer session with PostgreSQL (purges stale/AI-generated users if not in DB)
  useEffect(() => {
    if (user?.email) {
      fetch(`http://localhost:5000/api/auth/customer-profile?email=${encodeURIComponent(user.email)}`)
        .then((res) => {
          if (res.status === 404) {
            console.warn('Session user not found in database. Purging stale local session.');
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

  // Validate Agent session with PostgreSQL (purges stale/AI-generated partners if not in DB)
  useEffect(() => {
    if (agent?.email) {
      fetch(`http://localhost:5000/api/agents/profile/${encodeURIComponent(agent.email)}`)
        .then((res) => {
          if (res.status === 404) {
            console.warn('Session agent not found in database. Purging stale local session.');
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
        if (parsedUser?.dob && (JSON.stringify(parsedUser.dob).includes('1992') || JSON.stringify(parsedUser.dob).includes('2050'))) {
          parsedUser.dob = null;
        }
        const userDigits = (parsedUser?.phone || '').replace(/\D/g, '');
        if (userDigits === '9876543210' || userDigits === '9876543220' || userDigits === '9876543211' || userDigits === '9840123456') {
          parsedUser.phone = null;
        }
        setUser(parsedUser);
        setAgent(null);
        localStorage.removeItem('nivaaro-agent');
        localStorage.setItem('nivaaro-user', JSON.stringify(parsedUser));
        
        // If returnTo specified /services, switch to services view
        if (returnToParam && returnToParam.includes('services')) {
          setCurrentView('services');
          window.location.hash = '#/services';
        } else {
          setCurrentView('home');
          window.location.hash = '#/';
        }
      } catch (e) {
        console.error('Error parsing user payload', e);
      }
    }

    if (agentParam) {
      try {
        const parsedAgent = JSON.parse(decodeURIComponent(agentParam));
        if (parsedAgent?.dob && (JSON.stringify(parsedAgent.dob).includes('1988') || JSON.stringify(parsedAgent.dob).includes('1992') || JSON.stringify(parsedAgent.dob).includes('2050'))) {
          parsedAgent.dob = null;
        }
        const agentDigits = (parsedAgent?.phone || '').replace(/\D/g, '');
        if (agentDigits === '9876543210' || agentDigits === '9876543220' || agentDigits === '9876543211' || agentDigits === '9840123456') {
          parsedAgent.phone = null;
        }
        setAgent(parsedAgent);
        setUser(null);
        localStorage.removeItem('nivaaro-user');
        localStorage.setItem('nivaaro-agent', JSON.stringify(parsedAgent));

        if (viewParam === 'home' || returnToParam === 'home' || targetHash.includes('home')) {
          setCurrentView('home');
          window.location.hash = '#/';
        } else {
          setCurrentView('partner');
          window.location.hash = '#/partner';
        }
      } catch (e) {
        console.error('Error parsing agent payload', e);
      }
    }

    // Clean up query parameters smoothly if returning with payload
    if (userParam || agentParam) {
      const cleanHash = (viewParam === 'home' || returnToParam === 'home' || targetHash.includes('home'))
        ? '#/'
        : (window.location.hash || '#/');
      const cleanPath = window.location.pathname + cleanHash;
      window.history.replaceState({}, '', cleanPath);
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

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('nivaaro-user');
  };

  // Synchronize state with browser back/forward buttons and page returns
  useEffect(() => {
    const handleUrlChange = () => {
      const targetView = getViewFromHash();
      setCurrentView(targetView);
    };

    const handleStorageSync = () => {
      try {
        const savedUser = localStorage.getItem('nivaaro-user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
        }
        const savedAgent = localStorage.getItem('nivaaro-agent');
        if (savedAgent) {
          const parsed = JSON.parse(savedAgent);
          setAgent(parsed);
        }
      } catch (e) {}
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('pageshow', handleStorageSync);
    window.addEventListener('focus', handleStorageSync);

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('pageshow', handleStorageSync);
      window.removeEventListener('focus', handleStorageSync);
    };
  }, []);

  // Update theme class and scroll to top on view change
  useEffect(() => {
    if (currentView === 'partner') {
      document.body.classList.add('agent-portal');
    } else {
      document.body.classList.remove('agent-portal');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  const navigateTo = (view, category = 'all') => {
    setSelectedServiceCategory(category);
    setCurrentView(view);
    const targetHash = view === 'home' ? '#/' : `#/${view}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  const handleLogoutAgent = () => {
    setAgent(null);
    localStorage.removeItem('nivaaro-agent');
    if (currentView === 'partner') {
      navigateTo('home');
    }
  };

  return (
    <div className="dashboard-app-wrapper">
      {/* Top Navbar */}
      <TopNavbar
        currentView={currentView}
        onNavigate={navigateTo}
        user={user}
        agent={agent}
        onOpenUserAuth={() => setIsUserAuthOpen(true)}
        onLogoutUser={handleLogout}
        onLogoutAgent={handleLogoutAgent}
      />

      <main>
        {currentView === 'home' && (
          /* 1. Dedicated Front Home Page */
          <HomePage
            onNavigateToServices={(cat) => navigateTo('services', cat)}
            onNavigateToPartner={() => navigateTo('partner')}
            onNavigateToAbout={() => navigateTo('about')}
            onNavigateToBookings={() => navigateTo('bookings')}
            onOpenAuth={() => setIsUserAuthOpen(true)}
            user={user}
            agent={agent}
          />
        )}

        {currentView === 'services' && (
          /* 2. Dedicated Services Marketplace Page */
          <ServicesPage
            defaultCategory={selectedServiceCategory}
            currentUser={user}
            currentAgent={currentView === 'partner' ? agent : null}
            onOpenAuth={() => setIsUserAuthOpen(true)}
            onAgentBlocked={() => openAgentNotice()}
            onNavigateToHome={() => navigateTo('home')}
            onNavigateToPartner={() => navigateTo('partner')}
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
          <PartnerConsolePage agent={agent} />
        )}

        {currentView === 'bookings' && (
          /* 5. Dedicated My Bookings / Orders History Page */
          <MyBookingsPage
            currentUser={user}
            onNavigateToHome={() => navigateTo('home')}
            onNavigateToServices={(cat) => navigateTo('services', cat)}
            onOpenAuth={() => setIsUserAuthOpen(true)}
          />
        )}
      </main>

      {/* User Login & Profile Modal */}
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
        onOpenAuth={() => setIsUserAuthOpen(true)}
        onAgentBlocked={() => openAgentNotice()}
      />

      {/* Agent Role Warning Notice Modal */}
      <AgentRoleNoticeModal
        onSwitchToCustomer={() => {
          if (closeAgentNotice) closeAgentNotice();
          setIsUserAuthOpen(true);
        }}
      />

      {/* Customer Profile Incomplete Warning Modal (100% checklist required before booking) */}
      <CustomerProfileIncompleteModal
        isOpen={isProfileIncompleteModalOpen}
        onClose={closeProfileIncompleteModal}
        user={user}
      />

      {/* Interactive Booking Modal / Drawer */}
      <InteractiveBookingModal
        currentUser={user}
        onOpenAuth={() => setIsUserAuthOpen(true)}
      />

      {/* Uber-Style Full Language Modal */}
      <LanguageSelectorModal />
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
