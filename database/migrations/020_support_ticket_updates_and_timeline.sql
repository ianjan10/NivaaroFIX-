-- Migration 020: Support Ticket Updates, Information Requests & Full Timeline
-- Enables admin to request additional explanation or photos from customer/professional,
-- and allows user to submit replies with attachments, rendering a sleek minimalist timeline.

CREATE TABLE IF NOT EXISTS support_ticket_updates (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    update_type     VARCHAR(40) NOT NULL DEFAULT 'comment', -- 'created', 'status_change', 'info_request', 'user_reply', 'resolution'
    sender_type     VARCHAR(30) NOT NULL DEFAULT 'admin',   -- 'admin', 'user', 'system'
    sender_name     VARCHAR(140),
    message         TEXT NOT NULL,
    attachment_path TEXT,
    attachment_name VARCHAR(255),
    attachment_mime VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_updates_ticket ON support_ticket_updates(ticket_id, created_at ASC);

-- Add helper columns to support_tickets if they don't already exist
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS info_requested_message TEXT,
ADD COLUMN IF NOT EXISTS info_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS info_responded_at TIMESTAMPTZ;
