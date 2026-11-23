import crypto from 'crypto';
import https from 'https';
import { pool } from '../config/db.js';

export const SESSION_COOKIE_NAME = 'nivaarofix_session';
const SESSION_DURATION_DAYS = 7;

/**
 * Hash password using Node.js crypto.scrypt with a secure 16-byte random salt.
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password against stored hash with timing-safe comparison.
 * Returns { valid: boolean, needsRehash: boolean }
 * If storedHash is legacy plaintext, valid is true and needsRehash is true.
 */
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof password !== 'string') {
    return { valid: false, needsRehash: false };
  }

  // Modern scrypt format: scrypt$salt$hash
  if (typeof storedHash === 'string' && storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const salt = parts[1];
    const originalHash = parts[2];

    return new Promise((resolve) => {
      crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return resolve({ valid: false, needsRehash: false });
        try {
          const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
          const origBuffer = Buffer.from(originalHash, 'hex');
          if (keyBuffer.length !== origBuffer.length) {
            return resolve({ valid: false, needsRehash: false });
          }
          const match = crypto.timingSafeEqual(keyBuffer, origBuffer);
          resolve({ valid: match, needsRehash: false });
        } catch (_) {
          resolve({ valid: false, needsRehash: false });
        }
      });
    });
  }

  // Controlled migration check for legacy plaintext passwords
  const isPlaintextMatch = password === storedHash;
  return { valid: isPlaintextMatch, needsRehash: isPlaintextMatch };
}

/**
 * Generate 256-bit cryptographically secure random session token.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash session token with SHA-256 for secure database storage.
 */
export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token).trim(), 'utf8').digest('hex');
}

/**
 * Create a new server-side session in PostgreSQL.
 */
export async function createSession({ userId = null, agentId = null, role, email, ipAddress = null, userAgent = null, durationDays = SESSION_DURATION_DAYS }) {
  if (!role || !email) {
    throw new Error('Role and email are required to create a session.');
  }

  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const res = await pool.query(`
    INSERT INTO user_sessions (
      session_token_hash, user_id, agent_id, role, email,
      created_at, expires_at, last_accessed_at, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP, $7, $8)
    RETURNING id, role, email, expires_at;
  `, [
    tokenHash,
    userId ? parseInt(userId, 10) : null,
    agentId ? parseInt(agentId, 10) : null,
    role,
    email.toLowerCase().trim(),
    expiresAt,
    ipAddress,
    userAgent ? String(userAgent).substring(0, 500) : null
  ]);

  return {
    rawToken,
    token: rawToken,
    session: res.rows[0]
  };
}

/**
 * Validate a raw session token against PostgreSQL.
 * Updates last_accessed_at if valid.
 */
export async function validateSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashSessionToken(rawToken);

  const res = await pool.query(`
    SELECT s.id, s.user_id, s.agent_id, s.role, s.email, s.expires_at, s.revoked_at
    FROM user_sessions s
    WHERE s.session_token_hash = $1
      AND s.expires_at > CURRENT_TIMESTAMP
      AND s.revoked_at IS NULL
    LIMIT 1;
  `, [tokenHash]);

  if (res.rows.length === 0) return null;

  const session = res.rows[0];

  // Update last_accessed_at asynchronously
  pool.query('UPDATE user_sessions SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1;', [session.id]).catch(() => {});

  // Fetch full account profile details
  if (session.role === 'customer') {
    const userRes = await pool.query(
      'SELECT id, name, email, phone, address, avatar_url, is_phone_verified FROM user_login WHERE id = $1 OR email = $2 LIMIT 1;',
      [session.user_id, session.email]
    );
    return {
      session,
      user: userRes.rows[0] || { id: session.user_id, email: session.email, role: 'customer' },
      role: 'customer'
    };
  } else if (session.role === 'agent') {
    const agentRes = await pool.query(
      'SELECT id, partner_id, name, email, phone, trade, address, rating, completed_jobs, wallet_balance, avatar_url, kyc_status, is_phone_verified, payout_status, bank_name, bank_last4 FROM agent_login WHERE id = $1 OR email = $2 LIMIT 1;',
      [session.agent_id, session.email]
    );
    return {
      session,
      agent: agentRes.rows[0] || { id: session.agent_id, email: session.email, role: 'agent' },
      role: 'agent'
    };
  }

  return { session, role: session.role };
}

/**
 * Revoke an active session.
 */
export async function revokeSession(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashSessionToken(rawToken);
  const res = await pool.query(
    'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = $1 AND revoked_at IS NULL RETURNING id;',
    [tokenHash]
  );
  return res.rows.length > 0;
}

/**
 * Parse incoming HTTP request cookies.
 */
export function parseCookies(reqOrCookieString) {
  const list = {};
  let cookieHeader = '';
  if (typeof reqOrCookieString === 'string') {
    cookieHeader = reqOrCookieString;
  } else if (reqOrCookieString && reqOrCookieString.headers) {
    cookieHeader = reqOrCookieString.headers.cookie || '';
  }
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/**
 * Set session HttpOnly cookie on response.
 */
export function setSessionCookie(res, token, durationDays = SESSION_DURATION_DAYS) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAgeMs = durationDays * 24 * 60 * 60 * 1000;
  
  // Set-Cookie header
  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (isProduction) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

/**
 * Clear session HttpOnly cookie on response.
 */
export function clearSessionCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (isProduction) {
    cookieFlags.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

/**
 * Server-side OTP verification with rate limiting and expiration.
 * Stored exclusively in PostgreSQL with SHA-256 hashing.
 */
export async function createAndSaveOtp(identifier, purpose = 'phone_verify', expiryMinutes = 5) {
  const cleanId = String(identifier).trim().toLowerCase();
  if (!cleanId) {
    throw new Error('Valid identifier is required to generate OTP.');
  }

  // Check persistent rate limit (max 5 requests per 10 minutes across all instances)
  const recentCountRes = await pool.query(`
    SELECT COUNT(*) FROM otp_verifications
    WHERE identifier = $1 AND created_at > NOW() - INTERVAL '10 minutes';
  `, [cleanId]);
  if (parseInt(recentCountRes.rows[0].count, 10) >= 5) {
    const rateLimitErr = new Error('Too many OTP requests. Please wait a few minutes before trying again.');
    rateLimitErr.code = 'RATE_LIMIT_EXCEEDED';
    rateLimitErr.status = 429;
    throw rateLimitErr;
  }

  // Cryptographically secure 6-digit numeric OTP (100000 - 999999)
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Invalidate any previous unverified OTP for this identifier & purpose
  await pool.query(`
    UPDATE otp_verifications SET verified_at = CURRENT_TIMESTAMP 
    WHERE identifier = $1 AND purpose = $2 AND verified_at IS NULL;
  `, [cleanId, purpose]);

  await pool.query(`
    INSERT INTO otp_verifications (identifier, otp_code_hash, purpose, expires_at, created_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP);
  `, [cleanId, codeHash, purpose, expiresAt]);

  return { code, expiresAt };
}

/**
 * Verify and single-use consume an OTP atomically in a transaction.
 * Prevents concurrent replay attacks.
 */
export async function verifyAndConsumeOtp(identifier, code, purpose = 'phone_verify') {
  const cleanId = String(identifier).trim().toLowerCase();
  const inputCode = String(code || '').trim();
  if (!inputCode) {
    return { valid: false, error: 'OTP code is required.' };
  }
  const inputHash = crypto.createHash('sha256').update(inputCode, 'utf8').digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the latest active OTP row FOR UPDATE to prevent race conditions & replay
    const res = await client.query(`
      SELECT id, otp_code_hash, attempts, max_attempts, expires_at, verified_at
      FROM otp_verifications
      WHERE identifier = $1 AND purpose = $2 AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;
    `, [cleanId, purpose]);

    if (res.rows.length === 0) {
      // Check if this OTP was already verified and consumed
      const usedCheck = await client.query(`
        SELECT id FROM otp_verifications WHERE identifier = $1 AND purpose = $2 AND verified_at IS NOT NULL LIMIT 1;
      `, [cleanId, purpose]);
      await client.query('ROLLBACK');
      if (usedCheck.rows.length > 0) {
        return { valid: false, reason: 'OTP_ALREADY_USED', error: 'This OTP has already been used and cannot be replayed.' };
      }
      return { valid: false, reason: 'NO_ACTIVE_OTP', error: 'No active OTP request found. Please request a new code.' };
    }

    const record = res.rows[0];

    // Expiration check
    if (new Date() > new Date(record.expires_at)) {
      await client.query('ROLLBACK');
      return { valid: false, reason: 'OTP_EXPIRED', error: 'OTP has expired. Please request a new code.' };
    }

    // Attempt limit check
    if (record.attempts >= record.max_attempts) {
      await client.query('ROLLBACK');
      return { valid: false, reason: 'ATTEMPTS_EXCEEDED', error: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    // Increment attempt counter
    await client.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1;', [record.id]);

    // Compare hashes with timing-safe comparison
    const hashBuffer = Buffer.from(record.otp_code_hash, 'hex');
    const inputBuffer = Buffer.from(inputHash, 'hex');
    const isMatch = hashBuffer.length === inputBuffer.length && crypto.timingSafeEqual(hashBuffer, inputBuffer);

    if (!isMatch) {
      const remaining = record.max_attempts - (record.attempts + 1);
      await client.query('COMMIT');
      return { valid: false, error: `Invalid OTP code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Code locked.'}` };
    }

    // Mark single-use verified atomically
    await client.query('UPDATE otp_verifications SET verified_at = CURRENT_TIMESTAMP WHERE id = $1;', [record.id]);
    await client.query('COMMIT');
    return { valid: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cryptographically verify Google ID Token with Google's public tokeninfo endpoint.
 * Enforces fail-closed security: validates signature, issuer, expiry, audience, and email verification.
 */
export async function verifyGoogleToken(idToken, expectedAudience = null) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required.');
  }

  const configuredAudience = expectedAudience || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || null;

  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || parsed.error_description) {
            return reject(new Error(parsed.error_description || parsed.error || 'Google token validation failed.'));
          }

          // Verify issuer
          if (parsed.iss !== 'accounts.google.com' && parsed.iss !== 'https://accounts.google.com') {
            return reject(new Error('Invalid Google token issuer.'));
          }

          // Verify audience if configured
          if (configuredAudience && parsed.aud !== configuredAudience) {
            return reject(new Error(`Invalid Google token audience: expected ${configuredAudience}, received ${parsed.aud}`));
          }

          // Verify expiration
          if (parsed.exp && Date.now() >= parseInt(parsed.exp, 10) * 1000) {
            return reject(new Error('Google token has expired.'));
          }

          // Verify email_verified status
          const isEmailVerified = parsed.email_verified === 'true' || parsed.email_verified === true;
          if (!isEmailVerified) {
            return reject(new Error('Google email is not verified.'));
          }

          if (!parsed.email) {
            return reject(new Error('Google token does not contain a valid email address.'));
          }

          resolve({
            email: parsed.email.toLowerCase().trim(),
            name: parsed.name || parsed.email.split('@')[0],
            picture: parsed.picture || null,
            sub: parsed.sub,
            emailVerified: true
          });
        } catch (e) {
          reject(new Error('Failed to parse Google verification response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      // Fail closed: Never authenticate unverified tokens on network failure
      reject(new Error('Google OAuth network verification unreachable: ' + e.message));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Google verification request timed out.'));
    });
  });
}

