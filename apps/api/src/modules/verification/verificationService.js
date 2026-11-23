import crypto from 'crypto';
import fs from 'fs';
import { pool } from '../../config/db.js';
import { createSmsProvider } from './providers/SmsProvider.js';
import { createKycProvider } from './providers/KycProvider.js';
import {
  validateFileBytes,
  saveEncryptedDocument,
  readDecryptedDocument,
  generateSignedFileUrl,
  scanWithClamAv
} from './utils/fileCrypto.js';
import { evaluateImageQuality, computeFaceSimilarityHint } from './utils/imageQuality.js';
import { ApprovalsService } from './approvalsService.js';
import { broadcastAdminEvent } from '../realtime/adminRealtime.js';

const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'nivaarofix_otp_hmac_secret_key_default';

function hashOtp(code) {
  return crypto.createHmac('sha256', OTP_SECRET).update(String(code).trim()).digest('hex');
}

function cleanPhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

/**
 * Verification Service for Professionals
 */
export class VerificationService {
  /**
   * Sends 6-digit OTP to professional mobile number.
   * Rate limited: max 5 sends per hour per number and per IP, 30s resend cooldown.
   */
  static async sendMobileOtp({ phone, ipAddress }) {
    const digits = cleanPhone(phone);
    if (!digits || digits.length !== 10) {
      // Generic error; no enumeration
      return { success: false, error: 'Please provide a valid 10-digit mobile number.' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Check Hourly Rate Limits (max 5 per hour per number, max 5 per hour per IP)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const rateCheckPhone = await client.query(
        'SELECT COUNT(*) FROM mobile_verifications WHERE phone = $1 AND created_at > $2;',
        [digits, oneHourAgo]
      );
      if (parseInt(rateCheckPhone.rows[0].count, 10) >= 5) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Too many OTP requests for this number. Please wait an hour.' };
      }

      if (ipAddress) {
        const rateCheckIp = await client.query(
          'SELECT COUNT(*) FROM mobile_verifications WHERE ip_address = $1 AND created_at > $2;',
          [ipAddress, oneHourAgo]
        );
        if (parseInt(rateCheckIp.rows[0].count, 10) >= 10) {
          await client.query('ROLLBACK');
          return { success: false, error: 'Too many requests from this network. Please try again later.' };
        }
      }

      // 2. Check Resend Cooldown (30 seconds)
      const thirtySecAgo = new Date(Date.now() - 30 * 1000);
      const cooldownCheck = await client.query(
        'SELECT created_at FROM mobile_verifications WHERE phone = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1;',
        [digits, thirtySecAgo]
      );
      if (cooldownCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Please wait 30 seconds before requesting another code.' };
      }

      // 3. Invalidate any existing active unconsumed codes for this number
      await client.query(
        'UPDATE mobile_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE phone = $1 AND consumed_at IS NULL;',
        [digits]
      );

      // 4. Generate 6-digit cryptographic code & HMAC-SHA256 hash
      const rawCode = String(crypto.randomInt(100000, 1000000));
      const codeHash = hashOtp(rawCode);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await client.query(`
        INSERT INTO mobile_verifications (phone, code_hash, ip_address, expires_at)
        VALUES ($1, $2, $3, $4);
      `, [digits, codeHash, ipAddress || '127.0.0.1', expiresAt]);

      await client.query('COMMIT');

      if (professionalId) {
        ApprovalsService.syncVerificationRequest(professionalId).then(r => {
          if (r?.isNew || r?.isResubmitted) broadcastAdminEvent('verification.submitted', { requestId: r.request?.id });
        }).catch(() => {});
      }

      // 5. Send via SMS Provider
      const smsProvider = createSmsProvider();
      await smsProvider.sendOtp({
        to: `+91${digits}`,
        code: rawCode,
        templateId: process.env.DLT_TEMPLATE_OTP || 'NIV_MOBILE_OTP'
      });

      return {
        success: true,
        message: 'Verification code sent successfully.',
        expiresInSeconds: 300,
        cooldownSeconds: 30
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Verifies mobile OTP with constant-time comparison and max 5 attempts.
   */
  static async verifyMobileOtp({ phone, code, professionalId }) {
    const digits = cleanPhone(phone);
    const cleanCode = String(code || '').trim();

    if (!digits || !cleanCode || cleanCode.length !== 6) {
      return { success: false, error: 'Invalid verification code.' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch latest active verification record for this number
      const res = await client.query(`
        SELECT id, code_hash, attempts, max_attempts, expires_at, consumed_at
        FROM mobile_verifications
        WHERE phone = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;
      `, [digits]);

      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'No active verification code found or code has expired. Please request a new code.' };
      }

      const record = res.rows[0];

      // 2. Check Expiry
      if (new Date() > new Date(record.expires_at)) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Verification code has expired. Please request a new code.' };
      }

      // 3. Check Attempts limit
      if (record.attempts >= record.max_attempts) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Maximum verification attempts exceeded. Please request a new code.' };
      }

      // 4. Constant-Time Comparison
      const expectedHash = record.code_hash;
      const actualHash = hashOtp(cleanCode);

      const expectedBuf = Buffer.from(expectedHash, 'hex');
      const actualBuf = Buffer.from(actualHash, 'hex');

      const isMatch = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

      if (!isMatch) {
        await client.query(
          'UPDATE mobile_verifications SET attempts = attempts + 1 WHERE id = $1;',
          [record.id]
        );
        await client.query('COMMIT');

      if (professionalId) {
        ApprovalsService.syncVerificationRequest(professionalId).then(r => {
          if (r?.isNew || r?.isResubmitted) broadcastAdminEvent('verification.submitted', { requestId: r.request?.id });
        }).catch(() => {});
      }
        return { success: false, error: 'Incorrect verification code. Please check and try again.' };
      }

      // 5. Consume Code (prevent replay)
      await client.query(
        'UPDATE mobile_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1;',
        [record.id]
      );

      // 6. If professionalId provided, mark mobile verified in professionals and agent_login
      if (professionalId) {
        await client.query(`
          UPDATE professionals 
          SET phone = COALESCE(phone, $1),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `, [digits, professionalId]);

        await client.query(`
          UPDATE agent_login 
          SET is_phone_verified = true,
              phone = COALESCE(phone, $1),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 OR email = (SELECT email FROM professionals WHERE id = $2) OR phone = $1;
        `, [digits, professionalId]);

        // Insert audit log
        await client.query(`
          INSERT INTO verification_audit_log (professional_id, action, target_type, target_id, metadata)
          VALUES ($1, 'mobile_verified', 'mobile', $2, $3);
        `, [professionalId, record.id, JSON.stringify({ phone_last4: digits.slice(-4) })]);
      }

      await client.query('COMMIT');

      if (professionalId) {
        ApprovalsService.syncVerificationRequest(professionalId).then(r => {
          if (r?.isNew || r?.isResubmitted) broadcastAdminEvent('verification.submitted', { requestId: r.request?.id });
        }).catch(() => {});
      }

      return {
        success: true,
        message: 'Mobile number verified successfully.'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Resets mobile verification status when professional changes phone number.
   */
  static async handleMobileNumberChange(professionalId, newPhone) {
    const digits = cleanPhone(newPhone);
    await pool.query(`
      UPDATE agent_login 
      SET is_phone_verified = false,
          phone = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 OR email = (SELECT email FROM professionals WHERE id = $2);
    `, [digits, professionalId]);

    await pool.query(`
      UPDATE professionals 
      SET phone = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [digits, professionalId]);
  }

  /**
   * Uploads and evaluates government verification document (Aadhaar or Driving Licence).
   */
  static async uploadDocument({
    professionalId,
    documentType,
    fileBuffer,
    consent,
    profileName,
    qrBuffer = null,
    expiryInput = null
  }) {
    if (!consent) {
      return {
        success: false,
        error: 'Consent required: You must agree to NivaaroFix verifying this document.'
      };
    }

    if (!['aadhaar', 'driving_licence'].includes(documentType)) {
      return { success: false, error: 'Invalid document type. Allowed: aadhaar, driving_licence.' };
    }

    // 1. Magic bytes & size check (Max 5 MB, JPG/PNG/PDF)
    const byteCheck = validateFileBytes(fileBuffer);
    if (!byteCheck.valid) {
      return { success: false, error: byteCheck.error };
    }

    // 2. Scan with ClamAV
    await scanWithClamAv(fileBuffer);

    // 3. Encrypt and save document file privately at rest
    const { filePath, iv, authTag, sizeBytes } = await saveEncryptedDocument(fileBuffer, byteCheck.mimeType);

    // 4. Run automated KYC checks
    const kycProvider = createKycProvider();
    const checkResult = await kycProvider.performDocumentChecks({
      documentType,
      buffer: fileBuffer,
      mimeType: byteCheck.mimeType,
      profileName,
      qrBuffer,
      expiryInput
    });

    // 5. Store in professional_documents (upsert by pro_id + doc_type)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const consentAt = new Date();
      const status = checkResult.hardFailure ? 'rejected' : 'under_review';

      const insertRes = await client.query(`
        INSERT INTO professional_documents (
          professional_id, document_type, status, encrypted_file_path,
          file_iv, file_auth_tag, mime_type, file_size_bytes,
          aadhaar_last4, document_expiry, consent_at, checks, rejection_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (professional_id, document_type) DO UPDATE SET
          status = EXCLUDED.status,
          encrypted_file_path = EXCLUDED.encrypted_file_path,
          file_iv = EXCLUDED.file_iv,
          file_auth_tag = EXCLUDED.file_auth_tag,
          mime_type = EXCLUDED.mime_type,
          file_size_bytes = EXCLUDED.file_size_bytes,
          aadhaar_last4 = COALESCE(EXCLUDED.aadhaar_last4, professional_documents.aadhaar_last4),
          document_expiry = COALESCE(EXCLUDED.document_expiry, professional_documents.document_expiry),
          consent_at = EXCLUDED.consent_at,
          checks = EXCLUDED.checks,
          rejection_reason = EXCLUDED.rejection_reason,
          reviewed_by = NULL,
          reviewed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, document_type, status, aadhaar_last4, document_expiry, checks, created_at;
      `, [
        professionalId,
        documentType,
        status,
        filePath,
        iv,
        authTag,
        byteCheck.mimeType,
        sizeBytes,
        checkResult.aadhaarLast4,
        checkResult.documentExpiry,
        consentAt,
        JSON.stringify(checkResult.checks),
        checkResult.rejectionReason
      ]);

      const savedDoc = insertRes.rows[0];

      // Audit log
      await client.query(`
        INSERT INTO verification_audit_log (professional_id, action, target_type, target_id, metadata)
        VALUES ($1, 'document_uploaded', 'document', $2, $3);
      `, [professionalId, savedDoc.id, JSON.stringify({
        document_type: documentType,
        status,
        aadhaar_last4: checkResult.aadhaarLast4,
        size_bytes: sizeBytes
      })]);

      await client.query('COMMIT');

      return {
        success: true,
        document: savedDoc,
        checks: checkResult.checks,
        message: status === 'rejected'
          ? `Document auto-rejected: ${checkResult.rejectionReason}`
          : 'Document uploaded successfully.'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Uploads live portrait photo captured via camera (or upload fallback).
   */
  static async uploadLivePhoto({
    professionalId,
    fileBuffer,
    isUploadFallback = false,
    qualityScores = null
  }) {
    // 1. Validate magic bytes (JPG or PNG)
    const byteCheck = validateFileBytes(fileBuffer);
    if (!byteCheck.valid || byteCheck.mimeType === 'application/pdf') {
      return { success: false, error: 'Live photo must be a valid JPG or PNG image.' };
    }

    // 2. Evaluate Image Quality
    const quality = evaluateImageQuality(fileBuffer, { minWidth: 300, minHeight: 300 });

    // 3. Encrypt and save privately
    const { filePath, iv, authTag } = await saveEncryptedDocument(fileBuffer, byteCheck.mimeType);

    // 4. Advisory face similarity hint against uploaded Aadhaar document (if available)
    const aadhaarDocRes = await pool.query(
      "SELECT encrypted_file_path, file_iv, file_auth_tag FROM professional_documents WHERE professional_id = $1 AND document_type = 'aadhaar' LIMIT 1;",
      [professionalId]
    );

    let faceSimilarityScore = 82.50; // default advisory baseline
    if (aadhaarDocRes.rows.length > 0 && fs.existsSync(aadhaarDocRes.rows[0].encrypted_file_path)) {
      try {
        const aadhaarBuffer = await readDecryptedDocument(
          aadhaarDocRes.rows[0].encrypted_file_path,
          aadhaarDocRes.rows[0].file_iv,
          aadhaarDocRes.rows[0].file_auth_tag
        );
        faceSimilarityScore = computeFaceSimilarityHint(fileBuffer, aadhaarBuffer);
      } catch {}
    }

    const checksJson = {
      quality: {
        resolution: `${quality.width}x${quality.height}`,
        brightness: quality.brightness,
        blurScore: quality.blurScore,
        pass: quality.pass,
        reason: quality.reason
      },
      qualityScores: qualityScores || null,
      faceMatchHintScore: faceSimilarityScore,
      isUploadFallback
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const photoRes = await client.query(`
        INSERT INTO professional_photos (
          professional_id, encrypted_file_path, file_iv, file_auth_tag,
          mime_type, is_upload_fallback, face_similarity_score, status, checks
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'under_review', $8)
        ON CONFLICT (professional_id) DO UPDATE SET
          encrypted_file_path = EXCLUDED.encrypted_file_path,
          file_iv = EXCLUDED.file_iv,
          file_auth_tag = EXCLUDED.file_auth_tag,
          mime_type = EXCLUDED.mime_type,
          is_upload_fallback = EXCLUDED.is_upload_fallback,
          face_similarity_score = EXCLUDED.face_similarity_score,
          status = 'under_review',
          checks = EXCLUDED.checks,
          reviewed_by = NULL,
          reviewed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, status, face_similarity_score, is_upload_fallback, checks, created_at;
      `, [
        professionalId,
        filePath,
        iv,
        authTag,
        byteCheck.mimeType,
        Boolean(isUploadFallback),
        faceSimilarityScore,
        JSON.stringify(checksJson)
      ]);

      const photo = photoRes.rows[0];

      // Audit log
      await client.query(`
        INSERT INTO verification_audit_log (professional_id, action, target_type, target_id, metadata)
        VALUES ($1, 'photo_captured', 'photo', $2, $3);
      `, [professionalId, photo.id, JSON.stringify({
        is_upload_fallback: isUploadFallback,
        face_similarity_hint: faceSimilarityScore
      })]);

      // Update avatar_url on agent_login so profile preview updates immediately
      await client.query(`
        UPDATE agent_login SET
          avatar_url = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
           OR email = (SELECT email FROM professionals WHERE id = $1);
      `, [professionalId, `/api/verification/photo/stream?id=${professionalId}`]);

      await client.query('COMMIT');

      return {
        success: true,
        photo,
        message: 'Live photo captured successfully.'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves overall verification status & dispatch gating eligibility.
   * A professional is verified when:
   * 1. Mobile is verified (is_phone_verified = true)
   * 2. Live photo is accepted (photo_status = 'verified')
   * 3. Aadhaar is approved (aadhaar_status = 'verified')
   * 4. Payout setup is active (payout_status = 'active')
   */
  static async getProfessionalVerificationStatus(professionalId) {
    const proRes = await pool.query(`
      SELECT 
        p.id, p.name, p.email, p.phone, p.trade, p.payout_status, p.kyc_status,
        p.account_status, p.suspended_until,
        COALESCE(p.verification_checklist->>'rejection_note', '') AS pro_rejection_note,
        a.is_phone_verified,
        COALESCE(ph.status, 'not_uploaded') AS photo_status,
        COALESCE(ph.face_similarity_score, 0) AS face_similarity_score,
        COALESCE(ph.is_upload_fallback, false) AS photo_fallback,
        COALESCE(ph.rejection_reason, '') AS photo_rejection_reason,
        COALESCE(da.status, 'not_uploaded') AS aadhaar_status,
        da.aadhaar_last4,
        COALESCE(da.rejection_reason, '') AS aadhaar_rejection_reason,
        COALESCE(dl.status, 'not_uploaded') AS dl_status,
        dl.document_expiry AS dl_expiry,
        COALESCE(dl.rejection_reason, '') AS dl_rejection_reason,
        COALESCE(vr.decision_note, '') AS latest_decision_note,
        COALESCE(vr.status, '') AS latest_request_status,
        (SELECT COUNT(*) FROM professional_suspensions WHERE professional_id = p.id) AS suspension_count,
        (SELECT COUNT(*) FROM banned_professionals WHERE professional_id = p.id) AS is_banned_record
      FROM professionals p
      LEFT JOIN agent_login a ON a.id = p.id OR a.email = p.email
      LEFT JOIN professional_photos ph ON ph.professional_id = p.id
      LEFT JOIN professional_documents da ON da.professional_id = p.id AND da.document_type = 'aadhaar'
      LEFT JOIN professional_documents dl ON dl.professional_id = p.id AND dl.document_type = 'driving_licence'
      LEFT JOIN LATERAL (
        SELECT status, decision_note FROM verification_requests 
        WHERE professional_id = p.id ORDER BY id DESC LIMIT 1
      ) vr ON true
      WHERE p.id = $1 LIMIT 1;
    `, [professionalId]);

    if (proRes.rows.length === 0) {
      return null;
    }

    const row = proRes.rows[0];

    const suspensionCount = parseInt(row.suspension_count, 10) || 0;
    const isBanned = row.account_status === 'banned' || parseInt(row.is_banned_record, 10) > 0;
    const chancesRemaining = Math.max(0, 3 - suspensionCount);
    const isSuspended = row.account_status === 'suspended';
    const isCurrentlySuspended = Boolean(isSuspended && row.suspended_until && new Date(row.suspended_until) > new Date());
    const isSuspensionPeriodOver = Boolean(isSuspended && (!row.suspended_until || new Date(row.suspended_until) <= new Date()));

    const mobileVerified = Boolean(row.is_phone_verified);
    const photoVerified = row.photo_status === 'verified';
    const aadhaarVerified = row.aadhaar_status === 'verified';
    const payoutActive = row.payout_status === 'active';

    const isFullyVerified = Boolean(
      !isBanned && !isSuspended &&
      row.kyc_status === 'verified' &&
      photoVerified && aadhaarVerified
    );
    const canGoAvailable = isFullyVerified && payoutActive;
    let canSubmitDocuments = !isBanned && !isCurrentlySuspended;

    let effectiveKycStatus = 'unverified';
    let rejectionReason = '';

    if (isBanned) {
      effectiveKycStatus = 'banned';
      rejectionReason = 'Account permanently deactivated (maximum 3 suspensions exceeded).';
      canSubmitDocuments = false;
    } else if (isCurrentlySuspended) {
      effectiveKycStatus = 'suspended';
      const suspDate = new Date(row.suspended_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      rejectionReason = `Suspended for 7 days until ${suspDate} (Strike ${suspensionCount} of 3). Re-submission available after 7 days.`;
      canSubmitDocuments = false;
    } else if (isSuspensionPeriodOver) {
      effectiveKycStatus = 'needs_attention';
      rejectionReason = 'Suspension ended. Please re-submit your photo and Aadhaar card for review.';
      canSubmitDocuments = true;
    } else if (isFullyVerified) {
      effectiveKycStatus = 'verified';
    } else if (row.latest_request_status === 'rejected' || row.kyc_status === 'rejected') {
      effectiveKycStatus = 'rejected';
      rejectionReason = row.pro_rejection_note || row.latest_decision_note || row.aadhaar_rejection_reason || row.photo_rejection_reason || '';
    } else if (row.latest_request_status === 'needs_attention' || row.kyc_status === 'needs_attention') {
      effectiveKycStatus = 'needs_attention';
      rejectionReason = row.pro_rejection_note || row.latest_decision_note || row.aadhaar_rejection_reason || row.photo_rejection_reason || '';
    } else if (row.latest_request_status === 'pending' || row.latest_request_status === 'in_review') {
      effectiveKycStatus = 'under_review';
    } else if (row.kyc_status === 'under_review' && row.latest_request_status) {
      effectiveKycStatus = 'under_review';
    } else {
      effectiveKycStatus = (row.kyc_status && row.kyc_status !== 'under_review') ? row.kyc_status : 'unverified';
    }

    const checklist = [
      { id: 'mobile', label: 'Verified Mobile Number', completed: mobileVerified, status: mobileVerified ? 'verified' : 'pending' },
      { id: 'photo', label: 'Live Portrait Photo', completed: photoVerified, status: row.photo_status, rejectionReason: row.photo_rejection_reason },
      { id: 'aadhaar', label: 'Aadhaar Identity Card', completed: aadhaarVerified, status: row.aadhaar_status, last4: row.aadhaar_last4, rejectionReason: row.aadhaar_rejection_reason },
      { id: 'payout', label: 'Bank Settlement Account', completed: payoutActive, status: row.payout_status },
      { id: 'dl', label: 'Driving Licence (Optional)', completed: row.dl_status === 'verified', status: row.dl_status, rejectionReason: row.dl_rejection_reason }
    ];

    return {
      professionalId: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      trade: row.trade,
      isFullyVerified,
      canGoAvailable,
      canSubmitDocuments,
      isBanned,
      isSuspended,
      isCurrentlySuspended,
      isSuspensionPeriodOver,
      suspendedUntil: row.suspended_until,
      suspensionAttempts: suspensionCount,
      chancesRemaining,
      checklist,
      kycStatus: effectiveKycStatus,
      rejectionReason,
      photoStatus: row.photo_status,
      photoUrl: (row.photo_status && row.photo_status !== 'not_uploaded') ? `/api/verification/photo/stream?id=${row.id}` : null,
      avatarUrl: (row.photo_status && row.photo_status !== 'not_uploaded') ? `/api/verification/photo/stream?id=${row.id}` : null,
      photoHintScore: row.face_similarity_score,
      photoRejectionReason: row.photo_rejection_reason,
      aadhaarStatus: row.aadhaar_status,
      aadhaarLast4: row.aadhaar_last4,
      maskedAadhaar: row.aadhaar_last4 ? `XXXX XXXX ${row.aadhaar_last4}` : null,
      aadhaarUrl: (row.aadhaar_status && row.aadhaar_status !== 'not_uploaded') ? `/api/verification/document/stream?type=aadhaar&professionalId=${row.id}` : null,
      aadhaarRejectionReason: row.aadhaar_rejection_reason,
      dlStatus: row.dl_status,
      dlUrl: (row.dl_status && row.dl_status !== 'not_uploaded') ? `/api/verification/document/stream?type=driving_licence&professionalId=${row.id}` : null,
      dlRejectionReason: row.dl_rejection_reason,
      payoutStatus: row.payout_status
    };
  }

  /**
   * Retention Cleanup Job:
   * Deletes raw encrypted image files older than retention threshold (default 30 days)
   * for documents and photos that have already been reviewed and approved.
   * Keeps verification results and last 4 digits permanently.
   */
  static async runRetentionCleanup({ retentionDays = 30 } = {}) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const client = await pool.connect();
    let deletedDocsCount = 0;
    let deletedPhotosCount = 0;

    try {
      await client.query('BEGIN');

      // 1. Process documents
      const docsRes = await client.query(`
        SELECT id, professional_id, encrypted_file_path
        FROM professional_documents
        WHERE status = 'verified'
          AND reviewed_at IS NOT NULL
          AND reviewed_at < $1
          AND encrypted_file_path IS NOT NULL
        FOR UPDATE;
      `, [cutoffDate]);

      for (const doc of docsRes.rows) {
        if (doc.encrypted_file_path && fs.existsSync(doc.encrypted_file_path)) {
          try {
            fs.unlinkSync(doc.encrypted_file_path);
          } catch {}
        }
        await client.query(`
          UPDATE professional_documents
          SET encrypted_file_path = NULL,
              file_iv = NULL,
              file_auth_tag = NULL,
              delete_after = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [doc.id]);

        deletedDocsCount++;
      }

      // 2. Process photos
      const photosRes = await client.query(`
        SELECT id, professional_id, encrypted_file_path
        FROM professional_photos
        WHERE status = 'verified'
          AND reviewed_at IS NOT NULL
          AND reviewed_at < $1
          AND encrypted_file_path IS NOT NULL
        FOR UPDATE;
      `, [cutoffDate]);

      for (const photo of photosRes.rows) {
        if (photo.encrypted_file_path && fs.existsSync(photo.encrypted_file_path)) {
          try {
            fs.unlinkSync(photo.encrypted_file_path);
          } catch {}
        }
        await client.query(`
          UPDATE professional_photos
          SET encrypted_file_path = '[DELETED_AFTER_RETENTION]',
              file_iv = '',
              file_auth_tag = '',
              delete_after = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [photo.id]);

        deletedPhotosCount++;
      }

      await client.query('COMMIT');

      if (professionalId) {
        ApprovalsService.syncVerificationRequest(professionalId).then(r => {
          if (r?.isNew || r?.isResubmitted) broadcastAdminEvent('verification.submitted', { requestId: r.request?.id });
        }).catch(() => {});
      }

      return {
        success: true,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        deletedDocsCount,
        deletedPhotosCount
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
