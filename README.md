<div align="center">

<img src="docs/design_specs/logo-horizontal.png" alt="NivaaroFix Logo" width="360" />

### On-Demand Home Repair & Verified Technical Services Platform

[![Build & Test](https://img.shields.io/badge/Tests-180%2B%20Passing-2ea44f?style=flat-square&logo=github-actions)](https://github.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19.0-61dafb?style=flat-square&logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.6-4169e1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Security](https://img.shields.io/badge/Security-OTP%20Verified-blue?style=flat-square)](SECURITY.md)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Architecture Guide](docs/ARCHITECTURE.md) &bull; [API Documentation](docs/API_DOCUMENTATION.md) &bull; [Database Schema](docs/DATABASE_SCHEMA.md) &bull; [Security Policy](SECURITY.md)

</div>

---

## Featured Home Page

<div align="center">

<img src="docs/design_specs/3.png" alt="NivaaroFix Home Page Interface" width="880" />

<p><em>Home page interface &mdash; Upfront trade pricing, localized service catalog, and direct doorstep booking.</em></p>

</div>

---

## What is NivaaroFix?

Because the name alone does not explain its function, **NivaaroFix** is a closed-loop doorstep technical services platform for household electrical, plumbing, and essential utility maintenance.

Unlike open contractor directories or unverified lead brokers, NivaaroFix pairs verified homeowners with background-checked tradespeople through a structured 4-step workflow:

1. **Service Selection & Proximity Matching**: Homeowners choose fixed-rate or diagnostic services with automated doorstep address detection.
2. **Technician Dispatch & Custom Quoting**: Nearby certified professionals receive incoming requests within their service radius and submit competitive quotes.
3. **Doorstep OTP Handshake**: Upon arrival, work begins only after the technician enters the customer's unique 4-digit door OTP into their console.
4. **Verified Settlement & Warranty**: On completion, funds settle immediately into the technician's balance, backed by a 30-day workmanship warranty.

---

## Additional Platform Views

<div align="center">

| Partner Operations Console | Doorstep Service Booking Drawer |
| :---: | :---: |
| <img src="docs/design_specs/4.png" alt="Partner Operations Console" width="440" /> | <img src="docs/design_specs/1.png" alt="Doorstep Booking Interface" width="440" /> |
| *Live dispatch queue, active job-lock, and balance tracking* | *Building-level GPS resolution and service confirmation drawer* |

| Technician Credential Onboarding | Verified Trade Skills Management |
| :---: | :---: |
| <img src="docs/design_specs/2.png" alt="Technician Verification" width="440" /> | <img src="docs/design_specs/logo-horizontal.png" alt="NivaaroFix Brand Emblem" width="320" /> |
| *9-digit sequential ID issuance and trade certification* | *Standardized rates, safety checks, and zero-emoji UI standards* |

</div>

---

## Monorepo Architecture

The platform runs as a coordinated monorepo across three integrated applications:

| Application | Port | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `5173` | React 19, Vite | Customer marketplace, booking drawer, service catalog, and partner operations console |
| **WebLogin** | `5500` | React 19, Vite | Authentication portal, Google Identity OAuth 2.0, and technician credential verification |
| **Backend API** | `5000` | Node.js, Express | Geospatial dispatch engine, door OTP generation, quote matching, and SSE streaming |
| **PostgreSQL** | `5432` | PostgreSQL 18.6 | Relational data store, spatial indexing, user profiles, and audit ledger |

---

## Key Features

- **Geospatial Dispatch Mesh**: Calibrated proximity tiers connecting nearby available technicians without disclosing customer addresses prematurely.
- **Mutual Exclusive Job-Lock**: Prevents technician double-booking by enforcing a single active job lifecycle (`Accepted &rarr; En Route &rarr; OTP Verified &rarr; In Progress &rarr; Completed`).
- **Fraud-Proof Door OTP**: 4-digit code generated server-side ensures technicians cannot mark jobs started or completed without customer confirmation.
- **Multi-Lingual Experience**: Instant language switching across 10 Indian regional languages without runtime translation delays.
- **Audited Financial Balance**: Real database ledger tracking wallet earnings, settled payouts, and withdrawal requests with zero synthetic data.
- **30-Day Workmanship Warranty**: Automatic warranty logging linked to verified job completion records.

---

## Quickstart

### Prerequisites
- Node.js `20.x` or higher
- PostgreSQL `14+` running on port `5432`

### 1. Installation
```bash
# Install dependencies across all monorepo packages
npm run install:all
```

### 2. Environment Setup
Configure your database connection in `backend/.env`:
```env
PORT=5000
NODE_ENV=development

PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_password
PG_DATABASE=nivaarofix

CLIENT_DASHBOARD_URL=http://localhost:5173
CLIENT_AUTH_URL=http://localhost:5500
JWT_SECRET=nivaarofix_jwt_secret_key_2026
```

### 3. Launch Development Servers
Start all three services concurrently from the root directory:

```bash
# Terminal 1: Backend API (Port 5000)
npm run dev:backend

# Terminal 2: Customer Marketplace (Port 5173)
npm run dev:dashboard

# Terminal 3: Authentication Portal (Port 5500)
npm run dev:login
```

Access the applications:
- Customer Marketplace: [http://localhost:5173](http://localhost:5173)
- Technician Console: [http://localhost:5173/#/partner](http://localhost:5173/#/partner)
- Sign-In / Register: [http://localhost:5500](http://localhost:5500)

---

## Testing & Quality Assurance

The codebase includes automated unit, integration, and UI regression suites:

```bash
# Run all tests across the monorepo
npm run test:all

# Run Dashboard test suite (127 tests)
npm --prefix Dashboard test

# Run Backend test suite (41 tests)
npm --prefix backend test:all
```

---

## Security & Privacy Standards

- **Customer Privacy**: Full doorstep address is masked until a quote is explicitly accepted.
- **Safety Handoff**: Doorstep arrival and completion require customer-held OTP verification.
- **SQL Sanitization**: All database transactions utilize parameter-bound queries.
- For vulnerability reports and disclosure procedures, review [SECURITY.md](SECURITY.md).

---

<div align="center">
<sub>&copy; 2026 NivaaroFix Technologies. All rights reserved.</sub>
</div>
