import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CERT_PATH = path.resolve('apps/api/src/config/uidai/uidai_auth_sign.cer');
const TEST_SIGNER_KEY_PATH = path.resolve('apps/api/src/config/uidai/uidai_test_signer.key');

/**
 * Loads UIDAI's published certificate.
 * @returns {string} PEM formatted public certificate/key
 */
export function getUidaiCertificate() {
  if (!fs.existsSync(CERT_PATH)) {
    throw new Error(`UIDAI public certificate not found at ${CERT_PATH}. Run scripts/setup_uidai_cert.mjs.`);
  }
  return fs.readFileSync(CERT_PATH, 'utf8');
}

/**
 * Verifies a digital signature against UIDAI data payload using RSA-SHA256.
 * @param {Buffer|string} data 
 * @param {Buffer} signature 
 * @returns {boolean}
 */
export function verifyUidaiSignature(data, signature) {
  try {
    const cert = getUidaiCertificate();
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    return verifier.verify(cert, signature);
  } catch (err) {
    console.error('UIDAI signature verification error:', err.message);
    return false;
  }
}

/**
 * Creates a signed UIDAI QR test fixture for testing.
 * @param {object} params - { last4: '1234', name: 'Rajesh Kumar', isTampered: false }
 * @returns {{ qrBytes: Buffer, signature: Buffer, rawData: Buffer }}
 */
export function createUidaiTestFixture({ last4 = '4321', name = 'Rajesh Kumar', isTampered = false } = {}) {
  if (!fs.existsSync(TEST_SIGNER_KEY_PATH)) {
    throw new Error('Test signer key not found. Run scripts/setup_uidai_cert.mjs.');
  }

  const signerKey = fs.readFileSync(TEST_SIGNER_KEY_PATH, 'utf8');

  // UIDAI text fields delimited by 0xFF (255)
  // Format: email_mobile_present | ref_id | name | dob | gender | care_of | district | landmark | house | location | pin | state | last4
  const fields = [
    '3', // email and mobile present
    'REF99882211',
    name,
    '1988-06-15',
    'M',
    'S/O Ramesh',
    'Bengaluru Urban',
    'Near Metro',
    '42',
    'Indiranagar',
    '560038',
    'Karnataka',
    last4
  ];

  const rawData = Buffer.from(fields.join(String.fromCharCode(255)), 'utf8');

  // Sign raw data with RSA-SHA256
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(rawData);
  const signature = signer.sign(signerKey);

  // If tampered is requested, flip bytes in signature or data
  const finalSignature = isTampered ? Buffer.from(signature) : signature;
  if (isTampered) {
    finalSignature[0] = finalSignature[0] ^ 0xFF;
  }

  // Concatenate rawData + signature
  const uncompressed = Buffer.concat([rawData, finalSignature]);
  const compressed = zlib.deflateSync(uncompressed);

  return {
    qrBytes: compressed,
    signature: finalSignature,
    rawData,
    last4,
    name
  };
}

/**
 * Decodes UIDAI secure QR byte payload and verifies digital signature.
 * NEVER stores or extracts a full 12-digit number; returns only last 4 digits.
 * @param {Buffer} qrBuffer 
 * @returns {{ valid: boolean, last4: string|null, name: string|null, isAuthentic: boolean, error: string|null }}
 */
export function decodeAndVerifyUidaiQr(qrBuffer) {
  if (!qrBuffer || !Buffer.isBuffer(qrBuffer)) {
    return { valid: false, last4: null, name: null, isAuthentic: false, error: 'Empty or invalid QR buffer.' };
  }

  try {
    let decompressed;
    try {
      decompressed = zlib.inflateSync(qrBuffer);
    } catch {
      // In case payload was stored uncompressed
      decompressed = qrBuffer;
    }

    if (decompressed.length < 256) {
      return { valid: false, last4: null, name: null, isAuthentic: false, error: 'QR data too short to contain UIDAI signature.' };
    }

    // UIDAI 2048-bit RSA signature is the last 256 bytes
    const dataPart = decompressed.subarray(0, decompressed.length - 256);
    const signaturePart = decompressed.subarray(decompressed.length - 256);

    const isAuthentic = verifyUidaiSignature(dataPart, signaturePart);

    // Parse delimited text fields
    const text = dataPart.toString('utf8');
    const parts = text.split(String.fromCharCode(255));

    // Name is usually field index 2, last 4 digits at end or field index 12
    const name = parts[2] ? parts[2].trim() : null;
    let last4 = null;

    for (const part of parts) {
      if (/^\d{4}$/.test(part.trim())) {
        last4 = part.trim();
      }
    }

    if (!last4 && parts.length > 0) {
      const match = text.match(/\b\d{4}\b/);
      if (match) last4 = match[0];
    }

    return {
      valid: true,
      last4: last4 || null,
      name: name || null,
      isAuthentic,
      error: isAuthentic ? null : 'UIDAI digital signature verification failed (tampered QR or untrusted signer).'
    };
  } catch (err) {
    return {
      valid: false,
      last4: null,
      name: null,
      isAuthentic: false,
      error: `Failed to decode UIDAI QR code: ${err.message}`
    };
  }
}

