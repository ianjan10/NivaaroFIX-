# NivaaroFix Backend API and PostgreSQL Database Engine

Express.js REST API and PostgreSQL database service for NivaaroFix marketplace, dual-portal authentication, and transaction processing.

---

## Overview

The NivaaroFix backend handles:
1. **Customer and Partner Authentication**: Registration, sign-in, and password recovery.
2. **Google Identity Services (GIS) Ingestion**: Token verification and profile synchronization.
3. **Structured PostgreSQL 18.6 Schema**: Fully typed `user_login`, `agent_login`, `services`, and `bookings` tables with auto-updating timestamps (`updated_at`) and performance indexes.
4. **Service Booking and Partner Console Engine**: Live orders, 4-digit door OTP verification, and technician wallet credit.

---

## PostgreSQL Database Schema (nivaarofix_db)

### 1. user_login (Customer Accounts)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Auto-incrementing unique user identifier |
| `name` | `VARCHAR(150)` | `NOT NULL` | Full name of the customer |
| `email` | `VARCHAR(150)` | `UNIQUE NOT NULL` | Verified login email address |
| `phone` | `VARCHAR(50)` | | Indian mobile number (`+91 ...`) |
| `dob` | `VARCHAR(50)` | | Formatted date of birth (`DD/MM/YYYY`) |
| `state` | `VARCHAR(100)` | | Indian State / Union Territory |
| `city` | `VARCHAR(100)` | `DEFAULT 'Bengaluru'` | Customer home city |
| `address` | `TEXT` | | Detailed residential street address |
| `password` | `VARCHAR(255)` | | Hashed/secure user password |
| `auth_provider` | `VARCHAR(50)` | `CHECK IN ('email', 'phone_otp', 'google')` | Authentication mechanism |
| `google_id` | `VARCHAR(100)` | | Unique Google User ID (`sub`) |
| `avatar_url` | `TEXT` | | Profile photo / Google avatar URL |
| `is_verified` | `BOOLEAN` | `DEFAULT true` | Email/phone verification flag |
| `last_login_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Timestamp of most recent login |
| `created_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Registration creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Auto-updated on any record change |

### 2. agent_login (Service Partners and Technicians)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Auto-incrementing internal partner ID |
| `partner_id` | `VARCHAR(50)` | `UNIQUE NOT NULL` | Formatted badge ID (e.g. `FIX-PRO-8492`) |
| `name` | `VARCHAR(150)` | `NOT NULL` | Technician / Partner full name |
| `email` | `VARCHAR(150)` | `UNIQUE NOT NULL` | Business / Work email address |
| `phone` | `VARCHAR(50)` | | Technician mobile contact |
| `trade` | `VARCHAR(100)` | `CHECK IN ('electrician', 'plumber', 'both')` | Core trade domain |
| `experience_years` | `INT` | `DEFAULT 5` | Years of verified experience |
| `dob` | `VARCHAR(50)` | | Formatted date of birth |
| `state` | `VARCHAR(100)` | | Operating State / Region |
| `city` | `VARCHAR(100)` | `DEFAULT 'Bengaluru'` | Primary operating hub city |
| `address` | `TEXT` | | Service hub base address |
| `password` | `VARCHAR(255)` | | Hashed partner password |
| `auth_provider` | `VARCHAR(50)` | `CHECK IN ('agent_id', 'phone_otp', 'google')` | Partner authentication method |
| `google_id` | `VARCHAR(100)` | | Unique Google ID |
| `avatar_url` | `TEXT` | | Profile photo / Avatar URL |
| `kyc_status` | `VARCHAR(50)` | `CHECK IN ('Pending', 'Verified', 'Rejected')` | Identity KYC compliance status |
| `rating` | `NUMERIC(3,2)` | `DEFAULT 4.96` | Verified customer rating (1.00 - 5.00) |
| `completed_jobs` | `INT` | `DEFAULT 0` | Total completed service jobs |
| `is_online` | `BOOLEAN` | `DEFAULT true` | Live dispatch availability toggle |
| `wallet_balance` | `NUMERIC(10,2)`| `DEFAULT 0.00` | Current withdrawable earnings balance |
| `last_login_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Last active session timestamp |
| `created_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Partner onboarding timestamp |
| `updated_at` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Auto-updated timestamp |

### 3. services (Master Service Catalog)
Pre-seeded with 8 master electrician and plumber service offerings with pricing, duration, ratings, and 30-day warranty.

### 4. bookings (Live Service Orders)
Tracks customer booking references (`NV-XXXXX`), assigned technicians, safety Door OTPs (`4-digit`), status (`On The Way`, `In Progress`, `Completed`), and payout amounts.

---

## Directory Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js                 # PostgreSQL Pool and auto-schema migration engine
│   ├── db/
│   │   └── reset.js              # Database cleaner and fresh table recreation script
│   ├── routes/
│   │   ├── agentRoutes.js        # Partner profile, OTP verification and job completion
│   │   ├── authRoutes.js         # Customer and partner auth + Google OAuth endpoints
│   │   ├── bookingRoutes.js      # Booking creation and query endpoints
│   │   └── serviceRoutes.js      # Catalog listing and search queries
│   └── server.js                 # Express app bootstrap and CORS setup
├── tests/
│   ├── oauth.test.mjs            # Google OAuth token decoding and upsert tests
│   └── postgres_crud.test.mjs    # Customer and Agent registration/login tests
├── .env                          # PostgreSQL credentials (PORT, PG_USER, PG_PASSWORD, etc.)
├── package.json                  # Scripts and dependencies
└── README.md                     # Backend API documentation
```

---

## API Endpoints

### 1. Authentication (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/google` | Google OAuth 2.0 login/register (Customer and Agent) |
| `POST` | `/api/auth/customer-register` | Customer sign up and PostgreSQL insert |
| `POST` | `/api/auth/customer-login` | Customer sign in with email/phone |
| `POST` | `/api/auth/agent-register` | Partner registration and partner ID generation |
| `POST` | `/api/auth/agent-login` | Partner sign in with Partner ID / email |
| `GET` | `/api/auth/users` | List all registered customers |
| `GET` | `/api/auth/agents` | List all registered partners |

### 2. Bookings and Jobs (`/api/bookings`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/bookings` | Create a new service booking |
| `GET` | `/api/bookings` | Fetch recent bookings |

### 3. Partner Console (`/api/agents`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/agents/profile/:email` | Get partner profile, rating, and wallet balance |
| `POST` | `/api/agents/verify-otp` | Verify door safety OTP and start job |
| `POST` | `/api/agents/complete-job` | Complete job and credit wallet balance |

---

## Database Commands and Testing

```bash
# Clean all tables and freshly initialize schema
npm run db:reset

# Run backend regression tests
npm test
```

---
2026 NivaaroFix Inc. All rights reserved.
