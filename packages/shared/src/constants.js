/**
 * NivaaroFix — Shared Constants
 * Core domain configurations, thresholds, and business rules.
 */

export const TRACKER_STEPS = Object.freeze([
  { key: 'confirmed', label: 'Confirmed', stepIndex: 0 },
  { key: 'on_the_way', label: 'On the way', stepIndex: 1 },
  { key: 'arrived', label: 'Arrived', stepIndex: 2 },
  { key: 'in_progress', label: 'In progress', stepIndex: 3 },
  { key: 'completed', label: 'Completed', stepIndex: 4 }
]);

export const DISPATCH_CONFIG = Object.freeze({
  DEFAULT_DISPATCH_RADIUS_KM: 10,
  MAX_ARRIVAL_DISTANCE_METERS: 200,
  TELEMETRY_INTERVAL_MS: 3000,
  TELEMETRY_ACCURACY_THRESHOLD_M: 50,
  SPEED_LIMIT_KMH: 120,
  OTP_LOCKOUT_ATTEMPTS: 5,
  OTP_LOCKOUT_MINUTES: 15,
  PLATFORM_COMMISSION_PERCENT: 15
});

export const MAP_CONFIG = Object.freeze({
  DEFAULT_MAP_PROVIDER: 'osm_osrm',
  DEFAULT_CITY: 'Bengaluru',
  DEFAULT_LAT: 12.9716,
  DEFAULT_LNG: 77.5946
});
