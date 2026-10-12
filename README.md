# NivaaroFix

NivaaroFix is an on-demand marketplace platform coordinating verified home repair services (electricians and plumbers). It provides quote broadcasting, progressive radius dispatching, mutual exclusivity job locks, real-time road route tracking, doorstep physical presence verification, photographic work proof, and automated wallet settlements.

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL 18, WebSocket (`ws`), Uber H3 (`h3-js`), OSRM Routing.
- **Frontend**: React 19, Vite, Leaflet, Carto Positron, Vanilla CSS design system.
- **Monorepo**: npm workspaces.

## Repository Layout

```
nivaarofix/
├── apps/
│   ├── api/          # Express REST API & WebSocket telemetry server (:5000)
│   ├── web/          # Customer dashboard & partner console (:5173)
│   └── auth/         # Customer & partner authentication portal (:5500)
├── packages/
│   └── shared/       # Shared constants, enums, and domain configurations
├── database/
│   ├── migrations/   # Sequential database migrations (001_initial_schema.sql)
│   └── reference-data/ # Static reference catalog data (service_catalog.sql)
├── docs/             # Technical specifications & documentation
│   ├── architecture.md
│   ├── database.md
│   ├── job-lifecycle.md
│   ├── live-tracking.md
│   ├── maps-configuration.md
│   └── api.md
├── scripts/          # Developer tooling & utility scripts
├── .env.example      # Environment template
└── package.json      # Workspace root configuration
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 15.0 (running on port 5432)

## Setup & Installation

1. Clone the repository and checkout the working branch:
   ```bash
   git clone <repo-url>
   git checkout chore/repo-cleanup
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Configure database credentials in `.env`:
   ```env
   PG_HOST=localhost
   PG_PORT=5432
   PG_DATABASE=nivaarofix_db
   PG_USER=postgres
   PG_PASSWORD=postgres
   ```

4. Install workspace dependencies:
   ```bash
   npm install
   ```

## Database Migration

Initialize the clean numbered schema and reference data:
```bash
npm run db:reset
```

## Running Locally

- **API Server** (Port 5000):
  ```bash
  npm run dev:api
  ```
- **Web Dashboard & Console** (Port 5173):
  ```bash
  npm run dev:web
  ```
- **Auth Portal** (Port 5500):
  ```bash
  npm run dev:auth
  ```

## Running Tests

- Run all unit, integration, and end-to-end tests:
  ```bash
  npm run test:all
  ```
- Run the comprehensive end-to-end booking and arrival lifecycle test:
  ```bash
  npm run test:e2e
  ```

## Building for Production

Build all web application bundles:
```bash
npm run build
```

## Mapping & Geolocation Configuration

NivaaroFix runs out of the box in development with keyless Carto Positron basemaps and public OSRM road routing. No API key or credit card is required.

To configure commercial mapping providers for production (Google Maps Platform or Mapbox), refer to [docs/maps-configuration.md](docs/maps-configuration.md).

## Documentation Index

- [Architecture & System Overview](docs/architecture.md)
- [Database Schema & Data Dictionary](docs/database.md)
- [Job Lifecycle & State Transitions](docs/job-lifecycle.md)
- [Live Tracking Architecture](docs/live-tracking.md)
- [Maps & API Key Configuration](docs/maps-configuration.md)
- [REST & WebSocket API Reference](docs/api.md)
