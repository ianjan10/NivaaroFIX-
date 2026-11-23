import crypto from 'crypto';
import { PaymentProvider } from './paymentProvider.js';

/**
 * ============================================================================
 * RazorpayProvider
 * Production-ready implementation of Razorpay Standard Checkout & Route APIs.
 * Connects directly using official REST API v1.
 * ============================================================================
 */
export class RazorpayProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.keyId = options.keyId || process.env.RAZORPAY_KEY_ID;
    this.keySecret = options.keySecret || process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
    this.baseUrl = options.baseUrl || 'https://api.razorpay.com/v1';

    if (!this.keyId || !this.keySecret) {
      console.warn('⚠️ Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment.');
    }
  }

  getAuthHeader() {
    return 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
      ...options.headers
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.error?.description || data.error?.message || `Razorpay API error: ${res.status}`;
      const err = new Error(errMsg);
      err.status = res.status;
      err.code = data.error?.code || 'RAZORPAY_API_ERROR';
      err.details = data.error;
      throw err;
    }

    return data;
  }

  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    if (!amountPaise || amountPaise <= 0) {
      throw new Error('Order amount in paise must be positive integer');
    }

    const payload = {
      amount: Math.round(amountPaise),
      currency: currency.toUpperCase(),
      receipt: String(receipt || '').substring(0, 40),
      notes: notes || {}
    };

    return await this._request('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature || !this.keySecret) {
      return false;
    }

    const payload = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(String(signature).trim(), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');

    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  parseWebhook({ rawBody, signature }) {
    if (!signature || !this.webhookSecret) {
      const err = new Error('Missing webhook signature or RAZORPAY_WEBHOOK_SECRET configuration');
      err.status = 400;
      throw err;
    }

    const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawStr)
      .digest('hex');

    const sigBuf = Buffer.from(String(signature).trim(), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      const err = new Error('Invalid Razorpay webhook signature');
      err.status = 400;
      throw err;
    }

    const payload = JSON.parse(rawStr);
    const eventId = payload.id;
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

  async createTransfer({ paymentId, linkedAccountId, amountPaise, currency = 'INR', holdUntil = null, notes = {}, idempotencyKey }) {
    if (!paymentId || !linkedAccountId || !amountPaise) {
      throw new Error('paymentId, linkedAccountId, and amountPaise are required for Route transfer');
    }

    const transferItem = {
      account: linkedAccountId,
      amount: Math.round(amountPaise),
      currency: currency.toUpperCase(),
      notes: notes || {}
    };

    if (holdUntil && new Date(holdUntil) > new Date()) {
      transferItem.on_hold = true;
      transferItem.on_hold_until = Math.floor(new Date(holdUntil).getTime() / 1000);
    }

    const headers = {};
    if (idempotencyKey) {
      headers['X-Payout-Idempotency'] = idempotencyKey;
    }

    const response = await this._request(`/payments/${paymentId}/transfers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transfers: [transferItem] })
    });

    const transfer = Array.isArray(response.items) ? response.items[0] : response;
    return transfer;
  }

  async refund({ paymentId, amountPaise, reason = 'Customer refund', reverseTransfer = true, notes = {}, idempotencyKey }) {
    if (!paymentId || !amountPaise) {
      throw new Error('paymentId and amountPaise are required for refund');
    }

    const payload = {
      amount: Math.round(amountPaise),
      reverse_all_transfers: Boolean(reverseTransfer),
      notes: { ...notes, reason }
    };

    const headers = {};
    if (idempotencyKey) {
      headers['X-Refund-Idempotency'] = idempotencyKey;
    }

    return await this._request(`/payments/${paymentId}/refund`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  async createLinkedAccount({ name, email, phone, accountNumber, ifsc, pan, idempotencyKey }) {
    const cleanIfsc = String(ifsc || '').toUpperCase().trim();
    const last4 = String(accountNumber || '').replace(/\D/g, '').slice(-4);

    const payload = {
      type: 'route',
      name: name,
      email: email,
      phone: (phone || '').replace(/\D/g, '').slice(-10),
      profile: {
        category: 'services',
        subcategory: 'home_repair',
        addresses: {
          registered: {
            street1: 'Verified Service Center',
            city: 'Bengaluru',
            state: 'KA',
            postal_code: '560001',
            country: 'IN'
          }
        }
      },
      legal_info: {
        pan: (pan || '').toUpperCase().trim()
      },
      bank_account: {
        account_number: accountNumber,
        ifsc_code: cleanIfsc
      }
    };

    const headers = {};
    if (idempotencyKey) {
      headers['X-Razorpay-Account-Idempotency'] = idempotencyKey;
    }

    const response = await this._request('/accounts', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    return {
      id: response.id,
      status: response.status || 'active',
      bankName: response.bank_account?.bank_name || 'Verified Indian Bank',
      last4: last4
    };
  }

  async fetchPayment(paymentId) {
    if (!paymentId) throw new Error('paymentId is required to fetch payment');
    return await this._request(`/payments/${paymentId}`, {
      method: 'GET'
    });
  }
}

