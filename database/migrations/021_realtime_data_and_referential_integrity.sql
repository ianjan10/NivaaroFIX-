-- ============================================================================
-- Migration 021: Realtime Data Persistence & Complete Referential Integrity
-- ============================================================================

-- 1. Real-Time Events Store (ensures zero data loss during WebSocket / SSE reconnects)
CREATE TABLE IF NOT EXISTS realtime_events (
  id BIGSERIAL PRIMARY KEY,
  channel VARCHAR(120) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type VARCHAR(50),
  actor_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_channel ON realtime_events(channel);
CREATE INDEX IF NOT EXISTS idx_realtime_events_type ON realtime_events(event_type);
CREATE INDEX IF NOT EXISTS idx_realtime_events_created ON realtime_events(created_at DESC);

-- 2. Real-Time Presence Store (ensures live availability and heartbeats are preserved)
CREATE TABLE IF NOT EXISTS realtime_presence (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
  socket_id VARCHAR(100),
  ip_address VARCHAR(45),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_realtime_presence UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_realtime_presence_status ON realtime_presence(entity_type, status);
CREATE INDEX IF NOT EXISTS idx_realtime_presence_heartbeat ON realtime_presence(last_heartbeat_at DESC);

-- 3. Location Updates Indices (speeds up live route replay and audit queries)
CREATE INDEX IF NOT EXISTS idx_location_updates_req_created ON location_updates(service_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_updates_pro_created ON location_updates(professional_id, created_at DESC);

-- 4. Enforce Referential Integrity & Prevent Orphan Broken Links
-- (Clean any residual invalid orphans before applying constraints)
DELETE FROM professional_gps_log WHERE professional_id IS NOT NULL AND professional_id NOT IN (SELECT id FROM professionals);
DELETE FROM job_events WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM service_requests);
DELETE FROM request_dispatches WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM service_requests);
DELETE FROM reviews WHERE request_id IS NOT NULL AND request_id NOT IN (SELECT id FROM service_requests);
DELETE FROM reviews WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers);
DELETE FROM reviews WHERE provider_id IS NOT NULL AND provider_id NOT IN (SELECT id FROM professionals);
DELETE FROM wallet_transactions WHERE agent_id IS NOT NULL AND agent_id NOT IN (SELECT id FROM professionals);
DELETE FROM platform_feedbacks WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
DELETE FROM user_sessions WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);

DO $$
BEGIN
  -- professional_gps_log -> professionals
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_professional_gps_log_pro') THEN
    ALTER TABLE professional_gps_log 
    ADD CONSTRAINT fk_professional_gps_log_pro 
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE;
  END IF;

  -- job_events -> service_requests
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_job_events_request') THEN
    ALTER TABLE job_events 
    ADD CONSTRAINT fk_job_events_request 
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
  END IF;

  -- request_dispatches -> service_requests
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_request_dispatches_request') THEN
    ALTER TABLE request_dispatches 
    ADD CONSTRAINT fk_request_dispatches_request 
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
  END IF;

  -- reviews -> service_requests
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reviews_request') THEN
    ALTER TABLE reviews 
    ADD CONSTRAINT fk_reviews_request 
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
  END IF;

  -- reviews -> customers
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reviews_customer') THEN
    ALTER TABLE reviews 
    ADD CONSTRAINT fk_reviews_customer 
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
  END IF;

  -- reviews -> professionals
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reviews_provider') THEN
    ALTER TABLE reviews 
    ADD CONSTRAINT fk_reviews_provider 
    FOREIGN KEY (provider_id) REFERENCES professionals(id) ON DELETE CASCADE;
  END IF;

  -- wallet_transactions -> professionals
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_wallet_tx_pro') THEN
    ALTER TABLE wallet_transactions 
    ADD CONSTRAINT fk_wallet_tx_pro 
    FOREIGN KEY (agent_id) REFERENCES professionals(id) ON DELETE CASCADE;
  END IF;

  -- platform_feedbacks -> users
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_platform_feedbacks_user') THEN
    ALTER TABLE platform_feedbacks 
    ADD CONSTRAINT fk_platform_feedbacks_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- user_sessions -> users
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_user_sessions_user') THEN
    ALTER TABLE user_sessions 
    ADD CONSTRAINT fk_user_sessions_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
