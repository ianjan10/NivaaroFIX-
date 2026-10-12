import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../apps/api/src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('--- NivaaroFix Migration Runner ---');
  const client = await pool.connect();
  try {
    const migrationFile = path.resolve(__dirname, '../database/migrations/001_initial_schema.sql');
    const catalogFile = path.resolve(__dirname, '../database/reference-data/service_catalog.sql');

    console.log('1. Executing 001_initial_schema.sql...');
    const schemaSql = fs.readFileSync(migrationFile, 'utf8');
    await client.query(schemaSql);
    console.log('   Schema migration applied successfully.');

    console.log('2. Executing service_catalog.sql...');
    const catalogSql = fs.readFileSync(catalogFile, 'utf8');
    await client.query(catalogSql);
    console.log('   Reference data catalog seeded successfully.');

    // Compatibility Views ensuring zero downtime with existing endpoints
    console.log('3. Ensuring compatibility views...');
    await client.query(`

      CREATE OR REPLACE VIEW bookings AS
      SELECT
        sr.id,
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
        sr.arrived_at,
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
        sr.lng
      FROM service_requests sr
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN professionals p ON p.id = sr.assigned_professional_id
      LEFT JOIN quotes q ON q.id = sr.accepted_quote_id
      LEFT JOIN door_otps d ON d.service_request_id = sr.id
      LEFT JOIN feedback f ON f.service_request_id = sr.id;

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
          arrived_at = COALESCE(NEW.arrived_at, service_requests.arrived_at),
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
    `);

    console.log('--- Migration & Views Verified Successfully! ---');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
