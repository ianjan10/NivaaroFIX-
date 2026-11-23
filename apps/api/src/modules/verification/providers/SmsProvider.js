/**
 * SmsProvider Interface and Implementations
 * Handles DLT-compliant SMS OTP delivery for professional mobile verification.
 */

export class SmsProvider {
  /**
   * Sends 6-digit OTP code to the recipient number.
   * @param {object} params - { to, code, templateId }
   * @returns {Promise<{ success: boolean, messageId?: string }>}
   */
  async sendOtp({ to, code, templateId }) {
    throw new Error('SmsProvider.sendOtp must be implemented by subclass.');
  }
}

/**
 * Mock SMS Provider for local development and unit/integration testing.
 * Refuses execution in production environment.
 */
export class MockSmsProvider extends SmsProvider {
  constructor() {
    super();
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECURITY VIOLATION: MockSmsProvider cannot be used in production environment. ' +
        'A DLT-registered provider (e.g. Fast2SMS, MSG91, or 2Factor) must be configured.'
      );
    }
  }

  async sendOtp({ to, code, templateId }) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MockSmsProvider refused in production.');
    }

    MockSmsProvider.lastSent = { to, code, templateId };

    // In development and test only, log cleanly to server console
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[SMS MOCK] To: ${to} | Code: ${code} | Template: ${templateId || 'DLT_OTP_LOGIN'}`);
    }

    return {
      success: true,
      provider: 'mock',
      messageId: `mock_sms_${Date.now()}`
    };
  }
}

/**
 * Production DLT-registered SMS Provider (e.g. Fast2SMS / MSG91).
 * Requires Entity ID, Sender ID, and Approved Template ID.
 */
export class DltSmsProvider extends SmsProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.SMS_PROVIDER_API_KEY;
    this.senderId = config.senderId || process.env.DLT_SENDER_ID || 'NIVFIX';
    this.entityId = config.entityId || process.env.DLT_ENTITY_ID;
    this.templateId = config.templateId || process.env.DLT_TEMPLATE_ID;
    this.endpoint = config.endpoint || process.env.SMS_PROVIDER_ENDPOINT || 'https://www.fast2sms.com/dev/bulkV2';
  }

  async sendOtp({ to, code, templateId }) {
    const tid = templateId || this.templateId;
    if (!this.apiKey) {
      throw new Error('SMS_PROVIDER_API_KEY is missing in production environment.');
    }

    const cleanPhone = String(to).replace(/\D/g, '').slice(-10);

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route: 'dlt',
        sender_id: this.senderId,
        message: tid,
        variables_values: code,
        flash: 0,
        numbers: cleanPhone
      })
    });

    const data = await res.json();
    if (!res.ok || !data.return) {
      throw new Error(`DLT SMS delivery failed: ${data.message || res.statusText}`);
    }

    return {
      success: true,
      provider: 'dlt',
      messageId: data.request_id || `dlt_${Date.now()}`
    };
  }
}

/**
 * Provider factory method.
 * @param {string} type - 'mock' or 'dlt'
 * @returns {SmsProvider}
 */
export function createSmsProvider(type = process.env.SMS_PROVIDER || 'mock') {
  if (type === 'dlt' || process.env.NODE_ENV === 'production') {
    if (!process.env.SMS_PROVIDER_API_KEY && process.env.NODE_ENV === 'production') {
      throw new Error('DLT SMS Provider configuration missing in production.');
    }
    return type === 'mock' ? new MockSmsProvider() : new DltSmsProvider();
  }
  return new MockSmsProvider();
}
