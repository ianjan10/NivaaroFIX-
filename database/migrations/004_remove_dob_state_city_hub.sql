-- ==============================================================================
-- Migration 004: Remove Date of Birth, State, City, and Hub Everywhere
-- ==============================================================================

-- 1. Redefine fn_sync_agent_login_to_pro without city/state
CREATE OR REPLACE FUNCTION fn_sync_agent_login_to_pro()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id BIGINT;
BEGIN
    INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
    VALUES (NEW.email, NEW.phone, NEW.password, 'professional', COALESCE(NEW.auth_provider, 'local'), COALESCE(NEW.is_phone_verified, false))
    ON CONFLICT (email) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, users.phone),
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_user_id;

    INSERT INTO professionals (
        user_id, professional_code, name, email, phone, trade, experience_years,
        address, kyc_status, rating, completed_jobs, is_online,
        availability_status, wallet_balance, lat, lng, h3_cell, updated_at
    ) VALUES (
        v_user_id, NEW.partner_id, NEW.name, NEW.email, NEW.phone, NEW.trade,
        COALESCE(NEW.experience_years, 0), NEW.address,
        LOWER(COALESCE(NEW.kyc_status, 'pending')), NEW.rating, COALESCE(NEW.completed_jobs, 0),
        COALESCE(NEW.is_online, false), LOWER(COALESCE(NEW.availability_status, 'available')),
        COALESCE(NEW.wallet_balance, 0.00), NEW.lat, NEW.lng, NEW.h3_index_res9, CURRENT_TIMESTAMP
    )
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, professionals.phone),
        trade = EXCLUDED.trade,
        experience_years = EXCLUDED.experience_years,
        address = COALESCE(EXCLUDED.address, professionals.address),
        is_online = EXCLUDED.is_online,
        availability_status = EXCLUDED.availability_status,
        rating = COALESCE(EXCLUDED.rating, professionals.rating),
        completed_jobs = EXCLUDED.completed_jobs,
        wallet_balance = EXCLUDED.wallet_balance,
        lat = COALESCE(EXCLUDED.lat, professionals.lat),
        lng = COALESCE(EXCLUDED.lng, professionals.lng),
        h3_cell = COALESCE(EXCLUDED.h3_cell, professionals.h3_cell),
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop columns from professionals
ALTER TABLE professionals DROP COLUMN IF EXISTS city;
ALTER TABLE professionals DROP COLUMN IF EXISTS state;
ALTER TABLE professionals DROP COLUMN IF EXISTS hub;
ALTER TABLE professionals DROP COLUMN IF EXISTS service_hub;

-- 3. Drop columns from agent_login
ALTER TABLE agent_login DROP COLUMN IF EXISTS dob;
ALTER TABLE agent_login DROP COLUMN IF EXISTS city;
ALTER TABLE agent_login DROP COLUMN IF EXISTS state;
ALTER TABLE agent_login DROP COLUMN IF EXISTS hub;
ALTER TABLE agent_login DROP COLUMN IF EXISTS service_hub;

-- 4. Drop columns from user_login
ALTER TABLE user_login DROP COLUMN IF EXISTS dob;
ALTER TABLE user_login DROP COLUMN IF EXISTS city;
ALTER TABLE user_login DROP COLUMN IF EXISTS state;
ALTER TABLE user_login DROP COLUMN IF EXISTS hub;
ALTER TABLE user_login DROP COLUMN IF EXISTS service_hub;

-- 5. Drop any residual columns from customers & users
ALTER TABLE customers DROP COLUMN IF EXISTS city;
ALTER TABLE customers DROP COLUMN IF EXISTS state;
ALTER TABLE customers DROP COLUMN IF EXISTS dob;
ALTER TABLE customers DROP COLUMN IF EXISTS date_of_birth;
ALTER TABLE customers DROP COLUMN IF EXISTS hub;
ALTER TABLE customers DROP COLUMN IF EXISTS service_hub;

ALTER TABLE users DROP COLUMN IF EXISTS city;
ALTER TABLE users DROP COLUMN IF EXISTS state;
ALTER TABLE users DROP COLUMN IF EXISTS dob;
ALTER TABLE users DROP COLUMN IF EXISTS date_of_birth;
ALTER TABLE users DROP COLUMN IF EXISTS hub;
ALTER TABLE users DROP COLUMN IF EXISTS service_hub;

