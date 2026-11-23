import { pool } from '../../config/db.js';
import { logAdminAudit } from '../../utils/adminSecurity.js';
import { readDecryptedDocument } from './utils/fileCrypto.js';
import crypto from 'crypto';

/**
 * Format timestamp in Asia/Kolkata (IST, UTC+05:30)
 */
export function formatToIST(date) {
  if (!date) return '';
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
}

/**
 * Human-readable waiting time calculation (e.g. "3 days 4 hours", "22 mins")
 */
export function formatWaitingTime(queuedAt) {
  if (!queuedAt) return '0 mins';
  const diffMs = Date.now() - new Date(queuedAt).getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / (60 * 1000)));

  if (diffMins < 60) {
    return `${diffMins} min${diffMins === 1 ? '' : 's'}`;
  }

  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;

  if (diffHours < 24) {
    return remMins > 0 ? `${diffHours} hr${diffHours === 1 ? '' : 's'} ${remMins}m` : `${diffHours} hr${diffHours === 1 ? '' : 's'}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return remHours > 0 ? `${diffDays} day${diffDays === 1 ? '' : 's'} ${remHours}h` : `${diffDays} day${diffDays === 1 ? '' : 's'}`;
}

/**
 * Check if waiting time exceeds target SLA threshold (24 hours default)
 */
export function isOverSlaThreshold(queuedAt, thresholdHours = 24) {
  if (!queuedAt) return false;
  const diffMs = Date.now() - new Date(queuedAt).getTime();
  return diffMs > thresholdHours * 60 * 60 * 1000;
}

/**
 * PII Masking Utilities
 */
export function maskPhone(phone) {
  if (!phone) return '';
  const str = String(phone).replace(/\D/g, '');
  if (str.length < 4) return '******';
  return `+91 ******${str.slice(-4)}`;
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskAadhaar(aadhaarLast4) {
  if (!aadhaarLast4) return 'XXXX XXXX XXXX';
  return `XXXX XXXX ${String(aadhaarLast4).slice(-4)}`;
}

/**
 * Approvals Service
 */
export class ApprovalsService {
  /**
   * Synchronizes or initializes a verification request for a professional.
   * Triggered whenever personal details, live photo, or documents are submitted/updated.
   */
  static async syncVerificationRequest(professionalId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch professional data, agent_login phone verification, photo, aadhaar, and dl
      const proRes = await client.query(`
        SELECT p.id, p.name, p.trade, p.trade_id, p.permanent_address, 
               p.experience_years, p.years_of_experience, p.phone, p.email,
               COALESCE(a.is_phone_verified, false) AS is_phone_verified,
               ph.id AS photo_id, ph.status AS photo_status,
               da.id AS aadhaar_id, da.status AS aadhaar_status, da.consent_at AS aadhaar_consent,
               dl.id AS dl_id, dl.status AS dl_status
        FROM professionals p
        LEFT JOIN agent_login a ON a.id = p.id OR a.email = p.email
        LEFT JOIN professional_photos ph ON ph.professional_id = p.id
        LEFT JOIN professional_documents da ON da.professional_id = p.id AND da.document_type = 'aadhaar'
        LEFT JOIN professional_documents dl ON dl.professional_id = p.id AND dl.document_type = 'driving_licence'
        WHERE p.id = $1
        LIMIT 1;
      `, [professionalId]);

      if (proRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { complete: false, reason: 'Professional not found' };
      }

      const p = proRes.rows[0];

      // Verification Requirements Checklist
      const missing = [];
      if (!p.phone || !p.phone.trim()) missing.push('mobile');
      if (!p.photo_id) missing.push('live_photo');
      if (!p.aadhaar_id || !p.aadhaar_consent) missing.push('aadhaar');

      const hasPersonalDetails = Boolean(
        p.name && p.name.trim().length > 0 &&
        (p.trade || p.trade_id)
      );
      if (!hasPersonalDetails) missing.push('personal_details');

      const isComplete = missing.length === 0;

      // Check existing request
      const reqRes = await client.query(
        'SELECT * FROM verification_requests WHERE professional_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE;',
        [professionalId]
      );

      const existingReq = reqRes.rows[0];

      if (isComplete) {
        if (!existingReq) {
          // 1. Initial complete submission -> Create verification_requests record
          const insertReq = await client.query(`
            INSERT INTO verification_requests (
              professional_id, status, queued_at, first_submitted_at, submission_count, version
            ) VALUES ($1, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 1)
            RETURNING *;
          `, [professionalId]);

          const req = insertReq.rows[0];

          // Insert items
          await client.query(`
            INSERT INTO verification_items (request_id, item_type, status, document_id) VALUES
              ($1, 'mobile', $5, NULL),
              ($1, 'live_photo', 'pending', NULL),
              ($1, 'aadhaar', 'pending', $2),
              ($1, 'personal_details', 'pending', NULL),
              ($1, 'driving_licence', $3, $4)
            ON CONFLICT (request_id, item_type) DO NOTHING;
          `, [
            req.id,
            p.aadhaar_id,
            p.dl_id ? 'pending' : 'not_provided',
            p.dl_id || null,
            p.is_phone_verified ? 'approved' : 'pending'
          ]);

          // Update professional status to under_review
          await client.query(`
            UPDATE professionals
            SET kyc_status = 'under_review',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
          `, [professionalId]);

          await client.query(`
            UPDATE agent_login
            SET kyc_status = 'under_review',
                updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
               OR email = (SELECT email FROM professionals WHERE id = $1);
          `, [professionalId]);

          // Insert event
          await client.query(`
            INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
            VALUES ($1, 'submitted', 'professional', $2, $3);
          `, [req.id, professionalId, JSON.stringify({ submission_count: 1 })]);

          await client.query('COMMIT');
          return { complete: true, request: req, isNew: true };
        } else if (existingReq.status === 'needs_attention' || existingReq.status === 'rejected') {
          // 2. Resubmission after needs_attention or rejected -> Goes to back of queue with fresh queued_at
          const updatedReqRes = await client.query(`
            UPDATE verification_requests
            SET status = 'pending',
                queued_at = CURRENT_TIMESTAMP,
                submission_count = submission_count + 1,
                claimed_by_admin_id = NULL,
                claimed_until = NULL,
                decision_note = NULL,
                decided_at = NULL,
                decided_by_admin_id = NULL,
                version = version + 1,
                has_updated_details = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *;
          `, [existingReq.id]);

          const req = updatedReqRes.rows[0];

          // Reset items that had problems back to pending
          await client.query(`
            UPDATE verification_items
            SET status = 'pending',
                reason_code = NULL,
                reason_note = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $1 AND status IN ('needs_attention', 'rejected');
          `, [req.id]);

          // Also reset the underlying professional_documents and professional_photos status back to under_review
          await client.query(`
            UPDATE professional_documents
            SET status = 'under_review',
                rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $1 AND status IN ('needs_attention', 'rejected');
          `, [professionalId]);

          await client.query(`
            UPDATE professional_photos
            SET status = 'under_review',
                rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $1 AND status IN ('needs_attention', 'rejected');
          `, [professionalId]);

          // Reset professional status back to under_review and clear rejection note
          await client.query(`
            UPDATE professionals
            SET kyc_status = 'under_review',
                verification_checklist = verification_checklist - 'rejection_note',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1;
          `, [professionalId]);

          await client.query(`
            UPDATE agent_login
            SET kyc_status = 'under_review',
                verification_checklist = verification_checklist - 'rejection_note',
                updated_at = CURRENT_TIMESTAMP
            WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
               OR email = (SELECT email FROM professionals WHERE id = $1);
          `, [professionalId]);

          // Record event
          await client.query(`
            INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
            VALUES ($1, 'resubmitted', 'professional', $2, $3);
          `, [req.id, professionalId, JSON.stringify({ submission_count: req.submission_count })]);

          await client.query('COMMIT');
          return { complete: true, request: req, isResubmitted: true };
        } else {
          // Already pending, in_review, or approved
          if (p.is_phone_verified && (existingReq.status === 'pending' || existingReq.status === 'in_review')) {
            await client.query(`
              UPDATE verification_items
              SET status = 'approved', updated_at = CURRENT_TIMESTAMP
              WHERE request_id = $1 AND item_type = 'mobile' AND status != 'approved';
            `, [existingReq.id]);
          }
          await client.query('COMMIT');
          return { complete: true, request: existingReq };
        }
      } else {
        await client.query('COMMIT');
        return { complete: false, missing, request: existingReq || null };
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Enforces field locks on professional profile while pending or in review.
   * Locked: name, mobile, trade, document replacement.
   * Allowed: address, experience (tags request "Details updated").
   */
  static async checkFieldLocksAndRecordUpdate(professionalId, fieldNames = []) {
    const res = await pool.query(`
      SELECT id, status FROM verification_requests 
      WHERE professional_id = $1 AND status IN ('pending', 'in_review')
      LIMIT 1;
    `, [professionalId]);

    if (res.rows.length === 0) {
      return { allowed: true };
    }

    const req = res.rows[0];
    const lockedFields = new Set(['name', 'phone', 'mobile', 'trade', 'trade_id', 'aadhaar', 'live_photo']);

    for (const f of fieldNames) {
      if (lockedFields.has(f.toLowerCase())) {
        return {
          allowed: false,
          lockedField: f,
          error: `Field '${f}' is locked while your verification request is pending review.`
        };
      }
    }

    // If allowed edits (address, experience) were made, tag the request as 'Details updated'
    const allowedDetailFields = new Set(['permanent_address', 'address', 'experience_years', 'years_of_experience']);
    const hasDetailEdit = fieldNames.some(f => allowedDetailFields.has(f.toLowerCase()));

    if (hasDetailEdit) {
      await pool.query(`
        UPDATE verification_requests 
        SET has_updated_details = TRUE, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1;
      `, [req.id]);

      await pool.query(`
        INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
        VALUES ($1, 'details_updated', 'professional', $2, $3);
      `, [req.id, professionalId, JSON.stringify({ updated_fields: fieldNames })]);
    }

    return { allowed: true };
  }

  /**
   * Queue Summary statistics for Top Strip
   */
  static async getQueueSummary() {
    // 1. Pending count (pending + in_review)
    const countRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_review')) AS pending_count,
        MIN(queued_at) FILTER (WHERE status IN ('pending', 'in_review')) AS oldest_queued_at
      FROM verification_requests;
    `);

    const pendingCount = parseInt(countRes.rows[0].pending_count || 0, 10);
    const oldestQueuedAt = countRes.rows[0].oldest_queued_at;
    const oldestWaitingFormatted = oldestQueuedAt ? formatWaitingTime(oldestQueuedAt) : 'None';

    // 2. Reviewed today (decisions made today in Asia/Kolkata timezone)
    const todayRes = await pool.query(`
      SELECT COUNT(*) AS reviewed_today
      FROM verification_requests
      WHERE decided_at IS NOT NULL
        AND (decided_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE;
    `);
    const reviewedToday = parseInt(todayRes.rows[0].reviewed_today || 0, 10);

    // 3. Average review time (mean of decided_at - queued_at over the last 7 days)
    const avgRes = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (decided_at - queued_at))) AS avg_seconds
      FROM verification_requests
      WHERE decided_at IS NOT NULL
        AND decided_at > CURRENT_TIMESTAMP - INTERVAL '7 days';
    `);

    let avgReviewTimeStr = 'Under 1 hr';
    const avgSeconds = parseFloat(avgRes.rows[0].avg_seconds || 0);
    if (avgSeconds > 0) {
      const avgMins = Math.round(avgSeconds / 60);
      if (avgMins < 60) {
        avgReviewTimeStr = `${avgMins} min${avgMins === 1 ? '' : 's'}`;
      } else {
        const hrs = (avgMins / 60).toFixed(1);
        avgReviewTimeStr = `${hrs} hr${hrs === '1.0' ? '' : 's'}`;
      }
    }

    // 4. Customers new count (unseen registrations)
    const custRes = await pool.query(`
      SELECT COUNT(*) AS new_customers FROM customers WHERE admin_seen_at IS NULL;
    `);
    const newCustomersCount = parseInt(custRes.rows[0].new_customers || 0, 10);

    return {
      pendingCount,
      oldestWaiting: oldestWaitingFormatted,
      reviewedToday,
      averageReviewTime: avgReviewTimeStr,
      newCustomersCount
    };
  }

  /**
   * Retrieves FIFO Queue items grouped by submission day in Asia/Kolkata.
   */
  static async getQueue({
    filter = 'all',
    trade = null,
    search = null,
    sort = 'oldest',
    limit = 25,
    cursor = null,
    adminUser
  }) {
    // Release any stale claims where claimed_until < NOW()
    await pool.query(`
      UPDATE verification_requests
      SET claimed_by_admin_id = NULL,
          claimed_until = NULL,
          status = 'pending'
      WHERE status = 'in_review' AND claimed_until IS NOT NULL AND claimed_until < CURRENT_TIMESTAMP;
    `);

    // Handle special filter: "awaiting_submission"
    if (filter === 'awaiting_submission') {
      return this.getAwaitingSubmissionQueue({ search, trade, limit, cursor });
    }

    const conditions = ["vr.status IN ('pending', 'in_review')"];
    const values = [];

    // Filter by trade
    if (trade && trade !== 'all') {
      values.push(trade);
      conditions.push(`p.trade = $${values.length}`);
    }

    // Filter chips
    if (filter === 'waiting_1d') {
      conditions.push("vr.queued_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    } else if (filter === 'waiting_2d') {
      conditions.push("vr.queued_at < CURRENT_TIMESTAMP - INTERVAL '2 days'");
    } else if (filter === 'resubmitted') {
      conditions.push("vr.submission_count > 1");
    } else if (filter === 'details_updated') {
      conditions.push("vr.has_updated_details = TRUE");
    } else if (filter === 'automated_warnings') {
      conditions.push(`(
        COALESCE((da.checks->'quality'->>'pass')::boolean, true) = false
        OR COALESCE((ph.checks->'quality'->>'pass')::boolean, true) = false
        OR COALESCE(ph.face_similarity_score, 100) < 60
      )`);
    }

    // Search by name, professional ID, or phone
    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(p.name) LIKE $${sIdx}
        OR LOWER(p.professional_code) LIKE $${sIdx}
        OR p.phone LIKE $${sIdx}
      )`);
    }

    // Cursor pagination (queued_at, id)
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        if (decoded.queued_at && decoded.id) {
          values.push(decoded.queued_at);
          const qIdx = values.length;
          values.push(decoded.id);
          const idIdx = values.length;
          conditions.push(`(vr.queued_at, vr.id) > ($${qIdx}, $${idIdx})`);
        }
      } catch (_) { }
    }

    // Sorting order
    let orderByClause = 'ORDER BY vr.queued_at ASC, vr.id ASC';
    if (sort === 'name') {
      orderByClause = 'ORDER BY p.name ASC, vr.queued_at ASC';
    } else if (sort === 'name_desc') {
      orderByClause = 'ORDER BY p.name DESC, vr.queued_at ASC';
    } else if (sort === 'trade') {
      orderByClause = 'ORDER BY p.trade ASC, vr.queued_at ASC';
    } else if (sort === 'trade_desc') {
      orderByClause = 'ORDER BY p.trade DESC, vr.queued_at ASC';
    } else if (sort === 'newest') {
      orderByClause = 'ORDER BY vr.queued_at DESC, vr.id DESC';
    } else if (sort === 'oldest') {
      orderByClause = 'ORDER BY vr.queued_at ASC, vr.id ASC';
    } else if (sort === 'status') {
      orderByClause = 'ORDER BY vr.status ASC, vr.queued_at ASC';
    }

    values.push(limit);
    const limitIdx = values.length;

    const query = `
      SELECT 
        vr.id, vr.professional_id, vr.status, vr.queued_at, vr.first_submitted_at, 
        vr.submission_count, vr.claimed_by_admin_id, vr.claimed_until, vr.version, vr.has_updated_details,
        au.username AS claimed_by_username,
        p.professional_code, p.name, p.trade, p.phone,
        COALESCE(a.is_phone_verified, false) AS mobile_verified,
        ph.status AS photo_status, ph.checks AS photo_checks, ph.face_similarity_score,
        da.status AS aadhaar_status, da.checks AS aadhaar_checks,
        dl.status AS dl_status
      FROM verification_requests vr
      JOIN professionals p ON p.id = vr.professional_id
      LEFT JOIN agent_login a ON a.id = p.id OR a.email = p.email
      LEFT JOIN admin_users au ON au.id = vr.claimed_by_admin_id
      LEFT JOIN professional_photos ph ON ph.professional_id = p.id
      LEFT JOIN professional_documents da ON da.professional_id = p.id AND da.document_type = 'aadhaar'
      LEFT JOIN professional_documents dl ON dl.professional_id = p.id AND dl.document_type = 'driving_licence'
      WHERE ${conditions.join(' AND ')}
      ${orderByClause}
      LIMIT $${limitIdx};
    `;

    const res = await pool.query(query, values);

    // Process rows into formatted view models
    let nextCursor = null;
    if (res.rows.length === limit) {
      const last = res.rows[res.rows.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ queued_at: last.queued_at, id: last.id })).toString('base64');
    }

    const items = res.rows.map((row, idx) => {
      // Calculate automated warnings
      let warningCount = 0;
      if (row.photo_checks?.quality?.pass === false) warningCount++;
      if (row.aadhaar_checks?.quality?.pass === false) warningCount++;
      if (row.face_similarity_score !== null && row.face_similarity_score < 60) warningCount++;
      if (row.aadhaar_checks?.nameMatchScore !== undefined && row.aadhaar_checks?.nameMatchScore < 70) warningCount++;

      const isClaimActive = Boolean(row.claimed_by_admin_id && row.claimed_until && new Date(row.claimed_until) > new Date());
      const isClaimedByMe = Boolean(adminUser && String(row.claimed_by_admin_id) === String(adminUser.id) && isClaimActive);
      const isClaimedByOther = Boolean(row.claimed_by_admin_id && !isClaimedByMe && isClaimActive);

      // Submission day key formatted in IST (e.g. "Friday, 7 November")
      const dayFormatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(new Date(row.queued_at));

      // Submitted time (e.g. "4:12 pm")
      const timeFormatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      }).format(new Date(row.queued_at)).toLowerCase();

      // Initials for avatar
      const initials = (row.name || 'P')
        .split(' ')
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

      return {
        id: row.id,
        professionalId: row.professional_id,
        positionNumber: idx + 1,
        position: idx + 1,
        name: row.name,
        initials,
        professionalCode: row.professional_code || String(row.professional_id),
        trade: row.trade || 'General Maintenance',
        submittedTime: timeFormatted,
        queuedAt: row.queued_at,
        firstSubmittedAt: row.first_submitted_at,
        submissionDay: dayFormatted,
        waitingTime: formatWaitingTime(row.queued_at),
        waitingDuration: formatWaitingTime(row.queued_at),
        isOverSla: isOverSlaThreshold(row.queued_at, 24),
        isResubmitted: row.submission_count > 1,
        hasUpdatedDetails: Boolean(row.has_updated_details),
        isClaimed: isClaimActive,
        claimedBy: isClaimActive ? (row.claimed_by_username || null) : null,
        claimedByAdminName: isClaimActive ? (row.claimed_by_username || null) : null,
        isClaimedByMe,
        isClaimedByOther,
        checks: {
          mobile: Boolean(row.mobile_verified),
          photo: row.photo_status === 'verified' || row.photo_status === 'under_review',
          aadhaar: row.aadhaar_status === 'verified' || row.aadhaar_status === 'under_review',
          licence: row.dl_status ? (row.dl_status === 'verified' || row.dl_status === 'under_review') : null
        },
        automatedSummary: warningCount === 0 ? 'All clear' : `${warningCount} warning${warningCount === 1 ? '' : 's'}`,
        warningCount
      };
    });

    // Group items by submission day
    const dayGroupsMap = new Map();
    items.forEach(item => {
      if (!dayGroupsMap.has(item.submissionDay)) {
        dayGroupsMap.set(item.submissionDay, []);
      }
      dayGroupsMap.get(item.submissionDay).push(item);
    });

    const groups = Array.from(dayGroupsMap.entries()).map(([day, reqs]) => ({
      dayHeading: `${day}, ${reqs.length} request${reqs.length === 1 ? '' : 's'}`,
      dayLabel: `${day}, ${reqs.length} request${reqs.length === 1 ? '' : 's'}`,
      dayKey: day,
      day,
      items: reqs,
      requests: reqs
    }));

    return {
      items,
      groups,
      nextCursor,
      totalCount: items.length
    };
  }

  /**
   * Helper for "Awaiting submission" filter (professionals with incomplete prerequisites)
   */
  static async getAwaitingSubmissionQueue({ search, trade, limit = 25 }) {
    const conditions = [
      `p.id NOT IN (SELECT professional_id FROM verification_requests WHERE status IN ('pending', 'in_review', 'approved'))`
    ];
    const values = [];

    if (trade && trade !== 'all') {
      values.push(trade);
      conditions.push(`p.trade = $${values.length}`);
    }

    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(p.name) LIKE $${sIdx}
        OR LOWER(p.professional_code) LIKE $${sIdx}
        OR p.phone LIKE $${sIdx}
      )`);
    }

    values.push(limit);
    const limitIdx = values.length;

    const query = `
      SELECT 
        p.id, p.professional_code, p.name, p.trade, p.phone, p.created_at,
        COALESCE(a.is_phone_verified, false) AS mobile_verified,
        ph.id AS photo_id,
        da.id AS aadhaar_id, da.consent_at AS aadhaar_consent,
        p.permanent_address, p.experience_years, p.years_of_experience
      FROM professionals p
      LEFT JOIN agent_login a ON a.id = p.id OR a.email = p.email
      LEFT JOIN professional_photos ph ON ph.professional_id = p.id
      LEFT JOIN professional_documents da ON da.professional_id = p.id AND da.document_type = 'aadhaar'
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${limitIdx};
    `;

    const res = await pool.query(query, values);

    const items = res.rows.map((row, idx) => {
      const missing = [];
      if (!row.mobile_verified) missing.push('Mobile verification');
      if (!row.photo_id) missing.push('Live portrait photo');
      if (!row.aadhaar_id || !row.aadhaar_consent) missing.push('Aadhaar document & consent');
      if (!row.permanent_address) missing.push('Permanent address');
      if (row.experience_years === null && row.years_of_experience === null) missing.push('Experience');

      const initials = (row.name || 'P').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

      return {
        id: `awaiting_${row.id}`,
        professionalId: row.id,
        positionNumber: idx + 1,
        position: idx + 1,
        name: row.name,
        initials,
        professionalCode: row.professional_code || String(row.id),
        trade: row.trade || 'General Maintenance',
        submittedTime: 'Not submitted',
        queuedAt: row.created_at,
        submissionDay: 'Awaiting submission',
        waitingTime: 'Awaiting professional',
        waitingDuration: 'Awaiting professional',
        isOverSla: false,
        isResubmitted: false,
        hasUpdatedDetails: false,
        isClaimed: false,
        isAwaitingSubmission: true,
        missingRequirements: missing,
        checks: {
          mobile: Boolean(row.mobile_verified),
          photo: Boolean(row.photo_id),
          aadhaar: Boolean(row.aadhaar_id),
          licence: null
        },
        automatedSummary: `Missing: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ` +${missing.length - 2}` : ''}`,
        warningCount: missing.length
      };
    });

    return {
      items,
      groups: [{
        dayHeading: `Awaiting Submission, ${items.length} professional${items.length === 1 ? '' : 's'}`,
        dayLabel: `Awaiting Submission, ${items.length} professional${items.length === 1 ? '' : 's'}`,
        dayKey: 'awaiting_submission',
        day: 'Awaiting Submission',
        items,
        requests: items
      }],
      nextCursor: null,
      totalCount: items.length
    };
  }

  /**
   * Retrieves full request data for the Review Page
   */
  static async getRequestDetails(requestId, adminUser) {
    const reqRes = await pool.query(`
      SELECT 
        vr.*,
        au.username AS claimed_by_username,
        p.id AS pro_id, p.professional_code, p.name, p.email, p.phone, p.trade,
        COALESCE(p.years_of_experience, p.experience_years) AS experience_years,
        COALESCE(NULLIF(p.permanent_address, ''), NULLIF(p.address, ''), NULLIF(a.permanent_address, ''), NULLIF(a.address, '')) AS permanent_address,
        p.created_at AS pro_created_at,
        COALESCE(a.is_phone_verified, false) AS mobile_verified
      FROM verification_requests vr
      JOIN professionals p ON p.id = vr.professional_id
      LEFT JOIN agent_login a ON a.partner_id = p.professional_code OR a.email = p.email OR a.id = p.id
      LEFT JOIN admin_users au ON au.id = vr.claimed_by_admin_id
      WHERE vr.id = $1
      LIMIT 1;
    `, [requestId]);

    if (reqRes.rows.length === 0) return null;
    const req = reqRes.rows[0];

    // Fetch review items
    const itemsRes = await pool.query(`
      SELECT vi.*, pd.document_type
      FROM verification_items vi
      LEFT JOIN professional_documents pd ON pd.id = vi.document_id
      WHERE vi.request_id = $1
      ORDER BY vi.id ASC;
    `, [requestId]);

    // Fetch documents (Aadhaar & Driving Licence)
    const docsRes = await pool.query(`
      SELECT id, document_type, status, mime_type, file_size_bytes,
             aadhaar_number, aadhaar_last4, document_expiry, checks, rejection_reason, created_at
      FROM professional_documents
      WHERE professional_id = $1;
    `, [req.professional_id]);

    const docsMap = {};
    docsRes.rows.forEach(d => {
      docsMap[d.document_type] = d;
    });

    // Fetch Live Photo
    const photoRes = await pool.query(`
      SELECT id, mime_type, is_upload_fallback, face_similarity_score, status, checks, created_at
      FROM professional_photos
      WHERE professional_id = $1
      LIMIT 1;
    `, [req.professional_id]);

    const photo = photoRes.rows[0] || null;

    // Fetch History Timeline Events
    const eventsRes = await pool.query(`
      SELECT ve.*, au.username AS admin_username
      FROM verification_events ve
      LEFT JOIN admin_users au ON au.id = ve.actor_id AND ve.actor_type = 'admin'
      WHERE ve.request_id = $1
      ORDER BY ve.created_at ASC;
    `, [requestId]);

    // Compute request index (e.g. "Request 3 of 14")
    const positionRes = await pool.query(`
      SELECT COUNT(*) AS position
      FROM verification_requests
      WHERE status IN ('pending', 'in_review')
        AND (queued_at < $1 OR (queued_at = $1 AND id <= $2));
    `, [req.queued_at, req.id]);

    const totalPendingRes = await pool.query(`
      SELECT COUNT(*) AS total FROM verification_requests WHERE status IN ('pending', 'in_review');
    `);

    const currentIndex = parseInt(positionRes.rows[0].position || 1, 10);
    const totalPending = parseInt(totalPendingRes.rows[0].total || 1, 10);

    // Compute adjacent requests (Previous & Next)
    const prevRes = await pool.query(`
      SELECT id FROM verification_requests
      WHERE status IN ('pending', 'in_review')
        AND (queued_at < $1 OR (queued_at = $1 AND id < $2))
      ORDER BY queued_at DESC, id DESC LIMIT 1;
    `, [req.queued_at, req.id]);

    const nextRes = await pool.query(`
      SELECT id FROM verification_requests
      WHERE status IN ('pending', 'in_review')
        AND (queued_at > $1 OR (queued_at = $1 AND id > $2))
      ORDER BY queued_at ASC, id ASC LIMIT 1;
    `, [req.queued_at, req.id]);

    const isClaimedByMe = Boolean(adminUser && String(req.claimed_by_admin_id) === String(adminUser.id));
    const isClaimedByOther = Boolean(req.claimed_by_admin_id && !isClaimedByMe && new Date(req.claimed_until) > new Date());

    return {
      isClaimedByMe,
      isClaimedByOther,
      claimConflict: isClaimedByOther ? {
        claimedByName: req.claimed_by_username || 'another admin',
        claimedSinceFormatted: formatToIST(req.claimed_until ? new Date(new Date(req.claimed_until).getTime() - 10 * 60 * 1000) : req.updated_at)
      } : null,
      request: {
        id: req.id,
        professionalId: req.professional_id,
        status: req.status,
        version: req.version,
        queuedAt: req.queued_at,
        firstSubmittedAt: req.first_submitted_at,
        submissionCount: req.submission_count,
        claimedByAdminId: req.claimed_by_admin_id,
        claimedUntil: req.claimed_until,
        claimedByUsername: req.claimed_by_username,
        isClaimedByMe,
        isClaimedByOther,
        hasUpdatedDetails: req.has_updated_details,
        currentIndex,
        totalPending,
        previousRequestId: prevRes.rows[0]?.id || null,
        nextRequestId: nextRes.rows[0]?.id || null
      },
      professional: {
        id: req.pro_id,
        name: req.name,
        professionalCode: req.professional_code || String(req.pro_id),
        trade: req.trade || 'General Maintenance',
        experienceYears: req.experience_years !== null ? req.experience_years : 0,
        experienceFormatted: req.experience_years === 0 ? 'Fresher' : `${req.experience_years} year${req.experience_years === 1 ? '' : 's'}`,
        permanentAddress: req.permanent_address || 'Not provided',
        phone: req.phone || '',
        email: req.email || '',
        phoneMasked: req.phone || '',
        emailMasked: req.email || '',
        isPhoneVerified: Boolean(req.mobile_verified),
        registeredAtFormatted: formatToIST(req.pro_created_at),
        submittedAtFormatted: formatToIST(req.queued_at)
      },
      documents: {
        aadhaar: docsMap['aadhaar'] ? {
          id: docsMap['aadhaar'].id,
          status: docsMap['aadhaar'].status,
          aadhaarNumber: docsMap['aadhaar'].aadhaar_number || null,
          aadhaarLast4: docsMap['aadhaar'].aadhaar_last4 || null,
          aadhaarLast4Masked: maskAadhaar(docsMap['aadhaar'].aadhaar_last4),
          mimeType: docsMap['aadhaar'].mime_type,
          checks: docsMap['aadhaar'].checks || {}
        } : null,
        drivingLicence: docsMap['driving_licence'] ? {
          id: docsMap['driving_licence'].id,
          status: docsMap['driving_licence'].status,
          expiryDate: docsMap['driving_licence'].document_expiry,
          mimeType: docsMap['driving_licence'].mime_type,
          checks: docsMap['driving_licence'].checks || {}
        } : null
      },
      photo: photo ? {
        id: photo.id,
        status: photo.status,
        mimeType: photo.mime_type,
        isUploadFallback: photo.is_upload_fallback,
        faceSimilarityScore: photo.face_similarity_score,
        checks: photo.checks || {}
      } : null,
      items: itemsRes.rows.map(item => ({
        id: item.id,
        itemType: item.item_type,
        status: item.status,
        reasonCode: item.reason_code,
        reasonNote: item.reason_note,
        documentId: item.document_id
      })),
      history: eventsRes.rows.map(ev => ({
        id: ev.id,
        eventType: ev.event_type,
        actorType: ev.actor_type,
        actorName: ev.admin_username || (ev.actor_type === 'professional' ? req.name : 'System'),
        timestampFormatted: formatToIST(ev.created_at),
        details: ev.details || {}
      }))
    };
  }

  /**
   * Claims a verification request exclusively for 10 minutes.
   * Owner can take over claim from another admin.
   */
  static async claimRequest(requestId, adminUser) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query(
        'SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE;',
        [requestId]
      );

      if (reqRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, status: 404, error: 'Verification request not found' };
      }

      const req = reqRes.rows[0];

      // Check if active claim exists
      if (req.claimed_by_admin_id && String(req.claimed_by_admin_id) !== String(adminUser.id)) {
        const isClaimExpired = !req.claimed_until || new Date(req.claimed_until) <= new Date();
        if (!isClaimExpired) {
          // If current admin is Owner: allow takeover
          if (adminUser.role !== 'owner') {
            const adminRes = await client.query('SELECT username FROM admin_users WHERE id = $1', [req.claimed_by_admin_id]);
            const claimantName = adminRes.rows[0]?.username || 'another admin';
            await client.query('ROLLBACK');
            return {
              success: false,
              status: 409,
              error: `Being reviewed by ${claimantName}`,
              claimedBy: claimantName
            };
          }
        }
      }

      const claimedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes lease

      await client.query(`
        UPDATE verification_requests
        SET status = 'in_review',
            claimed_by_admin_id = $1,
            claimed_until = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `, [adminUser.id, claimedUntil, requestId]);

      // Record event
      await client.query(`
        INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
        VALUES ($1, 'claimed', 'admin', $2, $3);
      `, [requestId, adminUser.id, JSON.stringify({ claimed_until: claimedUntil.toISOString() })]);

      await client.query('COMMIT');

      return {
        success: true,
        claimedBy: adminUser.username,
        claimedUntil: claimedUntil.toISOString(),
        leaseSeconds: 600
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Releases an active review claim
   */
  static async releaseClaim(requestId, adminUser) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query('SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE;', [requestId]);
      if (reqRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, status: 404, error: 'Request not found' };
      }

      const req = reqRes.rows[0];
      if (String(req.claimed_by_admin_id) === String(adminUser.id) || adminUser.role === 'owner') {
        await client.query(`
          UPDATE verification_requests
          SET status = 'pending',
              claimed_by_admin_id = NULL,
              claimed_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [requestId]);

        await client.query(`
          INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
          VALUES ($1, 'released', 'admin', $2, '{}');
        `, [requestId, adminUser.id]);
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Heartbeat to extend active claim by 10 minutes while review page is open
   */
  static async heartbeatClaim(requestId, adminUser) {
    const claimedUntil = new Date(Date.now() + 10 * 60 * 1000);
    const res = await pool.query(`
      UPDATE verification_requests
      SET claimed_until = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND claimed_by_admin_id = $3
      RETURNING id, claimed_until;
    `, [claimedUntil, requestId, adminUser.id]);

    if (res.rows.length === 0) {
      return { success: false, error: 'No active claim for this request' };
    }

    return { success: true, claimedUntil: claimedUntil.toISOString() };
  }

  /**
   * Updates individual verification item review state in real time.
   */
  static async updateItemReview(requestId, itemType, { status, reasonCode = null, reasonNote = null }, adminUser) {
    const res = await pool.query(`
      UPDATE verification_items
      SET status = $1,
          reason_code = $2,
          reason_note = $3,
          reviewed_by = $4,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE request_id = $5 AND item_type = $6
      RETURNING *;
    `, [status, reasonCode, reasonNote, adminUser?.id || null, requestId, itemType]);
    return res.rows[0];
  }

  /**
   * Submits administrative decision (Approve, Request Re-upload, Reject)
   * with optimistic locking (`version`).
   */
  static async submitDecision(requestId, { decision, items = [], decisionNote = '', version, aadhaarNumber = null, aadhaarLast4 = null }, adminUser, reqMeta = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query(
        'SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE;',
        [requestId]
      );

      if (reqRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, status: 404, error: 'Verification request not found' };
      }

      const req = reqRes.rows[0];

      // Check if claimed by another operator
      if (req.claimed_by_admin_id && String(req.claimed_by_admin_id) !== String(adminUser.id)) {
        const isClaimExpired = !req.claimed_until || new Date(req.claimed_until) <= new Date();
        if (!isClaimExpired && adminUser.role !== 'owner') {
          const adminRes = await client.query('SELECT username FROM admin_users WHERE id = $1', [req.claimed_by_admin_id]);
          const claimantName = adminRes.rows[0]?.username || 'another admin';
          await client.query('ROLLBACK');
          return {
            success: false,
            status: 409,
            error: `Conflict: This request is claimed and being reviewed by ${claimantName}.`
          };
        }
      }

      // Optimistic concurrency check
      if (version !== undefined && parseInt(version, 10) !== req.version) {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          error: 'Conflict: This request was modified by another operator. Please refresh to see the latest version.'
        };
      }

      const professionalId = req.professional_id;
      const beforeState = { status: req.status, items: [] };

      // Update individual items
      for (const item of items) {
        const itemType = item.item_type || item.itemType;
        if (!itemType) continue;
        const reasonCode = item.reason_code || item.reasonCode || null;
        const reasonNote = item.reason_note || item.reasonNote || null;

        await client.query(`
          UPDATE verification_items
          SET status = $1,
              reason_code = $2,
              reason_note = $3,
              reviewed_by = $4,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE request_id = $5 AND item_type = $6;
        `, [
          item.status,
          reasonCode,
          reasonNote,
          adminUser.id,
          requestId,
          itemType
        ]);
      }

      // DECISION 1: APPROVE
      if (decision === 'approve' || decision === 'approved') {
        // Auto-approve any pending items when final approval is requested
        await client.query(`
          UPDATE verification_items
          SET status = 'approved',
              reviewed_by = $1,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE request_id = $2 AND status = 'pending' AND item_type IN ('live_photo', 'aadhaar', 'personal_details');
        `, [adminUser.id, requestId]);

        const itemsCheck = await client.query(`
          SELECT item_type, status FROM verification_items
          WHERE request_id = $1 AND item_type IN ('live_photo', 'aadhaar', 'personal_details');
        `, [requestId]);

        for (const it of itemsCheck.rows) {
          if (it.status !== 'approved') {
            await client.query('ROLLBACK');
            return {
              success: false,
              status: 400,
              error: `Cannot approve request: ${it.item_type} is currently marked as '${it.status}'. Change it to 'Looks good' or request re-upload.`
            };
          }
        }

        // Update verification_requests
        await client.query(`
          UPDATE verification_requests
          SET status = 'approved',
              decided_by_admin_id = $1,
              decided_at = CURRENT_TIMESTAMP,
              decision_note = $2,
              claimed_by_admin_id = NULL,
              claimed_until = NULL,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3;
        `, [adminUser.id, decisionNote, requestId]);

        // Update professional documents & photo statuses to verified
        const cleanAadhaar = aadhaarNumber ? String(aadhaarNumber).replace(/\D/g, '') : null;
        let cleanLast4 = cleanAadhaar && cleanAadhaar.length >= 4
          ? cleanAadhaar.slice(-4)
          : (aadhaarLast4 ? String(aadhaarLast4).replace(/\D/g, '').slice(-4) : null);

        const hasAadhaarDoc = await client.query(
          "SELECT id, aadhaar_last4 FROM professional_documents WHERE professional_id = $1 AND document_type = 'aadhaar' LIMIT 1;",
          [professionalId]
        );

        if (hasAadhaarDoc.rows.length > 0) {
          if (!cleanLast4) {
            cleanLast4 = hasAadhaarDoc.rows[0].aadhaar_last4;
          }
          if (cleanAadhaar && cleanAadhaar.length !== 12) {
            await client.query('ROLLBACK');
            return {
              success: false,
              status: 400,
              error: 'Mandatory: Aadhaar number must be exactly 12 digits.'
            };
          }
          if (!cleanLast4) {
            await client.query('ROLLBACK');
            return {
              success: false,
              status: 400,
              error: 'Mandatory: Aadhaar last 4 digits are required to verify this document.'
            };
          }
        }

        await client.query(`
          UPDATE professional_documents
          SET aadhaar_last4 = $1,
              status = 'verified',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $3 AND document_type = 'aadhaar';
        `, [cleanLast4, adminUser.id, professionalId]);

        // Check if DL was provided & approved
        const dlItem = items.find(i => i.item_type === 'driving_licence' && i.status === 'approved');
        if (dlItem) {
          await client.query(`
            UPDATE professional_documents
            SET status = 'verified', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE professional_id = $2 AND document_type = 'driving_licence';
          `, [adminUser.id, professionalId]);
        }

        await client.query(`
          UPDATE professional_photos
          SET status = 'verified', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $2;
        `, [adminUser.id, professionalId]);

        // Update professionals table: mark Verified and active, clear rejection note and suspension
        await client.query(`
          UPDATE professionals
          SET photo_verified = TRUE,
              aadhaar_verified = TRUE,
              dl_verified = $1,
              kyc_status = 'verified',
              account_status = 'active',
              suspended_until = NULL,
              verification_checklist = '{}'::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `, [Boolean(dlItem), professionalId]);

        await client.query(`
          UPDATE agent_login
          SET photo_verified = TRUE,
              aadhaar_verified = TRUE,
              dl_verified = $1,
              is_phone_verified = TRUE,
              kyc_status = 'verified',
              account_status = 'active',
              suspended_until = NULL,
              offline_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $2)
             OR email = (SELECT email FROM professionals WHERE id = $2);
        `, [Boolean(dlItem), professionalId]);

        // Record event (strictly last 4 digits only)
        await client.query(`
          INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
          VALUES ($1, 'approved', 'admin', $2, $3);
        `, [requestId, adminUser.id, JSON.stringify({ decision_note: decisionNote, aadhaar_last4: cleanLast4 })]);
      }
      // DECISION 2: REQUEST RE-UPLOAD (needs_attention)
      else if (decision === 'request_reupload' || decision === 'needs_attention') {
        const problemItems = items.filter(i => i.status === 'needs_attention');
        if (problemItems.length === 0) {
          await client.query('ROLLBACK');
          return {
            success: false,
            status: 400,
            error: 'Request re-upload requires at least one item marked as having a problem with a reason.'
          };
        }

        // Update verification_requests to needs_attention
        await client.query(`
          UPDATE verification_requests
          SET status = 'needs_attention',
              decided_by_admin_id = $1,
              decided_at = CURRENT_TIMESTAMP,
              decision_note = $2,
              claimed_by_admin_id = NULL,
              claimed_until = NULL,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3;
        `, [adminUser.id, decisionNote, requestId]);

        // Update professional kyc status & note so it immediately reflects on their profile
        await client.query(`
          UPDATE professionals
          SET kyc_status = 'needs_attention',
              verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `, [professionalId, decisionNote]);

        await client.query(`
          UPDATE agent_login
          SET kyc_status = 'needs_attention',
              verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
              updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
             OR email = (SELECT email FROM professionals WHERE id = $1);
        `, [professionalId, decisionNote]);

        // Update specific document/photo statuses to needs_attention with reason
        for (const item of problemItems) {
          if (item.item_type === 'aadhaar') {
            await client.query(`
              UPDATE professional_documents 
              SET status = 'needs_attention', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE professional_id = $3 AND document_type = 'aadhaar';
            `, [item.reason_note || item.reason_code || decisionNote, adminUser.id, professionalId]);
          } else if (item.item_type === 'driving_licence') {
            await client.query(`
              UPDATE professional_documents 
              SET status = 'needs_attention', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE professional_id = $3 AND document_type = 'driving_licence';
            `, [item.reason_note || item.reason_code || decisionNote, adminUser.id, professionalId]);
          } else if (item.item_type === 'live_photo') {
            await client.query(`
              UPDATE professional_photos 
              SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE professional_id = $3;
            `, [item.reason_note || item.reason_code || decisionNote, adminUser.id, professionalId]);
          }
        }

        await client.query(`
          INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
          VALUES ($1, 'reupload_requested', 'admin', $2, $3);
        `, [requestId, adminUser.id, JSON.stringify({ items: problemItems, decision_note: decisionNote })]);
      }
      // DECISION 3: REJECT
      else if (decision === 'reject' || decision === 'rejected') {
        if (!decisionNote || decisionNote.trim().length === 0) {
          await client.query('ROLLBACK');
          return { success: false, status: 400, error: 'A rejection reason and note are required.' };
        }

        await client.query(`
          UPDATE verification_requests
          SET status = 'rejected',
              decided_by_admin_id = $1,
              decided_at = CURRENT_TIMESTAMP,
              decision_note = $2,
              claimed_by_admin_id = NULL,
              claimed_until = NULL,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3;
        `, [adminUser.id, decisionNote, requestId]);

        await client.query(`
          UPDATE professionals 
          SET kyc_status = 'rejected',
              verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = $1;
        `, [professionalId, decisionNote]);

        await client.query(`
          UPDATE agent_login 
          SET kyc_status = 'rejected',
              verification_checklist = jsonb_set(COALESCE(verification_checklist, '{}'::jsonb), '{rejection_note}', to_jsonb($2::text)),
              updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = (SELECT professional_code FROM professionals WHERE id = $1)
             OR email = (SELECT email FROM professionals WHERE id = $1);
        `, [professionalId, decisionNote]);

        // Also mark documents and photos rejected with note
        await client.query(`
          UPDATE professional_documents
          SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $3;
        `, [decisionNote, adminUser.id, professionalId]);

        await client.query(`
          UPDATE professional_photos
          SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE professional_id = $3;
        `, [decisionNote, adminUser.id, professionalId]);

        await client.query(`
          INSERT INTO verification_events (request_id, event_type, actor_type, actor_id, details)
          VALUES ($1, 'rejected', 'admin', $2, $3);
        `, [requestId, adminUser.id, JSON.stringify({ decision_note: decisionNote })]);
      } else {
        await client.query('ROLLBACK');
        return { success: false, status: 400, error: `Invalid decision: ${decision}` };
      }

      // Write immutable admin audit log with before/after state
      await logAdminAudit({
        adminUserId: adminUser.id,
        action: `verification_${decision}`,
        targetType: 'verification_request',
        targetId: String(requestId),
        result: 'success',
        ip: reqMeta.ip || null,
        userAgent: reqMeta.userAgent || null,
        details: {
          decision,
          professional_id: professionalId,
          decision_note: decisionNote,
          items_evaluated: items.length
        }
      });

      // Find next oldest unclaimed pending request to auto-advance
      const nextRes = await client.query(`
        SELECT id FROM verification_requests
        WHERE status = 'pending'
          AND (claimed_until IS NULL OR claimed_until < CURRENT_TIMESTAMP)
        ORDER BY queued_at ASC, id ASC
        LIMIT 1;
      `);

      const nextRequestId = nextRes.rows[0]?.id || null;

      await client.query('COMMIT');

      return {
        success: true,
        decision,
        nextRequestId,
        message: (decision === 'approved' || decision === 'approve')
          ? 'Approved. Opening the next request.'
          : (decision === 'request_reupload' || decision === 'needs_attention' ? 'Re-upload requested. Opening the next request.' : 'Request rejected.')
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Generates short-lived signed URL (5 minutes) for document viewing.
   */
  static async createDocumentViewUrl(documentId, fileType = 'document', adminUser, reqMeta = {}) {
    // Generate tamper-proof signed token tied to admin user
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const secret = process.env.SIGNED_URL_SECRET || process.env.ADMIN_SESSION_SECRET || 'nivaarofix_doc_view_secret';
    const payload = `${fileType}:${documentId}:${adminUser.id}:${expiresAt}`;
    const token = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Audit document access
    await logAdminAudit({
      adminUserId: adminUser.id,
      action: 'document_viewed',
      targetType: fileType,
      targetId: String(documentId),
      result: 'success',
      ip: reqMeta.ip || null,
      userAgent: reqMeta.userAgent || null,
      details: { fileType, expiresAt }
    });

    return `/admin/documents/view/${fileType}-${documentId}-${adminUser.id}-${expiresAt}-${token}`;
  }

  /**
   * Streams decrypted document contents for valid signed token
   */
  static async getDecryptedDocumentStream(tokenString) {
    if (!tokenString) return null;
    const parts = tokenString.split('-');
    if (parts.length !== 5) return null;

    const [fileType, idStr, adminIdStr, expStr, sig] = parts;
    const expiresAt = parseInt(expStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { expired: true };
    }

    const secret = process.env.SIGNED_URL_SECRET || process.env.ADMIN_SESSION_SECRET || 'nivaarofix_doc_view_secret';
    const payload = `${fileType}:${idStr}:${adminIdStr}:${expStr}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const id = parseInt(idStr, 10);
    const adminId = parseInt(adminIdStr, 10);
    if (fileType === 'photo') {
      const res = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_photos WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const buffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);
      return { buffer, mimeType: row.mime_type, fileType, id, adminId };
    } else {
      const res = await pool.query('SELECT encrypted_file_path, file_iv, file_auth_tag, mime_type FROM professional_documents WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const buffer = await readDecryptedDocument(row.encrypted_file_path, row.file_iv, row.file_auth_tag);
      return { buffer, mimeType: row.mime_type, fileType, id, adminId };
    }
  }

  /**
   * View-only Customer Registry
   */
  static async getCustomers({
    filter = 'all',
    search = null,
    sort = 'newest',
    limit = 25,
    cursor = null
  }) {
    const conditions = ['1=1'];
    const values = [];

    // Filter by registration window
    if (filter === 'today') {
      conditions.push("(c.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE");
    } else if (filter === '7d') {
      conditions.push("c.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'");
    } else if (filter === '30d') {
      conditions.push("c.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'");
    } else if (filter === 'unseen') {
      conditions.push("c.admin_seen_at IS NULL");
    } else if (filter === 'mobile_unverified') {
      conditions.push("COALESCE(u.is_phone_verified, false) = FALSE");
    }

    if (search && search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = values.length;
      conditions.push(`(
        LOWER(c.name) LIKE $${sIdx}
        OR LOWER(c.customer_code) LIKE $${sIdx}
        OR LOWER(c.email) LIKE $${sIdx}
        OR c.phone LIKE $${sIdx}
      )`);
    }

    const sortOrder = sort === 'oldest' ? 'ASC' : 'DESC';

    values.push(limit);
    const limitIdx = values.length;

    const query = `
      SELECT 
        c.id, c.customer_code, c.name, c.email, c.phone, c.created_at, c.admin_seen_at,
        c.account_status,
        COALESCE(u.is_phone_verified, true) AS mobile_verified,
        COUNT(sr.id) AS booking_count,
        MAX(sr.created_at) AS last_booking_at
      FROM customers c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN service_requests sr ON sr.customer_id = c.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id, u.is_phone_verified
      ORDER BY c.created_at ${sortOrder}, c.id ${sortOrder}
      LIMIT $${limitIdx};
    `;

    const res = await pool.query(query, values);

    return res.rows.map(row => ({
      id: row.id,
      customerCode: row.customer_code || String(row.id),
      name: row.name || 'Anonymous Customer',
      phone: row.phone || '',
      email: row.email || '',
      emailMasked: row.email || '',
      phoneMasked: row.phone || '',
      isPhoneVerified: Boolean(row.mobile_verified),
      registeredAtFormatted: formatToIST(row.created_at),
      lastActiveFormatted: row.last_booking_at ? formatToIST(row.last_booking_at) : formatToIST(row.created_at),
      bookingCount: parseInt(row.booking_count || 0, 10),
      accountStatus: row.account_status || 'active',
      isNew: row.admin_seen_at === null
    }));
  }

  /**
   * Customer Details (View-only, marks admin_seen_at on open)
   */
  static async getCustomerDetails(customerId, adminUser) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(`
        SELECT c.*, COALESCE(u.is_phone_verified, true) AS mobile_verified
        FROM customers c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = $1 LIMIT 1 FOR UPDATE OF c;
      `, [customerId]);

      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const c = res.rows[0];

      // Mark admin_seen_at if null
      if (c.admin_seen_at === null) {
        await client.query('UPDATE customers SET admin_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [customerId]);
      }

      // Check bookings / service requests
      const bookingsRes = await client.query(`
        SELECT sr.id, sr.service_request_code AS booking_ref, sr.status, sr.created_at
        FROM service_requests sr
        WHERE sr.customer_id = $1
        ORDER BY sr.created_at DESC LIMIT 10;
      `, [customerId]);

      const countRes = await client.query(
        'SELECT COUNT(*) FROM service_requests WHERE customer_id = $1',
        [customerId]
      );
      const totalBookingsCount = parseInt(countRes.rows[0]?.count, 10) || 0;

      await client.query('COMMIT');

      const addr = c.permanent_address || c.address || '';
      let derivedArea = 'Tiruchirappalli';
      if (addr.toLowerCase().includes('thuvakudi')) derivedArea = 'Thuvakudi';
      else if (addr.toLowerCase().includes('bhel')) derivedArea = 'BHEL';
      else if (addr.toLowerCase().includes('nit')) derivedArea = 'NIT Trichy';
      else if (addr.toLowerCase().includes('chennai')) derivedArea = 'Chennai';

      return {
        id: c.id,
        customerCode: c.customer_code || String(c.id),
        name: c.name || 'Customer',
        phone: c.phone || '',
        email: c.email || '',
        phoneMasked: c.phone ? `${c.phone.slice(0, 3)} ••••• ••••` : '—',
        emailMasked: c.email ? `${c.email.slice(0, 2)}••••••@••••.com` : '—',
        isPhoneVerified: Boolean(c.mobile_verified),
        mobileVerified: Boolean(c.mobile_verified),
        mobileVerifiedAt: c.mobile_verified ? formatToIST(c.created_at) : null,
        area: derivedArea,
        permanentAddress: c.permanent_address || c.address || 'Not provided',
        registeredAtFormatted: formatToIST(c.created_at),
        lastSeenFormatted: c.last_active_at ? formatToIST(c.last_active_at) : '—',
        bookingsCount: totalBookingsCount,
        accountStatus: c.account_status || 'active',
        bookings: bookingsRes.rows.map(b => ({
          id: b.id,
          bookingRef: b.booking_ref,
          status: b.status,
          dateFormatted: formatToIST(b.created_at)
        }))
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Audited PII Reveal Action (Phone / Email)
   */
  static async revealPii({ targetType, targetId, field, reason }, adminUser, reqMeta = {}) {
    if (!['phone', 'email'].includes(field)) {
      throw new Error("Invalid field. Only 'phone' and 'email' may be revealed.");
    }

    let unmaskedValue = '';
    const id = parseInt(targetId, 10);

    if (targetType === 'professional') {
      const res = await pool.query('SELECT phone, email FROM professionals WHERE id = $1', [id]);
      if (res.rows.length === 0) throw new Error('Professional not found');
      unmaskedValue = res.rows[0][field] || '';
    } else if (targetType === 'customer') {
      const res = await pool.query('SELECT phone, email FROM customers WHERE id = $1', [id]);
      if (res.rows.length === 0) throw new Error('Customer not found');
      unmaskedValue = res.rows[0][field] || '';
    } else {
      throw new Error("Invalid targetType. Must be 'professional' or 'customer'.");
    }

    // Write audit log
    await logAdminAudit({
      adminUserId: adminUser.id,
      action: 'pii_reveal',
      targetType,
      targetId: String(targetId),
      result: 'success',
      ip: reqMeta.ip || null,
      userAgent: reqMeta.userAgent || null,
      details: { field, reason: reason || 'Admin review verification inspection' }
    });

    return unmaskedValue;
  }
}
