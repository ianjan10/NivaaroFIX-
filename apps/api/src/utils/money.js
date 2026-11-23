/**
-- ============================================================================
-- NivaaroFix Money & Currency Utility
-- Integer Paise Operations — Eliminating IEEE 754 Floating-Point Inaccuracies
-- ============================================================================
*/

/**
 * Convert Rupees (e.g. 350.50) to integer Paise (35050).
 * Uses string or rounded math to eliminate floating point imprecision.
 */
export function toPaise(rupees) {
  if (rupees === null || rupees === undefined || isNaN(Number(rupees))) {
    throw new Error(`Invalid rupee amount for conversion: ${rupees}`);
  }
  const clean = typeof rupees === 'string' ? rupees.trim() : rupees;
  return Math.round(Number(clean) * 100);
}

/**
 * Convert integer Paise (e.g. 35050) to formatted Rupee string ('350.50').
 */
export function toRupees(paise) {
  if (paise === null || paise === undefined || isNaN(Number(paise))) {
    throw new Error(`Invalid paise amount for conversion: ${paise}`);
  }
  const intPaise = Math.round(Number(paise));
  return (intPaise / 100).toFixed(2);
}

/**
 * Calculate Platform Fee and Professional Share from total agreed service amount.
 * 
 * @param {number|string} totalRupees Total agreed quote amount in INR
 * @param {number|string} feePercent Platform fee percentage (e.g. 0 or 5.5)
 * @returns {object} Formatted amounts in both Paise and Rupees
 */
export function calculatePlatformFee(totalRupees, feePercent = 0) {
  const totalPaise = toPaise(totalRupees);
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than zero.');
  }

  const cleanPercent = Math.max(0, Math.min(100, Number(feePercent) || 0));
  
  // Calculate platform fee paise with integer rounding
  const platformFeePaise = cleanPercent > 0 
    ? Math.round(totalPaise * (cleanPercent / 100)) 
    : 0;

  // Professional gets the exact remainder (total - fee)
  const professionalAmountPaise = totalPaise - platformFeePaise;

  return {
    totalRupees: toRupees(totalPaise),
    platformFeeRupees: toRupees(platformFeePaise),
    professionalAmountRupees: toRupees(professionalAmountPaise),
    totalPaise,
    platformFeePaise,
    professionalAmountPaise,
    feePercent: cleanPercent
  };
}

/**
 * Format Indian Rupee currency with standard tabular grouping (e.g. ₹1,250.00 or ₹300.00).
 */
export function formatINR(amountRupees, includeDecimals = true) {
  const num = Number(amountRupees);
  if (isNaN(num)) return '₹0.00';
  
  const options = {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: 2
  };
  
  return new Intl.NumberFormat('en-IN', options).format(num);
}

