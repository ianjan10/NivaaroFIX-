/**
 * NivaaroFix — Database Design Specification Bundle Builder
 * Generates an end-to-end database architecture dossier and packages it
 * into a single zip file specifically for ChatGPT to understand the database design.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const bundleDir = path.join(rootDir, 'NivaaroFix_Database_Design_Package');
const zipFileName = 'NivaaroFix_Database_Complete_Design.zip';
const zipFilePath = path.join(rootDir, zipFileName);

console.log('🚀 Starting NivaaroFix Database Design Bundle Generator...');

// Clean up existing build directories
if (fs.existsSync(bundleDir)) {
  fs.rmSync(bundleDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}
fs.mkdirSync(bundleDir, { recursive: true });

// ==============================================================================
// 1. README.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, 'README.md'), `# NivaaroFix — Complete PostgreSQL Database Design & Architecture Specification

This package contains the complete, authoritative database architecture specification for **NivaaroFix**. It is designed specifically for **ChatGPT** (GPT-4 / GPT-4o / ChatGPT Plus) to understand every table, column, constraint, relationship, trigger, sequence, and geospatial indexing design in depth.

---

## Package Contents

\`\`\`
NivaaroFix_Database_Design_Package/
├── README.md                                      # This directory overview
├── 00_CHATGPT_SYSTEM_PROMPT_DATABASE_DESIGN.md   # Copy-paste prompt for ChatGPT context
├── 01_DATABASE_ARCHITECTURE_AND_DESIGN_OVERVIEW.md# High-level architecture, ER diagrams, numbering conventions
├── 02_COMPLETE_DATA_DICTIONARY_ALL_TABLES.md     # Line-by-line dictionary of all 22 database tables
├── 03_STORED_FUNCTIONS_TRIGGERS_AND_SEQUENCES.md # PL/pgSQL atomic sequence generator & sync triggers
├── 04_GEOSPATIAL_AND_INDEXING_STRATEGY.md        # Uber H3 Resolution 9, Haversine formula, spatial indexes
├── 05_TRANSACTIONAL_LIFECYCLE_AND_LOCKING_DESIGN.md# Mutual exclusivity locks, OTP gates, 15% fee payout
├── 06_DATABASE_SCHEMA_DDL.sql                    # Full, runnable PostgreSQL 18 schema (1,015 lines)
├── 07_REFERENCE_SEED_DATA.sql                    # Service catalog seed (Electrician & Plumber)
└── 08_DATABASE_SCHEMA_MANIFEST.json              # Machine-readable JSON schema manifest
\`\`\`

---

## How to Provide This to ChatGPT

1. **Option A (Upload Entire ZIP)**: Upload \`NivaaroFix_Database_Complete_Design.zip\` directly to ChatGPT.
2. **Option B (Copy Prompt)**: Open \`00_CHATGPT_SYSTEM_PROMPT_DATABASE_DESIGN.md\` and paste it as your initial prompt to ChatGPT, then ask any question about the database.
`);

// ==============================================================================
// 2. 00_CHATGPT_SYSTEM_PROMPT_DATABASE_DESIGN.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '00_CHATGPT_SYSTEM_PROMPT_DATABASE_DESIGN.md'), `# CHATGPT SYSTEM PROMPT: NIVAAROFIX POSTGRESQL DATABASE ARCHITECT

> **Usage:** Copy and paste the text below into ChatGPT as the initial prompt.

---

You are the Principal Database Architect for **NivaaroFix**, an on-demand hyperlocal home services platform (electricians and plumbers).
You possess complete, authoritative knowledge of the NivaaroFix database design, relational schemas, indexing strategies, stored procedures, triggers, and transactional locking mechanisms.

### CORE DATABASE ARCHITECTURE TRUTHS

1. **Database Engine**:
   - Engine: **PostgreSQL 18** (relational, ACID-compliant).
   - Connection: Node.js \`pg\` library (\`pg.Pool\`) with raw, parameterized SQL queries (\`$1, $2, ...\`).
   - **DO NOT ASSUME**: MongoDB, Mongoose, MySQL, SQLite, or Prisma. No ORM is used.

2. **Primary Key & Identity Standard**:
   - All internal primary keys are strictly: \`BIGINT GENERATED ALWAYS AS IDENTITY\` (sequential 1, 2, 3...).
   - Foreign keys reference these identity columns directly.

3. **Public Numbering Convention (Atomic Year-Sequences)**:
   - Human-facing codes are generated via an atomic sequence table (\`code_sequences\`) and a stored PL/pgSQL function \`next_entity_code(p_entity, p_pad_len)\`.
   - Customer Code: \`YYYY\` + 5 digits (e.g., \`202600001\`).
   - Professional Code: \`YYYY\` + 5 digits (e.g., \`202600004\`).
   - Service Request Code: \`YYYY\` + 6 digits (e.g., \`2026000013\`).

4. **Dual-Model Compatibility & Bidirectional Triggers**:
   - The database maintains a clean, normalized relational model:
     - Master identity: \`users\`
     - Customer profiles: \`customers\`
     - Professional profiles: \`professionals\`
     - Work orders: \`service_requests\`
     - Price quotes: \`quotes\`
     - Doorstep OTPs: \`door_otps\`
     - Proofs: \`completion_proofs\`
     - Payouts: \`payouts\`
     - Review feedback: \`feedback\`
   - Active application compatibility is maintained through synchronized tables (\`user_login\`, \`agent_login\`) via PL/pgSQL triggers (\`trg_sync_user_login\`, \`trg_sync_agent_login\`, \`trg_quotes_sync\`). Any insert/update to login tables automatically propagates into the normalized customer/professional tables.

5. **Trade Specialization Invariant**:
   - Supported professional trades: \`'electrician'\`, \`'plumber'\`, or \`'both'\`.
   - Supported service request categories: \`'electrician'\`, \`'plumber'\`, or \`'both'\`.
   - Query matching predicate: \`WHERE (sr.category = agent.trade OR agent.trade = 'both')\`.

6. **Mutual Exclusivity Locking**:
   - Customer Lock: Customer cannot have more than 1 active request in states \`['confirmed', 'on_the_way', 'arrived', 'in_progress']\`. Concurrent booking returns \`403 CUSTOMER_LOCKED\`.
   - Provider Lock: Provider cannot work on more than 1 active request in states \`['confirmed', 'on_the_way', 'arrived', 'in_progress']\`. Concurrent quotation returns \`409 PROVIDER_BUSY\`.

7. **Doorstep Physical Presence & OTP**:
   - \`door_otps\` stores a 4-digit code generated upon booking.
   - Code is obscured until provider GPS coordinates verify arrival within **50 meters** of customer pin.
   - Failed attempts increment; lockout occurs after 5 failed attempts.

8. **Financial Settlement Ledger**:
   - Platform fee is **15%**. Provider payout is **85%**.
   - Recorded atomically in \`payouts\` and \`wallet_transactions\`.
`);

// ==============================================================================
// 3. 01_DATABASE_ARCHITECTURE_AND_DESIGN_OVERVIEW.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '01_DATABASE_ARCHITECTURE_AND_DESIGN_OVERVIEW.md'), `# NivaaroFix — Database Architecture & Design Overview

## Design Principles

1. **Strong Relational Integrity**: Full foreign key constraints with \`ON DELETE SET NULL\` or \`ON DELETE CASCADE\` to prevent orphaned records.
2. **Deterministic Sequence Identity**: Separation between internal machine identifiers (\`BIGINT IDENTITY\`) and customer-facing business codes (\`YYYY00001\`).
3. **Auditability**: Every transactional state transition writes an immutable event into \`job_events\`.
4. **Geospatial Indexing**: Hybrid geospatial design combining geographic coordinates (\`lat\`, \`lng\`), Haversine distance calculations, and Uber H3 Resolution 9 hexagonal spatial cells (\`h3_cell\`).

---

## Entity Relationship Diagram (ERD)

\`\`\`mermaid
erDiagram
    code_sequences {
        bigint id PK
        varchar entity UK
        int year UK
        bigint last_value
        timestamptz updated_at
    }

    users ||--o| customers : "has customer profile"
    users ||--o| professionals : "has pro profile"
    professionals ||--o{ professional_documents : "submits KYC"
    
    service_categories ||--o{ services : "classifies"
    
    customers ||--o{ service_requests : "creates"
    services ||--o{ service_requests : "specifies"
    service_requests ||--o{ quotes : "receives"
    professionals ||--o{ quotes : "offers"
    
    service_requests ||--|| door_otps : "protected by"
    service_requests ||--o| completion_proofs : "verified by"
    service_requests ||--o{ location_updates : "tracks"
    service_requests ||--o{ job_events : "audits"
    
    service_requests ||--o| payouts : "settles"
    professionals ||--o{ payouts : "earns"
    professionals ||--o{ wallet_transactions : "transacts"
    
    service_requests ||--o| feedback : "reviewed in"
    customers ||--o{ feedback : "writes"
    professionals ||--o{ feedback : "receives"

    users {
        bigint id PK
        varchar email UK
        varchar phone
        varchar password_hash
        varchar role
        varchar auth_provider
        boolean is_phone_verified
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    customers {
        bigint id PK
        bigint user_id FK
        varchar customer_code UK
        varchar name
        varchar email UK
        varchar phone
        text default_address
        double_precision lat
        double_precision lng
        text h3_cell
    }

    professionals {
        bigint id PK
        bigint user_id FK
        varchar professional_code UK
        varchar name
        varchar email UK
        varchar phone
        varchar trade
        varchar kyc_status
        numeric rating
        int completed_jobs
        boolean is_online
        varchar availability_status
        numeric wallet_balance
        double_precision lat
        double_precision lng
        text h3_cell
    }

    service_requests {
        bigint id PK
        varchar service_request_code UK
        varchar request_ref
        bigint customer_id FK
        bigint service_id FK
        varchar service_title
        varchar category
        text user_address
        double_precision lat
        double_precision lng
        varchar status
        bigint accepted_quote_id
        bigint assigned_professional_id FK
        varchar door_otp
        timestamptz started_at
        timestamptz arrived_at
        timestamptz completed_at
    }

    quotes {
        bigint id PK
        bigint service_request_id FK
        bigint professional_id FK
        numeric quote_amount
        text notes
        varchar status
        timestamptz created_at
    }
\`\`\`

---

## Public Code Generation Standard

| Entity | Formula | Padding | Example | Usage |
| :--- | :--- | :--- | :--- | :--- |
| \`customer\` | \`YYYY + LPAD(val, 5, '0')\` | 5 digits | \`202600001\` | Customer profile ID |
| \`professional\` | \`YYYY + LPAD(val, 5, '0')\` | 5 digits | \`202600004\` | Partner badge & console ID |
| \`service_request\` | \`YYYY + LPAD(val, 6, '0')\` | 6 digits | \`2026000013\` | Work order tracking number |
`);

// ==============================================================================
// 4. 02_COMPLETE_DATA_DICTIONARY_ALL_TABLES.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '02_COMPLETE_DATA_DICTIONARY_ALL_TABLES.md'), `# NivaaroFix — Complete Data Dictionary (All Tables)

This document contains a line-by-line dictionary of all tables in the NivaaroFix PostgreSQL database schema.

---

### 1. \`code_sequences\`
Atomic sequence counter for public reference numbers by calendar year.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`entity\`** \`VARCHAR(50) NOT NULL\` — Entity name (\`customer\`, \`professional\`, \`service_request\`).
- **\`year\`** \`INT NOT NULL\` — Calendar year prefix (e.g., 2026).
- **\`last_value\`** \`BIGINT NOT NULL DEFAULT 0\` — Highest assigned counter.
- **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`
- *Constraints*: \`UNIQUE (entity, year)\`

---

### 2. \`users\`
Master authentication and identity records.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`email\`** \`VARCHAR(255) NOT NULL UNIQUE\` — User login email.
- **\`phone\`** \`VARCHAR(32)\` — Contact phone number.
- **\`password_hash\`** \`VARCHAR(255)\` — Bcrypt password hash.
- **\`role\`** \`VARCHAR(32) NOT NULL DEFAULT 'customer'\` — \`'customer'\`, \`'professional'\`, \`'admin'\`.
- **\`auth_provider\`** \`VARCHAR(32) NOT NULL DEFAULT 'local'\` — \`'local'\`, \`'google'\`, \`'phone_otp'\`, \`'agent_id'\`.
- **\`is_phone_verified\`** \`BOOLEAN NOT NULL DEFAULT FALSE\` — Whether SMS OTP is verified.
- **\`is_active\`** \`BOOLEAN NOT NULL DEFAULT TRUE\` — Whether account is active.
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`
- **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 3. \`customers\`
Customer demographic and location profile.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`user_id\`** \`BIGINT REFERENCES users(id) ON DELETE SET NULL\`
- **\`customer_code\`** \`VARCHAR(32) NOT NULL UNIQUE\` — Formatted code (e.g., \`202600001\`).
- **\`name\`** \`VARCHAR(150) NOT NULL\` — Full name.
- **\`email\`** \`VARCHAR(255) NOT NULL UNIQUE\` — Contact email.
- **\`phone\`** \`VARCHAR(32)\` — Mobile number.
- **\`default_address\`** \`TEXT\` — Saved delivery address.
- **\`lat\`** \`DOUBLE PRECISION\` — Doorstep latitude.
- **\`lng\`** \`DOUBLE PRECISION\` — Doorstep longitude.
- **\`h3_cell\`** \`TEXT\` — H3 index resolution 9 cell.
- **\`created_at\`**, **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 4. \`professionals\`
Verified service technicians.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`user_id\`** \`BIGINT REFERENCES users(id) ON DELETE SET NULL\`
- **\`professional_code\`** \`VARCHAR(32) NOT NULL UNIQUE\` — Partner ID (e.g., \`202600004\`).
- **\`name\`** \`VARCHAR(150) NOT NULL\` — Partner name.
- **\`email\`** \`VARCHAR(255) NOT NULL UNIQUE\` — Account email.
- **\`phone\`** \`VARCHAR(32)\` — Mobile number.
- **\`trade\`** \`VARCHAR(50) NOT NULL\` — Trade specialization: \`'electrician'\`, \`'plumber'\`, \`'both'\`.
- **\`kyc_status\`** \`VARCHAR(32) NOT NULL DEFAULT 'verified'\` — \`'pending'\`, \`'verified'\`, \`'rejected'\`.
- **\`rating\`** \`NUMERIC(3,2) NOT NULL DEFAULT 5.00\` — Average rating (1.00 - 5.00).
- **\`completed_jobs\`** \`INT NOT NULL DEFAULT 0\` — Lifetime completed jobs counter.
- **\`is_online\`** \`BOOLEAN NOT NULL DEFAULT TRUE\` — Availability toggle for dispatch broadcasts.
- **\`availability_status\`** \`VARCHAR(32) NOT NULL DEFAULT 'available'\` — \`'available'\`, \`'busy'\`, \`'offline'\`.
- **\`wallet_balance\`** \`NUMERIC(12,2) NOT NULL DEFAULT 0.00\` — Available wallet earnings in INR.
- **\`lat\`**, **\`lng\`** \`DOUBLE PRECISION\` — Current GPS coordinates.
- **\`h3_cell\`** \`TEXT\` — H3 resolution 9 cell.
- **\`created_at\`**, **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 5. \`professional_documents\`
KYC verification documents.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`professional_id\`** \`BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE\`
- **\`document_type\`** \`VARCHAR(64) NOT NULL\` — \`'aadhaar'\`, \`'pan'\`, \`'trade_license'\`, \`'police_verification'\`.
- **\`document_number\`** \`VARCHAR(128)\` — ID number.
- **\`file_url\`** \`TEXT NOT NULL\` — Storage URL.
- **\`verification_status\`** \`VARCHAR(32) NOT NULL DEFAULT 'verified'\`
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 6. \`service_categories\`
High-level service verticals.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`slug\`** \`VARCHAR(64) NOT NULL UNIQUE\` — \`'electrician'\`, \`'plumber'\`.
- **\`name\`** \`VARCHAR(100) NOT NULL\` — Display name.
- **\`description\`** \`TEXT\`
- **\`icon_name\`** \`VARCHAR(64)\` — SVG icon key (\`zap\`, \`droplet\`).
- **\`sort_order\`** \`INT NOT NULL DEFAULT 0\`
- **\`is_active\`** \`BOOLEAN NOT NULL DEFAULT TRUE\`
- **\`created_at\`**, **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 7. \`services\`
Catalog of orderable repairs and installations.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`category_id\`** \`BIGINT NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE\`
- **\`slug\`** \`VARCHAR(100) NOT NULL UNIQUE\` — e.g. \`switchboard-socket-repair\`, \`tap-faucet-repair\`.
- **\`name\`** \`VARCHAR(150) NOT NULL\` — Display name.
- **\`description\`** \`TEXT\`
- **\`base_price\`** \`NUMERIC(10,2) NOT NULL\` — Standard base pricing.
- **\`currency\`** \`VARCHAR(8) NOT NULL DEFAULT 'INR'\`
- **\`estimated_duration_minutes\`** \`INT NOT NULL DEFAULT 30\`
- **\`warranty_days\`** \`INT NOT NULL DEFAULT 30\`
- **\`is_active\`** \`BOOLEAN NOT NULL DEFAULT TRUE\`
- **\`created_at\`**, **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 8. \`service_requests\`
Primary work orders and job state machine.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_code\`** \`VARCHAR(32) NOT NULL UNIQUE\` — Public reference (e.g., \`2026000013\`).
- **\`request_ref\`** \`VARCHAR(32)\` — Synced alias for public code.
- **\`customer_id\`** \`BIGINT REFERENCES customers(id) ON DELETE SET NULL\`
- **\`service_id\`** \`BIGINT REFERENCES services(id) ON DELETE SET NULL\`
- **\`user_email\`** \`VARCHAR(255)\` — Customer email.
- **\`customer_phone\`** \`VARCHAR(32)\` — Customer phone.
- **\`service_title\`** \`VARCHAR(200) NOT NULL\` — e.g. "Taps, Mixers & Showers".
- **\`category\`** \`VARCHAR(50) NOT NULL\` — Trade category: \`'electrician'\`, \`'plumber'\`, \`'both'\`.
- **\`issue_type\`** \`VARCHAR(150)\`
- **\`problem_description\`** \`TEXT\` — Customer remark.
- **\`user_address\`** \`TEXT\` — Doorstep service address.
- **\`lat\`**, **\`lng\`** \`DOUBLE PRECISION\` — Doorstep coordinates.
- **\`h3_cell\`** \`TEXT\` — H3 index cell.
- **\`status\`** \`VARCHAR(32) NOT NULL DEFAULT 'open'\`
  - Valid states: \`'open'\`, \`'quoted'\`, \`'confirmed'\`, \`'on_the_way'\`, \`'arrived'\`, \`'in_progress'\`, \`'completed'\`, \`'cancelled'\`.
- **\`accepted_quote_id\`** \`BIGINT\` — Foreign key to accepted \`quotes(id)\`.
- **\`assigned_professional_id\`** \`BIGINT REFERENCES professionals(id) ON DELETE SET NULL\`
- **\`door_otp\`** \`VARCHAR(8)\` — 4-digit physical presence verification code.
- **\`started_at\`**, **\`arrived_at\`**, **\`completed_at\`** \`TIMESTAMPTZ\`
- **\`created_at\`**, **\`updated_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 9. \`quotes\`
Competitive price quotations submitted by service providers.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_id\`** \`BIGINT REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`request_id\`** \`BIGINT\` — Synced alias.
- **\`professional_id\`** \`BIGINT REFERENCES professionals(id) ON DELETE CASCADE\`
- **\`agent_id\`** \`BIGINT\` — Synced alias.
- **\`agent_email\`** \`VARCHAR(255)\`
- **\`agent_name\`** \`VARCHAR(150)\`
- **\`quote_amount\`** \`NUMERIC(10,2) NOT NULL CHECK (quote_amount > 0)\`
- **\`notes\`** \`TEXT\`
- **\`status\`** \`VARCHAR(32) NOT NULL DEFAULT 'pending'\` — \`'pending'\`, \`'accepted'\`, \`'rejected'\`, \`'withdrawn'\`.
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 10. \`door_otps\`
Audit table for physical presence handshake.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_id\`** \`BIGINT NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`otp_code\`** \`VARCHAR(10) NOT NULL\` — 4-digit code.
- **\`attempts\`** \`INT NOT NULL DEFAULT 0\` — Failed attempt counter.
- **\`is_verified\`** \`BOOLEAN NOT NULL DEFAULT FALSE\`
- **\`verified_at\`** \`TIMESTAMPTZ\`
- **\`locked_until\`** \`TIMESTAMPTZ\` — Throttling lockout timestamp.
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 11. \`completion_proofs\`
Photographic proof of completed repair work.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_id\`** \`BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`professional_id\`** \`BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE\`
- **\`photo_urls\`** \`JSONB NOT NULL\` — Array of 1 to 4 photo URLs.
- **\`remarks\`** \`TEXT\`
- **\`verified_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 12. \`payouts\`
Financial settlement breakdown.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_id\`** \`BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`professional_id\`** \`BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE\`
- **\`gross_amount\`** \`NUMERIC(10,2) NOT NULL\` — Accepted quote amount.
- **\`platform_fee_rate\`** \`NUMERIC(5,4) NOT NULL DEFAULT 0.1500\` — 15% fee.
- **\`platform_fee_amount\`** \`NUMERIC(10,2) NOT NULL\` — 15% commission.
- **\`net_payout_amount\`** \`NUMERIC(10,2) NOT NULL\` — 85% provider earnings.
- **\`status\`** \`VARCHAR(32) NOT NULL DEFAULT 'completed'\`
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 13. \`wallet_transactions\`
Double-entry ledger for partner earnings.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`professional_id\`** \`BIGINT NOT NULL\`
- **\`amount\`** \`NUMERIC(10,2) NOT NULL\`
- **\`transaction_type\`** \`VARCHAR(32) NOT NULL\` — \`'credit'\`, \`'debit'\`.
- **\`balance_after\`** \`NUMERIC(12,2)\`
- **\`request_ref\`** \`VARCHAR(32)\`
- **\`notes\`** \`TEXT\`
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 14. \`feedback\` / \`reviews\`
Customer reviews and star ratings.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`service_request_id\`** \`BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`customer_id\`** \`BIGINT REFERENCES customers(id) ON DELETE SET NULL\`
- **\`professional_id\`** \`BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE\`
- **\`rating\`** \`INT NOT NULL CHECK (rating BETWEEN 1 AND 5)\` — 1 to 5 stars.
- **\`comment\`** \`TEXT\`
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 15. \`professional_gps_log\`
High-frequency breadcrumb trail recorded while on the way.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`professional_id\`** \`BIGINT NOT NULL\`
- **\`service_request_id\`** \`BIGINT\`
- **\`lat\`**, **\`lng\`** \`DOUBLE PRECISION NOT NULL\`
- **\`speed\`**, **\`heading\`**, **\`accuracy\`** \`DOUBLE PRECISION\`
- **\`recorded_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 16. \`job_events\`
Immutable audit event stream.
- **\`id\`** \`BIGINT GENERATED ALWAYS AS IDENTITY\` (PK)
- **\`request_id\`** \`BIGINT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE\`
- **\`event_type\`** \`VARCHAR(64) NOT NULL\` — e.g., \`'REQUEST_CREATED'\`, \`'QUOTE_ACCEPTED'\`, \`'ARRIVED'\`.
- **\`actor_role\`** \`VARCHAR(32) NOT NULL\` — \`'customer'\`, \`'professional'\`, \`'system'\`.
- **\`actor_id\`** \`VARCHAR(64)\`
- **\`payload\`** \`JSONB\`
- **\`created_at\`** \`TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\`

---

### 17. Compatibility Tables (\`user_login\`, \`agent_login\`, \`bookings\`)
- **\`user_login\`**: Synced with \`users\` and \`customers\` via trigger \`trg_sync_user_login\`.
- **\`agent_login\`**: Synced with \`users\` and \`professionals\` via trigger \`trg_sync_agent_login\`.
- **\`bookings\`**: Synced alias table for active work orders.
`);

// ==============================================================================
// 5. 03_STORED_FUNCTIONS_TRIGGERS_AND_SEQUENCES.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '03_STORED_FUNCTIONS_TRIGGERS_AND_SEQUENCES.md'), `# NivaaroFix — Stored Procedures, Triggers & Atomic Functions

The database uses native PostgreSQL PL/pgSQL stored procedures and triggers to guarantee atomic sequence generation, synchronization, and data integrity.

---

## 1. Atomic Sequence Function (\`next_entity_code\`)

\`\`\`sql
CREATE OR REPLACE FUNCTION next_entity_code(p_entity TEXT, p_pad_len INT DEFAULT 5)
RETURNS TEXT AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::INT;
    v_val BIGINT;
BEGIN
    INSERT INTO code_sequences (entity, year, last_value, updated_at)
    VALUES (p_entity, v_year, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (entity, year)
    DO UPDATE SET 
        last_value = code_sequences.last_value + 1,
        updated_at = CURRENT_TIMESTAMP
    RETURNING last_value INTO v_val;

    RETURN v_year::TEXT || LPAD(v_val::TEXT, p_pad_len, '0');
END;
$$ LANGUAGE plpgsql;
\`\`\`

### Execution Pattern:
- \`SELECT next_entity_code('customer', 5);\` -> Returns \`202600001\`
- \`SELECT next_entity_code('professional', 5);\` -> Returns \`202600004\`
- \`SELECT next_entity_code('service_request', 6);\` -> Returns \`2026000013\`

---

## 2. Customer Sync Trigger (\`fn_sync_user_login_to_cust\`)

Whenever a row is inserted or updated in \`user_login\`, this trigger:
1. Upserts into \`users\` with \`role = 'customer'\`.
2. Generates a \`customer_code\` if one does not exist.
3. Upserts into \`customers\` with the user's name, email, phone, address, and coordinates.

\`\`\`sql
CREATE TRIGGER trg_sync_user_login
    AFTER INSERT OR UPDATE ON user_login
    FOR EACH ROW EXECUTE FUNCTION fn_sync_user_login_to_cust();
\`\`\`

---

## 3. Professional Sync Trigger (\`fn_sync_agent_login_to_pro\`)

Whenever a row is inserted or updated in \`agent_login\`, this trigger:
1. Upserts into \`users\` with \`role = 'professional'\`.
2. Generates a \`professional_code\` if one does not exist.
3. Upserts into \`professionals\` with trade specialization (\`'electrician'\`, \`'plumber'\`, or \`'both'\`), location, and rating.

\`\`\`sql
CREATE TRIGGER trg_sync_agent_login
    AFTER INSERT OR UPDATE ON agent_login
    FOR EACH ROW EXECUTE FUNCTION fn_sync_agent_login_to_pro();
\`\`\`

---

## 4. Quote Normalization Trigger (\`fn_quotes_sync\`)

Synchronizes column names across versions (\`service_request_id\` <-> \`request_id\` and \`professional_id\` <-> \`agent_id\`).

\`\`\`sql
CREATE TRIGGER trg_quotes_sync
    BEFORE INSERT OR UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION fn_quotes_sync();
\`\`\`
`);

// ==============================================================================
// 6. 04_GEOSPATIAL_AND_INDEXING_STRATEGY.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '04_GEOSPATIAL_AND_INDEXING_STRATEGY.md'), `# NivaaroFix — Geospatial Architecture & Indexing Strategy

## Geospatial Design: Uber H3 + Haversine Formula

NivaaroFix uses a two-tier geospatial matching architecture:

1. **Tier 1: Uber H3 Hexagonal Cell Indexing (Resolution 9)**
   - Average hexagon radius: ~100 meters.
   - Stored in column \`h3_cell\` on \`customers\`, \`professionals\`, and \`service_requests\`.
   - Used for instant hexagonal spatial grouping and k-ring neighbor expansion.

2. **Tier 2: High-Precision Haversine Distance Calculation**
   - Live distance calculation in SQL for dispatch and filtering:
     \`\`\`sql
     (6371 * acos(
         cos(radians($lat)) * cos(radians(sr.lat)) * 
         cos(radians(sr.lng) - radians($lng)) + 
         sin(radians($lat)) * sin(radians(sr.lat))
     )) AS distance_km
     \`\`\`

---

## Database Indexing Strategy

\`\`\`sql
-- Geospatial Indexes
CREATE INDEX ix_professionals_lat_lng ON professionals(lat, lng);
CREATE INDEX ix_service_requests_lat_lng ON service_requests(lat, lng);
CREATE INDEX ix_professionals_h3 ON professionals(h3_cell);
CREATE INDEX ix_service_requests_h3 ON service_requests(h3_cell);

-- Dispatch & State Filtering Indexes
CREATE INDEX ix_service_requests_status_category ON service_requests(status, category);
CREATE INDEX ix_professionals_trade_online ON professionals(trade, is_online, availability_status);
CREATE INDEX ix_quotes_request_status ON quotes(service_request_id, status);

-- Audit & Telemetry Indexes
CREATE INDEX ix_job_events_request_id ON job_events(request_id);
CREATE INDEX ix_professional_gps_log_pro ON professional_gps_log(professional_id, recorded_at DESC);
CREATE INDEX ix_wallet_transactions_pro ON wallet_transactions(professional_id, created_at DESC);
\`\`\`
`);

// ==============================================================================
// 7. 05_TRANSACTIONAL_LIFECYCLE_AND_LOCKING_DESIGN.md
// ==============================================================================
fs.writeFileSync(path.join(bundleDir, '05_TRANSACTIONAL_LIFECYCLE_AND_LOCKING_DESIGN.md'), `# NivaaroFix — Transactional Lifecycle & Database Locking Design

## 1. Single-Active-Job Mutual Exclusivity Locks

To prevent concurrent booking race conditions and provider double-booking:

### Customer Active Lock
A customer query checks:
\`\`\`sql
SELECT COUNT(*) FROM service_requests
WHERE user_email = $1 
  AND status IN ('confirmed', 'on_the_way', 'arrived', 'in_progress');
\`\`\`
If \`count > 0\`, concurrent booking creation is rejected with **403 CUSTOMER_LOCKED**.

### Provider Active Lock
A provider query checks:
\`\`\`sql
SELECT COUNT(*) FROM service_requests
WHERE assigned_professional_id = $1 
  AND status IN ('confirmed', 'on_the_way', 'arrived', 'in_progress');
\`\`\`
If \`count > 0\`, quote submission or job acceptance is rejected with **409 PROVIDER_BUSY**.

---

## 2. Doorstep Arrival Geofence Validation

When advancing to \`arrived\`:
- Haversine distance between provider reported GPS and customer pin is computed.
- If \`distance <= 0.050 km\` (50 meters doorstep geofence), transition is permitted.
- If \`distance > 0.050 km\`, rejected with 400.
- Upon valid arrival, \`door_otps\` becomes eligible for verification.

---

## 3. Financial Settlement Transaction (15% / 85%)

Executed inside a database transaction (\`BEGIN ... COMMIT\`):
1. Lock accepted quote: \`SELECT quote_amount FROM quotes WHERE id = $accepted_quote_id FOR UPDATE;\`
2. Calculate:
   - \`gross_amount = quote_amount\`
   - \`platform_fee_amount = round(gross_amount * 0.15, 2)\`
   - \`net_payout_amount = gross_amount - platform_fee_amount\`
3. Insert into \`payouts\`.
4. Update professional:
   \`\`\`sql
   UPDATE professionals 
   SET wallet_balance = wallet_balance + $net_payout_amount,
       completed_jobs = completed_jobs + 1,
       availability_status = 'available'
   WHERE id = $pro_id
   RETURNING wallet_balance;
   \`\`\`
5. Insert row into \`wallet_transactions\`.
6. Update \`service_requests.status = 'completed'\`.
`);

// ==============================================================================
// 8. COPY RAW SQL DDL & SEED DATA
// ==============================================================================
const schemaSource = path.join(rootDir, 'database', 'migrations', '001_initial_schema.sql');
if (fs.existsSync(schemaSource)) {
  fs.copyFileSync(schemaSource, path.join(bundleDir, '06_DATABASE_SCHEMA_DDL.sql'));
}

const seedSource = path.join(rootDir, 'database', 'reference-data', 'service_catalog.sql');
if (fs.existsSync(seedSource)) {
  fs.copyFileSync(seedSource, path.join(bundleDir, '07_REFERENCE_SEED_DATA.sql'));
}

// ==============================================================================
// 9. 08_DATABASE_SCHEMA_MANIFEST.json
// ==============================================================================
const dbManifest = {
  databaseSystem: "PostgreSQL 18",
  databaseName: "nivaarofix_db",
  identityStrategy: "BIGINT GENERATED ALWAYS AS IDENTITY",
  sequencePattern: "YYYY + 5/6 digits via code_sequences",
  tablesCount: 22,
  primaryTables: [
    "code_sequences",
    "users",
    "customers",
    "professionals",
    "professional_documents",
    "service_categories",
    "services",
    "service_requests",
    "quotes",
    "door_otps",
    "completion_proofs",
    "location_updates",
    "payouts",
    "wallet_transactions",
    "feedback",
    "professional_gps_log",
    "job_events",
    "bookings",
    "user_login",
    "agent_login",
    "request_dispatches",
    "payments"
  ],
  financialRules: {
    platformFeeRate: 0.15,
    providerPayoutRate: 0.85
  },
  geospatial: {
    coordinateSystem: "WGS 84 (EPSG:4326)",
    h3Resolution: 9,
    doorstepGeofenceMeters: 50
  },
  triggers: [
    "trg_sync_user_login",
    "trg_sync_agent_login",
    "trg_quotes_sync"
  ]
};
fs.writeFileSync(path.join(bundleDir, '08_DATABASE_SCHEMA_MANIFEST.json'), JSON.stringify(dbManifest, null, 2));

console.log('✅ All database documentation, DDL, and manifests generated successfully.');

// ==============================================================================
// 10. COMPRESS INTO ZIP FILE VIA POWERSHELL
// ==============================================================================
console.log('🗜️ Compressing into Database Design ZIP file...');
const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${bundleDir}', '${zipFilePath}', [System.IO.Compression.CompressionLevel]::Optimal, $false)"`;
execSync(psCommand, { stdio: 'inherit' });

// Clean up staging folder to leave workspace clean
try {
  fs.rmSync(bundleDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch {
  // Ignored if file lock is briefly held by OS
}

const finalStats = fs.statSync(zipFilePath);
console.log(`\n🎉 SUCCESS! Database Design Specification Bundle created:`);
console.log(`File: ${zipFilePath}`);
console.log(`Size: ${(finalStats.size / 1024).toFixed(2)} KB`);
