# NivaaroFix Browser History & Navigation Architecture

## 1. Root Cause Analysis of Back Navigation Defect

### The Symptom
When a visitor navigated to Services (or any deep page) and opened the Login view (`/?portal=customer&lang=en`), pressing the browser Back button unexpectedly dumped the user on the Home page (`/#/`) or bounced them back to the login page, rather than returning to the referring page (e.g., Services).

### Root Causes Identified
1. **Hash Clobbering in Unauthenticated Booking Intent**:
   - In `apps/web/src/context/BookingContext.jsx`, clicking "Book" while logged out executed `window.location.hash = '#/login?next=/book'` on the active page before dispatching to `apps/auth` (`http://localhost:5500`).
   - This changed the browser history entry for the Services page from `#/services` to `#/login?next=/book`.
   - When the user pressed browser Back from the auth app, the browser returned to `http://localhost:5173/#/login?next=/book`.
   - `apps/web`'s `getViewFromHash()` evaluated the `login` token, fell back to `return 'home'`, and re-triggered `window.location.href`, bouncing the user or abandoning them on Home.
2. **Missing `pageshow` View Synchronization on Bfcache Restorations**:
   - Modern browsers restore cross-origin / cross-port navigations (e.g., `localhost:5500` -> `localhost:5173`) from the Back-Forward Cache (bfcache).
   - In bfcache restorations, `popstate` and `hashchange` events do **not** fire on `window`; only the `pageshow` event fires.
   - `apps/web`'s `pageshow` listener only synced `localStorage` credentials and omitted `handleUrlChange()`. React's view state remained stale or reset to `home`.
3. **Route Guards Used Push Navigation Instead of Replace**:
   - In `apps/web/src/App.jsx`, unauthenticated visits to protected routes (`#/bookings`, `#/book`, `#/partner`) redirected to login using `window.location.href = ...` rather than `window.location.replace(...)`.
   - Pressing Back on the login page popped back to the protected URL, which immediately re-triggered the route guard in an infinite bounce loop.
4. **Post-Login Redirections Used Push**:
   - On successful login, `CustomerPortalPage` and `AgentPortalPage` redirected to the dashboard using `window.location.href = ...`.
   - Pressing Back from the dashboard returned the user directly to the login form.
5. **Multi-Step Auth Flows Lacked Step History**:
   - Sign-up mode and Phone OTP verification only updated local React state (`setMode('signup')`, `setSignInOtpStep('verify')`) without recording history states.
   - Pressing Back during OTP verification or account creation bypassed the previous step and ejected the user from the auth screen.
6. **Query-Only Changes Polluted History**:
   - Selecting or switching portals in `apps/auth/src/App.jsx` invoked `window.history.pushState` rather than `window.history.replaceState`.
7. **Global 401 Interceptor Forced Redirections on Public Views**:
   - In `apps/web/src/App.jsx`, the global fetch interceptor reacted to any 401 status with `window.location.replace('http://localhost:5500?portal=customer&lang=en&returnTo=%2F')`.
   - When normal visitors or returning users loaded public pages, any background unauthenticated call bounced them straight to the login screen.
   - Fixed by restricting 401 redirection to protected views (`bookings`, `partner`, `book`).
8. **Missing `credentials: 'include'` on Background Requests**:
   - In `apps/web/src/context/BookingContext.jsx`, `loadUserBookings` and `loadMyRequests` fetched data without `{ credentials: 'include' }`, dropping the session cookie and causing 401 errors.
   - Fixed by ensuring all authenticated calls include session credentials.

---

## 2. History Rules & Invariants

Across NivaaroFix, all navigation adheres to the following rules:

| Flow / Scenario | Mechanism | Rationale |
| :--- | :--- | :--- |
| **User-initiated view / page change** (Navbar, links, "Log In" button) | `push` (`window.location.hash = ...`, `window.location.href = ...`) | Native Back button returns to previous page. |
| **Route guard redirects** (Unauthenticated user hitting protected URL) | `replace` (`window.location.replace(...)`) | Back never lands on a protected URL that bounces straight back to login. |
| **Post-login exit** | `replace` (`window.location.replace(...)`) | Back from dashboard never returns to login form. |
| **Query-only changes** (Language selection, portal switcher, tabs) | `replaceState` (`window.history.replaceState(...)`) | Does not accumulate clutter history entries. |
| **Multi-step flows** (Sign-in <-> Sign-up, Phone <-> OTP) | `pushState` with `{ authStep }` | Back navigates backward through steps within the view first, then exits. |
| **Missing state on refresh** | Graceful fallback | Defaults cleanly to step 1 (Sign-in / Phone entry). |
| **Already authenticated user hits login** | `replace` (`window.location.replace(...)`) | Immediately sent to dashboard without adding a loop entry in history. |
| **Bfcache restore (`pageshow`)** | Re-evaluate hash + re-check session | Never force navigation to home; re-render current view and invalidate stale state. |
| **After logout Back button** | `Cache-Control: no-store` + session verification | Back button cannot reveal cached private user data. |
| **Saved booking intent** | `sessionStorage` (`nivaaro_saved_booking_intent`) | Fully preserved across login and navigation. |

---

## 3. Implementation Summary

### `apps/web/src/App.jsx`
- `getViewFromHash`: Pure resolver without side-effect redirects or fallback mutations.
- `DashboardAppContent`: Mount effect detects direct visits to `#/login` and calls `window.location.replace` to auth.
- Route Guards (`currentView === 'bookings'`, `'book'`, `'partner'`): Use `window.location.replace` to forward unauthenticated visitors to auth.
- `handlePageShow`: Listens to `pageshow` to invoke `handleUrlChange()` and re-query `/api/auth/session`, ensuring current view is rendered correctly on bfcache restore.
- `openLogin`: Intelligently infers `returnTo` from current view/hash if omitted, preserving contextual return destination.

### `apps/web/src/context/BookingContext.jsx`
- In `initiateProtectedBooking`, removed `window.location.hash = '#/login?next=/book'`. The current view hash (e.g. `#/services`) is kept pristine so browser Back returns directly to the referring service panel.

### `apps/web/src/components/TopNavbar.jsx` & `AppFooter.jsx`
- Login trigger buttons compute relative return path (e.g. `returnTo=/services`) and pass it cleanly into the auth portal. Removed `window.location.hash = '#/login'`.

### `apps/auth/src/App.jsx`
- Added on-mount active session check (`/api/auth/session`): already logged-in users are redirected via `window.location.replace` to dashboard/returnTo.
- Converted `handleSelectPortal`, `handleSwitchPortal`, and `onLogout` to use `window.history.replaceState`.
- Added `popstate` support for modal/sub-views (Forgot Password).

### `apps/auth/src/pages/CustomerPortalPage.jsx` & `AgentPortalPage.jsx`
- Added multi-step history (`pushState({ authStep: 'signup' })`, `pushState({ authStep: 'otp' })`).
- Added `popstate` listener to step backward through auth flow before exiting.
- Converted all post-login redirections to `window.location.replace(...)`.
- Preserved `returnTo` destination across all authentication methods.

### `apps/api/src/middleware/authMiddleware.js` & `apps/api/src/routes/authRoutes.js`
- Added strict `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, `Expires: 0` headers to authenticated responses, preventing bfcache from leaking protected content after logout.
