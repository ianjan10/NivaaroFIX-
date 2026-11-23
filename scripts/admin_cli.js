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

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

async function main() {
  const command = process.argv[2];

  if (command === 'create') {
    const username = (getArg('--username') || '').trim().toLowerCase();
    const role = (getArg('--role') || 'support').toLowerCase();
    const password = getArg('--password');
    const email = getArg('--email') || (username ? `${username}@internal.nivaarofix.com` : null);

    if (!username || !password) {
      console.error('Usage: node scripts/admin_cli.js create --username <username> --role <owner|support|verifier> --password <password> [--email <email>]');
      process.exit(1);
    }

    if (!['owner', 'support', 'verifier'].includes(role)) {
      console.error("❌ Invalid role. Allowed roles are: 'owner', 'support', 'verifier'");
      process.exit(1);
    }

    if (isKnownDefaultPassword(password)) {
      console.error('❌ Refusal: Cannot use the known default development password for created accounts.');
      process.exit(1);
    }

    if (isWeakPassword(password)) {
      console.error('❌ Refusal: Password is too weak. Minimum 8 characters with non-trivial complexity required.');
      process.exit(1);
    }

    const client = await pool.connect();
    try {
      const existing = await client.query('SELECT id FROM admin_users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        console.error(`❌ Admin account '${username}' already exists.`);
        process.exit(1);
      }

      const passwordHash = await hashAdminPassword(password);
      const res = await client.query(`
        INSERT INTO admin_users (
          username, email, password_hash, role, is_active, must_change_password, failed_attempts, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, true, false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, username, role;
      `, [username, email, passwordHash, role]);

      const created = res.rows[0];
      await logAdminAudit({
        adminUserId: created.id,
        action: 'cli_create_admin',
        targetType: 'admin_user',
        targetId: created.id,
        result: 'success',
        details: { username: created.username, role: created.role }
      });

      console.log(`✅ Admin account '${created.username}' created successfully with role '${created.role}'.`);
    } finally {
      client.release();
    }
    process.exit(0);
  }

  if (command === 'passwd') {
    const username = (getArg('--username') || '').trim().toLowerCase();
    const newPassword = getArg('--password');

    if (!username || !newPassword) {
      console.error('Usage: node scripts/admin_cli.js passwd --username <username> --password <newPassword>');
      process.exit(1);
    }

    if (isKnownDefaultPassword(newPassword)) {
      console.error('❌ Refusal: Cannot set password to the known default development password.');
      process.exit(1);
    }

    if (isWeakPassword(newPassword)) {
      console.error('❌ Refusal: Password is too weak. Minimum 8 characters with non-trivial complexity required.');
      process.exit(1);
    }

    const client = await pool.connect();
    try {
      const userRes = await client.query('SELECT id, username FROM admin_users WHERE username = $1', [username]);
      if (userRes.rows.length === 0) {
        console.error(`❌ Admin account '${username}' not found.`);
        process.exit(1);
      }

      const user = userRes.rows[0];
      const newHash = await hashAdminPassword(newPassword);

      await client.query(`
        UPDATE admin_users 
        SET password_hash = $1, 
            must_change_password = false,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newHash, user.id]);

      // Revoke any active sessions upon password rotation
      await client.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [user.id]);

      await logAdminAudit({
        adminUserId: user.id,
        action: 'cli_change_password',
        targetType: 'admin_user',
        targetId: user.id,
        result: 'success',
        details: { username: user.username }
      });

      console.log(`✅ Password for admin '${user.username}' updated successfully. Active sessions revoked.`);
    } finally {
      client.release();
    }
    process.exit(0);
  }

  console.error('Unknown command. Available commands: create, passwd');
  process.exit(1);
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});

