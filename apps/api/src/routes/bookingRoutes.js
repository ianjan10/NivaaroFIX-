import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads directory for genuine problem photos
const UPLOAD_DIR = path.join(__dirname, '../../uploads/booking_photos');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const router = Router();

// Allowed image MIME types and extensions
const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit per photo

// =========================================================================
// 1. Photo Upload Endpoint (Base64/Buffer validation & safe disk persistence)
// =========================================================================
router.post('/upload-photo', async (req, res) => {
  try {
    const { base64Data, filename: clientFilename, mimeType: clientMime } = req.body;

    if (!base64Data) {
      return res.status(400).json({
        success: false,
        error: 'No image data provided for upload.'
      });
    }

    // Extract mime type and clean base64 payload
    let mimeType = clientMime;
    let rawBase64 = base64Data;

    const dataUriMatch = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1].toLowerCase();
      rawBase64 = dataUriMatch[2];
    } else if (mimeType) {
      mimeType = mimeType.toLowerCase();
    }

    if (!mimeType || !ALLOWED_MIME_TYPES[mimeType]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Only JPEG, PNG, and WEBP images are accepted.'
      });
    }

    const buffer = Buffer.from(rawBase64, 'base64');

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `File size exceeds the 10MB limit. Current size: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`
      });
    }

    const ext = ALLOWED_MIME_TYPES[mimeType] || 'jpg';
    const safeRandomName = `photo-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const destinationPath = path.join(UPLOAD_DIR, safeRandomName);

    await fs.promises.writeFile(destinationPath, buffer);

    const photoMeta = {
      id: `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      filename: safeRandomName,
      originalFilename: clientFilename || `captured-photo.${ext}`,
      mimeType,
      fileSize: buffer.length,
      url: `/api/bookings/photos/${safeRandomName}`,
      uploadedAt: new Date().toISOString()
    };

    return res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully.',
      photo: photoMeta
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to process and store problem photo.'
    });
  }
});

// =========================================================================
// 2. Secure Photo Retrieval Endpoint (Path traversal protection)
// =========================================================================
router.get('/photos/:filename', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found.'
      });
    }

    const ext = path.extname(safeFilename).toLowerCase().replace('.', '');
    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  } catch (err) {
    console.error('Photo serve error:', err);
    return res.status(500).json({ success: false, error: 'Unable to retrieve photo.' });
  }
});

// =========================================================================
// 3. Create Real Booking (Genuine Customer Action with Problem & Photos)
// =========================================================================
router.post('/', async (req, res) => {
  try {
    const {
      role,
      userRole,
      userId,
      userEmail,
      userName,
      userPhone,
      phone,
      userAddress,
      address,
      serviceId,
      serviceTitle,
      category,
      issueType,
      problemDescription,
      problemTiming,
      problemFrequency,
      photos = [],
      timeSlot,
      totalAmount
    } = req.body;

    // Security Guard: Prevent Agent accounts from creating customer bookings
    const effectiveRole = (role || userRole || '').toLowerCase();
    if (effectiveRole === 'agent' || effectiveRole === 'partner') {
      return res.status(403).json({
        success: false,
        code: 'AGENT_CANNOT_BOOK',
        message: 'Bookings are available from a customer account.'
      });
    }

    // Exclusive Job-Lock: Customer cannot create a new booking/request while having any request in Accepted or InProgress state
    if (userEmail || userId) {
      const activeCheck = await pool.query(
        `SELECT request_ref, service_title, status 
         FROM service_requests 
         WHERE (user_email = $1 OR (user_id = $2 AND $2 IS NOT NULL))
           AND status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
         ORDER BY created_at DESC 
         LIMIT 1;`,
        [userEmail ? userEmail.toLowerCase().trim() : null, (userId && !isNaN(parseInt(userId, 10))) ? parseInt(userId, 10) : null]
      );
      if (activeCheck.rows.length > 0) {
        const activeReq = activeCheck.rows[0];
        return res.status(403).json({
          success: false,
          code: 'CUSTOMER_LOCKED',
          error: `CUSTOMER_LOCKED: You currently have an active service job in progress (${activeReq.request_ref}: ${activeReq.service_title}). You cannot request another service until this job is completed.`,
          activeRequestRef: activeReq.request_ref,
          activeStatus: activeReq.status
        });
      }
    }

    // Required field validation
    const customerName = (userName || '').trim();
    const customerPhone = (userPhone || phone || '').trim();
    const customerAddress = (userAddress || address || '').trim();
    const description = (problemDescription || '').trim();
    const title = (serviceTitle || '').trim() || 'General Home Service';

    if (!description) {
      return res.status(400).json({
        success: false,
        code: 'DESCRIPTION_REQUIRED',
        error: 'Please provide a brief description of the problem to proceed.'
      });
    }

    if (!customerAddress) {
      return res.status(400).json({
        success: false,
        code: 'ADDRESS_REQUIRED',
        error: 'A valid service address is required for booking.'
      });
    }

    // Generate real identifiers
    const bookingRef = `NV-${Math.floor(10000 + Math.random() * 90000)}`;
    const otpCode = `${Math.floor(1000 + Math.random() * 9000)}`;
    const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);

    const result = await pool.query(`
      INSERT INTO bookings (
        booking_ref, user_id, user_email, user_name, user_phone, user_address,
        service_id, service_title, category, issue_type,
        problem_description, problem_timing, problem_frequency, photos,
        time_slot, total_amount, otp_code, status,
        technician_name, technician_phone, eta_minutes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb,
        $15, $16, $17, 'Request Received',
        NULL, NULL, NULL
      )
      RETURNING *;
    `, [
      bookingRef,
      userId || null,
      userEmail || null,
      customerName || 'Customer',
      customerPhone || '',
      customerAddress,
      serviceId || 'general-service',
      title,
      category || 'electrician',
      issueType || 'Inspection & Repair',
      description,
      problemTiming || 'Not specified',
      problemFrequency || 'Not specified',
      photosJson,
      timeSlot || 'Today, Express 30 Mins',
      parseFloat(totalAmount || 0),
      otpCode
    ]);

    const booking = result.rows[0];

    // Relational storage for photo references if photos were attached
    if (Array.isArray(photos) && photos.length > 0) {
      for (const p of photos) {
        if (p && (p.filename || p.url)) {
          try {
            await pool.query(`
              INSERT INTO booking_photos (booking_ref, storage_path, original_filename, mime_type, file_size)
              VALUES ($1, $2, $3, $4, $5);
            `, [
              bookingRef,
              p.url || `/api/bookings/photos/${p.filename}`,
              p.originalFilename || p.filename || 'photo.jpg',
              p.mimeType || 'image/jpeg',
              p.fileSize || 0
            ]);
          } catch (photoErr) {
            console.warn('Booking photo relational insert notice:', photoErr.message);
          }
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Booking request received.',
      booking: {
        bookingId: booking.booking_ref,
        bookingRef: booking.booking_ref,
        serviceTitle: booking.service_title,
        category: booking.category,
        issueType: booking.issue_type,
        problemDescription: booking.problem_description,
        problemTiming: booking.problem_timing,
        problemFrequency: booking.problem_frequency,
        photos: booking.photos || [],
        technicianName: null, // Strictly null until genuine pro assignment
        technicianPhone: null,
        etaMinutes: null,
        scheduledTime: booking.time_slot,
        status: booking.status || 'Request Received',
        otpCode: booking.otp_code,
        totalAmount: booking.total_amount,
        address: booking.user_address,
        userName: booking.user_name,
        userEmail: booking.user_email,
        userPhone: booking.user_phone,
        createdAt: booking.created_at
      }
    });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 4. Genuine User Bookings List (Filter by actual authenticated user)
// =========================================================================
router.get(['/my-bookings', '/me'], async (req, res) => {
  try {
    const { email, userId } = req.query;

    if (!email && !userId) {
      // Unauthenticated or empty query returns empty list (no fake global bookings)
      return res.json({ success: true, bookings: [] });
    }

    const numericUserId = (userId && !isNaN(parseInt(userId, 10))) ? parseInt(userId, 10) : null;

    const query = `
      SELECT * FROM bookings
      WHERE ($1::varchar IS NOT NULL AND user_email = $1)
         OR ($2::int IS NOT NULL AND user_id = $2)
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [email || null, numericUserId]);

    const formatted = result.rows.map(b => ({
      bookingId: b.booking_ref,
      bookingRef: b.booking_ref,
      serviceTitle: b.service_title,
      category: b.category,
      issueType: b.issue_type,
      problemDescription: b.problem_description,
      problemTiming: b.problem_timing,
      problemFrequency: b.problem_frequency,
      photos: b.photos || [],
      technicianName: b.technician_name, // Real value (null or assigned)
      technicianPhone: b.technician_phone,
      etaMinutes: b.eta_minutes,
      scheduledTime: b.time_slot,
      status: b.status,
      otpCode: b.otp_code,
      totalAmount: b.total_amount,
      address: b.user_address,
      userName: b.user_name,
      userEmail: b.user_email,
      userPhone: b.user_phone,
      createdAt: b.created_at
    }));

    return res.json({ success: true, bookings: formatted });
  } catch (err) {
    console.error('Fetch my-bookings error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 5. Get Booking by Reference
// =========================================================================
router.get('/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    const result = await pool.query(
      'SELECT * FROM bookings WHERE booking_ref = $1 OR id::text = $1 LIMIT 1;',
      [ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const b = result.rows[0];
    return res.json({
      success: true,
      booking: {
        bookingId: b.booking_ref,
        bookingRef: b.booking_ref,
        serviceTitle: b.service_title,
        category: b.category,
        issueType: b.issue_type,
        problemDescription: b.problem_description,
        problemTiming: b.problem_timing,
        problemFrequency: b.problem_frequency,
        photos: b.photos || [],
        technicianName: b.technician_name,
        technicianPhone: b.technician_phone,
        etaMinutes: b.eta_minutes,
        scheduledTime: b.time_slot,
        status: b.status,
        otpCode: b.otp_code,
        totalAmount: b.total_amount,
        address: b.user_address,
        userName: b.user_name,
        userEmail: b.user_email,
        userPhone: b.user_phone,
        cancelReason: b.cancel_reason,
        rating: b.rating,
        reviewFeedback: b.review_feedback,
        createdAt: b.created_at
      }
    });
  } catch (err) {
    console.error('Fetch single booking error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 6. Cancel Booking
// =========================================================================
router.patch('/:ref/cancel', async (req, res) => {
  try {
    const { ref } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE bookings
       SET status = 'Cancelled', cancel_reason = $1, updated_at = CURRENT_TIMESTAMP
       WHERE booking_ref = $2 OR id::text = $2
       RETURNING *;`,
      [reason || 'Cancelled by user', ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const b = result.rows[0];
    return res.json({
      success: true,
      message: 'Booking cancelled successfully.',
      booking: {
        bookingId: b.booking_ref,
        bookingRef: b.booking_ref,
        status: b.status,
        cancelReason: b.cancel_reason
      }
    });
  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 7. Reschedule Booking
// =========================================================================
router.patch('/:ref/reschedule', async (req, res) => {
  try {
    const { ref } = req.params;
    const { scheduledTime } = req.body;

    if (!scheduledTime) {
      return res.status(400).json({ success: false, error: 'New scheduled time is required.' });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET time_slot = $1, status = 'Confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE booking_ref = $2 OR id::text = $2
       RETURNING *;`,
      [scheduledTime, ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const b = result.rows[0];
    return res.json({
      success: true,
      message: 'Booking rescheduled successfully.',
      booking: {
        bookingId: b.booking_ref,
        bookingRef: b.booking_ref,
        scheduledTime: b.time_slot,
        status: b.status
      }
    });
  } catch (err) {
    console.error('Reschedule booking error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 8. Rate & Review Booking Visit
// =========================================================================
router.post('/:ref/rate', async (req, res) => {
  try {
    const { ref } = req.params;
    const { rating, feedback, tags = [] } = req.body;

    const numericRating = parseInt(rating, 10);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be a number between 1 and 5.' });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET rating = $1, review_feedback = $2, review_tags = $3::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE booking_ref = $4 OR id::text = $4
       RETURNING *;`,
      [numericRating, feedback || '', JSON.stringify(tags), ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const b = result.rows[0];
    return res.json({
      success: true,
      message: 'Rating submitted successfully.',
      booking: {
        bookingId: b.booking_ref,
        rating: b.rating,
        reviewFeedback: b.review_feedback
      }
    });
  } catch (err) {
    console.error('Rate booking error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

