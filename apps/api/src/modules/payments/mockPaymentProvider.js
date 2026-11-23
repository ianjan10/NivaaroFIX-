import crypto from 'crypto';
import { PaymentProvider } from './paymentProvider.js';

/**
 * ============================================================================
 * MockPaymentProvider
 * High-fidelity local simulator for Razorpay Standard Checkout & Route.
 * Strictly disabled in production (throws fatal error on initialization).
 * ============================================================================
 */
export class MockPaymentProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: MockPaymentProvider cannot be instantiated in production mode.');
    }

    this.secret = options.secret || process.env.RAZORPAY_KEY_SECRET || 'mock_secret_test_key_0123456789';
    this.webhookSecret = options.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret_0123456789';
    this.keyId = options.keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_12345678';

    // In-memory simulation state
    this.orders = new Map();
    this.payments = new Map();
    this.transfers = new Map();
    this.refunds = new Map();
    this.linkedAccounts = new Map();

    // Simulation toggles for unit and integration testing
    this.simulations = {
      failNextPayment: false,
      pendingUpiNextPayment: false,
      failNextTransfer: false,
      failNextRefund: false
    };
  }

  setSimulation(key, value) {
    if (key in this.simulations) {
      this.simulations[key] = Boolean(value);
    }
  }

  resetSimulations() {
    this.simulations = {
      failNextPayment: false,
      pendingUpiNextPayment: false,
      failNextTransfer: false,
      failNextRefund: false
    };
  }

  /**
   * Helper to generate a valid checkout HMAC signature for testing.
   */
  generateCheckoutSignature(orderId, paymentId) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  /**
   * Helper to generate a valid webhook signature header for testing.
   */
  generateWebhookSignature(rawBody) {
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(bodyStr)
      .digest('hex');
  }

  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    if (!amountPaise || amountPaise <= 0) {
      throw new Error('Order amount in paise must be positive integer');
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const seq = String(receipt || notes?.bookingId || Math.floor(1000 + Math.random() * 9000)).replace(/\D/g, '').slice(-4).padStart(4, '0');
    const orderId = `${yyyy}${mm}${dd}01${seq.slice(-2)}`;
    const order = {
      id: orderId,
      entity: 'order',
      amount: Math.round(amountPaise),
      amount_paid: 0,
      amount_due: Math.round(amountPaise),
      currency: currency.toUpperCase(),
      receipt: String(receipt || ''),
      status: 'created',
      attempts: 0,
      notes: notes || {},
      created_at: Math.floor(Date.now() / 1000)
    };

    this.orders.set(orderId, order);
    return order;
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) return false;

    // Allow simulated checkout signatures in Mock development mode
    if (String(signature).startsWith('mock_sig_')) {
      return true;
    }

    const expected = this.generateCheckoutSignature(orderId, paymentId);
    const sigBuf = Buffer.from(String(signature).trim(), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');

    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  parseWebhook({ rawBody, signature }) {
    if (!signature) {
      throw new Error('Missing webhook signature header');
    }

    const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

    // In mock mode, allow simulated webhook headers
    if (signature === 'mock_wh_signature' || signature.startsWith('mock_')) {
      const payload = JSON.parse(rawStr);
      const eventId = payload.id || `evt_mock_${Date.now()}`;
      return {
        eventId,
        eventType: payload.event,
        payload,
        payment: payload.payload?.payment?.entity,
        order: payload.payload?.order?.entity,
        transfer: payload.payload?.transfer?.entity,
        refund: payload.payload?.refund?.entity
      };
    }

    const expected = this.generateWebhookSignature(rawStr);

    const sigBuf = Buffer.from(String(signature).trim(), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      const err = new Error('Invalid mock webhook signature');
      err.status = 400;
      throw err;
    }

    const payload = JSON.parse(rawStr);
    const eventId = payload.id || `evt_mock_${Date.now()}`;
    const eventType = payload.event;

    return {
      eventId,
      eventType,
      payload,
      payment: payload.payload?.payment?.entity,
      order: payload.payload?.order?.entity,
      transfer: payload.payload?.transfer?.entity,
      refund: payload.payload?.refund?.entity
    };
  }

  async createTransfer({ paymentId, linkedAccountId, amountPaise, currency = 'INR', holdUntil = null, notes = {} }) {
    if (this.simulations.failNextTransfer) {
      this.simulations.failNextTransfer = false;
      const err = new Error('Mock transfer simulation: Destination account suspended or invalid IFSC');
      err.code = 'TRANSFER_FAILED';
      throw err;
    }

    const transferId = `trf_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const transfer = {
      id: transferId,
      entity: 'transfer',
      source: paymentId,
      recipient: linkedAccountId,
      amount: Math.round(amountPaise),
      currency: currency.toUpperCase(),
      amount_reversed: 0,
      notes: notes || {},
      on_hold: Boolean(holdUntil && new Date(holdUntil) > new Date()),
      on_hold_until: holdUntil ? Math.floor(new Date(holdUntil).getTime() / 1000) : null,
      status: 'processed',
      settled_at: new Date().toISOString()
    };

    this.transfers.set(transferId, transfer);
    return transfer;
  }

  async refund({ paymentId, amountPaise, reason = 'Customer requested refund', reverseTransfer = true, notes = {} }) {
    if (this.simulations.failNextRefund) {
      this.simulations.failNextRefund = false;
      const err = new Error('Mock refund simulation: Provider balance insufficient');
      err.code = 'REFUND_FAILED';
      throw err;
    }

    const refundId = `rfnd_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const refund = {
      id: refundId,
      entity: 'refund',
      payment_id: paymentId,
      amount: Math.round(amountPaise),
      currency: 'INR',
      status: 'processed',
      speed: 'normal',
      notes: { ...notes, reason, reverseTransfer },
      created_at: Math.floor(Date.now() / 1000)
    };

    this.refunds.set(refundId, refund);
    return refund;
  }

  async createLinkedAccount({ name, email, phone, accountNumber, ifsc, pan }) {
    const last4 = String(accountNumber || '').replace(/\D/g, '').slice(-4) || '1234';
    const cleanIfsc = String(ifsc || '').toUpperCase().trim();
    
    // Resolve clean bank institution name from IFSC code prefix
    let bankName = 'Verified Indian Bank';
    if (cleanIfsc.startsWith('HDFC')) bankName = 'HDFC Bank';
    else if (cleanIfsc.startsWith('SBIN')) bankName = 'State Bank of India';
    else if (cleanIfsc.startsWith('ICIC')) bankName = 'ICICI Bank';
    else if (cleanIfsc.startsWith('UTIB')) bankName = 'Axis Bank';
    else if (cleanIfsc.startsWith('KKBK')) bankName = 'Kotak Mahindra Bank';
    else if (cleanIfsc.startsWith('PUNB')) bankName = 'Punjab National Bank';
    else if (cleanIfsc.startsWith('BARB')) bankName = 'Bank of Baroda';

    const accountId = `acc_mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const account = {
      id: accountId,
      entity: 'account',
      type: 'route',
      status: 'active',
      name: name || 'Professional Partner',
      email: email || '',
      phone: phone || '',
      bank_name: bankName,
      bank_last4: last4,
      created_at: Math.floor(Date.now() / 1000)
    };

    this.linkedAccounts.set(accountId, account);

    return {
      id: accountId,
      status: 'active',
      bankName: bankName,
      last4: last4
    };
  }

  async fetchPayment(paymentId) {
    if (this.payments.has(paymentId)) {
      return this.payments.get(paymentId);
    }

    return {
      id: paymentId,
      entity: 'payment',
      amount: 10000,
      currency: 'INR',
      status: 'captured',
      order_id: 'order_mock_test',
      method: 'upi',
      captured: true,
      error_code: null,
      error_description: null,
      created_at: Math.floor(Date.now() / 1000)
    };
  }
}
