import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { broadcastAdminEvent } from '../modules/realtime/adminRealtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads directory for support attachments
const SUPPORT_UPLOAD_DIR = path.join(__dirname, '../../uploads/support_attachments');
if (!fs.existsSync(SUPPORT_UPLOAD_DIR)) {
  fs.mkdirSync(SUPPORT_UPLOAD_DIR, { recursive: true });
}

const router = Router();

// Allowed image and document MIME types
const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

/**
 * 0. GET /api/support/active-ticket
 * Check if the user/professional currently has an open or in-progress ticket under process
 */
router.get('/active-ticket', async (req, res) => {
  try {
    const rawEmail = (req.query.email || '').trim().toLowerCase();
    const rawPhone = (req.query.phone || '').replace(/\D/g, '');
    const senderId = req.query.sender_id ? parseInt(req.query.sender_id, 10) : null;
    const senderRole = (req.query.role || '').trim().toLowerCase();

    if (!rawEmail && !rawPhone && !senderId) {
      return res.json({ success: true, hasActiveTicket: false, ticket: null });
    }

    const query = `
      SELECT 
        id,
        ticket_code,
        sender_role,
        sender_name,
        sender_email,
        sender_phone,
        category,
        subject,
        description,
        attachment_path,
        attachment_name,
        status,
        info_requested_message,
        info_requested_at,
        info_responded_at,
        created_at,
        updated_at
      FROM support_tickets
      WHERE status IN ('open', 'in_progress')
        AND (
          (LOWER(sender_email) = $1 AND $1 != '')
          OR ($2 != '' AND sender_phone IS NOT NULL AND RIGHT(regexp_replace(sender_phone, '\\D', '', 'g'), 10) = RIGHT($2, 10))
          OR ($3::BIGINT IS NOT NULL AND sender_id = $3::BIGINT AND ($4 = '' OR sender_role = $4))
        )
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [
      rawEmail,
      rawPhone,
      senderId,
      senderRole
    ]);

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        hasActiveTicket: true,
        ticket: result.rows[0]
      });
    }

    return res.json({
      success: true,
      hasActiveTicket: false,
      ticket: null
    });
  } catch (err) {
    console.error('Error checking active support ticket:', err);
    return res.status(500).json({ success: false, error: 'Error checking active ticket status.' });
  }
});

/**
 * 1. POST /api/support/tickets
 * Generate a new help & support ticket with optional photo/document attachment
 */
router.post('/tickets', async (req, res) => {
  try {
    const {
      sender_role = 'customer',
      sender_id = null,
      sender_name,
      sender_email,
      sender_phone = null,
      category,
      subject,
      description,
      priority = 'normal',
      attachment = null // { base64Data, filename, mimeType }
    } = req.body;

    // Validation
    if (!sender_name || !sender_name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!sender_email || !sender_email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required' });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, error: 'Problem category is required' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!description || description.trim().length < 8) {
      return res.status(400).json({ success: false, error: 'Please describe the problem in more detail (at least 8 characters)' });
    }

    // Process attachment if provided
    let attachmentPath = null;
    let attachmentName = null;
    let attachmentMime = null;
    let attachmentSize = 0;

    if (attachment && attachment.base64Data) {
      let mimeType = (attachment.mimeType || '').toLowerCase();
      let rawBase64 = attachment.base64Data;

      const dataUriMatch = attachment.base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1].toLowerCase();
        rawBase64 = dataUriMatch[2];
      }

      if (!ALLOWED_MIME_TYPES[mimeType]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file format. Only JPEG, PNG, WEBP, and PDF files are accepted.'
        });
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: `Attachment size exceeds the 10MB limit. Current: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`
        });
      }

      const ext = ALLOWED_MIME_TYPES[mimeType] || 'jpg';
      const safeRandomName = `ticket-attachment-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const destinationPath = path.join(SUPPORT_UPLOAD_DIR, safeRandomName);

      fs.writeFileSync(destinationPath, buffer);

      attachmentPath = `/uploads/support_attachments/${safeRandomName}`;
      attachmentName = attachment.filename || safeRandomName;
      attachmentMime = mimeType;
      attachmentSize = buffer.length;
    }

    // Generate unique sequential ticket code (Format: 2026000001)
    const seqRes = await pool.query("SELECT nextval('support_ticket_seq') AS seq;");
    const seqNum = seqRes.rows[0].seq;
    const year = new Date().getFullYear();
    const ticketCode = `${year}${String(seqNum).padStart(6, '0')}`;

    // SLA is 72 hours from now
    const slaHours = 72;
    const slaDeadlineRes = await pool.query(
      "SELECT (CURRENT_TIMESTAMP + ($1 || ' hours')::INTERVAL) AS deadline;",
      [slaHours]
    );
    const slaDeadline = slaDeadlineRes.rows[0].deadline;

    // Smart role detection: verify whether the sender is a professional in the database
    let resolvedRole = (sender_role || 'customer').toLowerCase();
    let resolvedId = sender_id || null;

    if (resolvedRole !== 'professional') {
      const cleanEmail = (sender_email || '').toLowerCase().trim();
      const cleanPhone = sender_phone ? sender_phone.replace(/\D/g, '') : '';
      const cleanName = (sender_name || '').trim();

      const proCheck = await pool.query(
        `SELECT id, name FROM professionals 
         WHERE LOWER(email) = $1 
            OR (phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') = $2 AND $2 != '')
            OR name ILIKE $3
            OR $4 ILIKE '%professional%'
         LIMIT 1`,
        [cleanEmail, cleanPhone, cleanName, cleanName]
      );

      if (proCheck.rows.length > 0) {
        resolvedRole = 'professional';
        resolvedId = resolvedId || proCheck.rows[0].id;
      }
    }

    // Check if user already has an active, unresolved ticket under process
    const cleanEmail = (sender_email || '').toLowerCase().trim();
    const cleanPhone = sender_phone ? sender_phone.replace(/\D/g, '') : '';

    const activeCheck = await pool.query(
      `SELECT id, ticket_code, status, subject, category, created_at 
       FROM support_tickets 
       WHERE status IN ('open', 'in_progress')
         AND (
           (LOWER(sender_email) = $1 AND $1 != '')
           OR ($2 != '' AND sender_phone IS NOT NULL AND RIGHT(regexp_replace(sender_phone, '\\D', '', 'g'), 10) = RIGHT($2, 10))
           OR ($3::BIGINT IS NOT NULL AND sender_id = $3::BIGINT AND sender_role = $4)
         )
       ORDER BY created_at DESC
       LIMIT 1;`,
      [cleanEmail, cleanPhone, resolvedId, resolvedRole]
    );

    if (activeCheck.rows.length > 0) {
      const activeTicket = activeCheck.rows[0];
      return res.status(409).json({
        success: false,
        error: `You already have an active ticket under process (${activeTicket.ticket_code}). You can generate a new ticket once this request is resolved.`,
        activeTicket: {
          id: activeTicket.id,
          ticket_code: activeTicket.ticket_code,
          status: activeTicket.status,
          subject: activeTicket.subject,
          category: activeTicket.category,
          created_at: activeTicket.created_at
        }
      });
    }

    const insertQuery = `
      INSERT INTO support_tickets (
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
        sla_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', $15, $16)
      RETURNING *;
    `;

    const insertRes = await pool.query(insertQuery, [
      ticketCode,
      resolvedRole,
      resolvedId,
      sender_name.trim(),
      sender_email.toLowerCase().trim(),
      sender_phone ? sender_phone.trim() : null,
      category.trim(),
      subject.trim(),
      description.trim(),
      attachmentPath,
      attachmentName,
      attachmentMime,
      attachmentSize,
      priority,
      slaHours,
      slaDeadline
    ]);

    const createdTicket = insertRes.rows[0];

    // Broadcast ticket creation in real-time to admin desk
    try {
      broadcastAdminEvent('support.ticket_created', {
        ticketId: createdTicket.id,
        ticketCode: createdTicket.ticket_code,
        status: createdTicket.status,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: 'Support ticket generated successfully. Guaranteed resolution within 24–72 hours.',
      ticket: {
        id: createdTicket.id,
        ticket_code: createdTicket.ticket_code,
        status: createdTicket.status,
        category: createdTicket.category,
        subject: createdTicket.subject,
        sla_hours: createdTicket.sla_hours,
        sla_deadline: createdTicket.sla_deadline,
        created_at: createdTicket.created_at,
        attachment_path: createdTicket.attachment_path
      }
    });
  } catch (err) {
    console.error('Error generating support ticket:', err);
    return res.status(500).json({ success: false, error: 'Internal server error while generating support ticket.' });
  }
});

/**
 * 2. GET /api/support/tickets/track/:code
 * Track status and solution of a generated ticket
 */
router.get('/tickets/track/:code', async (req, res) => {
  try {
    const rawCode = (req.params.code || '').trim().toUpperCase();
    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'Ticket code is required' });
    }

    // Normalized numeric code (e.g. 2026000001)
    const normalizedDigits = rawCode.replace(/\D/g, '');

    const query = `
      SELECT 
        id,
        ticket_code,
        sender_role,
        sender_name,
        category,
        subject,
        description,
        attachment_path,
        attachment_name,
        priority,
        status,
        sla_hours,
        sla_deadline,
        solution,
        resolved_at,
        info_requested_message,
        info_requested_at,
        info_responded_at,
        created_at,
        updated_at
      FROM support_tickets
      WHERE ticket_code = $1 OR ticket_code = $2
      LIMIT 1;
    `;
    const result = await pool.query(query, [rawCode, normalizedDigits]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Support ticket not found with this code.' });
    }

    const ticket = result.rows[0];
    const updatesRes = await pool.query(
      `SELECT id, update_type, sender_type, sender_name, message, attachment_path, attachment_name, attachment_mime, created_at 
       FROM support_ticket_updates 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC;`,
      [ticket.id]
    );

    return res.json({
      success: true,
      ticket: {
        ...ticket,
        timeline: updatesRes.rows || []
      }
    });
  } catch (err) {
    console.error('Error tracking ticket:', err);
    return res.status(500).json({ success: false, error: 'Error checking ticket status.' });
  }
});

/**
 * 2.5 POST /api/support/tickets/:code/reply
 * Submit additional explanation or photo/document in response to support request
 */
router.post('/tickets/:code/reply', async (req, res) => {
  try {
    const rawCode = (req.params.code || '').trim().toUpperCase();
    const normalizedDigits = rawCode.replace(/\D/g, '');
    const { message, attachment } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Please provide your explanation or additional details.' });
    }

    const checkRes = await pool.query(
      'SELECT * FROM support_tickets WHERE ticket_code = $1 OR ticket_code = $2 LIMIT 1;',
      [rawCode, normalizedDigits]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    const ticket = checkRes.rows[0];
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(400).json({ success: false, error: 'This ticket has already been resolved.' });
    }

    // Process attachment if provided
    let attachmentPath = null;
    let attachmentName = null;
    let attachmentMime = null;

    if (attachment && attachment.base64Data) {
      let mimeType = (attachment.mimeType || '').toLowerCase();
      let rawBase64 = attachment.base64Data;

      const dataUriMatch = attachment.base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1].toLowerCase();
        rawBase64 = dataUriMatch[2];
      }

      if (!ALLOWED_MIME_TYPES[mimeType]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file format. Only JPEG, PNG, WEBP, and PDF files are accepted.'
        });
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: `Attachment size exceeds the 10MB limit. Current: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`
        });
      }

      const ext = ALLOWED_MIME_TYPES[mimeType] || 'jpg';
      const safeRandomName = `reply-attachment-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const destinationPath = path.join(SUPPORT_UPLOAD_DIR, safeRandomName);
      fs.writeFileSync(destinationPath, buffer);

      attachmentPath = `/uploads/support_attachments/${safeRandomName}`;
      attachmentName = attachment.filename || safeRandomName;
      attachmentMime = mimeType;
    }

    // Insert user reply into support_ticket_updates
    await pool.query(`
      INSERT INTO support_ticket_updates (
        ticket_id,
        update_type,
        sender_type,
        sender_name,
        message,
        attachment_path,
        attachment_name,
        attachment_mime
      ) VALUES ($1, 'user_reply', 'user', $2, $3, $4, $5, $6);
    `, [
      ticket.id,
      ticket.sender_name,
      message.trim(),
      attachmentPath,
      attachmentName,
      attachmentMime
    ]);

    // Update ticket state: info_responded_at, status='in_progress'
    await pool.query(`
      UPDATE support_tickets 
      SET status = 'in_progress',
          info_responded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [ticket.id]);

    // Fetch updated ticket with timeline
    const updatedTicket = (await pool.query('SELECT * FROM support_tickets WHERE id = $1;', [ticket.id])).rows[0];
    const timeline = (await pool.query('SELECT * FROM support_ticket_updates WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticket.id])).rows;

    // Broadcast ticket reply in real-time to admin desk
    try {
      broadcastAdminEvent('support.ticket_updated', {
        ticketId: ticket.id,
        ticketCode: ticket.ticket_code,
        status: 'in_progress',
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Additional information and photo submitted successfully.',
      ticket: { ...updatedTicket, timeline }
    });
  } catch (err) {
    console.error('Error submitting reply to ticket:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit additional information.' });
  }
});

/**
 * 3. GET /api/support/attachments/:filename
 * Safely stream support attachment
 */
router.get('/attachments/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(SUPPORT_UPLOAD_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Error streaming attachment:', err);
    return res.status(500).json({ success: false, error: 'Could not load attachment' });
  }
});

export default router;
