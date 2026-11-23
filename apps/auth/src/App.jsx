import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastNotificationProvider } from './context/ToastNotificationContext';
import { LanguageProvider } from './context/LanguageContext';
import AppHeader from './components/AppHeader';
import AppFooter from './components/AppFooter';
import ToastNotification from './components/ToastNotification';
import LanguageSelectionModal from './components/LanguageSelectionModal';
import PortalSelectionPage from './pages/PortalSelectionPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import AgentPortalPage from './pages/AgentPortalPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import AgentProfilePage from './pages/AgentProfilePage';
import CustomerForgotPasswordPage from './pages/CustomerForgotPasswordPage';
import AgentForgotPasswordPage from './pages/AgentForgotPasswordPage';

function AppLayout() {
  // Read portal from URL params (?portal=agent or ?portal=customer or null -> 'select')
  const [portal, setPortal] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const portalParam = params.get('portal');
    if (portalParam === 'agent' || params.get('agent')) return 'agent';
    if (portalParam === 'customer' || params.get('user')) return 'customer';
    if (params.get('action') === 'profile') {
      const savedAgent = localStorage.getItem('nivaaro-agent');
      const savedUser = localStorage.getItem('nivaaro-user');
      if (savedAgent) return 'agent';
      if (savedUser) return 'customer';
      return 'customer';
    }
    return 'select'; // Default: First ask Login as User / Agent
  });

  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const actionParam = params.get('action');
    if (actionParam === 'profile') return 'profile';
    return 'auth'; // 'auth' | 'forgot' | 'profile'
  });

  useEffect(() => {
    if (portal === 'agent') {
      document.body.classList.add('agent-portal');
    } else {
      document.body.classList.remove('agent-portal');
    }
  }, [portal]);

  // Check if user is already authenticated; if so, redirect with replace (no back-button loop)
  useEffect(() => {
    let isMounted = true;
    const checkActiveSession = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'profile') return;

      try {
        const res = await fetch('http://localhost:5000/api/auth/session', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data?.authenticated) {
          const returnTo = params.get('returnTo') || params.get('next');
          const lang = params.get('lang') || localStorage.getItem('nivaarofix-lang') || 'en';
          let targetHash = '#/';
          let queryParam = '';

          if (returnTo) {
            const trimmed = returnTo.trim();
            if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\') && !trimmed.includes('://')) {
              if (trimmed.includes('bookings') || trimmed.includes('my-bookings')) {
                targetHash = '#/bookings';
              } else if (trimmed.includes('services')) {
                targetHash = '#/services';
              } else if (trimmed.includes('partner')) {
                targetHash = '#/partner';
              } else if (trimmed.includes('book')) {
                targetHash = '#/services';
                queryParam = '&returnTo=/book';
              }
            }
          }

          if (data.agent) {
            window.location.replace(`http://localhost:5173?lang=${lang}#/partner`);
          } else if (data.user) {
            window.location.replace(`http://localhost:5173?lang=${lang}${queryParam}${targetHash}`);
          }
        }
      } catch (_) {}
    };
    checkActiveSession();
    return () => { isMounted = false; };
  }, []);

  // Listen to popstate for sub-views like 'forgot'
  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state?.authView === 'forgot') {
        setView('forgot');
      } else if (view === 'forgot') {
        setView('auth');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [view]);

  // Sync payload params to localStorage and handle action=profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userParam = params.get('user');
    const agentParam = params.get('agent');
    const actionParam = params.get('action');
    const portalParam = params.get('portal');

    if (userParam) {
      try {
        let cleanVal = userParam;
        try {
          cleanVal = decodeURIComponent(userParam);
        } catch (_) {}
        // Validate JSON
        JSON.parse(cleanVal);
        localStorage.setItem('nivaaro-user', cleanVal);
        localStorage.removeItem('nivaaro-agent');
      } catch (e) {
        console.error('Error saving user in WebLogin', e);
      }
    }

    if (agentParam) {
      try {
        let cleanVal = agentParam;
        try {
          cleanVal = decodeURIComponent(agentParam);
        } catch (_) {}
        // Validate JSON
        const parsed = JSON.parse(cleanVal);
        const pId = parsed.partner_id || parsed.partnerId || parsed.id;
        if (pId && !parsed.avatarUrl && !parsed.avatar_url) {
          parsed.avatar_url = `/api/verification/photo/stream?id=${pId}`;
          parsed.avatarUrl = parsed.avatar_url;
        }
        localStorage.setItem('nivaaro-agent', JSON.stringify(parsed));
        localStorage.removeItem('nivaaro-user');
      } catch (e) {
        console.error('Error saving agent in WebLogin', e);
      }
    }

    if (actionParam === 'profile') {
      setView('profile');
      if (portalParam === 'agent' || agentParam) {
        setPortal('agent');
      } else if (portalParam === 'customer' || userParam) {
        setPortal('customer');
      } else if (localStorage.getItem('nivaaro-agent')) {
        setPortal('agent');
      } else {
        setPortal('customer');
      }
    }
  }, []);

  const handleSelectPortal = (selectedPortal) => {
    setPortal(selectedPortal);
    setView('auth');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('portal', selectedPortal);
    newUrl.searchParams.delete('action');
    // HISTORY RULE: Query-only changes use replaceState so they do not add history entries
    window.history.replaceState({}, '', newUrl.toString());
  };

  const handleSwitchPortal = (newPortal) => {
    setPortal(newPortal);
    setView('auth');
    const newUrl = new URL(window.location.href);
    if (newPortal === 'select') {
      newUrl.searchParams.delete('portal');
      newUrl.searchParams.delete('action');
    } else {
      newUrl.searchParams.set('portal', newPortal);
    }
    // HISTORY RULE: Query-only changes use replaceState so they do not add history entries
    window.history.replaceState({}, '', newUrl.toString());
  };

  const isProfileView = view === 'profile';

  return (
    <div className={`auth-viewport-root ${isProfileView ? 'pro-profile-viewport' : ''}`}>
      {/* 1. Background Stage: Marketing Hero Photo blurred and faded for auth screens; removed on profile pages */}
      {!isProfileView && (
        <div className={`auth-background-stage ${view === 'profile' ? 'profile-glass-bg-stage' : ''}`} aria-hidden="true">
          <picture>
            <source srcSet="/project_image/5.webp" type="image/webp" />
            <img
              src="/project_image/5.png"
              alt="Professional Electrician Working on Residential Electrical Panel"
              className={`auth-bg-photo ${view === 'profile' ? 'profile-bg-photo-faded' : ''}`}
              loading="eager"
              decoding="async"
              width="1920"
              height="1080"
            />
          </picture>
          <div className={`auth-light-overlay ${view === 'profile' ? 'profile-light-overlay' : ''}`} />
        </div>
      )}

      {/* 2. Full-Width Fixed Header */}
      {view !== 'profile' && <AppHeader currentPortal={portal} />}

      {/* 3. Floating Minimal Interface Container */}
      <div className={`page-container ${view === 'profile' ? 'profile-view-mode' : ''}`}>
        <main className={`auth-main-area ${view === 'profile' ? 'profile-main-area-reset' : ''}`}>
          {/* 1. Initial Selection: Ask Login as User / Agent */}
          {portal === 'select' && (
            <PortalSelectionPage onSelectPortal={handleSelectPortal} />
          )}

          {/* 2. Customer / User Portal Auth */}
          {portal === 'customer' && view === 'auth' && (
            <CustomerPortalPage
              onNavigateForgot={() => {
                window.history.pushState({ authView: 'forgot' }, '', window.location.href);
                setView('forgot');
              }}
              onSwitchPortal={handleSwitchPortal}
            />
          )}

          {/* 3. Customer Profile Webpage View */}
          {portal === 'customer' && view === 'profile' && (
            <CustomerProfilePage
              onSwitchPortal={handleSwitchPortal}
              onLogout={() => {
                setView('auth');
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('action');
                window.history.replaceState({}, '', newUrl.toString());
              }}
            />
          )}

          {/* 4. Agent / Technician Portal Auth */}
          {portal === 'agent' && view === 'auth' && (
            <AgentPortalPage
              onNavigateForgot={() => {
                window.history.pushState({ authView: 'forgot' }, '', window.location.href);
                setView('forgot');
              }}
              onSwitchPortal={handleSwitchPortal}
            />
          )}

          {/* 5. Agent Profile Webpage View */}
          {portal === 'agent' && view === 'profile' && (
            <AgentProfilePage
              onSwitchPortal={handleSwitchPortal}
              onLogout={() => {
                setView('auth');
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('action');
                window.history.replaceState({}, '', newUrl.toString());
              }}
            />
          )}

          {/* 6. Customer Forgot Password */}
          {portal === 'customer' && view === 'forgot' && (
            <CustomerForgotPasswordPage
              isAgent={false}
              onBackToSignIn={() => {
                if (window.history.state?.authView === 'forgot') {
                  window.history.back();
                } else {
                  setView('auth');
                }
              }}
            />
          )}

          {/* 7. Agent Forgot Password */}
          {portal === 'agent' && view === 'forgot' && (
            <AgentForgotPasswordPage
              onBackToSignIn={() => {
                if (window.history.state?.authView === 'forgot') {
                  window.history.back();
                } else {
                  setView('auth');
                }
              }}
            />
          )}
        </main>

        {view !== 'profile' && <AppFooter />}
      </div>

      <LanguageSelectionModal />
      <ToastNotification />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastNotificationProvider>
          <AppLayout />
        </ToastNotificationProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
