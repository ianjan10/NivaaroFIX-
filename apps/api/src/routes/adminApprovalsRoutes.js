import express from 'express';
import {
  parseCookies,
  verifyAdminSession,
  verifyCsrfToken,
  getClientIp
} from '../utils/adminSecurity.js';
import { ApprovalsService } from '../modules/verification/approvalsService.js';
import { readDecryptedDocument } from '../modules/verification/utils/fileCrypto.js';
import { broadcastAdminEvent } from '../modules/realtime/adminRealtime.js';
import { pool } from '../config/db.js';

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
      error: 'Access denied: Verifiers do not have permission to view customer records.'
    });
  }
  next();
}

// -----------------------------------------------------------------------------
// 1. Queue Summary Statistics
// -----------------------------------------------------------------------------
router.get(['/approvals/summary', '/approvals/professionals/summary'], requireAdminAuth, async (req, res) => {
  try {
    const summary = await ApprovalsService.getQueueSummary();
    res.json(summary);
  } catch (err) {
    console.error('Error fetching queue summary:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 2. Reason Templates List
// -----------------------------------------------------------------------------
router.get('/approvals/reason-templates', requireAdminAuth, async (req, res) => {
  try {
    const templateRes = await pool.query(
      'SELECT code, label, professional_message, applies_to FROM verification_reason_templates WHERE is_active = TRUE ORDER BY id ASC;'
    );
    res.json({ success: true, templates: templateRes.rows });
  } catch (err) {
    console.error('Error fetching reason templates:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 3. FIFO Professional Queue List
// -----------------------------------------------------------------------------
router.get(['/approvals/queue', '/approvals/professionals'], requireAdminAuth, async (req, res) => {
  try {
    const { filter, trade, search, q, sort, cursor, limit } = req.query;
    const queueData = await ApprovalsService.getQueue({
      filter: filter || 'all',
      trade: trade || null,
      search: search || q || null,
      sort: sort || 'oldest',
      cursor: cursor || null,
      limit: parseInt(limit, 10) || 25,
      adminUser: req.adminUser
    });

    res.json({
      success: true,
      ...queueData
    });
  } catch (err) {
    console.error('Error fetching professional queue:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Awaiting submission queue
router.get('/approvals/queue/awaiting', requireAdminAuth, async (req, res) => {
  try {
    const { trade, search, q, cursor, limit } = req.query;
    const data = await ApprovalsService.getAwaitingSubmissionQueue({
      trade: trade || null,
      search: search || q || null,
      cursor: cursor || null,
      limit: parseInt(limit, 10) || 25
    });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Error fetching awaiting queue:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Primary action: Review next unclaimed request
router.get('/approvals/review-next', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id FROM verification_requests
       WHERE status = 'pending'
         AND (claimed_by_admin_id IS NULL OR claimed_until < NOW())
       ORDER BY queued_at ASC
       LIMIT 1;`
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No unclaimed pending requests' });
    }
    const requestId = result.rows[0].id;
    // Auto-claim for current admin
    await ApprovalsService.claimRequest(requestId, req.adminUser);
    res.json({ success: true, requestId });
  } catch (err) {
    console.error('Error finding next review:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 4. Single Professional Verification Request Details
// -----------------------------------------------------------------------------
router.get(['/approvals/requests/:id', '/approvals/professionals/:id'], requireAdminAuth, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const details = await ApprovalsService.getRequestDetails(requestId, req.adminUser);

    if (!details) {
      return res.status(404).json({ success: false, error: 'Verification request not found' });
    }

    res.json({ success: true, ...details });
  } catch (err) {
    console.error('Error fetching request details:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 5. Claim Exclusive Review Lock (10 minutes)
// -----------------------------------------------------------------------------
router.post(['/approvals/requests/:id/claim', '/approvals/professionals/:id/claim'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const forceTakeover = req.body?.forceTakeover === true;
    const result = await ApprovalsService.claimRequest(requestId, req.adminUser, forceTakeover);

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    broadcastAdminEvent('verification.claimed', {
      requestId,
      claimedBy: req.adminUser.username,
      claimedUntil: result.claimedUntil
    });

    res.json(result);
  } catch (err) {
    console.error('Error claiming request:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 6. Release Active Claim Lock
// -----------------------------------------------------------------------------
router.post(['/approvals/requests/:id/release', '/approvals/professionals/:id/release'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const result = await ApprovalsService.releaseClaim(requestId, req.adminUser);

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    broadcastAdminEvent('verification.released', { requestId });

    res.json(result);
  } catch (err) {
    console.error('Error releasing claim:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 7. Claim Heartbeat Extension (Renew 10 minutes)
// -----------------------------------------------------------------------------
router.post(['/approvals/requests/:id/heartbeat', '/approvals/professionals/:id/heartbeat'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const result = await ApprovalsService.heartbeatClaim(requestId, req.adminUser);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('Error in claim heartbeat:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 7.5. Update Individual Verification Item Status in Realtime
// -----------------------------------------------------------------------------
router.post(['/approvals/requests/:id/items/:itemType', '/approvals/professionals/:id/items/:itemType'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { itemType } = req.params;
    const { status, reasonCode, reasonNote } = req.body || {};

    const updatedItem = await ApprovalsService.updateItemReview(
      requestId,
      itemType,
      { status, reasonCode, reasonNote },
      req.adminUser
    );

    res.json({ success: true, item: updatedItem });
  } catch (err) {
    console.error('Error updating item review:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 8. Submit Administrative Decision (Approve, Request Re-upload, Reject)
// -----------------------------------------------------------------------------
router.post(['/approvals/requests/:id/decision', '/approvals/professionals/:id/decision'], requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { decision, items, decisionNote, version, aadhaarNumber, aadhaarLast4 } = req.body || {};

    const reqMeta = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    };

    const result = await ApprovalsService.submitDecision(
      requestId,
      { decision, items, decisionNote, version, aadhaarNumber, aadhaarLast4 },
      req.adminUser,
      reqMeta
    );

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    broadcastAdminEvent('verification.decided', {
      requestId,
      decision,
      decidedBy: req.adminUser.username
    });
    broadcastAdminEvent('approvals.updated', { requestId, decision });
    broadcastAdminEvent('professionals.updated', { requestId, decision });

    res.json(result);
  } catch (err) {
    console.error('Error submitting decision:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 9. Document View Signed URL Issuance & Direct Streaming
// -----------------------------------------------------------------------------
router.get(['/documents/:id/view-url', '/approvals/documents/:id/view-url'], requireAdminAuth, async (req, res) => {
  try {
    const docId = parseInt(req.params.id, 10);
    const fileType = req.query.type === 'photo' ? 'photo' : 'document';
    const reqMeta = {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    };

    const signedUrl = await ApprovalsService.createDocumentViewUrl(docId, fileType, req.adminUser, reqMeta);
    res.json({ success: true, url: signedUrl });
  } catch (err) {
    console.error('Error creating document signed url:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get(['/documents/:id/stream', '/approvals/documents/:id/stream'], requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const fileType = req.query.type === 'photo' ? 'photo' : 'document';
    let row = null;
    if (fileType === 'photo') {
      const dbRes = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_photos WHERE id = $1', [id]);
      if (dbRes.rows.length > 0) row = dbRes.rows[0];
    } else {
      const dbRes = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_documents WHERE id = $1', [id]);
      if (dbRes.rows.length > 0) row = dbRes.rows[0];
    }
    if (!row || !row.encrypted_file_path) {
      return res.status(404).send('Document not found.');
    }
    const buffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (err) {
    console.error('Error streaming document directly:', err);
    res.status(500).send('Internal Server Error');
  }
});

// -----------------------------------------------------------------------------
// 10. Serve Decrypted Document via Signed Token
// -----------------------------------------------------------------------------
router.get('/documents/view/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const doc = await ApprovalsService.getDecryptedDocumentStream(token);

    if (!doc) {
      return res.status(403).send('Invalid or unauthorized document token.');
    }
    if (doc.expired) {
      return res.status(403).send('Document preview token has expired. Please refresh the page.');
    }

    // Audit document access on retrieval
    if (doc.adminId) {
      try {
        await logAdminAudit({
          adminUserId: doc.adminId,
          action: 'document_viewed',
          targetType: doc.fileType,
          targetId: String(doc.id),
          result: 'success',
          ip: getClientIp(req) || null,
          userAgent: req.headers['user-agent'] || null,
          details: { fileType: doc.fileType, mimeType: doc.mimeType }
        });
      } catch (_) {}
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(doc.buffer);
  } catch (err) {
    console.error('Error serving decrypted document:', err);
    res.status(500).send('Internal Server Error');
  }
});

// -----------------------------------------------------------------------------
// 10b. Explicit Document View Audit (File open / file change)
// -----------------------------------------------------------------------------
router.post('/documents/audit-view', requireAdminAuth, async (req, res) => {
  try {
    const { documentId, documentType, professionalId, customerId } = req.body || {};
    await logAdminAudit({
      adminUserId: req.adminUser.id,
      action: 'document_viewed',
      targetType: documentType || 'document',
      targetId: String(documentId || professionalId || customerId || 'unknown'),
      result: 'success',
      ip: getClientIp(req) || null,
      userAgent: req.headers['user-agent'] || null,
      details: {
        documentType,
        documentId,
        professionalId,
        customerId,
        timestamp: new Date().toISOString()
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging document view audit:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 11. View-Only Customer Registry
// -----------------------------------------------------------------------------
router.get('/approvals/customers', requireAdminAuth, requireCustomerRole, async (req, res) => {
  try {
    const { filter, search, sort, cursor, limit } = req.query;
    const customers = await ApprovalsService.getCustomers({
      filter: filter || 'all',
      search: search || null,
      sort: sort || 'newest',
      cursor: cursor || null,
      limit: parseInt(limit, 10) || 25
    });

    res.json({ success: true, customers });
  } catch (err) {
    console.error('Error fetching customers registry:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 12. Single Customer Details (Marks admin_seen_at)
// -----------------------------------------------------------------------------
router.get('/approvals/customers/:id', requireAdminAuth, requireCustomerRole, async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const details = await ApprovalsService.getCustomerDetails(customerId, req.adminUser);

    if (!details) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({ success: true, customer: details });
  } catch (err) {
    console.error('Error fetching customer details:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// -----------------------------------------------------------------------------
// 13. Audited PII Reveal Action (Phone / Email)
// -----------------------------------------------------------------------------
router.post('/pii/reveal', requireAdminAuth, requireAdminCsrf, async (req, res) => {
  try {
    const rawTargetType = req.body?.targetType || req.body?.entityType;
    const rawTargetId = req.body?.targetId || req.body?.entityId;
    const { field, reason } = req.body || {};

    // Verifiers cannot reveal customer PII
    if (rawTargetType === 'customer' && req.adminUser.role === 'verifier') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const reqMeta = {
      ip: getClientIp(req),
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
