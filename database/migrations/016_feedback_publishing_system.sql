-- Migration 016: Feedback Publishing System (Admin + Public Site)
-- Supports publishing curated appreciation feedback to the homepage with customizable public text, name, and city.

ALTER TABLE platform_feedbacks
  ADD COLUMN IF NOT EXISTS published_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS unpublished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublished_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS public_text VARCHAR(280),
  ADD COLUMN IF NOT EXISTS public_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS public_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS booking_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_platform_feedbacks_public_feed 
  ON platform_feedbacks (published_at DESC) 
  WHERE is_published = TRUE;

