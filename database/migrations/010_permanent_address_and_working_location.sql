-- Migration 010: Permanent Address, Experience Fresher, and Separate Working Location
-- Supersedes legacy service base address and experience_years integer.

-- 1. Experience ("Fresher") SMALLINT 0-50 with column comment
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS years_of_experience SMALLINT CHECK (years_of_experience >= 0 AND years_of_experience <= 50) DEFAULT 0;
UPDATE professionals SET years_of_experience = LEAST(GREATEST(COALESCE(experience_years, 0), 0), 50) WHERE years_of_experience IS NULL OR years_of_experience = 0;
COMMENT ON COLUMN professionals.years_of_experience IS '0 means fresher';

ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS years_of_experience SMALLINT CHECK (years_of_experience >= 0 AND years_of_experience <= 50) DEFAULT 0;
UPDATE agent_login SET years_of_experience = LEAST(GREATEST(COALESCE(experience_years, 0), 0), 50) WHERE years_of_experience IS NULL OR years_of_experience = 0;
COMMENT ON COLUMN agent_login.years_of_experience IS '0 means fresher';

-- 2. Permanent Address (shared across professionals and customers)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS permanent_address TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'default_address') THEN
    UPDATE customers SET permanent_address = default_address WHERE permanent_address IS NULL;
    ALTER TABLE customers DROP COLUMN default_address;
  END IF;
END $$;

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS permanent_address TEXT;
UPDATE professionals SET permanent_address = COALESCE(address_text, address) WHERE permanent_address IS NULL;
ALTER TABLE professionals DROP COLUMN IF EXISTS base_latitude;
ALTER TABLE professionals DROP COLUMN IF EXISTS base_longitude;
ALTER TABLE professionals DROP COLUMN IF EXISTS base_accuracy_m;
ALTER TABLE professionals DROP COLUMN IF EXISTS address_text;

ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS permanent_address TEXT;
UPDATE agent_login SET permanent_address = COALESCE(address_text, address) WHERE permanent_address IS NULL;
ALTER TABLE agent_login DROP COLUMN IF EXISTS base_latitude;
ALTER TABLE agent_login DROP COLUMN IF EXISTS base_longitude;
ALTER TABLE agent_login DROP COLUMN IF EXISTS base_accuracy_m;
ALTER TABLE agent_login DROP COLUMN IF EXISTS address_text;

-- 3. Working Location (live, separate from permanent address)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS current_accuracy_m DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS current_h3_cell TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS current_locality TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS offline_reason TEXT;

ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS current_accuracy_m DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS current_h3_cell TEXT;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS current_locality TEXT;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS offline_reason TEXT;

-- Synchronize initial live coordinates for any already online agents
UPDATE professionals SET
  current_latitude = lat,
  current_longitude = lng,
  current_accuracy_m = 10,
  current_h3_cell = h3_cell,
  location_updated_at = CURRENT_TIMESTAMP
WHERE is_online = true AND lat IS NOT NULL AND lng IS NOT NULL;

UPDATE agent_login SET
  current_latitude = lat,
  current_longitude = lng,
  current_accuracy_m = location_accuracy_m,
  current_h3_cell = h3_index_res9,
  location_updated_at = CURRENT_TIMESTAMP
WHERE is_online = true AND lat IS NOT NULL AND lng IS NOT NULL;

-- 4. Update sync trigger to match permanent_address
CREATE OR REPLACE FUNCTION fn_sync_user_login_to_cust()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id BIGINT;
    v_cust_code TEXT;
BEGIN
    INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
    VALUES (NEW.email, NEW.phone, NEW.password, 'customer', COALESCE(NEW.auth_provider, 'local'), COALESCE(NEW.is_phone_verified, false))
    ON CONFLICT (email) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, users.phone),
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_user_id;

    SELECT customer_code INTO v_cust_code FROM customers WHERE email = NEW.email;
    IF v_cust_code IS NULL THEN
        v_cust_code := next_entity_code('customer', 5);
    END IF;

    INSERT INTO customers (
        user_id, customer_code, name, email, phone, permanent_address, lat, lng, updated_at
    ) VALUES (
        v_user_id, v_cust_code, NEW.name, NEW.email, NEW.phone, NEW.address, NEW.lat, NEW.lng, CURRENT_TIMESTAMP
    )
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        permanent_address = COALESCE(EXCLUDED.permanent_address, customers.permanent_address),
        lat = COALESCE(EXCLUDED.lat, customers.lat),
        lng = COALESCE(EXCLUDED.lng, customers.lng),
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Update service requests trigger to match permanent_address
CREATE OR REPLACE FUNCTION fn_service_requests_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_cust_id BIGINT;
    v_cust_code TEXT;
BEGIN
    IF NEW.service_request_code IS NULL OR NEW.service_request_code = '' THEN
        IF NEW.request_ref IS NOT NULL AND NEW.request_ref <> '' THEN
            NEW.service_request_code := NEW.request_ref;
        ELSE
            NEW.service_request_code := next_entity_code('service_request', 6);
        END IF;
    END IF;
    IF NEW.request_ref IS NULL OR NEW.request_ref = '' THEN
        NEW.request_ref := NEW.service_request_code;
    END IF;

    IF NEW.h3_cell IS NULL AND NEW.h3_index_res9 IS NOT NULL THEN
        NEW.h3_cell := NEW.h3_index_res9;
    END IF;
    IF NEW.h3_index_res9 IS NULL AND NEW.h3_cell IS NOT NULL THEN
        NEW.h3_index_res9 := NEW.h3_cell;
    END IF;

    IF NEW.customer_id IS NULL AND (NEW.user_email IS NOT NULL OR NEW.user_phone IS NOT NULL) THEN
        SELECT id INTO v_cust_id FROM customers WHERE email = NEW.user_email LIMIT 1;
        IF v_cust_id IS NULL THEN
            v_cust_code := next_entity_code('customer', 5);
            INSERT INTO customers (customer_code, name, email, phone, permanent_address, lat, lng, h3_cell)
            VALUES (v_cust_code, COALESCE(NEW.user_name, 'Customer'), COALESCE(NEW.user_email, 'customer@nivaarofix.test'), NEW.user_phone, NEW.user_address, NEW.lat, NEW.lng, NEW.h3_cell)
            RETURNING id INTO v_cust_id;
        END IF;
        NEW.customer_id := v_cust_id;
    END IF;

    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status := 'open';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;



