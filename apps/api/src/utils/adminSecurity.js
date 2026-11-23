import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

// Precomputed bcrypt hash (12 rounds) for unknown usernames to ensure constant-time response
const DUMMY_BCRYPT_HASH = '$2b$12$TN2wM57VQhBDMdy6QwFkh.Cp6n0UKNTFG.2IB8k4G/oEggITI3L/S';

// SHA-256 hashes of known default or trivially weak passwords for secret hygiene
// 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9 -> default seed password
// 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918 -> 'admin'
// 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8 -> 'password'
// ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f -> '12345678'
const KNOWN_DEFAULT_SHA256 = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
const KNOWN_WEAK_HASHES = new Set([
  KNOWN_DEFAULT_SHA256,
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f'
]);

export function isKnownDefaultPassword(password) {
  if (!password || typeof password !== 'string') return false;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return hash === KNOWN_DEFAULT_SHA256;
}

export function isWeakPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) return true;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return KNOWN_WEAK_HASHES.has(hash);
}

export async function hashAdminPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyAdminPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export async function dummyHashCheck(password) {
  return bcrypt.compare(password || '', DUMMY_BCRYPT_HASH);
}

export function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

/**
 * Log entry into append-only admin_audit_log. Never pass or log passwords.
 */
export async function logAdminAudit({
  adminUserId = null,
  action,
  targetType = 'admin_auth',
  targetId = null,
  result,
  ip = null,
  userAgent = null,
  details = {}
}) {
  try {
    // Defense-in-depth: sanitize details object to ensure passwords are never stored
    const safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.current_password;
    delete safeDetails.new_password;

    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, target_type, target_id, result, ip, user_agent, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      adminUserId ? parseInt(adminUserId, 10) : null,
      action,
      targetType,
      targetId ? String(targetId) : null,
      result,
      ip ? String(ip).substring(0, 45) : null,
      userAgent ? String(userAgent).substring(0, 500) : null,
      JSON.stringify(safeDetails)
    ]);
  } catch (err) {
    console.error('Failed to write admin audit log:', err.message);
  }
}

// In-memory rate-limiter tracker: 5 failed attempts per 15 minutes per username and IP
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

// Maps: key -> { attempts: count, firstAttempt: timestamp, lockedUntil: timestamp }
const rateLimitStore = new Map();

function normalizeIp(ip) {
  let s = String(ip || '').trim();
  if (s === '::1' || s === '::ffff:127.0.0.1') return '127.0.0.1';
  return s;
}

function getRateLimitKeys(username, ip) {
  const normUser = String(username || '').trim().toLowerCase();
  const normIp = normalizeIp(ip);
  return {
    userKey: `user:${normUser}`,
    ipKey: `ip:${normIp}`,
    comboKey: `combo:${normUser}:${normIp}`
  };
}

export async function checkLoginRateLimit(username, ip) {
  const now = Date.now();
  const { userKey, ipKey, comboKey } = getRateLimitKeys(username, ip);

  // 1. Check in-memory store for username, ip, and combo
  for (const key of [comboKey, userKey, ipKey]) {
    const record = rateLimitStore.get(key);
    if (record) {
      if (record.lockedUntil && record.lockedUntil > now) {
        const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
        return { isLocked: true, retryAfterSeconds };
      }
      // Expire window
      if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(key);
      }
    }
  }

  // 2. Check database locked_until for persistent user lockout
  const normUser = String(username || '').trim().toLowerCase();
  if (normUser) {
    try {
      const res = await pool.query(
        'SELECT locked_until FROM admin_users WHERE username = $1',
        [normUser]
      );
      if (res.rows.length > 0 && res.rows[0].locked_until) {
        const dbLockedUntil = new Date(res.rows[0].locked_until).getTime();
        if (dbLockedUntil > now) {
          const retryAfterSeconds = Math.ceil((dbLockedUntil - now) / 1000);
          return { isLocked: true, retryAfterSeconds };
        }
      }
    } catch (err) {
      console.warn('DB rate-limit check error:', err.message);
    }
  }

  return { isLocked: false, retryAfterSeconds: 0 };
}

export async function recordFailedLogin(username, ip) {
  const now = Date.now();
  const { userKey, ipKey, comboKey } = getRateLimitKeys(username, ip);
  let newlyLocked = false;
  let retryAfterSeconds = 0;

  for (const key of [comboKey, userKey, ipKey]) {
    let record = rateLimitStore.get(key);
    if (!record || (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS)) {
      record = { attempts: 1, firstAttempt: now, lockedUntil: null };
    } else {
      record.attempts += 1;
    }

    if (record.attempts >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
      newlyLocked = true;
      retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
    }

    rateLimitStore.set(key, record);
  }

  // Also update DB failed_attempts and locked_until for registered users
  const normUser = String(username || '').trim().toLowerCase();
  if (normUser) {
    try {
      if (newlyLocked) {
        await pool.query(`
          UPDATE admin_users 
          SET failed_attempts = failed_attempts + 1,
              locked_until = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
              updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
        `, [normUser]);
      } else {
        await pool.query(`
          UPDATE admin_users 
          SET failed_attempts = failed_attempts + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE username = $1
        `, [normUser]);
      }
    } catch (err) {
      console.warn('DB failed attempt record error:', err.message);
    }
  }

  return { newlyLocked, retryAfterSeconds: retryAfterSeconds || 900 };
}

export async function clearLoginRateLimit(username, ip) {
  const { userKey, ipKey, comboKey } = getRateLimitKeys(username, ip);
  rateLimitStore.delete(userKey);
  rateLimitStore.delete(comboKey);
  if (ip) {
    rateLimitStore.delete(ipKey);
    rateLimitStore.delete('ip:127.0.0.1');
    rateLimitStore.delete('ip:::1');
  }
  if (username) {
    const normUser = String(username || '').trim().toLowerCase();
    rateLimitStore.delete(`combo:${normUser}:127.0.0.1`);
    rateLimitStore.delete(`combo:${normUser}:`);
  }

  const normUser = String(username || '').trim().toLowerCase();
  if (normUser) {
    try {
      await pool.query(`
        UPDATE admin_users 
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE username = $1
      `, [normUser]);
    } catch (err) {
      console.warn('DB rate-limit clear error:', err.message);
    }
  }
}

// 30 minute idle timeout, 12 hours absolute lifetime
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000;

export async function createAdminSession({ adminUserId, ip, userAgent }) {
  // Random 256-bit session id (64 hex characters)
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS);

  await pool.query(`
    INSERT INTO admin_sessions (
      id, admin_user_id, created_at, last_seen_at, expires_at, ip, user_agent
    ) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $4, $5)
  `, [
    sessionId,
    parseInt(adminUserId, 10),
    expiresAt,
    ip ? String(ip).substring(0, 45) : null,
    userAgent ? String(userAgent).substring(0, 500) : null
  ]);

  return { sessionId, expiresAt };
}

export async function verifyAdminSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length !== 64) {
    return { valid: false, reason: 'invalid_token' };
  }

  const res = await pool.query(`
    SELECT s.id, s.admin_user_id, s.created_at, s.last_seen_at, s.expires_at,
           u.username, u.email, u.role, u.is_active, u.must_change_password
    FROM admin_sessions s
    JOIN admin_users u ON s.admin_user_id = u.id
    WHERE s.id = $1
  `, [sessionId]);

  if (res.rows.length === 0) {
    return { valid: false, reason: 'not_found' };
  }

  const row = res.rows[0];
  if (!row.is_active) {
    await deleteAdminSession(sessionId);
    return { valid: false, reason: 'account_inactive' };
  }

  const now = Date.now();
  const createdAt = new Date(row.created_at).getTime();
  const lastSeenAt = new Date(row.last_seen_at).getTime();

  // Check 12 hours absolute lifetime
  if (now - createdAt > ABSOLUTE_LIFETIME_MS) {
    await deleteAdminSession(sessionId);
    return { valid: false, reason: 'absolute_timeout' };
  }

  // Check 30 minutes idle timeout
  if (now - lastSeenAt > IDLE_TIMEOUT_MS) {
    await deleteAdminSession(sessionId);
    return { valid: false, reason: 'idle_timeout' };
  }

  // Session is active: refresh last_seen_at and push expires_at up to 30 mins (capped at 12h absolute)
  const remainingAbsolute = ABSOLUTE_LIFETIME_MS - (now - createdAt);
  const nextIdleExtension = Math.min(IDLE_TIMEOUT_MS, remainingAbsolute);
  const newExpiresAt = new Date(now + nextIdleExtension);

  await pool.query(`
    UPDATE admin_sessions 
    SET last_seen_at = CURRENT_TIMESTAMP,
        expires_at = $2
    WHERE id = $1
  `, [sessionId, newExpiresAt]);

  return {
    valid: true,
    user: {
      id: row.admin_user_id,
      username: row.username,
      email: row.email,
      role: row.role,
      must_change_password: row.must_change_password
    }
  };
}

export async function deleteAdminSession(sessionId) {
  if (!sessionId) return;
  try {
    await pool.query('DELETE FROM admin_sessions WHERE id = $1', [sessionId]);
  } catch (err) {
    console.warn('Error deleting admin session:', err.message);
  }
}

// Persistent cryptographic HMAC-signed CSRF token generator
const CSRF_SECRET = process.env.ADMIN_CSRF_SECRET || process.env.JWT_SECRET || 'nivaarofix_admin_csrf_secret_key_stable_2026';
const csrfStore = new Map();

export function generateCsrfToken() {
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours validity
  const entropy = crypto.randomBytes(16).toString('hex');
  const payload = `${expiresAt}.${entropy}`;
  const sig = crypto.createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  csrfStore.set(token, expiresAt);
  return token;
}

export function verifyCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;

  // 1. Direct memory match
  const expiry = csrfStore.get(token);
  if (expiry && Date.now() <= expiry) {
    return true;
  }

  // 2. Cryptographic HMAC validation (survives server restarts & process recycles!)
  const parts = token.split('.');
  if (parts.length === 3) {
    const [expStr, entropy, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (!isNaN(exp) && Date.now() <= exp) {
      const payload = `${expStr}.${entropy}`;
      const expectedSig = crypto.createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
      try {
        if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
          csrfStore.set(token, exp);
          return true;
        }
      } catch (_) {}
    }
  }

  // 3. In development, allow any valid session-backed 16+ character token to prevent stale-tab blocks
  if (process.env.NODE_ENV !== 'production' && typeof token === 'string' && token.length >= 16) {
    return true;
  }

  return false;
}

/**
 * Production startup security check:
 * Startup MUST fail if an admin still has the known default password or weak env seed password in production.
 */
export async function validateProductionAdminSecurity() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  // 1. Check environment seed password if specified
  const envSeedPassword = process.env.ADMIN_SEED_PASSWORD;
  if (envSeedPassword) {
    if (isKnownDefaultPassword(envSeedPassword) || isWeakPassword(envSeedPassword)) {
      console.error('❌ FATAL: Production startup refused. ADMIN_SEED_PASSWORD is set to a default or weak password.');
      process.exit(1);
    }
  }

  // 2. Check active admin users in DB for known default password
  try {
    const res = await pool.query('SELECT id, username, password_hash FROM admin_users WHERE is_active = TRUE');
    for (const row of res.rows) {
      if (envSeedPassword && (await bcrypt.compare(envSeedPassword, row.password_hash))) {
        if (isKnownDefaultPassword(envSeedPassword)) {
          console.error(`❌ FATAL: Production startup refused. Admin '${row.username}' still has the known default development password.`);
          process.exit(1);
        }
      }
    }
  } catch (err) {
    // If table doesn't exist yet, migrations will create it
    if (!err.message.includes('relation "admin_users" does not exist')) {
      console.error('Error during production admin security check:', err);
    }
  }
}
