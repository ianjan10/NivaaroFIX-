import { Router } from 'express';
import { VerificationService } from '../modules/verification/verificationService.js';
import { ApprovalsService } from '../modules/verification/approvalsService.js';
import {
  readDecryptedDocument,
  verifySignedFileUrl
} from '../modules/verification/utils/fileCrypto.js';
import { pool } from '../config/db.js';
import { validateSession, parseCookies } from '../utils/security.js';

const router = Router();

// Middleware to extract authenticated professional or admin from cookie / header
async function authenticateUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies.nivaarofix_session || req.headers['x-session-token'];

    if (sessionToken) {
      const session = await validateSession(sessionToken);
      if (session) {
        req.user = session;
        return next();
      }
    }

    // Header fallback for programmatic testing (x-pro-id or x-user-email)
    const proId = req.headers['x-pro-id'];
    const email = req.headers['x-user-email'];

    if (proId) {
      const proRes = await pool.query('SELECT id, name, email FROM professionals WHERE id = $1 LIMIT 1;', [proId]);
      if (proRes.rows.length > 0) {
        req.user = { id: proRes.rows[0].id, role: 'professional', email: proRes.rows[0].email, name: proRes.rows[0].name };
        return next();
      }
    } else if (email) {
      const uRes = await pool.query('SELECT id, email, role FROM users WHERE email = $1 LIMIT 1;', [email]);
      if (uRes.rows.length > 0) {
        req.user = uRes.rows[0];
        return next();
      }
    }

    req.user = null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

/**
 * Robust helper to resolve professional database row from any available identifier
 * (session, header, explicit professionalId, partnerId, or email).
 */
export async function resolveProfessional(req) {
  const rawId = req.headers['x-pro-id'] || req.body?.professionalId || req.body?.proId || req.query?.professionalId || req.query?.id || req.query?.proId || req.query?.partnerId || req.user?.agent?.partner_id || req.user?.agent?.id || req.user?.id;
  const rawEmail = req.headers['x-user-email'] || req.body?.email || req.query?.email || req.user?.agent?.email || req.user?.email || req.user?.session?.email;
  const rawCode = req.body?.professionalCode || req.query?.professionalCode || req.query?.proCode || req.query?.code || req.user?.agent?.partner_id || req.user?.agent?.partnerId;

  // 1. Try matching professionals.id directly
  if (rawId && !isNaN(Number(rawId))) {
    const pRes = await pool.query('SELECT id, professional_code, name, email, account_status, suspended_until, kyc_status FROM professionals WHERE id = $1 LIMIT 1;', [rawId]);
    if (pRes.rows.length > 0) return pRes.rows[0];
  }

  // 2. Try matching professional_code
  const candidateCode = rawCode || (rawId && String(rawId).startsWith('2026') ? rawId : null);
  if (candidateCode) {
    const pCode = await pool.query('SELECT id, professional_code, name, email, account_status, suspended_until, kyc_status FROM professionals WHERE professional_code = $1 LIMIT 1;', [candidateCode]);
    if (pCode.rows.length > 0) return pCode.rows[0];
  }

  // 3. Try matching agent_login id to professionals
  if (rawId && !isNaN(Number(rawId))) {
    const aRes = await pool.query('SELECT partner_id, email, name FROM agent_login WHERE id = $1 LIMIT 1;', [rawId]);
    if (aRes.rows.length > 0) {
      const pMatch = await pool.query(
        'SELECT id, professional_code, name, email, account_status, suspended_until, kyc_status FROM professionals WHERE professional_code = $1 OR LOWER(email) = LOWER($2) LIMIT 1;',
        [aRes.rows[0].partner_id, aRes.rows[0].email]
      );
      if (pMatch.rows.length > 0) return pMatch.rows[0];
    }
  }

  // 4. Try matching email
  if (rawEmail) {
    const pEmail = await pool.query('SELECT id, professional_code, name, email, account_status, suspended_until, kyc_status FROM professionals WHERE LOWER(email) = LOWER($1) LIMIT 1;', [String(rawEmail).toLowerCase().trim()]);
    if (pEmail.rows.length > 0) return pEmail.rows[0];
  }

  return null;
}

// -----------------------------------------------------------------------------
// 1. MOBILE VERIFICATION
// -----------------------------------------------------------------------------

/**
 * POST /verification/mobile/send & POST /api/verification/mobile/send
 * Body: { phone }
 */
router.post(['/mobile/send', '/verification/mobile/send'], async (req, res) => {
  try {
    const { phone } = req.body || {};
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const result = await VerificationService.sendMobileOtp({ phone, ipAddress });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('Mobile send error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error while processing mobile verification.' });
  }
});

/**
 * POST /verification/mobile/verify & POST /api/verification/mobile/verify
 * Body: { phone, code, professionalId }
 */
router.post(['/mobile/verify', '/verification/mobile/verify'], async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    const pro = await resolveProfessional(req);
    const professionalId = pro?.id || req.body?.professionalId || null;

    const result = await VerificationService.verifyMobileOtp({ phone, code, professionalId });

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('Mobile verify error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error while verifying mobile code.' });
  }
});

// -----------------------------------------------------------------------------
// 2. DOCUMENT CONSENT & UPLOAD
// -----------------------------------------------------------------------------

/**
 * POST /api/verification/consent
 * Body: { professionalId, consentText }
 */
router.post('/consent', authenticateUser, async (req, res) => {
  try {
    const pro = await resolveProfessional(req);
    const { consentText } = req.body || {};

    if (!pro) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const proId = pro.id;

    if (!consentText || !consentText.includes('agree to NivaaroFix verifying this document')) {
      return res.status(400).json({
        success: false,
        error: 'Mandatory consent statement: "I agree to NivaaroFix verifying this document."'
      });
    }

    const consentAt = new Date();
    await pool.query(`
      INSERT INTO verification_audit_log (professional_id, action, target_type, metadata)
      VALUES ($1, 'consent_recorded', 'document', $2);
    `, [proId, JSON.stringify({ consent_at: consentAt, consent_text: consentText })]);

    return res.json({ success: true, consentAt, message: 'Consent recorded successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/verification/document/upload
 * Body: { professionalId, documentType, fileBase64, consent, profileName, qrBase64, expiryInput }
 */
router.post('/document/upload', authenticateUser, async (req, res) => {
  try {
    const pro = await resolveProfessional(req);
    const { documentType, fileBase64, consent, profileName, qrBase64, expiryInput } = req.body || {};

    if (!pro) {
      return res.status(401).json({ success: false, error: 'Authentication required to upload documents.' });
    }
    const proId = pro.id;

    if (pro.account_status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Your account is permanently banned from NivaaroFix (3 suspension limit reached). You cannot submit documents.'
      });
    }

    if (pro.account_status === 'suspended' && pro.suspended_until && new Date(pro.suspended_until) > new Date()) {
      const suspDate = new Date(pro.suspended_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return res.status(403).json({
        success: false,
        error: `Your account is suspended for 1 week until ${suspDate}. You can re-upload documents once the suspension period ends.`
      });
    }

    if (!fileBase64) {
      return res.status(400).json({ success: false, error: 'File data is required.' });
    }

    // Extract base64 buffer
    let rawBase64 = fileBase64;
    if (fileBase64.includes(',')) {
      rawBase64 = fileBase64.split(',')[1];
    }
    const fileBuffer = Buffer.from(rawBase64, 'base64');

    let qrBuffer = null;
    if (qrBase64) {
      const rawQr = qrBase64.includes(',') ? qrBase64.split(',')[1] : qrBase64;
      qrBuffer = Buffer.from(rawQr, 'base64');
    }

    // Get professional name if not supplied
    const proName = profileName || pro.name || 'Professional';

    const result = await VerificationService.uploadDocument({
      professionalId: proId,
      documentType,
      fileBuffer,
      consent: Boolean(consent),
      profileName: proName,
      qrBuffer,
      expiryInput
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('Document upload error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. LIVE PHOTO UPLOAD
// -----------------------------------------------------------------------------

/**
 * POST /api/verification/photo/upload
 * Body: { professionalId, photoBase64, isUploadFallback }
 */
router.post('/photo/upload', authenticateUser, async (req, res) => {
  try {
    const pro = await resolveProfessional(req);
    const { photoBase64, isUploadFallback, qualityScores } = req.body || {};

    if (!pro) {
      return res.status(401).json({ success: false, error: 'Authentication required to upload live photo.' });
    }
    const proId = pro.id;

    if (pro.account_status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Your account is permanently banned from NivaaroFix (3 suspension limit reached). You cannot upload photo.'
      });
    }

    if (pro.account_status === 'suspended' && pro.suspended_until && new Date(pro.suspended_until) > new Date()) {
      const suspDate = new Date(pro.suspended_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return res.status(403).json({
        success: false,
        error: `Your account is suspended for 1 week until ${suspDate}. You can re-upload live photo once the suspension period ends.`
      });
    }

    if (!photoBase64) {
      return res.status(400).json({ success: false, error: 'Photo data is required.' });
    }

    let rawBase64 = photoBase64;
    if (photoBase64.includes(',')) {
      rawBase64 = photoBase64.split(',')[1];
    }
    const fileBuffer = Buffer.from(rawBase64, 'base64');

    const result = await VerificationService.uploadLivePhoto({
      professionalId: proId,
      fileBuffer,
      isUploadFallback: Boolean(isUploadFallback),
      qualityScores: qualityScores || null
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/verification/photo/stream
 * Streams the decrypted live portrait photo for the professional.
 */
router.get('/photo/stream', async (req, res) => {
  try {
    let proId = req.query.id || req.query.professionalId;
    if (proId) {
      const resolved = await pool.query(
        'SELECT id FROM professionals WHERE id::text = $1 OR professional_code = $1 OR professional_code IN (SELECT partner_id FROM agent_login WHERE id::text = $1 OR partner_id = $1) OR email IN (SELECT email FROM agent_login WHERE id::text = $1 OR partner_id = $1) LIMIT 1;',
        [String(proId)]
      );
      if (resolved.rows.length > 0) {
        proId = resolved.rows[0].id;
      }
    }
    if (!proId) {
      const pro = await resolveProfessional(req);
      proId = pro?.id;
    }
    if (!proId) {
      return res.status(400).send('Professional ID required.');
    }

    const q = await pool.query(
      'SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_photos WHERE professional_id = $1 ORDER BY id DESC LIMIT 1;',
      [proId]
    );
    if (q.rows.length === 0 || !q.rows[0].encrypted_file_path) {
      return res.status(404).send('Photo not found.');
    }

    const row = q.rows[0];
    const fs = await import('fs');
    if (!fs.existsSync(row.encrypted_file_path)) {
      return res.status(404).send('Photo file not found on disk.');
    }

    const decryptedBuffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);
    res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(decryptedBuffer);
  } catch (err) {
    console.error('Error streaming photo:', err);
    return res.status(500).send('Failed to stream photo.');
  }
});

/**
 * GET /api/verification/document/stream
 * Streams the decrypted document (Aadhaar, driving licence) for the professional or preview.
 */
router.get('/document/stream', async (req, res) => {
  try {
    let proId = req.query.id || req.query.professionalId;
    if (proId) {
      const resolved = await pool.query(
        'SELECT id FROM professionals WHERE id::text = $1 OR professional_code = $1 OR professional_code IN (SELECT partner_id FROM agent_login WHERE id::text = $1 OR partner_id = $1) OR email IN (SELECT email FROM agent_login WHERE id::text = $1 OR partner_id = $1) LIMIT 1;',
        [String(proId)]
      );
      if (resolved.rows.length > 0) {
        proId = resolved.rows[0].id;
      }
    }
    if (!proId) {
      const pro = await resolveProfessional(req);
      proId = pro?.id;
    }
    if (!proId) {
      return res.status(400).send('Professional ID required.');
    }

    const docType = (req.query.type || 'aadhaar').toLowerCase();
    const typeCondition = docType.includes('licence') || docType.includes('license') || docType === 'dl'
      ? "document_type = 'driving_licence'"
      : "document_type = 'aadhaar'";

    const q = await pool.query(
      `SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_documents WHERE professional_id = $1 AND ${typeCondition} ORDER BY id DESC LIMIT 1;`,
      [proId]
    );
    if (q.rows.length === 0 || !q.rows[0].encrypted_file_path) {
      return res.status(404).send('Document not found.');
    }

    const row = q.rows[0];
    const fs = await import('fs');
    if (!fs.existsSync(row.encrypted_file_path)) {
      return res.status(404).send('Document file not found on disk.');
    }

    const decryptedBuffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);
    res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(decryptedBuffer);
  } catch (err) {
    console.error('Error streaming document:', err);
    return res.status(500).send('Failed to stream document.');
  }
});

// -----------------------------------------------------------------------------
// 3b. EXPLICIT VERIFICATION REQUEST SUBMISSION
// -----------------------------------------------------------------------------

/**
 * POST /api/verification/request-verification
 * Professional explicitly requests verification or resubmits after admin review remarks.
 * Locks the verification items and moves the dossier into the admin approvals queue.
 */
router.post('/request-verification', authenticateUser, async (req, res) => {
  try {
    const pro = await resolveProfessional(req);
    if (!pro) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const proId = pro.id;

    if (pro.account_status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Your account is permanently banned from NivaaroFix (3 suspension limit reached). You cannot submit verification.'
      });
    }

    if (pro.account_status === 'suspended' && pro.suspended_until && new Date(pro.suspended_until) > new Date()) {
      const suspDate = new Date(pro.suspended_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return res.status(403).json({
        success: false,
        error: `Your account is suspended for 1 week until ${suspDate}. You can re-submit verification details once the suspension period ends.`
      });
    }

    // Check mandatory requirements
    const checkRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM professional_photos WHERE professional_id = $1) AS has_photo,
        (SELECT COUNT(*) FROM professional_documents WHERE professional_id = $1 AND document_type = 'aadhaar') AS has_aadhaar,
        p.phone, p.name, p.permanent_address
      FROM professionals p
      WHERE p.id = $1;
    `, [proId]);

    const check = checkRes.rows[0];
    if (!check || parseInt(check.has_photo, 10) === 0) {
      return res.status(400).json({ success: false, error: 'Live portrait photo is required before requesting verification.' });
    }
    if (parseInt(check.has_aadhaar, 10) === 0) {
      return res.status(400).json({ success: false, error: 'Aadhaar document photo is required before requesting verification.' });
    }

    // Call ApprovalsService to queue or resubmit request
    const syncRes = await ApprovalsService.syncVerificationRequest(proId);

    // Broadcast realtime event to admin operators
    try {
      const { notifyAdminVerificationEvent } = await import('../modules/realtime/adminRealtime.js');
      notifyAdminVerificationEvent(syncRes.isResubmitted ? 'verification.resubmitted' : 'verification.submitted', {
        requestId: syncRes.request?.id,
        professionalId: proId,
        name: pro.name
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: syncRes.isResubmitted
        ? 'Application resubmitted successfully. It has been moved to the review queue.'
        : 'Verification requested successfully. Your profile is now under review by NivaaroFix compliance.',
      isResubmitted: Boolean(syncRes.isResubmitted),
      kycStatus: 'under_review'
    });
  } catch (err) {
    console.error('Request verification error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. SECURE SIGNED FILE PREVIEW
// -----------------------------------------------------------------------------

/**
 * GET /api/verification/files/signed?type=document|photo&id=...&uid=...&role=...&exp=...&sig=...
 */
router.get('/files/signed', authenticateUser, async (req, res) => {
  try {
    const verification = verifySignedFileUrl(req.query, req.user);
    if (!verification.valid) {
      return res.status(403).json({ success: false, error: verification.error });
    }

    const { type, id } = req.query;

    let row = null;
    if (type === 'document') {
      const q = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_documents WHERE id = $1 LIMIT 1;', [id]);
      if (q.rows.length > 0) row = q.rows[0];
    } else if (type === 'photo') {
      const q = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_photos WHERE id = $1 LIMIT 1;', [id]);
      if (q.rows.length > 0) row = q.rows[0];
    }

    if (!row || !row.encrypted_file_path) {
      return res.status(404).json({ success: false, error: 'File not found or has been purged per retention policy.' });
    }

    const decryptedBuffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);

    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(decryptedBuffer);
  } catch (err) {
    console.error('Signed file preview error:', err);
    return res.status(500).json({ success: false, error: 'Failed to decrypt and stream document preview.' });
  }
});

// -----------------------------------------------------------------------------
// 5. PROFESSIONAL VERIFICATION STATUS & CHECKLIST
// -----------------------------------------------------------------------------

/**
 * GET /api/verification/status?professionalId=...
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const pro = await resolveProfessional(req);
    if (!pro) {
      return res.status(400).json({ success: false, error: 'Professional not found or unauthenticated.' });
    }

    const status = await VerificationService.getProfessionalVerificationStatus(pro.id);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Professional not found.' });
    }

    return res.json({ success: true, verification: status, status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. RETENTION CLEANUP TRIGGER
// -----------------------------------------------------------------------------

/**
 * POST /api/verification/retention/run
 */
router.post('/retention/run', authenticateUser, async (req, res) => {
  try {
    // Admin only
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin authorization required.' });
    }

    const days = parseInt(req.body?.retentionDays, 10) || 30;
    const result = await VerificationService.runRetentionCleanup({ retentionDays: days });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

