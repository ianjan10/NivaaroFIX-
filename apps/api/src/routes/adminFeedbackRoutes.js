import express from 'express';
import { pool } from '../config/db.js';
import {
  parseCookies,
  verifyAdminSession,
  verifyCsrfToken,
  logAdminAudit,
  getClientIp
} from '../utils/adminSecurity.js';
import { broadcastAdminEvent } from '../modules/realtime/adminRealtime.js';

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

// Middleware: Role Check (Owner or Admin only)
function requireAdminOrOwner(req, res, next) {
  if (!req.adminUser || !['owner', 'admin'].includes(req.adminUser.role)) {
    return res.status(403).json({
      success: false,
      error: 'Permission denied: Owner or Admin role required.'
    });
  }
  next();
}

/**
 * Helpers for name and city formatting
 */
function formatFirstInitial(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

function extractCityFromAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const clean = address.trim();
  if (!clean) return null;

  const knownCities = [
    'Chennai', 'Trichy', 'Tiruchirappalli', 'Coimbatore', 'Madurai',
    'Bangalore', 'Bengaluru', 'Salem', 'Thanjavur', 'Tirunelveli',
    'Vellore', 'Erode', 'Kanchipuram'
  ];
  for (const city of knownCities) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(clean)) {
      return city === 'Tiruchirappalli' ? 'Trichy' : city === 'Bengaluru' ? 'Bangalore' : city;
    }
  }

  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2] || parts[parts.length - 1];
    const stripped = candidate.replace(/\d+/g, '').replace(/tamil nadu|india/i, '').trim();
    if (stripped.length >= 3) return stripped;
  }
  return null;
}

/**
 * Helper to determine if a feedback record is of type Appreciation
 */
function isAppreciationFeedback(item) {
  if (!item) return false;
  if (['suggestion', 'problem', 'issue'].includes(item.category)) return false;
  return item.rating >= 4 || ['experience', 'service', 'appreciation', 'positive'].includes(item.category);
}

/**
 * GET /admin/feedbacks
 * Retrieve categorized, filtered, and searchable feedbacks with analytics summary
 */
router.get('/feedbacks', requireAdminAuth, async (req, res) => {
  try {
    const {
      filter = 'all', // 'all' | 'positive' | 'suggestion' | 'issue' | 'published'
      status = 'all', // 'all' | 'new' | 'in_progress' | 'resolved'
      q = '',
      sort = 'newest', // 'newest' | 'oldest' | 'rating_high' | 'rating_low'
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Build conditions
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    // Filter by type
    if (filter === 'positive') {
      conditions.push(`(pf.rating >= 4 OR pf.category IN ('experience', 'service', 'appreciation', 'positive')) AND pf.category NOT IN ('suggestion', 'problem', 'issue')`);
    } else if (filter === 'suggestion') {
      conditions.push(`pf.category = 'suggestion'`);
    } else if (filter === 'issue') {
      conditions.push(`(pf.category IN ('problem', 'issue') OR (pf.rating IS NOT NULL AND pf.rating <= 2))`);
    } else if (filter === 'published') {
      conditions.push(`pf.is_published = TRUE`);
    }

    // Filter by resolution status
    if (status && status !== 'all') {
      conditions.push(`pf.resolution_status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    // Search query
    if (q && q.trim()) {
      const searchPattern = `%${q.trim()}%`;
      conditions.push(`(
        pf.comment ILIKE $${paramIndex} OR 
        pf.contact_info ILIKE $${paramIndex} OR 
        pf.problem_definition ILIKE $${paramIndex} OR
        pf.user_role ILIKE $${paramIndex} OR
        pf.public_text ILIKE $${paramIndex} OR
        pf.public_name ILIKE $${paramIndex}
      )`);
      values.push(searchPattern);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort order
    let orderBy = 'pf.created_at DESC';
    if (sort === 'oldest') {
      orderBy = 'pf.created_at ASC';
    } else if (sort === 'rating_high') {
      orderBy = 'pf.rating DESC NULLS LAST, pf.created_at DESC';
    } else if (sort === 'rating_low') {
      orderBy = 'pf.rating ASC NULLS LAST, pf.created_at DESC';
    }

    // Execute list query with customer profile lookup and verified booking check
    const listQuery = `
      SELECT 
        pf.id,
        pf.rating,
        pf.category,
        pf.problem_definition,
        pf.comment,
        pf.contact_info,
        pf.user_id,
        pf.user_role,
        pf.device_info,
        pf.status,
        pf.is_published,
        pf.published_at,
        pf.published_by,
        pf.unpublished_at,
        pf.unpublished_by,
        pf.public_text,
        pf.public_name,
        pf.public_city,
        pf.booking_id,
        pf.admin_notes,
        pf.resolution_status,
        pf.resolved_at,
        pf.resolved_by,
        pf.created_at,
        c.name AS profile_name,
        c.permanent_address AS profile_address,
        EXISTS (
          SELECT 1 FROM bookings b 
          WHERE (b.id = pf.booking_id OR (pf.user_id IS NOT NULL AND b.user_id = pf.user_id)) 
            AND LOWER(b.status) = 'completed'
        ) AS has_completed_booking
      FROM platform_feedbacks pf
      LEFT JOIN LATERAL (
        SELECT name, permanent_address 
        FROM customers 
        WHERE (user_id IS NOT NULL AND user_id = pf.user_id)
           OR (phone IS NOT NULL AND phone = pf.contact_info)
           OR (email IS NOT NULL AND email = pf.contact_info)
        LIMIT 1
      ) c ON true
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    const listValues = [...values, limitNum, offset];
    const listResult = await pool.query(listQuery, listValues);

    // Format fields for frontend convenience
    const formattedFeedbacks = listResult.rows.map((row) => {
      const formattedName = formatFirstInitial(row.profile_name);
      const detectedCity = extractCityFromAddress(row.profile_address);
      const isApprec = isAppreciationFeedback(row);
      const hasComment = Boolean(row.comment && row.comment.trim());

      return {
        ...row,
        isAppreciation: isApprec,
        hasComment,
        canPublish: isApprec && hasComment,
        suggestedName: formattedName,
        hasProfileName: Boolean(formattedName),
        suggestedCity: detectedCity,
        hasProfileCity: Boolean(detectedCity),
        verifiedBooking: Boolean(row.has_completed_booking)
      };
    });

    // Count query
    const countQuery = `SELECT COUNT(*) FROM platform_feedbacks pf ${whereClause};`;
    const countResult = await pool.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Summary counts for tabs
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE (rating >= 4 OR category IN ('experience', 'service', 'appreciation', 'positive')) AND category NOT IN ('suggestion', 'problem', 'issue')) AS positive_count,
        COUNT(*) FILTER (WHERE category = 'suggestion') AS suggestion_count,
        COUNT(*) FILTER (WHERE category IN ('problem', 'issue') OR (rating IS NOT NULL AND rating <= 2)) AS issue_count,
        COUNT(*) FILTER (WHERE is_published = TRUE) AS published_count,
        COUNT(*) FILTER (WHERE (category IN ('problem', 'issue') OR (rating IS NOT NULL AND rating <= 2)) AND resolution_status != 'resolved') AS open_issues_count
      FROM platform_feedbacks;
    `);

    const summaryRow = summaryResult.rows[0] || {};
    const summary = {
      total: parseInt(summaryRow.total || '0', 10),
      positiveCount: parseInt(summaryRow.positive_count || '0', 10),
      suggestionCount: parseInt(summaryRow.suggestion_count || '0', 10),
      issueCount: parseInt(summaryRow.issue_count || '0', 10),
      publishedCount: parseInt(summaryRow.published_count || '0', 10),
      openIssuesCount: parseInt(summaryRow.open_issues_count || '0', 10)
    };

    return res.json({
      success: true,
      feedbacks: formattedFeedbacks,
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1
      }
    });
  } catch (err) {
    console.error('Admin fetch feedbacks error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve feedback records.' });
  }
});

/**
 * GET /admin/feedbacks/:id/publish-context
 * Returns prefilled data for the "Publish to homepage" modal dialog
 */
router.get('/feedbacks/:id/publish-context', requireAdminAuth, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (isNaN(feedbackId)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback ID' });
    }

    const fbRes = await pool.query(`
      SELECT 
        pf.id,
        pf.comment,
        pf.rating,
        pf.category,
        pf.public_text,
        pf.public_name,
        pf.public_city,
        pf.is_published,
        pf.published_at,
        pf.published_by,
        pf.created_at,
        c.name AS profile_name,
        c.permanent_address AS profile_address,
        EXISTS (
          SELECT 1 FROM bookings b 
          WHERE (b.id = pf.booking_id OR (pf.user_id IS NOT NULL AND b.user_id = pf.user_id)) 
            AND LOWER(b.status) = 'completed'
        ) AS has_completed_booking
      FROM platform_feedbacks pf
      LEFT JOIN LATERAL (
        SELECT name, permanent_address 
        FROM customers 
        WHERE (user_id IS NOT NULL AND user_id = pf.user_id)
           OR (phone IS NOT NULL AND phone = pf.contact_info)
           OR (email IS NOT NULL AND email = pf.contact_info)
        LIMIT 1
      ) c ON true
      WHERE pf.id = $1;
    `, [feedbackId]);

    if (fbRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feedback record not found.' });
    }

    const row = fbRes.rows[0];
    const isApprec = isAppreciationFeedback(row);
    const hasComment = Boolean(row.comment && row.comment.trim());
    const formattedName = formatFirstInitial(row.profile_name);
    const detectedCity = extractCityFromAddress(row.profile_address);

    return res.json({
      success: true,
      context: {
        feedbackId: row.id,
        originalComment: row.comment,
        isAppreciation: isApprec,
        hasComment,
        canPublish: isApprec && hasComment,
        publicText: row.public_text || row.comment || '',
        currentPublicName: row.public_name || formattedName || 'Verified customer',
        suggestedName: formattedName,
        hasProfileName: Boolean(formattedName),
        suggestedCity: detectedCity,
        hasProfileCity: Boolean(detectedCity),
        currentPublicCity: row.public_city || detectedCity || '',
        rating: row.rating,
        verifiedBooking: Boolean(row.has_completed_booking),
        isPublished: Boolean(row.is_published),
        publishedAt: row.published_at,
        publishedBy: row.published_by
      }
    });
  } catch (err) {
    console.error('Publish context error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load publish context.' });
  }
});

/**
 * POST /admin/feedbacks/:id/publish
 * Publishes an appreciation feedback to the public website homepage.
 * Permission-checked: Owner/admin roles only.
 */
router.post('/feedbacks/:id/publish', requireAdminAuth, requireAdminCsrf, requireAdminOrOwner, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (isNaN(feedbackId)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback ID' });
    }

    const existingRes = await pool.query(
      'SELECT id, rating, category, comment, user_id, contact_info, booking_id, is_published, published_at FROM platform_feedbacks WHERE id = $1',
      [feedbackId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feedback record not found.' });
    }
    const feedback = existingRes.rows[0];

    // Rule 1: Only feedback of type Appreciation can be published
    if (!isAppreciationFeedback(feedback)) {
      return res.status(400).json({
        success: false,
        error: 'Only appreciation feedback can be published to the website.'
      });
    }

    // Rule 2: Must have comment text (rating-only cannot be published)
    if (!feedback.comment || !feedback.comment.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Add a comment to publish.'
      });
    }

    // Rule 3: Public text validation (max 280 chars, non-empty)
    const rawText = req.body.publicText !== undefined ? String(req.body.publicText).trim() : feedback.comment.trim();
    if (!rawText) {
      return res.status(400).json({ success: false, error: 'Public text cannot be empty.' });
    }
    if (rawText.length > 280) {
      return res.status(400).json({ success: false, error: 'Public text must be 280 characters or fewer.' });
    }

    // Retrieve customer profile for name
    const custRes = await pool.query(`
      SELECT name, permanent_address 
      FROM customers 
      WHERE (user_id IS NOT NULL AND user_id = $1)
         OR (phone IS NOT NULL AND phone = $2)
         OR (email IS NOT NULL AND email = $2)
      LIMIT 1
    `, [feedback.user_id, feedback.contact_info]);
    const profile = custRes.rows[0] || {};
    const formattedProfileName = formatFirstInitial(profile.name);

    // Rule: Name shown (max 40 chars). Reject '@' or 7+ consecutive digits. Never derive from email.
    let publicName = 'Customer';
    if (req.body.publicName !== undefined && String(req.body.publicName).trim()) {
      const candidate = String(req.body.publicName).trim();
      if (candidate.includes('@') || /\d{7,}/.test(candidate)) {
        return res.status(400).json({
          success: false,
          error: 'Name shown cannot contain email addresses (@) or phone numbers (7+ digits).'
        });
      }
      publicName = candidate.slice(0, 40);
    } else if (formattedProfileName) {
      publicName = formattedProfileName.slice(0, 40);
    }

    // Rule 4: The customer's original comment text is never modified.
    const adminUser = req.adminUser?.username || 'admin';
    const updateResult = await pool.query(`
      UPDATE platform_feedbacks
      SET 
        is_published = TRUE,
        published_at = CURRENT_TIMESTAMP,
        published_by = $1,
        public_text = $2,
        public_name = $3
      WHERE id = $4
      RETURNING *;
    `, [
      adminUser,
      rawText,
      publicName,
      feedbackId
    ]);

    // Rule: Every publish writes an audit entry
    await logAdminAudit({
      adminUserId: req.adminUser.id,
      action: 'FEEDBACK_PUBLISH',
      targetType: 'feedback',
      targetId: feedbackId,
      result: 'success',
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      details: {
        publicName,
        publicTextLength: rawText.length,
        adminUser
      }
    });

    try {
      broadcastAdminEvent('feedback.updated', { feedbackId: id });
    } catch (_) {}

    return res.json({
      success: true,
      feedback: updateResult.rows[0],
      message: 'Published to homepage.'
    });
  } catch (err) {
    console.error('Publish feedback error:', err);
    return res.status(500).json({ success: false, error: 'Failed to publish feedback.' });
  }
});

/**
 * POST /admin/feedbacks/:id/unpublish
 * Unpublishes a feedback from the public homepage.
 * Permission-checked: Owner/admin roles only.
 */
router.post('/feedbacks/:id/unpublish', requireAdminAuth, requireAdminCsrf, requireAdminOrOwner, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (isNaN(feedbackId)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback ID' });
    }

    const existingRes = await pool.query(
      'SELECT id, is_published, published_at FROM platform_feedbacks WHERE id = $1',
      [feedbackId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feedback record not found.' });
    }
    const feedback = existingRes.rows[0];

    const adminUser = req.adminUser?.username || 'admin';
    const updateResult = await pool.query(`
      UPDATE platform_feedbacks
      SET 
        is_published = FALSE,
        unpublished_at = CURRENT_TIMESTAMP,
        unpublished_by = $1
      WHERE id = $2
      RETURNING *;
    `, [adminUser, feedbackId]);

    // Every unpublish writes an audit entry
    await logAdminAudit({
      adminUserId: req.adminUser.id,
      action: 'FEEDBACK_UNPUBLISH',
      targetType: 'feedback',
      targetId: feedbackId,
      result: 'success',
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      details: {
        wasPublishedAt: feedback.published_at,
        adminUser
      }
    });

    try {
      broadcastAdminEvent('feedback.updated', { feedbackId: id });
    } catch (_) {}

    return res.json({
      success: true,
      feedback: updateResult.rows[0],
      message: 'Removed from homepage.'
    });
  } catch (err) {
    console.error('Unpublish feedback error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unpublish feedback.' });
  }
});

/**
 * PATCH /admin/feedbacks/:id/publish (Delegates to publish or unpublish based on body.isPublished)
 */
router.patch('/feedbacks/:id/publish', requireAdminAuth, requireAdminCsrf, requireAdminOrOwner, async (req, res) => {
  const { isPublished } = req.body;
  if (isPublished === false) {
    req.url = `/feedbacks/${req.params.id}/unpublish`;
    return router.handle(req, res);
  } else {
    req.url = `/feedbacks/${req.params.id}/publish`;
    return router.handle(req, res);
  }
});

/**
 * PATCH /admin/feedbacks/:id/status
 * Update resolution status and admin notes (e.g. for suggestions or issues to resolve)
 */
router.patch('/feedbacks/:id/status', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (isNaN(feedbackId)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback ID' });
    }

    const { resolutionStatus, adminNotes } = req.body;
    const validStatuses = ['new', 'in_progress', 'resolved', 'archived'];
    if (!validStatuses.includes(resolutionStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const isResolved = resolutionStatus === 'resolved';
    const adminUser = req.adminUser?.username || 'admin';

    const result = await pool.query(`
      UPDATE platform_feedbacks
      SET 
        resolution_status = $1,
        admin_notes = COALESCE($2, admin_notes),
        resolved_at = (CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END),
        resolved_by = (CASE WHEN $3 THEN $4 ELSE NULL END)
      WHERE id = $5
      RETURNING *;
    `, [
      resolutionStatus,
      adminNotes !== undefined ? adminNotes : null,
      isResolved,
      adminUser,
      feedbackId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feedback record not found.' });
    }

    try {
      broadcastAdminEvent('feedback.updated', { feedbackId });
    } catch (_) {}

    return res.json({
      success: true,
      feedback: result.rows[0],
      message: `Feedback status updated to ${resolutionStatus}.`
    });
  } catch (err) {
    console.error('Update feedback status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update feedback status.' });
  }
});

export default router;
