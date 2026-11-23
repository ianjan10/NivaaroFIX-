import { Router } from 'express';
import { PaymentService } from '../modules/payments/paymentService.js';
import { requireCustomerAuth, requireAdminAuth, requireAnyAuth } from '../middleware/authMiddleware.js';

const router = Router();

// In-memory sliding window rate limiter for order creation & verification
const rateLimitMap = new Map();
function rateLimitPaymentRequests(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown_ip';
  const userId = req.user?.id || req.userId || 'anon';
  const key = `${ip}_${userId}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 30;

  let record = rateLimitMap.get(key);
  if (!record || now - record.startTime > windowMs) {
    record = { startTime: now, count: 1 };
    rateLimitMap.set(key, record);
    return next();
  }

  record.count++;
  if (record.count > maxRequests) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too many payment requests. Please wait a moment before trying again.'
    });
  }

  next();
}

/**
 * Check if customer has any unpaid completed booking.
 * Used by booking modal to gate new bookings: "Pay for your previous service first".
 */
router.get('/customer/unpaid-check', requireAnyAuth, async (req, res) => {
  try {
    const customerId = req.user?.id || req.userId || req.query.customerId;
    const customerEmail = req.userEmail || req.user?.email || req.query.customerEmail;
    const unpaid = await PaymentService.checkUnpaidCompletedJobs(customerId, customerEmail);
    res.json({
      success: true,
      ...unpaid
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * Create or retrieve open payment order for completed job.
 * Only that booking's customer, only when the job is completed and unpaid.
 */
router.post('/:bookingId/order', requireAnyAuth, rateLimitPaymentRequests, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user?.id || req.userId;
    const customerEmail = req.user?.email || req.userEmail;

    const result = await PaymentService.createOrderForBooking({
      bookingIdentifier: bookingId,
      customerId,
      customerEmail
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'PAYMENT_ORDER_ERROR',
      error: err.message
    });
  }
});

/**
 * Verify checkout signature submitted by client.
 * Moves payment to 'processing' (or 'paid' in mock mode) and records optional star rating & feedback.
 */
router.post('/:bookingId/verify', requireAnyAuth, rateLimitPaymentRequests, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { orderId, paymentId, signature, rating, feedback } = req.body;
    const customerId = req.user?.id || req.userId;
    const customerEmail = req.user?.email || req.userEmail;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required checkout verification fields (orderId, paymentId, signature).'
      });
    }

    const result = await PaymentService.verifyCheckout({
      bookingIdentifier: bookingId,
      orderId,
      paymentId,
      signature,
      customerId,
      customerEmail,
      rating,
      feedback
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      code: err.code || 'SIGNATURE_VERIFICATION_FAILED',
      error: err.message
    });
  }
});

/**
 * Cash on Delivery / Cash to Technician Doorstep Settlement.
 * Records payment as cash paid with optional customer star rating and comment.
 */
router.post('/:bookingId/cash', requireAnyAuth, rateLimitPaymentRequests, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { rating, feedback } = req.body || {};
    const customerId = req.user?.id || req.userId;
    const customerEmail = req.user?.email || req.userEmail;

    const result = await PaymentService.processCashPaymentForBooking({
      bookingIdentifier: bookingId,
      customerId,
      customerEmail,
      rating,
      feedback
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      code: err.code || 'CASH_PAYMENT_ERROR',
      error: err.message
    });
  }
});

/**
 * Retrieve current payment status for a booking (for resume after refresh mid-payment).
 */
router.get('/:bookingId', requireAnyAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user?.id || req.userId;
    const customerEmail = req.user?.email || req.userEmail;

    // Retrieve order or existing status
    const result = await PaymentService.createOrderForBooking({
      bookingIdentifier: bookingId,
      customerId,
      customerEmail
    });

    res.json({
      success: true,
      payment: result.payment,
      order: result.order,
      provider_order_id: result.order?.id || result.payment?.provider_order_id,
      feeBreakdown: result.feeBreakdown,
      status: result.status,
      completionPhotos: result.completionPhotos
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Administrative Refund Endpoint
 * Refunds payment through provider and reverses Route transfer.
 */
router.post('/:bookingId/refund', requireAdminAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.id || req.userId;

    const result = await PaymentService.issueRefund({
      bookingIdentifier: bookingId,
      adminId,
      reason: reason || 'Admin issued refund'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      code: err.code || 'REFUND_FAILED',
      error: err.message
    });
  }
});

export default router;
