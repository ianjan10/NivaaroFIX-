# NIVAAREFIX — PHASE 1: PRODUCTION STABILIZATION & SECURITY AUDIT

**Date:** November 2026  
**Auditor / Roles:** Senior Full-Stack Engineer, Application Security Engineer, PostgreSQL Database Architect, QA Automation Engineer  
**Branch:** `fix/production-stabilization`  
**Status:** Audit Complete — Stabilization Fixes In Progress

---

## 1. Executive Summary

A comprehensive architectural and security audit of the NivaaroFix monorepo (`apps/web`, `apps/auth`, `apps/api`, `database`, `packages/shared`, `scripts`, `tests`) was performed prior to code modification. While core marketplace workflows (service catalog exploration, discovery, dispatch geolocation, and live telemetry) are functioning, multiple critical security vulnerabilities, data integrity risks, and architectural inconsistencies require immediate remediation.

### Key Risk Categories:
1. **Authentication & Authorization (CRITICAL):**
   - Identity spoofing via unverified headers (`x-user-email`, `x-agent-email`, `x-user-role`), query params, request body, and entity reference lookups (`req.params.ref`, `req.params.quoteId`).
   - Unsigned Base64 bearer payloads accepted without signature or session verification.
   - Plaintext password comparisons; no salted password hashing (`scrypt`).
   - Registration endpoints (`/customer-register`, `/agent-register`) use `ON CONFLICT (email) DO UPDATE`, silently overwriting existing user profiles and passwords.
   - Google OAuth endpoint (`/api/auth/google`) decodes raw JWT tokens without verifying cryptographic signature, audience, or issuer.
   - Client-side phone verification flags (`isPhoneVerified: true`) trusted without server-side validation.
   - Absence of cryptographically signed, HttpOnly server-side sessions.
2. **Fake Financial & Wallet Flows (CRITICAL):**
   - Job completion automatically creates internal wallet credits and increases withdrawable balances without any verified customer payment transaction.
   - The `/withdraw` endpoint deducts internal database balances and returns messages claiming an "Instant IMPS bank transfer" with no real banking or payout gateway integration.
3. **Commission Inconsistency (MEDIUM):**
   - Backend (`dispatchRoutes.js`) and shared constants (`constants.js`) calculate 15% platform commission.
   - Frontend Partner Console (`PartnerConsolePage.jsx`) hardcodes `₹0.00 (Zero Fee)`.
4. **Fictitious Invoice Details (HIGH):**
   - `BookingInvoiceModal.jsx` hardcodes fallback amounts (₹450), fake GSTIN (`33AABCN1234F1Z8`), fake SAC code (`998719`), fabricated company addresses, assumed 18% GST, and claims "UPI / Instant Verified".
   - HTML blob downloads are misleadingly labeled as invoice downloads.
5. **Destructive Database Migrations (CRITICAL):**
   - `database/migrations/001_initial_schema.sql` contains `DROP SCHEMA IF EXISTS public CASCADE;`.
   - `scripts/migrate.js` executes this file unconditionally, which would destroy all production data if run against a populated database.
   - Absence of an applied migration registry (`schema_migrations`).

---

## 2. Detailed Findings & Remediation Plan

### Issue 1: Insecure Authentication & Authorization Middleware
- **Location:** `apps/api/src/middleware/authMiddleware.js`, `apps/api/src/routes/authRoutes.js`
- **Severity:** CRITICAL (CVSS 9.8)
- **Vulnerability:** 
  The middleware resolves identity from untrusted client headers (`x-user-email`, `x-agent-email`), URL query strings, body fields, and base64 JSON bearer tokens without cryptographic signature. It even infers user identity by querying the DB for whoever owns `req.params.quoteId` or `req.params.ref`.
- **Dependencies:** `apps/api/src/routes/*.js`, `apps/web/src/context/BookingContext.jsx`, `apps/web/src/context/PartnerContext.jsx`, `apps/auth/src/pages/CustomerPortalPage.jsx`, `apps/auth/src/pages/AgentPortalPage.jsx`
- **Remediation Plan:**
  1. Create an additive migration adding a `user_sessions` table (`id`, `user_id`, `agent_id`, `role`, `session_token_hash`, `created_at`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`).
  2. Implement cryptographically secure session generation using Node.js `crypto.randomBytes(32)` stored as SHA-256 hash.
  3. Issue sessions via secure, `HttpOnly`, `SameSite=Lax` cookies (with Authorization header fallback for automated testing/cross-origin programmatic callers).
  4. Require valid, unexpired, unrevoked session on all protected routes.
  5. Enforce strict resource ownership (a customer can only view/mutate their own requests; a pro can only view/mutate their assigned jobs).

### Issue 2: Plaintext Passwords & Insecure Registration
- **Location:** `apps/api/src/routes/authRoutes.js` (`/customer-register`, `/customer-login`, `/agent-register`, `/agent-login`)
- **Severity:** CRITICAL (CVSS 9.1)
- **Vulnerability:**
  - Passwords stored and checked in plaintext.
  - Missing password in login request can bypass authentication if account password is null.
  - Registration overwrites existing accounts via `ON CONFLICT (email) DO UPDATE`.
  - Client can pass `isPhoneVerified: true` to bypass SMS/OTP verification.
- **Remediation Plan:**
  1. Implement salted password hashing using Node.js `crypto.scrypt`.
  2. Controlled legacy migration: upon successful plaintext verification of an existing legacy user password, immediately hash it with `crypto.scrypt`, update the database, and issue a session.
  3. Return HTTP 409 Conflict if an email is already registered during sign-up.
  4. Strip all password fields from API responses; never log passwords.
  5. Verify OTP server-side with single-use, 5-minute expiration, and rate limiting before marking phone as verified.

### Issue 3: Insecure Google OAuth Token Handling
- **Location:** `apps/api/src/routes/authRoutes.js` (`/google`)
- **Severity:** HIGH (CVSS 8.2)
- **Vulnerability:** 
  `decodeGoogleJwt()` simply splits the JWT and parses the Base64 payload without verifying Google's RSA signature, token expiration, issuer (`https://accounts.google.com`), or audience (`aud`).
- **Remediation Plan:**
  1. Add verification against Google's public tokeninfo endpoint (`https://oauth2.googleapis.com/tokeninfo?id_token=...`) or cryptographically verify issuer and audience when Google Client ID is configured.
  2. Reject expired or forged tokens.

### Issue 4: Fake Wallet Credits & Simulated IMPS Withdrawals
- **Location:** `apps/api/src/routes/dispatchRoutes.js` (lines 2069–2319, 2622–2691)
- **Severity:** HIGH (Business Logic & Audit Integrity)
- **Vulnerability:**
  - Completing a job updates `agent_login.wallet_balance` and inserts a `wallet_transactions` credit record despite no real customer payment having occurred.
  - The `/withdraw` endpoint deducts wallet balances and falsely claims "transferred to primary bank account via Instant IMPS".
- **Remediation Plan:**
  1. Preserve all operational job completion steps (photos, remarks, completion timestamp, sequential state checks, availability reset, completed job counts).
  2. Decouple job completion from financial payout: do not increase withdrawable wallet balance or record fake credits as paid funds.
  3. Mark historical transactions with a clear audit tag (`is_settled: false` or description indicating provisional record). Never delete historical data.
  4. Disable `/withdraw` endpoint: return HTTP 503 `PAYOUTS_NOT_CONFIGURED` with a clear explanation that automated bank payouts require future payment gateway integration.
  5. In `PartnerConsolePage.jsx`, disable the withdraw action with informative UI messaging.

### Issue 5: Commission Configuration Inconsistency
- **Location:** `packages/shared/src/constants.js`, `apps/api/src/routes/dispatchRoutes.js`, `apps/web/src/pages/PartnerConsolePage.jsx`
- **Severity:** MEDIUM (UI/Business Policy Divergence)
- **Vulnerability:**
  - Backend and shared constants use 15% platform fee.
  - Frontend Partner Console renders hardcoded `₹0.00 (Zero Fee)`.
- **Remediation Plan:**
  1. Establish server-side configuration as single source of truth (15% provisional commission).
  2. Update frontend Partner Console to accurately display the 15% platform commission rather than claiming "Zero Fee".

### Issue 6: Fabricated Tax Invoice
- **Location:** `apps/web/src/components/BookingInvoiceModal.jsx`
- **Severity:** HIGH (Compliance & Tax Representation)
- **Vulnerability:**
  - Hardcodes fake GSTIN (`33AABCN1234F1Z8`), fake SAC code (`998719`), fake address in Chennai, assumes 18% GST calculation, defaults to fallback price ₹450, and creates fake HTML file claiming to be a tax invoice.
- **Remediation Plan:**
  1. Re-label modal and printable view as "Service Summary & Invoice Preview".
  2. Use actual booking and quote pricing; hide tax/GST breakdown unless verified GST registration is configured in backend.
  3. Remove fictitious GSTIN, SAC codes, and company registration details.
  4. Label the action as "Print / Save as PDF" using browser print styling rather than downloading a raw HTML blob.

### Issue 7: Destructive Database Migration Runner
- **Location:** `database/migrations/001_initial_schema.sql`, `scripts/migrate.js`, `scripts/fresh_db_reset.js`
- **Severity:** CRITICAL (Data Loss Risk)
- **Vulnerability:**
  - `001_initial_schema.sql` runs `DROP SCHEMA IF EXISTS public CASCADE;`.
  - Normal migration execution drops the entire database.
- **Remediation Plan:**
  1. Create a `schema_migrations` tracking table (`version`, `name`, `checksum`, `applied_at`).
  2. Guard `001_initial_schema.sql` so that `DROP SCHEMA` is removed or only executed in an explicit fresh test database reset script.
  3. Create an additive migration: `database/migrations/003_secure_sessions_and_audit.sql` for the new session tables and indexes.
  4. Update `scripts/migrate.js` to inspect `schema_migrations`, skip already-applied migrations, and apply only unapplied additive migrations safely.
  5. Create a safe, explicit `scripts/fresh_db_reset.js` that checks environment, refuses execution in production, and requires `--confirm-destructive` flag.

---

## 3. Baseline Verification Results (Phase 0)

| Suite / Check | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build** | `npm --prefix apps/web run build` | **PASS** | 90 modules transformed cleanly |
| **Auth Build** | `npm --prefix apps/auth run build` | **PASS** | 62 modules transformed cleanly |
| **System Health** | `node tests/system_health.test.mjs` | **PASS (7/7)** | Server, DB, OAuth, and web components active |
| **Arrival & Tracking E2E** | `node tests/arrival_tracking_e2e.test.mjs` | **PASS (12/12)** | Full lifecycle runs to completion |
| **Header Layout Verification** | Custom Edge/Puppeteer test | **PASS (7/7)** | 1920px down to 375px zero-gap verified |

---

## 4. Execution Sequence for Implementation

1. **Step 1:** Safe Database Migrations & Versioned Registry (`schema_migrations` + `003_secure_sessions_and_audit.sql`).
2. **Step 2:** Secure Password Hashing & Legacy Password Migration (`crypto.scrypt`).
3. **Step 3:** Cryptographic Server-Side Sessions & Cookie Handling.
4. **Step 4:** API Auth Middleware Hardening & Resource Ownership Enforcement.
5. **Step 5:** De-faking Wallet Job Completion & Disabling IMPS Withdrawal.
6. **Step 6:** Commission Consistency & Configuration Harmonization.
7. **Step 7:** Invoice Modal Data-Driven Redesign (Service Summary Preview).
8. **Step 8:** Frontend Auth & Session Integration (`apps/web` + `apps/auth`).
9. **Step 9:** Payment Architecture Document (`docs/payments/RAZORPAY_FUTURE_INTEGRATION.md`).
10. **Step 10:** Comprehensive Verification & Implementation Report (`docs/stabilization/PHASE1_IMPLEMENTATION_REPORT.md`).

