import { Router } from 'express';
import { PaymentService } from '../modules/payments/paymentService.js';

const router = Router();

/**
 * Razorpay & Mock Webhook Endpoint
 * Validates HMAC signature against raw request body, de-duplicates by event ID inside transaction,
 * and processes capture, failure, transfer, and refund events idempotently.
 */
router.post('/razorpay', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-mock-signature'];
    const eventIdHeader = req.headers['x-razorpay-event-id'] || req.headers['x-mock-event-id'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing webhook signature header (x-razorpay-signature).'
      });
    }

    const result = await PaymentService.handleWebhook({
      rawBody,
      signature,
      eventIdHeader
    });

    // Respond 200 OK quickly
    res.status(200).json({
      success: true,
      received: true,
      ...result
    });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(err.status || 400).json({
      success: false,
      error: err.message
    });
  }
});

// Also support mock webhook trigger endpoint for easy manual & integration testing
router.post('/mock', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-mock-signature'] || 'mock_wh_signature';
    const eventIdHeader = req.headers['x-razorpay-event-id'] || req.headers['x-mock-event-id'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const result = await PaymentService.handleWebhook({
      rawBody,
      signature,
      eventIdHeader
    });

    res.status(200).json({
      success: true,
      received: true,
      ...result
    });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
