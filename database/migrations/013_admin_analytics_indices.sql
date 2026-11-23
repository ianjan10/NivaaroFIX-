-- ============================================================================
-- Migration 013: Admin Analytics & Registry Query Optimization Indices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_account_status ON customers(account_status);

CREATE INDEX IF NOT EXISTS idx_professionals_created_at ON professionals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_professionals_account_status ON professionals(account_status);
CREATE INDEX IF NOT EXISTS idx_professionals_kyc_status ON professionals(kyc_status);
CREATE INDEX IF NOT EXISTS idx_professionals_trade ON professionals(trade);

CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_pro_id ON service_requests(assigned_professional_id);

