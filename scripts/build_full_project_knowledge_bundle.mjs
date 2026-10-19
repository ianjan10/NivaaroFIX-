/**
 * NivaaroFix — Master LLM Project Knowledge Bundle Builder
 * Generates an end-to-end knowledge pack and packages the clean source code
 * into a single zip file for Claude, GLM, GPT-4, and Cursor.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const bundleDir = path.join(rootDir, 'NivaaroFix_Knowledge_Pack');
const zipFileName = 'NivaaroFix_Complete_Project_Knowledge_Bundle.zip';
const zipFilePath = path.join(rootDir, zipFileName);

console.log('🚀 Starting NivaaroFix LLM Knowledge Bundle Generator...');

// Clean up existing build directories
if (fs.existsSync(bundleDir)) {
  fs.rmSync(bundleDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}
fs.mkdirSync(bundleDir, { recursive: true });

// Subdirectories inside bundle
const docsDir = path.join(bundleDir, '00_PROJECT_KNOWLEDGE_BASE');
const sourceDir = path.join(bundleDir, 'source_code');
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

// ==============================================================================
// 1. GENERATE MASTER DOCUMENTATION FILES
// ==============================================================================

// 1.1 README.md
fs.writeFileSync(path.join(bundleDir, 'README.md'), `# NivaaroFix — Complete Project Knowledge Dossier & Source Bundle

This archive is an end-to-end, zero-hallucination knowledge package of the **NivaaroFix** platform. It has been curated specifically for Large Language Models (Claude 3.5/3.7, GLM-4/GLM-4V, GPT-4o, DeepSeek, Cursor) to give them complete, authoritative architectural, database, API, and domain lifecycle context.

## Archive Structure

\`\`\`
NivaaroFix_Knowledge_Pack/
├── README.md                                # This index file
├── 00_PROJECT_KNOWLEDGE_BASE/                # High-density LLM context documents
│   ├── 00_AI_INSTRUCTIONS_AND_MASTER_PROMPT.md # Ready-to-use Master System Prompt for AI models
│   ├── 01_PROJECT_OVERVIEW_AND_ARCHITECTURE.md# System architecture, monorepo layout, topology
│   ├── 02_DATABASE_SCHEMA_MODELS_AND_MIGRATIONS.md # Complete PostgreSQL schema, tables, triggers
│   ├── 03_FULL_REST_API_SPECIFICATION.md      # All REST endpoints, schemas, parameters, responses
│   ├── 04_WEBSOCKET_AND_REALTIME_TELEMETRY.md # Live WebSocket tracking & OSRM routing protocol
│   ├── 05_END_TO_END_BUSINESS_LOGIC_AND_LIFECYCLES.md # Complete booking, lock, OTP & payout lifecycle
│   ├── 06_FRONTEND_APPLICATIONS_AND_UI_STANDARDS.md # React apps (web & auth), design tokens, i18n
│   ├── 07_LLM_ANTI_HALLUCINATION_GUARDRAILS.md# Strict negative constraints & anti-hallucination rules
│   ├── 08_COMPLETE_CODEBASE_FILE_TREE_AND_ROLE_INDEX.md # File-by-file directory map of the monorepo
│   ├── 001_initial_schema.sql                 # Complete active PostgreSQL schema DDL
│   └── NIVAAROFIX_SYSTEM_MANIFEST.json        # Unified machine-readable JSON system manifest
└── source_code/                             # Clean repository source code
    ├── apps/
    │   ├── api/                             # Express REST API & WebSocket server
    │   ├── web/                             # Customer web & Partner console
    │   └── auth/                            # Auth & profile management portal
    ├── database/                            # Database migrations & reference data
    ├── packages/
    │   └── shared/                          # Domain constants & enums
    ├── scripts/                             # Dev & database automation scripts
    ├── tests/                               # E2E & system health test suites
    └── package.json, .env.example, etc.     # Root monorepo configuration
\`\`\`

## Quick Start for Claude / GLM Users

1. **System Prompt**: Copy the contents of \`00_PROJECT_KNOWLEDGE_BASE/00_AI_INSTRUCTIONS_AND_MASTER_PROMPT.md\` into your AI model's system prompt or initial conversation prompt.
2. **Context Feeding**: Upload this ZIP archive directly to Claude / GLM. The model will automatically have access to all documentation, database schema definitions, and full source code.
3. **No Hallucinations**: Refer to \`07_LLM_ANTI_HALLUCINATION_GUARDRAILS.md\` to keep the AI anchored strictly to verified system facts.
`);

// 1.2 00_AI_INSTRUCTIONS_AND_MASTER_PROMPT.md
fs.writeFileSync(path.join(docsDir, '00_AI_INSTRUCTIONS_AND_MASTER_PROMPT.md'), `# MASTER AI SYSTEM PROMPT: NIVAAROFIX ARCHITECT & ENGINEER

> **Usage:** Copy and paste the text below into Claude, GLM, GPT-4o, or Cursor as the System Prompt or first instruction prompt.

---

You are the Principal Systems Architect and Lead Full-Stack Engineer for **NivaaroFix**.
You have complete, authoritative understanding of the NivaaroFix codebase, architecture, database schemas, API contracts, WebSocket telemetry pipelines, and business domain rules.

### CORE GROUND TRUTHS & ZERO-HALLUCINATION RULES

1. **Technology Stack**:
   - Backend: Node.js (v18+) with Express.js (ES Modules, \`"type": "module"\`).
   - Frontend: React 18 + Vite (ES Modules, JSX). Monorepo structure with npm workspaces.
   - Database: **PostgreSQL 18** using the native \`pg\` library (\`pg.Pool\`).
     - **NEVER assume MongoDB, Mongoose, MySQL, SQLite, or Prisma.** All database queries use parameterized SQL via \`pool.query($1, $2, ...)\`.
   - Styling: **Pure Vanilla CSS** with custom class tokens and CSS variables.
     - **NEVER inject Tailwind CSS, Bootstrap, or Tailwind utility classes** unless specifically asked.
   - Real-time: Native \`ws\` WebSocket server on port 5000 (\`/ws/tracking\`) + Server-Sent Events (\`/api/realtime/*\`).

2. **Monorepo Structure & Network Ports**:
   - \`apps/api\` -> Port **5000** (REST API, WebSocket telemetry server, static uploads).
   - \`apps/web\` -> Port **5173** (Customer Home, Services Catalog, My Bookings, Partner Console).
   - \`apps/auth\` -> Port **5500** (Customer Login/Register, Partner Login/Register, Customer Profile, Agent Profile).
   - \`packages/shared\` -> Shared constants, enums, status strings.
   - Database -> Port **5432** (PostgreSQL \`nivaarofix_db\`).

3. **Database Architecture & ID Conventions**:
   - Primary Keys: \`BIGINT GENERATED ALWAYS AS IDENTITY\` (sequential 1, 2, 3...).
   - Public Identity Numbers (Atomic Calendar Sequence):
     - Customers: \`YYYY\` + 5 digits (e.g., \`202600001\`).
     - Professionals: \`YYYY\` + 5 digits (e.g., \`202600004\`).
     - Service Requests: \`YYYY\` + 6 digits (e.g., \`2026000013\`).
   - Legacy & Sync Tables: The active application uses \`user_login\`, \`agent_login\`, and \`service_requests\`. Bidirectional PostgreSQL database triggers (\`fn_sync_user_login_to_cust\`, \`fn_sync_agent_login_to_pro\`) automatically synchronize records with clean normalized tables (\`users\`, \`customers\`, \`professionals\`).

4. **Trade Categorization & Dispatch Rules**:
   - Valid trades for professionals: \`'electrician'\`, \`'plumber'\`, or \`'both'\`.
   - Service request categories: \`'electrician'\`, \`'plumber'\`, or \`'both'\`.
   - **Crucial Rule**: An electrician receives ONLY electrical jobs; a plumber receives ONLY plumbing jobs; a professional with trade \`'both'\` receives BOTH.
   - Matching queries use: \`WHERE (sr.category = agent.trade OR agent.trade = 'both')\`.

5. **Mutual Exclusivity Locking**:
   - **Customer Lock**: A customer can have only ONE active job in states \`['confirmed', 'on_the_way', 'arrived', 'in_progress']\`. Creating another booking while locked returns **403 CUSTOMER_LOCKED**.
   - **Provider Lock**: A professional can be engaged on only ONE active job in states \`['confirmed', 'on_the_way', 'arrived', 'in_progress']\`. Submitting quotes or taking jobs while locked returns **409 PROVIDER_BUSY**.

6. **Doorstep Physicality & Door OTP**:
   - Door OTP is a 4-digit numeric code generated at booking creation.
   - The OTP is **strictly hidden** until the professional's GPS location is validated within **50 meters** (doorstep geofence) of the customer's coordinates.
   - Moving from \`arrived\` to \`in_progress\` requires entering this 4-digit Door OTP.

7. **Completion & Payout Calculations**:
   - Transitioning from \`in_progress\` to \`completed\` requires **1 to 4 completion photos**.
   - Platform fee is **15%**. Net payout is **85%** of the accepted quote amount.
   - Earnings are credited to \`professionals.wallet_balance\` and recorded in \`wallet_transactions\`.

8. **Phone Authentication Rules**:
   - 6-digit OTP using the shared \`UnifiedOtpInput\` component.
   - Pre-verified test phone number: **\`8934678924\`** (immediately returns \`isPhoneVerified: true\`).
   - Other phone numbers start with \`isPhoneVerified: false\` until verified via the SMS OTP modal.

9. **Strict UI & Brand Standards**:
   - **ZERO EMOJIS**: Never use emojis in UI labels, notification toasts, badges, or buttons. Use crisp typography and SVG icons.
   - Brand Colors: Emerald green primary (\`#059669\` / \`#10b981\`), Navy/Slate dark (\`#0f172a\` / \`#1e293b\`).
   - Navigation Bar Order: **Services** -> **My Bookings** (or **Professional Console**) -> **About Us**.
`);

// 1.3 01_PROJECT_OVERVIEW_AND_ARCHITECTURE.md
fs.writeFileSync(path.join(docsDir, '01_PROJECT_OVERVIEW_AND_ARCHITECTURE.md'), `# NivaaroFix — System Architecture & Topology

## Executive Overview

**NivaaroFix** is a production-ready, hyper-local on-demand home service marketplace platform. It coordinates request broadcast, competitive quoting, exclusive single-job locking, real-time GPS telemetry with turn-by-turn road tracking, doorstep physical presence verification, photographic job completion proof, and automated wallet settlement.

## Monorepo Layout

\`\`\`
nivaarofix/
├── apps/
│   ├── api/          # Express REST API & WebSocket server (:5000)
│   ├── web/          # Customer portal & Professional Console (:5173)
│   └── auth/         # Unified Customer & Partner Authentication Portal (:5500)
├── packages/
│   └── shared/       # Shared domain constants, enums, status tokens
├── database/
│   ├── migrations/   # Sequential PostgreSQL migrations (001_initial_schema.sql)
│   └── reference-data/ # Service catalog and geographic seed data
├── docs/             # Technical specifications & design artifacts
├── scripts/          # Automation, packaging, and database tooling
└── tests/            # System health and end-to-end integration tests
\`\`\`

## High-Level Architecture Diagram

\`\`\`
+------------------------------------------------------------------------------+
|                              CLIENT LAYER                                    |
|                                                                              |
|   apps/web (:5173)                      apps/auth (:5500)                    |
|   +--------------------------+          +--------------------------------+   |
|   | - Customer Booking Flow  |          | - Customer Phone/Email Login   |   |
|   | - Live Booking Tracking  |          | - Partner Phone/ID Login       |   |
|   | - Professional Console   |          | - Profile Management (Cust/Pro)|   |
|   +--------------------------+          +--------------------------------+   |
+------------------------------------------------------------------------------+
                                       |
                 HTTP / REST (JSON)    |    WebSocket (/ws/tracking)
                                       v
+------------------------------------------------------------------------------+
|                             API GATEWAY LAYER                                |
|                                                                              |
|   apps/api (:5000)                                                           |
|   +----------------------------------------------------------------------+   |
|   |  HTTP Express Router                                                 |   |
|   |  - /api/auth       (Authentication, Session, Profile Sync)           |   |
|   |  - /api/agent      (Partner Status, Verification, Coordinates)       |   |
|   |  - /api/services   (Service Catalog, Categories, Pricing Tiers)      |   |
|   |  - /api/bookings   (Work Orders, Customer Bookings, Lifecycle)       |   |
|   |  - /api/dispatch   (Geo Matching, Quotations, Job Locks, OTP)        |   |
|   |                                                                      |   |
|   |  WebSocket Telemetry Engine (/ws/tracking)                           |   |
|   |  - Real-time GPS coordinates stream (3-5 second intervals)           |   |
|   |  - Doorstep geofence evaluation (50m doorstep arrival trigger)       |   |
|   |  - Live subscriber broadcast to customer tracking map                |   |
|   +----------------------------------------------------------------------+   |
+------------------------------------------------------------------------------+
                                       |
                                       v
+------------------------------------------------------------------------------+
|                             PERSISTENCE LAYER                                |
|                                                                              |
|   PostgreSQL 18 (:5432, nivaarofix_db)                                       |
|   +----------------------------------------------------------------------+   |
|   |  - users, customers, professionals                                   |   |
|   |  - service_requests, quotes, bookings, job_events                    |   |
|   |  - door_otps, completion_proofs, professional_gps_log                |   |
|   |  - wallet_transactions, payouts, reviews, code_sequences             |   |
|   |  - Synchronized via DB triggers: fn_sync_user_login_to_cust, etc.    |   |
|   +----------------------------------------------------------------------+   |
+------------------------------------------------------------------------------+
\`\`\`

## Key Architectural Principles

1. **Decoupled Keyless Maps Pipeline**:
   The development map stack runs completely keyless using Leaflet, OpenStreetMap, Carto Positron tiles, and OSRM road routing. In production, Google Maps Platform or Mapbox can be seamlessly plugged in via environment variables without touching UI or business logic.

2. **Progressive Geospatial Dispatch (H3 + Haversine)**:
   Service requests calculate customer coordinates and map them to an H3 Resolution 9 index (~100m hex cell). Dispatch searches out in concentric rings (k-ring 1 ~1.5 km, expanding up to 10 km) while filtering by trade specialization.

3. **Mutual Exclusivity Locks**:
   Prevents double-booking and concurrent job chaos. Both customers and providers have strict database-enforced job locks when an order is active.
`);

// 1.4 02_DATABASE_SCHEMA_MODELS_AND_MIGRATIONS.md
fs.writeFileSync(path.join(docsDir, '02_DATABASE_SCHEMA_MODELS_AND_MIGRATIONS.md'), `# NivaaroFix — Database Schema, Models & Data Invariants

## PostgreSQL Database Configuration

- Database Engine: **PostgreSQL 18**
- Database Name: \`nivaarofix_db\`
- User: \`postgres\`
- Port: \`5432\`
- Primary Keys: \`BIGINT GENERATED ALWAYS AS IDENTITY\` (strictly sequential)

---

## Entity Relationship & Schema Details

### 1. Atomic Sequence Generator (\`code_sequences\`)
Generates collision-free, human-readable public codes formatted as \`YYYY + N digits\`:
- \`next_entity_code('customer', 5)\` -> \`202600001\`
- \`next_entity_code('professional', 5)\` -> \`202600004\`
- \`next_entity_code('service_request', 6)\` -> \`2026000013\`

### 2. Core Identity Tables

#### \`users\`
Master authentication table.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`email\`: VARCHAR(255) UNIQUE NOT NULL
- \`phone\`: VARCHAR(32)
- \`password_hash\`: VARCHAR(255)
- \`role\`: VARCHAR(32) CHECK (role IN ('customer', 'professional', 'admin'))
- \`auth_provider\`: VARCHAR(32) ('local', 'google', 'phone_otp', 'agent_id', 'email')
- \`is_phone_verified\`: BOOLEAN DEFAULT FALSE
- \`is_active\`: BOOLEAN DEFAULT TRUE
- \`created_at\`, \`updated_at\`: TIMESTAMPTZ

#### \`customers\`
Customer profiles linked to \`users(id)\`.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`user_id\`: BIGINT REFERENCES users(id) ON DELETE SET NULL
- \`customer_code\`: VARCHAR(32) UNIQUE NOT NULL (e.g., \`202600001\`)
- \`name\`: VARCHAR(150) NOT NULL
- \`email\`: VARCHAR(255) UNIQUE NOT NULL
- \`phone\`: VARCHAR(32)
- \`default_address\`: TEXT
- \`lat\`: DOUBLE PRECISION
- \`lng\`: DOUBLE PRECISION
- \`h3_cell\`: TEXT

#### \`professionals\`
Service provider profiles linked to \`users(id)\`.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`user_id\`: BIGINT REFERENCES users(id) ON DELETE SET NULL
- \`professional_code\`: VARCHAR(32) UNIQUE NOT NULL (e.g., \`202600004\`)
- \`name\`: VARCHAR(150) NOT NULL
- \`email\`: VARCHAR(255) UNIQUE NOT NULL
- \`phone\`: VARCHAR(32)
- \`trade\`: VARCHAR(50) NOT NULL ('electrician', 'plumber', 'both')
- \`kyc_status\`: VARCHAR(32) DEFAULT 'verified'
- \`rating\`: NUMERIC(3,2) DEFAULT 5.00
- \`completed_jobs\`: INT DEFAULT 0
- \`is_online\`: BOOLEAN DEFAULT TRUE
- \`availability_status\`: VARCHAR(32) DEFAULT 'available' ('available', 'busy', 'offline')
- \`wallet_balance\`: NUMERIC(12,2) DEFAULT 0.00
- \`lat\`, \`lng\`: DOUBLE PRECISION
- \`h3_cell\`: TEXT

---

### 3. Service & Transactional Tables

#### \`service_requests\`
Primary work order table.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`service_request_code\`: VARCHAR(32) UNIQUE NOT NULL (e.g., \`2026000013\`)
- \`request_ref\`: VARCHAR(32) (synced alias for code)
- \`customer_id\`: BIGINT REFERENCES customers(id)
- \`user_email\`: VARCHAR(255)
- \`customer_phone\`: VARCHAR(32)
- \`service_title\`: VARCHAR(200) NOT NULL
- \`category\`: VARCHAR(50) NOT NULL ('electrician', 'plumber', 'both')
- \`issue_type\`: VARCHAR(100)
- \`problem_description\`: TEXT
- \`user_address\`: TEXT
- \`lat\`, \`lng\`: DOUBLE PRECISION
- \`status\`: VARCHAR(32) DEFAULT 'open'
  - Valid states: \`open\`, \`quoted\`, \`confirmed\`, \`on_the_way\`, \`arrived\`, \`in_progress\`, \`completed\`, \`cancelled\`
- \`accepted_quote_id\`: BIGINT
- \`assigned_professional_id\`: BIGINT REFERENCES professionals(id)
- \`door_otp\`: VARCHAR(8) (4-digit code generated during booking)
- \`started_at\`, \`arrived_at\`, \`completed_at\`: TIMESTAMPTZ

#### \`quotes\`
Quotes submitted by professionals for service requests.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`service_request_id\`: BIGINT REFERENCES service_requests(id) ON DELETE CASCADE
- \`request_id\`: BIGINT (synced alias)
- \`professional_id\`: BIGINT
- \`agent_id\`: BIGINT
- \`agent_name\`: VARCHAR(150)
- \`agent_email\`: VARCHAR(255)
- \`quote_amount\`: NUMERIC(10,2) NOT NULL CHECK (quote_amount > 0)
- \`notes\`: TEXT
- \`status\`: VARCHAR(32) DEFAULT 'pending' ('pending', 'accepted', 'rejected', 'withdrawn')
- \`created_at\`: TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

#### \`job_events\`
Audit log of every state transition for every service request.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`request_id\`: BIGINT REFERENCES service_requests(id) ON DELETE CASCADE
- \`event_type\`: VARCHAR(64) NOT NULL
- \`actor_role\`: VARCHAR(32) ('customer', 'professional', 'system')
- \`actor_id\`: VARCHAR(64)
- \`payload\`: JSONB
- \`created_at\`: TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

#### \`wallet_transactions\`
Ledger tracking all provider credits and payouts.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`professional_id\`: BIGINT NOT NULL
- \`amount\`: NUMERIC(10,2) NOT NULL
- \`transaction_type\`: VARCHAR(32) ('credit', 'debit')
- \`balance_after\`: NUMERIC(12,2)
- \`request_ref\`: VARCHAR(32)
- \`notes\`: TEXT
- \`created_at\`: TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

#### \`professional_gps_log\`
Breadcrumb GPS log tracking movement while a job is in \`on_the_way\` state.
- \`id\`: BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY
- \`professional_id\`: BIGINT NOT NULL
- \`service_request_id\`: BIGINT
- \`lat\`, \`lng\`: DOUBLE PRECISION NOT NULL
- \`speed\`, \`heading\`, \`accuracy\`: DOUBLE PRECISION
- \`recorded_at\`: TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

---

### 4. Compatibility Synchronization Triggers

To guarantee backwards compatibility with older components while enforcing strict normalization:
- \`trg_sync_user_login\` on \`user_login\` runs \`fn_sync_user_login_to_cust()\` to keep \`users\` and \`customers\` updated.
- \`trg_sync_agent_login\` on \`agent_login\` runs \`fn_sync_agent_login_to_pro()\` to keep \`users\` and \`professionals\` updated.
- \`trg_quotes_sync\` on \`quotes\` runs \`fn_quotes_sync()\` to synchronize \`request_id\` / \`service_request_id\` and \`agent_id\` / \`professional_id\`.
`);

// 1.5 03_FULL_REST_API_SPECIFICATION.md
fs.writeFileSync(path.join(docsDir, '03_FULL_REST_API_SPECIFICATION.md'), `# NivaaroFix — Complete REST API Specification

The API is served by Express on port **5000** at base path \`/api\`.

---

## 1. Authentication Routes (\`/api/auth\`)

### \`POST /api/auth/customer-register\`
Registers a new customer account.
- **Request Body**:
  \`\`\`json
  {
    "name": "Anjan Kumar",
    "email": "anjan@example.com",
    "phone": "9876543210",
    "password": "Password@123",
    "address": "13th Street, Bhel Nagar",
    "lat": 10.765514,
    "lng": 78.813522
  }
  \`\`\`
- **Response (201 Created)**:
  \`\`\`json
  {
    "success": true,
    "user": {
      "id": 1,
      "name": "Anjan Kumar",
      "email": "anjan@example.com",
      "customerCode": "202600001",
      "isPhoneVerified": false
    }
  }
  \`\`\`

### \`POST /api/auth/customer-login\`
Authenticates an existing customer via email & password, or phone OTP.
- **Request Body**: \`{ "email": "anjan@example.com", "password": "Password@123" }\`
- **Response (200 OK)**: Returns user profile and session token.

### \`POST /api/auth/agent-register\`
Registers a new service professional.
- **Request Body**:
  \`\`\`json
  {
    "name": "Rishi",
    "email": "rishi@gmail.com",
    "phone": "+91 9888877771",
    "password": "Password@123",
    "trade": "electrician" // or "plumber", or "both"
  }
  \`\`\`
- **Response (201 Created)**:
  \`\`\`json
  {
    "success": true,
    "agent": {
      "id": 4,
      "name": "Rishi",
      "email": "rishi@gmail.com",
      "partnerId": "202600004",
      "trade": "both",
      "isPhoneVerified": false
    }
  }
  \`\`\`

### \`POST /api/auth/verify-phone\`
Verifies phone number via 6-digit OTP.
- **Request Body**: \`{ "phone": "+91 8934678924", "otp": "123456", "role": "customer" }\`
- **Response (200 OK)**:
  \`\`\`json
  { "success": true, "message": "Phone number verified successfully.", "isPhoneVerified": true }
  \`\`\`

### \`POST /api/auth/agent-update-profile\`
Updates partner profile, coordinates, and trade specialization.
- **Request Body**: Accepts \`name\`, \`phone\`, \`trade\` (\`'electrician'\`, \`'plumber'\`, \`'both'\`), \`address\`, \`lat\`, \`lng\`.

---

## 2. Dispatch & Work Order Routes (\`/api/dispatch\`)

### \`GET /api/dispatch/nearby-requests?email=rishi@gmail.com\`
Returns available unassigned service requests within the partner's service radius.
- **Matching Rules**: Matches requests where \`status IN ('open', 'quoting')\` AND \`(sr.category = agent.trade OR agent.trade = 'both')\`.
- **Response (200 OK)**:
  \`\`\`json
  {
    "success": true,
    "requests": [
      {
        "id": "38",
        "requestRef": "2026000013",
        "serviceTitle": "Taps, Mixers & Showers",
        "category": "plumber",
        "problemDescription": "Tap leaking",
        "status": "open",
        "lat": 10.765514,
        "lng": 78.813522,
        "distanceKm": 0.015,
        "formattedDistance": "~15 m away"
      }
    ]
  }
  \`\`\`

### \`POST /api/dispatch/quotes\`
Submits a competitive quote from a professional.
- **Request Body**:
  \`\`\`json
  {
    "requestId": 38,
    "agentEmail": "rishi@gmail.com",
    "agentName": "Rishi",
    "quoteAmount": 450,
    "notes": "Includes washer replacement"
  }
  \`\`\`
- **Validation**: Quote amount must be > 0. If provider is already engaged on an active job, returns **409 PROVIDER_BUSY**.

### \`POST /api/dispatch/accept-quote\`
Customer accepts a quote.
- **Request Body**: \`{ "requestId": 38, "quoteId": 23 }\`
- **Actions**:
  1. Sets \`service_requests.status = 'confirmed'\`.
  2. Sets \`service_requests.accepted_quote_id = 23\`.
  3. Sets \`service_requests.assigned_professional_id\`.
  4. Triggers **Mutual Exclusivity Lock** for customer and provider.

### \`PATCH /api/dispatch/job-status\`
Advances the job state machine.
- **Request Body**:
  \`\`\`json
  {
    "requestId": 38,
    "status": "on_the_way", // or "arrived", "in_progress", "completed"
    "agentEmail": "rishi@gmail.com",
    "lat": 10.7655,
    "lng": 78.8135,
    "doorOtp": "9986" // Required when advancing from arrived -> in_progress
  }
  \`\`\`

### \`POST /api/dispatch/complete-job\`
Submits photographic completion proof and triggers financial settlement.
- **Request Body**:
  \`\`\`json
  {
    "requestId": 38,
    "agentEmail": "rishi@gmail.com",
    "photoUrls": ["/uploads/photo1.jpg"],
    "notes": "Replaced valve"
  }
  \`\`\`
- **Settlement Logic**:
  - Gross Quote: ₹450.00
  - Platform Fee (15%): ₹67.50
  - Net Payout (85%): ₹382.50 credited to provider wallet.
  - Job locks released immediately.

---

## 3. Booking Routes (\`/api/bookings\`)

### \`POST /api/bookings/create\`
Creates a new customer service request.
- **Validation**: If customer has an active job in states \`['confirmed', 'on_the_way', 'arrived', 'in_progress']\`, returns **403 CUSTOMER_LOCKED**.
- **Generates**:
  - Numeric code \`20260000xx\` via atomic sequence.
  - 4-digit cryptographic Door OTP.
  - H3 Resolution 9 index.

### \`GET /api/bookings/my-bookings?email=anjan@example.com\`
Fetches all historical and active bookings for the customer.
`);

// 1.6 04_WEBSOCKET_AND_REALTIME_TELEMETRY.md
fs.writeFileSync(path.join(docsDir, '04_WEBSOCKET_AND_REALTIME_TELEMETRY.md'), `# NivaaroFix — WebSocket & Real-Time Telemetry Pipeline

## WebSocket Engine Overview

The real-time tracking pipeline operates on port **5000** at path:
\`\`\`
ws://localhost:5000/ws/tracking
\`\`\`

It streams high-frequency GPS telemetry (every 3 to 5 seconds) from the service provider's mobile browser during the \`on_the_way\` state directly to the customer's live tracking map.

---

## Connection Protocol & Channels

Clients connect and identify themselves with query parameters:
\`ws://localhost:5000/ws/tracking?role=agent&requestId=38&email=rishi@gmail.com\`
\`ws://localhost:5000/ws/tracking?role=customer&requestId=38&email=anjan@example.com\`

---

## Message Schemas

### 1. Provider Telemetry Ping (Upstream from Provider)
Sent every 3–5 seconds by the professional's browser while in transit:
\`\`\`json
{
  "type": "agent_location",
  "requestId": 38,
  "lat": 10.765480,
  "lng": 78.813400,
  "speed": 18.5,
  "heading": 85.0,
  "accuracy": 8.0,
  "timestamp": 1791864000000
}
\`\`\`

### 2. Live Broadcast (Downstream to Customer)
Broadcast to customer connected to \`requestId: 38\`:
\`\`\`json
{
  "type": "provider_location_update",
  "requestId": 38,
  "provider": {
    "lat": 10.765480,
    "lng": 78.813400,
    "speed": 18.5,
    "heading": 85.0
  },
  "route": {
    "distanceKm": 0.45,
    "durationMinutes": 2
  }
}
\`\`\`

---

## Doorstep Geofence Validation

When the provider reaches the customer's building:
1. The server computes the Haversine distance between provider reported GPS and customer destination pin.
2. If \`distance <= 0.050 km\` (50 meters doorstep geofence), arrival is permitted.
3. If \`distance > 0.050 km\`, the server rejects premature arrival transitions with:
   \`"You're about X.X km from the customer's location."\`
4. Upon validated arrival, the Door OTP is revealed to both parties.
`);

// 1.7 05_END_TO_END_BUSINESS_LOGIC_AND_LIFECYCLES.md
fs.writeFileSync(path.join(docsDir, '05_END_TO_END_BUSINESS_LOGIC_AND_LIFECYCLES.md'), `# NivaaroFix — End-to-End Business Logic & Work Order Lifecycles

## Phase 1: Customer Onboarding & Authentication
1. **Registration & Phone Verification**:
   - Customer enters mobile number and requests OTP.
   - The shared \`UnifiedOtpInput\` component handles 6 digits with auto-advance and paste sanitization.
   - Special verified rule: Number \`8934678924\` is marked \`isPhoneVerified: true\` automatically.
2. **Precise Address Auto-Detection**:
   - Browser Geolocation API detects latitude and longitude.
   - Reverse geocoding resolves street address, district, and state automatically into the form.

---

## Phase 2: Booking Creation & H3 Dispatch
1. Customer selects a service (e.g., *Taps, Mixers & Showers* under *Plumber*).
2. The server verifies the customer does NOT have an ongoing job. If they do, returns \`403 CUSTOMER_LOCKED\`.
3. The server generates:
   - Atomic numeric reference code: \`2026000013\`
   - Cryptographic 4-digit Door OTP: \`9986\`
   - H3 Resolution 9 index
4. Status is set to \`open\`.

---

## Phase 3: Provider Matching & Competitive Quoting
1. Nearby providers query \`/api/dispatch/nearby-requests\`.
2. The query filters by trade:
   - Category \`plumber\` matches providers with trade \`plumber\` or \`both\`.
   - Category \`electrician\` matches providers with trade \`electrician\` or \`both\`.
3. Provider reviews job details and submits a quote (e.g., ₹450).
   - If provider is currently locked on another job, quote is blocked with \`409 PROVIDER_BUSY\`.
   - Rejects quotes <= 0.
4. Status transitions to \`quoted\`.

---

## Phase 4: Acceptance & Mutual Exclusivity Lock
1. Customer reviews incoming quotes in "My Bookings" and accepts one.
2. Status transitions to \`confirmed\`.
3. **Mutual Exclusivity Lock is triggered**:
   - Customer cannot create any new service requests.
   - Provider feed pauses and cannot submit quotes for other jobs.

---

## Phase 5: Transit, Live Telemetry & Doorstep Arrival
1. Provider taps "Start Travel" -> status becomes \`on_the_way\`.
2. Provider device connects to WebSocket \`ws://localhost:5000/ws/tracking\` and streams coordinates every 3-5 seconds.
3. Customer map renders live vehicle icon moving along road geometry.
4. Provider taps "I've Arrived":
   - Server checks GPS distance to customer doorstep pin.
   - If > 50 meters, rejected with error.
   - If <= 50 meters, accepted. Status becomes \`arrived\`.
   - Customer sees 4-digit Door OTP on their screen.

---

## Phase 6: Doorstep Handshake & In-Progress Execution
1. Customer shares the 4-digit Door OTP with the provider at the door.
2. Provider enters the 4-digit OTP.
3. Server validates OTP:
   - If wrong, increments attempt count. (Locks after 5 wrong attempts).
   - If correct, status transitions to \`in_progress\`.
4. Service work is executed physically.

---

## Phase 7: Completion Proof, Payout & Review
1. Provider snaps 1 to 4 photos of the completed work.
2. Provider taps "Complete Job":
   - Server validates presence of photos.
   - Status transitions to \`completed\`.
   - Gross: ₹450.00 | Platform Fee: ₹67.50 (15%) | Net Payout: ₹382.50 (85%).
   - Provider wallet balance is credited immediately.
   - Mutual exclusivity locks released.
3. Customer submits 1-5 star rating and optional feedback.
`);

// 1.8 06_FRONTEND_APPLICATIONS_AND_UI_STANDARDS.md
fs.writeFileSync(path.join(docsDir, '06_FRONTEND_APPLICATIONS_AND_UI_STANDARDS.md'), `# NivaaroFix — Frontend Applications & Design Standards

## Monorepo Frontend Architecture

### 1. \`apps/web\` (Vite + React 18, Port 5173)
- **HomePage**: Hero section, service category cards, high-trust branding.
- **ServicesPage**: Catalog of Electrician and Plumbing services with pricing.
- **CustomerBookingsPage**: "My Bookings" page tracking work order lifecycle, live map, Door OTP reveal.
- **PartnerConsolePage**: "Professional Console" displaying online/offline toggle, dispatch radius feed, incoming requests, quote submissions, active job tracker, and wallet balance.

### 2. \`apps/auth\` (Vite + React 18, Port 5500)
- **CustomerPortalPage**: Customer Sign In / Register (Phone OTP, Email/Password, Google).
- **AgentPortalPage**: Professional Sign In / Register (Partner ID, Phone OTP, Trade selection).
- **CustomerProfilePage**: Customer address management, location auto-detect, phone verification.
- **AgentProfilePage**: Partner profile management, trade specialization (Electrician, Plumber, or Both), KYC, location update.

---

## Header Navigation Standard

Across all pages and portals, the top navigation header strictly adheres to the standard order:
1. Brand Logo (**NivaaroFix: Elevating the Everyday**)
2. **Home**
3. **Services**
4. **My Bookings** (when logged in as Customer) OR **Professional Console** (when logged in as Partner)
5. **About Us**
6. Language Switcher & User Profile Menu

---

## UI Design & Brand Standards

- **Strict Zero-Emoji Rule**: All UI labels, status chips, toast messages, and buttons must use clean typography and SVG icons. Never use emojis.
- **Color Palette**:
  - Primary Brand Green: \`#059669\` (Emerald 600) / \`#10b981\` (Emerald 500)
  - Dark Slate / Navy: \`#0f172a\` / \`#1e293b\`
  - Status Indicators:
    - \`open\` / \`quoted\`: Amber/Yellow (\`#f59e0b\`)
    - \`confirmed\` / \`on_the_way\` / \`arrived\`: Blue (\`#2563eb\`)
    - \`in_progress\`: Indigo (\`#6366f1\`)
    - \`completed\`: Brand Green (\`#059669\`)
- **Multilingual Support**: Supports 9 languages (English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati) via the horizontal grid language modal.
`);

// 1.9 07_LLM_ANTI_HALLUCINATION_GUARDRAILS.md
fs.writeFileSync(path.join(docsDir, '07_LLM_ANTI_HALLUCINATION_GUARDRAILS.md'), `# NivaaroFix — Critical Anti-Hallucination Guardrails for LLMs

> **WARNING TO AI ASSISTANTS**: The following items are frequent failure modes for LLMs analyzing this project. Memorize and enforce these rules without exception.

1. **NO MONGO / NO PRISMA / NO ORM**:
   - The database is PostgreSQL 18 via \`node-postgres\` (\`pg.Pool\`).
   - Do NOT suggest MongoDB, Mongoose, Prisma, TypeORM, or Sequelize.
   - All queries are written in raw parameterized SQL.

2. **NO TAILWIND CSS**:
   - The frontend uses pure Vanilla CSS and CSS modules.
   - Do NOT generate Tailwind utility classes like \`flex items-center text-sm bg-blue-500\`.

3. **NO THIRD-PARTY SMS SDKs REQUIRED FOR LOCAL / DEV**:
   - Phone verification uses the built-in simulated SMS logic.
   - The phone number \`8934678924\` is hardcoded to be verified (\`isPhoneVerified: true\`) immediately.
   - Do NOT try to install Twilio or AWS SNS for development testing.

4. **DO NOT INVENT RANDOM ID FORMATS**:
   - Customer IDs follow \`YYYY + 5 digits\` (e.g., \`202600001\`).
   - Partner IDs follow \`YYYY + 5 digits\` (e.g., \`202600004\`).
   - Service Request References follow \`YYYY + 6 digits\` (e.g., \`2026000013\`).
   - They are NOT random UUIDs or MongoDB ObjectIDs.

5. **TRADE MATCHING IS STRICT**:
   - Rishi's trade is \`both\` (or \`electrician\` or \`plumber\`).
   - A plumbing job will NEVER appear for an electrician-only provider.
   - If a request is not appearing in a provider's feed, check their trade and category matching first!

6. **MUTUAL EXCLUSIVITY IS ENFORCED BY THE DATABASE**:
   - A customer cannot have 2 active bookings at the same time. Trying to book again returns \`403 CUSTOMER_LOCKED\`.
   - A provider cannot work on 2 active bookings at the same time. Trying to quote again returns \`409 PROVIDER_BUSY\`.

7. **GEOFENCING RADIUS FOR ARRIVAL**:
   - Arrival requires the provider to be within **50 meters** (\`0.05 km\`) of the customer's coordinates.
   - The Door OTP is hidden from everyone until arrival succeeds.

8. **PLATFORM FEE IS EXACTLY 15%**:
   - Commission is 15%. Provider receives 85%.

9. **ZERO EMOJIS IN UI**:
   - Do NOT add emoji icons (like 🚗, 🔧, ⚡, 📍, ✅) to text labels, headers, or buttons. Use SVG icons or clean typography.

10. **TEST SUITES**:
    - The root test suite is run with \`npm run test:all\`.
    - It runs:
      1. \`tests/system_health.test.mjs\`
      2. \`apps/api\` tests
      3. \`apps/web\` tests
      4. \`apps/auth\` tests
      5. \`tests/arrival_tracking_e2e.test.mjs\`
`);

// 1.10 08_COMPLETE_CODEBASE_FILE_TREE_AND_ROLE_INDEX.md
fs.writeFileSync(path.join(docsDir, '08_COMPLETE_CODEBASE_FILE_TREE_AND_ROLE_INDEX.md'), `# NivaaroFix — Monorepo File Tree & Component Inventory

## Monorepo Overview

\`\`\`
c:/NivaaroFIX-/
├── package.json                   # Root monorepo workspace configuration
├── .env.example                   # Environment variable template
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql # 1,015 lines of PostgreSQL DDL & triggers
├── packages/
│   └── shared/
│       └── src/
│           ├── constants.js       # Shared app constants (ports, fee rates, radius)
│           ├── enums.js           # Domain status enums & trade types
│           └── index.js           # Export entry point
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── server.js          # Express app entry & WebSocket telemetry server
│   │       ├── config/
│   │       │   └── db.js          # PostgreSQL pool connection & health check
│   │       └── routes/
│   │           ├── authRoutes.js  # Customer/agent registration, login, phone OTP
│   │           ├── agentRoutes.js # Provider status, profile updates, location updates
│   │           ├── bookingRoutes.js# Customer booking creation, lock checks, history
│   │           ├── dispatchRoutes.js# Request matching, quotes, job state machine, OTP
│   │           ├── serviceRoutes.js # Service category catalog
│   │           └── apiRoutes.js   # Miscellaneous utility endpoints
│   ├── web/
│   │   └── src/
│   │       ├── App.jsx            # Routing, language provider, state orchestration
│   │       ├── components/        # Navigation, Map modal, Language modal, Rating modal
│   │       └── pages/
│   │           ├── HomePage.jsx   # Hero banner, category cards, features
│   │           ├── ServicesPage.jsx# Interactive service catalog
│   │           ├── CustomerBookingsPage.jsx # "My Bookings" customer job tracker
│   │           └── PartnerConsolePage.jsx   # "Professional Console" provider workspace
│   └── auth/
│       └── src/
│           ├── App.jsx            # Auth portal navigation and routing
│           └── pages/
│               ├── CustomerPortalPage.jsx # Customer phone/email login & registration
│               ├── AgentPortalPage.jsx    # Partner phone/ID login & registration
│               ├── CustomerProfilePage.jsx# Customer address & phone verification
│               └── AgentProfilePage.jsx   # Partner trade, KYC & location settings
├── scripts/
│   ├── migrate.js                 # Database schema migration runner
│   ├── fresh_db_reset.js          # Clean database wiper and seed tool
│   └── start_services.ps1         # Windows PowerShell dev server launcher
└── tests/
    ├── system_health.test.mjs     # Endpoint health & connectivity test
    └── arrival_tracking_e2e.test.mjs # 12-step end-to-end booking and tracking test
\`\`\`
`);

// 1.11 Copy raw 001_initial_schema.sql into the knowledge base
const schemaPath = path.join(rootDir, 'database', 'migrations', '001_initial_schema.sql');
if (fs.existsSync(schemaPath)) {
  fs.copyFileSync(schemaPath, path.join(docsDir, '001_initial_schema.sql'));
}

// 1.12 Generate NIVAAROFIX_SYSTEM_MANIFEST.json
const manifest = {
  projectName: "NivaaroFix",
  version: "1.0.0",
  architecture: "Monorepo (npm workspaces)",
  domains: ["Home Services", "Electrician", "Plumber", "Hyperlocal Marketplace"],
  technologyStack: {
    backend: {
      runtime: "Node.js 18+",
      framework: "Express.js (ES Modules)",
      realtime: "ws (WebSocket) on /ws/tracking",
      database: "PostgreSQL 18 via pg.Pool",
      geospatial: "Uber H3 (Resolution 9) + Haversine Distance"
    },
    frontend: {
      framework: "React 18",
      bundler: "Vite",
      styling: "Vanilla CSS (Strictly NO Tailwind)",
      mapping: "Leaflet + OpenStreetMap / Carto Positron + OSRM"
    }
  },
  ports: {
    api: 5000,
    web: 5173,
    auth: 5500,
    database: 5432
  },
  idConventions: {
    customerCode: "YYYY + 5 digits (e.g. 202600001)",
    professionalCode: "YYYY + 5 digits (e.g. 202600004)",
    serviceRequestRef: "YYYY + 6 digits (e.g. 2026000013)"
  },
  jobLifecycleStates: [
    "open",
    "quoted",
    "confirmed",
    "on_the_way",
    "arrived",
    "in_progress",
    "completed",
    "cancelled"
  ],
  financialRules: {
    platformFeeRate: 0.15,
    providerPayoutRate: 0.85
  },
  geofenceRules: {
    doorstepProximityMeters: 50,
    outerGateRadiusMeters: 200
  },
  testVerificationNumber: "8934678924",
  supportedTrades: ["electrician", "plumber", "both"]
};
fs.writeFileSync(path.join(docsDir, 'NIVAAROFIX_SYSTEM_MANIFEST.json'), JSON.stringify(manifest, null, 2));

console.log('✅ Master documentation and system manifests generated successfully.');

// ==============================================================================
// 2. COPY CLEAN SOURCE CODE INTO STAGING DIRECTORY
// ==============================================================================

const excludePatterns = [
  'node_modules',
  'pgsql18',
  '.git',
  '.vscode',
  'dist',
  'build',
  '.system_generated',
  '.zip',
  '.log',
  'NivaaroFix_Knowledge_Pack',
  'NivaaroFix_Complete_Project_Knowledge_Bundle.zip',
  'nivaarofix_project_clean.zip'
];

function copyCleanFiles(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (excludePatterns.some(pat => entry.name.includes(pat) || srcPath.includes(pat))) {
      continue;
    }

    if (entry.isDirectory()) {
      copyCleanFiles(srcPath, destPath);
    } else {
      // Exclude heavy binary demo images (> 500KB) to ensure the zip is fast and lightweight for LLMs
      const stat = fs.statSync(srcPath);
      if (stat.size > 500000 && /\.(png|jpg|jpeg)$/i.test(entry.name)) {
        // Skip heavy demo image
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('📦 Copying clean source code into bundle...');
copyCleanFiles(rootDir, sourceDir);

// ==============================================================================
// 3. COMPRESS INTO THE FINAL ZIP FILE VIA POWERSHELL
// ==============================================================================

console.log('🗜️ Compressing into ZIP file...');
const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${bundleDir}', '${zipFilePath}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
execSync(psCommand, { stdio: 'inherit' });

// Clean up staging folder to leave workspace clean
try {
  fs.rmSync(bundleDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch {
  // Ignored if Windows file lock is temporarily active
}

const finalStats = fs.statSync(zipFilePath);
console.log(`\n🎉 SUCCESS! Complete LLM Project Knowledge Bundle created:`);
console.log(`File: ${zipFilePath}`);
console.log(`Size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
