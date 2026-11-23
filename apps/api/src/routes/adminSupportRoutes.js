import express from 'express';
import {
  parseCookies,
  verifyAdminSession,
  verifyCsrfToken,
  getClientIp
} from '../utils/adminSecurity.js';
import { pool } from '../config/db.js';
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
    console.log('[adminSupportRoutes] No admin_session cookie in:', req.headers.cookie);
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const sessionCheck = await verifyAdminSession(sessionId);
  if (!sessionCheck.valid || !sessionCheck.user) {
    console.log('[adminSupportRoutes] sessionCheck failed:', sessionCheck);
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }

  req.adminUser = sessionCheck.user;
  next();
}

/**
 * 1. GET /admin/support/tickets
 * Query and filter tickets with summary metrics and SLA countdowns
 */
router.get('/tickets', requireAdminAuth, async (req, res) => {
  try {
    const {
      status = 'all',
      sender_role = 'all',
      search = '',
      page = 1,
      limit = 50
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (sender_role && sender_role !== 'all') {
      conditions.push(`sender_role = $${paramIndex++}`);
      params.push(sender_role);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(ticket_code) LIKE $${paramIndex} OR
        LOWER(sender_name) LIKE $${paramIndex} OR
        LOWER(sender_email) LIKE $${paramIndex} OR
        LOWER(subject) LIKE $${paramIndex} OR
        LOWER(description) LIKE $${paramIndex}
      )`);
      params.push(searchTerm);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    // Query tickets
    const query = `
      SELECT 
        id,
        ticket_code,
        sender_role,
        sender_id,
        sender_name,
        sender_email,
        sender_phone,
        category,
        subject,
        description,
        attachment_path,
        attachment_name,
        attachment_mime,
        attachment_size,
        priority,
        status,
        sla_hours,
        sla_deadline,
        solution,
        admin_notes,
        resolved_by,
        resolved_at,
        created_at,
        updated_at,
        ROUND(EXTRACT(EPOCH FROM (sla_deadline - CURRENT_TIMESTAMP)) / 3600, 1) AS sla_remaining_hours,
        CASE
          WHEN status IN ('resolved', 'closed') THEN 'completed'
          WHEN CURRENT_TIMESTAMP > sla_deadline THEN 'breached'
          WHEN EXTRACT(EPOCH FROM (sla_deadline - CURRENT_TIMESTAMP)) <= 86400 THEN 'urgent_approaching'
          ELSE 'on_track'
        END AS sla_urgency
      FROM support_tickets
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN status = 'open' THEN 1
          WHEN status = 'in_progress' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    params.push(parseInt(limit, 10), offset);

    const result = await pool.query(query, params);

    // Compute high-level metrics
    const summaryRes = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND CURRENT_TIMESTAMP > sla_deadline) AS breached,
        COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND EXTRACT(EPOCH FROM (sla_deadline - CURRENT_TIMESTAMP)) BETWEEN 0 AND 86400) AS approaching_deadline
      FROM support_tickets;
    `);

    const summary = summaryRes.rows[0];

    // Broadcast real-time update to admin desk
    try {
      broadcastAdminEvent('support.ticket_updated', {
        ticketId: updated.id,
        ticketCode: updated.ticket_code,
        status: updated.status,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.json({
      success: true,
      tickets: result.rows,
      summary: {
        total: parseInt(summary.total || 0, 10),
        open: parseInt(summary.open || 0, 10),
        inProgress: parseInt(summary.in_progress || 0, 10),
        resolved: parseInt(summary.resolved || 0, 10),
        breached: parseInt(summary.breached || 0, 10),
        approachingDeadline: parseInt(summary.approaching_deadline || 0, 10)
      }
    });
  } catch (err) {
    console.error('Error fetching admin support tickets:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve support tickets.' });
  }
});

/**
 * 2. GET /admin/support/tickets/:id
 * Retrieve a specific ticket for inspection
 */
router.get('/tickets/:id', requireAdminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }

    const query = `
      SELECT 
        *,
        ROUND(EXTRACT(EPOCH FROM (sla_deadline - CURRENT_TIMESTAMP)) / 3600, 1) AS sla_remaining_hours,
        CASE
          WHEN status IN ('resolved', 'closed') THEN 'completed'
          WHEN CURRENT_TIMESTAMP > sla_deadline THEN 'breached'
          WHEN EXTRACT(EPOCH FROM (sla_deadline - CURRENT_TIMESTAMP)) <= 86400 THEN 'urgent_approaching'
          ELSE 'on_track'
        END AS sla_urgency
      FROM support_tickets
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await pool.query(query, [ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Fetch timeline updates
    const updatesRes = await pool.query(
      `SELECT id, update_type, sender_type, sender_name, message, attachment_path, attachment_name, attachment_mime, created_at 
       FROM support_ticket_updates 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC;`,
      [ticketId]
    );

    // Broadcast real-time update to admin desk
    try {
      broadcastAdminEvent('support.ticket_updated', {
        ticketId: updated.id,
        ticketCode: updated.ticket_code,
        status: updated.status,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.json({
      success: true,
      ticket: {
        ...result.rows[0],
        timeline: updatesRes.rows || []
      }
    });
  } catch (err) {
    console.error('Error loading ticket details:', err);
    return res.status(500).json({ success: false, error: 'Failed to load ticket details' });
  }
});

/**
 * 3. PATCH /admin/support/tickets/:id/resolve
 * Resolve a ticket and record the solution provided
 */
router.patch('/tickets/:id/resolve', requireAdminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }

    // CSRF Check for mutative action
    const csrfToken = req.headers['x-csrf-token'];
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.admin_session;
    if (!verifyCsrfToken(sessionId, csrfToken)) {
      return res.status(403).json({ success: false, error: 'Invalid or missing CSRF token' });
    }

    const {
      status = 'resolved',
      solution,
      admin_notes
    } = req.body;

    if (status === 'resolved' && (!solution || !solution.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a clear resolution/solution description for the user or professional.'
      });
    }

    // Check existing ticket
    const checkRes = await pool.query('SELECT * FROM support_tickets WHERE id = $1;', [ticketId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Support ticket not found.' });
    }
    const existing = checkRes.rows[0];

    const isResolving = status === 'resolved';
    const resolvedBy = isResolving ? req.adminUser.username : existing.resolved_by;
    const resolvedAt = isResolving ? new Date() : existing.resolved_at;

    const updateQuery = `
      UPDATE support_tickets
      SET 
        status = $1,
        solution = COALESCE($2, solution),
        admin_notes = COALESCE($3, admin_notes),
        resolved_by = $4,
        resolved_at = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *;
    `;

    const updateRes = await pool.query(updateQuery, [
      status,
      solution ? solution.trim() : null,
      admin_notes ? admin_notes.trim() : null,
      resolvedBy,
      resolvedAt,
      ticketId
    ]);

    const updated = updateRes.rows[0];

    // Record resolution update in timeline
    if (isResolving && solution) {
      try {
        await pool.query(`
          INSERT INTO support_ticket_updates (
            ticket_id,
            update_type,
            sender_type,
            sender_name,
            message
          ) VALUES ($1, 'resolution', 'admin', $2, $3);
        `, [ticketId, req.adminUser.username, solution.trim()]);
      } catch (timelineErr) {
        console.warn('Failed to insert resolution update in timeline:', timelineErr.message);
      }
    }

    // Audit log
    try {
      await pool.query(`
        INSERT INTO admin_audit_log (
          admin_user,
          action,
          target_type,
          target_id,
          ip_address,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        req.adminUser.username,
        isResolving ? 'support_ticket_resolved' : 'support_ticket_updated',
        'support_ticket',
        String(updated.id),
        getClientIp(req),
        JSON.stringify({
          ticket_code: updated.ticket_code,
          category: updated.category,
          status: updated.status,
          solution_length: (solution || '').length
        })
      ]);
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message);
    }

    // Fetch full timeline
    const updatesRes = await pool.query(
      `SELECT id, update_type, sender_type, sender_name, message, attachment_path, attachment_name, attachment_mime, created_at 
       FROM support_ticket_updates 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC;`,
      [ticketId]
    );

    // Broadcast real-time update to admin desk
    try {
      broadcastAdminEvent('support.ticket_updated', {
        ticketId: updated.id,
        ticketCode: updated.ticket_code,
        status: updated.status,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: isResolving
        ? `Ticket ${updated.ticket_code} resolved successfully with verified solution.`
        : `Ticket ${updated.ticket_code} updated to ${status}.`,
      ticket: {
        ...updated,
        timeline: updatesRes.rows || []
      }
    });
  } catch (err) {
    console.error('Error resolving support ticket:', err);
    return res.status(500).json({ success: false, error: 'Failed to resolve support ticket.' });
  }
});

/**
 * 4. POST /admin/support/tickets/:id/request-info
 * Request additional information or photo from complainant
 */
router.post('/tickets/:id/request-info', requireAdminAuth, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Please enter the information or photo request description.' });
    }

    const checkRes = await pool.query('SELECT * FROM support_tickets WHERE id = $1;', [ticketId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Support ticket not found.' });
    }

    // Update ticket: set status to in_progress with info request message
    await pool.query(`
      UPDATE support_tickets 
      SET status = 'in_progress',
          info_requested_message = $1,
          info_requested_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [message.trim(), ticketId]);

    // Insert into support_ticket_updates
    await pool.query(`
      INSERT INTO support_ticket_updates (
        ticket_id,
        update_type,
        sender_type,
        sender_name,
        message
      ) VALUES ($1, 'info_request', 'admin', $2, $3);
    `, [ticketId, req.adminUser.username, message.trim()]);

    // Fetch updated ticket with timeline
    const updatedTicket = (await pool.query('SELECT * FROM support_tickets WHERE id = $1;', [ticketId])).rows[0];
    const timeline = (await pool.query('SELECT * FROM support_ticket_updates WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId])).rows;

    // Broadcast real-time update to admin desk
    try {
      broadcastAdminEvent('support.ticket_updated', {
        ticketId: updated.id,
        ticketCode: updated.ticket_code,
        status: updated.status,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Information request sent successfully to complainant.',
      ticket: { ...updatedTicket, timeline }
    });
  } catch (err) {
    console.error('Error requesting info for support ticket:', err);
    return res.status(500).json({ success: false, error: 'Failed to request information.' });
  }
});

export default router;
