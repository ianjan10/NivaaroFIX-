-- Migration 009: Admin Operations, Complaints, and Defaulters
-- Adds defaulter risk tracking to professionals and creates complaints/disputes tables

-- 1. Defaulter & Risk Columns on agent_login and professionals
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS is_defaulter BOOLEAN DEFAULT FALSE;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS defaulter_reason TEXT;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS defaulter_flagged_at TIMESTAMPTZ;

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_defaulter BOOLEAN DEFAULT FALSE;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS defaulter_reason TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS defaulter_flagged_at TIMESTAMPTZ;

-- 2. Complaints and Disputes Table
CREATE TABLE IF NOT EXISTS complaints (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaint_code          VARCHAR(32) UNIQUE NOT NULL,
    service_request_id      BIGINT REFERENCES service_requests(id) ON DELETE SET NULL,
    booking_ref             VARCHAR(64),
    complainant_role        VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'customer' | 'professional' | 'admin'
    complainant_name        VARCHAR(120),
    complainant_phone       VARCHAR(20),
    professional_id         BIGINT,
    professional_name       VARCHAR(120),
    category                VARCHAR(60) NOT NULL, -- 'delayed_arrival', 'pricing_dispute', 'poor_workmanship', 'unprofessional_behavior', 'otp_dispute', 'safety_concern', 'other'
    subject                 VARCHAR(200) NOT NULL,
    description             TEXT NOT NULL,
    priority                VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    status                  VARCHAR(30) DEFAULT 'open', -- 'open', 'under_review', 'resolved', 'dismissed'
    admin_notes             TEXT,
    resolution_action       VARCHAR(60), -- 'refund_issued', 'warning_sent', 'professional_defaultered', 'no_action', 'mutual_settlement'
    resolved_at             TIMESTAMPTZ,
    resolved_by             VARCHAR(120),
    created_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_pro_id ON complaints(professional_id);
CREATE INDEX IF NOT EXISTS idx_complaints_req_id ON complaints(service_request_id);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);

