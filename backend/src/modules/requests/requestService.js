import { latLngToCell } from 'h3-js';
import { pool } from '../../config/db.js';
import { DISPATCH_CONFIG } from '../../config/dispatchConfig.js';
import { dispatchProgressiveWave } from '../dispatch/dispatchService.js';
import { notifyCustomer } from '../realtime/realtimeService.js';
import { classifyServiceCategory } from '../../routes/dispatchRoutes.js';

/**
 * Create a new service request from customer with GPS coordinates and trigger 50m initial dispatch.
 */
export async function createServiceRequest(params) {
  const {
    userId,
    userEmail,
    userName,
    userPhone,
    userAddress,
    lat,
    lng,
    accuracy_m,
    serviceId,
    serviceTitle,
    category,
    issueType,
    problemDescription,
    photos = [],
    role,
    userRole
  } = params;

  // Block agent accounts from creating customer requests
  const effectiveRole = (role || userRole || '').toLowerCase();
  if (effectiveRole === 'agent' || effectiveRole === 'partner') {
    throw new Error('Service requests can only be placed from a customer account.');
  }

  // Exclusive Job-Lock: Customer cannot create a new service request while having any request in Accepted or InProgress state
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
      const err = new Error(`CUSTOMER_LOCKED: You currently have an active service job in progress (${activeReq.request_ref}: ${activeReq.service_title}). You cannot request another service until this job is completed.`);
      err.code = 'CUSTOMER_LOCKED';
      err.status = 403;
      throw err;
    }
  }

  const address = (userAddress || '').trim() || (lat && lng ? `GPS Location: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : '');
  if (!address) {
    throw new Error('A valid service address or current location is required.');
  }

  // Parse GPS
  let numLat = null;
  let numLng = null;
  let numAcc = null;
  let h3_8 = null;
  let h3_9 = null;

  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    numLat = parseFloat(lat);
    numLng = parseFloat(lng);
    numAcc = accuracy_m ? parseFloat(accuracy_m) : null;

    if (isNaN(numLat) || numLat < -90 || numLat > 90) {
      throw new Error('Invalid latitude coordinates.');
    }
    if (isNaN(numLng) || numLng < -180 || numLng > 180) {
      throw new Error('Invalid longitude coordinates.');
    }

    const maxAllowedAccuracy = DISPATCH_CONFIG.LOCATION_MAX_ACCURACY_METERS || 100;
    if (numAcc !== null && !isNaN(numAcc) && numAcc > maxAllowedAccuracy) {
      // Still allow request but flag accuracy or cap
    }

    try {
      h3_8 = latLngToCell(numLat, numLng, 8);
      h3_9 = latLngToCell(numLat, numLng, 9);
    } catch (err) {
      console.warn('H3 generation warning:', err.message);
    }
  }

  const requestRef = `NV-SR-${Math.floor(10000 + Math.random() * 90000)}`;
  const otpCode = `${Math.floor(1000 + Math.random() * 9000)}`;
  const description = (problemDescription || '').trim();
  const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);
  const reqExpHours = DISPATCH_CONFIG.REQUEST_EXPIRATION_HOURS || 2;

  const classified = classifyServiceCategory(description, serviceTitle, category);
  const finalCategory = classified.category;
  const finalServiceTitle = classified.serviceTitle;

  const result = await pool.query(`
    INSERT INTO service_requests (
      request_ref, user_id, user_email, user_name, user_phone, user_address,
      lat, lng, location_accuracy_m, h3_res_8, h3_index_res9,
      service_id, service_title, category, issue_type,
      problem_description, photos,
      otp_code, status, expires_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17::jsonb,
      $18, 'Open', CURRENT_TIMESTAMP + ($19 * INTERVAL '1 hour')
    )
    RETURNING *;
  `, [
    requestRef,
    userId || null,
    userEmail || null,
    (userName || '').trim() || 'Customer',
    (userPhone || '').trim() || '',
    address,
    numLat,
    numLng,
    numAcc,
    h3_8,
    h3_9,
    serviceId || 'general-service',
    finalServiceTitle,
    finalCategory,
    issueType || 'Inspection & Repair',
    description,
    photosJson,
    otpCode,
    reqExpHours
  ]);

  const createdRequest = result.rows[0];

  // Immediately launch INITIAL Progressive Dispatch Wave (starts at 50 meters)
  let initialDispatchResult = { waveNumber: 1, radiusMeters: DISPATCH_CONFIG.INITIAL_RADIUS_METERS || 50, newlyDispatchedCount: 0 };
  if (numLat !== null && numLng !== null) {
    try {
      initialDispatchResult = await dispatchProgressiveWave(createdRequest.id, DISPATCH_CONFIG.INITIAL_RADIUS_METERS || 50);
    } catch (dispatchErr) {
      console.error('Initial dispatch wave error:', dispatchErr);
    }
  }

  // Audit event
  await pool.query(`
    INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
    VALUES ($1, 'customer', $2, 'REQUEST_CREATED', $3::jsonb);
  `, [
    createdRequest.id,
    userEmail || String(userId || 'customer'),
    JSON.stringify({
      requestRef,
      category,
      hasCoordinates: !!(numLat && numLng),
      initialRadius: DISPATCH_CONFIG.INITIAL_RADIUS_METERS || 50
    })
  ]);

  return {
    success: true,
    request: {
      id: createdRequest.id,
      requestRef: createdRequest.request_ref,
      serviceTitle: createdRequest.service_title,
      category: createdRequest.category,
      problemDescription: createdRequest.problem_description,
      photos: createdRequest.photos || [],
      address: createdRequest.user_address,
      lat: createdRequest.lat,
      lng: createdRequest.lng,
      status: createdRequest.status,
      otpCode: createdRequest.otp_code,
      createdAt: createdRequest.created_at,
      expiresAt: createdRequest.expires_at
    },
    initialDispatch: initialDispatchResult
  };
}

/**
 * Fetch a single request with all quotations received so far.
 */
export async function getRequestWithQuotes(requestRef) {
  const srRes = await pool.query(
    'SELECT * FROM service_requests WHERE request_ref = $1 LIMIT 1;',
    [requestRef]
  );
  if (srRes.rows.length === 0) {
    throw new Error('Service request not found.');
  }
  const sr = srRes.rows[0];

  const quotesRes = await pool.query(`
    SELECT q.*, 
      a.rating AS agent_rating, 
      a.completed_jobs AS agent_completed_jobs,
      a.experience_years AS agent_experience,
      a.trade AS agent_trade
    FROM quotes q
    JOIN agent_login a ON a.id = q.agent_id
    WHERE q.request_id = $1
    ORDER BY q.created_at DESC;
  `, [sr.id]);

  const quotes = quotesRes.rows.map(q => ({
    quoteId: q.id,
    providerId: q.agent_id,
    providerName: q.agent_name,
    providerPhone: sr.status === 'Accepted' || sr.status === 'En Route' || sr.status === 'In Progress' || sr.status === 'Completed'
      ? q.agent_phone
      : null, // Keep masked before acceptance
    rating: parseFloat(q.agent_rating || 5.0),
    completedJobs: q.agent_completed_jobs || 0,
    experienceYears: q.agent_experience || 0,
    trade: q.agent_trade,
    amount: parseFloat(q.amount),
    currency: q.currency || 'INR',
    providerNote: q.provider_note || q.message || '',
    etaMinutes: q.eta_minutes || q.estimated_duration_minutes || 30,
    warrantyDays: q.warranty_days || 30,
    status: q.status,
    createdAt: q.created_at,
    expiresAt: q.expires_at
  }));

  return {
    request: {
      id: sr.id,
      requestRef: sr.request_ref,
      serviceTitle: sr.service_title,
      category: sr.category,
      problemDescription: sr.problem_description,
      photos: sr.photos || [],
      address: sr.user_address,
      lat: sr.lat,
      lng: sr.lng,
      status: sr.status,
      otpCode: sr.otp_code,
      acceptedQuoteId: sr.accepted_quote_id,
      createdAt: sr.created_at,
      expiresAt: sr.expires_at
    },
    quotes
  };
}

export default {
  createServiceRequest,
  getRequestWithQuotes
};
