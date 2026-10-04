import { Router } from 'express';
import { pool } from '../config/db.js';
import { latLngToH3 } from '../utils/geoDispatch.js';

const router = Router();

// Get Agent Console profile & stats from PostgreSQL
router.get('/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query('SELECT * FROM agent_login WHERE email = $1 LIMIT 1;', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent profile not found' });
    }
    const agent = result.rows[0];
    res.json({
      success: true,
      agent: {
        id: agent.id,
        partnerId: agent.partner_id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        trade: agent.trade,
        experienceYears: agent.experience_years,
        rating: parseFloat(agent.rating),
        completedJobs: agent.completed_jobs,
        walletBalance: parseFloat(agent.wallet_balance),
        isOnline: agent.is_online,
        lat: agent.lat ? parseFloat(agent.lat) : null,
        lng: agent.lng ? parseFloat(agent.lng) : null,
        h3Index: agent.h3_index_res9 || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Provider Location (lat/lng/h3 for dispatch)
router.patch('/location', async (req, res) => {
  try {
    const { email, lat, lng } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({ success: false, error: 'Valid latitude and longitude are required.' });
    }

    const h3Index = latLngToH3(parsedLat, parsedLng);

    const result = await pool.query(`
      UPDATE agent_login
      SET lat = $1, lng = $2, h3_index_res9 = $3, updated_at = CURRENT_TIMESTAMP
      WHERE email = $4
      RETURNING id, lat, lng, h3_index_res9;
    `, [parsedLat, parsedLng, h3Index, email.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }

    return res.json({
      success: true,
      message: 'Location updated.',
      location: {
        lat: parseFloat(result.rows[0].lat),
        lng: parseFloat(result.rows[0].lng),
        h3Index: result.rows[0].h3_index_res9
      }
    });
  } catch (err) {
    console.error('Update location error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle Online/Offline Status
router.patch('/toggle-online', async (req, res) => {
  try {
    const { email, isOnline } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    // Exclusive Job-Lock: Reject manual override to Available/Online if provider is locked to an active job
    if (isOnline) {
      const activeJobCheck = await pool.query(`
        SELECT sr.request_ref, sr.service_title, sr.status
        FROM service_requests sr
        JOIN quotes q ON q.id = sr.accepted_quote_id
        JOIN agent_login a ON a.id = q.agent_id
        WHERE a.email = $1
          AND sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
        LIMIT 1;
      `, [email.toLowerCase().trim()]);

      if (activeJobCheck.rows.length > 0) {
        const job = activeJobCheck.rows[0];
        return res.status(403).json({
          success: false,
          code: 'PROVIDER_LOCKED_BUSY',
          error: `PROVIDER_LOCKED_BUSY: You cannot set availability to Available/Online while locked to active job (${job.request_ref}: ${job.service_title}). Complete the service to unlock.`
        });
      }
    }

    const result = await pool.query(
      'UPDATE agent_login SET is_online = $1, availability_status = $2, updated_at = CURRENT_TIMESTAMP WHERE email = $3 RETURNING is_online, availability_status;',
      [!!isOnline, isOnline ? 'AVAILABLE' : 'OFFLINE', email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }

    return res.json({ success: true, isOnline: result.rows[0].is_online, availabilityStatus: result.rows[0].availability_status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify OTP & Start Job (Legacy compatibility -- dispatch routes have their own)
router.post('/verify-otp', async (req, res) => {
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

// Complete Job and Credit Wallet (Legacy compatibility -- dispatch routes have their own)
router.post('/complete-job', async (req, res) => {
  try {
    const { bookingId, agentEmail, payoutAmount } = req.body;
    const payout = parseFloat(payoutAmount || 0);

    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'Booking ID is required.' });
    }

    await pool.query("UPDATE bookings SET status = 'Completed' WHERE booking_ref = $1;", [bookingId]);

    if (agentEmail) {
      const agentResult = await pool.query(`
        UPDATE agent_login 
        SET 
          wallet_balance = wallet_balance + $1,
          completed_jobs = completed_jobs + 1
        WHERE email = $2
        RETURNING *;
      `, [payout, agentEmail.toLowerCase()]);

      const updatedAgent = agentResult.rows[0];
      res.json({
        success: true,
        message: `Job completed. ${payout.toFixed(2)} credited to wallet.`,
        newWalletBalance: updatedAgent ? parseFloat(updatedAgent.wallet_balance) : 0,
        totalCompletedJobs: updatedAgent ? updatedAgent.completed_jobs : 0
      });
    } else {
      res.json({ success: true, message: 'Job completed.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Document Verification Endpoints (Aadhaar Card, Driving License)
// ---------------------------------------------------------------------------

// Fetch verification documents for an agent (by email or partner_id)
router.get('/documents/:identifier', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Agent email or Partner ID is required.' });
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
router.post('/upload-document', async (req, res) => {
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

// Update verification status (e.g. Verified, Rejected with reason, Under Review)
router.patch('/document-status', async (req, res) => {
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

export default router;

