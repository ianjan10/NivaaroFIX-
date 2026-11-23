import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '../apps/api/src/config/db.js';
import { validateAadhaarNumber, generateVerhoeff, validateVerhoeff } from '../apps/api/src/modules/verification/utils/verhoeff.js';
import { compareNames } from '../apps/api/src/modules/verification/utils/fuzzyName.js';
import {
  validateFileBytes,
  stripExifMetadata,
  encryptBuffer,
  decryptBuffer,
  generateSignedFileUrl,
  verifySignedFileUrl
} from '../apps/api/src/modules/verification/utils/fileCrypto.js';
import {
  verifyUidaiSignature,
  createUidaiTestFixture,
  decodeAndVerifyUidaiQr
} from '../apps/api/src/modules/verification/utils/uidaiQr.js';
import { MockSmsProvider } from '../apps/api/src/modules/verification/providers/SmsProvider.js';
import { LocalKycProvider } from '../apps/api/src/modules/verification/providers/KycProvider.js';
import { VerificationService } from '../apps/api/src/modules/verification/verificationService.js';
import { hashPassword } from '../apps/api/src/utils/security.js';

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [PASS] ${name}`);
}

function fail(name, err) {
  totalTests++;
  console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  throw err;
}

async function runVerificationTestSuite() {
  console.log('\n========================================================================');
  console.log('   NivaaroFix Professional Identity & Document Verification Test Suite   ');
  console.log('========================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. UNIT TESTS: Verhoeff Algorithm for 12-digit Indian Aadhaar
    // -------------------------------------------------------------------------
    console.log('--- 1. UNIT TESTS: Verhoeff Checksum Algorithm ---');
    {
      // Generate a valid 12-digit number with Verhoeff check digit
      const base11 = '36749812345'; // Starts with 3 (valid, not 0 or 1)
      const checkDigit = generateVerhoeff(base11);
      const validAadhaar = `${base11}${checkDigit}`;

      assert.strictEqual(validateVerhoeff(validAadhaar), true, 'Verhoeff valid number check');

      const resValid = validateAadhaarNumber(validAadhaar);
      assert.strictEqual(resValid.valid, true);
      assert.strictEqual(resValid.last4, validAadhaar.slice(-4));
      assert.strictEqual(resValid.error, null);

      // Mutate one digit -> must fail
      const corruptedAadhaar = validAadhaar.slice(0, 5) + ((Number(validAadhaar[5]) + 1) % 10) + validAadhaar.slice(6);
      const resCorrupt = validateAadhaarNumber(corruptedAadhaar);
      assert.strictEqual(resCorrupt.valid, false, 'Corrupted digit must fail Verhoeff check');

      // Invalid start digit 0 or 1
      const startsWith0 = '0' + validAadhaar.slice(1);
      assert.strictEqual(validateAadhaarNumber(startsWith0).valid, false, 'Aadhaar starting with 0 is rejected');

      const startsWith1 = '1' + validAadhaar.slice(1);
      assert.strictEqual(validateAadhaarNumber(startsWith1).valid, false, 'Aadhaar starting with 1 is rejected');

      // Invalid length or non-digits
      assert.strictEqual(validateAadhaarNumber('12345678901').valid, false, '11 digits is rejected');
      assert.strictEqual(validateAadhaarNumber('1234567890123').valid, false, '13 digits is rejected');
      assert.strictEqual(validateAadhaarNumber('2345ABCD8901').valid, false, 'Alphanumeric is rejected');

      pass('Verhoeff algorithm correctly validates 12-digit Aadhaar & detects single-digit corruption');
    }

    // -------------------------------------------------------------------------
    // 2. UNIT TESTS: UIDAI Secure QR Digital Signature (RSA-SHA256)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. UNIT TESTS: UIDAI Secure QR & Digital Signature ---');
    {
      const fixture = createUidaiTestFixture({
        last4: '5432',
        name: 'Rajesh Kumar',
        isTampered: false
      });

      // Verify authentic fixture against UIDAI public certificate
      const isValidSig = verifyUidaiSignature(fixture.rawData, fixture.signature);
      assert.strictEqual(isValidSig, true, 'Authentic fixture must verify with UIDAI public certificate');

      // Tamper data payload by changing one character
      const tamperedRaw = Buffer.from(fixture.rawData);
      tamperedRaw[5] = tamperedRaw[5] ^ 0xFF;
      const isTamperedSig = verifyUidaiSignature(tamperedRaw, fixture.signature);
      assert.strictEqual(isTamperedSig, false, 'Tampered payload must fail UIDAI signature check');

      // Parse payload
      const parsed = decodeAndVerifyUidaiQr(fixture.qrBytes);
      assert.strictEqual(parsed.valid, true);
      assert.strictEqual(parsed.last4, '5432');
      assert.strictEqual(parsed.name, 'Rajesh Kumar');
      assert.strictEqual(parsed.isAuthentic, true);

      pass('UIDAI RSA-SHA256 digital signature authenticates genuine QR codes and rejects tampered QR codes');
    }

    // -------------------------------------------------------------------------
    // 3. UNIT TESTS: Driving Licence Format, Expiry & Fuzzy Name Matching
    // -------------------------------------------------------------------------
    console.log('\n--- 3. UNIT TESTS: Driving Licence & Fuzzy Name Matching ---');
    {
      const kyc = new LocalKycProvider();

      // Valid DL format and unexpired
      const validDlRes = await kyc.performDocumentChecks({
        documentType: 'driving_licence',
        rawText: 'Driving Licence No: DL-1420110012345',
        profileName: 'Rajesh Kumar',
        expiryInput: '2029-12-31'
      });
      assert.strictEqual(validDlRes.checks.expiry.status, 'pass');
      assert.strictEqual(validDlRes.checks.format.details.dlFormatMatched, true);
      assert.strictEqual(validDlRes.hardFailure, false);

      // Expired DL -> hard failure auto-rejection
      const expiredDlRes = await kyc.performDocumentChecks({
        documentType: 'driving_licence',
        rawText: 'Driving Licence No: KA0120150009876',
        profileName: 'Rajesh Kumar',
        expiryInput: '2020-01-01'
      });
      assert.strictEqual(expiredDlRes.hardFailure, true);
      assert.strictEqual(expiredDlRes.checks.expiry.status, 'fail');
      assert(expiredDlRes.rejectionReason.includes('expired'));

      // Invalid format warning
      const invalidDlRes = await kyc.performDocumentChecks({
        documentType: 'driving_licence',
        rawText: 'NOT-A-DL-NUMBER',
        profileName: 'Rajesh Kumar',
        expiryInput: '2030-01-01'
      });
      assert.strictEqual(invalidDlRes.checks.format.status, 'warn');
      assert.strictEqual(invalidDlRes.checks.format.details.dlFormatMatched, false);

      // Fuzzy Name Matching
      const match100 = compareNames('Rajesh Kumar', 'Rajesh Kumar');
      assert.strictEqual(match100.score, 100);
      assert.strictEqual(match100.isStrongMatch, true);

      const matchClose = compareNames('Rajesh Kumar', 'Rajesh K');
      assert(matchClose.score >= 70, `Score should be >= 70, got ${matchClose.score}`);
      assert.strictEqual(matchClose.isPartialMatch, true);

      const mismatch = compareNames('Rajesh Kumar', 'Suresh Patel');
      assert(mismatch.score < 50, `Different names score should be low, got ${mismatch.score}`);
      assert.strictEqual(mismatch.isStrongMatch, false);

      pass('Driving licence format/expiry validation and fuzzy name matching perform accurately');
    }

    // -------------------------------------------------------------------------
    // 4. UNIT TESTS: File Security, Magic Bytes, EXIF Stripping & AES-256-GCM
    // -------------------------------------------------------------------------
    console.log('\n--- 4. UNIT TESTS: File Crypto, Magic Bytes & EXIF Stripping ---');
    {
      // Magic Bytes: Valid JPEG
      const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]);
      assert.strictEqual(validateFileBytes(jpegBuf).valid, true);
      assert.strictEqual(validateFileBytes(jpegBuf).mimeType, 'image/jpeg');

      // Magic Bytes: Valid PNG
      const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      assert.strictEqual(validateFileBytes(pngBuf).valid, true);
      assert.strictEqual(validateFileBytes(pngBuf).mimeType, 'image/png');

      // Magic Bytes: Valid PDF
      const pdfBuf = Buffer.from('%PDF-1.4 sample pdf content for testing', 'ascii');
      assert.strictEqual(validateFileBytes(pdfBuf).valid, true);
      assert.strictEqual(validateFileBytes(pdfBuf).mimeType, 'application/pdf');

      // Reject executable or spoofed file
      const exeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00', 'ascii');
      assert.strictEqual(validateFileBytes(exeBuf).valid, false, 'Executable binary is rejected');

      const htmlBuf = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');
      assert.strictEqual(validateFileBytes(htmlBuf).valid, false, 'HTML/Script is rejected');

      // Reject file > 5MB
      const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 1);
      bigBuf[0] = 0xFF; bigBuf[1] = 0xD8; bigBuf[2] = 0xFF;
      assert.strictEqual(validateFileBytes(bigBuf).valid, false, 'File > 5MB is rejected');

      // EXIF Metadata Stripping: create JPEG with APP1 (EXIF 0xFF 0xE1) marker
      const app1Segment = Buffer.concat([
        Buffer.from([0xFF, 0xE1, 0x00, 0x08]), // Length 8
        Buffer.from('EXIF')
      ]);
      const rawJpegWithExif = Buffer.concat([
        Buffer.from([0xFF, 0xD8]), // SOI
        app1Segment,
        Buffer.from([0xFF, 0xDA, 0x00, 0x02]), // SOS
        Buffer.from([0x12, 0x34]), // Scan data
        Buffer.from([0xFF, 0xD9]) // EOI
      ]);

      const stripped = stripExifMetadata(rawJpegWithExif, 'image/jpeg');
      assert(!stripped.includes(Buffer.from([0xFF, 0xE1])), 'APP1 EXIF segment must be stripped');

      // AES-256-GCM authenticated encryption at rest
      const samplePayload = Buffer.from('Confidential Identity Document Proof for Test Professional');
      const { ciphertext, iv, authTag } = encryptBuffer(samplePayload);
      assert.notDeepStrictEqual(ciphertext, samplePayload, 'Ciphertext must not match plaintext');

      const decrypted = decryptBuffer(ciphertext, iv, authTag);
      assert.deepStrictEqual(decrypted, samplePayload, 'Decrypted buffer must exactly match original');

      // Corrupting one byte of ciphertext or tag must throw
      const corruptedTag = Buffer.from(authTag, 'hex');
      corruptedTag[0] = corruptedTag[0] ^ 0xFF;
      assert.throws(() => {
        decryptBuffer(ciphertext, iv, corruptedTag.toString('hex'));
      }, 'Corrupted auth tag must fail decryption');

      // Signed URL verification
      const signedUrl = generateSignedFileUrl({
        fileType: 'document',
        id: 'doc-uuid-1234',
        userId: 'pro-uuid-5678',
        role: 'admin',
        expiresInSeconds: 60
      });
      const parsedUrl = new URL(signedUrl, 'http://localhost:5000');
      const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());

      const verifiedValid = verifySignedFileUrl(queryObj, { id: 'admin-1', role: 'admin' });
      assert.strictEqual(verifiedValid.valid, true);

      // Tampered signed URL signature
      const tamperedQuery = { ...queryObj, sig: queryObj.sig.replace(/^[0-9a-f]/, 'z') };
      const verifiedTampered = verifySignedFileUrl(tamperedQuery, { id: 'admin-1', role: 'admin' });
      assert.strictEqual(verifiedTampered.valid, false, 'Tampered token must fail signature check');

      // Unauthorized viewer
      const unauthorizedViewer = verifySignedFileUrl(queryObj, { id: 'stranger-id', role: 'customer' });
      assert.strictEqual(unauthorizedViewer.valid, false, 'Unauthorized viewer must be rejected');

      pass('File security, magic byte enforcement, EXIF stripping, AES-256-GCM encryption, and signed URLs pass');
    }

    // -------------------------------------------------------------------------
    // 5. INTEGRATION: Mobile OTP Verification Service
    // -------------------------------------------------------------------------
    console.log('\n--- 5. INTEGRATION: Mobile OTP Verification ---');
    {
      const testPhone = `98${String(Date.now()).slice(-8)}`;
      const testIp = '192.168.1.100';

      // 1. Send OTP
      const sendRes = await VerificationService.sendMobileOtp({ phone: testPhone, ipAddress: testIp });
      assert.strictEqual(sendRes.success, true);
      assert.strictEqual(sendRes.expiresInSeconds, 300);

      // Verify HMAC storage in database (must NEVER be plaintext)
      const dbCheck = await pool.query(
        'SELECT id, code_hash, attempts, max_attempts FROM mobile_verifications WHERE phone = $1 ORDER BY created_at DESC LIMIT 1;',
        [testPhone]
      );
      assert(dbCheck.rows.length > 0);
      const row = dbCheck.rows[0];
      assert.strictEqual(row.code_hash.length, 64, 'Code hash must be 64-char SHA256 hex');
      assert(!/^\d{6}$/.test(row.code_hash), 'Code must NOT be plain 6-digit number');

      // Test resend cooldown (immediate second send within 30s must fail)
      const fastResend = await VerificationService.sendMobileOtp({ phone: testPhone, ipAddress: testIp });
      assert.strictEqual(fastResend.success, false);
      assert(fastResend.error.includes('30 seconds'), 'Must enforce 30s cooldown');

      // Test wrong code increments attempt counter
      const wrongAttempt = await VerificationService.verifyMobileOtp({ phone: testPhone, code: '000000' });
      assert.strictEqual(wrongAttempt.success, false);

      const checkAttempts = await pool.query('SELECT attempts FROM mobile_verifications WHERE id = $1;', [row.id]);
      assert.strictEqual(checkAttempts.rows[0].attempts, 1);

      // Retrieve code sent via MockSmsProvider
      const validCode = MockSmsProvider.lastSent?.code;
      assert(validCode && validCode.length === 6, 'MockSmsProvider captured sent OTP code');

      // Verify with correct code
      const verifySuccess = await VerificationService.verifyMobileOtp({
        phone: testPhone,
        code: validCode
      });
      assert.strictEqual(verifySuccess.success, true);

      // Code must now be marked consumed
      const consumedCheck = await pool.query('SELECT consumed_at FROM mobile_verifications WHERE id = $1;', [row.id]);
      assert(consumedCheck.rows[0].consumed_at !== null, 'Code must be marked consumed');

      // Replay attack with same code must fail
      const replayAttempt = await VerificationService.verifyMobileOtp({
        phone: testPhone,
        code: validCode
      });
      assert.strictEqual(replayAttempt.success, false, 'Replaying consumed code must fail');

      pass('Mobile OTP crypto hashing, attempt limiting, replay prevention, and cooldown pass');
    }

    // -------------------------------------------------------------------------
    // 6. INTEGRATION: Professional Document & Photo Upload + Admin Workflow
    // -------------------------------------------------------------------------
    console.log('\n--- 6. INTEGRATION: Document & Photo Upload + Admin Approval ---');
    {
      const proEmail = `test_pro_${Date.now()}@nivaarofix.test`;
      const proPhone = `99${String(Date.now()).slice(-8)}`;
      const proPwHash = await hashPassword('ProPassword123!');

      // Insert test professional into professionals & agent_login
      const proCode = `PRO-${Date.now().toString().slice(-6)}`;
      const proInsert = await pool.query(`
        INSERT INTO professionals (
          professional_code, name, email, phone, trade, experience_years, is_online, availability_status, kyc_status, payout_status
        ) VALUES (
          $1, 'Suresh Verma', $2, $3, 'electrician', 4, false, 'offline', 'pending', 'active'
        ) RETURNING id;
      `, [proCode, proEmail, proPhone]);

      const proId = proInsert.rows[0].id;

      await pool.query(`
        INSERT INTO agent_login (
          partner_id, name, email, password, phone, is_phone_verified, is_verified, kyc_status, is_online
        ) VALUES (
          $1, 'Suresh Verma', $2, $3, $4, false, false, 'pending', false
        ) ON CONFLICT (email) DO UPDATE SET phone = EXCLUDED.phone;
      `, [proCode, proEmail, proPwHash, proPhone]);

      // Step 6a: Dispatch Gating - unverified professional cannot toggle online
      const gateStatus = await VerificationService.getProfessionalVerificationStatus(proId);
      assert.strictEqual(gateStatus.isFullyVerified, false);
      assert.strictEqual(gateStatus.canGoAvailable, false);

      // Step 6b: Verify mobile
      // Send and verify OTP for this professional
      const otpSend = await VerificationService.sendMobileOtp({ phone: proPhone, ipAddress: '127.0.0.1' });
      assert.strictEqual(otpSend.success, true);

      const foundCode = MockSmsProvider.lastSent?.code;
      assert(foundCode && foundCode.length === 6, 'MockSmsProvider captured pro OTP code');

      const proVerifyMobile = await VerificationService.verifyMobileOtp({
        phone: proPhone,
        code: foundCode,
        professionalId: proId
      });
      assert.strictEqual(proVerifyMobile.success, true);

      // Mobile is now verified
      const statusAfterMobile = await VerificationService.getProfessionalVerificationStatus(proId);
      assert.strictEqual(statusAfterMobile.checklist.find(c => c.id === 'mobile').completed, true);
      assert.strictEqual(statusAfterMobile.canGoAvailable, false, 'Still cannot go available without photo and aadhaar');

      // Step 6c: Upload Aadhaar Document
      // Generate authentic UIDAI QR fixture
      const uidaiFixture = createUidaiTestFixture({
        last4: '8877',
        name: 'Suresh Verma'
      });

      // Synthetic valid JPEG file for document image
      const syntheticAadhaarImg = Buffer.concat([
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]),
        Buffer.alloc(1024, 0xAA),
        Buffer.from([0xFF, 0xD9])
      ]);

      // Consent required check: without consent must fail
      const noConsentRes = await VerificationService.uploadDocument({
        professionalId: proId,
        documentType: 'aadhaar',
        fileBuffer: syntheticAadhaarImg,
        consent: false
      });
      assert.strictEqual(noConsentRes.success, false);
      assert(noConsentRes.error.includes('Consent required'));

      // Upload with consent and QR buffer
      const docUploadRes = await VerificationService.uploadDocument({
        professionalId: proId,
        documentType: 'aadhaar',
        fileBuffer: syntheticAadhaarImg,
        consent: true,
        profileName: 'Suresh Verma',
        qrBuffer: uidaiFixture.qrBytes
      });
      assert.strictEqual(docUploadRes.success, true);
      assert.strictEqual(docUploadRes.document.status, 'under_review');
      assert.strictEqual(docUploadRes.document.aadhaar_last4, '8877');

      // Step 6d: Upload Live Portrait Photo
      const syntheticLivePhoto = Buffer.concat([
        Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]),
        Buffer.alloc(2048, 0xBB),
        Buffer.from([0xFF, 0xD9])
      ]);

      const photoUploadRes = await VerificationService.uploadLivePhoto({
        professionalId: proId,
        fileBuffer: syntheticLivePhoto,
        isUploadFallback: false
      });
      assert.strictEqual(photoUploadRes.success, true);
      assert.strictEqual(photoUploadRes.photo.status, 'under_review');

      // Step 6e: Admin Review
      // Create admin user for reviewing
      const adminEmail = `admin_${Date.now()}@nivaarofix.test`;
      const adminPwHash = await hashPassword('AdminPass123!');
      const adminInsert = await pool.query(`
        INSERT INTO users (email, password_hash, role, auth_provider, is_phone_verified)
        VALUES ($1, $2, 'admin', 'local', true)
        RETURNING id, email, role;
      `, [adminEmail, adminPwHash]);
      const adminUser = adminInsert.rows[0];

      // Test Admin Approval of Document
      const docId = docUploadRes.document.id;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`
          UPDATE professional_documents
          SET status = 'verified', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `, [adminUser.id, docId]);
        await client.query('UPDATE professionals SET aadhaar_verified = true WHERE id = $1;', [proId]);
        await client.query('UPDATE agent_login SET aadhaar_verified = true WHERE id = $1;', [proId]);

        // Audit log
        await client.query(`
          INSERT INTO verification_audit_log (professional_id, actor_id, actor_email, action, target_type, target_id, reason)
          VALUES ($1, $2, $3, 'document_approved', 'document', $4, 'Approved by admin');
        `, [proId, adminUser.id, adminUser.email, docId]);

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Test Admin Approval of Live Photo
      const photoId = photoUploadRes.photo.id;
      const client2 = await pool.connect();
      try {
        await client2.query('BEGIN');
        await client2.query(`
          UPDATE professional_photos
          SET status = 'verified', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $2;
        `, [adminUser.id, photoId]);
        await client2.query('UPDATE professionals SET photo_verified = true, kyc_status = \'verified\' WHERE id = $1;', [proId]);
        await client2.query('UPDATE agent_login SET photo_verified = true, is_verified = true, kyc_status = \'verified\' WHERE id = $1;', [proId]);

        // Audit log
        await client2.query(`
          INSERT INTO verification_audit_log (professional_id, actor_id, actor_email, action, target_type, target_id, reason)
          VALUES ($1, $2, $3, 'photo_approved', 'photo', $4, 'Approved by admin');
        `, [proId, adminUser.id, adminUser.email, photoId]);

        await client2.query('COMMIT');
      } finally {
        client2.release();
      }

      // Professional is now FULLY VERIFIED and CAN GO AVAILABLE
      const statusFinal = await VerificationService.getProfessionalVerificationStatus(proId);
      assert.strictEqual(statusFinal.isFullyVerified, true);
      assert.strictEqual(statusFinal.canGoAvailable, true);

      // Verify audit trail contains logged actions
      const auditTrail = await pool.query(
        'SELECT action, actor_email, target_type FROM verification_audit_log WHERE professional_id = $1 ORDER BY created_at ASC;',
        [proId]
      );
      assert(auditTrail.rows.length >= 4, 'Audit trail must contain mobile, doc upload, photo upload, and approvals');

      pass('Full document upload, live photo upload, admin review, and dispatch status unlock pass');
    }

    // -------------------------------------------------------------------------
    // 7. INTEGRATION: Data Retention Cleanup & Privacy Audit
    // -------------------------------------------------------------------------
    console.log('\n--- 7. INTEGRATION: Retention Cleanup & Zero-Data-Leak Audit ---');
    {
      // Run retention cleanup
      const retentionRes = await VerificationService.runRetentionCleanup({ retentionDays: 0 }); // 0 days forces cleanup of eligible records
      assert.strictEqual(retentionRes.success, true);

      // PRIVACY AUDIT: Database must NEVER contain full 12-digit Aadhaar numbers or plaintext OTPs
      const allDocs = await pool.query('SELECT aadhaar_last4, encrypted_file_path FROM professional_documents;');
      for (const d of allDocs.rows) {
        if (d.aadhaar_last4) {
          assert.strictEqual(d.aadhaar_last4.length, 4, 'Only last 4 digits allowed in aadhaar_last4 column');
          assert(!/^\d{12}$/.test(d.aadhaar_last4), 'Must NEVER store 12 digits');
        }
      }

      const allOtps = await pool.query('SELECT code_hash FROM mobile_verifications;');
      for (const o of allOtps.rows) {
        assert.strictEqual(o.code_hash.length, 64, 'Only HMAC-SHA256 hex hashes stored for OTP');
      }

      pass('Zero-data-leak privacy audit verified: no plain OTP, no 12-digit Aadhaar, and clean retention');
    }

    console.log('\n========================================================================');
    console.log(`   ALL ${passedTests}/${totalTests} PROFESSIONAL VERIFICATION TESTS PASSED SUCCESSFULLY!   `);
    console.log('========================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:\n', err);
    process.exit(1);
  }
}

runVerificationTestSuite();
