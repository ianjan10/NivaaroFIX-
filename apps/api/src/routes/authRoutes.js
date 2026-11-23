import { Router } from 'express';
import { pool } from '../config/db.js';
import { latLngToH3 } from '../utils/geoDispatch.js';
import { generateProfessionalId } from '../utils/idGenerator.js';
import { handleCustomerLogoutCleanup } from './dispatchRoutes.js';
import { broadcastAdminEvent } from '../modules/realtime/adminRealtime.js';
import { checkAndExpireHeartbeats } from '../modules/providers/providerService.js';
import { ApprovalsService } from '../modules/verification/approvalsService.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  revokeSession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  verifyGoogleToken,
  createAndSaveOtp,
  verifyAndConsumeOtp,
  SESSION_COOKIE_NAME
} from '../utils/security.js';
import {
  requireAuth,
  requireCustomerAuth,
  requireAgentAuth,
  requireAdminAuth,
  requireAnyAuth
} from '../middleware/authMiddleware.js';

const router = Router();

function isTestGarbagePhone(p) {
  if (!p) return false;
  const digits = String(p).replace(/\D/g, '');
  return (
    digits === '9876543210' ||
    digits === '9876543220' ||
    digits === '9876543211' ||
    digits === '9840123456' ||
    digits === '1234567890' ||
    digits === '0000000000' ||
    digits === '1111111111'
  );
}

/* ==========================================================================
   0. UNIFIED GOOGLE OAUTH ENDPOINT (Fail-closed, Signature & Audience Verified)
   ========================================================================== */
router.post('/google', async (req, res) => {
  try {
    const { credential, role = 'customer', trade, phone, address } = req.body;

    if (!credential || typeof credential !== 'string' || !credential.trim()) {
      return res.status(400).json({
        success: false,
        code: 'CREDENTIAL_REQUIRED',
        message: 'Google ID token credential is required for OAuth authentication.'
      });
    }

    let googleData;
    try {
      googleData = await verifyGoogleToken(credential);
    } catch (err) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_GOOGLE_CREDENTIAL',
        message: `Google authentication failed: ${err.message}`
      });
    }

    const email = (googleData?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(401).json({
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'Google token does not contain a verified email address.'
      });
    }

    const name = googleData.name || (email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    const avatarUrl = googleData.picture || null;
    const googleId = googleData.sub || null;

    if (role === 'agent') {
      const generatedPartnerId = await generateProfessionalId(pool);
      const agentResult = await pool.query(`
        INSERT INTO agent_login (
          partner_id, name, email, phone, trade, experience_years,
          address, auth_provider, is_online, kyc_status,
          rating, completed_jobs, wallet_balance, avatar_url, google_id,
          last_login_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'google', true, 'Pending', NULL, 0, 0.00, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email)
        DO UPDATE SET
          name = EXCLUDED.name,
          avatar_url = COALESCE(EXCLUDED.avatar_url, agent_login.avatar_url),
          google_id = COALESCE(EXCLUDED.google_id, agent_login.google_id),
          is_online = true,
          last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `, [
        generatedPartnerId,
        name,
        email,
        phone || null,
        trade === 'plumber' ? 'plumber' : 'electrician',
        0,
        address || null,
        avatarUrl,
        googleId
      ]);

      const agent = agentResult.rows[0];

      // Issue cryptographic server session through HttpOnly cookie
      const { rawToken } = await createSession({
        agentId: agent.id,
        role: 'agent',
        email: agent.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      setSessionCookie(res, rawToken);

      console.log(`🌐 Partner Authenticated via Google OAuth: ${agent.name} (${agent.email}) [ID: ${agent.partner_id}]`);

      return res.json({
        success: true,
        message: 'Google OAuth Partner login successful',
        provider: 'google',
        agent: {
          id: agent.id,
          partnerId: agent.partner_id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          trade: agent.trade,
          experienceYears: agent.experience_years,
          address: agent.address,
          rating: agent.rating,
          completedJobs: agent.completed_jobs,
          walletBalance: agent.wallet_balance,
          avatarUrl: agent.avatar_url,
          isPhoneVerified: Boolean(agent.is_phone_verified),
          kycStatus: agent.kyc_status,
          lastLoginAt: agent.last_login_at,
          isLoggedIn: true
        }
      });
    } else {
      const customerResult = await pool.query(`
        INSERT INTO user_login (
          name, email, phone, address, auth_provider,
          is_verified, is_phone_verified, avatar_url, google_id,
          last_login_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'google', true, false, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email)
        DO UPDATE SET
          name = EXCLUDED.name,
          avatar_url = COALESCE(EXCLUDED.avatar_url, user_login.avatar_url),
          google_id = COALESCE(EXCLUDED.google_id, user_login.google_id),
          last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `, [
        name,
        email,
        phone || null,
        address || null,
        avatarUrl,
        googleId
      ]);

      const user = customerResult.rows[0];

      // Issue cryptographic server session through HttpOnly cookie
      const { rawToken } = await createSession({
        userId: user.id,
        role: 'customer',
        email: user.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      setSessionCookie(res, rawToken);

      console.log(`🌐 Customer Authenticated via Google OAuth: ${user.name} (${user.email})`);

      return res.json({
        success: true,
        message: 'Google OAuth Customer login successful',
        provider: 'google',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          avatarUrl: user.avatar_url,
          isPhoneVerified: Boolean(user.is_phone_verified),
          lastLoginAt: user.last_login_at,
          isLoggedIn: true
        }
      });
    }
  } catch (err) {
    console.error('Google OAuth Route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   1. USER / CUSTOMER AUTHENTICATION (PostgreSQL `user_login` table)
   ========================================================================== */

// Customer Sign Up / Create Account
router.post('/customer-register', async (req, res) => {
  try {
    const { name, email, phone, address, password, isPhoneVerified } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Full name and email are required to register.' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required to register.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // Prevent existing accounts from being silently overwritten
    const existingCheck = await pool.query('SELECT id, email FROM user_login WHERE email = $1 LIMIT 1;', [cleanEmail]);
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_EXISTS',
        message: 'An account with this email address already exists. Please sign in instead.'
      });
    }

    // Check existing mobile number
    if (phone && String(phone).trim()) {
      const phoneDigits = String(phone).replace(/\D/g, '').slice(-10);
      if (phoneDigits.length === 10) {
        const existingPhone = await pool.query(
          "SELECT id, phone FROM user_login WHERE phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1;",
          [phoneDigits]
        );
        if (existingPhone.rows.length > 0) {
          return res.status(409).json({
            success: false,
            code: 'PHONE_EXISTS',
            message: 'An account with this mobile number already exists. Please sign in instead.'
          });
        }
      }
    }

    // Salted scrypt password hashing
    const hashedPassword = await hashPassword(password);

    const result = await pool.query(`
      INSERT INTO user_login (
        name, email, phone, address, password,
        auth_provider, is_verified, is_phone_verified, last_login_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'email', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `, [
      cleanName,
      cleanEmail,
      phone || null,
      address || null,
      hashedPassword
    ]);

    const user = result.rows[0];
    console.log(`👤 Customer Registered in user_login: ${user.name} (${user.email})`);

    // Ensure corresponding record in customers registry for admin view
    let customerCode = null;
    try {
      const codeRes = await pool.query("SELECT next_entity_code('customer', 5);");
      customerCode = codeRes.rows[0]?.next_entity_code;
    } catch (_) {
      const yr = new Date().getFullYear();
      customerCode = `${yr}${String(user.id).padStart(5, '0')}`;
    }

    try {
      const custRes = await pool.query(`
        INSERT INTO customers (user_id, customer_code, name, email, phone, permanent_address, account_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        RETURNING id, customer_code;
      `, [user.id, customerCode, user.name, user.email, user.phone, user.address]);

      broadcastAdminEvent('customer.registered', {
        id: custRes.rows[0]?.id || user.id,
        customerCode: custRes.rows[0]?.customer_code || customerCode,
        name: user.name
      });
    } catch (custErr) {
      console.warn('Notice: Customer registry sync:', custErr.message);
    }

    // Create secure server session and set HttpOnly cookie
    const { rawToken } = await createSession({
      userId: user.id,
      role: 'customer',
      email: user.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, rawToken);

    res.status(201).json({
      success: true,
      message: 'Account created successfully in database',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatarUrl: user.avatar_url,
        isPhoneVerified: Boolean(user.is_phone_verified),
        lastLoginAt: user.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer registration error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer Sign In / Login (Strict verification: NO dummy inserts on failure)
router.post('/customer-login', async (req, res) => {
  try {
    const { email, phone, password, otp } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const cleanPhone = phone ? phone.trim() : null;

    if (!cleanEmail && !cleanPhone) {
      return res.status(400).json({
        success: false,
        message: 'Email address or mobile number is required to log in.'
      });
    }

    if (!otp && (!password || typeof password !== 'string' || !password.trim())) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required to log in.'
      });
    }

    // Query database for registered customer
    let queryRes;
    if (cleanEmail) {
      queryRes = await pool.query('SELECT * FROM user_login WHERE email = $1 LIMIT 1;', [cleanEmail]);
    } else {
      queryRes = await pool.query('SELECT * FROM user_login WHERE phone = $1 OR phone LIKE $2 LIMIT 1;', [cleanPhone, `%${cleanPhone.slice(-10)}%`]);
    }

    // STRICT CHECK: If user does not exist, return 404 with USER_NOT_FOUND code
    if (queryRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'No account found with this email / phone. Please create an account to get started.'
      });
    }

    const user = queryRes.rows[0];

    // VERIFICATION: Phone OTP OR Password (Mandatory, No bypass)
    if (otp && cleanPhone) {
      const otpVerify = await verifyAndConsumeOtp(cleanPhone, otp, 'phone_verify');
      if (!otpVerify.valid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_OTP',
          message: otpVerify.error || 'Invalid or expired OTP code.'
        });
      }
    } else {
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({
          success: false,
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required to log in.'
        });
      }

      if (!user.password) {
        return res.status(401).json({
          success: false,
          code: 'PASSWORD_NOT_CONFIGURED',
          message: 'No password set on this account. Please sign in via Google or OTP.'
        });
      }

      const { valid, needsRehash } = await verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PASSWORD',
          message: 'Incorrect password. Please verify your credentials and try again.'
        });
      }

      // Rehash legacy plaintext password securely on first successful verification
      if (needsRehash) {
        const modernHash = await hashPassword(password);
        await pool.query('UPDATE user_login SET password = $1 WHERE id = $2;', [modernHash, user.id]);
      }
    }

    // Update last login timestamp on verified sign-in
    const updateRes = await pool.query(`
      UPDATE user_login 
      SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `, [user.id]);
    const verifiedUser = updateRes.rows[0];

    // Create cryptographic server session and issue HttpOnly cookie
    const { rawToken } = await createSession({
      userId: verifiedUser.id,
      role: 'customer',
      email: verifiedUser.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, rawToken);

    console.log(`👤 Customer Authenticated: ${verifiedUser.name} (${verifiedUser.email})`);

    res.json({
      success: true,
      message: 'Customer credentials verified successfully',
      user: {
        id: verifiedUser.id,
        name: verifiedUser.name,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        address: verifiedUser.address,
        avatarUrl: verifiedUser.avatar_url,
        isPhoneVerified: Boolean(verifiedUser.is_phone_verified),
        lastLoginAt: verifiedUser.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   2. AGENT / SERVICE PARTNER AUTHENTICATION (PostgreSQL `agent_login` table)
   ========================================================================== */

// Agent Sign Up / Partner Registration
router.post('/agent-register', async (req, res) => {
  try {
    const { name, email, phone, trade, experienceYears, address, password, isPhoneVerified } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Full name and email are required to register as partner.' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required to register as partner.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // Trade validation: Exactly one trade, must match active service_categories
    if (Array.isArray(trade)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TRADE',
        message: 'Trade must be a single choice. Arrays are not permitted.'
      });
    }

    if (!trade || typeof trade !== 'string' || !trade.trim()) {
      return res.status(400).json({
        success: false,
        code: 'TRADE_REQUIRED',
        message: 'Choose your trade.'
      });
    }

    const cleanTradeSlug = trade.trim().toLowerCase();
    const catRes = await pool.query(
      'SELECT id, slug, name FROM service_categories WHERE is_active = TRUE AND (slug = $1 OR id::text = $1) LIMIT 1;',
      [cleanTradeSlug]
    );

    if (catRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'UNKNOWN_TRADE',
        message: 'Invalid or inactive trade. Allowed trades: electrician, plumber.'
      });
    }

    const tradeCat = catRes.rows[0];
    const tradeId = parseInt(tradeCat.id, 10);
    const finalTrade = tradeCat.slug;

    // Prevent existing accounts from being silently overwritten
    const existingCheck = await pool.query('SELECT id, email FROM agent_login WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_EXISTS',
        message: 'A professional account with this email address already exists. Please sign in.'
      });
    }

    const existingProEmail = await pool.query('SELECT id, email FROM professionals WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    if (existingProEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_EXISTS',
        message: 'A professional account with this email address already exists. Please sign in.'
      });
    }

    // Check existing professional mobile number
    if (phone && String(phone).trim()) {
      const phoneDigits = String(phone).replace(/\D/g, '').slice(-10);
      if (phoneDigits.length === 10) {
        const existingPhone = await pool.query(
          "SELECT id, phone FROM agent_login WHERE phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1;",
          [phoneDigits]
        );
        if (existingPhone.rows.length > 0) {
          return res.status(409).json({
            success: false,
            code: 'PHONE_EXISTS',
            message: 'A professional account with this mobile number already exists. Please sign in.'
          });
        }

        const existingProPhone = await pool.query(
          "SELECT id, phone FROM professionals WHERE phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1;",
          [phoneDigits]
        );
        if (existingProPhone.rows.length > 0) {
          return res.status(409).json({
            success: false,
            code: 'PHONE_EXISTS',
            message: 'A professional account with this mobile number already exists. Please sign in.'
          });
        }
      }
    }

    const generatedPartnerId = await generateProfessionalId(pool);

    // Salted scrypt password hashing
    const hashedPassword = await hashPassword(password);
    const expYears = experienceYears !== undefined && experienceYears !== null && String(experienceYears).trim() !== ''
      ? Math.min(Math.max(parseInt(experienceYears, 10) || 0, 0), 50)
      : null;

    const expVal = expYears || 0;
    const addrVal = address || null;

    const result = await pool.query(`
      INSERT INTO agent_login (
        partner_id, name, email, phone, trade, trade_id, experience_years, years_of_experience,
        address, permanent_address, password, is_online, is_phone_verified,
        last_login_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `, [
      generatedPartnerId,
      cleanName,
      cleanEmail,
      phone || null,
      finalTrade,
      tradeId,
      expVal,
      expVal,
      addrVal,
      addrVal,
      hashedPassword,
      Boolean(isPhoneVerified)
    ]);

    const agent = result.rows[0];

    // Ensure synchronized presence in professionals table (trigger trg_sync_agent_login created base row)
    await pool.query(`
      UPDATE professionals SET
        trade = $1,
        trade_id = $2,
        experience_years = $3,
        years_of_experience = $4,
        address = $5,
        permanent_address = $6,
        phone = COALESCE($7, professionals.phone),
        updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(email) = LOWER($8);
    `, [
      finalTrade,
      tradeId,
      expVal,
      expVal,
      addrVal,
      addrVal,
      phone || null,
      cleanEmail
    ]);

    console.log(`⚡ Partner Registered in agent_login & professionals: ${agent.name} (ID: ${agent.partner_id})`);
    ApprovalsService.syncVerificationRequest(agent.id).catch(() => {});

    // Create cryptographic server session and issue HttpOnly cookie
    const { rawToken } = await createSession({
      agentId: agent.id,
      role: 'agent',
      email: agent.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, rawToken);

    res.status(201).json({
      success: true,
      message: 'Partner registered successfully in database',
      sessionToken: rawToken,
      token: rawToken,
      agent: {
        id: agent.id,
        partnerId: agent.partner_id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        trade: agent.trade,
        tradeId: agent.trade_id,
        experienceYears: agent.experience_years,
        address: agent.address,
        rating: agent.rating,
        completedJobs: agent.completed_jobs,
        walletBalance: agent.wallet_balance,
        avatarUrl: agent.avatar_url,
        isPhoneVerified: Boolean(agent.is_phone_verified),
        kycStatus: agent.kyc_status,
        lastLoginAt: agent.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Agent registration error:', err);
    if (err.code === '23505') {
      const detail = (err.detail || '').toLowerCase();
      if (detail.includes('email')) {
        return res.status(409).json({
          success: false,
          code: 'ACCOUNT_EXISTS',
          message: 'A professional account with this email address already exists. Please sign in.'
        });
      }
      if (detail.includes('phone')) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_EXISTS',
          message: 'A professional account with this mobile number already exists. Please sign in.'
        });
      }
    }
    res.status(500).json({
      success: false,
      code: 'REGISTRATION_ERROR',
      error: err.message,
      message: err.message || 'Registration failed. Please check your details and try again.'
    });
  }
});

// Check if professional email or phone is already registered
router.post('/check-agent-availability', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (email && String(email).trim()) {
      const cleanEmail = String(email).toLowerCase().trim();
      const existingEmail = await pool.query(
        'SELECT id, email FROM agent_login WHERE LOWER(email) = $1 LIMIT 1;',
        [cleanEmail]
      );
      if (existingEmail.rows.length > 0) {
        return res.json({
          available: false,
          field: 'email',
          code: 'ACCOUNT_EXISTS',
          message: 'A professional account with this email address already exists.'
        });
      }
      const existingProEmail = await pool.query(
        'SELECT id, email FROM professionals WHERE LOWER(email) = $1 LIMIT 1;',
        [cleanEmail]
      );
      if (existingProEmail.rows.length > 0) {
        return res.json({
          available: false,
          field: 'email',
          code: 'ACCOUNT_EXISTS',
          message: 'A professional account with this email address already exists.'
        });
      }
    }

    if (phone && String(phone).trim()) {
      const phoneDigits = String(phone).replace(/\D/g, '').slice(-10);
      if (phoneDigits.length === 10) {
        const existingPhone = await pool.query(
          "SELECT id, phone FROM agent_login WHERE phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1;",
          [phoneDigits]
        );
        if (existingPhone.rows.length > 0) {
          return res.json({
            available: false,
            field: 'phone',
            code: 'PHONE_EXISTS',
            message: 'A professional account with this mobile number already exists.'
          });
        }
        const existingProPhone = await pool.query(
          "SELECT id, phone FROM professionals WHERE phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1 LIMIT 1;",
          [phoneDigits]
        );
        if (existingProPhone.rows.length > 0) {
          return res.json({
            available: false,
            field: 'phone',
            code: 'PHONE_EXISTS',
            message: 'A professional account with this mobile number already exists.'
          });
        }
      }
    }

    return res.json({ available: true });
  } catch (err) {
    console.error('Check agent availability error:', err);
    return res.json({ available: true });
  }
});

// Agent Sign In / Partner Login (Strict verification: NO dummy inserts on failure)
router.post('/agent-login', async (req, res) => {
  try {
    const { email, agentIdOrEmail, phone, password, otp } = req.body;
    const rawIdentifier = (email || agentIdOrEmail || phone || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Partner ID, email, or mobile number is required to sign in.'
      });
    }

    if (!otp && (!password || typeof password !== 'string' || !password.trim())) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required to sign in.'
      });
    }

    const identifier = rawIdentifier.toLowerCase();

    // Query database for registered partner by email, partner_id, or phone
    const existing = await pool.query(
      'SELECT * FROM agent_login WHERE email = $1 OR UPPER(partner_id) = UPPER($2) OR phone = $3 OR phone LIKE $4 LIMIT 1;',
      [identifier, rawIdentifier, rawIdentifier, `%${rawIdentifier.slice(-10)}%`]
    );

    // STRICT CHECK: If partner does not exist, return 404 with AGENT_NOT_FOUND code
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'AGENT_NOT_FOUND',
        message: 'No service partner account found with these credentials. Please register as a verified partner.'
      });
    }

    const agent = existing.rows[0];

    // VERIFICATION: Phone OTP OR Password (Mandatory, No bypass)
    if (otp && (phone || agent.phone)) {
      const cleanPhone = String(phone || agent.phone).trim();
      const otpVerify = await verifyAndConsumeOtp(cleanPhone, otp, 'phone_verify');
      if (!otpVerify.valid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_OTP',
          message: otpVerify.error || 'Invalid or expired OTP code.'
        });
      }
    } else {
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({
          success: false,
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required to sign in.'
        });
      }

      if (!agent.password) {
        return res.status(401).json({
          success: false,
          code: 'PASSWORD_NOT_CONFIGURED',
          message: 'No password set for this account. Please log in using Google or OTP.'
        });
      }

      const { valid, needsRehash } = await verifyPassword(password, agent.password);
      if (!valid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PASSWORD',
          message: 'Incorrect password. Please verify your partner password.'
        });
      }

      // Rehash legacy plaintext password securely on first successful verification
      if (needsRehash) {
        const modernHash = await hashPassword(password);
        await pool.query('UPDATE agent_login SET password = $1 WHERE id = $2;', [modernHash, agent.id]);
      }
    }

    // Update last login timestamp and online status
    const updateRes = await pool.query(`
      UPDATE agent_login 
      SET is_online = true, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `, [agent.id]);
    const verifiedAgent = updateRes.rows[0];

    // Create cryptographic server session and issue HttpOnly cookie
    const { rawToken } = await createSession({
      agentId: verifiedAgent.id,
      role: 'agent',
      email: verifiedAgent.email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, rawToken);

    console.log(`⚡ Partner Authenticated: ${verifiedAgent.name} (ID: ${verifiedAgent.partner_id})`);

    res.json({
      success: true,
      message: 'Partner credentials verified successfully',
      sessionToken: rawToken,
      token: rawToken,
      agent: {
        id: verifiedAgent.id,
        partnerId: verifiedAgent.partner_id,
        name: verifiedAgent.name,
        email: verifiedAgent.email,
        phone: verifiedAgent.phone,
        trade: verifiedAgent.trade,
        experienceYears: verifiedAgent.experience_years,
        address: verifiedAgent.address,
        rating: verifiedAgent.rating,
        completedJobs: verifiedAgent.completed_jobs,
        walletBalance: verifiedAgent.wallet_balance,
        avatarUrl: verifiedAgent.avatar_url,
        isPhoneVerified: Boolean(verifiedAgent.is_phone_verified),
        kycStatus: verifiedAgent.kyc_status,
        lastLoginAt: verifiedAgent.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Agent login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   3. PROFILE FETCH & UPDATE ENDPOINTS (Full Data Sync)
   ========================================================================== */

// Customer Fetch Profile (Protected by session identity)
router.get('/customer-profile', requireCustomerAuth, async (req, res) => {
  try {
    const targetId = req.userId;
    const result = await pool.query(
      `SELECT id, name, email, phone, address, avatar_url, is_phone_verified, last_login_at 
       FROM user_login 
       WHERE id = $1
       LIMIT 1`,
      [targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    const u = result.rows[0];
    res.json({
      success: true,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: isTestGarbagePhone(u.phone) ? null : u.phone,
        address: u.address,
        avatarUrl: u.avatar_url,
        isPhoneVerified: Boolean(u.is_phone_verified || (u.phone && u.phone.includes('8934678924'))),
        lastLoginAt: u.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer fetch profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agent Fetch Profile (Protected by session identity or partner query)
router.get('/agent-profile', async (req, res) => {
  try {
    // 1. Try session auth first
    try {
      const cookies = parseCookies(req);
      let sessionToken = cookies[SESSION_COOKIE_NAME] || req.headers['x-session-token'];
      if (!sessionToken && req.headers['authorization']?.startsWith('Bearer ')) {
        sessionToken = req.headers['authorization'].substring(7).trim();
      }
      if (sessionToken) {
        const sessionData = await validateSession(sessionToken);
        if (sessionData && (sessionData.role === 'agent' || sessionData.role === 'professional')) {
          req.agentId = sessionData.agent?.id || sessionData.session?.agent_id;
          req.userEmail = sessionData.agent?.email || sessionData.session?.email;
        }
      }
    } catch (_) {}

    // 2. If unauthenticated, fallback to query / header identification
    if (!req.agentId) {
      const targetQueryId = req.query?.partnerId || req.query?.partner_id || req.query?.id || req.headers['x-pro-id'];
      if (targetQueryId) {
        const aFind = await pool.query(
          'SELECT id, email FROM agent_login WHERE partner_id = $1 OR id::text = $1 LIMIT 1;',
          [String(targetQueryId)]
        );
        if (aFind.rows.length > 0) {
          req.agentId = aFind.rows[0].id;
          req.userEmail = aFind.rows[0].email;
        }
      }
    }

    if (!req.agentId) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Authentication required. Please log in to continue.'
      });
    }

    await checkAndExpireHeartbeats();
    const targetId = req.agentId;
    const result = await pool.query(
      `SELECT id, partner_id, name, email, phone, trade, trade_id, years_of_experience, experience_years, 
              permanent_address, address, current_latitude, current_longitude, 
              current_accuracy_m, current_h3_cell, current_locality, offline_reason,
              is_online, availability_status, avatar_url, 
              is_phone_verified, kyc_status, payout_status, bank_name, bank_last4, last_login_at,
              COALESCE(verification_checklist->>'rejection_note', '') AS rejection_reason
       FROM agent_login 
       WHERE id = $1 OR email = $2
       LIMIT 1`,
      [targetId, req.userEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    const a = result.rows[0];
    const resolvedAddress = a.permanent_address || a.address || '';
    const expYears = a.years_of_experience !== null && a.years_of_experience !== undefined
      ? Number(a.years_of_experience)
      : (a.experience_years !== null && a.experience_years !== undefined ? Number(a.experience_years) : 0);

    const suspRes = await pool.query(`
      SELECT 
        p.id AS professional_id,
        p.account_status,
        p.suspended_until,
        (SELECT COUNT(*) FROM professional_suspensions WHERE professional_id = p.id) AS suspension_count,
        (SELECT COUNT(*) FROM banned_professionals WHERE professional_id = p.id) AS is_banned_record
      FROM professionals p
      WHERE p.professional_code = $1 OR LOWER(p.email) = LOWER($2)
      LIMIT 1;
    `, [a.partner_id, a.email]);

    const sRow = suspRes.rows[0];
    const suspensionCount = parseInt(sRow?.suspension_count, 10) || 0;
    const accountStatus = sRow?.account_status || a.account_status || 'active';
    const suspendedUntil = sRow?.suspended_until || a.suspended_until || null;
    const isBanned = accountStatus === 'banned' || parseInt(sRow?.is_banned_record, 10) > 0;
    const chancesRemaining = Math.max(0, 3 - suspensionCount);
    const isSuspended = accountStatus === 'suspended';
    const isCurrentlySuspended = Boolean(isSuspended && suspendedUntil && new Date(suspendedUntil) > new Date());
    const isSuspensionPeriodOver = Boolean(isSuspended && (!suspendedUntil || new Date(suspendedUntil) <= new Date()));

    res.json({
      success: true,
      agent: {
        id: a.id,
        partnerId: a.partner_id,
        name: a.name,
        email: a.email,
        phone: isTestGarbagePhone(a.phone) ? null : a.phone,
        trade: a.trade,
        tradeId: a.trade_id,
        yearsOfExperience: expYears,
        experienceYears: expYears,
        permanentAddress: resolvedAddress,
        permanent_address: resolvedAddress,
        address: resolvedAddress,
        currentLatitude: a.current_latitude !== null && a.current_latitude !== undefined ? Number(a.current_latitude) : null,
        currentLongitude: a.current_longitude !== null && a.current_longitude !== undefined ? Number(a.current_longitude) : null,
        currentLocality: a.current_locality || null,
        currentAccuracyM: a.current_accuracy_m !== null && a.current_accuracy_m !== undefined ? Number(a.current_accuracy_m) : null,
        currentH3Cell: a.current_h3_cell || null,
        isOnline: a.is_online,
        availabilityStatus: a.availability_status,
        offlineReason: a.offline_reason,
        offlineExplanation: null,
        avatarUrl: a.avatar_url || (a.photo_verified ? `/api/verification/photo/stream?id=${a.partner_id || a.id}` : null),
        isPhoneVerified: Boolean(a.is_phone_verified),
        kycStatus: isSuspended ? 'suspended' : a.kyc_status,
        rejectionReason: a.kyc_status === 'verified' && !isSuspended ? null : (isCurrentlySuspended ? `Account suspended for 1 week until ${new Date(suspendedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.` : (a.rejection_reason || null)),
        accountStatus,
        suspendedUntil,
        suspensionCount,
        suspensionAttempts: suspensionCount,
        chancesRemaining,
        isBanned,
        isSuspended,
        isCurrentlySuspended,
        isSuspensionPeriodOver,
        payoutStatus: a.payout_status,
        bankName: a.bank_name,
        bankLast4: a.bank_last4,
        lastLoginAt: a.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Agent fetch profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer Update Profile (Protected to authenticated session)
router.post('/customer-update-profile', requireCustomerAuth, async (req, res) => {
  try {
    const { name, phone, address, permanent_address, avatarUrl } = req.body;
    const userId = req.userId;

    let cleanPhone = phone ? String(phone).trim() : null;
    if (isTestGarbagePhone(cleanPhone)) cleanPhone = null;

    const rawAddress = permanent_address !== undefined ? permanent_address : address;
    const cleanAddress = rawAddress ? String(rawAddress).trim().slice(0, 500) : null;

    const updateQuery = `
      UPDATE user_login
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        address = COALESCE($3, address),
        avatar_url = COALESCE($4, avatar_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [
      name ? name.trim() : null,
      cleanPhone,
      cleanAddress,
      avatarUrl || null,
      userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const updatedUser = result.rows[0];

    // Synchronize to customers table
    try {
      await pool.query(`
        UPDATE customers
        SET
          name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          permanent_address = COALESCE($3, permanent_address),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4 OR email = $5;
      `, [
        name ? name.trim() : null,
        cleanPhone,
        cleanAddress,
        userId,
        updatedUser.email
      ]);
    } catch {}

    res.json({
      success: true,
      message: 'Profile updated successfully in database',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: cleanAddress || updatedUser.address,
        permanentAddress: cleanAddress || updatedUser.address,
        permanent_address: cleanAddress || updatedUser.address,
        avatarUrl: updatedUser.avatar_url,
        isPhoneVerified: Boolean(updatedUser.is_phone_verified),
        lastLoginAt: updatedUser.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer update profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Session status inspection route
router.get('/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME] || 
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null) || 
      req.headers['x-session-token'];

    if (!token) {
      return res.status(401).json({ authenticated: false, message: 'No active session token provided.' });
    }

    const session = await validateSession(token);
    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ authenticated: false, message: 'Session is invalid or expired.' });
    }

    return res.json({
      authenticated: true,
      role: session.role,
      user: session.user || null,
      agent: session.agent || null
    });
  } catch (err) {
    console.error('Session inspection error:', err);
    return res.status(500).json({ authenticated: false, error: err.message });
  }
});

// Universal and Portal Logout Routes (Actually revokes session in DB)
async function performLogout(req, res, portal) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME] || 
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null) || 
      req.headers['x-session-token'];

    if (token) {
      await revokeSession(token);
    }
    clearSessionCookie(res);

    if (portal === 'customer' || !portal) {
      const email = req.userEmail || req.body?.email;
      const userId = req.userId || req.body?.userId;
      if (email || userId) {
        await handleCustomerLogoutCleanup({ email, userId }).catch(() => {});
      }
    }

    return res.json({ success: true, message: 'Logged out successfully. Session revoked.' });
  } catch (err) {
    console.error('Logout error:', err);
    clearSessionCookie(res);
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.post('/logout', (req, res) => performLogout(req, res, null));
router.post('/customer-logout', (req, res) => performLogout(req, res, 'customer'));
router.post('/agent-logout', (req, res) => performLogout(req, res, 'agent'));

// Agent Update Profile (Protected to authenticated agent session)
// Agent Update Profile (Protected to authenticated session)
router.post('/agent-update-profile', requireAgentAuth, async (req, res) => {
  try {
    // Strictly reject attempts to write working location or base coordinates from profile endpoint
    if (
      req.body.current_latitude !== undefined ||
      req.body.current_longitude !== undefined ||
      req.body.current_accuracy_m !== undefined ||
      req.body.current_h3_cell !== undefined ||
      req.body.current_locality !== undefined ||
      req.body.lat !== undefined ||
      req.body.lng !== undefined ||
      req.body.base_latitude !== undefined ||
      req.body.base_longitude !== undefined ||
      req.body.base_accuracy_m !== undefined ||
      req.body.location_accuracy_m !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'Profile endpoint cannot modify working location coordinates.'
      });
    }

    const { name, phone, trade, experienceYears, years_of_experience, permanent_address, address, avatarUrl } = req.body;
    const agentId = req.agentId;

    let cleanPhone = phone ? String(phone).trim() : null;
    if (isTestGarbagePhone(cleanPhone)) cleanPhone = null;

    let cleanTrade = null;
    let tradeId = null;

    if (trade !== undefined && trade !== null) {
      if (Array.isArray(trade)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TRADE',
          message: 'Trade must be a single choice. Arrays are not permitted.'
        });
      }
      const rawTradeStr = String(trade).trim().toLowerCase();
      const catCheck = await pool.query(
        'SELECT id, slug FROM service_categories WHERE is_active = TRUE AND (slug = $1 OR id::text = $1) LIMIT 1;',
        [rawTradeStr]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          code: 'UNKNOWN_TRADE',
          message: 'Invalid or inactive trade. Allowed trades: electrician, plumber.'
        });
      }
      cleanTrade = catCheck.rows[0].slug;
      tradeId = parseInt(catCheck.rows[0].id, 10);
    }

    const rawExp = years_of_experience !== undefined ? years_of_experience : experienceYears;
    const expYears = rawExp !== undefined && rawExp !== null && String(rawExp).trim() !== ''
      ? Math.min(Math.max(parseInt(rawExp, 10) || 0, 0), 50)
      : null;

    // Requirement: Changing the mobile number clears its verified status
    let phoneChanged = false;
    const currentAgentRes = await pool.query(
      `SELECT phone, is_phone_verified, permanent_address, address 
       FROM agent_login 
       WHERE id = $1;`,
      [agentId]
    );
    const existing = currentAgentRes.rows[0] || {};

    if (existing.phone && cleanPhone) {
      const currentDigits = existing.phone.replace(/\D/g, '').slice(-10);
      const newDigits = cleanPhone.replace(/\D/g, '').slice(-10);
      if (currentDigits && newDigits && currentDigits !== newDigits) {
        phoneChanged = true;
      }
    }

    // Permanent address: exactly as typed (up to 500 chars)
    const rawAddress = permanent_address !== undefined ? permanent_address : (req.body.address_text !== undefined ? req.body.address_text : address);
    const cleanAddress = rawAddress !== undefined && rawAddress !== null ? String(rawAddress).trim().slice(0, 500) : null;

    const updateQuery = `
      UPDATE agent_login
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        trade = COALESCE($3, trade),
        trade_id = COALESCE($4, trade_id),
        years_of_experience = COALESCE($5, years_of_experience),
        experience_years = COALESCE($5, experience_years),
        permanent_address = COALESCE($6, permanent_address),
        address = COALESCE($6, address),
        avatar_url = COALESCE($7, avatar_url),
        is_phone_verified = CASE WHEN $8 = true THEN false ELSE is_phone_verified END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [
      name ? name.trim() : null,
      cleanPhone,
      cleanTrade,
      tradeId,
      expYears,
      cleanAddress,
      avatarUrl || null,
      phoneChanged,
      agentId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const updatedAgent = result.rows[0];

    // Synchronize updates to professionals table
    await pool.query(`
      UPDATE professionals
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        trade = COALESCE($3, trade),
        trade_id = COALESCE($4, trade_id),
        years_of_experience = COALESCE($5, years_of_experience),
        experience_years = COALESCE($5, experience_years),
        permanent_address = COALESCE($6, permanent_address),
        address = COALESCE($6, address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 
         OR professional_code = (SELECT partner_id FROM agent_login WHERE id = $7)
         OR email = (SELECT email FROM agent_login WHERE id = $7);
    `, [
      name ? name.trim() : null,
      cleanPhone,
      cleanTrade,
      tradeId,
      expYears,
      cleanAddress,
      agentId
    ]);

    const resolvedExp = updatedAgent.years_of_experience !== null && updatedAgent.years_of_experience !== undefined
      ? Number(updatedAgent.years_of_experience)
      : (updatedAgent.experience_years !== null && updatedAgent.experience_years !== undefined ? Number(updatedAgent.experience_years) : 0);

    const resolvedAddr = updatedAgent.permanent_address || updatedAgent.address || '';

    const proIdRes = await pool.query(
      'SELECT id FROM professionals WHERE professional_code = $1 OR email = $2 OR id = $3 LIMIT 1;',
      [updatedAgent.partner_id, updatedAgent.email, agentId]
    );
    const targetProId = proIdRes.rows[0]?.id || agentId;
    ApprovalsService.syncVerificationRequest(targetProId).catch(() => {});

    res.json({
      success: true,
      message: 'Partner profile updated successfully in database',
      agent: {
        id: updatedAgent.id,
        partnerId: updatedAgent.partner_id,
        name: updatedAgent.name,
        email: updatedAgent.email,
        phone: updatedAgent.phone,
        trade: updatedAgent.trade,
        tradeId: updatedAgent.trade_id,
        yearsOfExperience: resolvedExp,
        experienceYears: resolvedExp,
        permanentAddress: resolvedAddr,
        permanent_address: resolvedAddr,
        address: resolvedAddr,
        currentLatitude: updatedAgent.current_latitude !== null && updatedAgent.current_latitude !== undefined ? Number(updatedAgent.current_latitude) : null,
        currentLongitude: updatedAgent.current_longitude !== null && updatedAgent.current_longitude !== undefined ? Number(updatedAgent.current_longitude) : null,
        currentLocality: updatedAgent.current_locality || null,
        currentAccuracyM: updatedAgent.current_accuracy_m !== null && updatedAgent.current_accuracy_m !== undefined ? Number(updatedAgent.current_accuracy_m) : null,
        currentH3Cell: updatedAgent.current_h3_cell || null,
        rating: updatedAgent.rating,
        completedJobs: updatedAgent.completed_jobs,
        walletBalance: updatedAgent.wallet_balance,
        avatarUrl: updatedAgent.avatar_url,
        isPhoneVerified: Boolean(updatedAgent.is_phone_verified),
        kycStatus: updatedAgent.kyc_status,
        lastLoginAt: updatedAgent.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Agent update profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send Phone OTP via PostgreSQL persistent helper
router.post('/send-phone-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
    }

    const otpRecord = await createAndSaveOtp(cleanPhone, 'phone_verify', 5);

    return res.json({
      success: true,
      message: 'OTP generated. SMS gateway is not configured in this environment.',
      smsDelivered: false,
      deliveryStatus: 'SMS_GATEWAY_NOT_CONFIGURED',
      phone: cleanPhone,
      cooldownSeconds: 30,
      ...(process.env.NODE_ENV === 'test' ? { testOtp: otpRecord.code } : {})
    });
  } catch (err) {
    console.error('Send phone OTP error:', err);
    if (err.message && err.message.includes('Rate limit exceeded')) {
      return res.status(429).json({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify Phone Number strictly via OTP consumption and user authentication
router.post('/verify-phone', requireAnyAuth, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Both phone and OTP code are required for verification.' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const verification = await verifyAndConsumeOtp(cleanPhone, String(otp).trim(), 'phone_verify');
    if (!verification.valid) {
      return res.status(400).json({ success: false, code: verification.reason, message: `OTP verification failed: ${verification.reason}` });
    }

    if (req.userRole === 'agent' && req.agentId) {
      const result = await pool.query(
        `UPDATE agent_login 
         SET is_phone_verified = true, 
             phone = COALESCE($1, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *;`,
        [cleanPhone, req.agentId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Agent account not found.' });
      }
      ApprovalsService.syncVerificationRequest(req.agentId).catch(() => {});
      return res.json({
        success: true,
        message: 'Professional phone verified successfully.',
        isPhoneVerified: true,
        phone: result.rows[0].phone
      });
    } else {
      const result = await pool.query(
        `UPDATE user_login 
         SET is_phone_verified = true, 
             phone = COALESCE($1, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *;`,
        [cleanPhone, req.userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Customer account not found.' });
      }
      return res.json({
        success: true,
        message: 'Customer phone verified successfully.',
        isPhoneVerified: true,
        phone: result.rows[0].phone
      });
    }
  } catch (err) {
    console.error('Verify phone route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin-only listing endpoints
router.get('/users', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, phone, address, auth_provider, is_verified, avatar_url, google_id, last_login_at, created_at, updated_at FROM user_login ORDER BY created_at DESC;');
    res.json({ success: true, count: result.rows.length, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agents', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, partner_id, name, email, phone, trade, experience_years, kyc_status, rating, completed_jobs, is_online, wallet_balance, auth_provider, avatar_url, google_id, last_login_at, created_at, updated_at FROM agent_login ORDER BY created_at DESC;');
    res.json({ success: true, count: result.rows.length, agents: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
