-- ==============================================================================
-- NivaaroFix — Additive Migration 012: Admin Approvals & Verification Requests System
-- Migration: 012_admin_approvals_system.sql
-- Non-destructive additive migration
-- ==============================================================================

-- 1. Verification Requests Table (Strict FIFO Queue, Claim Locks & Optimistic Concurrency)
CREATE TABLE IF NOT EXISTS verification_requests (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id         BIGINT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    status                  VARCHAR(32) NOT NULL DEFAULT 'pending' 
                            CHECK (status IN ('pending', 'in_review', 'needs_attention', 'approved', 'rejected')),
    queued_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    first_submitted_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submission_count        INT NOT NULL DEFAULT 1,
    claimed_by_admin_id     BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    claimed_until           TIMESTAMPTZ,
    decided_by_admin_id     BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    decided_at              TIMESTAMPTZ,
    decision_note           TEXT,
    version                 INT NOT NULL DEFAULT 1,
    has_updated_details     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Crucial composite index for strict FIFO queue performance under high load (<200ms p95 at 5,000 requests)
CREATE INDEX IF NOT EXISTS idx_verif_req_status_queued ON verification_requests(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_verif_req_pro_id ON verification_requests(professional_id);
CREATE INDEX IF NOT EXISTS idx_verif_req_claimed ON verification_requests(claimed_by_admin_id, claimed_until);
CREATE INDEX IF NOT EXISTS idx_verif_req_decided_at ON verification_requests(decided_at);

COMMENT ON TABLE verification_requests IS 'Strict FIFO queue of professional identity verification requests.';
COMMENT ON COLUMN verification_requests.id IS 'Primary identifier for verification request.';
COMMENT ON COLUMN verification_requests.professional_id IS 'Foreign key referencing the professional seeking verification.';
COMMENT ON COLUMN verification_requests.status IS 'Lifecycle state: pending, in_review, needs_attention, approved, rejected.';
COMMENT ON COLUMN verification_requests.queued_at IS 'Timestamp of the latest complete submission. Dictates strict queue order (oldest first).';
COMMENT ON COLUMN verification_requests.first_submitted_at IS 'Timestamp of the initial complete submission.';
COMMENT ON COLUMN verification_requests.submission_count IS 'Number of submission iterations (increments on resubmission after needs_attention).';
COMMENT ON COLUMN verification_requests.claimed_by_admin_id IS 'Admin user holding active exclusive review lock.';
COMMENT ON COLUMN verification_requests.claimed_until IS 'Lease expiration timestamp for active review lock (default 10 minutes from claim/heartbeat).';
COMMENT ON COLUMN verification_requests.decided_by_admin_id IS 'Admin user who made final or intermediate decision.';
COMMENT ON COLUMN verification_requests.decided_at IS 'Timestamp of decision.';
COMMENT ON COLUMN verification_requests.decision_note IS 'Administrative note accompanying decision.';
COMMENT ON COLUMN verification_requests.version IS 'Optimistic locking integer incremented on every state transition to prevent conflicting decisions.';
COMMENT ON COLUMN verification_requests.has_updated_details IS 'Flagged true if non-locked profile details were updated while pending review.';

-- 2. Verification Items Table (Granular Per-Item Review: Photo, Aadhaar, Licence, Details)
CREATE TABLE IF NOT EXISTS verification_items (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id              BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
    item_type               VARCHAR(32) NOT NULL 
                            CHECK (item_type IN ('mobile', 'live_photo', 'aadhaar', 'driving_licence', 'personal_details')),
    status                  VARCHAR(32) NOT NULL DEFAULT 'pending' 
                            CHECK (status IN ('pending', 'approved', 'needs_attention', 'rejected', 'not_provided')),
    reason_code             VARCHAR(64),
    reason_note             TEXT,
    reviewed_by             BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    reviewed_at             TIMESTAMPTZ,
    document_id             BIGINT REFERENCES professional_documents(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_verif_req_item UNIQUE (request_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_verif_items_request ON verification_items(request_id);
CREATE INDEX IF NOT EXISTS idx_verif_items_status ON verification_items(status);

COMMENT ON TABLE verification_items IS 'Granular review status for each verification artifact belonging to a request.';
COMMENT ON COLUMN verification_items.id IS 'Primary key for verification item.';
COMMENT ON COLUMN verification_items.request_id IS 'Foreign key to parent verification request.';
COMMENT ON COLUMN verification_items.item_type IS 'Item category: mobile, live_photo, aadhaar, driving_licence, personal_details.';
COMMENT ON COLUMN verification_items.status IS 'Review state: pending, approved, needs_attention, rejected, not_provided.';
COMMENT ON COLUMN verification_items.reason_code IS 'Machine-readable reason code referencing verification_reason_templates.';
COMMENT ON COLUMN verification_items.reason_note IS 'Optional custom note provided by reviewing admin.';
COMMENT ON COLUMN verification_items.reviewed_by IS 'Admin user who reviewed this specific item.';
COMMENT ON COLUMN verification_items.reviewed_at IS 'Timestamp when item status was set.';
COMMENT ON COLUMN verification_items.document_id IS 'Optional link to professional_documents row if applicable.';

-- 3. Verification Reason Templates Table
CREATE TABLE IF NOT EXISTS verification_reason_templates (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                    VARCHAR(64) NOT NULL UNIQUE,
    label                   TEXT NOT NULL,
    professional_message    TEXT NOT NULL,
    applies_to              VARCHAR(64) NOT NULL DEFAULT 'all',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verif_reasons_code ON verification_reason_templates(code);

COMMENT ON TABLE verification_reason_templates IS 'Standardized administrative reason templates presented to professionals.';
COMMENT ON COLUMN verification_reason_templates.code IS 'Unique code identifier for reason template.';
COMMENT ON COLUMN verification_reason_templates.label IS 'Internal admin UI label.';
COMMENT ON COLUMN verification_reason_templates.professional_message IS 'Plain-language message displayed to the professional on their profile.';
COMMENT ON COLUMN verification_reason_templates.applies_to IS 'Item scope: all, live_photo, aadhaar, driving_licence, personal_details.';
COMMENT ON COLUMN verification_reason_templates.is_active IS 'Active availability flag.';

-- Seed Standard Reason Templates
INSERT INTO verification_reason_templates (code, label, professional_message, applies_to) VALUES
('image_blurry', 'Image is blurry or unreadable', 'The uploaded photo or document is blurry or unreadable. Please provide a clear, high-resolution original image.', 'all'),
('document_cropped', 'Document is cropped or incomplete', 'The document is cropped, cut off, or incomplete. Please ensure all four corners and details are clearly visible in the frame.', 'all'),
('name_mismatch', 'Name does not match profile', 'The legal name on this document does not match the name entered in your profile. Please upload a document matching your legal name or update your profile.', 'all'),
('invalid_or_expired', 'Document is invalid or expired', 'The document uploaded is expired or not legally valid. Please upload a valid, current government document.', 'all'),
('face_mismatch', 'Live photo does not match document', 'Your live selfie does not clearly match the portrait shown on your government identity card. Please take a clear, well-lit live selfie without glasses or face coverings.', 'live_photo'),
('qr_unverifiable', 'QR code could not be verified', 'The secure QR code on your Aadhaar card could not be cryptographically verified. Please upload an official e-Aadhaar PDF or clear original photo.', 'aadhaar'),
('wrong_document_type', 'Wrong document type uploaded', 'The uploaded file does not match the requested document type. Please verify and upload the requested document.', 'all'),
('details_incomplete', 'Personal details incomplete or incorrect', 'The personal details or permanent address provided appear incomplete or invalid. Please verify and correct your profile information.', 'personal_details'),
('other', 'Other reason (custom note required)', 'Please review the administrative note regarding your submission.', 'all')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    professional_message = EXCLUDED.professional_message,
    applies_to = EXCLUDED.applies_to,
    is_active = TRUE;

-- 4. Verification Events Table (Audit History Timeline)
CREATE TABLE IF NOT EXISTS verification_events (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id              BIGINT NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
    event_type              VARCHAR(64) NOT NULL,
    actor_type              VARCHAR(32) NOT NULL CHECK (actor_type IN ('admin', 'professional', 'system')),
    actor_id                BIGINT,
    details                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verif_events_req_date ON verification_events(request_id, created_at);

COMMENT ON TABLE verification_events IS 'Chronological audit trail of all actions and state transitions on a verification request.';
COMMENT ON COLUMN verification_events.id IS 'Primary identity key for event.';
COMMENT ON COLUMN verification_events.request_id IS 'Foreign key to parent verification request.';
COMMENT ON COLUMN verification_events.event_type IS 'Action type: submitted, claimed, released, heartbeat, reupload_requested, resubmitted, details_updated, approved, rejected.';
COMMENT ON COLUMN verification_events.actor_type IS 'Actor role: admin, professional, system.';
COMMENT ON COLUMN verification_events.actor_id IS 'ID of actor (admin_users.id or professionals.id or NULL for system).';
COMMENT ON COLUMN verification_events.details IS 'Structured JSON payload with event parameters.';

-- 5. Customer Registry: Admin Seen Timestamp
ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_seen_at TIMESTAMPTZ;
COMMENT ON COLUMN customers.admin_seen_at IS 'Timestamp when an admin opened the customer details; NULL denotes unread/new registration.';

CREATE INDEX IF NOT EXISTS idx_customers_admin_seen ON customers(admin_seen_at);

