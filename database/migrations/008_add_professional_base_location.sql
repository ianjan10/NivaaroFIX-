-- Migration 008: Add Professional Base Location Columns
-- Adds explicit base_latitude, base_longitude, base_accuracy_m, and address_text columns
-- to professionals and agent_login tables for GPS-anchored dispatching and service base locations.

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS base_latitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS base_longitude DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS base_accuracy_m DOUBLE PRECISION;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS address_text TEXT;

UPDATE professionals
SET
  base_latitude = COALESCE(base_latitude, lat),
  base_longitude = COALESCE(base_longitude, lng),
  address_text = COALESCE(address_text, address)
WHERE base_latitude IS NULL OR address_text IS NULL;

ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS base_latitude DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS base_longitude DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS base_accuracy_m DOUBLE PRECISION;
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS address_text TEXT;

UPDATE agent_login
SET
  base_latitude = COALESCE(base_latitude, lat),
  base_longitude = COALESCE(base_longitude, lng),
  base_accuracy_m = COALESCE(base_accuracy_m, location_accuracy_m),
  address_text = COALESCE(address_text, address)
WHERE base_latitude IS NULL OR address_text IS NULL;

