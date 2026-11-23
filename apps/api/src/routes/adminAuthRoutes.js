import express from 'express';
import {
  isKnownDefaultPassword,
  hashAdminPassword,
  verifyAdminPassword,
  dummyHashCheck,
  parseCookies,
  getClientIp,
  logAdminAudit,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginRateLimit,
  createAdminSession,
  verifyAdminSession,
  deleteAdminSession,
  generateCsrfToken,
  verifyCsrfToken
} from '../utils/adminSecurity.js';
import { pool } from '../config/db.js';

const router = express.Router();

// Enforce required security headers on ALL admin responses
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Middleware to verify CSRF token on state-changing requests
function requireCsrf(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken || req.query?.csrfToken;
  if (!verifyCsrfToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token'
    });
  }
  next();
}

/**
 * GET /admin/auth/csrf
 * Issue a cryptographically fresh CSRF token
 */
router.get('/csrf', (req, res) => {
  const csrfToken = generateCsrfToken();
  res.json({ success: true, csrfToken });
});

/**
 * GET /admin/auth/session
 * Return current admin session details and refresh idle timeout
 */
router.get('/session', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.admin_session;
  const csrfToken = generateCsrfToken();

  if (!sessionId) {
    return res.json({
      authenticated: false,
      user: null,
      csrfToken
    });
  }

  const verification = await verifyAdminSession(sessionId);
  if (!verification.valid) {
    res.clearCookie('admin_session', {
      path: '/admin',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    return res.json({
      authenticated: false,
      reason: verification.reason,
      user: null,
      csrfToken
    });
  }

  // Check if development admin default password notice is applicable
  const isDev = process.env.NODE_ENV !== 'production';
  let isDefaultPassword = false;
  if (isDev && verification.user.username === 'admin') {
    const seedPwd = process.env.ADMIN_SEED_PASSWORD;
    if (seedPwd && isKnownDefaultPassword(seedPwd)) {
      isDefaultPassword = true;
    }
  }

  res.json({
    authenticated: true,
    user: {
      ...verification.user,
      is_default_password: isDefaultPassword
    },
    csrfToken
  });
});

/**
 * POST /admin/auth/login
 * Standardized admin credential authentication with rate limiting & constant-time check
 */
router.post('/login', requireCsrf, async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const { username, password } = req.body || {};

  const normUser = String(username || '').trim().toLowerCase();

  // Validate non-empty inputs
  if (!normUser || !password || typeof password !== 'string') {
    await dummyHashCheck('dummy');
    await logAdminAudit({
      action: 'login',
      result: 'failure',
      ip,
      userAgent,
      details: { username: normUser, reason: 'missing_credentials' }
    });
    return res.status(401).json({
      success: false,
      error: 'Incorrect username or password.'
    });
  }

  // 1. Check Rate Limiting: 5 attempts per 15 minutes per username and IP
  const rateLimitStatus = await checkLoginRateLimit(normUser, ip);
  if (rateLimitStatus.isLocked) {
    res.setHeader('Retry-After', String(rateLimitStatus.retryAfterSeconds));
    await logAdminAudit({
      action: 'login',
      result: 'lockout',
      ip,
      userAgent,
      details: { username: normUser, reason: 'rate_limit_lockout' }
    });
    return res.status(429).json({
      success: false,
      error: 'Too many attempts. Try again in a few minutes.'
    });
  }

  // 2. Query user from database
  let user = null;
  try {
    const queryRes = await pool.query(
      'SELECT id, username, email, password_hash, role, is_active, must_change_password FROM admin_users WHERE username = $1',
      [normUser]
    );
    if (queryRes.rows.length > 0) {
      user = queryRes.rows[0];
    }
  } catch (err) {
    console.error('Database query error in admin login:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }

  // 3. Constant-time password comparison and dummy hash check
  let isPasswordValid = false;
  if (user && user.is_active) {
    isPasswordValid = await verifyAdminPassword(password, user.password_hash);
  } else {
    // Dummy hash computation to equalize response time for unknown or inactive usernames
    await dummyHashCheck(password);
    isPasswordValid = false;
  }

  // 4. Handle failed credentials
  if (!isPasswordValid) {
    const { newlyLocked, retryAfterSeconds } = await recordFailedLogin(normUser, ip);

    if (newlyLocked) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      await logAdminAudit({
        adminUserId: user?.id || null,
        action: 'login',
        result: 'lockout',
        ip,
        userAgent,
        details: { username: normUser }
      });
      return res.status(429).json({
        success: false,
        error: 'Too many attempts. Try again in a few minutes.'
      });
    }

    await logAdminAudit({
      adminUserId: user?.id || null,
      action: 'login',
      result: 'failure',
      ip,
      userAgent,
      details: { username: normUser }
    });

    return res.status(401).json({
      success: false,
      error: 'Incorrect username or password.'
    });
  }

  // 5. Successful Login
  await clearLoginRateLimit(normUser, ip);

  // Update last_login_at
  await pool.query(
    'UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [user.id]
  );

  // Create server-side session
  const { sessionId } = await createAdminSession({
    adminUserId: user.id,
    ip,
    userAgent
  });

  // Set httpOnly cookie: Path=/admin, SameSite=Strict, Secure in production, 12h maxAge
  res.cookie('admin_session', sessionId, {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });

  // Write audit log
  await logAdminAudit({
    adminUserId: user.id,
    action: 'login',
    targetType: 'admin_user',
    targetId: user.id,
    result: 'success',
    ip,
    userAgent,
    details: { username: user.username, role: user.role }
  });

  const isDev = process.env.NODE_ENV !== 'production';
  const isDefaultPassword = isDev && isKnownDefaultPassword(password);

  return res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      is_default_password: isDefaultPassword
    }
  });
});

/**
 * POST /admin/auth/logout
 * Terminate server-side session and remove cookie
 */
router.post('/logout', requireCsrf, async (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.admin_session;

  if (sessionId) {
    const sessionRes = await verifyAdminSession(sessionId);
    if (sessionRes.valid) {
      await logAdminAudit({
        adminUserId: sessionRes.user.id,
        action: 'logout',
        targetType: 'admin_user',
        targetId: sessionRes.user.id,
        result: 'success',
        ip,
        userAgent,
        details: { username: sessionRes.user.username }
      });
    }
    await deleteAdminSession(sessionId);
  }

  res.clearCookie('admin_session', {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });

  return res.json({ success: true });
});

// Development/testing helper to reset rate limit lockout in test environments
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-reset-lock', async (req, res) => {
    const ip = req.body?.ip || getClientIp(req);
    const username = req.body?.username || '';
    await clearLoginRateLimit(username, ip);
    res.json({ success: true });
  });
}

export default router;
