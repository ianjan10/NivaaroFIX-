/**
 * NivaaroFix — PostgreSQL Database Client & Schema Initialization
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'nivaarofix_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Initializes database schema by validating the baseline migration.
 */
export async function initDatabase() {
  const client = await pool.connect();
  try {
    const checkSeq = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'code_sequences';");
    if (checkSeq.rows.length === 0) {
      console.log('🔗 Baseline schema not detected. Executing migration 001_initial_schema.sql...');
      const migrationFile = path.resolve(__dirname, '../../../../database/migrations/001_initial_schema.sql');
      const catalogFile = path.resolve(__dirname, '../../../../database/reference-data/service_catalog.sql');
      
      if (fs.existsSync(migrationFile)) {
        await client.query(fs.readFileSync(migrationFile, 'utf8'));
      }
      if (fs.existsSync(catalogFile)) {
        await client.query(fs.readFileSync(catalogFile, 'utf8'));
      }
    }
    console.log('✅ NivaaroFix Clean Numbered Database Schema verified & ready!');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
