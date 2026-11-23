import { Router } from 'express';
import { pool } from '../config/db.js';
import { createServiceRequest, getRequestWithQuotes } from '../modules/requests/requestService.js';
import { dispatchProgressiveWave, expandSearchRadiusIfNeeded } from '../modules/dispatch/dispatchService.js';
import { submitQuote, acceptQuote } from '../modules/quotes/quoteService.js';
import { updateProviderLocation, updateProviderPresence } from '../modules/providers/providerService.js';
import { registerCustomerStream, registerProviderStream } from '../modules/realtime/realtimeService.js';

const router = Router();

// =========================================================================
// Realtime SSE Streams
// =========================================================================
router.get('/realtime/request/:requestRef', (req, res) => {
  const { requestRef } = req.params;
  registerCustomerStream(requestRef, req, res);
});

router.get('/realtime/provider/:email', (req, res) => {
  const { email } = req.params;
  registerProviderStream(email, req, res);
});

// =========================================================================
// Service Requests (Customer)
// =========================================================================
router.post('/requests', async (req, res) => {
  try {
    const result = await createServiceRequest(req.body);
    return res.status(201).json(result);
  } catch (err) {
    console.error('Create request error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/requests/me', async (req, res) => {
  try {
    const { email, userId } = req.query;
    if (!email && !userId) {
      return res.status(400).json({ success: false, error: 'Email or userId query parameter is required.' });
    }

    const numericUserId = userId && !isNaN(parseInt(userId, 10)) ? parseInt(userId, 10) : null;
    const result = await pool.query(`
      SELECT sr.*,
        (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id) AS quotes_count,
        (SELECT json_agg(json_build_object(
          'quoteId', q.id,
          'providerId', q.agent_id,
          'providerName', q.agent_name,
          'amount', q.amount,
          'providerNote', q.provider_note,
          'etaMinutes', q.eta_minutes,
          'warrantyDays', q.warranty_days,
          'status', q.status,
          'createdAt', q.created_at
        ) ORDER BY q.amount ASC) FROM quotes q WHERE q.request_id = sr.id) AS quotes
      FROM service_requests sr
      WHERE ($1::varchar IS NOT NULL AND LOWER(sr.user_email) = LOWER($1))
         OR ($2::int IS NOT NULL AND sr.user_id = $2)
      ORDER BY sr.created_at DESC;
    `, [email || null, numericUserId]);

    return res.json({
      success: true,
      requests: result.rows.map(r => ({
        id: r.id,
        requestRef: r.request_ref,
        serviceTitle: r.service_title,
        category: r.category,
        problemDescription: r.problem_description,
        photos: r.photos || [],
        address: r.user_address,
        status: r.status,
        otpCode: r.otp_code,
        acceptedQuoteId: r.accepted_quote_id,
        quotesCount: parseInt(r.quotes_count || '0', 10),
        quotes: r.quotes || [],
        createdAt: r.created_at,
        expiresAt: r.expires_at
      }))
    });
  } catch (err) {
    console.error('Fetch requests error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/requests/:requestRef', async (req, res) => {
  try {
    const result = await getRequestWithQuotes(req.params.requestRef);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
});

router.get('/requests/:requestRef/quotes', async (req, res) => {
  try {
    const result = await getRequestWithQuotes(req.params.requestRef);
    return res.json({ success: true, quotes: result.quotes });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
});

// Trigger next wave / progressive radius expansion
router.post('/requests/:requestRef/expand-radius', async (req, res) => {
  try {
    const srRes = await pool.query('SELECT id FROM service_requests WHERE request_ref = $1 LIMIT 1;', [req.params.requestRef]);
    if (srRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    const result = await expandSearchRadiusIfNeeded(srRes.rows[0].id);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Expand radius error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// Quotations (Provider Submits, Customer Accepts)
// =========================================================================
router.post('/requests/:requestRef/quotes', async (req, res) => {
  try {
    const { providerEmail, amount, providerNote, etaMinutes, warrantyDays, currency } = req.body;
    const result = await submitQuote({
      requestRef: req.params.requestRef,
      providerEmail: providerEmail || req.body.agentEmail,
      amount,
      providerNote: providerNote || req.body.message || '',
      etaMinutes: etaMinutes || req.body.estimatedDuration || 30,
      warrantyDays: warrantyDays || 30,
      currency: currency || 'INR'
    });
    return res.status(201).json({ success: true, quote: result });
  } catch (err) {
    console.error('Submit quote error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/quotes/:quoteId/accept', async (req, res) => {
  try {
    const quoteId = parseInt(req.params.quoteId, 10);
    const customerIdentifier = req.body.userEmail || req.body.userId;
    const result = await acceptQuote(quoteId, customerIdentifier);
    return res.json(result);
  } catch (err) {
    console.error('Accept quote error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// =========================================================================
// Provider GPS & Presence Management
// =========================================================================
router.post('/providers/me/location', async (req, res) => {
  try {
    const { email, agentId, latitude, longitude, accuracy_m } = req.body;
    const identifier = agentId || email;
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Provider email or agentId is required.' });
    }
    const result = await updateProviderLocation(identifier, { latitude, longitude, accuracy_m });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/providers/me/presence', async (req, res) => {
  try {
    const { email, agentId, availabilityStatus, status } = req.body;
    const identifier = agentId || email;
    const effectiveStatus = availabilityStatus || status;
    if (!identifier || !effectiveStatus) {
      return res.status(400).json({ success: false, error: 'Provider identifier and availability status are required.' });
    }
    const result = await updateProviderPresence(identifier, effectiveStatus);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});
// =========================================================================
// High-Precision Reverse Geocoding Proxy (Clean One-Line Doorstep Address)
// =========================================================================
function formatCleanOneLineAddress(addr = {}, displayName = '') {
  const parts = [];

  // 1. House or Building
  const houseNum = addr.house_number ? (addr.house_number.startsWith('#') ? addr.house_number : `#${addr.house_number}`) : '';
  const building = addr.building || addr.amenity || addr.apartment || addr.commercial || addr.industrial || '';
  if (building && houseNum) {
    parts.push(`${building}, ${houseNum}`);
  } else if (building) {
    parts.push(building);
  } else if (houseNum) {
    parts.push(houseNum);
  }

  // 2. Road
  const road = addr.road || addr.street || addr.residential || addr.lane || '';
  if (road) parts.push(road);

  // 3. Area / Suburb / Neighbourhood
  const area = addr.suburb || addr.neighbourhood || addr.sublocality || addr.residential_area || '';
  if (area && !parts.includes(area)) parts.push(area);

  // 4. Locality / City / District
  const city = addr.city || addr.town || addr.municipality || addr.village || addr.city_district || addr.state_district || '';
  if (city && !parts.includes(city)) parts.push(city);

  // 5. State
  const state = addr.state || '';
  if (state && !parts.includes(state)) parts.push(state);

  // 6. Pincode
  const pincode = addr.postcode || '';
  if (pincode) parts.push(pincode);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  if (displayName) {
    return displayName.split(',').slice(0, 5).map(s => s.trim()).join(', ');
  }

  if (lat && lng) {
    return `Location at ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return 'Location coordinates unavailable';
}

function getDevFallbackAddress(lat, lng) {
  if (lat && lng) {
    return `Location at ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return 'Location coordinates unavailable';
}

router.get(['/geo/reverse', '/reverse'], async (req, res) => {
  try {
    const { lat, lng, lon, simulate_error } = req.query;
    const latitude = lat || req.query.latitude;
    const longitude = lng || lon || req.query.longitude;

    if (simulate_error === 'true' || String(latitude) === '999') {
      return res.status(500).json({ success: false, error: 'Simulated geocoding failure for testing.' });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude query parameters are required.' });
    }

    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);

    let cleanOneLine = '';
    let addressComponents = {};
    let displayName = '';

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(parsedLat)}&lon=${encodeURIComponent(parsedLng)}&zoom=18&addressdetails=1&extratags=1&namedetails=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'NivaaroFixApp/1.0 (contact@nivaarofix.in)',
          'Accept-Language': 'en'
        },
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const data = await response.json();
        addressComponents = data.address || {};
        displayName = data.display_name || '';
        cleanOneLine = formatCleanOneLineAddress(addressComponents, displayName);
      }
    } catch (fetchErr) {
      // Dev fallback when offline, rate-limited, or no key
      console.warn('Nominatim reverse geocode fallback:', fetchErr.message);
    }

    if (!cleanOneLine) {
      cleanOneLine = getDevFallbackAddress(parsedLat, parsedLng);
    }

    return res.json({
      success: true,
      address: cleanOneLine,
      address_text: cleanOneLine,
      displayName: displayName || cleanOneLine,
      components: addressComponents,
      lat: parsedLat,
      lng: parsedLng
    });
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// Platform Feedback (Open to everyone: guests, customers, professionals)
// =========================================================================
router.post('/feedback', async (req, res) => {
  try {
    const {
      rating,
      category = 'general',
      problemDefinition = '',
      comment = '',
      contactInfo = '',
      userId = null,
      userRole = 'guest',
      deviceInfo = {}
    } = req.body || {};

    const cleanComment = typeof comment === 'string' ? comment.trim() : '';
    if (!cleanComment) {
      return res.status(400).json({ success: false, error: 'Please provide your feedback or describe the problem.' });
    }

    let cleanRating = null;
    if (rating !== undefined && rating !== null && rating !== '') {
      const parsedRating = parseInt(rating, 10);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ success: false, error: 'Rating must be an integer between 1 and 5.' });
      }
      cleanRating = parsedRating;
    }

    const cleanCategory = typeof category === 'string' && category.trim() ? category.trim().toLowerCase().slice(0, 50) : 'general';
    const cleanProblem = typeof problemDefinition === 'string' ? problemDefinition.trim().slice(0, 100) : '';
    const cleanContact = typeof contactInfo === 'string' ? contactInfo.trim().slice(0, 255) : '';
    const cleanUserId = userId && !isNaN(parseInt(userId, 10)) ? parseInt(userId, 10) : null;
    const cleanRole = typeof userRole === 'string' ? userRole.trim().toLowerCase().slice(0, 50) : 'guest';

    const insertResult = await pool.query(`
      INSERT INTO platform_feedbacks (
        rating,
        category,
        problem_definition,
        comment,
        contact_info,
        user_id,
        user_role,
        device_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at;
    `, [
      cleanRating,
      cleanCategory,
      cleanProblem,
      cleanComment,
      cleanContact || null,
      cleanUserId,
      cleanRole,
      typeof deviceInfo === 'object' && deviceInfo !== null ? JSON.stringify(deviceInfo) : '{}'
    ]);

    return res.status(201).json({
      success: true,
      feedbackId: insertResult.rows[0].id,
      message: 'Thank you for your feedback! We appreciate you helping us improve.'
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit feedback. Please try again.' });
  }
});

router.get('/feedback', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const result = await pool.query(`
      SELECT id, rating, category, problem_definition, comment, contact_info, user_role, status, created_at
      FROM platform_feedbacks
      ORDER BY created_at DESC
      LIMIT $1;
    `, [limit]);

    return res.json({
      success: true,
      feedbacks: result.rows
    });
  } catch (err) {
    console.error('Fetch feedback error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;


