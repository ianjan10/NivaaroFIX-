-- ============================================================================
-- Migration 006: Professional Verification System
-- Mobile OTP, Live Photo, Document Encryption & Compliance, and Admin Review
-- ============================================================================

-- 0. Cleanly replace legacy stub tables
DROP TABLE IF EXISTS professional_documents CASCADE;
DROP TABLE IF EXISTS professional_photos CASCADE;
DROP TABLE IF EXISTS mobile_verifications CASCADE;
DROP TABLE IF EXISTS verification_audit_log CASCADE;

-- 1. Mobile Verifications (HMAC-SHA256 hashed OTPs, strict rate limiting)
CREATE TABLE IF NOT EXISTS mobile_verifications (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone               VARCHAR(32) NOT NULL,
    code_hash           VARCHAR(128) NOT NULL,
    attempts            INT NOT NULL DEFAULT 0,
    max_attempts        INT NOT NULL DEFAULT 5,
    ip_address          VARCHAR(64),
    expires_at          TIMESTAMPTZ NOT NULL,
    consumed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_mobile_verif_lookup ON mobile_verifications(phone, expires_at);
CREATE INDEX IF NOT EXISTS ix_mobile_verif_rate ON mobile_verifications(phone, created_at);
CREATE INDEX IF NOT EXISTS ix_mobile_verif_ip ON mobile_verifications(ip_address, created_at);

COMMENT ON TABLE mobile_verifications IS 'Cryptographically secure mobile OTP storage with HMAC hashes and attempt tracking.';
COMMENT ON COLUMN mobile_verifications.phone IS 'E.164 or normalized 10-digit mobile number.';
COMMENT ON COLUMN mobile_verifications.code_hash IS 'HMAC-SHA256 hex digest of 6-digit OTP using server OTP_SECRET. Plain OTP is never stored.';
COMMENT ON COLUMN mobile_verifications.attempts IS 'Failed verification attempts counter.';
COMMENT ON COLUMN mobile_verifications.max_attempts IS 'Maximum verification attempts before code is locked (default 5).';
COMMENT ON COLUMN mobile_verifications.ip_address IS 'Client IP address for hourly rate limiting.';
COMMENT ON COLUMN mobile_verifications.expires_at IS 'Expiration timestamp (5 minutes from creation).';
COMMENT ON COLUMN mobile_verifications.consumed_at IS 'Timestamp when successfully consumed; prevents replay.';

-- 2. Professional Documents (Aadhaar & Driving Licence, encrypted at rest)
CREATE TABLE IF NOT EXISTS professional_documents (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id     BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    document_type       VARCHAR(32) NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'not_uploaded',
    encrypted_file_path TEXT,
    file_iv             VARCHAR(64),
    file_auth_tag       VARCHAR(64),
    mime_type           VARCHAR(64),
    file_size_bytes     INT,
    aadhaar_last4       VARCHAR(4),
    document_expiry     DATE,
    consent_at          TIMESTAMPTZ,
    checks              JSONB NOT NULL DEFAULT '{}',
    rejection_reason    TEXT,
    reviewed_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    delete_after        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_pro_doc_type CHECK (document_type IN ('aadhaar', 'driving_licence')),
    CONSTRAINT ck_pro_doc_status CHECK (status IN ('not_uploaded', 'uploading', 'under_review', 'verified', 'needs_attention', 'rejected')),
    CONSTRAINT uq_pro_doc_type UNIQUE (professional_id, document_type)
);

CREATE INDEX IF NOT EXISTS ix_pro_docs_status ON professional_documents(status);
CREATE INDEX IF NOT EXISTS ix_pro_docs_retention ON professional_documents(delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pro_docs_pro_id ON professional_documents(professional_id);

COMMENT ON TABLE professional_documents IS 'Government verification documents encrypted with AES-256-GCM. Never stores full Aadhaar.';
COMMENT ON COLUMN professional_documents.professional_id IS 'Foreign key to professionals table.';
COMMENT ON COLUMN professional_documents.document_type IS 'Type of document: aadhaar or driving_licence.';
COMMENT ON COLUMN professional_documents.status IS 'Lifecycle state: not_uploaded, uploading, under_review, verified, needs_attention, rejected.';
COMMENT ON COLUMN professional_documents.encrypted_file_path IS 'Private server file path containing AES-256-GCM ciphertext.';
COMMENT ON COLUMN professional_documents.file_iv IS 'Hex-encoded initialization vector (12 bytes) for GCM mode.';
COMMENT ON COLUMN professional_documents.file_auth_tag IS 'Hex-encoded authentication tag (16 bytes) for GCM mode.';
COMMENT ON COLUMN professional_documents.aadhaar_last4 IS 'Strictly last 4 digits of Aadhaar number. Full 12 digits are never retained.';
COMMENT ON COLUMN professional_documents.document_expiry IS 'Expiry date read via OCR for driving licences.';
COMMENT ON COLUMN professional_documents.consent_at IS 'Timestamp when professional consented to document verification.';
COMMENT ON COLUMN professional_documents.checks IS 'JSONB payload containing automated quality, OCR, Verhoeff, QR signature, and name match results.';
COMMENT ON COLUMN professional_documents.delete_after IS 'Retention expiration date. File ciphertext is wiped after this date.';

-- 3. Professional Live Photos (Live camera capture, face hint score)
CREATE TABLE IF NOT EXISTS professional_photos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id     BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    encrypted_file_path TEXT NOT NULL,
    file_iv             VARCHAR(64) NOT NULL,
    file_auth_tag       VARCHAR(64) NOT NULL,
    mime_type           VARCHAR(64) NOT NULL,
    is_upload_fallback  BOOLEAN NOT NULL DEFAULT FALSE,
    face_similarity_score NUMERIC(5,2),
    status              VARCHAR(32) NOT NULL DEFAULT 'under_review',
    checks              JSONB NOT NULL DEFAULT '{}',
    rejection_reason    TEXT,
    reviewed_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    delete_after        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_pro_photo_status CHECK (status IN ('under_review', 'verified', 'rejected')),
    CONSTRAINT uq_pro_photo UNIQUE (professional_id)
);

CREATE INDEX IF NOT EXISTS ix_pro_photos_status ON professional_photos(status);
CREATE INDEX IF NOT EXISTS ix_pro_photos_pro_id ON professional_photos(professional_id);

COMMENT ON TABLE professional_photos IS 'Live portrait captures for professional identity proof. Embeddings are never stored.';
COMMENT ON COLUMN professional_photos.is_upload_fallback IS 'True if captured via file upload fallback when camera was unavailable; requires manual review.';
COMMENT ON COLUMN professional_photos.face_similarity_score IS 'Automated comparison score (0.00 to 100.00) against Aadhaar portrait. Advisory hint only.';
COMMENT ON COLUMN professional_photos.status IS 'Review state: under_review, verified, rejected.';

-- 4. Verification Audit Log (Tamper-evident audit trail)
CREATE TABLE IF NOT EXISTS verification_audit_log (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id     BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    actor_id            BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_email         VARCHAR(255),
    action              VARCHAR(64) NOT NULL,
    target_type         VARCHAR(32) NOT NULL,
    target_id           BIGINT,
    reason              TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    ip_address          VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_verif_audit_pro ON verification_audit_log(professional_id);
CREATE INDEX IF NOT EXISTS ix_verif_audit_action ON verification_audit_log(action);
CREATE INDEX IF NOT EXISTS ix_verif_audit_created ON verification_audit_log(created_at);

COMMENT ON TABLE verification_audit_log IS 'Immutable audit ledger for all mobile, document, photo, and admin decisions.';
COMMENT ON COLUMN verification_audit_log.action IS 'Specific event: mobile_sent, mobile_verified, document_uploaded, document_approved, document_rejected, photo_captured, photo_approved, photo_rejected.';
COMMENT ON COLUMN verification_audit_log.actor_email IS 'Admin email or system identifier who made the determination.';
COMMENT ON COLUMN verification_audit_log.reason IS 'Mandatory reason text when rejecting document or photo.';

-- 5. Extend Professionals & Agent Login with granular verification status
ALTER TABLE professionals
    ADD COLUMN IF NOT EXISTS photo_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS aadhaar_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dl_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verification_checklist JSONB NOT NULL DEFAULT '{"mobile": false, "photo": false, "aadhaar": false}';

ALTER TABLE agent_login
    ADD COLUMN IF NOT EXISTS photo_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS aadhaar_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dl_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verification_checklist JSONB NOT NULL DEFAULT '{"mobile": false, "photo": false, "aadhaar": false}';

COMMENT ON COLUMN professionals.photo_verified IS 'True when live portrait has been approved by admin.';
COMMENT ON COLUMN professionals.aadhaar_verified IS 'True when Aadhaar card has been approved by admin.';
COMMENT ON COLUMN professionals.dl_verified IS 'True when driving licence has been approved by admin (optional).';
COMMENT ON COLUMN professionals.verification_checklist IS 'Current verification checklist status summary for dispatch gating.';
