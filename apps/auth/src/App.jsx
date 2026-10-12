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

  // Sync payload params to localStorage and handle action=profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userParam = params.get('user');
    const agentParam = params.get('agent');
    const actionParam = params.get('action');
    const portalParam = params.get('portal');

    if (userParam) {
      try {
        localStorage.setItem('nivaaro-user', decodeURIComponent(userParam));
        localStorage.removeItem('nivaaro-agent');
      } catch (e) {
        console.error('Error saving user in WebLogin', e);
      }
    }

    if (agentParam) {
      try {
        localStorage.setItem('nivaaro-agent', decodeURIComponent(agentParam));
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
    window.history.pushState({}, '', newUrl.toString());
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
    window.history.pushState({}, '', newUrl.toString());
  };

  return (
    <div className="auth-viewport-root">
      {/* 1. Background: Plain Ivory Canvas with subtle dot-grid mesh on Profile view; Marketing Hero Photo on Auth view */}
      {view === 'profile' ? (
        <div className="auth-background-stage profile-canvas-bg" aria-hidden="true">
          <div className="bg-mesh-texture" style={{ opacity: 0.6 }} />
        </div>
      ) : (
        <div className="auth-background-stage" aria-hidden="true">
          <img
            src="/project_image/5.png"
            alt="Professional Electrician Working on Residential Electrical Panel"
            className="auth-bg-photo"
            loading="eager"
          />
          <div className="auth-light-overlay" />
        </div>
      )}

      {/* 2. Floating Minimal Interface Container */}
      <div className={`page-container ${view === 'profile' ? 'profile-view-mode' : ''}`}>
        {view !== 'profile' && <AppHeader currentPortal={portal} />}

        <main className={`auth-main-area ${view === 'profile' ? 'profile-main-area-reset' : ''}`}>
          {/* 1. Initial Selection: Ask Login as User / Agent */}
          {portal === 'select' && (
            <PortalSelectionPage onSelectPortal={handleSelectPortal} />
          )}

          {/* 2. Customer / User Portal Auth */}
          {portal === 'customer' && view === 'auth' && (
            <CustomerPortalPage
              onNavigateForgot={() => setView('forgot')}
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
                window.history.pushState({}, '', newUrl.toString());
              }}
            />
          )}

          {/* 4. Agent / Technician Portal Auth */}
          {portal === 'agent' && view === 'auth' && (
            <AgentPortalPage
              onNavigateForgot={() => setView('forgot')}
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
                window.history.pushState({}, '', newUrl.toString());
              }}
            />
          )}

          {/* 6. Customer Forgot Password */}
          {portal === 'customer' && view === 'forgot' && (
            <CustomerForgotPasswordPage
              isAgent={false}
              onBackToSignIn={() => setView('auth')}
            />
          )}

          {/* 7. Agent Forgot Password */}
          {portal === 'agent' && view === 'forgot' && (
            <AgentForgotPasswordPage
              onBackToSignIn={() => setView('auth')}
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
