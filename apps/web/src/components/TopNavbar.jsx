import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import Logo from './Logo';
import SupportTicketModal from './SupportTicketModal';

export default function TopNavbar({
  currentView = 'home',
  onNavigate,
  user,
  agent,
  onOpenUserAuth,
  onLogoutUser,
  onLogoutAgent
}) {
  const { activeLanguageObj, setIsLangModalOpen, t, activeLanguage } = useLanguage();
  const { theme } = useTheme();
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const profileMenuTimeoutRef = useRef(null);
  const profileWrapperRef = useRef(null);
  const drawerRef = useRef(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [currentView]);

  // Listen for global support ticket open requests and hash triggers
  useEffect(() => {
    const handleSupportEvent = () => {
      setIsSupportModalOpen(true);
    };
    const handleHashCheck = () => {
      const h = (window.location.hash || '').toLowerCase();
      if (h.includes('#/help') || h.includes('#/support') || h.includes('#/ticket')) {
        setIsSupportModalOpen(true);
      }
    };
    handleHashCheck();
    window.addEventListener('nivaaro:open-support-ticket', handleSupportEvent);
    window.addEventListener('hashchange', handleHashCheck);
    return () => {
      window.removeEventListener('nivaaro:open-support-ticket', handleSupportEvent);
      window.removeEventListener('hashchange', handleHashCheck);
    };
  }, []);

  // Close mobile drawer on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target) && !e.target.closest('.nav-mobile-menu-btn')) {
        setIsMobileDrawerOpen(false);
      }
    };
    if (isMobileDrawerOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMobileDrawerOpen]);

  const handleLoginClick = () => {
    const lang = activeLanguage || 'en';
    const hash = window.location.hash.replace(/^#\/?/, '') || (currentView === 'home' ? '' : currentView);
    const returnTarget = hash ? `/${hash}` : '/';
    if (currentView === 'partner') {
      window.location.href = `http://localhost:5500?portal=agent&lang=${lang}&returnTo=${encodeURIComponent(returnTarget)}`;
    } else {
      window.location.href = `http://localhost:5500?portal=customer&lang=${lang}&returnTo=${encodeURIComponent(returnTarget)}`;
    }
  };

  const handleMouseEnter = () => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current);
    }
    setIsProfileMenuOpen(true);
  };

  const handleMouseLeave = () => {
    profileMenuTimeoutRef.current = setTimeout(() => {
      setIsProfileMenuOpen(false);
    }, 250);
  };

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [dropdownAvatarError, setDropdownAvatarError] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileWrapperRef.current && !profileWrapperRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeAccount = user?.isLoggedIn
    ? { ...user, type: 'user' }
    : (agent?.isLoggedIn ? { ...agent, type: 'agent' } : null);

  return (
    <header className="nivaaro-header-bar">
      <div className="nivaaro-nav-inner">
        {/* Left: Brand Logo + Primary Navigation Links (Home, Services, About, Partner Console) */}
        <div className="nav-left-group">
          <a
            href="#/"
            className="nav-logo-link"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('home');
              else window.location.hash = '#/';
            }}
            aria-label="NivaaroFix Home"
          >
            <Logo
              variant="horizontal"
              size={32}
              tone={theme === 'dark' ? 'light' : 'dark'}
              alt="NivaaroFix"
            />
          </a>

          <nav className="nav-primary-links" aria-label="Main Navigation">
            <button
              type="button"
              className={`nav-link-btn ${currentView === 'home' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('home')}
            >
              <span className="nav-link-text">{t.navHome || 'Home'}</span>
            </button>

            <button
              type="button"
              className={`nav-link-btn ${currentView === 'services' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('services')}
            >
              <span className="nav-link-text">{t.navServices || 'Services'}</span>
            </button>

            {activeAccount?.type === 'agent' && (
              <button
                type="button"
                className={`nav-link-btn ${currentView === 'partner' ? 'active-nav-link' : ''}`}
                onClick={() => onNavigate && onNavigate('partner')}
              >
                <span className="nav-link-text">{t.navPartnerConsole || 'Workspace'}</span>
              </button>
            )}

            {activeAccount?.type === 'user' && (
              <button
                type="button"
                className={`nav-link-btn ${currentView === 'bookings' ? 'active-nav-link' : ''}`}
                onClick={() => onNavigate && onNavigate('bookings')}
              >
                <span className="nav-link-text">{t.navBookings || 'My Bookings'}</span>
              </button>
            )}

            <button
              type="button"
              className={`nav-link-btn ${currentView === 'about' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('about')}
            >
              <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
            </button>
          </nav>
        </div>

        {/* Right: Language + Helpline + User / Agent Login or Registered Profile */}
        <div className="nav-right-group">
          {/* Language Switcher */}
          <button
            type="button"
            className="nav-btn-subtle nav-lang-trigger notranslate ignore"
            onClick={() => setIsLangModalOpen(true)}
            title="Select language / भाषा चुनें"
            aria-label="Select language"
            data-no-translate="true"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="notranslate ignore" data-no-translate="true">{(activeLanguage || 'en').toUpperCase()}</span>
          </button>

          {/* Help & Support Desk */}
          <div className="nav-help-wrapper">
            <button
              type="button"
              className="nav-btn-subtle nav-help-trigger"
              onClick={() => setIsSupportModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isSupportModalOpen}
              aria-label="Support and ticket desk"
              title="Help and Support (24-72h resolution)"
            >
              <span>{t.navHelp || 'Help'}</span>
            </button>
          </div>

          {/* Mobile Menu Toggle Button (Visible <= 900px) */}
          <button
            type="button"
            className="nav-mobile-menu-btn"
            onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileDrawerOpen}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isMobileDrawerOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>

          {/* User / Agent Registered Profile Dropdown (Only rendered if registered & authenticated with us) */}
          {activeAccount ? (
            <div
              ref={profileWrapperRef}
              className="nav-profile-menu-wrapper"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* Trigger Pill */}
              <button
                type="button"
                className={`nav-user-profile-btn ${isProfileMenuOpen ? 'menu-active' : ''}`}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="true"
                aria-label={`${activeAccount.name || 'Account'} Profile Menu`}
              >
                {(activeAccount.avatarUrl || activeAccount.avatar_url) && !avatarLoadError ? (
                  <img
                    src={activeAccount.avatarUrl || activeAccount.avatar_url}
                    alt={activeAccount.name || 'Account'}
                    className="nav-avatar-img"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadError(true)}
                  />
                ) : (
                  <span className={`user-avatar-initial ${activeAccount.type === 'agent' ? 'partner-avatar-initial' : ''}`}>
                    {(activeAccount.name || (activeAccount.type === 'agent' ? 'P' : 'U')).trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="user-display-first-name">{(activeAccount.name || 'Account').split(' ')[0]}</span>
                <svg
                  className={`nav-chevron-icon ${isProfileMenuOpen ? 'rotated' : ''}`}
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isProfileMenuOpen && (
                <div className="nav-profile-dropdown-card">
                  {/* User Profile Header */}
                  <div className="profile-dropdown-header">
                    {(activeAccount.avatarUrl || activeAccount.avatar_url) && !dropdownAvatarError ? (
                      <img
                        src={activeAccount.avatarUrl || activeAccount.avatar_url}
                        alt={activeAccount.name || 'Account'}
                        className="dropdown-avatar-lg"
                        referrerPolicy="no-referrer"
                        onError={() => setDropdownAvatarError(true)}
                      />
                    ) : (
                      <div className={`dropdown-avatar-lg-initial ${activeAccount.type === 'agent' ? 'partner-bg' : ''}`}>
                        {(activeAccount.name || (activeAccount.type === 'agent' ? 'P' : 'U')).trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="dropdown-user-info">
                      <div className="dropdown-user-name">{activeAccount.name || (activeAccount.type === 'agent' ? 'Professional' : 'Customer Account')}</div>
                      <div className="dropdown-user-contact">{activeAccount.email || activeAccount.phone}</div>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  {/* Actions / Navigation */}
                  <div className="dropdown-menu-list">
                    {activeAccount.type === 'user' ? (
                      <>
                        <button
                          type="button"
                          className="dropdown-menu-item user-profile-item"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            const sanitizedUser = user ? { ...user } : null;
                            const userDigits = (sanitizedUser?.phone || '').replace(/\D/g, '');
                            if (userDigits === '9876543210' || userDigits === '9876543220' || userDigits === '9876543211' || userDigits === '9840123456') {
                              sanitizedUser.phone = null;
                            }
                            const userPayload = encodeURIComponent(JSON.stringify(sanitizedUser || user));
                            window.location.href = `http://localhost:5500?portal=customer&action=profile&lang=${activeLanguage || 'en'}&user=${userPayload}`;
                          }}
                        >
                          <div className="dropdown-item-icon-box profile-icon-box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                          <div className="item-text-group">
                            <span className="item-title">{t.dropdownAccountProfile || 'Account Profile'}</span>
                          </div>
                          <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="dropdown-menu-item user-bookings-item"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            onNavigate && onNavigate('bookings');
                          }}
                        >
                          <div className="dropdown-item-icon-box bookings-icon-box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                          </div>
                          <div className="item-text-group">
                            <span className="item-title">{t.navBookings || 'My Bookings'}</span>
                          </div>
                          <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="dropdown-menu-item pro-profile-item"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            const sanitizedAgent = agent ? { ...agent } : null;
                            const agentDigits = (sanitizedAgent?.phone || '').replace(/\D/g, '');
                            if (agentDigits === '9876543210' || agentDigits === '9876543220' || agentDigits === '9876543211' || agentDigits === '9840123456') {
                              sanitizedAgent.phone = null;
                            }
                            const agentPayload = encodeURIComponent(JSON.stringify(sanitizedAgent || agent));
                            window.location.href = `http://localhost:5500?portal=agent&action=profile&lang=${activeLanguage || 'en'}&agent=${agentPayload}`;
                          }}
                        >
                          <div className="dropdown-item-icon-box pro-profile-icon-box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                          <div className="item-text-group">
                            <span className="item-title">{t.dropdownProProfile || 'My Profile'}</span>
                          </div>
                          <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="dropdown-menu-item pro-console-item"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            onNavigate && onNavigate('partner');
                          }}
                        >
                          <div className="dropdown-item-icon-box pro-console-icon-box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="3" width="20" height="14" rx="2" />
                              <line x1="8" y1="21" x2="16" y2="21" />
                              <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                          </div>
                          <div className="item-text-group">
                            <span className="item-title">{t.navPartnerConsole || 'Workspace'}</span>
                          </div>
                          <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="dropdown-menu-item pro-settlements-item"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            onNavigate && onNavigate('partner-settlements');
                          }}
                        >
                          <div className="dropdown-item-icon-box pro-settlements-icon-box">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="5" width="20" height="14" rx="2" />
                              <line x1="2" y1="10" x2="22" y2="10" />
                            </svg>
                          </div>
                          <div className="item-text-group">
                            <span className="item-title">Payouts &amp; Settlements</span>
                          </div>
                          <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="dropdown-divider" />

                  {/* Logout Button */}
                  <button
                    type="button"
                    className="dropdown-logout-btn"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      if (activeAccount.type === 'user') {
                        onLogoutUser && onLogoutUser();
                      } else {
                        onLogoutAgent && onLogoutAgent();
                      }
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>{t.navSignOut || 'Sign Out / Logout'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Unregistered / Not Logged In -> Show Log in Button */
            <button
              type="button"
              className="nav-login-btn"
              onClick={handleLoginClick}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="login-btn-full">{currentView === 'partner' ? (t.navPartnerLogin || 'Partner Login') : (t.navUserLogin || 'Log in')}</span>
              <span className="login-btn-short">{t.navUserLogin || 'Login'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileDrawerOpen && (
        <div className="nav-mobile-drawer" ref={drawerRef}>
          <div className="nav-mobile-drawer-inner">
            <nav className="nav-mobile-links" aria-label="Mobile Navigation">
              <button
                type="button"
                className={`nav-link-btn ${currentView === 'home' ? 'active-nav-link' : ''}`}
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onNavigate && onNavigate('home');
                }}
              >
                <span className="nav-link-text">{t.navHome || 'Home'}</span>
              </button>

              <button
                type="button"
                className={`nav-link-btn ${currentView === 'services' ? 'active-nav-link' : ''}`}
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onNavigate && onNavigate('services');
                }}
              >
                <span className="nav-link-text">{t.navServices || 'Services'}</span>
              </button>

              {activeAccount?.type === 'agent' && (
                <>
                  <button
                    type="button"
                    className={`nav-link-btn ${currentView === 'partner' ? 'active-nav-link' : ''}`}
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onNavigate && onNavigate('partner');
                    }}
                  >
                    <span className="nav-link-text">{t.navPartnerConsole || 'Workspace'}</span>
                  </button>
                  <button
                    type="button"
                    className={`nav-link-btn ${currentView === 'partner-settlements' ? 'active-nav-link' : ''}`}
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onNavigate && onNavigate('partner-settlements');
                    }}
                  >
                    <span className="nav-link-text">Payouts &amp; Settlements</span>
                  </button>
                </>
              )}

              {activeAccount?.type === 'user' && (
                <button
                  type="button"
                  className={`nav-link-btn ${currentView === 'bookings' ? 'active-nav-link' : ''}`}
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onNavigate && onNavigate('bookings');
                  }}
                >
                  <span className="nav-link-text">{t.navBookings || 'My Bookings'}</span>
                </button>
              )}

              <button
                type="button"
                className={`nav-link-btn ${currentView === 'about' ? 'active-nav-link' : ''}`}
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onNavigate && onNavigate('about');
                }}
              >
                <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
              </button>
            </nav>

            <div className="nav-mobile-help-divider" />

            <div
              className="nav-mobile-help-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsMobileDrawerOpen(false);
                setIsSupportModalOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsMobileDrawerOpen(false);
                  setIsSupportModalOpen(true);
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Click to raise or track support ticket"
            >
              <div className="nav-mobile-help-title">{t.helplineTitle || '24/7 Verified Support'}</div>
              <div className="nav-mobile-help-num">1800-890-FIX</div>
              <div className="nav-mobile-help-desc">Tap to generate a support ticket (24–72h)</div>
            </div>
          </div>
        </div>
      )}

      {/* Support Ticket Generation & Tracking Modal */}
      <SupportTicketModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        currentUser={user}
        currentAgent={agent}
      />
    </header>
  );
}
