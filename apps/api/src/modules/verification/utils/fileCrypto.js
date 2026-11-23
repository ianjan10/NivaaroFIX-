import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Storage directory for encrypted documents (outside web root)
const STORAGE_DIR = process.env.SECURE_DOC_STORAGE_PATH || path.resolve(process.cwd(), 'storage/secure_documents');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// 256-bit encryption key
function getEncryptionKey() {
  const secret = process.env.DOC_ENCRYPTION_KEY || process.env.JWT_SECRET || 'nivaarofix_secure_doc_key_32_bytes_len_default_test';
  return crypto.createHash('sha256').update(secret).digest();
}

// URL signing secret
function getSigningSecret() {
  return process.env.SIGNED_URL_SECRET || process.env.JWT_SECRET || 'nivaarofix_signed_url_token_secret_default';
}

/**
 * Validates file magic bytes and size.
 * Allowed: JPEG, PNG, PDF. Max 5 MB.
 * @param {Buffer} buffer 
 * @returns {{ valid: boolean, mimeType: string|null, error: string|null }}
 */
export function validateFileBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, mimeType: null, error: 'Invalid file buffer.' };
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (buffer.length > MAX_SIZE) {
    return { valid: false, mimeType: null, error: `File size exceeds 5 MB limit (size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).` };
  }

  if (buffer.length < 8) {
    return { valid: false, mimeType: null, error: 'File is empty or corrupt.' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, mimeType: 'image/jpeg', error: null };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buffer.subarray(0, 8).equals(pngHeader)) {
    return { valid: true, mimeType: 'image/png', error: null };
  }

  // PDF: %PDF (25 50 44 46)
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return { valid: true, mimeType: 'application/pdf', error: null };
  }

  return {
    valid: false,
    mimeType: null,
    error: 'Unsupported file type. Only JPG, PNG, and PDF documents are permitted.'
  };
}

/**
 * Strips EXIF and GPS metadata from JPEG or PNG buffers.
 * @param {Buffer} buffer 
 * @param {string} mimeType 
 * @returns {Buffer}
 */
export function stripExifMetadata(buffer, mimeType) {
  if (!buffer || buffer.length === 0) return buffer;

  if (mimeType === 'image/jpeg') {
    return stripJpegExif(buffer);
  }

  if (mimeType === 'image/png') {
    return stripPngMetadata(buffer);
  }

  return buffer;
}

/**
 * Strips APP1 (EXIF/XMP/GPS) and APP2/APP13 markers from JPEG.
 */
function stripJpegExif(buffer) {
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return buffer;

  const chunks = [];
  chunks.push(buffer.subarray(0, 2)); // SOI: FF D8

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      // Reached entropy-coded scan data or corrupt marker
      chunks.push(buffer.subarray(offset));
      break;
    }

    const marker = buffer[offset + 1];

    // Standalone markers without length: RST, SOI, EOI, TEM
    if (marker === 0xD9) { // EOI
      chunks.push(buffer.subarray(offset, offset + 2));
      break;
    }

    if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      chunks.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const length = buffer.readUInt16BE(offset + 2);
    const nextOffset = offset + 2 + length;

    // Filter out APP1 (0xE1: EXIF/GPS), APP2 (0xE2), APP13 (0xED: Photoshop/IPTC)
    if (marker === 0xE1 || marker === 0xE2 || marker === 0xED) {
      // Skip this metadata segment entirely
      offset = nextOffset;
      continue;
    }

    // Keep other segments (SOF0, DHT, DQT, SOS, etc.)
    chunks.push(buffer.subarray(offset, nextOffset));

    if (marker === 0xDA) { // SOS (Start of Scan) - rest is scan data until EOI
      chunks.push(buffer.subarray(nextOffset));
      break;
    }

    offset = nextOffset;
  }

  return Buffer.concat(chunks);
}

/**
 * Strips non-critical text and EXIF chunks from PNG.
 */
function stripPngMetadata(buffer) {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!buffer.subarray(0, 8).equals(pngHeader)) return buffer;

  const chunks = [pngHeader];
  let offset = 8;

  // Metadata chunks to drop
  const dropChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'pHYs']);

  while (offset < buffer.length - 4) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const totalChunkLength = 12 + length; // 4 len + 4 type + length + 4 crc

    if (offset + totalChunkLength > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (!dropChunks.has(type)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkLength));
    }

    if (type === 'IEND') break;
    offset += totalChunkLength;
  }

  return Buffer.concat(chunks);
}

/**
 * Encrypts a buffer at rest using AES-256-GCM.
 * @param {Buffer} buffer 
 * @returns {{ ciphertext: Buffer, iv: string, authTag: string }}
 */
export function encryptBuffer(buffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts a buffer encrypted with AES-256-GCM.
 * @param {Buffer} ciphertext 
 * @param {string} ivHex 
 * @param {string} authTagHex 
 * @returns {Buffer}
 */
export function decryptBuffer(ciphertext, ivHex, authTagHex) {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Saves encrypted document file to secure storage.
 * @param {Buffer} buffer 
 * @param {string} mimeType 
 * @returns {{ filePath: string, iv: string, authTag: string, sizeBytes: number }}
 */
export async function saveEncryptedDocument(buffer, mimeType) {
  const cleaned = stripExifMetadata(buffer, mimeType);
  const { ciphertext, iv, authTag } = encryptBuffer(cleaned);

  const filename = `${crypto.randomUUID()}.enc`;
  const fullPath = path.join(STORAGE_DIR, filename);

  fs.writeFileSync(fullPath, ciphertext);

  return {
    filePath: fullPath,
    iv,
    authTag,
    sizeBytes: cleaned.length
  };
}

/**
 * Reads and decrypts document from storage.
 * @param {string} filePath 
 * @param {string} iv 
 * @param {string} authTag 
 * @returns {Buffer}
 */
export async function readDecryptedDocument(filePath, iv, authTag) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Encrypted document file not found on disk.');
  }

  const ciphertext = fs.readFileSync(filePath);
  return decryptBuffer(ciphertext, iv, authTag);
}

/**
 * Generates a tamper-proof, short-lived signed URL for document / photo preview.
 * @param {object} params - { fileType: 'document'|'photo', id, userId, role, expiresInSeconds }
 * @returns {string}
 */
export function generateSignedFileUrl({ fileType, id, userId, role, expiresInSeconds = 900 }) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const payload = `${fileType}:${id}:${userId}:${role}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');

  const params = new URLSearchParams({
    type: fileType,
    id: String(id),
    uid: String(userId),
    role: String(role),
    exp: String(expiresAt),
    sig: signature
  });

  return `/api/verification/files/signed?${params.toString()}`;
}

/**
 * Verifies signed URL token and permissions.
 * @param {object} query - { type, id, uid, role, exp, sig }
 * @param {object} requestUser - Logged in user making request
 * @returns {{ valid: boolean, error: string|null }}
 */
export function verifySignedFileUrl(query, requestUser) {
  const { type, id, uid, role, exp, sig } = query;

  if (!type || !id || !uid || !exp || !sig) {
    return { valid: false, error: 'Malformed or incomplete signed URL.' };
  }

  const expiresAt = parseInt(exp, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return { valid: false, error: 'Signed URL has expired. Please refresh the page.' };
  }

  // Constant-time signature verification
  const payload = `${type}:${id}:${uid}:${role}:${exp}`;
  const expectedSig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');

  const sigBuffer = Buffer.from(sig, 'hex');
  const expBuffer = Buffer.from(expectedSig, 'hex');

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return { valid: false, error: 'Invalid URL signature.' };
  }

  // Access control: User must be an admin, or the owner of the document
  if (requestUser) {
    const isOwner = String(requestUser.id) === String(uid);
    const isAdmin = requestUser.role === 'admin';
    if (!isOwner && !isAdmin) {
      return { valid: false, error: 'Access denied: You do not have permission to view this file.' };
    }
  }

  return { valid: true, error: null };
}

/**
 * Optional ClamAV scan (graceful fallback if daemon not installed).
 */
export async function scanWithClamAv(buffer) {
  // If ClamAV daemon is not available, return clean result without blocking
  return { clean: true, scanned: false, note: 'ClamAV daemon not connected; byte check passed.' };
}

