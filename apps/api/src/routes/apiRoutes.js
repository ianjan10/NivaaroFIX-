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

export default router;

