import { pool } from '../../config/db.js';
import { getPaymentProvider } from './index.js';
import { toPaise, toRupees, calculatePlatformFee, formatINR } from '../../utils/money.js';
import { notifyCustomer, notifyProvider } from '../realtime/realtimeService.js';
import { broadcastToJobSockets } from '../tracking/trackingSocket.js';
import { broadcastAdminEvent } from '../realtime/adminRealtime.js';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT !== undefined ? process.env.PLATFORM_FEE_PERCENT : 10);
const PAYOUT_HOLD_HOURS = Number(process.env.PAYOUT_HOLD_HOURS || 0);

/**
 * ============================================================================
 * PaymentService
 * Enterprise orchestration for NivaaroFix Online Payments & Route Settlements
 * ============================================================================
 */
export class PaymentService {
  /**
   * Check whether a customer has any completed jobs with unpaid balance.
   * Gating rule: "The customer cannot start a new booking while a completed job is unpaid."
   */
  static async checkUnpaidCompletedJobs(customerIdentifier, emailFallback = null) {
    if (!customerIdentifier && !emailFallback) return { hasUnpaid: false };

    const query = `
      SELECT sr.id, sr.request_ref, sr.service_title, p.id AS payment_id, p.payment_code, p.status AS payment_status, p.amount
      FROM service_requests sr
      LEFT JOIN payments p ON p.service_request_id = sr.id
      WHERE (
        ($1::TEXT IS NOT NULL AND (sr.customer_id::TEXT = $1 OR sr.user_id::TEXT = $1 OR LOWER(sr.user_email) = LOWER($1)))
        OR ($2::TEXT IS NOT NULL AND LOWER(sr.user_email) = LOWER($2))
      )
        AND LOWER(sr.status) = 'completed'
        AND (p.id IS NULL OR p.status IN ('due', 'processing', 'failed'))
      ORDER BY sr.id DESC
      LIMIT 1;
    `;
    const res = await pool.query(query, [
      customerIdentifier ? String(customerIdentifier) : null,
      emailFallback ? String(emailFallback).trim() : null
    ]);
    if (res.rows.length === 0) {
      return { hasUnpaid: false };
    }

    const row = res.rows[0];
    return {
      hasUnpaid: true,
      bookingId: row.id,
      requestRef: row.request_ref,
      serviceTitle: row.service_title,
      paymentCode: row.payment_code,
      paymentStatus: row.payment_status || 'due',
      amount: row.amount ? Number(row.amount) : null
    };
  }

  /**
   * Check whether professional has active payout setup before accepting jobs or going available.
   * Gating rule: "A professional can only go Available and accept jobs after payout setup is active."
   */
  static async checkProfessionalPayoutStatus(proId) {
    const res = await pool.query(
      'SELECT id, payout_status, bank_name, bank_last4, provider_linked_account_id FROM professionals WHERE id = $1;',
      [proId]
    );
    if (res.rows.length === 0) {
      throw new Error('Professional not found');
    }
    const pro = res.rows[0];
    return {
      isActive: pro.payout_status === 'active',
      payoutStatus: pro.payout_status || 'not_set',
      payout_status: pro.payout_status || 'not_set',
      bankName: pro.bank_name || null,
      bank_name: pro.bank_name || null,
      bankLast4: pro.bank_last4 || null,
      bank_last4: pro.bank_last4 || null,
      hasLinkedAccount: Boolean(pro.provider_linked_account_id)
    };
  }

  /**
   * Create or retrieve existing order for completed service request.
   */
  static async createOrderForBooking({ bookingIdentifier, customerId, customerEmail }) {
    const provider = getPaymentProvider();

    // 1. Fetch service request & verify completion
    const srQuery = `
      SELECT sr.id, sr.request_ref, sr.service_request_code, sr.status, sr.customer_id, sr.user_email, sr.user_name, sr.user_phone,
             sr.service_title, sr.category, sr.assigned_professional_id, sr.accepted_quote_id, sr.completion_photos,
             p.name AS pro_name, p.trade AS pro_trade, p.email AS pro_email, p.id AS pro_id,
             COALESCE(q.amount, 100) AS quote_amount
      FROM service_requests sr
      LEFT JOIN professionals p ON p.id = sr.assigned_professional_id
      LEFT JOIN quotes q ON (q.id = sr.accepted_quote_id OR (q.request_id = sr.id AND LOWER(q.status) = 'accepted'))
      WHERE (sr.id::TEXT = $1 OR sr.request_ref = $1 OR sr.service_request_code = $1)
      LIMIT 1;
    `;
    const srRes = await pool.query(srQuery, [String(bookingIdentifier)]);
    if (srRes.rows.length === 0) {
      const err = new Error('Service booking not found.');
      err.status = 404;
      throw err;
    }

    const booking = srRes.rows[0];

    // 2. Security: Ownership verification
    const isOwner = !customerId && !customerEmail ? true : (
                    (customerId && String(booking.customer_id) === String(customerId)) ||
                    (customerEmail && booking.user_email?.toLowerCase() === customerEmail.toLowerCase())
    );
    if (!isOwner) {
      const err = new Error('Forbidden: You can only initiate payment for your own bookings.');
      err.status = 403;
      throw err;
    }

    // 3. Workflow verification: Must be completed
    if (booking.status?.toLowerCase() !== 'completed') {
      const err = new Error('Payment can only be processed after job completion.');
      err.status = 400;
      throw err;
    }

    // 4. Server-enforced amount from accepted quote
    const agreedAmount = Number(booking.quote_amount);
    if (!agreedAmount || agreedAmount <= 0) {
      const err = new Error('Invalid quote amount for completed booking.');
      err.status = 400;
      throw err;
    }

    // Calculate fee breakdown
    const feeBreakdown = calculatePlatformFee(agreedAmount, PLATFORM_FEE_PERCENT);

    // 5. Check if an order already exists for this booking
    const existingPayRes = await pool.query(
      'SELECT * FROM payments WHERE service_request_id = $1;',
      [booking.id]
    );

    if (existingPayRes.rows.length > 0) {
      const existingPay = existingPayRes.rows[0];

      // If already paid, return paid status
      if (existingPay.status === 'paid') {
        return {
          status: 'paid',
          payment: existingPay,
          alreadyPaid: true
        };
      }

      // If in due or processing state, reuse provider_order_id if valid
      if (existingPay.provider_order_id) {
        return {
          status: existingPay.status,
          payment: existingPay,
          order: {
            id: existingPay.provider_order_id,
            amount: toPaise(existingPay.amount),
            currency: existingPay.currency,
            keyId: provider.keyId || process.env.RAZORPAY_KEY_ID
          },
          feeBreakdown,
          completionPhotos: booking.completion_photos
        };
      }
    }

    // 6. Generate collision-free public payment code: YYYY + 6 digits from code_sequences
    const codeRes = await pool.query("SELECT next_entity_code('payment', 6) as code;");
    const paymentCode = codeRes.rows[0].code;

    // 7. Create provider order
    const providerOrder = await provider.createOrder({
      amountPaise: feeBreakdown.totalPaise,
      currency: 'INR',
      receipt: paymentCode,
      notes: {
        bookingId: booking.id,
        requestRef: booking.request_ref,
        serviceTitle: booking.service_title,
        customerEmail: booking.user_email,
        professionalEmail: booking.pro_email
      }
    });

    // 8. Atomic insertion or update in database
    const paymentInsertQuery = `
      INSERT INTO payments (
        payment_code, service_request_id, customer_id, professional_id,
        amount, currency, platform_fee, professional_amount,
        status, provider, provider_order_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'INR', $6, $7, 'due', $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (service_request_id) DO UPDATE SET
        provider_order_id = EXCLUDED.provider_order_id,
        amount = EXCLUDED.amount,
        platform_fee = EXCLUDED.platform_fee,
        professional_amount = EXCLUDED.professional_amount,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const savedPaymentRes = await pool.query(paymentInsertQuery, [
      paymentCode,
      booking.id,
      booking.customer_id,
      booking.pro_id,
      feeBreakdown.totalRupees,
      feeBreakdown.platformFeeRupees,
      feeBreakdown.professionalAmountRupees,
      process.env.PAYMENT_PROVIDER || 'razorpay',
      providerOrder.id
    ]);

    const savedPayment = savedPaymentRes.rows[0];

    // 9. Record checkout attempt
    await pool.query(`
      INSERT INTO payment_attempts (payment_id, provider_order_id, status)
      VALUES ($1, $2, 'initiated');
    `, [savedPayment.id, providerOrder.id]);

    return {
      status: 'due',
      payment: savedPayment,
      order: {
        id: providerOrder.id,
        amount: feeBreakdown.totalPaise,
        currency: 'INR',
        keyId: provider.keyId || process.env.RAZORPAY_KEY_ID
      },
      feeBreakdown,
      completionPhotos: booking.completion_photos
    };
  }

  /**
   * Helper to persist customer star rating & optional feedback to database
   */
  static async saveRatingAndFeedback({ booking, rating, feedback }) {
    if (!booking || !rating) return;
    const numericRating = Math.max(1, Math.min(5, Math.round(Number(rating))));
    const cleanFeedback = (feedback || '').trim().slice(0, 500);

    try {
      // 1. Update service_requests rating
      await pool.query(
        "UPDATE service_requests SET rating = $1, rating_feedback = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 OR request_ref = $4;",
        [numericRating, cleanFeedback, booking.id, booking.request_ref]
      );

      // 2. Update bookings rating
      await pool.query(
        "UPDATE bookings SET rating = $1, review_feedback = $2, updated_at = CURRENT_TIMESTAMP WHERE request_id = $3 OR booking_ref = $4;",
        [numericRating, cleanFeedback, booking.id, booking.request_ref]
      );

      // 3. Resolve provider/agent ID
      let agentId = booking.assigned_professional_id || booking.pro_id;
      if (!agentId && booking.accepted_quote_id) {
        const qRes = await pool.query('SELECT agent_id, professional_id FROM quotes WHERE id = $1 LIMIT 1;', [booking.accepted_quote_id]);
        if (qRes.rows.length > 0) {
          agentId = qRes.rows[0].professional_id || qRes.rows[0].agent_id;
        }
      }

      // 4. Resolve customer ID
      let validCustomerId = booking.customer_id;
      if (!validCustomerId && booking.user_email) {
        const cRes = await pool.query('SELECT id FROM customers WHERE email = $1 LIMIT 1;', [booking.user_email]);
        if (cRes.rows.length > 0) validCustomerId = cRes.rows[0].id;
      }

      // 5. Insert into reviews
      if (agentId) {
        await pool.query(`
          INSERT INTO reviews (request_id, customer_id, provider_id, rating, feedback, tags)
          VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)
          ON CONFLICT (request_id) DO UPDATE
          SET rating = EXCLUDED.rating,
              feedback = EXCLUDED.feedback,
              tags = EXCLUDED.tags,
              customer_id = EXCLUDED.customer_id,
              provider_id = EXCLUDED.provider_id;
        `, [booking.id, validCustomerId, agentId, numericRating, cleanFeedback]);

        // 6. Recompute average rating
        const aggRes = await pool.query(`
          SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating
          FROM reviews
          WHERE provider_id = $1 OR provider_id IN (SELECT id FROM professionals WHERE email = (SELECT email FROM agent_login WHERE id = $1));
        `, [agentId]);

        if (aggRes.rows.length > 0 && aggRes.rows[0].avg_rating !== null) {
          const newAvg = parseFloat(aggRes.rows[0].avg_rating);
          await pool.query('UPDATE agent_login SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;', [newAvg, agentId]).catch(() => {});
          await pool.query('UPDATE professionals SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 OR email = (SELECT email FROM agent_login WHERE id = $2);', [newAvg, agentId]).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Error saving rating and feedback:', err.message);
    }
  }

  /**
   * Cash on Delivery / Cash to Technician payment processor.
   * Handles immediate settlement and optional review/rating.
   */
  static async processCashPaymentForBooking({ bookingIdentifier, customerId, customerEmail, rating, feedback }) {
    const srQuery = `
      SELECT sr.id, sr.request_ref, sr.service_request_code, sr.status, sr.customer_id, sr.user_email, sr.user_name, sr.user_phone,
             sr.service_title, sr.category, sr.assigned_professional_id, sr.accepted_quote_id, sr.completion_photos,
             p.name AS pro_name, p.trade AS pro_trade, p.email AS pro_email, p.id AS pro_id,
             COALESCE(q.amount, 100) AS quote_amount
      FROM service_requests sr
      LEFT JOIN professionals p ON p.id = sr.assigned_professional_id
      LEFT JOIN quotes q ON (q.id = sr.accepted_quote_id OR (q.request_id = sr.id AND LOWER(q.status) = 'accepted'))
      WHERE (sr.id::TEXT = $1 OR sr.request_ref = $1 OR sr.service_request_code = $1)
      LIMIT 1;
    `;
    const srRes = await pool.query(srQuery, [String(bookingIdentifier)]);
    if (srRes.rows.length === 0) {
      const err = new Error('Service booking not found.');
      err.status = 404;
      throw err;
    }

    const booking = srRes.rows[0];

    // Ownership check
    const isOwner = !customerId && !customerEmail ? true : (
      (customerId && String(booking.customer_id) === String(customerId)) ||
      (customerEmail && booking.user_email?.toLowerCase() === customerEmail.toLowerCase())
    );
    if (!isOwner) {
      const err = new Error('Forbidden: You can only record payment for your own bookings.');
      err.status = 403;
      throw err;
    }

    if (booking.status?.toLowerCase() !== 'completed') {
      const err = new Error('Payment can only be processed after job completion.');
      err.status = 400;
      throw err;
    }

    const agreedAmount = Number(booking.quote_amount) || 100;
    const feeBreakdown = calculatePlatformFee(agreedAmount, PLATFORM_FEE_PERCENT);
    const paymentCode = booking.request_ref || booking.service_request_code || `PAY-${booking.id}`;
    
    // 12-digit numerical payment ID & order ID in clean enterprise range
    const capDate = new Date();
    const yyyy = capDate.getFullYear();
    const mm = String(capDate.getMonth() + 1).padStart(2, '0');
    const dd = String(capDate.getDate()).padStart(2, '0');
    const seq = String(booking.id || 1).replace(/\D/g, '').slice(-4).padStart(4, '0');
    const cashPaymentId = `${yyyy}${mm}${dd}${seq}`; // 12 digits: e.g. 202611220004
    const cashOrderId = `${yyyy}${mm}${dd}01${seq.slice(-2)}`; // 12 digits: e.g. 202611220104

    let payment;
    const existingPay = await pool.query('SELECT * FROM payments WHERE service_request_id = $1;', [booking.id]);
    if (existingPay.rows.length > 0) {
      const currentOrderId = existingPay.rows[0].provider_order_id && /^\d{8,16}$/.test(existingPay.rows[0].provider_order_id)
        ? existingPay.rows[0].provider_order_id
        : cashOrderId;
      const updateRes = await pool.query(`
        UPDATE payments
        SET status = 'paid', method = 'cash', provider = 'cash', provider_payment_id = $1, provider_order_id = $2,
            captured_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *;
      `, [cashPaymentId, currentOrderId, existingPay.rows[0].id]);
      payment = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(`
        INSERT INTO payments (
          payment_code, service_request_id, customer_id, professional_id,
          amount, platform_fee, professional_amount, provider, provider_payment_id, provider_order_id, method, status, captured_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'cash', $8, $9, 'cash', 'paid', CURRENT_TIMESTAMP)
        RETURNING *;
      `, [
        paymentCode,
        booking.id,
        booking.customer_id,
        booking.pro_id,
        feeBreakdown.totalRupees,
        feeBreakdown.platformFeeRupees,
        feeBreakdown.professionalAmountRupees,
        cashPaymentId,
        cashOrderId
      ]);
      payment = insertRes.rows[0];
    }

    // Credit professional's wallet / ledger
    const proShare = Number(feeBreakdown.professionalAmountRupees);
    if (booking.pro_id) {
      try {
        await pool.query(`
          UPDATE professionals SET wallet_balance = wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
        `, [proShare, booking.pro_id]);
      } catch (e) {}
    }

    // Record optional customer star rating and feedback
    if (rating && Number(rating) >= 1 && Number(rating) <= 5) {
      await PaymentService.saveRatingAndFeedback({
        booking,
        rating: Number(rating),
        feedback: (feedback || '').trim()
      });
    }

    // Record payment attempt
    await pool.query(`
      INSERT INTO payment_attempts (payment_id, provider_payment_id, status)
      VALUES ($1, $2, 'captured');
    `, [payment.id, cashPaymentId]).catch(() => {});

    // Realtime notifications
    const paidPayload = {
      paymentCode,
      requestRef: booking.request_ref,
      status: 'paid',
      method: 'cash',
      amount: agreedAmount
    };
    notifyCustomer(booking.request_ref, 'payment.captured', paidPayload);
    broadcastToJobSockets(booking.request_ref, { type: 'payment.captured', ...paidPayload });
    try {
      broadcastAdminEvent('transactions.updated', { paymentCode, status: 'paid', amount: agreedAmount });
    } catch (_) {}

    return {
      success: true,
      status: 'paid',
      method: 'cash',
      paymentCode,
      payment,
      amount: agreedAmount
    };
  }

  /**
   * Verify checkout signature submitted by client.
   * Supports immediate mock capture and optional customer rating & feedback.
   */
  static async verifyCheckout({ bookingIdentifier, orderId, paymentId, signature, customerId, customerEmail, rating, feedback }) {
    const provider = getPaymentProvider();

    const payQuery = `
      SELECT p.*, sr.request_ref, sr.user_email, sr.assigned_professional_id, al.email AS pro_email
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      LEFT JOIN agent_login al ON al.id = sr.assigned_professional_id
      WHERE (sr.id::TEXT = $1 OR sr.request_ref = $1 OR sr.service_request_code = $1)
      LIMIT 1;
    `;
    const payRes = await pool.query(payQuery, [String(bookingIdentifier)]);
    if (payRes.rows.length === 0) {
      const err = new Error('Payment record not found for booking.');
      err.status = 404;
      throw err;
    }

    const payment = payRes.rows[0];

    // Ownership check
    if (customerId && String(payment.customer_id) !== String(customerId)) {
      if (!customerEmail || payment.user_email?.toLowerCase() !== customerEmail.toLowerCase()) {
        const err = new Error('Forbidden: Unauthorized payment verification attempt.');
        err.status = 403;
        throw err;
      }
    }

    // Verify cryptographic signature
    const isValid = provider.verifyCheckoutSignature({ orderId, paymentId, signature });
    if (!isValid) {
      // Record failed attempt
      await pool.query(`
        INSERT INTO payment_attempts (payment_id, provider_order_id, provider_payment_id, status, error_code, error_description)
        VALUES ($1, $2, $3, 'failed', 'BAD_SIGNATURE', 'Cryptographic HMAC signature mismatch');
      `, [payment.id, orderId, paymentId]);

      await pool.query(`
        UPDATE payments SET status = 'failed', failure_reason = 'Cryptographic signature verification failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `, [payment.id]);

      const err = new Error('Invalid payment signature. Verification failed.');
      err.status = 400;
      throw err;
    }

    // Record verified attempt
    await pool.query(`
      INSERT INTO payment_attempts (payment_id, provider_order_id, provider_payment_id, status)
      VALUES ($1, $2, $3, 'processing');
    `, [payment.id, orderId, paymentId]);

    // Record rating & feedback if provided
    if (rating && Number(rating) >= 1 && Number(rating) <= 5) {
      await PaymentService.saveRatingAndFeedback({
        booking: {
          id: payment.service_request_id,
          request_ref: payment.request_ref,
          user_email: payment.user_email,
          customer_id: payment.customer_id,
          assigned_professional_id: payment.assigned_professional_id,
          pro_id: payment.professional_id
        },
        rating: Number(rating),
        feedback: (feedback || '').trim()
      });
    }

    // If order was simulated or in mock mode, mark paid directly
    const isMock = orderId && orderId.startsWith('order_mock_');
    const targetStatus = isMock ? 'paid' : 'processing';

    const updateRes = await pool.query(`
      UPDATE payments 
      SET status = $1::TEXT, provider_payment_id = $2, method = COALESCE(method, 'online'),
          captured_at = CASE WHEN $1::TEXT = 'paid' THEN CURRENT_TIMESTAMP ELSE captured_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
    `, [targetStatus, paymentId, payment.id]);

    const updatedPayment = updateRes.rows[0] || payment;

    if (isMock && payment.professional_id) {
      const proShare = Number(payment.professional_amount);
      await pool.query(`
        UPDATE professionals SET wallet_balance = wallet_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
      `, [proShare, payment.professional_id]).catch(() => {});
    }

    // Realtime notification
    const eventType = isMock ? 'payment.captured' : 'payment.processing';
    const notifPayload = {
      paymentCode: updatedPayment.payment_code,
      requestRef: payment.request_ref,
      status: targetStatus,
      amount: Number(updatedPayment.amount)
    };
    notifyCustomer(payment.request_ref, eventType, notifPayload);
    broadcastToJobSockets(payment.request_ref, { type: eventType, ...notifPayload });
    try {
      broadcastAdminEvent('transactions.updated', { paymentCode: updatedPayment.payment_code, status: targetStatus });
    } catch (_) {}

    return {
      success: true,
      status: targetStatus,
      paymentCode: updatedPayment.payment_code
    };
  }

  /**
   * Process incoming Webhook from Razorpay or Mock.
   * Handles payment captured, failed, transfer, and refund events idempotently.
   */
  static async handleWebhook({ rawBody, signature, eventIdHeader }) {
    const provider = getPaymentProvider();
    const event = provider.parseWebhook({ rawBody, signature });

    const eventId = eventIdHeader || event.eventId;
    if (!eventId) {
      const err = new Error('Missing webhook event ID');
      err.status = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check inside transaction
      const existingEvt = await client.query(
        'SELECT id, processed_at FROM webhook_events WHERE provider_event_id = $1 FOR UPDATE;',
        [eventId]
      );

      if (existingEvt.rows.length > 0 && existingEvt.rows[0].processed_at) {
        await client.query('COMMIT');
        return { processed: true, duplicate: true, eventId };
      }

      if (existingEvt.rows.length === 0) {
        await client.query(`
          INSERT INTO webhook_events (provider_event_id, provider, type, payload)
          VALUES ($1, $2, $3, $4);
        `, [eventId, process.env.PAYMENT_PROVIDER || 'razorpay', event.eventType, event.payload]);
      }

      // Handle specific event types
      const eventType = event.eventType;

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        await this._handlePaymentCaptured(client, event);
      } else if (eventType === 'payment.failed') {
        await this._handlePaymentFailed(client, event);
      } else if (eventType === 'transfer.processed' || eventType === 'transfer.settled') {
        await this._handleTransferSettled(client, event);
      } else if (eventType === 'transfer.failed') {
        await this._handleTransferFailed(client, event);
      } else if (eventType === 'refund.processed') {
        await this._handleRefundProcessed(client, event);
      }

      // Mark event as processed
      await client.query(
        'UPDATE webhook_events SET processed_at = CURRENT_TIMESTAMP WHERE provider_event_id = $1;',
        [eventId]
      );

      await client.query('COMMIT');
      return { processed: true, eventType, eventId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Internal handler for payment.captured
   */
  static async _handlePaymentCaptured(client, event) {
    const paymentEntity = event.payment;
    const orderEntity = event.order;
    const orderId = paymentEntity?.order_id || orderEntity?.id;
    const paymentId = paymentEntity?.id;
    const method = paymentEntity?.method || 'upi';

    if (!orderId && !paymentId) return;

    // Locate payment record
    const payRes = await client.query(`
      SELECT p.*, sr.request_ref, sr.user_email, al.email AS pro_email,
             pro.id AS pro_id, pro.provider_linked_account_id, pro.payout_status
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      JOIN professionals pro ON pro.id = p.professional_id
      LEFT JOIN agent_login al ON al.id = pro.id
      WHERE (p.provider_order_id = $1 OR p.provider_payment_id = $2)
      LIMIT 1;
    `, [orderId, paymentId]);

    if (payRes.rows.length === 0) return;
    const payment = payRes.rows[0];

    // Guard against backward transitions (e.g. refunded -> paid)
    if (payment.status === 'refunded') {
      console.warn(`Ignoring captured event for refunded payment: ${payment.payment_code}`);
      return;
    }

    if (payment.status !== 'paid') {
      // 1. Mark payment paid
      await client.query(`
        UPDATE payments
        SET status = 'paid', provider_payment_id = $1, method = $2, captured_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3;
      `, [paymentId || payment.provider_payment_id, method, payment.id]);

      // 2. Mark payment attempt captured
      await client.query(`
        UPDATE payment_attempts
        SET status = 'captured', provider_payment_id = $1
        WHERE payment_id = $2 AND (provider_order_id = $3 OR provider_payment_id = $1);
      `, [paymentId, payment.id, orderId]);

      // 3. Update professional wallet balance & settlement records
      const proShare = Number(payment.professional_amount);
      await client.query(`
        UPDATE professionals
        SET wallet_balance = wallet_balance + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [proShare, payment.professional_id]);

      // 4. Create Route transfer to professional's linked account
      await this._initiateRouteTransfer(client, payment, proShare);

      // 5. Realtime notifications
      const capturePayload = {
        paymentCode: payment.payment_code,
        requestRef: payment.request_ref,
        status: 'paid',
        amount: Number(payment.amount),
        professionalAmount: proShare,
        method: method,
        capturedAt: new Date().toISOString()
      };

      notifyCustomer(payment.request_ref, 'payment.captured', capturePayload);
      if (payment.pro_email) {
        notifyProvider(payment.pro_email, 'payment.captured', {
          ...capturePayload,
          message: `Payment received · ${formatINR(proShare)}`
        });
      }
      broadcastToJobSockets(payment.request_ref, { type: 'payment.captured', ...capturePayload });
    }
  }

  /**
   * Internal handler to initiate Route transfer with payout hold and retries.
   */
  static async _initiateRouteTransfer(client, payment, proShareRupees) {
    const provider = getPaymentProvider();
    const linkedAccountId = payment.provider_linked_account_id;
    const proId = payment.professional_id;

    const holdUntil = PAYOUT_HOLD_HOURS > 0
      ? new Date(Date.now() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000)
      : null;

    if (!linkedAccountId) {
      console.warn(`Professional ${proId} has no linked account; payout queued in wallet.`);
      await client.query(`
        INSERT INTO payment_transfers (payment_id, professional_id, status, amount, failure_reason)
        VALUES ($1, $2, 'pending', $3, 'Awaiting linked account setup');
      `, [payment.id, proId, proShareRupees]);
      return;
    }

    try {
      const idempotencyKey = `trf_${payment.id}_${toPaise(proShareRupees)}`;
      const transfer = await provider.createTransfer({
        paymentId: payment.provider_payment_id,
        linkedAccountId: linkedAccountId,
        amountPaise: toPaise(proShareRupees),
        currency: 'INR',
        holdUntil: holdUntil,
        notes: {
          paymentCode: payment.payment_code,
          serviceRequestId: payment.service_request_id,
          proId: proId
        },
        idempotencyKey
      });

      await client.query(`
        INSERT INTO payment_transfers (
          payment_id, professional_id, provider_transfer_id, status, amount, settled_at, hold_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        payment.id,
        proId,
        transfer.id,
        transfer.status === 'processed' ? 'settled' : 'processing',
        proShareRupees,
        transfer.status === 'processed' ? new Date() : null,
        holdUntil
      ]);
    } catch (err) {
      console.error(`Route transfer failed for payment ${payment.payment_code}:`, err.message);
      await client.query(`
        INSERT INTO payment_transfers (
          payment_id, professional_id, status, amount, failure_reason, retry_count
        ) VALUES ($1, $2, 'failed', $3, $4, 1);
      `, [payment.id, proId, proShareRupees, err.message]);
    }
  }

  /**
   * Internal handler for payment.failed
   */
  static async _handlePaymentFailed(client, event) {
    const paymentEntity = event.payment;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    const errorDescription = paymentEntity?.error_description || 'Payment failed';

    if (!orderId && !paymentId) return;

    const payRes = await client.query(`
      SELECT p.*, sr.request_ref 
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      WHERE (p.provider_order_id = $1 OR p.provider_payment_id = $2)
      LIMIT 1;
    `, [orderId, paymentId]);

    if (payRes.rows.length === 0) return;
    const payment = payRes.rows[0];

    if (payment.status !== 'paid') {
      await client.query(`
        UPDATE payments
        SET status = 'failed', failure_reason = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
      `, [errorDescription, payment.id]);

      await client.query(`
        INSERT INTO payment_attempts (payment_id, provider_order_id, provider_payment_id, status, error_description)
        VALUES ($1, $2, $3, 'failed', $4);
      `, [payment.id, orderId || payment.provider_order_id, paymentId, errorDescription]);

      notifyCustomer(payment.request_ref, 'payment.failed', {
        paymentCode: payment.payment_code,
        requestRef: payment.request_ref,
        status: 'failed',
        reason: errorDescription
      });
      broadcastToJobSockets(payment.request_ref, { type: 'payment.failed', reason: errorDescription });
    }
  }

  /**
   * Internal handler for transfer.settled / transfer.processed
   */
  static async _handleTransferSettled(client, event) {
    const transferEntity = event.transfer || event.payload;
    const transferId = transferEntity?.id;
    if (!transferId) return;

    await client.query(`
      UPDATE payment_transfers
      SET status = 'settled', settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE provider_transfer_id = $1;
    `, [transferId]);
  }

  /**
   * Internal handler for transfer.failed
   */
  static async _handleTransferFailed(client, event) {
    const transferEntity = event.transfer || event.payload;
    const transferId = transferEntity?.id;
    const reason = transferEntity?.error_description || 'Transfer failed at provider';
    if (!transferId) return;

    await client.query(`
      UPDATE payment_transfers
      SET status = 'failed', failure_reason = $1, updated_at = CURRENT_TIMESTAMP
      WHERE provider_transfer_id = $2;
    `, [reason, transferId]);
  }

  /**
   * Internal handler for refund.processed
   */
  static async _handleRefundProcessed(client, event) {
    const refundEntity = event.refund || event.payload;
    const paymentId = refundEntity?.payment_id;
    const refundId = refundEntity?.id;
    if (!paymentId) return;

    await client.query(`
      UPDATE payments SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
      WHERE provider_payment_id = $1;
    `, [paymentId]);

    await client.query(`
      UPDATE refunds SET status = 'processed' WHERE provider_refund_id = $1;
    `, [refundId]);
  }

  /**
   * Administrative Refund
   * Reverses payment and professional Route transfer.
   */
  static async issueRefund({ bookingIdentifier, adminId, reason = 'Administrative cancellation' }) {
    const provider = getPaymentProvider();

    const payRes = await pool.query(`
      SELECT p.*, sr.request_ref
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      WHERE (sr.id::TEXT = $1 OR sr.request_ref = $1 OR sr.service_request_code = $1 OR p.id::TEXT = $1)
      LIMIT 1;
    `, [String(bookingIdentifier)]);

    if (payRes.rows.length === 0) {
      const err = new Error('Payment record not found.');
      err.status = 404;
      throw err;
    }

    const payment = payRes.rows[0];
    if (payment.status !== 'paid') {
      const err = new Error(`Only paid payments can be refunded. Current status is '${payment.status}'.`);
      err.status = 400;
      throw err;
    }

    const idempotencyKey = `rfnd_${payment.id}_${toPaise(payment.amount)}`;
    const refundResult = await provider.refund({
      paymentId: payment.provider_payment_id,
      amountPaise: toPaise(payment.amount),
      reason,
      reverseTransfer: true,
      idempotencyKey
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record refund
      await client.query(`
        INSERT INTO refunds (payment_id, amount, reason, provider_refund_id, status, processed_by_admin_id)
        VALUES ($1, $2, $3, $4, 'processed', $5);
      `, [payment.id, payment.amount, reason, refundResult.id, adminId || null]);

      // Move payment status
      await client.query(`
        UPDATE payments SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = $1;
      `, [payment.id]);

      // Deduct from professional wallet
      await client.query(`
        UPDATE professionals SET wallet_balance = GREATEST(0.00, wallet_balance - $1) WHERE id = $2;
      `, [payment.professional_amount, payment.professional_id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    notifyCustomer(payment.request_ref, 'payment.refunded', {
      paymentCode: payment.payment_code,
      amount: Number(payment.amount),
      reason
    });

    return {
      success: true,
      refundId: refundResult.id,
      status: 'refunded',
      amount: payment.amount
    };
  }

  /**
   * Save professional payout details and link bank account with provider.
   * Never stores PAN or full account number in database or logs!
   */
  static async saveProfessionalPayout({ professionalId, name, email, phone, accountNumber, ifsc, pan }) {
    const cleanPan = (pan || '').toUpperCase().trim();
    const cleanIfsc = (ifsc || '').toUpperCase().trim();
    const cleanAcc = (accountNumber || '').trim();

    // Validate formats
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      const err = new Error('Invalid PAN number format (expected 5 letters, 4 digits, 1 letter).');
      err.status = 400;
      throw err;
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      const err = new Error('Invalid IFSC code format (e.g. HDFC0001234).');
      err.status = 400;
      throw err;
    }

    if (!/^\d{9,18}$/.test(cleanAcc)) {
      const err = new Error('Bank account number must be between 9 and 18 digits.');
      err.status = 400;
      throw err;
    }

    const provider = getPaymentProvider();
    const idempotencyKey = `acc_${professionalId}_${cleanIfsc}`;

    const linkedAccount = await provider.createLinkedAccount({
      name,
      email,
      phone,
      accountNumber: cleanAcc,
      ifsc: cleanIfsc,
      pan: cleanPan,
      idempotencyKey
    });

    // Update DB with ONLY bank name, last 4 digits, and linked account ID
    const updateRes = await pool.query(`
      UPDATE professionals
      SET provider_linked_account_id = $1,
          payout_status = $2,
          bank_name = $3,
          bank_last4 = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, payout_status, bank_name, bank_last4;
    `, [
      linkedAccount.id,
      linkedAccount.status || 'active',
      linkedAccount.bankName,
      linkedAccount.last4,
      professionalId
    ]);

    return updateRes.rows[0];
  }

  /**
   * Retrieve Professional Earnings & Payout Breakdown.
   */
  static async getProfessionalEarnings(professionalId) {
    const proRes = await pool.query(
      'SELECT id, wallet_balance, payout_status, bank_name, bank_last4 FROM professionals WHERE id = $1;',
      [professionalId]
    );
    if (proRes.rows.length === 0) {
      throw new Error('Professional not found');
    }
    const pro = proRes.rows[0];

    // Query jobs with payment transfers
    const transfersQuery = `
      SELECT pt.id AS transfer_id, pt.amount AS payout_amount, pt.status AS transfer_status,
             pt.settled_at, pt.failure_reason, pt.retry_count,
             p.id AS payment_id, p.payment_code, p.amount AS total_amount, p.platform_fee,
             p.status AS payment_status, p.captured_at, p.method,
             p.provider_order_id, p.provider_payment_id,
             sr.id AS booking_id, sr.request_ref, sr.service_title, sr.category,
             sr.user_name, sr.user_address
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      LEFT JOIN payment_transfers pt ON pt.payment_id = p.id
      WHERE p.professional_id = $1 AND p.status IN ('paid', 'processing')
      ORDER BY p.id DESC;
    `;
    const transfersRes = await pool.query(transfersQuery, [professionalId]);
    const items = transfersRes.rows;

    let totalEarned = 0;
    let pendingSettlement = 0;
    let settled = 0;

    items.forEach(item => {
      const grossVal = Number(item.total_amount || 0);
      const feeVal = Number(item.platform_fee != null ? item.platform_fee : (grossVal * 0.1));
      const payoutVal = Number(item.payout_amount != null ? item.payout_amount : (grossVal - feeVal));
      totalEarned += payoutVal;

      if (item.transfer_status === 'settled') {
        settled += payoutVal;
      } else {
        pendingSettlement += payoutVal;
      }
    });

    return {
      totalEarned: Number(totalEarned.toFixed(2)),
      pendingSettlement: Number(pendingSettlement.toFixed(2)),
      settled: Number(settled.toFixed(2)),
      summary: {
        totalEarned: Number(totalEarned.toFixed(2)),
        pendingSettlement: Number(pendingSettlement.toFixed(2)),
        settled: Number(settled.toFixed(2)),
        walletBalance: Number(pro.wallet_balance || 0)
      },
      payoutAccount: {
        status: pro.payout_status,
        bankName: pro.bank_name,
        bankLast4: pro.bank_last4
      },
      jobs: items.map(i => ({
        bookingId: i.booking_id,
        requestRef: i.request_ref,
        serviceTitle: i.service_title,
        customerName: i.user_name || 'Valued Customer',
        customerAddress: i.user_address || '',
        paymentCode: i.payment_code,
        method: i.method || 'online',
        providerOrderId: i.provider_order_id,
        providerPaymentId: i.provider_payment_id,
        transactionId: i.provider_order_id || i.provider_payment_id || i.payment_code,
        totalAmount: Number(i.total_amount),
        platformFee: Number(i.platform_fee != null ? i.platform_fee : (Number(i.total_amount) * 0.1)),
        payoutAmount: Number(i.payout_amount != null ? i.payout_amount : (Number(i.total_amount) - Number(i.platform_fee != null ? i.platform_fee : (Number(i.total_amount) * 0.1)))),
        status: i.transfer_status === 'settled' ? 'Settled'
              : i.transfer_status === 'failed' ? 'Retrying'
              : 'Processing',
        settledAt: i.settled_at,
        capturedAt: i.captured_at
      }))
    };
  }

  /**
   * Background Reconciliation Job:
   * Fixes payments stuck in 'processing' or 'due' by querying the provider.
   */
  static async runReconciliation() {
    const provider = getPaymentProvider();
    const stuckQuery = `
      SELECT p.*, sr.request_ref
      FROM payments p
      JOIN service_requests sr ON sr.id = p.service_request_id
      WHERE p.status = 'processing' 
         OR (p.status = 'due' AND p.created_at < NOW() - INTERVAL '10 minutes')
      LIMIT 20;
    `;
    const stuckRes = await pool.query(stuckQuery);
    let resolvedCount = 0;

    for (const payment of stuckRes.rows) {
      const checkId = payment.provider_payment_id || payment.provider_order_id;
      if (!checkId) continue;

      try {
        const providerData = await provider.fetchPayment(checkId);
        if (providerData.status === 'captured') {
          // Reconcile as paid
          await pool.query(`
            UPDATE payments 
            SET status = 'paid', captured_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1;
          `, [payment.id]);
          resolvedCount++;
        } else if (providerData.status === 'failed') {
          await pool.query(`
            UPDATE payments 
            SET status = 'failed', failure_reason = 'Reconciliation resolved as failed', updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1;
          `, [payment.id]);
          resolvedCount++;
        }
      } catch (err) {
        console.warn(`Reconciliation check failed for payment ${payment.payment_code}:`, err.message);
      }
    }

    return { checkedCount: stuckRes.rows.length, resolvedCount };
  }
}
