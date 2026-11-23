-- Migration 018: Strict Aadhaar Data Sanitization & Full Number Purge
-- Compliant with UIDAI and NivaaroFix Truthfulness & Privacy rules:
-- 12-digit Aadhaar numbers are NEVER stored or returned; only last 4 digits are retained.

-- 1. Ensure last 4 digits are preserved before purging
UPDATE professional_documents
SET aadhaar_last4 = RIGHT(REGEXP_REPLACE(aadhaar_number, '\D', '', 'g'), 4)
WHERE document_type = 'aadhaar'
  AND (aadhaar_last4 IS NULL OR aadhaar_last4 = '')
  AND aadhaar_number IS NOT NULL;

-- 2. Purge full Aadhaar numbers from all tables
UPDATE professional_documents
SET aadhaar_number = NULL
WHERE aadhaar_number IS NOT NULL;

UPDATE professionals
SET aadhaar_number = NULL
WHERE aadhaar_number IS NOT NULL;

UPDATE agent_login
SET aadhaar_number = NULL
WHERE aadhaar_number IS NOT NULL;

-- 3. Purge full Aadhaar numbers from verification_events JSON details
UPDATE verification_events
SET details = (details - 'aadhaar_number') || jsonb_build_object('aadhaar_last4', RIGHT(REGEXP_REPLACE(details->>'aadhaar_number', '\D', '', 'g'), 4))
WHERE details ? 'aadhaar_number' AND details->>'aadhaar_number' IS NOT NULL;

-- 4. Purge from any admin_audit_log if present
UPDATE admin_audit_log
SET details = details - 'aadhaar_number'
WHERE details ? 'aadhaar_number';
