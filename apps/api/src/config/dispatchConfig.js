/**
 * NivaaroFix GPS-based Dispatch & Quotation Configuration
 * Centralized, configurable parameters for discovery radius, thresholds, and timers.
 */

export const DISPATCH_CONFIG = {
  // Initial search radius in meters
  INITIAL_RADIUS_METERS: 50,

  // Progressive search radius steps in meters: 50m -> 100m -> 500m -> 1km -> 5km -> 10km
  RADIUS_STEPS_METERS: [50, 100, 500, 1000, 5000, 10000],

  // Maximum allowed radius before declaring no nearby providers
  MAX_DISPATCH_RADIUS_METERS: 10000,

  // GPS Accuracy: reject or flag readings with accuracy worse than this (in meters)
  LOCATION_MAX_ACCURACY_METERS: 100,

  // Provider location freshness: coordinates older than this (in seconds) are deemed stale
  PROVIDER_LOCATION_MAX_AGE_SECONDS: 1800, // 30 minutes

  // Default expiration time for a service request waiting for quotations (in hours)
  REQUEST_EXPIRATION_HOURS: 2,

  // Default expiration time for a submitted quotation (in hours)
  QUOTE_EXPIRATION_HOURS: 1,

  // Wave expansion timeout: wait window before escalating to the next radius tier if insufficient response (in ms)
  DISPATCH_WAVE_INTERVAL_MS: 30000, // 30 seconds

  // Currency
  DEFAULT_CURRENCY: 'INR',

  // H3 Resolutions:
  // Res 8 edge length ~461m, cell area ~0.737 km²
  // Res 9 edge length ~174m, cell area ~0.105 km²
  H3_RES_8: 8,
  H3_RES_9: 9
};

export default DISPATCH_CONFIG;
