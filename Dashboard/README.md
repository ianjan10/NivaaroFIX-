# NivaaroFix Dashboard Web Application

Front-facing marketplace, booking tracking, and technician operations console built with React 19 and Vite.

---

## Overview
The Dashboard web application features:
1. **11-Section Master Homepage**: Clean editorial design with Fraunces serif typography and interactive sections.
2. **Dual-Trade Services Marketplace**: Dedicated electrical and plumbing booking pages with transparent upfront pricing.
3. **About Page**: Brand story, 4-pillar trust model, leadership team, and corporate office directory.
4. **My Bookings Page**: Live status progress tracking, ETA countdown, invoice modal, reschedule modal, cancel modal, and star review system.
5. **Partner Console**: Dedicated technician portal for managing job requests, verifying door safety OTPs, viewing wallet balances, and exclusive job locking.
6. **10-Language Multi-Lingual Engine**: English default with 9 Indian languages.
7. **Direct Google Sign-In**: Integrated customer login modal with Google Identity Services (GIS).
8. **High-Accuracy Doorstep GPS**: Reverse geocoding with premise and street-level precision.

---

## Directory Structure

```
Dashboard/
|-- public/                       # Static public assets
|   |-- brand/                    # High-resolution transparent brand logos & emblems
|   |-- images/                   # High-res photography
|   `-- project_image/            # Editorial photography
|-- src/
|   |-- assets/                   # Bundled service images
|   |-- components/               # Modular UI components
|   |   |-- AboutClosingStatement.jsx
|   |   |-- AccountNotFoundModal.jsx
|   |   |-- AgentRoleNoticeModal.jsx
|   |   |-- AnimatedStatNumber.jsx
|   |   |-- AppFooter.jsx
|   |   |-- BookingCancelConfirmModal.jsx
|   |   |-- BookingContactProModal.jsx
|   |   |-- BookingInvoiceModal.jsx
|   |   |-- BookingRateModal.jsx
|   |   |-- BookingRescheduleModal.jsx
|   |   |-- BookingToast.jsx
|   |   |-- BookingTrackLiveModal.jsx
|   |   |-- BrandLogo.jsx
|   |   |-- BrandStatementAndCtaSection.jsx
|   |   |-- CustomerProfileIncompleteModal.jsx
|   |   |-- DualAudiencePanel.jsx
|   |   |-- FaqAccordionSection.jsx
|   |   |-- GoogleOAuthModal.jsx
|   |   |-- HeroSearchSection.jsx
|   |   |-- HowItWorksSection.jsx
|   |   |-- InsideVisitScrollStory.jsx
|   |   |-- InteractiveBackgroundShowcase.jsx
|   |   |-- InteractiveBookingModal.jsx
|   |   |-- LanguageSelectorModal.jsx
|   |   |-- LiveEtaTeaserSection.jsx
|   |   |-- PartnerJoinBanner.jsx
|   |   |-- PopularServicesGrid.jsx
|   |   |-- ProjectVisualTourSection.jsx
|   |   |-- ScrollRevealSection.jsx
|   |   |-- ServiceDetailModal.jsx
|   |   |-- ServicesPreviewSection.jsx
|   |   |-- TopNavbar.jsx
|   |   |-- TrustGuaranteeSection.jsx
|   |   |-- TrustStrip.jsx
|   |   |-- UserAuthModal.jsx
|   |   |-- VerifiedReviewsCarousel.jsx
|   |   `-- WhyNivaaroSection.jsx
|   |-- context/                  # React Context State Managers
|   |   |-- BookingContext.jsx
|   |   |-- LanguageContext.jsx
|   |   |-- LocationContext.jsx
|   |   |-- PartnerContext.jsx
|   |   `-- ThemeContext.jsx
|   |-- data/                     # Data stores
|   |   |-- bookingsData.js
|   |   |-- indianCitiesData.js
|   |   |-- languageData.js
|   |   |-- servicesCatalogData.js
|   |   `-- testimonialsData.js
|   |-- hooks/                    # Reusable React Hooks
|   |   |-- useModalFocusTrap.js  # Keyboard accessibility focus trap
|   |   `-- useScrollReveal.js    # Intersection observer reveal
|   |-- pages/                    # Views
|   |   |-- AboutPage.jsx
|   |   |-- HomePage.jsx
|   |   |-- MyBookingsPage.jsx
|   |   |-- PartnerConsolePage.jsx
|   |   `-- ServicesPage.jsx
|   |-- services/
|   |   `-- googleAuthService.js
|   |-- styles/
|   |   |-- dashboardDesignSystem.css
|   |   |-- InteractiveBackgroundShowcase.css
|   |   |-- PartnerConsole.css
|   |   `-- ProjectVisualTourSection.css
|   |-- utils/
|   |   |-- bookingUtils.js
|   |   |-- profileStrength.js
|   |   `-- useModalFocusTrap.js  # Re-exported from hooks
|   |-- App.jsx
|   `-- main.jsx
|-- tests/                        # 25 test suites
|-- .env.example
|-- index.html
|-- package.json
`-- vite.config.js                # Port 5173
```

---

## Running Dashboard

```bash
# Start development server on port 5173
npm run dev

# Run automated tests
npm test

# Build production bundle
npm run build
```
