# NivaaroFix Administrative System & Operations

This document covers administrative access, credential rotation, operator account creation, session policy, and audit requirements for NivaaroFix.

---

## 1. Initial Setup & Development Admin Account

During initial environment bootstrapping, a root administrator account is seeded using credentials defined strictly in your local, git-ignored `.env` file:

```bash
# In your local git-ignored .env file:
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=<your-secure-password>
```

To seed the initial administrator:

```bash
npm run admin:seed
```

### Safety Rules:
- The seed command is strictly idempotent: if the admin account already exists, the database is untouched and existing credentials are never overwritten.
- When `NODE_ENV=production`, `admin:seed` refuses to execute if default or weak passwords are used.
- In production, server startup immediately halts if any active admin account has the default development password.

---

## 2. Managing Admin Accounts via CLI

Administrative accounts cannot be registered via public registration forms. New staff accounts and credential rotations are provisioned through internal CLI tooling.

### Creating an Additional Admin Account

```bash
npm run admin:create -- --username <username> --role <owner|support|verifier> --password <strong-password> [--email <email>]
```

#### Roles:
- **`owner`**: Full administrative authority, financial ledger visibility, and system management.
- **`verifier`**: Identity, document, and professional onboarding verification authority.
- **`support`**: Booking dispute handling, customer/partner assistance, and complaint resolution.

### Rotating an Admin Password

```bash
npm run admin:passwd -- --username <username> --password <new-strong-password>
```

*Note:* Executing `admin:passwd` automatically invalidates all active sessions for the specified admin account across all devices.

---

## 3. Session & Security Policy

- **Session Identification:** Server-side sessions are tracked in `admin_sessions` and bound to an HTTP-only cookie named `admin_session` (`Path=/admin`, `SameSite=Strict`, `Secure` in production).
- **Timeouts:** Sessions enforce a **30-minute idle timeout** and a **12-hour absolute lifetime**.
- **CSRF Protection:** All state-changing endpoints (`POST`, `PUT`, `DELETE`) require a valid `X-CSRF-Token` header.
- **Rate Limiting:** Authentication is throttled to 5 failed attempts per 15-minute window per username and client IP. Accounts exceeding this threshold enter a temporary locked state rejecting all attempts with an HTTP 429 response and `Retry-After` header.
- **Timing Protection:** A dummy cryptographic derivation executes for non-existent usernames so response latency does not leak user existence.
- **Audit Logging:** Every login attempt (success, failure, lockout) and session termination is permanently recorded in the append-only `admin_audit_log` table. Passwords are never logged under any circumstance.



---

## 5. Approvals Module & Professional Verification System

The Approvals module provides a dedicated review workstation for professional document verification and a view-only customer registry.

### Core Architecture & Guarantees

1. **Strict FIFO Queue (First-In, First-Out)**:
   - Verification requests are strictly ordered by `queued_at ASC` (oldest submission first).
   - The queue list is grouped by submission day with sticky day headings (e.g. `Friday, 7 November, 4 requests`), calculated in `Asia/Kolkata` (IST, UTC+05:30).
   - If an application is sent back for corrections (`needs_attention`), resubmission generates a new `queued_at` timestamp, moves the request to the end of the queue, and marks it with the `Resubmitted` tag while preserving its original submission timestamp.
   - Profile lock policy: `name`, `mobile`, `trade`, and uploaded documents are locked while a request is `pending` or `in_review`. Non-critical edits (address, years of experience) are permitted and tag the request as `Details updated`.

2. **10-Minute Exclusive Concurrency Leases**:
   - Opening a request review initiates an exclusive 10-minute claim (`claimed_by_admin_id`, `claimed_until`).
   - If another operator attempts to open or decide a claimed request, the system displays a read-only lock banner: `Being reviewed by <admin> since <time>. Read only.`.
   - Silent heartbeats renew the claim every 3 minutes while the operator remains active on the workstation.
   - Operators with the **`owner`** role have override authority to take over any active claim.
   - Decisions enforce optimistic concurrency via an incrementing integer `version` column; stale updates fail with HTTP `409 Conflict`.

3. **60/40 Split Review Workstation**:
   - **Document Viewer (Left ~60%)**:
     - Multi-document tabs: Live portrait photo, Aadhaar front, Aadhaar back, and Driving licence (if provided).
     - Tools: Zoom in/out, fit-to-screen, 90° clockwise rotation, and side-by-side mode (live selfie alongside Aadhaar photo with 1:1 pixel rendering).
     - Security: Document previews are streamed through 5-minute signed, HMAC-SHA256 authenticated URLs (`/admin/documents/:id/view-url` -> `/admin/documents/view/:token`) requiring an active session cookie.
     - Watermarking: Dynamic overlay embeds the viewing administrator's username and IST timestamp.
   - **Operator Decision Panel (Right ~40%)**:
     - Professional details card with audited PII reveal.
     - Document details with fuzzy name-matching score (check if >=85% match). Full Aadhaar is never exposed (masked strictly as `XXXX XXXX 1234`).
     - Automated KYC & fraud warning checks (pass, warn, fail).
     - Audit history timeline tracking submissions, claims, releases, and prior rejection notes.
     - Sticky decision bar:
       - **Reject** (`R`): Requires selecting at least one item with an issue and an internal decision note.
       - **Request re-upload** (`U`): Requires marking at least one item with a problem and an instructional message to the professional.
       - **Approve** (`A`): Enabled only when all required items are marked `Looks good` and automated checks pass (or warning checkbox is acknowledged). Auto-advances to the next oldest request.

4. **Keyboard Workflow**:
   - `A`: Approve professional
   - `U`: Request document re-upload
   - `R`: Reject application
   - `J` / `K`: Switch document tabs
   - `Esc`: Skip and release active claim
   - `?`: Toggle keyboard cheatsheet

5. **Customer Registry (Read-Only)**:
   - Dedicated registry of customer accounts with sequential numeric customer codes (YYYY + 5 digits).
   - "New" badge displayed for registrations within the last 7 days that have not yet been opened (`customers.admin_seen_at IS NULL`). Opening a customer's details immediately stamps `admin_seen_at`.
   - Role Gating: Operators with the **`verifier`** role are restricted to professional approvals and receive JSON `403 Forbidden` on all customer endpoints.

---

## 6. Real-Time Admin Analytics & User Registries

The Admin Console includes real-time operational analytics and dedicated data views for customers and professionals.

### Real-Time Analytics Dashboard (`/admin`)

- **Header & Navigation Layout**:
  - Clean minimalist topbar with branding and clean alignment. Unnecessary titles and dev banners removed.
  - Sidebar dedicated exclusively to top-level navigation: `Dashboard`, `Approvals`, `Customers`, and `Professionals`. Bottom sidebar profile section removed.
  - Top-Right Admin User Controls: User avatar initial, username, and role badge dropdown with:
    - `Profile & Account`: Modal displaying operator ID, active role permissions, encrypted session security, and IST timezone.
    - `Sign out`: Triggers an explicit confirmation modal dialog ("Sign out of Admin Console?"), invalidates the server session, removes cookies, and performs an unbackable replace to `/admin/login`.
- **Live Synchronization & Control System**:
  - **Live Updates Toggle Switch**: Minimalist switch control to turn auto-sync on/off.
  - **Sync Status Pill**: Clear states: `Live` (emerald), `Paused` (slate), `Updating...` (amber spin), or `Sync Error` (red).
  - **Last Updated Time**: Subtle timestamp in `Asia/Kolkata` (`Sync: HH:MM IST`).
  - **Manual Refresh**: Icon button with tooltip and in-flight request protection (prevents overlapping or duplicate API queries).
  - **Real-Time Reactivity**: Connects to WebSocket endpoint `/ws/admin` for real-time reactivity when admin events occur; falls back to efficient 15-second polling when Live Updates is enabled.
- **Sub-Tabs**:
  - `Overview`: Platform-wide headline KPIs, daily registration trends, and service category demand.
  - `Customers`: Detailed customer sign-up trends, active vs. inactive breakdown, state and city distribution, top service-demand areas, most active customers, and recent registrations. (Guarded: Owner & Support roles only; Verifiers receive 403).
    - **Customers by Service Category**: Card and bar breakdown showing unique customer counts per category, booking stats (total, completed, in-progress, cancelled), top demand cities, and direct filtering into Customer Registry. Overall customer counts strictly deduplicate unique registered customers.
  - `Professionals`: Total, verified, pending, rejected, and suspended counts; online dispatch availability; multi-line registration vs. verification trends; and most active professionals.
    - **Professionals by Trade**: Real-time trade distribution breakdown (from PostgreSQL `professionals.trade`), verified/pending/rejected/active/online pros, service demand vs available pros (demand ratio), and direct filtering into Professional Registry.
- **Date Range Filters**:
  - `Today`, `Yesterday`, `7 Days`, `30 Days`, and `Custom Range` (with start and end date pickers).
  - All timeframes and daily timeline buckets are calculated strictly in `Asia/Kolkata` (IST, UTC+05:30).
- **Interactive SVG Data Visualizations**:
  - Responsive multi-line trend charts with hover tooltips and zero heavy external chart dependencies.
  - Horizontal distribution bars with count and percentage labels.
  - Graceful zero-filled empty states with no hardcoded or fake data.

### Customer Registry (`/admin/customers`)

- Dedicated searchable and filterable table: Customer Code, Name, Masked Phone, Location, Bookings (Total / Completed), Status, and Last Active timestamp.
- Role Access: Accessible to `owner` and `support` roles; `verifier` role receives HTTP 403 and has the tab hidden in the sidebar.
- Slide-out Profile Drawer:
  - Account status badge and verification flags.
  - Contact information with audited PII reveal (phone and email).
  - Booking and service request history with request code, category, status, date, and assigned professional.

### Professional Registry (`/admin/professionals`)

- Searchable and filterable table: Professional Code, Name, Trade, Masked Phone, Location, Completed Jobs, Rating, KYC Verification Status, Account Status, and Online Availability.
- Filters: Search input, Trade dropdown, KYC Status chips, and sorting (Newest, Oldest, Most Jobs, Top Rated, Name A-Z).
- Slide-out Profile Drawer:
  - Rating, completed job count, experience, and wallet balance.
  - Audited PII reveal for contact information.
  - KYC documents status and live selfie face-match scores.
  - Recent dispatched service requests and work orders.

### Audited PII Reveal Actions

- Administrative operators can view full phone numbers or email addresses by clicking "Reveal" in the customer or professional profile drawer.
- Requires providing an operational justification (e.g. "Investigating customer dispute #4019").
- Every reveal event is permanently recorded in `admin_audit_log` with the operator ID, target entity, field name, operational reason, IP address, and user agent.

