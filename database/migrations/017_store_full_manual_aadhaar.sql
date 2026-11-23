-- Migration 017: Store full manual 12-digit Aadhaar number recorded by admin verification
ALTER TABLE professional_documents ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(32);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(32);
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(32);

COMMENT ON COLUMN professional_documents.aadhaar_number IS 'Full 12-digit Aadhaar number manually verified and recorded by administrator.';
COMMENT ON COLUMN professionals.aadhaar_number IS 'Verified 12-digit Aadhaar number from onboarding review.';
COMMENT ON COLUMN agent_login.aadhaar_number IS 'Verified 12-digit Aadhaar number mirroring professionals table.';
