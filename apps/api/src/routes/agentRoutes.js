import { Router } from 'express';
import { pool } from '../config/db.js';
import { latLngToH3 } from '../utils/geoDispatch.js';
import { requireAgentAuth, requireAdminAuth, requireAnyAuth } from '../middleware/authMiddleware.js';
import { PaymentService } from '../modules/payments/paymentService.js';
import {
  updateProviderLocation,
  updateProviderPresence,
  checkAndExpireHeartbeats
} from '../modules/providers/providerService.js';

const router = Router();

// Get Agent Console profile & stats from PostgreSQL (Ownership Enforced)
router.get('/profile/:email', requireAgentAuth, async (req, res) => {
  try {
    const { email } = req.params;
    if (req.userRole === 'agent' && req.userEmail && req.userEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You are not authorized to view another partner\'s profile.' });
    }
    await checkAndExpireHeartbeats();
    const result = await pool.query('SELECT * FROM agent_login WHERE email = $1 LIMIT 1;', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent profile not found' });
    }
    const agent = result.rows[0];
    const exp = agent.years_of_experience !== null && agent.years_of_experience !== undefined
      ? Number(agent.years_of_experience)
      : (agent.experience_years !== null && agent.experience_years !== undefined ? Number(agent.experience_years) : 0);
    const addr = agent.permanent_address || agent.address || '';

    res.json({
      success: true,
      agent: {
        id: agent.id,
        partnerId: agent.partner_id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        trade: agent.trade,
        yearsOfExperience: exp,
        experienceYears: exp,
        permanentAddress: addr,
        permanent_address: addr,
        address: addr,
        rating: (agent.rating !== null && agent.rating !== undefined && !isNaN(parseFloat(agent.rating))) ? parseFloat(agent.rating) : null,
        completedJobs: parseInt(agent.completed_jobs || 0, 10),
        walletBalance: parseFloat(agent.wallet_balance || 0),
        isOnline: agent.is_online,
        kycStatus: agent.kyc_status || 'under_review',
        rejectionReason: agent.kyc_status === 'verified' ? null : (agent.verification_checklist?.rejection_note || null),
        availabilityStatus: agent.availability_status || (agent.is_online ? 'AVAILABLE' : 'OFFLINE'),
        currentLatitude: agent.current_latitude ? parseFloat(agent.current_latitude) : null,
        currentLongitude: agent.current_longitude ? parseFloat(agent.current_longitude) : null,
        currentLocality: agent.current_locality || null,
        currentAccuracyM: agent.current_accuracy_m ? parseFloat(agent.current_accuracy_m) : null,
        currentH3Cell: agent.current_h3_cell || agent.h3_index_res9 || null,
        lat: agent.lat ? parseFloat(agent.lat) : null,
        lng: agent.lng ? parseFloat(agent.lng) : null,
        h3Index: agent.h3_index_res9 || null,
        avatarUrl: agent.avatar_url || (agent.photo_verified ? `/api/verification/photo/stream?id=${agent.partner_id || agent.id}` : null),
        offlineReason: agent.offline_reason || null,
        offlineExplanation: null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Provider Location (lat/lng/h3 for dispatch)
router.patch('/location', requireAgentAuth, async (req, res) => {
  try {
    const { email, lat, lng } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    const result = await updateProviderLocation(email, {
      latitude: lat,
      longitude: lng,
      accuracy_m: req.body.accuracy_m || req.body.location_accuracy_m || 10,
      ...req.body
    });

    return res.json({
      success: true,
      message: 'Location updated.',
      location: {
        lat: result.currentLatitude,
        lng: result.currentLongitude,
        h3Index: result.currentH3Cell,
        locality: result.currentLocality
      }
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Toggle Online/Offline Status
router.patch('/toggle-online', requireAgentAuth, async (req, res) => {
  try {
    const { email, isOnline } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    const targetPresence = isOnline ? 'AVAILABLE' : 'OFFLINE';
    const result = await updateProviderPresence(email, targetPresence);

    return res.json({
      success: true,
      isOnline: result.isOnline,
      availabilityStatus: result.availabilityStatus
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Verify OTP & Start Job (Legacy compatibility -- dispatch routes have their own)
router.post('/verify-otp', requireAgentAuth, async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const result = await pool.query('SELECT * FROM bookings WHERE booking_ref = $1 LIMIT 1;', [bookingId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = result.rows[0];
    if (booking.otp_code !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please ask customer for correct 4-digit code.' });
    }

    await pool.query("UPDATE bookings SET status = 'In Progress' WHERE booking_ref = $1;", [bookingId]);
    res.json({ success: true, message: 'Door OTP verified successfully. Job marked In Progress.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Complete Job and Credit Wallet (Legacy Fake Wallet Credit Strictly Disabled)
router.post('/complete-job', requireAgentAuth, async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'LEGACY_WALLET_CREDIT_DISABLED',
    message: 'Direct client-supplied wallet credit is disabled for financial integrity. Job completions and settlements are processed strictly through verified booking workflows.'
  });
});

// ---------------------------------------------------------------------------
// Document Verification Endpoints (Aadhaar Card, Driving License)
// ---------------------------------------------------------------------------

// Fetch verification documents for an agent (by email or partner_id) - Ownership Enforced
router.get('/documents/:identifier', requireAnyAuth, async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Agent email or Partner ID is required.' });
    }

    const isAdmin = req.userRole === 'admin';
    const isOwner = (req.userEmail && req.userEmail.toLowerCase() === identifier.toLowerCase()) || 
                    (req.agentPartnerId && req.agentPartnerId.toLowerCase() === identifier.toLowerCase());

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You are not authorized to view another partner\'s documents.' });
    }

    const result = await pool.query(
      `SELECT document_type, file_name, file_type, file_size, file_url, status, rejection_reason, uploaded_at, updated_at
       FROM agent_documents
       WHERE LOWER(agent_email) = LOWER($1) OR partner_id = $1
       ORDER BY uploaded_at ASC;`,
      [identifier]
    );

    const docs = {
      aadhaar: {
        status: 'Not Uploaded',
        fileName: '',
        fileSize: 0,
        fileUrl: '',
        uploadedAt: null,
        rejectionReason: ''
      },
      driving_license: {
        status: 'Not Uploaded',
        fileName: '',
        fileSize: 0,
        fileUrl: '',
        uploadedAt: null,
        rejectionReason: ''
      }
    };

    result.rows.forEach((row) => {
      const type = row.document_type;
      if (docs[type] !== undefined) {
        docs[type] = {
          status: row.status,
          fileName: row.file_name,
          fileSize: row.file_size,
          fileUrl: row.file_url,
          uploadedAt: row.uploaded_at,
          rejectionReason: row.rejection_reason || ''
        };
      }
    });

    res.json({
      success: true,
      documents: docs
    });
  } catch (err) {
    console.error('Fetch agent documents error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload or replace verification document
router.post('/upload-document', requireAgentAuth, async (req, res) => {
  try {
    const { email, partnerId, documentType, fileName, fileType, fileSize, fileData, status } = req.body;
    
    if (!email && !partnerId) {
      return res.status(400).json({ success: false, message: 'Agent email or Partner ID is required.' });
    }

    const cleanType = String(documentType || '').toLowerCase().trim();
    if (!['aadhaar', 'driving_license'].includes(cleanType)) {
      return res.status(400).json({ success: false, message: 'Invalid document type. Allowed: aadhaar, driving_license.' });
    }

    if (!fileName) {
      return res.status(400).json({ success: false, message: 'File name is required.' });
    }

    const size = Number(fileSize) || 0;
    if (size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size exceeds maximum limit of 5MB.' });
    }

    // Lookup agent to attach agent_id and partner_id
    const agentQuery = await pool.query(
      `SELECT id, partner_id, email FROM agent_login 
       WHERE LOWER(email) = LOWER($1) OR partner_id = $2
       LIMIT 1;`,
      [email || '', partnerId || '']
    );

    const agent = agentQuery.rows[0];
    const finalEmail = (email || (agent ? agent.email : '')).toLowerCase().trim();
    const finalPartnerId = partnerId || (agent ? agent.partner_id : null);
    const agentId = agent ? agent.id : null;

    if (!finalEmail) {
      return res.status(400).json({ success: false, message: 'Could not associate document with a valid agent email.' });
    }

    const docStatus = status || 'Under Review';

    // Upsert into agent_documents
    const query = `
      INSERT INTO agent_documents (agent_id, partner_id, agent_email, document_type, file_name, file_type, file_size, file_url, status, rejection_reason, uploaded_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (agent_email, document_type) DO UPDATE SET
        agent_id = COALESCE(EXCLUDED.agent_id, agent_documents.agent_id),
        partner_id = COALESCE(EXCLUDED.partner_id, agent_documents.partner_id),
        file_name = EXCLUDED.file_name,
        file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size,
        file_url = EXCLUDED.file_url,
        status = EXCLUDED.status,
        rejection_reason = NULL,
        uploaded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [
      agentId,
      finalPartnerId,
      finalEmail,
      cleanType,
      fileName,
      fileType || 'application/octet-stream',
      size,
      fileData || '',
      docStatus
    ]);

    const doc = result.rows[0];
    res.json({
      success: true,
      message: 'Document uploaded successfully.',
      document: {
        documentType: doc.document_type,
        fileName: doc.file_name,
        fileType: doc.file_type,
        fileSize: doc.file_size,
        fileUrl: doc.file_url,
        status: doc.status,
        rejectionReason: doc.rejection_reason || '',
        uploadedAt: doc.uploaded_at
      }
    });
  } catch (err) {
    console.error('Upload agent document error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update verification status (Admin Only - Agents cannot self-approve KYC)
router.patch('/document-status', requireAdminAuth, async (req, res) => {
  try {
    const { email, partnerId, documentType, status, rejectionReason } = req.body;
    
    if (!email && !partnerId) {
      return res.status(400).json({ success: false, message: 'Agent email or Partner ID is required.' });
    }

    const cleanType = String(documentType || '').toLowerCase().trim();
    if (!['aadhaar', 'driving_license'].includes(cleanType)) {
      return res.status(400).json({ success: false, message: 'Invalid document type.' });
    }

    if (!['Not Uploaded', 'Under Review', 'Verified', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const result = await pool.query(
      `UPDATE agent_documents
       SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE (LOWER(agent_email) = LOWER($3) OR partner_id = $4) AND document_type = $5
       RETURNING *;`,
      [status, status === 'Rejected' ? (rejectionReason || 'Document could not be verified.') : null, email || '', partnerId || '', cleanType]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document record not found to update status.' });
    }

    const doc = result.rows[0];
    res.json({
      success: true,
      document: {
        documentType: doc.document_type,
        fileName: doc.file_name,
        status: doc.status,
        rejectionReason: doc.rejection_reason || '',
        updatedAt: doc.updated_at
      }
    });
  } catch (err) {
    console.error('Update document status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get genuine completed jobs history for professional (Ownership Enforced)
router.get('/completed-jobs/:email', requireAgentAuth, async (req, res) => {
  try {
    const { email } = req.params;
    const cleanEmail = (email || '').toLowerCase().trim();
    if (req.userRole === 'agent' && req.userEmail && req.userEmail.toLowerCase() !== cleanEmail) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You are not authorized to view another partner\'s completed jobs.' });
    }
    const agentRes = await pool.query('SELECT id FROM agent_login WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }
    const agentId = agentRes.rows[0].id;
    const profRes = await pool.query('SELECT id FROM professionals WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    const profId = profRes.rows.length > 0 ? profRes.rows[0].id : agentId;

    const jobsRes = await pool.query(`
      SELECT 
        sr.id,
        COALESCE(sr.service_request_code, sr.request_ref) AS booking_ref,
        sr.service_title,
        sr.category,
        COALESCE(p.amount, q.amount, 0)::NUMERIC AS total_amount,
        COALESCE(c.name, sr.user_name, 'Verified Customer') AS customer_name,
        sr.user_address AS service_address,
        sr.otp_verified_at,
        sr.completed_at,
        sr.created_at,
        sr.confirmed_at,
        sr.on_the_way_at,
        sr.arrived_at,
        COALESCE(sr.in_progress_at, sr.otp_verified_at) AS in_progress_at,
        COALESCE(r.rating, f.rating, sr.rating) AS rating,
        COALESCE(r.feedback, f.comment, sr.rating_feedback) AS feedback,
        COALESCE(r.tags, f.tags, '[]'::jsonb) AS tags,
        COALESCE(p.status, 'pending') AS payment_status,
        COALESCE(p.method, 'online') AS payment_method,
        p.provider_payment_id AS payment_id,
        COALESCE(p.platform_fee, 0)::NUMERIC AS platform_fee,
        COALESCE(p.professional_amount, q.amount, 0)::NUMERIC AS professional_amount
      FROM service_requests sr
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN quotes q ON q.id = sr.accepted_quote_id
      LEFT JOIN LATERAL (
        SELECT * FROM payments p WHERE p.service_request_id = sr.id ORDER BY p.id DESC LIMIT 1
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT * FROM reviews r WHERE r.request_id = sr.id ORDER BY r.id DESC LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT * FROM feedback f WHERE f.service_request_id = sr.id ORDER BY f.id DESC LIMIT 1
      ) f ON true
      WHERE (
        sr.assigned_professional_id IN ($1, $2)
        OR q.agent_id = $1 OR q.professional_id = $2 OR LOWER(q.agent_email) = $3
        OR EXISTS (
          SELECT 1 FROM quotes q2 
          WHERE (q2.agent_id = $1 OR q2.professional_id = $2 OR LOWER(q2.agent_email) = $3)
            AND (q2.id = sr.accepted_quote_id OR (q2.service_request_id = sr.id AND q2.status = 'accepted'))
        )
      )
      AND (sr.status = 'Completed' OR LOWER(sr.status) = 'completed')
      ORDER BY sr.completed_at DESC NULLS LAST, sr.created_at DESC
      LIMIT 50;
    `, [agentId, profId, cleanEmail]);

    res.json({
      success: true,
      jobs: jobsRes.rows.map(j => ({
        id: j.id,
        bookingRef: j.booking_ref,
        serviceTitle: j.service_title,
        category: j.category,
        amount: parseFloat(j.total_amount || 0),
        customerName: j.customer_name || 'Verified Customer',
        serviceAddress: j.service_address,
        confirmed_at: j.confirmed_at,
        on_the_way_at: j.on_the_way_at,
        arrived_at: j.arrived_at,
        in_progress_at: j.in_progress_at,
        completed_at: j.completed_at,
        status: 'Completed',
        completedAt: j.completed_at || j.otp_verified_at || j.created_at,
        otpVerifiedAt: j.otp_verified_at,
        createdAt: j.created_at,
        paymentStatus: j.payment_status || 'pending',
        paymentMethod: j.payment_method || 'online',
        paymentId: j.payment_id || null,
        platformFee: parseFloat(j.platform_fee || 0),
        professionalAmount: parseFloat(j.professional_amount || j.total_amount || 0),
        rating: j.rating ? parseFloat(j.rating) : null,
        feedback: j.feedback || '',
        tags: Array.isArray(j.tags) ? j.tags : []
      }))
    });
  } catch (err) {
    console.error('Fetch completed jobs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get genuine verified customer reviews for professional (Ownership Enforced)
router.get('/reviews/:email', requireAgentAuth, async (req, res) => {
  try {
    const { email } = req.params;
    const cleanEmail = (email || '').toLowerCase().trim();
    if (req.userRole === 'agent' && req.userEmail && req.userEmail.toLowerCase() !== cleanEmail) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You are not authorized to view another partner\'s reviews.' });
    }
    const agentRes = await pool.query('SELECT id FROM agent_login WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }
    const agentId = agentRes.rows[0].id;
    const profRes = await pool.query('SELECT id FROM professionals WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
    const profId = profRes.rows.length > 0 ? profRes.rows[0].id : agentId;

    const reviewsRes = await pool.query(`
      SELECT 
        r.id,
        r.rating,
        r.feedback,
        r.tags,
        r.created_at,
        COALESCE(c.name, 'Verified Customer') as customer_name
      FROM reviews r
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.provider_id = $1 OR r.provider_id = $2
      ORDER BY r.created_at DESC
      LIMIT 50;
    `, [agentId, profId]);

    res.json({
      success: true,
      reviews: reviewsRes.rows.map(r => ({
        id: r.id,
        rating: parseFloat(r.rating),
        feedback: r.feedback,
        tags: r.tags,
        customerName: r.customer_name || 'Verified Customer',
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('Fetch reviews error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Professional Payout Setup Endpoint
 * Links bank account through provider (Razorpay Route) and activates payout status.
 * Never stores or logs raw PAN or full account number.
 */
router.post('/payout-setup', requireAgentAuth, async (req, res) => {
  try {
    const { email, name, accountNumber, ifsc, pan } = req.body;
    const authEmail = req.userEmail || req.user?.email;

    const targetEmail = (email || authEmail || '').toLowerCase().trim();
    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'Professional email is required.' });
    }

    if (authEmail && authEmail.toLowerCase() !== targetEmail) {
      return res.status(403).json({ success: false, error: 'Unauthorized to configure payout for another professional.' });
    }

    if (!accountNumber || !ifsc || !pan) {
      return res.status(400).json({ success: false, error: 'PAN, Bank Account Number, and IFSC are required.' });
    }

    const proRes = await pool.query(
      'SELECT id, name, email, phone FROM professionals WHERE LOWER(email) = $1 LIMIT 1;',
      [targetEmail]
    );

    if (proRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Professional profile not found.' });
    }

    const pro = proRes.rows[0];
    const payout = await PaymentService.saveProfessionalPayout({
      professionalId: pro.id,
      name: name || pro.name,
      email: pro.email,
      phone: pro.phone,
      accountNumber,
      ifsc,
      pan
    });

    res.json({
      success: true,
      message: 'Payout setup successfully linked and verified.',
      payout
    });
  } catch (err) {
    console.error('Payout setup error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * Professional Payout Status Check
 */
router.get('/payout-status', requireAgentAuth, async (req, res) => {
  try {
    const email = (req.query.email || req.userEmail || req.user?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Professional email required.' });
    }

    const proRes = await pool.query(
      'SELECT id FROM professionals WHERE LOWER(email) = $1 LIMIT 1;',
      [email]
    );

    if (proRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Professional not found.' });
    }

    const statusInfo = await PaymentService.checkProfessionalPayoutStatus(proRes.rows[0].id);
    res.json({
      success: true,
      ...statusInfo
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * Professional Earnings & Payout Breakdown Endpoint
 */
router.get('/earnings', requireAgentAuth, async (req, res) => {
  try {
    const email = (req.query.email || req.userEmail || req.user?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Professional email required.' });
    }

    const proRes = await pool.query(
      'SELECT id FROM professionals WHERE LOWER(email) = $1 LIMIT 1;',
      [email]
    );

    if (proRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Professional not found.' });
    }

    const earnings = await PaymentService.getProfessionalEarnings(proRes.rows[0].id);
    res.json({
      success: true,
      ...earnings
    });
  } catch (err) {
    console.error('Fetch earnings error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

export default router;

