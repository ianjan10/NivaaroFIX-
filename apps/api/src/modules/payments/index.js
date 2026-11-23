import { RazorpayProvider } from './razorpayProvider.js';
import { MockPaymentProvider } from './mockPaymentProvider.js';

let activeProviderInstance = null;

/**
 * Factory function returning the configured payment provider.
 * Strictly forbids Mock provider in production environment.
 */
export function getPaymentProvider() {
  if (activeProviderInstance) {
    return activeProviderInstance;
  }

  const providerType = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase().trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && providerType === 'mock') {
    throw new Error(
      'FATAL: Mock payment provider is strictly forbidden in production mode. ' +
      'Please configure PAYMENT_PROVIDER=razorpay with valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  if (providerType === 'razorpay') {
    activeProviderInstance = new RazorpayProvider();
  } else {
    activeProviderInstance = new MockPaymentProvider();
  }

  return activeProviderInstance;
}

/**
 * Reset provider singleton (useful for testing and hot switching)
 */
export function setPaymentProvider(provider) {
  activeProviderInstance = provider;
}

