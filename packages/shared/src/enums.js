/**
 * NivaaroFix — Canonical Shared Enums
 * Defines unambiguous lifecycle states, trade domains, and user roles.
 */

export const RequestStatus = Object.freeze({
  OPEN: 'open',
  QUOTED: 'quoted',
  CONFIRMED: 'confirmed',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
});

export const QuoteStatus = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
});

export const UserRole = Object.freeze({
  CUSTOMER: 'customer',
  PROFESSIONAL: 'professional',
  ADMIN: 'admin'
});

export const TradeCategory = Object.freeze({
  ELECTRICIAN: 'electrician',
  PLUMBER: 'plumber',
  BOTH: 'both'
});

export const KycStatus = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected'
});
