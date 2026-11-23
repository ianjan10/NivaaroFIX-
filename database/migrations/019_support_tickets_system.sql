-- Migration 019: Support Tickets & Resolution System
-- Minimalist, premium help & support ticket system for customers and professionals
-- Guaranteed 24–72 hour resolution SLA tracking

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS support_tickets (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_code             VARCHAR(32) UNIQUE NOT NULL,
    sender_role             VARCHAR(30) NOT NULL DEFAULT 'customer', -- 'customer' | 'professional' | 'guest'
    sender_id               BIGINT,                                  -- references users.id or agent_login.id if authenticated
    sender_name             VARCHAR(140) NOT NULL,
    sender_email            VARCHAR(160) NOT NULL,
    sender_phone            VARCHAR(30),
    category                VARCHAR(60) NOT NULL,                    -- 'service_issue', 'payment_billing', 'account_kyc', 'app_technical', 'emergency_safety', 'general_inquiry'
    subject                 VARCHAR(220) NOT NULL,
    description             TEXT NOT NULL,
    attachment_path         TEXT,
    attachment_name         VARCHAR(255),
    attachment_mime         VARCHAR(100),
    attachment_size         INT,
    priority                VARCHAR(20) NOT NULL DEFAULT 'normal',   -- 'low', 'normal', 'high', 'urgent'
    status                  VARCHAR(30) NOT NULL DEFAULT 'open',     -- 'open', 'in_progress', 'resolved', 'closed'
    sla_hours               INT NOT NULL DEFAULT 72,                 -- standard 24 to 72 hours guarantee
    sla_deadline            TIMESTAMPTZ NOT NULL,                    -- created_at + interval '72 hours'
    solution                TEXT,                                    -- administrative solution provided to complainant
    admin_notes             TEXT,                                    -- internal admin investigation notes
    resolved_by             VARCHAR(120),                            -- admin username who resolved the issue
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_code ON support_tickets(ticket_code);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sender ON support_tickets(sender_role, sender_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla ON support_tickets(sla_deadline ASC);
