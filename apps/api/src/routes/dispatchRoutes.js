import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import {
  latLngToH3,
  findNearbyProviders,
  haversineDistance,
  findNearbyProvidersExpandingRadius,
  RADIUS_EXPANSION_TIERS_KM,
  getCityCoordinates
} from '../utils/geoDispatch.js';
import { notifyCustomer, notifyProvider, broadcastToProviders } from '../modules/realtime/realtimeService.js';
import { cleanupJobTracking, processLocationUpdate } from '../modules/tracking/trackingSocket.js';

const router = Router();

/**
 * Intelligent Category Classification & Disambiguation:
 * Inspects customer description and problem keywords to ensure plumbing vs electrical
 * issues are accurately routed to the correct trade professionals at the data level.
 */
export function classifyServiceCategory(description = '', title = '', requestedCategory = '') {
  const desc = (description || '').toLowerCase();
  const reqCat = (requestedCategory || '').toLowerCase();

  // Strong plumbing intent keywords in customer's actual description
  const isPlumbingDesc = /\b(pipe|pipes|leak|leaking|leakage|burst|tap|taps|faucet|faucets|drain|drains|drainage|sink|sinks|basin|toilet|toilets|flush|commode|shower|sewage|clog|clogged|blockage|water\s*pipe|water\s*leak|geyser\s*leak|plumb|plumber|pipeline|valve)\b/i.test(desc);

  // Strong electrical intent keywords in customer's actual description
  const isElectricalDesc = /\b(switch|switchboard|socket|sockets|power\s*point|short\s*circuit|mcb|fuse|wiring|wire|wires|shock|spark|sparks|sparking|fan|light|lights|bulb|voltage|tripping|inverter|electric|electrician)\b/i.test(desc);

  if (title && title.trim()) {
    if (reqCat.includes('plumb') || (isPlumbingDesc && !isElectricalDesc)) {
      return { category: 'plumber', serviceTitle: title.trim() };
    }
    if (reqCat.includes('electric') || (isElectricalDesc && !isPlumbingDesc)) {
      return { category: 'electrician', serviceTitle: title.trim() };
    }
    return { category: reqCat || 'electrician', serviceTitle: title.trim() };
  }

  if (isPlumbingDesc && !isElectricalDesc) {
    return {
      category: 'plumber',
      serviceTitle: 'Taps, Mixers & Showers'
    };
  }

  if (isElectricalDesc && !isPlumbingDesc) {
    return {
      category: 'electrician',
      serviceTitle: 'Switches & Sockets'
    };
  }

  // Fallback to requested category
  if (reqCat.includes('plumb')) {
    return { category: 'plumber', serviceTitle: 'Taps, Mixers & Showers' };
  }
  if (reqCat.includes('electric')) {
    return { category: 'electrician', serviceTitle: 'Switches & Sockets' };
  }

  return { category: reqCat || 'electrician', serviceTitle: 'General Service' };
}

/**
 * Format distance cleanly: under 1 km in meters ("~15 m away"), otherwise 1 decimal place ("~2.3 km away")
 */
export function formatDistance(distKm) {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return '~10 m away';
  const km = Number(distKm);
  if (km < 1) {
    const meters = Math.max(10, Math.round(km * 1000));
    return `~${meters} m away`;
  }
  return `~${km.toFixed(1)} km away`;
}

// =========================================================================
// 1. Create Service Request (Customer submits a problem + Proximity Matching)
// =========================================================================
router.post('/request', async (req, res) => {
  try {
    const {
      userId,
      userEmail,
      userName,
      userPhone,
      userAddress,
      lat,
      lng,
      serviceId,
      serviceTitle,
      category,
      issueType,
      problemDescription,
      problemTiming,
      problemFrequency,
      photos = [],
      role,
      userRole
    } = req.body;

    // Block agent accounts from creating customer requests
    const effectiveRole = (role || userRole || '').toLowerCase();
    if (effectiveRole === 'agent' || effectiveRole === 'partner') {
      return res.status(403).json({
        success: false,
        code: 'AGENT_CANNOT_REQUEST',
        message: 'Service requests are available from a customer account.'
      });
    }

    // Exclusive Job-Lock: Customer cannot create a new service request while having any request in Accepted or InProgress state
    if (userEmail || userId) {
      const activeCheck = await pool.query(
        `SELECT request_ref, service_title, status 
         FROM service_requests 
         WHERE (user_email = $1 OR (user_id = $2 AND $2 IS NOT NULL))
           AND LOWER(REPLACE(status, ' ', '_')) IN ('accepted', 'confirmed', 'en_route', 'on_the_way', 'otp_verified', 'arrived', 'in_progress')
         ORDER BY created_at DESC 
         LIMIT 1;`,
        [userEmail ? userEmail.toLowerCase().trim() : null, (userId && !isNaN(parseInt(userId, 10))) ? parseInt(userId, 10) : null]
      );
      if (activeCheck.rows.length > 0) {
        const activeReq = activeCheck.rows[0];
        const errMsg = `CUSTOMER_LOCKED: You currently have an active service job in progress (${activeReq.request_ref}: ${activeReq.service_title}). You cannot request another service until this job is completed.`;
        return res.status(403).json({
          success: false,
          code: 'CUSTOMER_LOCKED',
          error: errMsg,
          message: errMsg,
          activeRequestRef: activeReq.request_ref,
          activeStatus: activeReq.status
        });
      }
    }

    // Customer problem description (only saved when customer actually wrote one)
    const description = (problemDescription || '').trim();

    const address = (userAddress || '').trim() || (lat && lng ? `GPS Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '');
    if (!address) {
      return res.status(400).json({
        success: false,
        code: 'ADDRESS_REQUIRED',
        error: 'A valid service address or current location is required.'
      });
    }

    // Generate identifiers (requestRef is plain numeric internal DB identifier e.g. 2026000001)
    let requestRef;
    try {
      const seqRes = await pool.query("SELECT next_entity_code('service_request', 6);");
      requestRef = seqRes.rows[0].next_entity_code;
    } catch {
      requestRef = `${new Date().getFullYear()}${String(Date.now() % 1000000).padStart(6, '0')}`;
    }
    const otpCode = `${Math.floor(1000 + Math.random() * 9000)}`;
    const numLat = typeof lat === 'number' ? lat : (lat ? parseFloat(lat) : null);
    const numLng = typeof lng === 'number' ? lng : (lng ? parseFloat(lng) : null);
    const h3Index = (numLat !== null && numLng !== null && !isNaN(numLat) && !isNaN(numLng))
      ? latLngToH3(numLat, numLng)
      : null;
    const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);

    // Catalog service title and category is the single source of truth
    const classified = classifyServiceCategory(description, serviceTitle, category);
    const finalCategory = (category && category !== 'general-service') ? category : classified.category;
    const finalServiceTitle = (serviceTitle && serviceTitle.trim()) || classified.serviceTitle;

    let resolvedServiceId = null;
    if (typeof serviceId === 'number' || (typeof serviceId === 'string' && /^\d+$/.test(serviceId))) {
      resolvedServiceId = parseInt(serviceId, 10);
    } else if (typeof serviceId === 'string' && serviceId !== 'general-service') {
      try {
        const sRes = await pool.query('SELECT id FROM services WHERE slug = $1 LIMIT 1;', [serviceId]);
        if (sRes.rows.length > 0) resolvedServiceId = sRes.rows[0].id;
      } catch {}
    }

    const result = await pool.query(`
      INSERT INTO service_requests (
        request_ref, user_id, user_email, user_name, user_phone, user_address,
        lat, lng, h3_index_res9,
        service_id, service_title, category, issue_type,
        problem_description, problem_timing, problem_frequency, photos,
        otp_code, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17::jsonb,
        $18, 'Open'
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
      h3Index,
      resolvedServiceId,
      finalServiceTitle,
      finalCategory,
      issueType || 'Inspection & Repair',
      description,
      problemTiming || 'Not specified',
      problemFrequency || 'Not specified',
      photosJson,
      otpCode
    ]);

    const sr = result.rows[0];

    // Server-side Expanding-Radius Proximity Matching (1 km -> 3 km -> 5 km -> 10 km)
    let matchSummary = {
      matched: false,
      matchedTierKm: null,
      tiersSearched: [1, 3, 5, 10],
      totalMatched: 0,
      message: 'No certified pros are available in your area right now — we\'ll notify you the moment one is.'
    };

    if (numLat !== null && numLng !== null && !isNaN(numLat) && !isNaN(numLng)) {
      const matchResult = await findNearbyProvidersExpandingRadius(
        numLat,
        numLng,
        sr.category,
        RADIUS_EXPANSION_TIERS_KM
      );

      if (matchResult.matched) {
        matchSummary = {
          matched: true,
          matchedTierKm: matchResult.matchedTierKm,
          tiersSearched: matchResult.tiersSearched,
          totalMatched: matchResult.totalMatched,
          message: `Dispatched to ${matchResult.totalMatched} verified pro${matchResult.totalMatched > 1 ? 's' : ''} within ${matchResult.matchedTierKm} km.`
        };
      } else {
        matchSummary = {
          matched: false,
          matchedTierKm: null,
          tiersSearched: matchResult.tiersSearched,
          totalMatched: 0,
          message: 'No certified pros are available in your area right now — we\'ll notify you the moment one is.'
        };
      }
    }

    return res.status(201).json({
      success: true,
      message: matchSummary.matched
        ? `Service request created. ${matchSummary.message}`
        : 'Service request created. Finding available professionals in your area.',
      matchSummary,
      request: {
        id: sr.id,
        requestRef: sr.request_ref,
        serviceTitle: sr.service_title,
        category: sr.category,
        issueType: sr.issue_type,
        problemDescription: sr.problem_description,
        problemTiming: sr.problem_timing,
        problemFrequency: sr.problem_frequency,
        photos: sr.photos || [],
        status: sr.status,
        otpCode: sr.otp_code,
        address: sr.user_address,
        userName: sr.user_name,
        userEmail: sr.user_email,
        userPhone: sr.user_phone,
        lat: sr.lat,
        lng: sr.lng,
        matchSummary,
        createdAt: sr.created_at,
        expiresAt: sr.expires_at
      }
    });
  } catch (err) {
    console.error('Create service request error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 1b. Proximity-based Expanding Radius Matching Query Endpoint
// =========================================================================
router.post('/match-providers', async (req, res) => {
  try {
    const { lat, lng, category = 'electrician', tiers = RADIUS_EXPANSION_TIERS_KM } = req.body;

    const numLat = typeof lat === 'number' ? lat : parseFloat(lat);
    const numLng = typeof lng === 'number' ? lng : parseFloat(lng);

    if (isNaN(numLat) || isNaN(numLng)) {
      return res.status(400).json({
        success: false,
        error: 'Valid numeric latitude and longitude coordinates are required for proximity matching.'
      });
    }

    const matchResult = await findNearbyProvidersExpandingRadius(numLat, numLng, category, tiers);

    return res.json({
      success: true,
      ...matchResult,
      message: matchResult.matched
        ? `Found ${matchResult.totalMatched} certified pros in ${matchResult.matchedTierKm} km radius.`
        : 'No certified pros are available in your area right now — we\'ll notify you the moment one is.'
    });
  } catch (err) {
    console.error('Proximity matching error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 2. Get Service Request by Reference
// =========================================================================
router.get('/request/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    const result = await pool.query(
      'SELECT * FROM service_requests WHERE request_ref = $1 LIMIT 1;',
      [ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service request not found.' });
    }

    const sr = result.rows[0];

    // If a quote was accepted, fetch accepted provider info
    let acceptedProvider = null;
    if (sr.accepted_quote_id) {
      const quoteRes = await pool.query(
        'SELECT * FROM quotes WHERE id = $1 LIMIT 1;',
        [sr.accepted_quote_id]
      );
      if (quoteRes.rows.length > 0) {
        const q = quoteRes.rows[0];
        acceptedProvider = {
          quoteId: q.id,
          agentName: q.agent_name,
          agentPhone: q.agent_phone,
          agentEmail: q.agent_email,
          amount: q.amount,
          estimatedDuration: q.estimated_duration_minutes,
          message: q.message
        };
      }
    }

    return res.json({
      success: true,
      request: {
        id: sr.id,
        requestRef: sr.request_ref,
        serviceTitle: sr.service_title,
        category: sr.category,
        issueType: sr.issue_type,
        problemDescription: sr.problem_description,
        problemTiming: sr.problem_timing,
        problemFrequency: sr.problem_frequency,
        photos: sr.photos || [],
        status: sr.status,
        otpCode: sr.otp_code,
        address: sr.user_address,
        userName: sr.user_name,
        userEmail: sr.user_email,
        userPhone: sr.user_phone,
        lat: sr.lat,
        lng: sr.lng,
        acceptedProvider,
        createdAt: sr.created_at,
        expiresAt: sr.expires_at
      }
    });
  } catch (err) {
    console.error('Get service request error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 3. Customer's Service Requests List
// =========================================================================
router.get('/my-requests', async (req, res) => {
  try {
    const { email, userId } = req.query;

    if (!email && !userId) {
      return res.json({ success: true, requests: [] });
    }

    const numericUserId = (userId && !isNaN(parseInt(userId, 10))) ? parseInt(userId, 10) : null;

    const result = await pool.query(`
      SELECT sr.*,
             (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id AND q.status = 'Pending') AS pending_quotes_count,
             (SELECT json_agg(json_build_object(
               'quoteId', q.id,
               'agentName', q.agent_name,
               'agentPhone', q.agent_phone,
               'agentEmail', q.agent_email,
               'agentId', q.agent_id,
               'agentRating', (SELECT a.rating FROM agent_login a WHERE a.id = q.agent_id),
               'agentCompletedJobs', COALESCE((SELECT a.completed_jobs FROM agent_login a WHERE a.id = q.agent_id), 0),
               'agentTrade', COALESCE((SELECT a.trade FROM agent_login a WHERE a.id = q.agent_id), 'Professional'),
               'amount', q.amount,
               'estimatedDuration', q.estimated_duration_minutes,
               'etaMinutes', COALESCE(q.eta_minutes, q.estimated_duration_minutes, 30),
               'message', COALESCE(q.message, q.provider_note, ''),
               'providerNote', COALESCE(q.provider_note, q.message, ''),
               'status', q.status,
               'createdAt', q.created_at
             ) ORDER BY q.amount ASC) FROM quotes q WHERE q.request_id = sr.id) AS quotes,
             (SELECT a.lat FROM agent_login a WHERE a.id = sr.assigned_professional_id) AS pro_lat,
             (SELECT a.lng FROM agent_login a WHERE a.id = sr.assigned_professional_id) AS pro_lng,
             (SELECT a.trade FROM agent_login a WHERE a.id = sr.assigned_professional_id) AS pro_trade,
             (SELECT a.rating FROM agent_login a WHERE a.id = sr.assigned_professional_id) AS pro_rating,
             (SELECT a.completed_jobs FROM agent_login a WHERE a.id = sr.assigned_professional_id) AS pro_completed_jobs
      FROM service_requests sr
      WHERE ($1::varchar IS NOT NULL AND sr.user_email = $1)
         OR ($2::int IS NOT NULL AND sr.user_id = $2)
      ORDER BY sr.created_at DESC;
    `, [email || null, numericUserId]);

    const formatted = result.rows.map(sr => {
      // Get accepted provider details if available
      let acceptedProvider = null;
      if (sr.accepted_quote_id && Array.isArray(sr.quotes)) {
        const accepted = sr.quotes.find(q => q.quoteId === sr.accepted_quote_id);
        if (accepted) {
          acceptedProvider = { ...accepted };
        }
      }
      if (acceptedProvider) {
        if (sr.pro_lat !== undefined && sr.pro_lat !== null) acceptedProvider.lat = parseFloat(sr.pro_lat);
        if (sr.pro_lng !== undefined && sr.pro_lng !== null) acceptedProvider.lng = parseFloat(sr.pro_lng);
        if (sr.pro_trade) acceptedProvider.trade = sr.pro_trade;
        acceptedProvider.rating = sr.pro_rating !== null && sr.pro_rating !== undefined ? parseFloat(sr.pro_rating) : null;
        acceptedProvider.completedJobs = sr.pro_completed_jobs || 0;
      }

      // Timeout Safeguard (Accepted for >2 hours without door OTP)
      let isDelayed = false;
      let delayStatus = null;
      if (
        (sr.status === 'Accepted' || (sr.status === 'En Route' && !sr.otp_verified)) &&
        sr.updated_at
      ) {
        const timeElapsedMs = Date.now() - new Date(sr.updated_at).getTime();
        if (timeElapsedMs > 2 * 60 * 60 * 1000) {
          isDelayed = true;
          delayStatus = 'Delayed — awaiting confirmation';
        }
      }

      return {
        id: sr.id,
        requestRef: sr.request_ref,
        serviceTitle: sr.service_title,
        category: sr.category,
        issueType: sr.issue_type,
        problemDescription: sr.problem_description,
        problemTiming: sr.problem_timing,
        problemFrequency: sr.problem_frequency,
        photos: sr.photos || [],
        status: sr.status,
        otpCode: sr.otp_code,
        address: sr.user_address,
        userName: sr.user_name,
        userEmail: sr.user_email,
        userPhone: sr.user_phone,
        lat: sr.lat,
        lng: sr.lng,
        pendingQuotesCount: parseInt(sr.pending_quotes_count || '0', 10),
        quotes: sr.quotes || [],
        acceptedProvider,
        isDelayed,
        delayStatus,
        completionPhotos: sr.completion_photos || [],
        completionRemarks: sr.completion_remarks || '',
        startedAt: sr.started_at,
        arrivedAt: sr.arrived_at,
        completedAt: sr.completed_at,
        rating: sr.rating,
        ratingFeedback: sr.rating_feedback,
        createdAt: sr.created_at,
        expiresAt: sr.expires_at
      };
    });

    return res.json({ success: true, requests: formatted });
  } catch (err) {
    console.error('Fetch my-requests error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 4. Cancel Service Request (Handles both Customer & Professional cancellation)
// =========================================================================
async function handleCancelRequest(req, res) {
  try {
    const { ref } = req.params;
    const { reason, cancelledBy, role, actor, agentEmail } = req.body || {};

    const isProviderCancelling =
      cancelledBy === 'provider' ||
      cancelledBy === 'agent' ||
      cancelledBy === 'partner' ||
      role === 'provider' ||
      role === 'agent' ||
      role === 'partner' ||
      actor === 'provider';

    // Lookup service request
    const srRes = await pool.query(
      'SELECT * FROM service_requests WHERE request_ref = $1 LIMIT 1;',
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service request not found.' });
    }
    const sr = srRes.rows[0];

    if (sr.status === 'Completed') {
      return res.status(400).json({ success: false, error: 'Completed service requests cannot be cancelled.' });
    }
    if (sr.status === 'Cancelled') {
      return res.status(400).json({ success: false, error: 'Service request is already cancelled.' });
    }

    if (isProviderCancelling) {
      // -------------------------------------------------------------------
      // 1. PROFESSIONAL CANCELS:
      // Request reopens as 'Open', re-broadcast to other nearby verified
      // professionals automatically, reusing same reference ID, description,
      // and attached photos. Customer is NOT asked to rebook.
      // -------------------------------------------------------------------
      let assignedAgentId = null;
      if (sr.accepted_quote_id) {
        const qRes = await pool.query(
          "UPDATE quotes SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING agent_id, agent_email;",
          [sr.accepted_quote_id]
        );
        if (qRes.rows.length > 0) {
          assignedAgentId = qRes.rows[0].agent_id;
          // Unlock the professional immediately
          await pool.query(
            "UPDATE agent_login SET availability_status = 'AVAILABLE', is_online = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
            [assignedAgentId]
          );
        }
      }

      // Reopen request as Open
      const updatedSr = await pool.query(`
        UPDATE service_requests
        SET status = 'Open',
            accepted_quote_id = NULL,
            assigned_professional_id = NULL,
            otp_verified = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `, [sr.id]);

      // Associated booking is reset/reopened
      await pool.query(`
        UPDATE bookings
        SET status = 'Reopened',
            accepted_quote_id = NULL,
            assigned_agent_id = NULL,
            technician_name = NULL,
            technician_phone = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE request_id = $1 OR booking_ref = $2;
      `, [sr.id, ref]);

      // Audit event
      await pool.query(`
        INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
        VALUES ($1, 'provider', $2, 'PROVIDER_CANCELLED_REBROADCAST', $3::jsonb);
      `, [sr.id, String(assignedAgentId || agentEmail || 'provider'), JSON.stringify({ reason: reason || 'Professional cancelled assignment' })]);

      // Automatic RE-BROADCAST to nearby verified professionals
      if (sr.lat && sr.lng) {
        try {
          const { dispatchProgressiveWave } = await import('../modules/dispatch/dispatchService.js');
          await dispatchProgressiveWave(sr.id, 500);
        } catch (waveErr) {
          console.warn('Re-broadcast progressive wave notice:', waveErr.message);
        }
      }

      broadcastToProviders('request.dispatched', {
        requestRef: sr.request_ref,
        serviceTitle: sr.service_title,
        category: sr.category,
        problemDescription: sr.problem_description,
        photos: sr.photos,
        userAddress: sr.user_address,
        lat: sr.lat,
        lng: sr.lng,
        message: 'Service request re-broadcasted for dispatch.',
        timestamp: new Date().toISOString()
      });

      // Notify customer that professional cancelled and job was auto-rebroadcast
      notifyCustomer(ref, 'request.provider_cancelled', {
        requestRef: ref,
        status: 'Open',
        message: 'Assigned professional had to cancel. Your request has been automatically re-broadcast to nearby verified professionals. You do not need to rebook.',
        timestamp: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Assignment cancelled. Request automatically re-broadcast to nearby professionals.',
        request: {
          requestRef: ref,
          status: 'Open',
          rebroadcast: true
        }
      });
    } else {
      // -------------------------------------------------------------------
      // 2. CUSTOMER CANCELS:
      // Request closes, professional unlocks, no re-broadcast.
      // -------------------------------------------------------------------
      if (sr.accepted_quote_id) {
        const qRes = await pool.query(
          "UPDATE quotes SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING agent_id, agent_email;",
          [sr.accepted_quote_id]
        );
        if (qRes.rows.length > 0) {
          // Unlock professional immediately
          await pool.query(
            "UPDATE agent_login SET availability_status = 'AVAILABLE', is_online = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
            [qRes.rows[0].agent_id]
          );
          if (qRes.rows[0].agent_email) {
            notifyProvider(qRes.rows[0].agent_email, 'job.cancelled', {
              requestRef: ref,
              message: 'Job was cancelled by customer.',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Mark all pending quotes Withdrawn
      await pool.query(
        "UPDATE quotes SET status = 'Withdrawn', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 AND status IN ('Pending', 'SUBMITTED', 'Viewed');",
        [sr.id]
      );

      // Close request
      await pool.query(
        `UPDATE service_requests
         SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [sr.id]
      );

      // Close booking
      await pool.query(
        "UPDATE bookings SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 OR booking_ref = $2;",
        [sr.id, ref]
      );

      notifyCustomer(ref, 'status.cancelled', {
        requestRef: ref,
        status: 'Cancelled',
        message: 'Service request has been cancelled.',
        timestamp: new Date().toISOString()
      });

      broadcastToProviders('request.cancelled', {
        requestRef: ref,
        message: 'Request was cancelled by customer.',
        timestamp: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: 'Service request cancelled.',
        request: { requestRef: ref, status: 'Cancelled' }
      });
    }
  } catch (err) {
    console.error('Cancel request error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.patch('/request/:ref/cancel', handleCancelRequest);
router.post('/request/:ref/cancel', handleCancelRequest);

// =========================================================================
// Customer Logout Cleanup: Automatically invalidates & deletes unassigned requests
// =========================================================================
export async function handleCustomerLogoutCleanup({ email, userId }) {
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const numericId = (userId && !isNaN(parseInt(userId, 10))) ? parseInt(userId, 10) : null;

  if (!cleanEmail && !numericId) {
    return { success: false, error: 'Customer identifier (email or userId) required.' };
  }

  // 1. Find all open/unaccepted service requests for this customer
  const srRes = await pool.query(`
    SELECT id, request_ref, service_request_code, service_title, category
    FROM service_requests
    WHERE (
      (user_email = $1 AND $1 IS NOT NULL) OR
      (user_id = $2 AND $2 IS NOT NULL)
    )
    AND LOWER(REPLACE(status, ' ', '_')) IN ('open', 'pending', 'quoting', 'quoted');
  `, [cleanEmail, numericId]);

  const removedRequests = [];

  for (const sr of srRes.rows) {
    const ref = sr.request_ref || sr.service_request_code;

    // Delete quotes for this request
    await pool.query('DELETE FROM quotes WHERE request_id = $1;', [sr.id]);

    // Delete unconfirmed bookings
    await pool.query(`
      DELETE FROM bookings 
      WHERE (request_id = $1 OR booking_ref = $2)
        AND LOWER(status) IN ('open', 'pending', 'confirmed');
    `, [sr.id, ref]);

    // Delete request itself from database
    await pool.query('DELETE FROM service_requests WHERE id = $1;', [sr.id]);

    // Broadcast cancellation to providers so live feeds immediately remove it
    broadcastToProviders('request.cancelled', {
      requestRef: ref,
      serviceTitle: sr.service_title,
      category: sr.category,
      message: 'Request was automatically removed because customer logged out.',
      timestamp: new Date().toISOString()
    });

    removedRequests.push(ref);
  }

  // Also clean any orphaned open/pending bookings for this customer
  await pool.query(`
    DELETE FROM bookings
    WHERE (
      (user_email = $1 AND $1 IS NOT NULL) OR
      (user_id = $2 AND $2 IS NOT NULL)
    )
    AND LOWER(status) IN ('open', 'pending');
  `, [cleanEmail, numericId]);

  return {
    success: true,
    message: 'Customer logged out. All open unassigned requests invalidated and removed from database.',
    removedRequests,
    removedCount: removedRequests.length
  };
}

router.post('/customer-logout', async (req, res) => {
  try {
    const { email, userId } = req.body || {};
    const result = await handleCustomerLogoutCleanup({ email, userId });
    return res.json(result);
  } catch (err) {
    console.error('Customer logout error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// Timeout Safeguard Action: Customer triggers Cancel & Re-broadcast
// =========================================================================
router.post('/request/:ref/rebroadcast', async (req, res) => {
  try {
    const { ref } = req.params;
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(REPLACE(status, ' ', '_')) IN ('accepted', 'confirmed', 'en_route', 'on_the_way') LIMIT 1;",
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in Accepted state.' });
    }
    const sr = srRes.rows[0];

    // Unlock current provider
    if (sr.accepted_quote_id) {
      const qRes = await pool.query(
        "UPDATE quotes SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING agent_id, agent_email;",
        [sr.accepted_quote_id]
      );
      if (qRes.rows.length > 0) {
        await pool.query(
          "UPDATE agent_login SET availability_status = 'AVAILABLE', is_online = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
          [qRes.rows[0].agent_id]
        );
        if (qRes.rows[0].agent_email) {
          notifyProvider(qRes.rows[0].agent_email, 'job.cancelled', {
            requestRef: ref,
            message: 'Customer re-broadcasted the request due to arrival delay.',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Reset request to Open
    await pool.query(
      "UPDATE service_requests SET status = 'Open', accepted_quote_id = NULL, assigned_professional_id = NULL, otp_verified = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [sr.id]
    );

    // Reopen booking
    await pool.query(
      "UPDATE bookings SET status = 'Reopened', accepted_quote_id = NULL, assigned_agent_id = NULL, technician_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 OR booking_ref = $2;",
      [sr.id, ref]
    );

    // Re-broadcast
    if (sr.lat && sr.lng) {
      try {
        const { dispatchProgressiveWave } = await import('../modules/dispatch/dispatchService.js');
        await dispatchProgressiveWave(sr.id, 500);
      } catch (err) {}
    }
    broadcastToProviders('request.dispatched', {
      requestRef: sr.request_ref,
      serviceTitle: sr.service_title,
      category: sr.category,
      problemDescription: sr.problem_description,
      photos: sr.photos,
      userAddress: sr.user_address,
      lat: sr.lat,
      lng: sr.lng,
      message: 'Service request re-broadcasted for dispatch.',
      timestamp: new Date().toISOString()
    });

    notifyCustomer(ref, 'status.rebroadcast', {
      requestRef: ref,
      status: 'Open',
      message: 'Request re-broadcasted to nearby verified professionals.',
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Request re-broadcasted successfully.',
      request: { requestRef: ref, status: 'Open', isDelayed: false }
    });
  } catch (err) {
    console.error('Rebroadcast error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 5. Nearby Open Requests for Provider (H3 dispatch)
// =========================================================================
router.get('/nearby-requests', async (req, res) => {
  try {
    const { email, lat, lng, radiusKm } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    // Fetch the provider's profile for trade and location
    const agentRes = await pool.query(
      'SELECT id, trade, lat, lng, h3_index_res9, is_online FROM agent_login WHERE email = $1 LIMIT 1;',
      [email.toLowerCase()]
    );

    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider profile not found.' });
    }

    const agent = agentRes.rows[0];

    // Mutual Exclusivity Guard: If provider currently has an active engaged job, do not assign or dispatch any new services
    const activeJobCheck = await pool.query(`
      SELECT sr.request_ref, sr.service_title, sr.status
      FROM service_requests sr
      JOIN quotes q ON q.id = sr.accepted_quote_id
      WHERE q.agent_id = $1
        AND LOWER(REPLACE(sr.status, ' ', '_')) IN ('accepted', 'confirmed', 'en_route', 'on_the_way', 'otp_verified', 'in_progress')
      LIMIT 1;
    `, [agent.id]);

    if (activeJobCheck.rows.length > 0) {
      const activeJob = activeJobCheck.rows[0];
      return res.json({
        success: true,
        requests: [],
        isBusy: true,
        activeJobRef: activeJob.request_ref,
        activeJobTitle: activeJob.service_title,
        activeJobStatus: activeJob.status,
        notice: `You are currently engaged on active job ${activeJob.request_ref} (${activeJob.service_title}). No new requests will be assigned until this service is completed.`
      });
    }

    const parsedLat = (lat !== undefined && lat !== null && lat !== '' && lat !== 'undefined' && lat !== 'null') ? parseFloat(lat) : NaN;
    const parsedLng = (lng !== undefined && lng !== null && lng !== '' && lng !== 'undefined' && lng !== 'null') ? parseFloat(lng) : NaN;

    const agentLat = (!isNaN(parsedLat)) ? parsedLat : (agent.lat ? parseFloat(agent.lat) : null);
    const agentLng = (!isNaN(parsedLng)) ? parsedLng : (agent.lng ? parseFloat(agent.lng) : null);
    const maxRadius = radiusKm ? parseFloat(radiusKm) : 10;

    // If provider has no location set, return empty
    if (!agentLat || !agentLng || isNaN(agentLat) || isNaN(agentLng)) {
      return res.json({ success: true, requests: [], notice: 'Please update your location to see nearby requests.' });
    }

    // Query all real open customer requests matching provider's trade
    const tradeFilter = (agent.trade && agent.trade !== 'both')
      ? `AND (sr.category = $2 OR sr.category = 'both')`
      : '';
    const params = (agent.trade && agent.trade !== 'both')
      ? [agent.id, agent.trade]
      : [agent.id];

    const result = await pool.query(`
      SELECT sr.*, 
             (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id) AS total_quotes,
             (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id AND q.agent_id = $1) AS my_quotes
      FROM service_requests sr
      WHERE LOWER(sr.status) IN ('open', 'quoting')
        AND sr.lat IS NOT NULL
        AND sr.lng IS NOT NULL
        ${tradeFilter}
      ORDER BY sr.created_at DESC;
    `, params);
    const requests = result.rows;

    // Haversine filter and distance annotation
    const withDistance = requests
      .map(sr => {
        const rawDist = haversineDistance(agentLat, agentLng, parseFloat(sr.lat), parseFloat(sr.lng));
        const formattedDist = formatDistance(rawDist);
        return {
          id: sr.id,
          requestRef: sr.request_ref,
          serviceTitle: sr.service_title,
          category: sr.category,
          issueType: sr.issue_type,
          problemDescription: sr.problem_description,
          problemTiming: sr.problem_timing,
          problemFrequency: sr.problem_frequency,
          photos: sr.photos || [],
          status: sr.status,
          // Show area, not exact address, for privacy before quote acceptance
          area: sr.user_address ? sr.user_address.split(',').slice(-2).join(',').trim() : 'Nearby',
          lat: sr.lat,
          lng: sr.lng,
          totalQuotes: parseInt(sr.total_quotes || '0', 10),
          alreadyQuoted: parseInt(sr.my_quotes || '0', 10) > 0,
          createdAt: sr.created_at,
          expiresAt: sr.expires_at,
          distanceKm: parseFloat(rawDist.toFixed(4)),
          formattedDistance: formattedDist
        };
      })
      .filter(r => r.distanceKm <= maxRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.json({ success: true, requests: withDistance });
  } catch (err) {
    console.error('Nearby requests error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 6. Provider Submits a Quote
// =========================================================================
router.post('/quote', async (req, res) => {
  try {
    const { requestRef, agentEmail, amount, estimatedDuration, message } = req.body;

    if (!requestRef || !agentEmail) {
      return res.status(400).json({ success: false, error: 'Request ref and provider email are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Quote amount must be a positive number.' });
    }

    // Lookup the service request
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(status) IN ('open', 'quoting') LIMIT 1;",
      [requestRef]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service request not found or no longer accepting quotes.' });
    }
    const sr = srRes.rows[0];

    // Lookup the provider
    const agentRes = await pool.query(
      'SELECT id, name, email, phone, trade FROM agent_login WHERE email = $1 LIMIT 1;',
      [agentEmail.toLowerCase()]
    );
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider account not found.' });
    }
    const agent = agentRes.rows[0];

    // Mutual Exclusivity Guard: Provider cannot submit quotes if already busy on an active job
    const providerBusyCheck = await pool.query(`
      SELECT sr.request_ref, sr.service_title 
      FROM service_requests sr
      JOIN quotes q ON q.id = sr.accepted_quote_id
      WHERE q.agent_id = $1
        AND LOWER(REPLACE(sr.status, ' ', '_')) IN ('accepted', 'confirmed', 'en_route', 'on_the_way', 'otp_verified', 'in_progress')
      LIMIT 1;
    `, [agent.id]);

    if (providerBusyCheck.rows.length > 0) {
      const busyJob = providerBusyCheck.rows[0];
      return res.status(409).json({
        success: false,
        code: 'PROVIDER_BUSY',
        error: `You are currently engaged on active service ${busyJob.request_ref} (${busyJob.service_title}). You cannot submit quotes for other jobs until your ongoing job is completed end-to-end.`
      });
    }

    // Prevent duplicate quotes from the same provider
    const existingQuote = await pool.query(
      'SELECT id FROM quotes WHERE request_id = $1 AND agent_id = $2 LIMIT 1;',
      [sr.id, agent.id]
    );
    if (existingQuote.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'You have already submitted a quote for this request.' });
    }

    // Insert the quote
    const quoteResult = await pool.query(`
      INSERT INTO quotes (request_id, agent_id, agent_email, agent_name, agent_phone, amount, estimated_duration_minutes, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [
      sr.id,
      agent.id,
      agent.email,
      agent.name,
      agent.phone || '',
      parsedAmount,
      parseInt(estimatedDuration || 30, 10),
      (message || '').trim()
    ]);

    // Transition request status to Quoting if it was Open
    if (sr.status?.toLowerCase() === 'open') {
      await pool.query(
        "UPDATE service_requests SET status = 'Quoting', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [sr.id]
      );
    }

    const q = quoteResult.rows[0];

    // Realtime Notifications for Quote Interaction
    notifyCustomer(sr.request_ref, 'quote.received', {
      quoteId: q.id,
      requestRef,
      agentName: q.agent_name,
      amount: q.amount,
      estimatedDuration: q.estimated_duration_minutes,
      message: q.message,
      serviceTitle: sr.service_title,
      timestamp: new Date().toISOString()
    });
    notifyProvider(agent.email, 'quote.dispatched', {
      quoteId: q.id,
      requestRef,
      amount: q.amount,
      serviceTitle: sr.service_title,
      timestamp: new Date().toISOString()
    });
    return res.status(201).json({
      success: true,
      message: 'Quote submitted successfully.',
      quote: {
        quoteId: q.id,
        requestRef: requestRef,
        agentName: q.agent_name,
        amount: q.amount,
        estimatedDuration: q.estimated_duration_minutes,
        message: q.message,
        status: q.status,
        createdAt: q.created_at
      }
    });
  } catch (err) {
    console.error('Submit quote error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 7. Customer Views Quotes for a Request
// =========================================================================
router.get('/request/:ref/quotes', async (req, res) => {
  try {
    const { ref } = req.params;

    const srRes = await pool.query(
      'SELECT id FROM service_requests WHERE request_ref = $1 LIMIT 1;',
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service request not found.' });
    }

    const quotesRes = await pool.query(`
      SELECT q.*, a.rating AS agent_rating, a.completed_jobs AS agent_completed_jobs,
             a.experience_years AS agent_experience, a.trade AS agent_trade
      FROM quotes q
      JOIN agent_login a ON a.id = q.agent_id
      WHERE q.request_id = $1
      ORDER BY q.amount ASC;
    `, [srRes.rows[0].id]);

    const quotes = quotesRes.rows.map(q => ({
      quoteId: q.id,
      agentId: q.agent_id,
      agentName: q.agent_name,
      agentPhone: q.agent_phone,
      agentEmail: q.agent_email,
      agentRating: parseFloat(q.agent_rating || 5.0),
      agentCompletedJobs: q.agent_completed_jobs || 0,
      agentExperience: q.agent_experience || 0,
      agentTrade: q.agent_trade,
      amount: parseFloat(q.amount),
      estimatedDuration: q.estimated_duration_minutes,
      message: q.message || '',
      status: q.status,
      createdAt: q.created_at
    }));

    return res.json({ success: true, quotes });
  } catch (err) {
    console.error('Fetch quotes error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 8. Customer Accepts a Quote (Atomic PostgreSQL Transaction)
// =========================================================================
router.post('/quote/:quoteId/accept', async (req, res) => {
  const client = await pool.connect();
  try {
    const quoteId = parseInt(req.params.quoteId, 10);
    if (!quoteId) {
      return res.status(400).json({ success: false, error: 'Valid quote ID is required.' });
    }

    await client.query('BEGIN');

    // 1. Lock and fetch the quote
    const quoteRes = await client.query(
      'SELECT * FROM quotes WHERE id = $1 FOR UPDATE;',
      [quoteId]
    );
    if (quoteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Quote not found.' });
    }
    const quote = quoteRes.rows[0];

    // 2. Lock and fetch the associated service request
    const srRes = await client.query(
      'SELECT * FROM service_requests WHERE id = $1 FOR UPDATE;',
      [quote.request_id]
    );
    if (srRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Associated service request not found.' });
    }
    const sr = srRes.rows[0];

    // Concurrency check: Ensure request is still open for quotes
    if (sr.status?.toLowerCase() !== 'open' && sr.status?.toLowerCase() !== 'quoting') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'REQUEST_ALREADY_ACCEPTED',
        error: `Service request is in '${sr.status}' state and is no longer accepting quotes.`
      });
    }

    // 3. Mark selected quote ACCEPTED
    await client.query(
      "UPDATE quotes SET status = 'Accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [quoteId]
    );

    // 4. Auto-withdraw all other pending quotes on this request from other professionals
    await client.query(
      "UPDATE quotes SET status = 'Withdrawn', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 AND id != $2 AND status IN ('Pending', 'SUBMITTED', 'Viewed', 'Declined');",
      [sr.id, quoteId]
    );

    // 5. Update service_requests status to Accepted and record assigned professional
    let assignedProId = quote.professional_id || quote.agent_id;
    if (quote.agent_email) {
      const pRes = await client.query('SELECT id FROM professionals WHERE email = $1 LIMIT 1;', [quote.agent_email]);
      if (pRes.rows.length > 0) assignedProId = pRes.rows[0].id;
    }
    await client.query(
      "UPDATE service_requests SET status = 'Accepted', accepted_quote_id = $1, assigned_professional_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
      [quoteId, assignedProId, sr.id]
    );

    // 6. Force-lock accepted professional to BUSY and remove from live dispatch pool
    await client.query(
      "UPDATE agent_login SET availability_status = 'BUSY', is_online = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [quote.agent_id]
    );

    // 6. Create or synchronize canonical Work Order in bookings table
    const existingBooking = await client.query(
      'SELECT id, booking_ref FROM bookings WHERE request_id = $1 OR booking_ref = $2 LIMIT 1;',
      [sr.id, sr.request_ref]
    );

    let bookingRef = sr.request_ref;
    let bookingId = null;

    if (existingBooking.rows.length > 0) {
      bookingId = existingBooking.rows[0].id;
      bookingRef = existingBooking.rows[0].booking_ref;
      await client.query(`
        UPDATE bookings SET
          status = 'Confirmed',
          accepted_quote_id = $1,
          assigned_agent_id = $2,
          technician_name = $3,
          technician_phone = $4,
          total_amount = $5,
          eta_minutes = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $7;
      `, [
        quoteId,
        quote.agent_id,
        quote.agent_name,
        quote.agent_phone || '',
        quote.amount,
        quote.estimated_duration_minutes || 30,
        bookingId
      ]);
    } else {
      const insBooking = await client.query(`
        INSERT INTO bookings (
          booking_ref, user_id, user_email, user_name, user_phone, user_address,
          service_id, service_title, category, problem_description, photos,
          total_amount, otp_code, status,
          technician_name, technician_phone, eta_minutes,
          request_id, accepted_quote_id, assigned_agent_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11::jsonb,
          $12, $13, 'Confirmed',
          $14, $15, $16,
          $17, $18, $19
        ) RETURNING id, booking_ref;
      `, [
        sr.request_ref,
        sr.user_id,
        sr.user_email,
        sr.user_name,
        sr.user_phone,
        sr.user_address,
        sr.service_id,
        sr.service_title,
        sr.category,
        sr.problem_description,
        JSON.stringify(sr.photos || []),
        quote.amount,
        sr.otp_code,
        quote.agent_name,
        quote.agent_phone || '',
        quote.estimated_duration_minutes || 30,
        sr.id,
        quoteId,
        quote.agent_id
      ]);
      bookingId = insBooking.rows[0].id;
      bookingRef = insBooking.rows[0].booking_ref;
    }

    // 7. Audit log in job_events
    await client.query(`
      INSERT INTO job_events (booking_id, request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, $2, 'customer', $3, 'QUOTE_ACCEPTED', $4::jsonb);
    `, [
      bookingId,
      sr.id,
      String(sr.user_id || sr.user_email || 'customer'),
      JSON.stringify({
        quoteId,
        agentId: quote.agent_id,
        agentName: quote.agent_name,
        agreedAmount: quote.amount,
        etaMinutes: quote.estimated_duration_minutes
      })
    ]);

    await client.query('COMMIT');

    // Realtime Notifications on Quote Acceptance
    notifyProvider(quote.agent_email, 'quote.accepted', {
      quoteId: quote.id,
      requestRef: sr.request_ref,
      bookingRef,
      customerName: sr.user_name,
      customerPhone: sr.user_phone,
      serviceTitle: sr.service_title,
      amount: quote.amount,
      address: sr.user_address,
      timestamp: new Date().toISOString()
    });
    notifyCustomer(sr.request_ref, 'quote.accepted', {
      requestRef: sr.request_ref,
      bookingRef,
      agentName: quote.agent_name,
      agentPhone: quote.agent_phone,
      serviceTitle: sr.service_title,
      amount: quote.amount,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Quote accepted. Provider has been assigned and notified.',
      request: {
        requestRef: sr.request_ref,
        bookingRef,
        bookingId,
        status: 'Accepted',
        otpCode: sr.otp_code,
        acceptedProvider: {
          quoteId: quote.id,
          agentId: quote.agent_id,
          agentName: quote.agent_name,
          agentPhone: quote.agent_phone,
          agentEmail: quote.agent_email,
          amount: parseFloat(quote.amount),
          estimatedDuration: quote.estimated_duration_minutes,
          message: quote.message
        }
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Accept quote error:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// =========================================================================
// 9. Provider Marks On the way / En Route
// =========================================================================
router.post('/request/:ref/en-route', async (req, res) => {
  try {
    const { ref } = req.params;
    const { agentEmail } = req.body;

    const result = await pool.query(
      `UPDATE service_requests
       SET status = 'On the way', updated_at = CURRENT_TIMESTAMP
       WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(REPLACE(status, ' ', '_')) IN ('accepted', 'confirmed', 'open', 'quoted', 'quoting')
       RETURNING *;`,
      [ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in Confirmed state.' });
    }

    const sr = result.rows[0];

    await pool.query(
      `UPDATE bookings
       SET status = 'On the way', updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $1 OR booking_ref = $2;`,
      [sr.id, ref]
    );

    notifyCustomer(ref, 'status.en_route', {
      requestRef: ref,
      status: 'On the way',
      message: 'Professional is on the way to your location.',
      timestamp: new Date().toISOString()
    });
    if (agentEmail) {
      notifyProvider(agentEmail, 'status.en_route', {
        requestRef: ref,
        status: 'On the way',
        message: 'Status updated to On the way.',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'Status updated to On the way. Customer has been notified.',
      request: { requestRef: ref, status: 'On the way' }
    });
  } catch (err) {
    console.error('En route error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 9.5. Provider Marks Arrived (Doorstep Geofence or Tap)
// =========================================================================
router.post('/request/:ref/arrived', async (req, res) => {
  try {
    const { ref } = req.params;
    const { agentEmail, lat, lng } = req.body || {};

    if (!agentEmail) {
      return res.status(400).json({ success: false, error: 'Professional email is required.' });
    }

    // 1. Fetch the request
    const srRes = await pool.query(
      'SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) LIMIT 1;',
      [ref]
    );

    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service request not found.' });
    }
    const sr = srRes.rows[0];

    // Idempotent: If already Arrived, return current Arrived status with door OTP
    if (sr.status?.toLowerCase() === 'arrived') {
      return res.json({
        success: true,
        message: 'Status is already Arrived.',
        request: { requestRef: ref, status: 'Arrived', otpCode: sr.otp_code }
      });
    }

    // 2. State validation: Job must be in On the way / En Route / Confirmed
    const normStatus = (sr.status || '').toLowerCase().replace(/_/g, ' ');
    if (normStatus !== 'on the way' && normStatus !== 'en route' && normStatus !== 'confirmed' && normStatus !== 'accepted') {
      return res.status(400).json({
        success: false,
        error: `Cannot mark arrival. Job is currently in '${sr.status}' state (must be 'On the way').`
      });
    }

    // 3. Caller validation: Caller must be the assigned professional
    const agentRes = await pool.query(
      'SELECT a.id AS agent_id, p.id AS pro_id, a.email, a.lat, a.lng FROM agent_login a LEFT JOIN professionals p ON LOWER(p.email) = LOWER(a.email) WHERE LOWER(a.email) = $1 LIMIT 1;',
      [agentEmail.toLowerCase().trim()]
    );
    if (agentRes.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Professional account not found.' });
    }
    const agent = agentRes.rows[0];

    const assignedId = String(sr.assigned_professional_id || '');
    const isAssigned = (assignedId === String(agent.pro_id) || assignedId === String(agent.agent_id));
    if (sr.assigned_professional_id && !isAssigned) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Only the assigned professional can mark arrival.'
      });
    }

    // 4. Geofence proximity validation: within configurable ~200m
    const proLat = lat !== undefined && lat !== null ? parseFloat(lat) : parseFloat(agent.lat);
    const proLng = lng !== undefined && lng !== null ? parseFloat(lng) : parseFloat(agent.lng);
    const destLat = parseFloat(sr.lat);
    const destLng = parseFloat(sr.lng);

    if (!isNaN(proLat) && !isNaN(proLng) && !isNaN(destLat) && !isNaN(destLng)) {
      const distKm = haversineDistance(proLat, proLng, destLat, destLng);
      const distMeters = distKm * 1000;
      const MAX_ARRIVAL_DIST_M = parseInt(process.env.ARRIVAL_MAX_DISTANCE_METERS || '200', 10);

      if (distMeters > MAX_ARRIVAL_DIST_M) {
        const distStr = distKm < 1 ? `${Math.round(distMeters)} m` : `${distKm.toFixed(1)} km`;
        return res.status(400).json({
          success: false,
          code: 'TOO_FAR_FROM_DESTINATION',
          error: `You're about ${distStr} from the customer's location.`
        });
      }
    }

    // 5. Update status to Arrived
    const updateRes = await pool.query(
      `UPDATE service_requests
       SET status = 'Arrived', arrived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *;`,
      [sr.id]
    );
    const updatedSr = updateRes.rows[0];

    await pool.query(
      `UPDATE bookings
       SET status = 'Arrived', arrived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $1 OR booking_ref = $2;`,
      [sr.id, ref]
    );

    // 6. Push realtime event & reveal door OTP to customer
    notifyCustomer(ref, 'status.arrived', {
      requestRef: ref,
      status: 'Arrived',
      otpCode: updatedSr.otp_code,
      message: 'Professional has arrived at your doorstep. Please share your 4-digit door verification code.',
      timestamp: new Date().toISOString()
    });

    notifyProvider(agentEmail, 'status.arrived', {
      requestRef: ref,
      status: 'Arrived',
      message: 'Status updated to Arrived. Please request the 4-digit door OTP from customer.',
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Status updated to Arrived.',
      request: { requestRef: ref, status: 'Arrived', otpCode: updatedSr.otp_code }
    });
  } catch (err) {
    console.error('Arrived error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Location stream endpoint (HTTP fallback for location telemetry)
router.post('/job/:ref/location', async (req, res) => {
  try {
    const { ref } = req.params;
    const { lat, lng, accuracy, heading, speed, email } = req.body || {};
    const result = await processLocationUpdate(ref, { lat, lng, accuracy, heading, speed }, email);
    if (!result.success && !result.ignored) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 10. Provider Verifies Door OTP (Moves to In progress)
// =========================================================================
router.post('/request/:ref/verify-otp', async (req, res) => {
  try {
    const { ref } = req.params;
    const { otp } = req.body;

    if (!otp || otp.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'A valid 4-digit OTP is required.' });
    }

    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(REPLACE(status, ' ', '_')) IN ('arrived', 'on_the_way', 'en_route', 'accepted', 'confirmed') LIMIT 1;",
      [ref]
    );

    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in Arrived state for OTP verification.' });
    }

    const sr = srRes.rows[0];

    // Check if door OTP entry is temporarily locked due to 5 failed attempts
    if (sr.otp_locked_until && new Date(sr.otp_locked_until) > new Date()) {
      const remainingSeconds = Math.ceil((new Date(sr.otp_locked_until).getTime() - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        locked: true,
        remainingSeconds,
        error: `Door OTP entry is temporarily locked due to 5 incorrect attempts. Please wait ${remainingSeconds}s before trying again.`
      });
    }

    if (sr.otp_code !== otp.trim()) {
      const currentAttempts = (sr.otp_attempts || 0) + 1;
      const remainingAttempts = Math.max(0, 5 - currentAttempts);
      const isLocked = currentAttempts >= 5;
      const lockedUntil = isLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await pool.query(
        "UPDATE service_requests SET otp_attempts = $1, otp_locked_until = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
        [currentAttempts, lockedUntil, sr.id]
      );

      if (isLocked) {
        notifyCustomer(ref, 'status.otp_locked', {
          requestRef: ref,
          message: 'Door OTP entry locked after 5 failed attempts.',
          timestamp: new Date().toISOString()
        });
        const acceptedQuoteRes = await pool.query('SELECT agent_email FROM quotes WHERE id = $1', [sr.accepted_quote_id]);
        if (acceptedQuoteRes.rows.length > 0 && acceptedQuoteRes.rows[0].agent_email) {
          notifyProvider(acceptedQuoteRes.rows[0].agent_email, 'status.otp_locked', {
            requestRef: ref,
            message: 'Maximum Door OTP attempts (5) reached. Entry is temporarily locked.',
            timestamp: new Date().toISOString()
          });
        }

        return res.status(429).json({
          success: false,
          locked: true,
          attempts: currentAttempts,
          remainingAttempts: 0,
          remainingSeconds: 15 * 60,
          error: 'Maximum 5 attempts reached. OTP entry is temporarily locked for 15 minutes.'
        });
      }

      return res.status(400).json({
        success: false,
        attempts: currentAttempts,
        remainingAttempts,
        error: `Incorrect code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
      });
    }

    // Success: Reset failed attempts & lockout, record start time and move to In progress
    await pool.query(
      "UPDATE service_requests SET status = 'In progress', otp_verified = true, started_at = CURRENT_TIMESTAMP, otp_attempts = 0, otp_locked_until = NULL, otp_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [sr.id]
    );

    await pool.query(
      "UPDATE bookings SET status = 'In progress', started_at = CURRENT_TIMESTAMP, otp_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 OR booking_ref = $2;",
      [sr.id, ref]
    );

    await pool.query(`
      INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, 'provider', $2, 'OTP_VERIFIED', $3::jsonb);
    `, [sr.id, String(sr.accepted_quote_id || 'provider'), JSON.stringify({ verifiedAt: new Date().toISOString() })]);

    notifyCustomer(ref, 'status.otp_verified', {
      requestRef: ref,
      status: 'In progress',
      message: 'OTP verified. Service is now In progress.',
      timestamp: new Date().toISOString()
    });

    const acceptedQuoteRes = await pool.query('SELECT agent_email FROM quotes WHERE id = $1', [sr.accepted_quote_id]);
    if (acceptedQuoteRes.rows.length > 0 && acceptedQuoteRes.rows[0].agent_email) {
      notifyProvider(acceptedQuoteRes.rows[0].agent_email, 'status.otp_verified', {
        requestRef: ref,
        status: 'In progress',
        message: 'Door OTP verified successfully. Job in progress.',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'OTP verified. Job is now In progress.',
      request: { requestRef: ref, status: 'In progress' }
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 11. Provider Completes Job (Requires 1–4 photos & optional remarks, Credits Payout)
// =========================================================================
router.post('/request/:ref/complete', async (req, res) => {
  try {
    const { ref } = req.params;
    const { agentEmail, photos, remarks } = req.body;

    // Fetch the request and its accepted quote
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(REPLACE(status, ' ', '_')) IN ('in_progress', 'otp_verified') LIMIT 1;",
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in In progress state.' });
    }
    const sr = srRes.rows[0];

    const photosArr = Array.isArray(photos) ? photos : [];
    if (photosArr.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'At least one photo of the finished work is required before completing the job.'
      });
    }

    const cleanRemarks = (remarks || '').trim().slice(0, 300);
    const photosToStore = photosArr.slice(0, 4);

    // Fetch accepted quote for payout amount
    const quoteRes = await pool.query(
      "SELECT * FROM quotes WHERE id = $1 LIMIT 1;",
      [sr.accepted_quote_id]
    );
    if (quoteRes.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No accepted quote found for this request.' });
    }
    const quote = quoteRes.rows[0];

    // Platform fee: 15% commission, provider gets 85%
    const grossAmount = parseFloat(quote.amount);
    const platformFee = Math.round(grossAmount * 0.15 * 100) / 100;
    const providerPayout = Math.round((grossAmount - platformFee) * 100) / 100;

    // Update request and booking status
    await pool.query(
      `UPDATE service_requests 
       SET status = 'Completed', 
           completion_photos = $1::jsonb, 
           completion_remarks = $2, 
           completed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3;`,
      [JSON.stringify(photosToStore), cleanRemarks, sr.id]
    );

    await pool.query(
      `UPDATE bookings 
       SET status = 'Completed', 
           completion_photos = $1::jsonb, 
           completion_remarks = $2, 
           completed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE request_id = $3 OR booking_ref = $4;`,
      [JSON.stringify(photosToStore), cleanRemarks, sr.id, ref]
    );

    // Audit log
    await pool.query(`
      INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, 'provider', $2, 'JOB_COMPLETED', $3::jsonb);
    `, [sr.id, String(quote.agent_id), JSON.stringify({ grossAmount, providerPayout, platformFee, photosCount: photosToStore.length })]);

    // Resolve both agent_login.id and professionals.id
    let agentLoginId = quote.agent_id;
    let professionalId = quote.agent_id;
    try {
      const matchRes = await pool.query(`
        SELECT a.id AS agent_id, p.id AS pro_id
        FROM agent_login a
        FULL OUTER JOIN professionals p ON LOWER(a.email) = LOWER(p.email)
        WHERE a.id = $1 OR p.id = $1
        LIMIT 1;
      `, [quote.agent_id]);
      if (matchRes.rows.length > 0) {
        if (matchRes.rows[0].agent_id) agentLoginId = matchRes.rows[0].agent_id;
        if (matchRes.rows[0].pro_id) professionalId = matchRes.rows[0].pro_id;
      }
    } catch (lookupErr) {
      console.warn('Provider dual-ID lookup notice:', lookupErr.message);
    }

    // Credit provider wallet and unlock availability
    const walletUpdate = await pool.query(`
      UPDATE agent_login
      SET wallet_balance = wallet_balance + $1,
          completed_jobs = completed_jobs + 1,
          availability_status = 'AVAILABLE',
          is_online = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING wallet_balance, completed_jobs, availability_status, is_online;
    `, [providerPayout, agentLoginId]);

    try {
      await pool.query(`
        UPDATE professionals
        SET wallet_balance = wallet_balance + $1,
            completed_jobs = completed_jobs + 1,
            availability_status = 'available',
            is_online = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [providerPayout, professionalId]);
    } catch (proErr) {
      // Ignored if table or row missing
    }

    try {
      await pool.query(`
        UPDATE agents
        SET wallet_balance = wallet_balance + $1,
            completed_jobs = completed_jobs + 1,
            availability_status = 'AVAILABLE',
            is_online = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [providerPayout, agentLoginId]);
    } catch (agentsErr) {
      // Legacy table agents may not exist in clean schema
    }

    const newBalance = walletUpdate.rows.length > 0 ? parseFloat(walletUpdate.rows[0].wallet_balance) : providerPayout;

    // Record wallet transaction
    await pool.query(`
      INSERT INTO wallet_transactions (agent_id, request_ref, type, amount, balance_after, description)
      VALUES ($1, $2, 'credit', $3, $4, $5);
    `, [
      agentLoginId,
      ref,
      providerPayout,
      newBalance,
      `Job completed: ${sr.service_title}`
    ]);

    notifyCustomer(ref, 'status.completed', {
      requestRef: ref,
      status: 'Completed',
      completionPhotos: photosToStore,
      completionRemarks: cleanRemarks,
      providerName: quote.agent_name,
      message: 'Service completed successfully! Please rate your professional.',
      timestamp: new Date().toISOString()
    });

    notifyProvider(quote.agent_email, 'status.completed', {
      requestRef: ref,
      status: 'Completed',
      payout: providerPayout,
      newBalance,
      message: `Job completed! ₹${providerPayout.toFixed(2)} credited to your wallet.`,
      timestamp: new Date().toISOString()
    });

    cleanupJobTracking(ref);

    return res.json({
      success: true,
      message: `Job completed. ₹${providerPayout.toFixed(2)} credited to wallet.`,
      request: {
        requestRef: ref,
        status: 'Completed',
        completionPhotos: photosToStore,
        completionRemarks: cleanRemarks
      },
      wallet: {
        payout: providerPayout,
        platformFee,
        newBalance,
        completedJobs: walletUpdate.rows.length > 0 ? walletUpdate.rows[0].completed_jobs : 1
      }
    });
  } catch (err) {
    console.error('Complete job error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 12. Customer Rates Completed Job (Recomputes rating ONLY from real feedback)
// =========================================================================
router.post('/request/:ref/rate', async (req, res) => {
  try {
    const { ref } = req.params;
    const { rating, feedback, tags = [] } = req.body;

    const numericRating = parseInt(rating, 10);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5.' });
    }

    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE (request_ref = $1 OR service_request_code = $1) AND LOWER(status) = 'completed' LIMIT 1;",
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Completed service request not found.' });
    }
    const sr = srRes.rows[0];

    // 1. Update service_requests rating
    await pool.query(
      "UPDATE service_requests SET rating = $1, rating_feedback = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
      [numericRating, feedback || '', sr.id]
    );

    await pool.query(
      "UPDATE bookings SET rating = $1, review_feedback = $2, updated_at = CURRENT_TIMESTAMP WHERE request_id = $3 OR booking_ref = $4;",
      [numericRating, feedback || '', sr.id, ref]
    );

    // 2. Fetch provider agentId and professional references
    let agentId = null;
    let providerEmail = null;
    if (sr.accepted_quote_id) {
      const quoteRes = await pool.query('SELECT agent_id, professional_id, agent_email FROM quotes WHERE id = $1 LIMIT 1;', [sr.accepted_quote_id]);
      if (quoteRes.rows.length > 0) {
        agentId = quoteRes.rows[0].agent_id;
        providerEmail = quoteRes.rows[0].agent_email;
      }
    }
    if (!agentId && sr.assigned_professional_id) {
      agentId = sr.assigned_professional_id;
    }

    // Resolve valid customer_id from customers table
    let validCustomerId = sr.customer_id;
    if (!validCustomerId) {
      const cRes = await pool.query(
        'SELECT id FROM customers WHERE email = $1 OR user_id = $2 LIMIT 1;',
        [sr.user_email, sr.user_id]
      );
      if (cRes.rows.length > 0) {
        validCustomerId = cRes.rows[0].id;
      }
    }

    // 3. Store in reviews table
    if (agentId) {
      await pool.query(`
        INSERT INTO reviews (request_id, customer_id, provider_id, rating, feedback, tags)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb);
      `, [sr.id, validCustomerId || sr.user_id, agentId, numericRating, feedback || '', JSON.stringify(tags)]);

      // 4. Recompute professional rating ONLY from real feedback in reviews table
      const aggRes = await pool.query(`
        SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS review_count
        FROM reviews
        WHERE provider_id = $1 OR provider_id IN (SELECT id FROM professionals WHERE email = (SELECT email FROM agent_login WHERE id = $1));
      `, [agentId]);

      let newAvg = numericRating;
      if (aggRes.rows.length > 0 && aggRes.rows[0].avg_rating !== null) {
        newAvg = parseFloat(aggRes.rows[0].avg_rating);
        await pool.query('UPDATE agent_login SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;', [newAvg, agentId]);
        try { await pool.query('UPDATE agents SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;', [newAvg, agentId]); } catch (e) {}
        try { 
          await pool.query('UPDATE professionals SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 OR email = (SELECT email FROM agent_login WHERE id = $2);', [newAvg, agentId]); 
        } catch (e) {}
      }

      // Notify provider in real-time
      if (providerEmail) {
        notifyProvider(providerEmail, 'rating.submitted', {
          requestRef: ref,
          rating: numericRating,
          feedback: feedback || '',
          newAvgRating: newAvg,
          message: `Customer submitted a ${numericRating}-star review!`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.json({
      success: true,
      message: 'Rating submitted successfully.',
      rating: numericRating
    });
  } catch (err) {
    console.error('Rate job error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 13. Provider's Active Job
// =========================================================================
router.get('/provider/active-job', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }

    const agentRes = await pool.query(
      'SELECT id FROM agent_login WHERE email = $1 LIMIT 1;',
      [email.toLowerCase()]
    );
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }
    const agentId = agentRes.rows[0].id;

    // Find any accepted/en-route/in-progress request where this provider's quote was accepted
    const result = await pool.query(`
      SELECT sr.*, q.amount AS quote_amount, q.estimated_duration_minutes AS quote_duration, q.message AS quote_message
      FROM service_requests sr
      JOIN quotes q ON q.id = sr.accepted_quote_id
      WHERE q.agent_id = $1
        AND LOWER(REPLACE(sr.status, ' ', '_')) IN ('accepted', 'confirmed', 'en_route', 'on_the_way', 'arrived', 'otp_verified', 'in_progress')
      ORDER BY sr.updated_at DESC
      LIMIT 1;
    `, [agentId]);

    if (result.rows.length === 0) {
      return res.json({ success: true, activeJob: null });
    }

    const sr = result.rows[0];
    return res.json({
      success: true,
      activeJob: {
        id: sr.id,
        requestRef: sr.request_ref,
        serviceTitle: sr.service_title,
        category: sr.category,
        issueType: sr.issue_type,
        problemDescription: sr.problem_description,
        status: sr.status,
        address: sr.user_address,
        customerName: sr.user_name,
        customerPhone: sr.user_phone,
        lat: sr.lat,
        lng: sr.lng,
        payout: parseFloat(sr.quote_amount || '0'),
        amount: parseFloat(sr.quote_amount || '0'),
        totalAmount: parseFloat(sr.quote_amount || '0'),
        quoteAmount: parseFloat(sr.quote_amount || '0'),
        quoteDuration: sr.quote_duration,
        quoteMessage: sr.quote_message,
        otpVerified: Boolean(sr.otp_verified),
        otpAttempts: sr.otp_attempts || 0,
        otpLockedUntil: sr.otp_locked_until,
        createdAt: sr.created_at
      }
    });
  } catch (err) {
    console.error('Active job error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 14. Provider Wallet & Transaction History
// =========================================================================
router.get('/wallet/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const lowerEmail = email.toLowerCase();

    const agentRes = await pool.query(
      'SELECT id, wallet_balance, completed_jobs FROM agent_login WHERE email = $1 LIMIT 1;',
      [lowerEmail]
    );
    const proRes = await pool.query(
      'SELECT id, wallet_balance, completed_jobs FROM professionals WHERE email = $1 LIMIT 1;',
      [lowerEmail]
    );

    if (agentRes.rows.length === 0 && proRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }

    const agentId = agentRes.rows[0]?.id || null;
    const proId = proRes.rows[0]?.id || null;
    const agentBalance = agentRes.rows[0] ? parseFloat(agentRes.rows[0].wallet_balance || 0) : 0;
    const proBalance = proRes.rows[0] ? parseFloat(proRes.rows[0].wallet_balance || 0) : 0;
    let balance = Math.max(agentBalance, proBalance);
    const completedJobs = agentRes.rows[0]?.completed_jobs ?? proRes.rows[0]?.completed_jobs ?? 0;

    const txRes = await pool.query(`
      SELECT 
        id,
        request_ref,
        type,
        amount,
        balance_after,
        description,
        created_at
      FROM (
        SELECT 
          wt.id::text AS id,
          wt.request_ref,
          COALESCE(wt.type, 'credit') AS type,
          wt.amount,
          wt.balance_after,
          wt.description,
          wt.created_at
        FROM wallet_transactions wt
        WHERE wt.agent_id = $1 OR wt.agent_id = $2
        
        UNION ALL
        
        SELECT
          'payout_' || p.id::text AS id,
          COALESCE(sr.service_request_code, sr.request_ref, 'SR-' || p.service_request_id) AS request_ref,
          'credit' AS type,
          p.net_payout AS amount,
          p.balance_after,
          COALESCE('Job completed: ' || NULLIF(sr.service_title, ''), 'Service Job Payout Credited') AS description,
          p.created_at
        FROM payouts p
        LEFT JOIN service_requests sr ON sr.id = p.service_request_id
        WHERE (p.professional_id = $2 OR p.professional_id = $1)
          AND NOT EXISTS (
            SELECT 1 FROM wallet_transactions wt2 
            WHERE (wt2.agent_id = $1 OR wt2.agent_id = $2)
              AND wt2.request_ref = COALESCE(sr.service_request_code, sr.request_ref)
          )
      ) combined_tx
      ORDER BY created_at DESC
      LIMIT 50;
    `, [agentId, proId]);

    // Ensure balance reflects latest transaction balance if higher
    if (txRes.rows.length > 0 && txRes.rows[0].balance_after) {
      const latestTxBalance = parseFloat(txRes.rows[0].balance_after);
      if (!isNaN(latestTxBalance) && latestTxBalance > balance) {
        balance = latestTxBalance;
      }
    }

    // Keep DB tables in sync with positive balance
    if (balance > 0) {
      if (agentId && agentBalance < balance) {
        await pool.query('UPDATE agent_login SET wallet_balance = $1 WHERE id = $2;', [balance, agentId]).catch(() => {});
      }
      if (proId && proBalance < balance) {
        await pool.query('UPDATE professionals SET wallet_balance = $1 WHERE id = $2;', [balance, proId]).catch(() => {});
      }
    }

    return res.json({
      success: true,
      wallet: {
        balance,
        completedJobs,
        transactions: txRes.rows.map(tx => ({
          id: tx.id,
          requestRef: tx.request_ref,
          type: tx.type,
          amount: parseFloat(tx.amount || 0),
          balanceAfter: parseFloat(tx.balance_after || 0),
          description: tx.description,
          createdAt: tx.created_at
        }))
      }
    });
  } catch (err) {
    console.error('Wallet error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 15. Instant Provider Bank Withdrawal (IMPS)
// =========================================================================
router.post('/withdraw', async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Provider email is required.' });
    }
    const withdrawAmt = parseFloat(amount);
    if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid withdrawal amount.' });
    }

    const lowerEmail = email.toLowerCase();
    const agentRes = await pool.query(
      'SELECT id, wallet_balance, completed_jobs FROM agent_login WHERE email = $1 LIMIT 1;',
      [lowerEmail]
    );
    const proRes = await pool.query(
      'SELECT id, wallet_balance, completed_jobs FROM professionals WHERE email = $1 LIMIT 1;',
      [lowerEmail]
    );

    if (agentRes.rows.length === 0 && proRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }

    const agent = agentRes.rows[0];
    const currentBalance = agent ? parseFloat(agent.wallet_balance || 0) : parseFloat(proRes.rows[0]?.wallet_balance || 0);

    if (currentBalance < withdrawAmt) {
      return res.status(400).json({ success: false, error: 'Insufficient wallet balance.' });
    }

    const newBalance = Math.max(0, currentBalance - withdrawAmt);
    const agentId = agent?.id || null;
    const proId = proRes.rows[0]?.id || null;

    if (agentId) {
      await pool.query(
        'UPDATE agent_login SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
        [newBalance, agentId]
      );
    }
    if (proId) {
      await pool.query(
        'UPDATE professionals SET wallet_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
        [newBalance, proId]
      );
    }

    // Record debit transaction in wallet_transactions
    if (agentId) {
      await pool.query(`
        INSERT INTO wallet_transactions (agent_id, request_ref, type, amount, balance_after, description)
        VALUES ($1, $2, 'debit', $3, $4, $5);
      `, [
        agentId,
        'WTH-' + Date.now().toString(36).toUpperCase(),
        withdrawAmt,
        newBalance,
        'Instant IMPS Bank Transfer Withdrawal'
      ]);
    }

    return res.json({
      success: true,
      message: `₹${withdrawAmt.toLocaleString('en-IN')} transferred to primary bank account via Instant IMPS.`,
      newBalance
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
