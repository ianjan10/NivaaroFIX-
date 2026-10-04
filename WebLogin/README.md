# NivaaroFix Authentication and Profile Portal

Modular React 19 and Vite authentication and profile platform with dedicated portals for Customers and Service Professionals, located in the `WebLogin/` directory.

---

## File Structure

```
WebLogin/
|-- public/
|   |-- brand/                        # High-resolution transparent brand logos & emblems
|   `-- project_image/                # Editorial showcase photography
|-- src/
|   |-- components/                   # Modular UI and Form Components
|   |   |-- AccountNotFoundModal.jsx  # Unregistered user notice dialog
|   |   |-- AppFooter.jsx             # Bottom footer with legal links
|   |   |-- AppHeader.jsx             # Top navigation header
|   |   |-- BrandLogo.jsx             # Official high-resolution brand logo
|   |   |-- DateOfBirthSelector.jsx   # Segmented DOB card (Day, Month, Year)
|   |   |-- GoogleOAuthModal.jsx      # Google Identity Services dialog
|   |   |-- IndianPhoneInput.jsx      # +91 Indian mobile input
|   |   |-- InteractiveBackgroundShowcase.jsx # Animated editorial image carousel
|   |   |-- LanguageSelectionModal.jsx# 10-language selector modal
|   |   |-- LiveCameraCaptureModal.jsx# Real camera photo capture component
|   |   |-- LocationCascadingSelect.jsx# 36 Indian states & 800+ districts selector
|   |   |-- PasswordStrengthValidator.jsx# Real-time password strength meter
|   |   |-- PhoneOtpModal.jsx         # 6-digit SMS OTP modal with bypass option
|   |   `-- ToastNotification.jsx     # Floating notification toast
|   |-- context/                      # State Providers
|   |   |-- LanguageContext.jsx       # 10 Indian languages context
|   |   |-- ThemeContext.jsx          # Theme state
|   |   `-- ToastNotificationContext.jsx # Toast dispatcher
|   |-- data/                         # Location & Translation Datasets
|   |   |-- indianStatesAndCitiesData.js # All 36 States & 800+ districts
|   |   `-- languageData.js           # 10-language localization dictionaries
|   |-- hooks/                        # Custom Hooks
|   |   `-- useFormAutoScroll.js      # Smooth error focus and scroll hook
|   |-- pages/                        # Page Views
|   |   |-- AgentForgotPasswordPage.jsx
|   |   |-- AgentPortalPage.jsx       # Pro sign-in & registration
|   |   |-- AgentProfilePage.jsx      # Pro profile, KYC & credentials
|   |   |-- CustomerForgotPasswordPage.jsx
|   |   |-- CustomerPortalPage.jsx    # Customer sign-in & registration
|   |   |-- CustomerProfilePage.jsx   # Customer profile & GPS detection
|   |   `-- PortalSelectionPage.jsx   # Dual-audience portal selection entry
|   |-- services/
|   |   |-- googleAuthService.js      # GIS Google OAuth 2.0 client
|   |   `-- gpsLocationService.js     # High-accuracy GPS & reverse geocoding
|   |-- styles/
|   |   |-- designSystem.css          # Auth design system tokens & animations
|   |   `-- InteractiveBackgroundShowcase.css
|   |-- App.jsx                       # Layout, routing & profile view state
|   `-- main.jsx                      # Bootstrap root
|-- tests/
|   |-- busy_state_and_realtime_e2e.test.mjs # Single-job lock & realtime lifecycle
|   |-- header_nav_my_bookings.test.mjs     # Header navigation regression test
|   |-- login_viewport_fitting.test.mjs     # Viewport-aware layout & fitting
|   `-- otp_and_unverified_profile.test.mjs # Phone OTP bypass & profile verification
|-- .env.example
|-- index.html
|-- package.json
`-- vite.config.js                    # Port 5500
```

---

## Key Capabilities

1. **Dual-Audience Authentication:** Seamlessly separated flows for Homeowners and Service Professionals.
2. **Google OAuth 2.0 Integration:** Real verified Google identity verification via Google Identity Services.
3. **High-Accuracy GPS Auto-Detection:** Nominatim reverse geocoding with detailed doorstep premise/street formatting.
4. **Phone OTP Verification & Bypass:** Optional SMS OTP validation with seamless "Continue (Verify Later)" capability.
5. **Multi-Lingual Support:** 10 Indian languages supported out of the box with zero missing translation keys.
6. **Live Camera Capture:** In-browser profile photo capture using the MediaDevices API.

---

## Running WebLogin

```bash
# From WebLogin folder:
npm run dev

# Run automated test suites:
npm test

# Build production bundle:
npm run build
```
