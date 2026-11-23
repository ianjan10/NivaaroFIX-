-- Migration 015: Admin Feedback Management & Publishing
-- Adds columns for feedback publishing to website, resolution status, and administrative action notes.

ALTER TABLE platform_feedbacks 
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(50) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_platform_feedbacks_published ON platform_feedbacks (is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_platform_feedbacks_resolution ON platform_feedbacks (resolution_status);

