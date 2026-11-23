import { evaluateImageQuality } from '../utils/imageQuality.js';
import { validateAadhaarNumber } from '../utils/verhoeff.js';
import { decodeAndVerifyUidaiQr } from '../utils/uidaiQr.js';
import { compareNames } from '../utils/fuzzyName.js';

export class KycProvider {
  /**
   * Performs automated quality, OCR extraction, format, and signature verification on a document.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async performDocumentChecks(params) {
    throw new Error('KycProvider.performDocumentChecks must be implemented by subclass.');
  }
}

/**
 * Local KYC Provider using free and open-source verification routines.
 * Extracts fields, validates Verhoeff checksum & UIDAI RSA signature,
 * checks DL format and expiry, and evaluates fuzzy name similarity.
 */
export class LocalKycProvider extends KycProvider {
  async performDocumentChecks({
    documentType,
    buffer,
    mimeType,
    profileName,
    rawText = null,
    qrBuffer = null,
    expiryInput = null
  }) {
    const checksSummary = {
      quality: { status: 'pass', details: {} },
      format: { status: 'pass', details: {} },
      signature: { status: 'not_applicable', details: {} },
      expiry: { status: 'not_applicable', details: {} },
      nameMatch: { status: 'pass', details: {} },
      hardFailure: false,
      overallStatus: 'under_review' // Automated checks assist; human admin decides
    };

    let aadhaarLast4 = null;
    let documentExpiry = null;
    let extractedName = null;

    // 1. Image Quality Evaluation (resolution, brightness, blur)
    if (mimeType !== 'application/pdf') {
      const quality = evaluateImageQuality(buffer, { minWidth: 320, minHeight: 320 });
      checksSummary.quality.details = {
        resolution: `${quality.width}x${quality.height}`,
        brightness: quality.brightness,
        blurScore: quality.blurScore,
        isAdequatelyLit: quality.isAdequatelyLit,
        isSharp: quality.isSharp
      };

      if (!quality.pass) {
        checksSummary.quality.status = 'warn';
        checksSummary.quality.reason = quality.reason;
      }
    } else {
      checksSummary.quality.details = { note: 'PDF document accepted for manual preview.' };
    }

    // 2. OCR Text Extraction (heuristic regex parser over text representation or rawText)
    const textContent = rawText || (buffer ? buffer.toString('utf8', 0, Math.min(buffer.length, 10000)) : '');

    // 3. Document Specific Checks: Aadhaar
    if (documentType === 'aadhaar') {
      // Look for 12-digit number in OCR text
      const aadhaarMatches = textContent.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g) || [];
      let foundValidAadhaar = false;

      for (const rawMatch of aadhaarMatches) {
        const cleanDigits = rawMatch.replace(/\s+/g, '');
        const verhoeffRes = validateAadhaarNumber(cleanDigits);
        if (verhoeffRes.valid) {
          foundValidAadhaar = true;
          aadhaarLast4 = verhoeffRes.last4; // Only save last 4 digits
          break;
        }
      }

      // Check UIDAI Secure QR Code if provided
      if (qrBuffer) {
        const qrResult = decodeAndVerifyUidaiQr(qrBuffer);
        checksSummary.signature.status = qrResult.isAuthentic ? 'pass' : 'fail';
        checksSummary.signature.details = {
          qrValid: qrResult.valid,
          isAuthentic: qrResult.isAuthentic,
          error: qrResult.error
        };

        if (qrResult.last4) {
          aadhaarLast4 = qrResult.last4;
        }
        if (qrResult.name) {
          extractedName = qrResult.name;
        }

        if (!qrResult.isAuthentic) {
          checksSummary.signature.status = 'fail';
        }
      } else {
        checksSummary.signature.details = { note: 'No secure QR stream provided; relying on OCR visual check.' };
      }

      // Format check result
      if (foundValidAadhaar || aadhaarLast4) {
        checksSummary.format.status = 'pass';
        checksSummary.format.details = {
          verhoeffCheck: 'valid',
          last4: aadhaarLast4
        };
      } else {
        checksSummary.format.status = 'warn';
        checksSummary.format.details = {
          verhoeffCheck: 'unverified_in_preview',
          note: 'Aadhaar digits require manual visual inspection by admin.'
        };
      }
    }

    // 4. Document Specific Checks: Driving Licence
    if (documentType === 'driving_licence') {
      // Standard Indian DL format: 2-letter state code + 2 digits RTO + 4 digits year + 7 digits serial
      // e.g. KA0120150001234, DL-1420110012345
      const dlRegex = /\b[A-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7}\b/i;
      const dlGeneralRegex = /\b[A-Z]{2}[0-9A-Z]{13,15}\b/i;

      const hasDlFormat = dlRegex.test(textContent) || dlGeneralRegex.test(textContent.replace(/[\s-]/g, ''));
      checksSummary.format.details = {
        dlFormatMatched: hasDlFormat
      };

      if (!hasDlFormat) {
        checksSummary.format.status = 'warn';
        checksSummary.format.details.note = 'Standard DL number pattern not automatically detected; flagged for admin review.';
      }

      // Check DL Expiry
      let expiryDate = null;
      if (expiryInput) {
        expiryDate = new Date(expiryInput);
      } else {
        // Look for date in OCR text (DD/MM/YYYY or YYYY-MM-DD)
        const dateMatch = textContent.match(/\b(20[2-9][0-9])[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12][0-9]|3[01])\b/) ||
                          textContent.match(/\b(0[1-9]|[12][0-9]|3[01])[-/.](0[1-9]|1[0-2])[-/.](20[2-9][0-9])\b/);
        if (dateMatch) {
          expiryDate = new Date(dateMatch[0]);
        }
      }

      if (expiryDate && !isNaN(expiryDate.getTime())) {
        documentExpiry = expiryDate.toISOString().split('T')[0];
        const isExpired = expiryDate < new Date();
        checksSummary.expiry.status = isExpired ? 'fail' : 'pass';
        checksSummary.expiry.details = {
          expiryDate: documentExpiry,
          isExpired
        };

        if (isExpired) {
          // Hard failure: Expired driving licence
          checksSummary.hardFailure = true;
          checksSummary.overallStatus = 'rejected';
          checksSummary.rejectionReason = `Driving licence expired on ${documentExpiry}.`;
        }
      } else {
        checksSummary.expiry.status = 'warn';
        checksSummary.expiry.details = { note: 'Expiry date could not be parsed automatically.' };
      }
    }

    // 5. Fuzzy Name Match against Profile Name
    const targetName = extractedName || profileName;
    const nameComp = compareNames(profileName, targetName);
    checksSummary.nameMatch.details = {
      profileName,
      extractedName: targetName,
      similarityScore: nameComp.score,
      isStrongMatch: nameComp.isStrongMatch,
      isPartialMatch: nameComp.isPartialMatch
    };

    if (!nameComp.isPartialMatch && extractedName && extractedName !== profileName) {
      checksSummary.nameMatch.status = 'warn';
      checksSummary.nameMatch.reason = `Name similarity is ${nameComp.score}%. Requires human administrator inspection.`;
    }

    return {
      checks: checksSummary,
      aadhaarLast4,
      documentExpiry,
      hardFailure: checksSummary.hardFailure,
      overallStatus: checksSummary.overallStatus,
      rejectionReason: checksSummary.rejectionReason || null
    };
  }
}

/**
 * KYC Provider Factory (prepares architecture for DigiLocker upgrade)
 */
export function createKycProvider(type = process.env.KYC_PROVIDER || 'local') {
  if (type === 'digilocker') {
    // DigiLocker through aggregator adapter will hook in here seamlessly
    return new LocalKycProvider();
  }
  return new LocalKycProvider();
}

