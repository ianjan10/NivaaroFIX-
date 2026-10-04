# NivaaroFix — On-Demand Home Services & Verification Platform

[![CI Pipeline](https://img.shields.io/badge/CI-Passing-2ea44f?style=flat-square&logo=github-actions)](https://github.com/your-org/nivaarofix/actions)
[![Node Version](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.6-4169e1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

NivaaroFix is an enterprise-grade, multi-lingual on-demand home repair marketplace connecting verified homeowners with background-checked master electricians and plumbers across India. Built with geospatial proximity dispatch, high-precision reverse geocoding, exclusive mutual job-locking, and real-time quotations.

[Architecture Guide](docs/ARCHITECTURE.md) • [REST API Reference](docs/API_DOCUMENTATION.md) • [Database Schema](docs/DATABASE_SCHEMA.md) • [Design Specs](docs/design_specs/README.md) • [Contributing](CONTRIBUTING.md)

---

## ⚡ Quick Reference: How to Run the Project

### Option A: Monorepo Commands (From Workspace Root)

Open three terminal windows in `d:/My Project`:

```bash
# Terminal 1: Start Backend API (Port 5000)
npm run dev:backend

# Terminal 2: Start Customer Marketplace Dashboard (Port 5173)
npm run dev:dashboard

# Terminal 3: Start Authentication & Profile Portal (Port 5500)
npm run dev:login
```

---

### Option B: Running Individually per Folder

```bash
# 1. Backend REST API
cd backend
npm run dev

# 2. Dashboard Marketplace
cd Dashboard
npm run dev

# 3. WebLogin Auth Portal
cd WebLogin
npm run dev
```

---

### 🌐 Access URLs & Ports

| Application | Port | Local URL | Role & Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Dashboard Marketplace** | `5173` | `http://localhost:5173` | Customer marketplace, booking drawer, service catalog, live quotes, and pro operations console. |
| **WebLogin Auth Portal** | `5500` | `http://localhost:5500` | Dual-audience sign-in, Google OAuth 2.0, phone OTP bypass, and profile completion. |
| **Backend REST & Dispatch API** | `5000` | `http://localhost:5000` | Express endpoints, geospatial H3 dispatch engine, door OTPs, and PostgreSQL schema. |
| **PostgreSQL Database** | `5432` | `localhost:5432/nivaarofix_db` | Relational ledger (`user_login`, `agent_login`, `service_requests`, `quotes`, `bookings`, `wallet_transactions`). |

---

## 🔒 Safe GitHub Migration & Drive Cleanup Guide

> **Is pushing to GitHub safe if I want to delete the folder to free disk space?**  
> **Yes, absolutely — provided you follow the 4 safety rules below before deleting your local directory.**

### Rule 1: Set Your GitHub Repository to PRIVATE
When creating your repository on [GitHub](https://github.com/new), select **Private**. This prevents anyone else from viewing your proprietary application code or architectural designs.

### Rule 2: Verify Sensitive Credentials (`.env`) Are Excluded
Environment files containing database passwords and secret keys must **NEVER** be pushed to GitHub.  
- The workspace `.gitignore` has been pre-configured to strictly ignore all `.env` files, production credentials, and temporary customer uploads.
- Template files (`.env.example`) are safely tracked so you can recreate your configuration anytime.

### Rule 3: Back Up Your PostgreSQL Database
> ⚠️ **CRITICAL NOTE:** Git only tracks files and code. It does **NOT** store data residing inside your local PostgreSQL database (tables, users, completed jobs, wallet transactions).  
Before wiping your local drive, generate a database SQL dump:

```bash
# Export your complete PostgreSQL database schema and data to a backup file
pg_dump -U postgres -d nivaarofix_db -F p -f nivaarofix_db_backup.sql
```
Save `nivaarofix_db_backup.sql` to your Google Drive, OneDrive, or an external USB drive.

### Rule 4: Create a Standalone Offline ZIP Backup (Optional but Recommended)
You can generate a clean, compressed offline archive (excluding `node_modules`, `dist`, and credentials):

```bash
# Creates nivaarofix_project_clean.zip (~39 MB) in workspace root
npm run package:zip
```
Store this clean ZIP in cloud storage as an emergency backup.

---

### Step-by-Step Commands to Push to GitHub

```bash
# 1. Initialize Git in the project root
git init -b main

# 2. Add all tracked files (strictly respects .gitignore)
git add .

# 3. Verify that no .env or node_modules files are staged
git status

# 4. Commit your complete, verified codebase
git commit -m "feat: complete NivaaroFix on-demand services platform with exclusive job-lock and GPS dispatch"

# 5. Link your private GitHub remote repository
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git

# 6. Push to GitHub
git push -u origin main
```

---

## 📋 Table of Contents

1. [Step-by-Step Setup Guide](#1-step-by-step-setup-guide)
2. [System Architecture & Data Flow](#2-system-architecture--data-flow)
3. [Project Directory Map](#3-project-directory-map)
4. [Core Features & State Machines](#4-core-features--state-machines)
   - [Exclusive Job-Lock System](#exclusive-job-lock-system)
   - [High-Accuracy GPS & Doorstep Reverse Geocoding](#high-accuracy-gps--doorstep-reverse-geocoding)
   - [Doorstep Safety OTP Verification](#doorstep-safety-otp-verification)
   - [Dynamic 30-Day Warranty Engine](#dynamic-30-day-warranty-engine)
   - [Real Google Identity Services OAuth 2.0](#real-google-identity-services-oauth-20)
   - [Multi-Lingual Localization (10 Indian Languages)](#multi-lingual-localization-10-indian-languages)
   - [9-Digit Sequential Partner ID Format](#9-digit-sequential-partner-id-format)
5. [Testing & Verification Suite](#5-testing--verification-suite)
6. [Design System & Typography Tokens](#6-design-system--typography-tokens)
7. [Troubleshooting & Common Issues](#7-troubleshooting--common-issues)

---

## 1. Step-by-Step Setup Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v14.0 or higher running on port `5432`

---

### Step 1: Database Setup
1. Connect to PostgreSQL via `psql` or pgAdmin:
   ```sql
   CREATE DATABASE nivaarofix_db;
   ```
2. Tables, spatial indices, and automated triggers will be verified and migrated automatically on server startup.

---

### Step 2: Environment Configuration
Create `backend/.env` (using `backend/.env.example` as reference):

```env
PORT=5000
NODE_ENV=development

PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_postgres_password
PG_DATABASE=nivaarofix_db

CLIENT_DASHBOARD_URL=http://localhost:5173
CLIENT_AUTH_URL=http://localhost:5500

JWT_SECRET=nivaarofix_jwt_secret_key_2026
```

---

### Step 3: Install Dependencies
```bash
# One-click installation across all workspaces:
npm run install:all
```

---

### Step 4: Run Database Migration & Verification
```bash
npm run db:reset
```

---

### Step 5: Start All Development Servers
Run the three servers concurrently using three terminal tabs:
- `npm run dev:backend` (Port 5000)
- `npm run dev:dashboard` (Port 5173)
- `npm run dev:login` (Port 5500)

---

## 2. System Architecture & Data Flow

```
+-------------------------------------------------------------------------------+
|                                Web Browser Client                             |
+---------------------------------------+---------------------------------------+
                                        |
                    +-------------------+-------------------+
                    |                                       |
                    v (Port 5173)                           v (Port 5500)
     +------------------------------+        +------------------------------+
     |    Dashboard Marketplace     |        |    WebLogin Auth Portal      |
     |  - Homepage & Showcase       | <----> |  - Customer Login & Signup   |
     |  - Services Catalog (Rates)  |  Cross |  - Partner / Pro Portal      |
     |  - Pro Operations Console    | Origin |  - Profile Completion (100%) |
     |  - My Bookings Live View     |  State |  - 10-Language Modal         |
     |  - GPS Doorstep Geocoding    |        |  - Phone OTP & Google OAuth  |
     +--------------+---------------+        +--------------+---------------+
                    |                                       |
                    +-------------------+-------------------+
                                        |
                                        v (Port 5000)
                         +------------------------------+
                         |      Node.js Express API     |
                         |  - /api/dispatch (H3 Engine) |
                         |  - /api/auth (User & Agent)  |
                         |  - /api/bookings (Work Orders)|
                         |  - /api/services & Catalog   |
                         +--------------+---------------+
                                        |
                                        v (Port 5432)
                         +------------------------------+
                         |      PostgreSQL Database     |
                         |        (nivaarofix_db)       |
                         |  - user_login & agent_login  |
                         |  - service_requests & quotes |
                         |  - bookings & wallet_tx      |
                         +------------------------------+
```

---

## 3. Project Directory Map

```
d:/My Project/
|-- backend/                          # Express REST API & Geospatial Dispatch Engine
|   |-- src/
|   |   |-- config/
|   |   |   |-- db.js                 # PostgreSQL connection pool & Schema v2.0 manager
|   |   |   `-- dispatchConfig.js     # Radius expansion tiers & dispatch rules
|   |   |-- db/
|   |   |   |-- reset.js              # Database reset & seed script
|   |   |   |-- schema_v2_migration.js# Schema v2.0 idempotent DDL migration
|   |   |   `-- cleanSeedData.js      # Clean test accounts & seed data
|   |   |-- modules/
|   |   |   |-- discovery/            # Smart keyword intent classifier & catalog
|   |   |   |-- dispatch/             # H3 spatial index & proximity match service
|   |   |   |-- providers/            # Pro presence & live GPS tracking
|   |   |   |-- quotes/               # Quotation submission, comparison & acceptance
|   |   |   |-- realtime/             # State synchronization & broadcast logic
|   |   |   `-- requests/             # Service request lifecycle & job locks
|   |   |-- routes/
|   |   |   |-- agentRoutes.js        # Professional profiles, availability & KYC
|   |   |   |-- authRoutes.js         # Customer/pro registration, login & Google OAuth
|   |   |   |-- bookingRoutes.js      # Work order creation & customer booking history
|   |   |   |-- dispatchRoutes.js     # Dispatch lifecycle, quotes & cancellation
|   |   |   `-- serviceRoutes.js      # Service catalog queries
|   |   |-- utils/
|   |   |   |-- geoDispatch.js        # Haversine distance, H3 index & radius expander
|   |   |   `-- idGenerator.js        # 9-digit sequential professional ID generator
|   |   `-- server.js                 # Server entry point & CORS configuration
|   |-- tests/                        # 5 E2E and integration test suites
|   |-- uploads/booking_photos/       # Secure customer photo storage
|   |-- .env.example                  # Backend environment template
|   `-- package.json
|
|-- Dashboard/                        # Primary Customer & Pro Application (React 19 + Vite)
|   |-- public/
|   |   |-- brand/                    # High-resolution transparent brand logos & emblems
|   |   `-- project_image/            # Editorial photography & service visuals
|   |-- src/
|   |   |-- assets/                   # Bundled trade images (electrician, plumber)
|   |   |-- components/               # Modular UI components
|   |   |   |-- BrandLogo.jsx         # Responsive brand logo component
|   |   |   |-- InteractiveBookingModal.jsx # Multi-step booking drawer with live GPS
|   |   |   |-- TopNavbar.jsx         # Header navigation & account menu
|   |   |   |-- AppFooter.jsx         # Balanced 4-column footer
|   |   |   |-- BookingInvoiceModal.jsx
|   |   |   |-- BookingTrackLiveModal.jsx
|   |   |   `-- CustomerProfileIncompleteModal.jsx
|   |   |-- context/                  # React Context providers (Booking, Partner, Language)
|   |   |-- data/                     # Translation dictionaries & catalog rate cards
|   |   |-- hooks/                    # Custom hooks (useModalFocusTrap, useScrollReveal)
|   |   |-- pages/
|   |   |   |-- HomePage.jsx          # 11-section editorial showcase
|   |   |   |-- ServicesPage.jsx      # Electrician & Plumber upfront rate cards
|   |   |   |-- MyBookingsPage.jsx    # Real-time request tracking, quotes & status
|   |   |   |-- PartnerConsolePage.jsx# Professional live dispatch, job lock & wallet
|   |   |   `-- AboutPage.jsx         # Brand story & standards
|   |   |-- styles/                   # Dashboard design system & console styles
|   |   `-- utils/                    # Profile strength evaluator & formatting helpers
|   |-- tests/                        # 25 regression and UI test suites
|   |-- .env.example
|   `-- package.json
|
|-- WebLogin/                         # Dedicated Authentication & Profile Portal (React 19 + Vite)
|   |-- public/
|   |   |-- brand/                    # Brand assets & emblems
|   |   `-- project_image/            # Editorial showcase photography
|   |-- src/
|   |   |-- components/               # Auth form controls, phone OTP & live camera
|   |   |-- context/                  # Language, Theme, and Toast contexts
|   |   |-- data/                     # 36 Indian States & 800+ districts dataset
|   |   |-- pages/
|   |   |   |-- CustomerPortalPage.jsx# Customer phone/email sign-in & registration
|   |   |   |-- AgentPortalPage.jsx   # Professional partner onboarding & verification
|   |   |   |-- CustomerProfilePage.jsx# 100% profile completion & GPS detection
|   |   |   `-- AgentProfilePage.jsx  # Trade skill, credentials & KYC management
|   |   |-- services/                 # GPS reverse geocoding & Google OAuth client
|   |   `-- styles/                   # Auth portal design system
|   |-- tests/                        # 4 responsive fitting & lifecycle test suites
|   |-- .env.example
|   `-- package.json
|
|-- scripts/                          # Automation & packaging scripts
|   |-- create_zip.ps1                # Clean workspace packaging utility
|   |-- generateBrandAssets.ps1       # Brand asset generator
|   `-- injectComprehensiveTranslations.mjs # 10-language translation synchronizer
|
|-- tests/
|   `-- system_health.test.mjs        # Master E2E integration test suite
|-- .gitignore                        # Comprehensive root ignore rules
|-- package.json                      # Master workspace scripts
`-- README.md                         # Documentation & operational guide
```

---

## 4. Core Features & State Machines

### Exclusive Job-Lock System
NivaaroFix enforces strict single-job mutual exclusivity to prevent concurrent double-booking and protect technician availability:

```
[Open / Broadcasted] ──> [Quoting] ──> [Accepted] ──> [En Route] ──> [OTP Verified] ──> [In Progress] ──> [Completed]
                                            │
                                            └──> [Cancelled] (Re-broadcasted or Closed)
```

1. **Lock Trigger**: Fires when the customer accepts a specific pro's quote (`Accepted` state).
2. **Auto-Withdrawal**: All competing quotes on the request are automatically marked `Withdrawn`.
3. **Customer Lock**: Customers cannot create new service requests while having any active request in `Accepted`, `En Route`, `OTP Verified`, or `In Progress`. The API rejects attempts server-side with `403 CUSTOMER_LOCKED`.
4. **Professional Lock**: On acceptance, the professional is force-locked to `availability_status = 'BUSY'` and `is_online = false`. The availability switch in Partner Console is disabled, and the pro is excluded from the live dispatch feed.
5. **Cancellation & Re-Broadcast**:
   - If the pro cancels, the request automatically reopens and re-broadcasts to nearby technicians.
   - If the customer cancels, the request is closed cleanly.
6. **2-Hour Timeout Safeguard**: Delayed requests (>2 hours without OTP verification) provide a "Cancel & Re-broadcast" action for customers.

---

### High-Accuracy GPS & Doorstep Reverse Geocoding
- **Nominatim Engine**: Reverse geocoding configured at `zoom=18` with `addressdetails=1` to capture building names, premise numbers, streets, and neighbourhoods.
- **Auto-Detection**: High-accuracy GPS triggers automatically on booking modal load and profile address fields without manual click requirements.
- **Progressive Proximity Dispatch**: Requests expand across calibrated radius tiers (`50m -> 100m -> 500m -> 1km -> 5km -> 10km`) using PostgreSQL earth distance and Uber H3 spatial indexing (`res8` / `res9`).

---

### Doorstep Safety OTP Verification
- A unique 4-digit security OTP is generated upon request creation.
- The customer presents the OTP upon technician arrival.
- The technician inputs the OTP into the Partner Console; the server verifies it before transitioning the job to `In Progress`.
- Payout is released to the technician's wallet only upon successful completion.

---

### Dynamic 30-Day Warranty Engine
- Every completed repair includes a 30-day service warranty backed by NivaaroFix.
- Dynamic warranty calculation tracks active days remaining and automatically transitions to expired status based on completion timestamps.

---

### Real Google Identity Services OAuth 2.0
- Full integration with Google Identity Services (GIS).
- Fetches real name, verified email, Google avatar, and Google sub ID directly from Google API.
- Stores credentials in PostgreSQL with `auth_provider = 'google'`.

---

### Multi-Lingual Localization (10 Indian Languages)
- Fully translated across: English (`en`), Hindi (`hi`), Marathi (`mr`), Bengali (`bn`), Tamil (`ta`), Telugu (`te`), Kannada (`kn`), Urdu (`ur`), Gujarati (`gu`), Punjabi (`pa`).
- 100% key parity across all translation tables without placeholder fallbacks.

---

### 9-Digit Sequential Partner ID Format
- Formatted as `YYYYXXXXX` (e.g. `202600001` for the first technician registered in 2026).
- Guaranteed atomic uniqueness and year-resettable sequential numbering.

---

## 5. Testing & Verification Suite

The repository contains over 180 automated unit, integration, and end-to-end regression tests across all workspaces:

```bash
# Run ALL test suites across the entire monorepo:
npm run test:all
```

### Running Individual Workspace Suites

```bash
# 1. Master System Health (Ports 5000, 5173, 5500, DB, OAuth)
node tests/system_health.test.mjs

# 2. Backend Dispatch, Quotation, Booking & CRUD Suites (41 tests)
npm --prefix backend test:all

# 3. Dashboard Navigation, Views, GPS & Design Suites (126 tests)
npm --prefix Dashboard test

# 4. WebLogin Viewport Fitting, Phone OTP & Busy State Suites (38 tests)
npm --prefix WebLogin test
```

### Production Build Verification
To ensure zero build errors and validate production bundles:
```bash
npm run build:all
```

---

## 6. Design System & Typography Tokens

| Token Name | Hex Value | Application |
| :--- | :--- | :--- |
| **Canvas Light** | `#FFFFFF` / `#F7F5F1` | Background canvas, card surfaces |
| **Deep Navy** | `#14181F` / `#1E3A5F` | Primary text, headers, dark buttons |
| **Forest Green** | `#0F4D3C` | Completed badges, Pro portal accents |
| **Brass Gold** | `#A9793C` | Warranty pills, active stages, star ratings |
| **Input Border** | `#E3DDD0` | Form field outlines, card borders |
| **Dark Canvas** | `#0E131A` | Dark mode background surfaces |

**Typography**:
- **Headlines & Numerical Displays**: `Fraunces` (Google Fonts serif)
- **Body Copy & Navigation**: `Plus Jakarta Sans` / `Inter` (Google Fonts sans-serif)
- **OTP Codes & Booking References**: `Space Grotesk` (Google Fonts monospace)

---

## 7. Troubleshooting & Common Issues

1. **Port in Use (`listen EADDRINUSE :::5000`):**
   ```powershell
   Get-NetTCPConnection -LocalPort 5000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   ```

2. **Database Connection Error (`ECONNREFUSED` on port 5432):**
   - Verify PostgreSQL service is running: `Get-Service -Name postgresql*`
   - Check password and credentials in `backend/.env`.

3. **Resetting Database to Fresh Seed State:**
   ```bash
   npm run db:reset
   ```

---

© 2026 NivaaroFix Technologies Private Limited. All rights reserved.
