/**
 * ============================================================================
 * PaymentProvider Interface (Abstract Base)
 * Standardized Contract for Razorpay and Mock Payment Providers
 * ============================================================================
 */

export class PaymentProvider {
  /**
   * Create a payment order with the processor.
   * @param {object} params
   * @param {number} params.amountPaise Amount in integer paise
   * @param {string} params.currency ISO Currency (INR)
   * @param {string} params.receipt Public reference identifier
   * @param {object} params.notes Metadata key-values
   * @returns {Promise<{ id: string, amount: number, currency: string, receipt: string, status: string }>}
   */
  async createOrder(params) {
    throw new Error('createOrder must be implemented by payment provider');
  }

  /**
   * Verify cryptographic checkout signature returned by frontend.
   * @param {object} params
   * @param {string} params.orderId Provider order ID
   * @param {string} params.paymentId Provider payment ID
   * @param {string} params.signature HMAC-SHA256 signature from checkout
   * @returns {boolean} True if signature is cryptographically authentic
   */
  verifyCheckoutSignature(params) {
    throw new Error('verifyCheckoutSignature must be implemented by payment provider');
  }

  /**
   * Verify and parse raw webhook payload from payment processor.
   * @param {object} params
   * @param {Buffer|string} params.rawBody Raw unprocessed request body
   * @param {string} params.signature Webhook signature header
   * @returns {{ eventId: string, eventType: string, payload: object, payment?: object, order?: object, transfer?: object, refund?: object }}
   */
  parseWebhook(params) {
    throw new Error('parseWebhook must be implemented by payment provider');
  }

  /**
   * Transfer professional's share to their linked account via Route.
   * @param {object} params
   * @param {string} params.paymentId Captured provider payment ID
   * @param {string} params.linkedAccountId Destination linked account ID (acc_xxx)
   * @param {number} params.amountPaise Transfer amount in integer paise
   * @param {string} params.currency Currency (INR)
   * @param {Date|null} params.holdUntil Payout hold timestamp
   * @param {object} params.notes Metadata
   * @param {string} params.idempotencyKey Unique transfer idempotency key
   * @returns {Promise<{ id: string, status: string, amount: number, currency: string, recipient: string }>}
   */
  async createTransfer(params) {
    throw new Error('createTransfer must be implemented by payment provider');
  }

  /**
   * Refund a captured payment (and optionally reverse Route transfers).
   * @param {object} params
   * @param {string} params.paymentId Captured provider payment ID
   * @param {number} params.amountPaise Refund amount in integer paise
   * @param {string} params.reason Justification
   * @param {boolean} params.reverseTransfer Whether to reverse transfers to linked account
   * @param {string} params.idempotencyKey Unique refund idempotency key
   * @returns {Promise<{ id: string, amount: number, status: string }>}
   */
  async refund(params) {
    throw new Error('refund must be implemented by payment provider');
  }

  /**
   * Create or link a professional's bank account for automated payouts.
   * @param {object} params
   * @param {string} params.name Professional legal name
   * @param {string} params.email Professional email
   * @param {string} params.phone Professional phone
   * @param {string} params.accountNumber Bank account number (never logged/stored in DB)
   * @param {string} params.ifsc Bank IFSC code
   * @param {string} params.pan Professional PAN number (never logged/stored in DB)
   * @param {string} params.idempotencyKey Unique onboarding idempotency key
   * @returns {Promise<{ id: string, status: string, bankName: string, last4: string }>}
   */
  async createLinkedAccount(params) {
    throw new Error('createLinkedAccount must be implemented by payment provider');
  }

  /**
   * Fetch current payment status directly from provider for reconciliation.
   * @param {string} paymentId Provider payment ID
   * @returns {Promise<{ id: string, orderId: string, status: string, amount: number, method: string, captured: boolean }>}
   */
  async fetchPayment(paymentId) {
    throw new Error('fetchPayment must be implemented by payment provider');
  }
}

