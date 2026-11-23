import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../apps/api/src/config/db.js';
import {
  isKnownDefaultPassword,
  isWeakPassword,
  hashAdminPassword,
  logAdminAudit
} from '../apps/api/src/utils/adminSecurity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export async function runAdminSeed() {
  const username = (process.env.ADMIN_SEED_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!password) {
    console.error('❌ Error: ADMIN_SEED_PASSWORD must be configured in your local .env file.');
    process.exit(1);
  }

  // Refuse known default password when NODE_ENV is production
  if (process.env.NODE_ENV === 'production') {
    if (isKnownDefaultPassword(password) || isWeakPassword(password)) {
      console.error('❌ Refusal: Cannot seed admin with known default or weak password in production environment.');
      process.exit(1);
    }
  }

  const client = await pool.connect();
  try {
    // 1. Check if account already exists (idempotent, never overwrite existing password)
    const existing = await client.query(
      'SELECT id, username, must_change_password FROM admin_users WHERE username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      console.log(`✓ Admin account '${username}' already exists. Idempotent check passed; existing password preserved.`);
      return;
    }

    // 2. Hash password and insert
    const passwordHash = await hashAdminPassword(password);
    const isProductionOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const mustChangePassword = isProductionOrStaging;

    const insertRes = await client.query(`
      INSERT INTO admin_users (
        username, email, password_hash, role, is_active, must_change_password, failed_attempts, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, username, role, must_change_password;
    `, [
      username,
      `${username}@internal.nivaarofix.com`,
      passwordHash,
      'owner',
      true,
      mustChangePassword
    ]);

    const newAdmin = insertRes.rows[0];

    // 3. Write immutable audit log
    await logAdminAudit({
      adminUserId: newAdmin.id,
      action: 'seed',
      targetType: 'admin_user',
      targetId: newAdmin.id,
      result: 'success',
      details: { username: newAdmin.username, role: newAdmin.role }
    });

    console.log(`✅ Default admin '${newAdmin.username}' seeded successfully (Role: ${newAdmin.role}).`);
  } catch (err) {
    console.error('❌ Failed to seed admin account:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Execute if run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAdminSeed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

