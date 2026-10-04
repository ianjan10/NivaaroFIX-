import React from 'react';
import BrandLogo from './BrandLogo';

export default function AppFooter({
  currentPortal = 'customer',
  user,
  agent,
  onNavigateHome,
  onNavigateServices,
  onNavigateAbout,
  onNavigateBookings,
  onOpenAuth,
  onSwitchPortal
}) {
  const currentYear = new Date().getFullYear();

  const handleHomeClick = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.hash = '#/';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleServiceClick = (category = 'all') => {
    if (onNavigateServices) {
      onNavigateServices(category);
    } else {
      window.location.hash = '#/services';
    }
  };

  const handleAboutClick = () => {
    if (onNavigateAbout) {
      onNavigateAbout();
    } else {
      window.location.hash = '#/about';
    }
  };

  const handleBookingsClick = () => {
    if (onNavigateBookings) {
      onNavigateBookings();
    } else {
      window.location.hash = '#/bookings';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleAuthClick = () => {
    if (onOpenAuth) {
      onOpenAuth();
    } else {
      window.location.href = 'http://localhost:5500?portal=customer&action=login';
    }
  };

  const handleProfileClick = () => {
    if (agent?.isLoggedIn) {
      const agentPayload = encodeURIComponent(JSON.stringify(agent));
      window.location.href = `http://localhost:5500?portal=agent&action=profile&agent=${agentPayload}`;
    } else if (user?.isLoggedIn) {
      const userPayload = encodeURIComponent(JSON.stringify(user));
      window.location.href = `http://localhost:5500?portal=customer&action=profile&user=${userPayload}`;
    } else if (onOpenAuth) {
      onOpenAuth();
    } else {
      window.location.href = 'http://localhost:5500?portal=customer&action=profile';
    }
  };

  const handlePartnerClick = () => {
    if (onSwitchPortal) {
      onSwitchPortal('partner');
    } else {
      window.location.hash = '#/partner';
    }
  };

  return (
    <footer className="nivaaro-app-footer" aria-label="NivaaroFix Footer">
      <div className="footer-max-container">
        {/* Main 4-Column Balanced Grid */}
        <div className="footer-columns-grid">
          
          {/* Column 1: Brand & Tagline */}
          <div className="footer-col-brand">
            <BrandLogo
              size="medium"
              isPartner={currentPortal === 'partner'}
              isDarkHeader={false}
              onClick={handleHomeClick}
            />
            <p className="footer-brand-tagline">
              Home repairs, handled with clarity.
            </p>
          </div>

          {/* Column 2: Services */}
          <div className="footer-nav-col">
            <h4 className="footer-col-heading">SERVICES</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-nav-link"
                  onClick={() => handleServiceClick('electrician')}
                >
                  Electrician
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-nav-link"
                  onClick={() => handleServiceClick('plumber')}
                >
                  Plumber
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-nav-link footer-nav-highlight"
                  onClick={() => handleServiceClick('all')}
                >
                  <span>View all services</span>
                  <span className="footer-link-arrow" aria-hidden="true">→</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="footer-nav-col">
            <h4 className="footer-col-heading">COMPANY</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-nav-link"
                  onClick={handleAboutClick}
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-nav-link"
                  onClick={handlePartnerClick}
                >
                  Professional
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Account */}
          <div className="footer-nav-col">
            <h4 className="footer-col-heading">ACCOUNT</h4>
            <ul className="footer-links-list">
              {user?.isLoggedIn ? (
                <>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handleBookingsClick}
                    >
                      My Bookings
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handleProfileClick}
                    >
                      Profile & Settings
                    </button>
                  </li>
                </>
              ) : agent?.isLoggedIn ? (
                <>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handlePartnerClick}
                    >
                      Professional Console
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handleProfileClick}
                    >
                      Professional Profile
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handleAuthClick}
                    >
                      Log in
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-nav-link"
                      onClick={handleBookingsClick}
                    >
                      My Bookings
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>

        </div>

        {/* Subtle 1px Neutral Divider */}
        <div className="footer-divider-line" />

        {/* Bottom Bar: Copyright & Minimal Legal Links */}
        <div className="footer-legal-bottom-bar">
          <p className="footer-copyright-text">
            © {currentYear} NivaaroFix. All rights reserved.
          </p>
          <div className="footer-legal-links-row">
            <span className="footer-legal-link">Privacy Policy</span>
            <span className="footer-legal-dot" aria-hidden="true">·</span>
            <span className="footer-legal-link">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
