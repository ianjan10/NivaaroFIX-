import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import BrandLogo from './BrandLogo';

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
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuTimeoutRef = useRef(null);
  const profileWrapperRef = useRef(null);

  const handleLoginClick = () => {
    if (currentView === 'partner') {
      window.location.href = `http://localhost:5500?portal=agent&lang=${activeLanguage || 'en'}`;
    } else {
      window.location.href = `http://localhost:5500?portal=customer&lang=${activeLanguage || 'en'}`;
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

  const activeAccount = (currentView === 'partner')
    ? (agent?.isLoggedIn ? { ...agent, type: 'agent' } : null)
    : (user?.isLoggedIn ? { ...user, type: 'user' } : (agent?.isLoggedIn ? { ...agent, type: 'agent' } : null));

  return (
    <header className="nivaaro-header-bar">
      <div className="nivaaro-nav-inner">
        {/* Left: Brand Logo + Primary Navigation Links (Home, Services, About, Partner Console) */}
        <div className="nav-left-group">
          <BrandLogo
            size="medium"
            isPartner={currentView === 'partner' || activeAccount?.type === 'agent'}
            isDarkHeader={false}
            onClick={() => onNavigate && onNavigate('home')}
          />

          <nav className="nav-primary-links" aria-label="Main Navigation">
            <button
              type="button"
              className={`nav-link-btn ${currentView === 'home' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('home')}
            >
              <span>{t.navHome || 'Home'}</span>
            </button>

            <button
              type="button"
              className={`nav-link-btn ${currentView === 'services' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('services')}
            >
              <span>{t.navServices || 'Services'}</span>
            </button>

            {/* If user is logged in, show My Bookings on header after Services and before About Us */}
            {(user?.isLoggedIn || activeAccount?.type === 'user') && (
              <button
                type="button"
                className={`nav-link-btn ${currentView === 'bookings' ? 'active-nav-link' : ''}`}
                onClick={() => onNavigate && onNavigate('bookings')}
              >
                <span>{t.navBookings || 'My Bookings'}</span>
              </button>
            )}

            {/* If professional is logged in, show Professional Console on header after Services and before About Us */}
            {activeAccount?.type === 'agent' && (
              <button
                type="button"
                className={`nav-link-btn ${currentView === 'partner' ? 'active-nav-link' : ''}`}
                onClick={() => onNavigate && onNavigate('partner')}
              >
                <span>{t.navPartnerConsole || 'Professional Console'}</span>
              </button>
            )}

            <button
              type="button"
              className={`nav-link-btn ${currentView === 'about' ? 'active-nav-link' : ''}`}
              onClick={() => onNavigate && onNavigate('about')}
            >
              <span>{t.navAbout || 'About Us'}</span>
            </button>
          </nav>
        </div>

        {/* Right: Language + Helpline + User / Agent Login or Registered Profile */}
        <div className="nav-right-group">
          {/* Language Switcher */}
          <button
            type="button"
            className="nav-btn-subtle nav-lang-trigger"
            onClick={() => setIsLangModalOpen(true)}
            title="Select language / भाषा चुनें"
            aria-label="Select language"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{(activeLanguage || 'en').toUpperCase()}</span>
          </button>

          {/* Help Helpline Dropdown */}
          <div className="nav-help-wrapper">
            <button
              type="button"
              className="nav-btn-subtle"
              onClick={() => setShowHelpTooltip(!showHelpTooltip)}
              aria-expanded={showHelpTooltip}
              aria-label="Support helpline"
            >
              {t.navHelp || 'Help'}
            </button>

            {showHelpTooltip && (
              <div className="nav-help-popover" onClick={() => setShowHelpTooltip(false)}>
                <div className="help-popover-title">{t.helplineTitle || '24/7 Verified Support'}</div>
                <div className="help-popover-number">1800-890-FIX</div>
                <div className="help-popover-desc">{t.helplineSub || 'Toll-free customer assistance'}</div>
              </div>
            )}
          </div>

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
                {activeAccount.avatarUrl && !avatarLoadError ? (
                  <img
                    src={activeAccount.avatarUrl}
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
                  width="12"
                  height="12"
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
                    {activeAccount.avatarUrl && !dropdownAvatarError ? (
                      <img
                        src={activeAccount.avatarUrl}
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
                            if (sanitizedUser?.dob && (JSON.stringify(sanitizedUser.dob).includes('1992') || JSON.stringify(sanitizedUser.dob).includes('2050'))) {
                              sanitizedUser.dob = null;
                            }
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
                            <span className="item-sub">{t.dropdownAccountProfileSub || 'Addresses & personal credentials'}</span>
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
                            <span className="item-sub">{t.dropdownBookingsSub || 'Track active & past service visits'}</span>
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
                            if (sanitizedAgent?.dob && (JSON.stringify(sanitizedAgent.dob).includes('1988') || JSON.stringify(sanitizedAgent.dob).includes('1992') || JSON.stringify(sanitizedAgent.dob).includes('2050'))) {
                              sanitizedAgent.dob = null;
                            }
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
                            <span className="item-title">{t.dropdownProProfile || 'Professional Profile'}</span>
                            <span className="item-sub">{t.dropdownProProfileSub || 'Trade skill, verification & credentials'}</span>
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
                            <div className="item-title-row">
                              <span className="item-title">{t.navPartnerConsole || 'Professional Console'}</span>
                              <span className="item-badge-live">{t.proLiveBadge || 'Live'}</span>
                            </div>
                            <span className="item-sub">{t.dropdownProConsoleSub || 'Real-time dispatch, active jobs & payouts'}</span>
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
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{currentView === 'partner' ? (t.navPartnerLogin || 'Partner Login') : (t.navUserLogin || 'Log in')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
