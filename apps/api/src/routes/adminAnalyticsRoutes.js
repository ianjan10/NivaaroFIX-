import express from 'express';
import { pool } from '../config/db.js';
import {
  parseCookies,
  verifyAdminSession,
  verifyCsrfToken,
  getClientIp
} from '../utils/adminSecurity.js';
import { AnalyticsService } from '../modules/analytics/analyticsService.js';
import { ApprovalsService } from '../modules/verification/approvalsService.js';

const router = express.Router();

// Enforce standard admin security headers on all responses
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Middleware: Authenticate Admin Session
async function requireAdminAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.admin_session;

  if (!sessionId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const sessionCheck = await verifyAdminSession(sessionId);
  if (!sessionCheck.valid || !sessionCheck.user) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }

  req.adminUser = sessionCheck.user;
  next();
}

// Middleware: CSRF Token Check for State-Changing Requests
function requireAdminCsrf(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
  if (!verifyCsrfToken(token)) {
    return res.status(403).json({ success: false, error: 'Invalid or missing CSRF token' });
  }
  next();
}

// Middleware: Role Check for Customers Tab (Owner and Support only; Verifier gets 403)
function requireCustomerRole(req, res, next) {
  if (req.adminUser.role === 'verifier') {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Verifiers do not have permission to view customer analytics or records.'
    });
  }
  next();
}

// =============================================================================
// ANALYTICS ENDPOINTS
// =============================================================================

/**
 * GET /admin/analytics/overview
 * Combined overview metrics, registration trends, category distributions
 */
router.get('/analytics/overview', requireAdminAuth, async (req, res) => {
  try {
    const { range, from, to } = req.query;
    const data = await AnalyticsService.getOverviewAnalytics({ range, from, to });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching overview analytics:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/analytics/customers
 * Deep customer analytics (guarded by role: Owner & Support only)
 */
router.get('/analytics/customers', requireAdminAuth, requireCustomerRole, async (req, res) => {
  try {
    const { range, from, to } = req.query;
    const data = await AnalyticsService.getCustomerAnalytics({ range, from, to });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching customer analytics:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/analytics/professionals
 * Deep professional analytics (Owner, Support, Verifier)
 */
router.get('/analytics/professionals', requireAdminAuth, async (req, res) => {
  try {
    const { range, from, to } = req.query;
    const data = await AnalyticsService.getProfessionalAnalytics({ range, from, to });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching professional analytics:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// =============================================================================
// REGISTRY ENDPOINTS (Search, Filter, Pagination, Profiles)
// =============================================================================

/**
 * GET /admin/registry/professionals
 * Paginated list of professionals with search, trade, status filters, and sorting
 */
router.get('/registry/professionals', requireAdminAuth, async (req, res) => {
  try {
    const { search, trade, status, sort, page, limit } = req.query;
    const data = await AnalyticsService.getProfessionalRegistry({
      search,
      trade,
      status,
      sort,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching professional registry:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/registry/professionals/:id
 * Detailed professional profile including KYC status, docs, verification history, jobs
 */
router.get('/registry/professionals/:id', requireAdminAuth, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) {
      return res.status(400).json({ success: false, error: 'Invalid professional ID' });
    }
    const profile = await AnalyticsService.getProfessionalProfile(rawId, req.adminUser);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    console.error('Error fetching professional profile:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/registry/professionals/:id/status
 * Suspend or reactivate professional access
 */
router.post('/registry/professionals/:id/status', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const proId = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    if (!proId || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid professional ID or status' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (status === 'suspended') {
        // Count previous suspensions
        const countRes = await client.query(
          'SELECT COUNT(*) FROM professional_suspensions WHERE professional_id = $1',
          [proId]
        );
        const previousAttempts = parseInt(countRes.rows[0].count, 10) || 0;
        const currentAttempt = previousAttempts + 1;

        if (currentAttempt >= 3) {
          // 3-STRIKE BAN: 3 chances exhausted, permanent ban
          await client.query(`
            UPDATE professionals
            SET account_status = 'banned',
                kyc_status = 'banned',
                photo_verified = FALSE,
                aadhaar_verified = FALSE,
                dl_verified = FALSE,
                is_online = false,
                suspended_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
          `, [proId]);

          await client.query(`
            UPDATE agent_login
            SET account_status = 'banned',
                kyc_status = 'banned',
                photo_verified = FALSE,
                aadhaar_verified = FALSE,
                dl_verified = FALSE,
                availability_status = 'OFFLINE',
                is_online = false,
                suspended_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
               OR email = (SELECT email FROM professionals WHERE id = $1);
          `, [proId]);

          // Update photos and documents to rejected
          await client.query(`
            UPDATE professional_photos
            SET status = 'rejected',
                rejection_reason = 'Permanently banned from NivaaroFix (3 suspension limit reached)',
                reviewed_by = $1,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $2;
          `, [req.adminUser.id, proId]);

          await client.query(`
            UPDATE professional_documents
            SET status = 'rejected',
                rejection_reason = 'Permanently banned from NivaaroFix (3 suspension limit reached)',
                reviewed_by = $1,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $2 AND document_type = 'aadhaar';
          `, [req.adminUser.id, proId]);

          // Record in professional_suspensions
          await client.query(`
            INSERT INTO professional_suspensions (professional_id, attempt_number, created_at, suspended_until)
            VALUES ($1, $2, CURRENT_TIMESTAMP, NULL);
          `, [proId, currentAttempt]);

          // Record in banned_professionals
          await client.query(`
            INSERT INTO banned_professionals (professional_id, banned_at, reason)
            VALUES ($1, CURRENT_TIMESTAMP, 'Account permanently banned: exhausted all 3 suspension chances in NivaaroFix')
            ON CONFLICT (professional_id) DO UPDATE SET banned_at = CURRENT_TIMESTAMP, reason = EXCLUDED.reason;
          `, [proId]);

          // Verification request update
          await client.query(`
            UPDATE verification_requests
            SET status = 'rejected',
                decision_note = 'Account permanently banned (3 suspensions reached)',
                decided_by_admin_id = $1,
                decided_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $2;
          `, [req.adminUser.id, proId]);

        } else {
          // SUSPENDED FOR 1 WEEK (Attempts 1 or 2)
          const suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          const suspensionMsg = `Account suspended for 7 days (Strike ${currentAttempt} of 3). Re-submission available after 7 days.`;

          await client.query(`
            UPDATE professionals
            SET account_status = 'suspended',
                kyc_status = 'suspended',
                photo_verified = FALSE,
                aadhaar_verified = FALSE,
                dl_verified = FALSE,
                is_online = false,
                suspended_until = $1,
                verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3;
          `, [suspendedUntil, suspensionMsg, proId]);

          await client.query(`
            UPDATE agent_login
            SET account_status = 'suspended',
                kyc_status = 'suspended',
                photo_verified = FALSE,
                aadhaar_verified = FALSE,
                dl_verified = FALSE,
                availability_status = 'OFFLINE',
                is_online = false,
                suspended_until = $1,
                verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
                updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $3)
               OR email = (SELECT email FROM professionals WHERE id = $3);
          `, [suspendedUntil, suspensionMsg, proId]);

          // Set photos and documents to needs_attention
          await client.query(`
            UPDATE professional_photos
            SET status = 'needs_attention',
                rejection_reason = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $3;
          `, ['Suspended for 7 days. Re-upload unlocks after 7 days.', req.adminUser.id, proId]);

          await client.query(`
            UPDATE professional_documents
            SET status = 'needs_attention',
                rejection_reason = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $3 AND document_type = 'aadhaar';
          `, ['Suspended for 7 days. Re-upload unlocks after 7 days.', req.adminUser.id, proId]);

          // Update verification request
          await client.query(`
            UPDATE verification_requests
            SET status = 'needs_attention',
                decision_note = $1,
                decided_by_admin_id = $2,
                decided_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $3;
          `, [suspensionMsg, req.adminUser.id, proId]);

          // Record in professional_suspensions
          await client.query(`
            INSERT INTO professional_suspensions (professional_id, attempt_number, created_at, suspended_until)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3);
          `, [proId, currentAttempt, suspendedUntil]);
        }

      } else {
        // REACTIVATE (status === 'active')
        await client.query(`
          UPDATE professionals
          SET account_status = 'active',
              suspended_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [proId]);

        await client.query(`
          UPDATE agent_login
          SET account_status = 'active',
              suspended_until = NULL,
              offline_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
             OR email = (SELECT email FROM professionals WHERE id = $1);
        `, [proId]);

        // If banned table has record and admin reactivates, remove ban
        await client.query('DELETE FROM banned_professionals WHERE professional_id = $1;', [proId]);
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Return refreshed professional profile for UI update
    const profile = await AnalyticsService.getProfessionalProfile(proId, req.adminUser);
    res.json({ success: true, profile });
  } catch (err) {
    console.error('Error updating professional status:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/registry/professionals/:id/request-reupload
 * Send notice to professional (even after verified) to re-upload photo, aadhaar, or both.
 * Transitions kyc_status to 'needs_attention', records rejection note, and logs audit event.
 */
router.post('/registry/professionals/:id/request-reupload', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const proId = parseInt(req.params.id, 10);
    if (!proId) {
      return res.status(400).json({ success: false, error: 'Invalid professional ID' });
    }

    const { items, noticeNote } = req.body || {};
    const selectedItems = Array.isArray(items) && items.length > 0 ? items : ['live_photo'];
    const note = (noticeNote && noticeNote.trim()) || 'Admin requested re-upload of your verification documents. Please provide a clearer submission.';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update professionals table
      await client.query(`
        UPDATE professionals
        SET kyc_status = 'needs_attention',
            verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($1::text)),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [note, proId]);

      // 2. Update agent_login table
      await client.query(`
        UPDATE agent_login
        SET kyc_status = 'needs_attention',
            verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($1::text)),
            updated_at = CURRENT_TIMESTAMP
        WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $2)
           OR email = (SELECT email FROM professionals WHERE id = $2);
      `, [note, proId]);

      // 3. Update specific documents / photos
      if (selectedItems.includes('live_photo') || selectedItems.includes('both')) {
        await client.query(`
          UPDATE professional_photos
          SET status = 'rejected',
              rejection_reason = $1,
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $3;
        `, [note, req.adminUser.id, proId]);
      }

      if (selectedItems.includes('aadhaar') || selectedItems.includes('both')) {
        await client.query(`
          UPDATE professional_documents
          SET status = 'needs_attention',
              rejection_reason = $1,
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $3 AND document_type = 'aadhaar';
        `, [note, req.adminUser.id, proId]);
      }

      // 4. Update or insert into verification_requests
      const reqCheck = await client.query(`
        SELECT id FROM verification_requests
        WHERE professional_id = $1
        ORDER BY id DESC LIMIT 1;
      `, [proId]);

      let reqId;
      if (reqCheck.rows.length > 0) {
        reqId = reqCheck.rows[0].id;
        await client.query(`
          UPDATE verification_requests
          SET status = 'needs_attention',
              decision_note = $1,
              decided_by_admin_id = $2,
              decided_at = CURRENT_TIMESTAMP,
              claimed_by_admin_id = NULL,
              claimed_until = NULL,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3;
        `, [note, req.adminUser.id, reqId]);
      } else {
        const ins = await client.query(`
          INSERT INTO verification_requests (professional_id, status, decision_note, decided_by_admin_id, decided_at)
          VALUES ($1, 'needs_attention', $2, $3, CURRENT_TIMESTAMP)
          RETURNING id;
        `, [proId, note, req.adminUser.id]);
        reqId = ins.rows[0].id;
      }

      // 5. Audit event
      await client.query(`
        INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
        VALUES ($1, 'reupload_requested', 'admin', $2, $3);
      `, [reqId, req.adminUser.id, JSON.stringify({ items: selectedItems, decision_note: note, source: 'registry_inspection' })]);

      await client.query('COMMIT');

      // Realtime notification if available
      try {
        const { broadcastAdminEvent } = await import('../modules/realtime/adminRealtime.js');
        broadcastAdminEvent('verification.decided', {
          requestId: reqId,
          professionalId: proId,
          decision: 'needs_attention',
          decidedBy: req.adminUser.username
        });
      } catch (_) {}

      res.json({
        success: true,
        message: 'Re-upload notice sent successfully to professional.',
        kycStatus: 'needs_attention'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error requesting re-upload from registry:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/registry/customers
 * Paginated list of customers with search, status filters, booking counts (Owner & Support only)
 */
router.get('/registry/customers', requireAdminAuth, requireCustomerRole, async (req, res) => {
  try {
    const { search, category, status, sort, page, limit } = req.query;
    const data = await AnalyticsService.getCustomerRegistry({
      search,
      category,
      status,
      sort,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching customer registry:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /admin/registry/customers/:id
 * Detailed customer profile with booking history and statistics (Owner & Support only)
 */
router.get('/registry/customers/:id', requireAdminAuth, requireCustomerRole, async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'Invalid customer ID' });
    }
    const profile = await AnalyticsService.getCustomerProfile(customerId, req.adminUser);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    console.error('Error fetching customer profile:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /admin/registry/reveal
 * Audited PII Reveal for registry drawers
 */
router.post('/registry/reveal', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const rawTargetType = req.body?.targetType || req.body?.entityType;
    const rawTargetId = req.body?.targetId || req.body?.entityId;
    const { field, reason } = req.body || {};

    if (rawTargetType === 'customer' && req.adminUser.role === 'verifier') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const reqMeta = {
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    };

    const unmaskedValue = await ApprovalsService.revealPii(
      { targetType: rawTargetType, targetId: rawTargetId, field, reason },
      req.adminUser,
      reqMeta
    );

    res.json({ success: true, value: unmaskedValue });
  } catch (err) {
    console.error('Error in PII reveal:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;

