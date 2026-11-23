/**
 * Canonical Verhoeff Checksum Algorithm
 * Standard for Indian Aadhaar 12-digit number validation.
 * Never throws; returns boolean.
 */

// The multiplication table (d)
const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// The permutation table (p)
const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// The inverse table (inv)
const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a number string using the Verhoeff algorithm.
 * For Aadhaar, string must be exactly 12 digits, not starting with 0 or 1.
 * @param {string|number} numStr 
 * @returns {boolean}
 */
export function validateVerhoeff(numStr) {
  if (!numStr) return false;
  const str = String(numStr).replace(/\s+/g, '').trim();
  if (!/^\d+$/.test(str)) return false;

  let c = 0;
  const digits = str.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[i % 8][digits[i]]];
  }

  return c === 0;
}

/**
 * Computes the Verhoeff checksum digit for a given number string.
 * @param {string|number} numStr 
 * @returns {number}
 */
export function generateVerhoeff(numStr) {
  const str = String(numStr).replace(/\s+/g, '').trim();
  if (!/^\d+$/.test(str)) {
    throw new Error('Input must be a numeric string');
  }

  let c = 0;
  const digits = str.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[(i + 1) % 8][digits[i]]];
  }

  return inv[c];
}

/**
 * Validates 12-digit Indian Aadhaar number format and checksum.
 * Note: Aadhaar numbers are 12 digits and do not start with 0 or 1.
 * @param {string} aadhaarStr 
 * @returns {{ valid: boolean, last4: string|null, error: string|null }}
 */
export function validateAadhaarNumber(aadhaarStr) {
  if (!aadhaarStr) {
    return { valid: false, last4: null, error: 'Aadhaar number is required.' };
  }

  const clean = String(aadhaarStr).replace(/[\s-]+/g, '').trim();

  if (clean.length !== 12) {
    return { valid: false, last4: null, error: 'Aadhaar must be exactly 12 digits.' };
  }

  if (!/^\d{12}$/.test(clean)) {
    return { valid: false, last4: null, error: 'Aadhaar must contain only digits.' };
  }

  if (clean[0] === '0' || clean[0] === '1') {
    return { valid: false, last4: null, error: 'Aadhaar number cannot start with 0 or 1.' };
  }

  const isValid = validateVerhoeff(clean);
  if (!isValid) {
    return { valid: false, last4: null, error: 'Invalid Aadhaar checksum (Verhoeff validation failed).' };
  }

  return {
    valid: true,
    last4: clean.slice(-4),
    error: null
  };
}

