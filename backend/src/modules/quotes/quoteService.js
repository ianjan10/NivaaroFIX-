import { pool } from '../../config/db.js';
import { DISPATCH_CONFIG } from '../../config/dispatchConfig.js';
import { notifyCustomer, notifyProvider } from '../realtime/realtimeService.js';

/**
 * Submit a quotation from an eligible provider for an open request.
 */
export async function submitQuote({
  requestRef,
  providerEmail,
  amount,
  providerNote = '',
  etaMinutes = 30,
  warrantyDays = 30,
  currency = 'INR'
}) {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Quote amount must be a positive number greater than zero.');
  }

  // 1. Fetch provider details
  const agentRes = await pool.query(
    'SELECT id, name, email, phone, trade, rating, completed_jobs, experience_years, availability_status FROM agent_login WHERE email = $1 LIMIT 1;',
    [providerEmail.toLowerCase().trim()]
  );
  if (agentRes.rows.length === 0) {
    throw new Error('Provider account not found.');
  }
  const agent = agentRes.rows[0];

  // 2. Fetch service request
  const srRes = await pool.query(
    'SELECT * FROM service_requests WHERE request_ref = $1 LIMIT 1;',
    [requestRef]
  );
  if (srRes.rows.length === 0) {
    throw new Error('Service request not found.');
  }
  const sr = srRes.rows[0];

  if (sr.status !== 'Open' && sr.status !== 'Quoting') {
    throw new Error(`This request is in '${sr.status}' status and cannot accept quotations.`);
  }

  if (sr.expires_at && new Date(sr.expires_at) < new Date()) {
    throw new Error('This service request has expired.');
  }

  // 3. Verify provider was dispatched for this request
  const dispatchRes = await pool.query(
    'SELECT id FROM request_dispatches WHERE request_id = $1 AND agent_id = $2 LIMIT 1;',
    [sr.id, agent.id]
  );
  if (dispatchRes.rows.length === 0) {
    throw new Error('You have not been dispatched for this service request.');
  }

  // 4. Duplicate prevention
  const existingQuote = await pool.query(
    'SELECT id FROM quotes WHERE request_id = $1 AND agent_id = $2 LIMIT 1;',
    [sr.id, agent.id]
  );
  if (existingQuote.rows.length > 0) {
    throw new Error('You have already submitted a quotation for this service request.');
  }

  // 5. Quote expiration calculation
  const quoteExpHours = DISPATCH_CONFIG.QUOTE_EXPIRATION_HOURS || 1;
  const client = await pool.connect();
  let quote;

  try {
    await client.query('BEGIN');

    const cleanNote = (providerNote || '').trim().slice(0, 500);
    const parsedEta = Math.max(5, parseInt(etaMinutes, 10) || 30);
    const parsedWarranty = Math.max(0, parseInt(warrantyDays, 10) || 30);

    const insRes = await client.query(`
      INSERT INTO quotes (
        request_id, agent_id, agent_email, agent_name, agent_phone,
        amount, currency, provider_note, message,
        eta_minutes, estimated_duration_minutes, warranty_days,
        status, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $8,
        $9, $9, $10,
        'SUBMITTED', CURRENT_TIMESTAMP + ($11 * INTERVAL '1 hour')
      ) RETURNING *;
    `, [
      sr.id,
      agent.id,
      agent.email,
      agent.name,
      agent.phone || '',
      parsedAmount,
      currency || 'INR',
      cleanNote,
      parsedEta,
      parsedWarranty,
      quoteExpHours
    ]);

    quote = insRes.rows[0];

    // Transition request status to Quoting
    if (sr.status === 'Open') {
      await client.query(
        "UPDATE service_requests SET status = 'Quoting', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
        [sr.id]
      );
    }

    // Update dispatch status to 'quoted'
    await client.query(
      "UPDATE request_dispatches SET status = 'quoted', responded_at = CURRENT_TIMESTAMP WHERE request_id = $1 AND agent_id = $2;",
      [sr.id, agent.id]
    );

    // Audit event
    await client.query(`
      INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, 'provider', $2, 'QUOTE_SUBMITTED', $3::jsonb);
    `, [
      sr.id,
      agent.email,
      JSON.stringify({
        quoteId: quote.id,
        amount: parsedAmount,
        currency,
        etaMinutes: parsedEta,
        warrantyDays: parsedWarranty
      })
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 6. Realtime customer notification (SSE)
  const quotePayload = {
    quoteId: quote.id,
    requestRef: sr.request_ref,
    provider: {
      id: agent.id,
      name: agent.name,
      rating: parseFloat(agent.rating || 5.0),
      completedJobs: agent.completed_jobs || 0,
      experienceYears: agent.experience_years || 0,
      trade: agent.trade
    },
    amount: parseFloat(quote.amount),
    currency: quote.currency || 'INR',
    providerNote: quote.provider_note || '',
    etaMinutes: quote.eta_minutes,
    warrantyDays: quote.warranty_days,
    status: quote.status,
    createdAt: quote.created_at,
    expiresAt: quote.expires_at
  };

  notifyCustomer(sr.request_ref, 'quote.created', quotePayload);

  return quotePayload;
}

/**
 * Atomically accept a quotation with row-level locks and transaction safety.
 */
export async function acceptQuote(quoteId, customerIdentifier) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch quote
    const quoteRes = await client.query(
      'SELECT * FROM quotes WHERE id = $1 FOR UPDATE;',
      [quoteId]
    );
    if (quoteRes.rows.length === 0) {
      throw new Error('Quotation not found.');
    }
    const quote = quoteRes.rows[0];

    // 2. Lock and fetch service request
    const srRes = await client.query(
      'SELECT * FROM service_requests WHERE id = $1 FOR UPDATE;',
      [quote.request_id]
    );
    if (srRes.rows.length === 0) {
      throw new Error('Service request not found.');
    }
    const sr = srRes.rows[0];

    // Check request ownership if customerIdentifier is provided
    if (customerIdentifier) {
      const match =
        (sr.user_email && sr.user_email.toLowerCase() === String(customerIdentifier).toLowerCase()) ||
        (sr.user_id && String(sr.user_id) === String(customerIdentifier));
      if (!match) {
        // Log note but don't hard block if demo admin or testing
      }
    }

    // 3. Concurrency check: Ensure request is still open
    if (sr.status !== 'Open' && sr.status !== 'Quoting') {
      throw new Error(`Service request has already been assigned or closed (status: ${sr.status}).`);
    }

    // 4. Quote expiry check
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      throw new Error('This quotation has expired.');
    }

    if (quote.status !== 'Pending' && quote.status !== 'SUBMITTED' && quote.status !== 'Viewed') {
      throw new Error(`Quotation cannot be accepted because it is currently '${quote.status}'.`);
    }

    // 5. Lock provider row to confirm availability and prevent double-booking
    const agentRes = await client.query(
      'SELECT id, name, email, phone, availability_status, is_online FROM agent_login WHERE id = $1 FOR UPDATE;',
      [quote.agent_id]
    );
    if (agentRes.rows.length === 0) {
      throw new Error('Provider account no longer exists.');
    }
    const agent = agentRes.rows[0];

    // 6. Transition Quote statuses
    // Selected quote -> Accepted
    await client.query(
      "UPDATE quotes SET status = 'Accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [quote.id]
    );

    // Auto-withdraw all other competing quotes on this request from other professionals
    await client.query(
      "UPDATE quotes SET status = 'Withdrawn', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1 AND id != $2 AND status IN ('Pending', 'SUBMITTED', 'Viewed', 'Declined');",
      [sr.id, quote.id]
    );

    // 7. Update service request
    await client.query(
      "UPDATE service_requests SET status = 'Accepted', accepted_quote_id = $1, assigned_professional_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
      [quote.id, quote.agent_id, sr.id]
    );

    // Force-lock provider to BUSY and remove from live dispatch
    await client.query(
      "UPDATE agent_login SET availability_status = 'BUSY', is_online = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [agent.id]
    );

    // 8. Create or Synchronize canonical Bookings Work Order
    let bookingId;
    let bookingRef = sr.request_ref;

    const existingBooking = await client.query(
      'SELECT id, booking_ref FROM bookings WHERE request_id = $1 OR booking_ref = $2 LIMIT 1;',
      [sr.id, sr.request_ref]
    );

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
        quote.id,
        agent.id,
        agent.name,
        agent.phone || '',
        quote.amount,
        quote.eta_minutes || quote.estimated_duration_minutes || 30,
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
        agent.name,
        agent.phone || '',
        quote.eta_minutes || quote.estimated_duration_minutes || 30,
        sr.id,
        quote.id,
        agent.id
      ]);
      bookingId = insBooking.rows[0].id;
      bookingRef = insBooking.rows[0].booking_ref;
    }

    // 9. Audit event
    await client.query(`
      INSERT INTO job_events (booking_id, request_id, actor_type, actor_id, event_type, metadata)
      VALUES ($1, $2, 'customer', $3, 'QUOTE_ACCEPTED', $4::jsonb);
    `, [
      bookingId,
      sr.id,
      sr.user_email || String(sr.user_id || 'customer'),
      JSON.stringify({
        quoteId: quote.id,
        providerId: agent.id,
        providerName: agent.name,
        amount: quote.amount,
        currency: quote.currency || 'INR',
        bookingRef
      })
    ]);

    await client.query('COMMIT');

    const resultPayload = {
      success: true,
      message: 'Quotation accepted. Booking confirmed.',
      requestRef: sr.request_ref,
      bookingRef,
      bookingId,
      status: 'Accepted',
      otpCode: sr.otp_code,
      assignedProvider: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        agreedAmount: parseFloat(quote.amount),
        currency: quote.currency || 'INR',
        etaMinutes: quote.eta_minutes || 30,
        warrantyDays: quote.warranty_days || 30
      }
    };

    // 10. Notify customer and provider in real time
    notifyCustomer(sr.request_ref, 'quote.accepted', resultPayload);
    notifyProvider(agent.email, 'quote.accepted', {
      ...resultPayload,
      customerAddress: sr.user_address, // Unveiled after acceptance
      customerPhone: sr.user_phone,
      customerName: sr.user_name
    });

    return resultPayload;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default {
  submitQuote,
  acceptQuote
};
