-- ==============================================================================
-- NivaaroFix — Additive Migration 003: Secure Sessions, OTPs & Financial Audit
-- Migration: 003_secure_sessions_and_audit.sql
-- Non-destructive additive migration
-- ==============================================================================

-- 1. Schema Migration Registry (Idempotent tracking)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version             VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    checksum            VARCHAR(64) NOT NULL,
    applied_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE schema_migrations IS 'Tracks versioned, applied database migrations safely preventing duplicate execution.';

-- 2. Cryptographic Server-Side User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_token_hash  VARCHAR(64) NOT NULL UNIQUE,
    user_id             BIGINT,
    agent_id            BIGINT,
    role                VARCHAR(30) NOT NULL CHECK (role IN ('customer', 'agent', 'admin')),
    email               VARCHAR(255) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    last_accessed_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address          VARCHAR(45),
    user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_email ON user_sessions(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_role ON user_sessions(role);

COMMENT ON TABLE user_sessions IS 'Stores cryptographically secure SHA-256 session token hashes with revocation and expiration.';

-- 3. Server-Verified OTP Verifications
CREATE TABLE IF NOT EXISTS otp_verifications (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier          VARCHAR(255) NOT NULL,
    otp_code_hash       VARCHAR(64) NOT NULL,
    purpose             VARCHAR(50) NOT NULL DEFAULT 'phone_login',
    attempts            INT NOT NULL DEFAULT 0,
    max_attempts        INT NOT NULL DEFAULT 5,
    expires_at          TIMESTAMPTZ NOT NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_verifications(identifier, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

COMMENT ON TABLE otp_verifications IS 'Server-managed OTP records with rate limiting, expiration, and single-use enforcement.';

-- 4. Financial Audit Columns for Wallet Transactions (Preserving all historical data)
ALTER TABLE wallet_transactions 
ADD COLUMN IF NOT EXISTS audit_status VARCHAR(50) DEFAULT 'unverified_historical',
ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN wallet_transactions.audit_status IS 'Distinguishes unverified/provisional historical records from real gateway settlements.';
COMMENT ON COLUMN wallet_transactions.is_settled IS 'True only when verified bank settlement or payment gateway payout has occurred.';

