import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from '../apps/api/src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(50) PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      checksum    VARCHAR(64) NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function isPopulatedDatabase(client) {
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('users', 'customers', 'professionals', 'service_requests', 'bookings', 'user_login', 'agent_login');
  `);
  return res.rows.length >= 3;
}

export async function runSafeMigrations() {
  console.log('--- NivaaroFix Safe Migration Runner ---');
  const client = await pool.connect();

  try {
    // 1. Ensure registry table exists
    await ensureMigrationRegistry(client);

    // 2. Discover migration files
    const migrationsDir = path.resolve(__dirname, '../database/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // 3. Query already applied migrations
    const appliedRes = await client.query('SELECT version, name, checksum FROM schema_migrations;');
    const appliedMap = new Map();
    for (const row of appliedRes.rows) {
      appliedMap.set(row.version, row);
    }

    // 4. Check if this is an existing populated database that predates schema_migrations
    const isPopulated = await isPopulatedDatabase(client);

    if (isPopulated && !appliedMap.has('001')) {
      console.log('ℹ️ Existing populated database detected without migration records.');
      console.log('   Safely establishing baseline migration state (001 and 002) without re-running destructive scripts.');

      // Baseline 001
      const f001 = '001_initial_schema.sql';
      const c001 = fs.existsSync(path.join(migrationsDir, f001)) ? getChecksum(fs.readFileSync(path.join(migrationsDir, f001), 'utf8')) : 'baseline';
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING;',
        ['001', f001, c001]
      );
      appliedMap.set('001', { version: '001', name: f001, checksum: c001 });

      // Baseline 002 if tables/columns exist
      const checkProgress = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'service_requests' AND column_name = 'in_progress_at';
      `);
      if (checkProgress.rows.length > 0) {
        const f002 = '002_booking_progress_timestamps.sql';
        const c002 = fs.existsSync(path.join(migrationsDir, f002)) ? getChecksum(fs.readFileSync(path.join(migrationsDir, f002), 'utf8')) : 'baseline';
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING;',
          ['002', f002, c002]
        );
        appliedMap.set('002', { version: '002', name: f002, checksum: c002 });
      }
    }

    // 5. Apply any unapplied migrations in sequential order
    let appliedCount = 0;
    for (const file of migrationFiles) {
      const version = file.split('_')[0];
      if (appliedMap.has(version)) {
        console.log(`✓ Migration [${version}] ${file} already applied.`);
        continue;
      }

      console.log(`⚙️ Applying unapplied migration [${version}] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = getChecksum(sqlContent);

      await client.query('BEGIN;');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP);',
          [version, file, checksum]
        );
        await client.query('COMMIT;');
        console.log(`✅ Applied migration [${version}] ${file} successfully.`);
        appliedCount++;
      } catch (migrationErr) {
        await client.query('ROLLBACK;');
        console.error(`❌ Migration [${version}] failed:`, migrationErr.message);
        throw migrationErr;
      }
    }

    // 6. Ensure reference service catalog is seeded if missing
    const catCheck = await client.query("SELECT COUNT(*) FROM service_categories;").catch(() => ({ rows: [{ count: 0 }] }));
    if (parseInt(catCheck.rows[0].count, 10) === 0) {
      const catalogFile = path.resolve(__dirname, '../database/reference-data/service_catalog.sql');
      if (fs.existsSync(catalogFile)) {
        console.log('Seeding reference service catalog...');
        await client.query(fs.readFileSync(catalogFile, 'utf8'));
        console.log('Reference service catalog seeded.');
      }
    }

    console.log(`--- Migration check complete: ${appliedCount} new migrations applied. Database is safe and up-to-date. ---`);
  } catch (err) {
    console.error('Migration runner error:', err.message);
    process.exitCode = 1;
    throw err;
  } finally {
    client.release();
  }
}

// Direct execution from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSafeMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
