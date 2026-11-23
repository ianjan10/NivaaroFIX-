-- ==============================================================================
-- NivaaroFix — Additive Migration 011: Admin Users, Sessions & Immutable Audit Log
-- Migration: 011_admin_auth_and_audit.sql
-- Non-destructive additive migration
-- ==============================================================================

-- 1. Administrative Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username                VARCHAR(64) NOT NULL UNIQUE CHECK (username = LOWER(username)),
    email                   VARCHAR(255) UNIQUE,
    password_hash           VARCHAR(255) NOT NULL,
    role                    VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'support', 'verifier')),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password    BOOLEAN NOT NULL DEFAULT FALSE,
    failed_attempts         INT NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    totp_secret             VARCHAR(128),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

COMMENT ON TABLE admin_users IS 'Internal administrative staff, operators, and platform owners with role-based access.';
COMMENT ON COLUMN admin_users.id IS 'Primary internal identity key for admin user.';
COMMENT ON COLUMN admin_users.username IS 'Case-insensitive unique username for admin authentication.';
COMMENT ON COLUMN admin_users.email IS 'Optional unique contact and recovery email for admin user.';
COMMENT ON COLUMN admin_users.password_hash IS 'Cryptographically secure Argon2id or bcrypt password hash.';
COMMENT ON COLUMN admin_users.role IS 'Authorization role: owner, support, or verifier.';
COMMENT ON COLUMN admin_users.is_active IS 'Administrative access kill-switch; inactive admins cannot log in.';
COMMENT ON COLUMN admin_users.must_change_password IS 'Enforces credential rotation before accessing administrative consoles.';
COMMENT ON COLUMN admin_users.failed_attempts IS 'Consecutive authentication failure counter for rate-limiting and temporary lockouts.';
COMMENT ON COLUMN admin_users.locked_until IS 'Timestamp until which login attempts are unconditionally rejected due to rate limiting.';
COMMENT ON COLUMN admin_users.last_login_at IS 'Timestamp of the most recent successful authentication.';
COMMENT ON COLUMN admin_users.totp_secret IS 'Optional TOTP seed secret for two-factor authentication.';
COMMENT ON COLUMN admin_users.created_at IS 'Record creation timestamp.';
COMMENT ON COLUMN admin_users.updated_at IS 'Last modification timestamp.';

-- 2. Cryptographic Server-Side Admin Sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
    id                      VARCHAR(64) PRIMARY KEY,
    admin_user_id           BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at              TIMESTAMPTZ NOT NULL,
    ip                      VARCHAR(45),
    user_agent              TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

COMMENT ON TABLE admin_sessions IS 'Active server-side sessions for authenticated admin operators.';
COMMENT ON COLUMN admin_sessions.id IS 'Cryptographically random 256-bit session token identifier (hex).';
COMMENT ON COLUMN admin_sessions.admin_user_id IS 'Foreign key referencing the authenticated admin user.';
COMMENT ON COLUMN admin_sessions.created_at IS 'Session initialization timestamp.';
COMMENT ON COLUMN admin_sessions.last_seen_at IS 'Timestamp of the most recent authenticated activity for idle timeout checks.';
COMMENT ON COLUMN admin_sessions.expires_at IS 'Absolute or idle expiration timestamp of the session.';
COMMENT ON COLUMN admin_sessions.ip IS 'Origin IP address recorded at session issuance or renewal.';
COMMENT ON COLUMN admin_sessions.user_agent IS 'Client browser User-Agent recorded at session issuance.';

-- 3. Immutable Append-Only Admin Audit Log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id           BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    action                  VARCHAR(100) NOT NULL,
    target_type             VARCHAR(100),
    target_id               VARCHAR(100),
    result                  VARCHAR(50) NOT NULL,
    ip                      VARCHAR(45),
    user_agent              TEXT,
    details                 JSONB DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);

COMMENT ON TABLE admin_audit_log IS 'Append-only audit ledger recording every administrative authentication and operational event.';
COMMENT ON COLUMN admin_audit_log.id IS 'Primary identity sequence key for audit entries.';
COMMENT ON COLUMN admin_audit_log.admin_user_id IS 'ID of the admin who performed the action, or NULL if anonymous/failed attempt.';
COMMENT ON COLUMN admin_audit_log.action IS 'High-level action identifier (e.g., login, logout, lock, password_change).';
COMMENT ON COLUMN admin_audit_log.target_type IS 'Entity type acted upon (e.g., admin_user, booking, professional).';
COMMENT ON COLUMN admin_audit_log.target_id IS 'Identifier of the entity acted upon.';
COMMENT ON COLUMN admin_audit_log.result IS 'Outcome status: success, failure, or locked.';
COMMENT ON COLUMN admin_audit_log.ip IS 'Client IP address where the event originated.';
COMMENT ON COLUMN admin_audit_log.user_agent IS 'Client User-Agent header of the initiating client.';
COMMENT ON COLUMN admin_audit_log.details IS 'Structured JSON context detailing the event (never contains passwords).';
COMMENT ON COLUMN admin_audit_log.created_at IS 'Immutable timestamp when the audit event occurred.';

-- Enforce Append-Only Guarantee on admin_audit_log
CREATE OR REPLACE FUNCTION prevent_admin_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log is append-only: UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable
BEFORE UPDATE OR DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_modification();

