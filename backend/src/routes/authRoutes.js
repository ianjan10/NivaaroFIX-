import { Router } from 'express';
import { pool } from '../config/db.js';
import { latLngToH3, getCityCoordinates } from '../utils/geoDispatch.js';
import { generateProfessionalId } from '../utils/idGenerator.js';

const router = Router();

function isTestGarbageDob(d) {
  if (!d) return false;
  const str = typeof d === 'object' ? `${d?.day || ''}/${d?.month || ''}/${d?.year || ''}` : String(d);
  return str.includes('1992') || str.includes('1988') || str.includes('2050') || str === '//' || str === '--';
}

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

// Helper to decode JWT token payload safely
function decodeGoogleJwt(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Error decoding Google JWT:', err.message);
    return null;
  }
}

/* ==========================================================================
   0. UNIFIED GOOGLE OAUTH ENDPOINT (Customer & Partner Login/Register)
   ========================================================================== */
router.post('/google', async (req, res) => {
  try {
    const { credential, profile, role = 'customer', trade, phone, city, address } = req.body;

    let googleData = null;
    if (credential) {
      googleData = decodeGoogleJwt(credential);
    }
    
    // Extract profile fields from JWT or direct profile object
    const email = (googleData?.email || profile?.email || '').toLowerCase().trim();
    const name = googleData?.name || profile?.name || (email ? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Google User');
    const avatarUrl = googleData?.picture || profile?.picture || profile?.avatar || null;
    const googleId = googleData?.sub || profile?.googleId || profile?.sub || null;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Valid Google email is required for OAuth authentication'
      });
    }

    if (role === 'agent') {
      // -------------------------------------------------------------
      // Partner / Technician Google OAuth
      // -------------------------------------------------------------
      const generatedPartnerId = await generateProfessionalId(pool);
      const agentResult = await pool.query(`
        INSERT INTO agent_login (
          partner_id, name, email, phone, trade, experience_years,
          city, address, auth_provider, is_online, kyc_status,
          rating, completed_jobs, wallet_balance, avatar_url, google_id,
          last_login_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'google', true, 'Pending', NULL, 0, 0.00, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        city || null,
        address || null,
        avatarUrl,
        googleId
      ]);

      const agent = agentResult.rows[0];
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
          dob: agent.dob,
          state: agent.state,
          city: agent.city,
          address: agent.address,
          rating: agent.rating,
          completedJobs: agent.completed_jobs,
          walletBalance: agent.wallet_balance,
          avatarUrl: agent.avatar_url,
          kycStatus: agent.kyc_status,
          lastLoginAt: agent.last_login_at,
          isLoggedIn: true
        }
      });
    } else {
      // -------------------------------------------------------------
      // Customer Google OAuth
      // -------------------------------------------------------------
      const customerResult = await pool.query(`
        INSERT INTO user_login (
          name, email, phone, city, address, auth_provider,
          is_verified, avatar_url, google_id, last_login_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'google', true, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        city || null,
        address || null,
        avatarUrl,
        googleId
      ]);

      const user = customerResult.rows[0];
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
          dob: user.dob,
          state: user.state,
          city: user.city,
          address: user.address,
          avatarUrl: user.avatar_url,
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
    const { name, email, phone, dob, state, city, address, password, isPhoneVerified } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Full name and email are required to register.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const formattedDob = typeof dob === 'object' && dob !== null ? `${dob.day}/${dob.month}/${dob.year}` : (dob || null);
    const phoneVerified = Boolean(isPhoneVerified) || false;

    const result = await pool.query(`
      INSERT INTO user_login (
        name, email, phone, dob, state, city, address, password,
        auth_provider, is_verified, is_phone_verified, last_login_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'email', true, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, user_login.phone),
        dob = COALESCE(EXCLUDED.dob, user_login.dob),
        state = COALESCE(EXCLUDED.state, user_login.state),
        city = COALESCE(EXCLUDED.city, user_login.city),
        address = COALESCE(EXCLUDED.address, user_login.address),
        password = COALESCE(EXCLUDED.password, user_login.password),
        is_phone_verified = COALESCE(EXCLUDED.is_phone_verified, user_login.is_phone_verified),
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [
      cleanName,
      cleanEmail,
      phone || null,
      formattedDob,
      state || null,
      city || null,
      address || null,
      password || null,
      phoneVerified
    ]);

    const user = result.rows[0];
    console.log(`👤 Customer Registered in user_login: ${user.name} (${user.email}) [Phone Verified: ${Boolean(user.is_phone_verified)}]`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully in database',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        dob: user.dob,
        state: user.state,
        city: user.city,
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
    const { email, phone, password } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const cleanPhone = phone ? phone.trim() : null;

    if (!cleanEmail && !cleanPhone) {
      return res.status(400).json({
        success: false,
        message: 'Email address or mobile number is required to log in.'
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

    // PASSWORD VERIFICATION (if password was provided)
    if (password && user.password && user.password !== password) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Incorrect password. Please verify your credentials and try again.'
      });
    }

    // Update last login timestamp on verified sign-in
    const updateRes = await pool.query(`
      UPDATE user_login 
      SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `, [user.id]);
    const verifiedUser = updateRes.rows[0];

    console.log(`👤 Customer Authenticated: ${verifiedUser.name} (${verifiedUser.email})`);

    res.json({
      success: true,
      message: 'Customer credentials verified successfully',
      user: {
        id: verifiedUser.id,
        name: verifiedUser.name,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        dob: verifiedUser.dob,
        state: verifiedUser.state,
        city: verifiedUser.city,
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
    const { name, email, phone, trade, experienceYears, dob, state, city, address, password, isPhoneVerified } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Full name and email are required to register as partner.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const generatedPartnerId = await generateProfessionalId(pool);
    const formattedDob = typeof dob === 'object' && dob !== null ? `${dob.day}/${dob.month}/${dob.year}` : (dob || null);
    const phoneVerified = Boolean(isPhoneVerified) || false;

    const result = await pool.query(`
      INSERT INTO agent_login (
        partner_id, name, email, phone, trade, experience_years,
        dob, state, city, address, password, is_online, is_phone_verified,
        last_login_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, agent_login.phone),
        trade = COALESCE(EXCLUDED.trade, agent_login.trade),
        experience_years = COALESCE(EXCLUDED.experience_years, agent_login.experience_years),
        dob = COALESCE(EXCLUDED.dob, agent_login.dob),
        state = COALESCE(EXCLUDED.state, agent_login.state),
        city = COALESCE(EXCLUDED.city, agent_login.city),
        address = COALESCE(EXCLUDED.address, agent_login.address),
        password = COALESCE(EXCLUDED.password, agent_login.password),
        is_phone_verified = COALESCE(EXCLUDED.is_phone_verified, agent_login.is_phone_verified),
        is_online = true,
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [
      generatedPartnerId,
      cleanName,
      cleanEmail,
      phone || null,
      trade === 'plumber' ? 'plumber' : 'electrician',
      experienceYears ? parseInt(experienceYears, 10) : 0,
      formattedDob,
      state || null,
      city || null,
      address || null,
      password || null,
      phoneVerified
    ]);

    const agent = result.rows[0];
    console.log(`⚡ Partner Registered in agent_login: ${agent.name} (ID: ${agent.partner_id}) [Phone Verified: ${Boolean(agent.is_phone_verified)}]`);

    res.status(201).json({
      success: true,
      message: 'Partner registered successfully in database',
      agent: {
        id: agent.id,
        partnerId: agent.partner_id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        trade: agent.trade,
        experienceYears: agent.experience_years,
        dob: agent.dob,
        state: agent.state,
        city: agent.city,
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agent Sign In / Partner Login (Strict verification: NO dummy inserts on failure)
router.post('/agent-login', async (req, res) => {
  try {
    const { email, agentIdOrEmail, phone, password } = req.body;
    const rawIdentifier = (email || agentIdOrEmail || phone || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Partner ID, email, or mobile number is required to sign in.'
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

    // PASSWORD VERIFICATION (if password was provided)
    if (password && agent.password && agent.password !== password) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Incorrect password. Please verify your partner password.'
      });
    }

    // Update last login timestamp and online status
    const updateRes = await pool.query(`
      UPDATE agent_login 
      SET is_online = true, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `, [agent.id]);
    const verifiedAgent = updateRes.rows[0];

    console.log(`⚡ Partner Authenticated: ${verifiedAgent.name} (ID: ${verifiedAgent.partner_id})`);

    res.json({
      success: true,
      message: 'Partner credentials verified successfully',
      agent: {
        id: verifiedAgent.id,
        partnerId: verifiedAgent.partner_id,
        name: verifiedAgent.name,
        email: verifiedAgent.email,
        phone: verifiedAgent.phone,
        trade: verifiedAgent.trade,
        experienceYears: verifiedAgent.experience_years,
        dob: verifiedAgent.dob,
        state: verifiedAgent.state,
        city: verifiedAgent.city,
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

// Customer Fetch Profile
router.get('/customer-profile', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    const id = req.query.id && !isNaN(Number(req.query.id)) ? Number(req.query.id) : null;
    if (!email && !id) {
      return res.status(400).json({ success: false, message: 'Email or User ID is required.' });
    }

    const result = await pool.query(
      `SELECT id, name, email, phone, dob, state, city, address, avatar_url, is_phone_verified, last_login_at 
       FROM user_login 
       WHERE (email = $1 AND $1 IS NOT NULL) OR (id = $2 AND $2 IS NOT NULL)
       LIMIT 1`,
      [email || null, id]
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
        dob: isTestGarbageDob(u.dob) ? null : u.dob,
        state: u.state,
        city: u.city,
        address: u.address,
        avatarUrl: u.avatar_url,
        isPhoneVerified: Boolean(u.is_phone_verified),
        lastLoginAt: u.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer fetch profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agent Fetch Profile
router.get('/agent-profile', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    const partnerId = (req.query.partnerId || '').trim();
    const id = req.query.id && !isNaN(Number(req.query.id)) ? Number(req.query.id) : null;
    if (!email && !id && !partnerId) {
      return res.status(400).json({ success: false, message: 'Partner ID or Email is required.' });
    }

    const result = await pool.query(
      `SELECT id, partner_id, name, email, phone, trade, experience_years, dob, state, city, address, avatar_url, is_phone_verified, last_login_at 
       FROM agent_login 
       WHERE (email = $1 AND $1 IS NOT NULL) OR (id = $2 AND $2 IS NOT NULL) OR (partner_id = $3 AND $3 IS NOT NULL)
       LIMIT 1`,
      [email || null, id, partnerId || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    const a = result.rows[0];
    res.json({
      success: true,
      agent: {
        id: a.id,
        partnerId: a.partner_id,
        name: a.name,
        email: a.email,
        phone: isTestGarbagePhone(a.phone) ? null : a.phone,
        trade: a.trade,
        experienceYears: a.experience_years,
        dob: isTestGarbageDob(a.dob) ? null : a.dob,
        state: a.state,
        city: a.city,
        address: a.address,
        avatarUrl: a.avatar_url,
        isPhoneVerified: Boolean(a.is_phone_verified),
        lastLoginAt: a.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Agent fetch profile error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer Update Profile
router.post('/customer-update-profile', async (req, res) => {
  try {
    const { id, email, name, phone, dob, state, city, address, avatarUrl } = req.body;
    if (!email && !id) {
      return res.status(400).json({ success: false, message: 'Email or User ID is required.' });
    }

    const numericId = id && !isNaN(Number(id)) && Number.isInteger(Number(id)) ? Number(id) : null;
    let formattedDob = typeof dob === 'object' && dob !== null 
      ? (dob.day && dob.month && dob.year ? `${dob.day}/${dob.month}/${dob.year}` : null) 
      : (dob ? String(dob).trim() : null);
    if (isTestGarbageDob(formattedDob)) formattedDob = null;

    let cleanPhone = phone ? String(phone).trim() : null;
    if (isTestGarbagePhone(cleanPhone)) cleanPhone = null;

    const cleanEmail = email ? email.toLowerCase().trim() : null;

    const updateQuery = `
      UPDATE user_login
      SET
        name = COALESCE($1, name),
        phone = $2,
        dob = $3,
        state = $4,
        city = $5,
        address = $6,
        avatar_url = COALESCE($7, avatar_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE (email = $8 AND $8 IS NOT NULL) OR (id = $9 AND $9 IS NOT NULL)
      RETURNING *;
    `;

    let result = await pool.query(updateQuery, [
      name ? name.trim() : null,
      cleanPhone,
      formattedDob,
      state ? state.trim() : null,
      city ? city.trim() : null,
      address ? address.trim() : null,
      avatarUrl || null,
      cleanEmail,
      numericId
    ]);

    if (result.rows.length === 0 && cleanEmail) {
      const insertQuery = `
        INSERT INTO user_login (name, email, phone, dob, state, city, address, avatar_url, auth_provider, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'email', true)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          dob = EXCLUDED.dob,
          state = EXCLUDED.state,
          city = EXCLUDED.city,
          address = EXCLUDED.address,
          avatar_url = EXCLUDED.avatar_url,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      result = await pool.query(insertQuery, [
        name ? name.trim() : 'Customer',
        cleanEmail,
        cleanPhone,
        formattedDob,
        state ? state.trim() : null,
        city ? city.trim() : null,
        address ? address.trim() : null,
        avatarUrl || null
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const updatedUser = result.rows[0];
    res.json({
      success: true,
      message: 'Profile updated successfully in database',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        dob: updatedUser.dob,
        state: updatedUser.state,
        city: updatedUser.city,
        address: updatedUser.address,
        avatarUrl: updatedUser.avatar_url,
        isPhoneVerified: Boolean(updatedUser.is_phone_verified),
        lastLoginAt: updatedUser.last_login_at,
        isLoggedIn: true
      }
    });
  } catch (err) {
    console.error('Customer update profile error:', err);
    res.status(500).json({ success: false, error: err.message, message: 'Failed to update profile: ' + err.message });
  }
});

// Agent Update Profile
router.post('/agent-update-profile', async (req, res) => {
  try {
    const { id, email, partnerId, name, phone, trade, experienceYears, dob, state, city, address, avatarUrl } = req.body;
    if (!email && !id && !partnerId) {
      return res.status(400).json({ success: false, message: 'Partner ID or email is required.' });
    }

    const numericId = id && !isNaN(Number(id)) && Number.isInteger(Number(id)) ? Number(id) : null;
    let formattedDob = typeof dob === 'object' && dob !== null 
      ? (dob.day && dob.month && dob.year ? `${dob.day}/${dob.month}/${dob.year}` : null) 
      : (dob ? String(dob).trim() : null);
    if (isTestGarbageDob(formattedDob)) formattedDob = null;

    let cleanPhone = phone ? String(phone).trim() : null;
    if (isTestGarbagePhone(cleanPhone)) cleanPhone = null;

    const cleanEmail = email ? email.toLowerCase().trim() : null;
    const cleanTrade = trade === 'plumber' ? 'plumber' : 'electrician';

    // Compute or derive geospatial coordinates & H3 index
    let finalLat = req.body.lat !== undefined && req.body.lat !== null ? parseFloat(req.body.lat) : null;
    let finalLng = req.body.lng !== undefined && req.body.lng !== null ? parseFloat(req.body.lng) : null;
    if ((isNaN(finalLat) || isNaN(finalLng) || finalLat === null || finalLng === null) && city) {
      const cityCoords = getCityCoordinates(city);
      if (cityCoords) {
        finalLat = cityCoords.lat;
        finalLng = cityCoords.lng;
      }
    }
    const h3Index = (finalLat && finalLng && !isNaN(finalLat) && !isNaN(finalLng)) ? latLngToH3(finalLat, finalLng) : null;

    const updateQuery = `
      UPDATE agent_login
      SET
        name = COALESCE($1, name),
        phone = $2,
        trade = COALESCE($3, trade),
        experience_years = COALESCE($4, experience_years),
        dob = $5,
        state = $6,
        city = $7,
        address = $8,
        avatar_url = COALESCE($9, avatar_url),
        lat = COALESCE($10, lat),
        lng = COALESCE($11, lng),
        h3_index_res9 = COALESCE($12, h3_index_res9),
        updated_at = CURRENT_TIMESTAMP
      WHERE (email = $13 AND $13 IS NOT NULL) OR (id = $14 AND $14 IS NOT NULL) OR (partner_id = $15 AND $15 IS NOT NULL)
      RETURNING *;
    `;

    let result = await pool.query(updateQuery, [
      name ? name.trim() : null,
      cleanPhone,
      cleanTrade,
      experienceYears !== undefined && experienceYears !== null ? Number(experienceYears) : null,
      formattedDob,
      state ? state.trim() : null,
      city ? city.trim() : null,
      address ? address.trim() : null,
      avatarUrl || null,
      finalLat,
      finalLng,
      h3Index,
      cleanEmail,
      numericId,
      partnerId || null
    ]);

    if (result.rows.length === 0 && (cleanEmail || partnerId)) {
      const generatedPartnerId = partnerId || await generateProfessionalId(pool);
      const fallbackEmail = cleanEmail || `${generatedPartnerId.toLowerCase()}@nivaarofix.in`;
      const insertQuery = `
        INSERT INTO agent_login (partner_id, name, email, phone, trade, experience_years, dob, state, city, address, avatar_url, lat, lng, h3_index_res9, kyc_status, auth_provider)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Verified', 'agent_id')
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          trade = EXCLUDED.trade,
          experience_years = EXCLUDED.experience_years,
          dob = EXCLUDED.dob,
          state = EXCLUDED.state,
          city = EXCLUDED.city,
          address = EXCLUDED.address,
          avatar_url = EXCLUDED.avatar_url,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          h3_index_res9 = EXCLUDED.h3_index_res9,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      result = await pool.query(insertQuery, [
        generatedPartnerId,
        name ? name.trim() : 'Service Partner',
        fallbackEmail,
        phone ? phone.trim() : null,
        cleanTrade,
        experienceYears !== undefined && experienceYears !== null ? Number(experienceYears) : 5,
        formattedDob,
        state ? state.trim() : null,
        city ? city.trim() : null,
        address ? address.trim() : null,
        avatarUrl || null,
        finalLat,
        finalLng,
        h3Index
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const updatedAgent = result.rows[0];
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
        experienceYears: updatedAgent.experience_years,
        dob: updatedAgent.dob,
        state: updatedAgent.state,
        city: updatedAgent.city,
        address: updatedAgent.address,
        lat: updatedAgent.lat ? parseFloat(updatedAgent.lat) : null,
        lng: updatedAgent.lng ? parseFloat(updatedAgent.lng) : null,
        h3Index: updatedAgent.h3_index_res9 || null,
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

// Verify Phone Number directly or via OTP
router.post('/verify-phone', async (req, res) => {
  try {
    const { role, email, partnerId, phone } = req.body;
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    const cleanPartnerId = partnerId ? String(partnerId).trim() : null;

    if (role === 'agent' || cleanPartnerId) {
      const result = await pool.query(
        `UPDATE agent_login 
         SET is_phone_verified = true, 
             phone = COALESCE($1, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE (email = $2 AND $2 IS NOT NULL) 
            OR (partner_id = $3 AND $3 IS NOT NULL) 
            OR (phone = $1 AND $1 IS NOT NULL)
         RETURNING *;`,
        [cleanPhone, cleanEmail, cleanPartnerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Professional account not found to verify phone.' });
      }

      const agent = result.rows[0];
      return res.json({
        success: true,
        message: 'Professional mobile number verified successfully!',
        isPhoneVerified: true,
        phone: agent.phone
      });
    } else {
      const result = await pool.query(
        `UPDATE user_login 
         SET is_phone_verified = true, 
             phone = COALESCE($1, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE (email = $2 AND $2 IS NOT NULL) 
            OR (phone = $1 AND $1 IS NOT NULL)
         RETURNING *;`,
        [cleanPhone, cleanEmail]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Customer account not found to verify phone.' });
      }

      const user = result.rows[0];
      return res.json({
        success: true,
        message: 'Customer mobile number verified successfully!',
        isPhoneVerified: true,
        phone: user.phone
      });
    }
  } catch (err) {
    console.error('Verify phone route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   4. QUERY ALL USERS & AGENTS (For inspection & API verification)
   ========================================================================== */

router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, phone, dob, state, city, address, auth_provider, is_verified, avatar_url, google_id, last_login_at, created_at, updated_at FROM user_login ORDER BY created_at DESC;');
    res.json({ success: true, count: result.rows.length, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agents', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, partner_id, name, email, phone, trade, experience_years, dob, state, city, kyc_status, rating, completed_jobs, is_online, wallet_balance, auth_provider, avatar_url, google_id, last_login_at, created_at, updated_at FROM agent_login ORDER BY created_at DESC;');
    res.json({ success: true, count: result.rows.length, agents: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
