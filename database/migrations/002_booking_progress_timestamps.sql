-- Migration: 002_booking_progress_timestamps.sql
-- Description: Add sequential step timestamps (confirmed_at, on_the_way_at, arrived_at, in_progress_at, completed_at)
--              with column comments, non-decreasing CHECK constraints, and view synchronization.

ALTER TABLE service_requests 
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS on_the_way_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN service_requests.confirmed_at IS 'UTC timestamp when quote was accepted and booking confirmed.';
COMMENT ON COLUMN service_requests.on_the_way_at IS 'UTC timestamp when professional marked on the way / en route.';
COMMENT ON COLUMN service_requests.arrived_at IS 'UTC timestamp when professional arrived at customer location.';
COMMENT ON COLUMN service_requests.in_progress_at IS 'UTC timestamp when door OTP was verified and service began.';
COMMENT ON COLUMN service_requests.completed_at IS 'UTC timestamp when job was completed with photos/remarks.';

-- Synchronize in_progress_at with started_at if started_at already exists
UPDATE service_requests 
SET in_progress_at = started_at 
WHERE in_progress_at IS NULL AND started_at IS NOT NULL;

-- CHECK constraints enforcing chronological sequence:
-- confirmed -> on_the_way -> arrived -> in_progress -> completed
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS ck_sr_seq_on_the_way;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS ck_sr_seq_arrived;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS ck_sr_seq_in_progress;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS ck_sr_seq_completed;

ALTER TABLE service_requests
  ADD CONSTRAINT ck_sr_seq_on_the_way CHECK (
    on_the_way_at IS NULL OR confirmed_at IS NULL OR on_the_way_at >= confirmed_at
  ),
  ADD CONSTRAINT ck_sr_seq_arrived CHECK (
    arrived_at IS NULL OR on_the_way_at IS NULL OR arrived_at >= on_the_way_at
  ),
  ADD CONSTRAINT ck_sr_seq_in_progress CHECK (
    in_progress_at IS NULL OR arrived_at IS NULL OR in_progress_at >= arrived_at
  ),
  ADD CONSTRAINT ck_sr_seq_completed CHECK (
    completed_at IS NULL OR in_progress_at IS NULL OR completed_at >= in_progress_at
  );

-- Update bookings view to include the 5 sequential step timestamps
DROP VIEW IF EXISTS bookings CASCADE;

CREATE VIEW bookings AS
SELECT sr.id,
  sr.service_request_code AS booking_ref,
  c.user_id,
  c.email AS user_email,
  c.name AS user_name,
  c.phone AS user_phone,
  sr.user_address,
  sr.service_title,
  sr.category,
  sr.issue_type,
  sr.problem_description,
  sr.problem_timing,
  sr.problem_frequency,
  COALESCE(q.amount, 0.00) AS total_amount,
  d.otp_code,
  sr.status,
  p.name AS technician_name,
  p.phone AS technician_phone,
  COALESCE(q.estimated_duration_minutes, 30) AS eta_minutes,
  sr.id AS request_id,
  sr.accepted_quote_id,
  sr.assigned_professional_id AS assigned_agent_id,
  sr.started_at,
  sr.confirmed_at,
  sr.on_the_way_at,
  sr.arrived_at,
  sr.in_progress_at,
  sr.completed_at,
  sr.otp_verified_at,
  sr.completion_photos,
  sr.completion_remarks,
  sr.created_at,
  sr.updated_at,
  sr.cancel_reason,
  f.rating,
  f.comment AS review_feedback,
  COALESCE(f.tags, '[]'::jsonb) AS review_tags,
  p.lat AS technician_lat,
  p.lng AS technician_lng,
  sr.lat,
  sr.lng,
  COALESCE(s.slug, sr.service_id::text, 'general-service') AS service_id,
  sr.photos,
  sr.problem_timing AS time_slot
 FROM service_requests sr
   LEFT JOIN customers c ON c.id = sr.customer_id
   LEFT JOIN professionals p ON p.id = sr.assigned_professional_id
   LEFT JOIN quotes q ON q.id = sr.accepted_quote_id
   LEFT JOIN door_otps d ON d.service_request_id = sr.id
   LEFT JOIN feedback f ON f.service_request_id = sr.id
   LEFT JOIN services s ON s.id = sr.service_id;

-- Triggers enabling full INSERT / UPDATE / DELETE on bookings compatibility view
CREATE OR REPLACE FUNCTION fn_bookings_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_sr_id BIGINT;
  v_service_id BIGINT;
  v_ref TEXT;
BEGIN
  v_ref := COALESCE(NEW.booking_ref, next_entity_code('service_request', 6));

  IF NEW.service_id IS NOT NULL AND NEW.service_id <> '' THEN
    IF (NEW.service_id ~ '^[0-9]+$') THEN
      v_service_id := NEW.service_id::bigint;
    ELSE
      SELECT id INTO v_service_id FROM services WHERE slug = NEW.service_id LIMIT 1;
    END IF;
  END IF;

  INSERT INTO service_requests (
    service_request_code, request_ref, user_id, user_email, user_name, user_phone, user_address,
    lat, lng, service_id, service_title, category, issue_type,
    problem_description, problem_timing, problem_frequency, photos,
    status, otp_code, accepted_quote_id, assigned_professional_id,
    started_at, confirmed_at, on_the_way_at, arrived_at, in_progress_at, completed_at,
    completion_photos, completion_remarks
  ) VALUES (
    v_ref, v_ref, NEW.user_id, NEW.user_email, NEW.user_name, NEW.user_phone, COALESCE(NEW.user_address, 'Doorstep'),
    COALESCE(NEW.lat, 12.9716), COALESCE(NEW.lng, 77.5946), v_service_id, COALESCE(NEW.service_title, 'General Service'), COALESCE(NEW.category, 'electrician'), NEW.issue_type,
    NEW.problem_description, COALESCE(NEW.problem_timing, NEW.time_slot), NEW.problem_frequency, COALESCE(NEW.photos, '[]'::jsonb),
    COALESCE(NEW.status, 'open'), NEW.otp_code, NEW.accepted_quote_id, NEW.assigned_agent_id,
    NEW.started_at, NEW.confirmed_at, NEW.on_the_way_at, NEW.arrived_at, NEW.in_progress_at, NEW.completed_at,
    COALESCE(NEW.completion_photos, '[]'::jsonb), NEW.completion_remarks
  ) RETURNING id INTO v_sr_id;

  IF NEW.otp_code IS NOT NULL AND NEW.otp_code <> '' THEN
    INSERT INTO door_otps (service_request_id, otp_code)
    VALUES (v_sr_id, NEW.otp_code)
    ON CONFLICT (service_request_id) DO UPDATE SET otp_code = EXCLUDED.otp_code;
  END IF;

  NEW.id := v_sr_id;
  NEW.booking_ref := v_ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_insert ON bookings;
CREATE TRIGGER trg_bookings_insert
  INSTEAD OF INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_bookings_insert();

CREATE OR REPLACE FUNCTION fn_bookings_update()
RETURNS TRIGGER AS $$
DECLARE
  v_pro_id BIGINT;
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM professionals WHERE id = NEW.assigned_agent_id) THEN
      v_pro_id := NEW.assigned_agent_id;
    ELSE
      SELECT p.id INTO v_pro_id FROM professionals p JOIN agent_login a ON a.email = p.email WHERE a.id = NEW.assigned_agent_id LIMIT 1;
      IF v_pro_id IS NULL THEN
        SELECT id INTO v_pro_id FROM professionals ORDER BY id ASC LIMIT 1;
      END IF;
    END IF;
  END IF;

  UPDATE service_requests
  SET
    status = COALESCE(NEW.status, service_requests.status),
    accepted_quote_id = COALESCE(NEW.accepted_quote_id, service_requests.accepted_quote_id),
    assigned_professional_id = COALESCE(v_pro_id, service_requests.assigned_professional_id),
    started_at = COALESCE(NEW.started_at, service_requests.started_at),
    confirmed_at = COALESCE(NEW.confirmed_at, service_requests.confirmed_at),
    on_the_way_at = COALESCE(NEW.on_the_way_at, service_requests.on_the_way_at),
    arrived_at = COALESCE(NEW.arrived_at, service_requests.arrived_at),
    in_progress_at = COALESCE(NEW.in_progress_at, service_requests.in_progress_at),
    completed_at = COALESCE(NEW.completed_at, service_requests.completed_at),
    otp_verified_at = COALESCE(NEW.otp_verified_at, service_requests.otp_verified_at),
    completion_photos = COALESCE(NEW.completion_photos, service_requests.completion_photos),
    completion_remarks = COALESCE(NEW.completion_remarks, service_requests.completion_remarks),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.id OR service_request_code = OLD.booking_ref OR request_ref = OLD.booking_ref;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_update ON bookings;
CREATE TRIGGER trg_bookings_update
  INSTEAD OF UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_bookings_update();

CREATE OR REPLACE FUNCTION fn_bookings_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM service_requests WHERE id = OLD.id OR service_request_code = OLD.booking_ref OR request_ref = OLD.booking_ref;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_delete ON bookings;
CREATE TRIGGER trg_bookings_delete
  INSTEAD OF DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_bookings_delete();
