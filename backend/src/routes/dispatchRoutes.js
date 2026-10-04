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

  if (isPlumbingDesc && !isElectricalDesc) {
    const isPlumbingTitle = /\b(plumb|pipe|tap|faucet|drain|leak|water)\b/i.test(title);
    return {
      category: 'plumber',
      serviceTitle: isPlumbingTitle && title ? title : 'Plumbing - Pipe Leakage & Repair'
    };
  }

  if (isElectricalDesc && !isPlumbingDesc) {
    const isElectricalTitle = /\b(electric|switch|socket|power|wire|light|fan)\b/i.test(title);
    return {
      category: 'electrician',
      serviceTitle: isElectricalTitle && title ? title : 'Switchboard, Socket & Power Point Repair'
    };
  }

  // Fallback to title or requested category
  if (reqCat.includes('plumb') || /\b(plumb|pipe|drain|leak)\b/i.test(title)) {
    return { category: 'plumber', serviceTitle: title || 'Plumbing Service' };
  }
  if (reqCat.includes('electric') || /\b(electric|switch|power|wiring)\b/i.test(title)) {
    return { category: 'electrician', serviceTitle: title || 'Electrical Service' };
  }

  return { category: reqCat || 'electrician', serviceTitle: title || 'General Home Service' };
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
           AND status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
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

    // Problem description is optional (defaults to service title if omitted)
    const description = (problemDescription || '').trim() || (serviceTitle ? `${serviceTitle} - Inspection & Service` : 'Inspection & Repair required');

    const address = (userAddress || '').trim() || (lat && lng ? `GPS Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : '');
    if (!address) {
      return res.status(400).json({
        success: false,
        code: 'ADDRESS_REQUIRED',
        error: 'A valid service address or current location is required.'
      });
    }

    // Generate identifiers
    const requestRef = `NV-SR-${Math.floor(10000 + Math.random() * 90000)}`;
    const otpCode = `${Math.floor(1000 + Math.random() * 9000)}`;
    const numLat = typeof lat === 'number' ? lat : (lat ? parseFloat(lat) : null);
    const numLng = typeof lng === 'number' ? lng : (lng ? parseFloat(lng) : null);
    const h3Index = (numLat !== null && numLng !== null && !isNaN(numLat) && !isNaN(numLng))
      ? latLngToH3(numLat, numLng)
      : null;
    const photosJson = JSON.stringify(Array.isArray(photos) ? photos : []);

    // Auto-classify category and service title from customer problem description
    const classified = classifyServiceCategory(description, serviceTitle, category);
    const finalCategory = classified.category;
    const finalServiceTitle = classified.serviceTitle;

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
      serviceId || 'general-service',
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
               'amount', q.amount,
               'estimatedDuration', q.estimated_duration_minutes,
               'message', q.message,
               'status', q.status,
               'createdAt', q.created_at
             ) ORDER BY q.amount ASC) FROM quotes q WHERE q.request_id = sr.id) AS quotes
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
          acceptedProvider = accepted;
        }
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
        pendingQuotesCount: parseInt(sr.pending_quotes_count || '0', 10),
        quotes: sr.quotes || [],
        acceptedProvider,
        isDelayed,
        delayStatus,
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
// Timeout Safeguard Action: Customer triggers Cancel & Re-broadcast
// =========================================================================
router.post('/request/:ref/rebroadcast', async (req, res) => {
  try {
    const { ref } = req.params;
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE request_ref = $1 AND status IN ('Accepted', 'En Route') LIMIT 1;",
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
        AND sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
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

    const agentLat = lat ? parseFloat(lat) : parseFloat(agent.lat);
    const agentLng = lng ? parseFloat(lng) : parseFloat(agent.lng);
    const maxRadius = radiusKm ? parseFloat(radiusKm) : 10;

    // If provider has no location set, return empty
    if (!agentLat || !agentLng || isNaN(agentLat) || isNaN(agentLng)) {
      return res.json({ success: true, requests: [], notice: 'Please update your location to see nearby requests.' });
    }

    const agentH3 = latLngToH3(agentLat, agentLng);

    let requests = [];
    if (agentH3) {
      // H3 cell-based candidate expansion (ring 3 covers approx 1.2km)
      const { getNearbyCells } = await import('../utils/geoDispatch.js');
      const cells = getNearbyCells(agentH3, 5); // Ring 5 ~ 2km radius
      const placeholders = cells.map((_, i) => `$${i + 1}`).join(', ');

      const tradeFilter = agent.trade === 'both'
        ? ''
        : `AND (sr.category = $${cells.length + 1} OR sr.category = 'both')`;
      const params = agent.trade === 'both' ? cells : [...cells, agent.trade];

      const result = await pool.query(`
        SELECT sr.*, 
               (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id) AS total_quotes,
               (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id AND q.agent_id = ${agent.id}) AS my_quotes
        FROM service_requests sr
        WHERE sr.status IN ('Open', 'Quoting')
          AND sr.h3_index_res9 IN (${placeholders})
          AND sr.lat IS NOT NULL
          AND sr.lng IS NOT NULL
          ${tradeFilter}
        ORDER BY sr.created_at DESC;
      `, params);
      requests = result.rows;
    } else {
      // Fallback: all open requests with lat/lng in the category
      const tradeCondition = agent.trade === 'both'
        ? ''
        : "AND (sr.category = $1 OR sr.category = 'both')";
      const params = agent.trade === 'both' ? [] : [agent.trade];

      const result = await pool.query(`
        SELECT sr.*,
               (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id) AS total_quotes,
               (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id AND q.agent_id = ${agent.id}) AS my_quotes
        FROM service_requests sr
        WHERE sr.status IN ('Open', 'Quoting')
          AND sr.lat IS NOT NULL AND sr.lng IS NOT NULL
          ${tradeCondition}
        ORDER BY sr.created_at DESC
        LIMIT 50;
      `, params);
      requests = result.rows;
    }

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
      "SELECT * FROM service_requests WHERE request_ref = $1 AND status IN ('Open', 'Quoting') LIMIT 1;",
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
        AND sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
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
    if (sr.status === 'Open') {
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
    if (sr.status !== 'Open' && sr.status !== 'Quoting') {
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
    await client.query(
      "UPDATE service_requests SET status = 'Accepted', accepted_quote_id = $1, assigned_professional_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
      [quoteId, quote.agent_id, sr.id]
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
// 9. Provider Marks En Route
// =========================================================================
router.post('/request/:ref/en-route', async (req, res) => {
  try {
    const { ref } = req.params;
    const { agentEmail } = req.body;

    const result = await pool.query(
      `UPDATE service_requests
       SET status = 'En Route', updated_at = CURRENT_TIMESTAMP
       WHERE request_ref = $1 AND status = 'Accepted'
       RETURNING *;`,
      [ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in Accepted state.' });
    }

    notifyCustomer(ref, 'status.en_route', {
      requestRef: ref,
      status: 'En Route',
      message: 'Professional is on the way to your location.',
      timestamp: new Date().toISOString()
    });
    if (agentEmail) {
      notifyProvider(agentEmail, 'status.en_route', {
        requestRef: ref,
        status: 'En Route',
        message: 'Status updated to En Route.',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'Status updated to En Route. Customer has been notified.',
      request: { requestRef: ref, status: 'En Route' }
    });
  } catch (err) {
    console.error('En route error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 10. Provider Verifies Door OTP
// =========================================================================
router.post('/request/:ref/verify-otp', async (req, res) => {
  try {
    const { ref } = req.params;
    const { otp } = req.body;

    if (!otp || otp.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'A valid 4-digit OTP is required.' });
    }

    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE request_ref = $1 AND status IN ('En Route', 'Accepted') LIMIT 1;",
      [ref]
    );

    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not in the correct state for OTP verification.' });
    }

    const sr = srRes.rows[0];
    if (sr.otp_code !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please ask the customer for the correct 4-digit code.' });
    }

    await pool.query(
      "UPDATE service_requests SET status = 'In Progress', otp_verified = true, otp_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [sr.id]
    );

    await pool.query(
      "UPDATE bookings SET status = 'In Progress', otp_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 OR booking_ref = $2;",
      [sr.id, ref]
    );

    await pool.query(`
      INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, 'provider', $2, 'OTP_VERIFIED', $3::jsonb);
    `, [sr.id, String(sr.accepted_quote_id || 'provider'), JSON.stringify({ verifiedAt: new Date().toISOString() })]);

    notifyCustomer(ref, 'status.otp_verified', {
      requestRef: ref,
      status: 'In Progress',
      message: 'OTP verified! Service is now In Progress.',
      timestamp: new Date().toISOString()
    });

    const acceptedQuoteRes = await pool.query('SELECT agent_email FROM quotes WHERE id = $1', [sr.accepted_quote_id]);
    if (acceptedQuoteRes.rows.length > 0 && acceptedQuoteRes.rows[0].agent_email) {
      notifyProvider(acceptedQuoteRes.rows[0].agent_email, 'status.otp_verified', {
        requestRef: ref,
        status: 'In Progress',
        message: 'Door OTP verified successfully. Job in progress.',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'OTP verified. Job is now In Progress.',
      request: { requestRef: ref, status: 'In Progress' }
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// 11. Provider Completes Job (Credits Wallet)
// =========================================================================
router.post('/request/:ref/complete', async (req, res) => {
  try {
    const { ref } = req.params;
    const { agentEmail } = req.body;

    // Fetch the request and its accepted quote
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE request_ref = $1 AND status = 'In Progress' LIMIT 1;",
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found or not In Progress.' });
    }
    const sr = srRes.rows[0];

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
      "UPDATE service_requests SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [sr.id]
    );

    await pool.query(
      "UPDATE bookings SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 OR booking_ref = $2;",
      [sr.id, ref]
    );

    // Audit log
    await pool.query(`
      INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, 'provider', $2, 'JOB_COMPLETED', $3::jsonb);
    `, [sr.id, String(quote.agent_id), JSON.stringify({ grossAmount, providerPayout, platformFee })]);

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
    `, [providerPayout, quote.agent_id]);

    const newBalance = walletUpdate.rows.length > 0 ? parseFloat(walletUpdate.rows[0].wallet_balance) : providerPayout;

    // Record wallet transaction
    await pool.query(`
      INSERT INTO wallet_transactions (agent_id, request_ref, type, amount, balance_after, description)
      VALUES ($1, $2, 'credit', $3, $4, $5);
    `, [
      quote.agent_id,
      ref,
      providerPayout,
      newBalance,
      `Job completed: ${sr.service_title} (${ref})`
    ]);

    notifyCustomer(ref, 'status.completed', {
      requestRef: ref,
      status: 'Completed',
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

    return res.json({
      success: true,
      message: `Job completed. ${providerPayout.toFixed(2)} credited to wallet.`,
      request: { requestRef: ref, status: 'Completed' },
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
// 12. Customer Rates Completed Job
// =========================================================================
router.post('/request/:ref/rate', async (req, res) => {
  try {
    const { ref } = req.params;
    const { rating, feedback, tags = [] } = req.body;

    const numericRating = parseInt(rating, 10);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5.' });
    }

    // Create a booking record from the completed service request for rating storage
    const srRes = await pool.query(
      "SELECT * FROM service_requests WHERE request_ref = $1 AND status = 'Completed' LIMIT 1;",
      [ref]
    );
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Completed service request not found.' });
    }
    const sr = srRes.rows[0];

    // Update the provider's rating (weighted average)
    if (sr.accepted_quote_id) {
      const quoteRes = await pool.query('SELECT agent_id FROM quotes WHERE id = $1 LIMIT 1;', [sr.accepted_quote_id]);
      if (quoteRes.rows.length > 0) {
        const agentId = quoteRes.rows[0].agent_id;
        // Simple weighted update: new_rating = (old_rating * jobs + new_rating) / (jobs + 1)
        // But since we already incremented completed_jobs on completion, use current count
        await pool.query(`
          UPDATE agent_login
          SET rating = LEAST(5.00, GREATEST(1.00,
            (rating * GREATEST(completed_jobs - 1, 0) + $1) / GREATEST(completed_jobs, 1)
          ))
          WHERE id = $2;
        `, [numericRating, agentId]);
      }
    }

    // Store the review in bookings table for legacy compat
    const bookingRef = `NV-${ref.replace('NV-SR-', '')}`;
    try {
      await pool.query(`
        INSERT INTO bookings (
          booking_ref, user_id, user_email, user_name, user_phone, user_address,
          service_id, service_title, category, otp_code, status, request_id,
          rating, review_feedback, review_tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Completed', $11, $12, $13, $14::jsonb)
        ON CONFLICT (booking_ref) DO UPDATE
        SET rating = $12, review_feedback = $13, review_tags = $14::jsonb;
      `, [
        bookingRef,
        sr.user_id, sr.user_email, sr.user_name, sr.user_phone, sr.user_address,
        sr.service_id, sr.service_title, sr.category, sr.otp_code, sr.id,
        numericRating, feedback || '', JSON.stringify(tags)
      ]);
    } catch (bookingErr) {
      console.warn('Booking record for rating notice:', bookingErr.message);
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
        AND sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
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
        quoteAmount: parseFloat(sr.quote_amount),
        quoteDuration: sr.quote_duration,
        quoteMessage: sr.quote_message,
        otpCode: sr.otp_code,
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

    const agentRes = await pool.query(
      'SELECT id, wallet_balance, completed_jobs FROM agent_login WHERE email = $1 LIMIT 1;',
      [email.toLowerCase()]
    );
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Provider not found.' });
    }

    const agent = agentRes.rows[0];

    const txRes = await pool.query(
      'SELECT * FROM wallet_transactions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50;',
      [agent.id]
    );

    return res.json({
      success: true,
      wallet: {
        balance: parseFloat(agent.wallet_balance),
        completedJobs: agent.completed_jobs,
        transactions: txRes.rows.map(tx => ({
          id: tx.id,
          requestRef: tx.request_ref,
          type: tx.type,
          amount: parseFloat(tx.amount),
          balanceAfter: parseFloat(tx.balance_after),
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

export default router;
