-- Migration 014: Platform Feedback System
-- Enables any visitor, customer, or professional (authenticated or unauthenticated) to submit minimalist ratings and feedback.

CREATE TABLE IF NOT EXISTS platform_feedbacks (
  id BIGSERIAL PRIMARY KEY,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  problem_definition VARCHAR(100),
  comment TEXT NOT NULL,
  contact_info VARCHAR(255),
  user_id BIGINT,
  user_role VARCHAR(50) DEFAULT 'guest',
  device_info JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_feedbacks_created_at ON platform_feedbacks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_feedbacks_status ON platform_feedbacks (status);

