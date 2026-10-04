# Contributing to NivaaroFix

Thank you for your interest in contributing to NivaaroFix! We welcome community contributions, bug fixes, and feature improvements.

---

## 1. Development Workflow

### Prerequisites
- Node.js 18+ or 20+
- PostgreSQL 14+ running locally on port 5432
- npm 9+

### Initial Setup
```bash
# 1. Clone the repository
git clone https://github.com/your-org/nivaarofix.git
cd nivaarofix

# 2. Install all dependencies across the monorepo
npm run install:all

# 3. Configure environment variables
cp backend/.env.example backend/.env
cp Dashboard/.env.example Dashboard/.env
cp WebLogin/.env.example WebLogin/.env

# 4. Initialize and seed local database
npm run db:reset
```

### Running Locally
```bash
# Concurrently start all three services:
npm run dev:backend    # Terminal 1: Port 5000
npm run dev:dashboard  # Terminal 2: Port 5173
npm run dev:login      # Terminal 3: Port 5500
```

---

## 2. Git Branching & Commit Standards

- **Branch Naming**:
  - `feat/feature-name`
  - `fix/bug-description`
  - `docs/documentation-update`
  - `refactor/component-name`

- **Commit Message Format**:
  We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - `feat(dispatch): add progressive 10km GPS ring search`
  - `fix(auth): prevent TDZ state evaluation on agent session startup`
  - `docs(api): document door safety OTP endpoint schema`

---

## 3. Testing Requirements

Before opening a pull request, ensure all monorepo test suites pass:

```bash
# Run all tests
npm run test:all

# Test frontend builds
npm run build:all
```

---

## 4. Code Standards
- Code formatting is enforced via `.editorconfig`.
- Strict **Zero Mock Data Policy**: Endpoints and UI components must read from and persist to PostgreSQL.
- Keep components modular and single-responsibility.
