# NivaaroFix System Architecture

NivaaroFix is an enterprise-grade, multi-lingual on-demand home repair marketplace connecting verified homeowners with background-checked master electricians and plumbers across India.

---

## 1. High-Level Topology

The system is engineered as a decoupled monorepo composed of three distinct runtime layers and a persistent PostgreSQL database:

```
                                    +-----------------------------------------+
                                    |           Web Browser Client            |
                                    +--------------------+--------------------+
                                                         |
                                +------------------------+------------------------+
                                |                                                 |
                                v (Port 5173)                                     v (Port 5500)
                 +------------------------------+                  +------------------------------+
                 |    Dashboard Marketplace     |                  |    WebLogin Auth Portal      |
                 |  - Home, Services, About     | <--------------> |  - Customer Login & Signup   |
                 |  - Booking Drawer & Tracking |   Cross-Origin   |  - Partner / Pro Portal      |
                 |  - Partner Dispatch Console  |   State Transfer |  - 10-Language Selector      |
                 |  - Review Carousels          |                  |  - Google OAuth 2.0 & Phone  |
                 +--------------+---------------+                  +--------------+---------------+
                                |                                                 |
                                +------------------------+------------------------+
                                                         |
                                                         v (Port 5000)
                                          +------------------------------+
                                          |     Express REST & WS API    |
                                          |  - /api/auth                 |
                                          |  - /api/bookings             |
                                          |  - /api/dispatch             |
                                          |  - /api/discovery            |
                                          |  - /api/services             |
                                          |  - /api/agents               |
                                          +--------------+---------------+
                                                         |
                                                         v (Port 5432)
                                          +------------------------------+
                                          |     PostgreSQL 18.6 DB       |
                                          |  - user_login & agent_login  |
                                          |  - service_requests & quotes |
                                          |  - bookings & audit logs     |
                                          |  - PostGIS/Cube/Earthdist    |
                                          +------------------------------+
```

---

## 2. Decoupled Service Topology

### 2.1 Backend REST API (`/backend`)
- **Runtime**: Node.js (ES Module) + Express.js
- **Port**: `5000`
- **Database Driver**: `pg` (Connection Pooling)
- **Geospatial Engine**: PostgreSQL `earthdistance` + `cube` + Uber `h3-js` (Resolution 8 & 9)
- **Key Modules**:
  - `src/routes/authRoutes.js`: Customer & Partner authentication, Google Identity Services OAuth 2.0 verification, session validation.
  - `src/routes/dispatchRoutes.js`: GPS provider discovery, progressive radius expansion (50m -> 100m -> 500m -> 1km -> 5km -> 10km), quotation negotiation, and job acceptance.
  - `src/routes/bookingRoutes.js`: Booking creation, status progression, door safety OTP verification, warranty computation, and photo attachments.
  - `src/routes/serviceRoutes.js`: Service catalog queries and pricing models.
  - `src/routes/agentRoutes.js`: Partner profile management, live location heartbeats, availability toggling.

### 2.2 Dashboard Marketplace (`/Dashboard`)
- **Runtime**: Vite + React 19 SPA
- **Port**: `5173`
- **Purpose**: Homeowner service discovery, service details, booking management, and real-time live tracking. Also hosts the active **Partner Console** (`#partner`) where assigned technicians manage dispatches.
- **Key State Contexts**:
  - `ThemeContext`: Dynamic visual mode management.
  - `LanguageContext`: Multi-lingual UI state across 10 Indian regional languages.
  - `LocationContext`: Geolocation auto-detection with high-accuracy GPS coordinates.
  - `BookingContext`: Frictionless booking drawer intent, active booking lifecycle, and invoice downloads.
  - `PartnerContext`: Partner online status, job dispatch queue, and wallet transactions.

### 2.3 WebLogin Auth Portal (`/WebLogin`)
- **Runtime**: Vite + React 19 SPA
- **Port**: `5500`
- **Purpose**: Dedicated high-security authentication and onboarding portal for both Customers and Professional Service Partners.
- **Features**:
  - Dual-Audience Tab Switcher (Customer vs Professional Partner).
  - Indian Mobile (+91) OTP validation with automatic retry timers.
  - Segmented 3-part Date of Birth selector (Day, Month, Year) with age verification.
  - Cascading State & City geographical selectors for Indian regions.
  - Password strength validation engine (Weak / Good / Strong).
  - Real Google Identity Services OAuth 2.0 integration.

---

## 3. Cross-Application State Synchronization

Communication between the `Dashboard` (Port 5173) and `WebLogin` (Port 5500) utilizes secure URL payload parameters and local storage synchronization:

1. **Outbound to Auth**: When an unauthenticated user clicks "Sign In" or "Become a Partner" on the Dashboard, they are redirected to `http://localhost:5500/?portal=customer` or `http://localhost:5500/?portal=agent` with a `returnTo` hash parameter.
2. **Inbound to Dashboard**: After successful authentication in `WebLogin`, the user is returned to `http://localhost:5173/?user={encodedJSON}` or `http://localhost:5173/?agent={encodedJSON}`.
3. **Session Cleansing & Isolation**: Customer sessions (`nivaaro-user`) and Partner sessions (`nivaaro-agent`) are strictly isolated to prevent cross-account leakage.
4. **PostgreSQL Database Verification**: On startup, both applications verify cached sessions against PostgreSQL. Stale or deleted accounts are immediately invalidated.

---

## 4. GPS Geolocation & Dispatch Lifecycle

```
Customer Request (Lat, Lng)
         |
         v
GPS Discovery Engine (H3 Res 8/9 & Earthdistance)
         |
         +---> Ring 0: 50 m
         +---> Ring 1: 100 m
         +---> Ring 2: 500 m
         +---> Ring 3: 1 km
         +---> Ring 4: 5 km
         +---> Ring 5: 10 km
         |
         v
Candidate Dispatch Alerts Sent to Nearby Active Pros
         |
         v
Partner Submits Quotation (Standard Base + Material Estimate)
         |
         v
Customer Accepts Quote & Confirms Booking
         |
         v
Door Safety OTP Generated (Encrypted 4-digit code)
         |
         v
Job In Progress -> Completed -> Warranty Active (30 Days)
```

---

## 5. Security & Verification Guarantees

1. **Zero Mock Data Policy**: All user profiles, technician ratings, job counts, and service invoices represent verified PostgreSQL records.
2. **Strict KYC Integrity**: Freshly registered technicians default to `Pending` verification with unreviewed (`null`) ratings.
3. **Door Safety OTP**: Technicians cannot start a home visit until the customer provides the 4-digit safety OTP generated on dispatch.
4. **Input Sanitation**: All endpoints sanitize phone numbers, dates of birth, and identity credentials, blocking dummy test patterns.
