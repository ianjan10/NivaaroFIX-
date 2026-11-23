-- ============================================================================
-- Migration 005: Online Payments, Provider Transfers, and Professional Payouts
-- NivaaroFix Online Payment Architecture (Razorpay Standard Checkout & Route)
-- ============================================================================

-- 1. Alter Professionals & Agent Login: Add Linked Account and Payout Status fields
ALTER TABLE professionals 
    ADD COLUMN IF NOT EXISTS provider_linked_account_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payout_status VARCHAR(32) NOT NULL DEFAULT 'not_set',
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS bank_last4 VARCHAR(4);

ALTER TABLE agent_login 
    ADD COLUMN IF NOT EXISTS provider_linked_account_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payout_status VARCHAR(32) NOT NULL DEFAULT 'not_set',
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS bank_last4 VARCHAR(4);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_professionals_payout_status') THEN
        ALTER TABLE professionals ADD CONSTRAINT ck_professionals_payout_status 
            CHECK (payout_status IN ('not_set', 'pending', 'active', 'rejected'));
    END IF;
END $$;

COMMENT ON COLUMN professionals.provider_linked_account_id IS 'Payment provider (Razorpay Route) linked account ID (acc_xxx) for direct settlements.';
COMMENT ON COLUMN professionals.payout_status IS 'Professional payout setup status: not_set, pending, active, rejected.';
COMMENT ON COLUMN professionals.bank_name IS 'Name of the verified bank institution from IFSC lookup (no sensitive account data).';
COMMENT ON COLUMN professionals.bank_last4 IS 'Last 4 digits of the verified settlement bank account.';

CREATE INDEX IF NOT EXISTS ix_professionals_payout ON professionals(payout_status);

-- 2. Cleanly replace legacy stub payments table
DROP TABLE IF EXISTS payments CASCADE;

-- 3. Core Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY,
    payment_code            VARCHAR(32) NOT NULL,
    service_request_id      BIGINT NOT NULL,
    customer_id             BIGINT NOT NULL,
    professional_id         BIGINT NOT NULL,
    amount                  NUMERIC(12,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'INR',
    platform_fee            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    professional_amount     NUMERIC(12,2) NOT NULL,
    status                  VARCHAR(32) NOT NULL DEFAULT 'due',
    provider                VARCHAR(32) NOT NULL DEFAULT 'razorpay',
    provider_order_id       VARCHAR(100),
    provider_payment_id     VARCHAR(100),
    method                  VARCHAR(32),
    failure_reason          TEXT,
    captured_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payments PRIMARY KEY (id),
    CONSTRAINT uq_payments_code UNIQUE (payment_code),
    CONSTRAINT uq_payments_request UNIQUE (service_request_id),
    CONSTRAINT fk_payments_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_professional FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE RESTRICT,
    CONSTRAINT ck_payments_amount CHECK (amount > 0),
    CONSTRAINT ck_payments_platform_fee CHECK (platform_fee >= 0),
    CONSTRAINT ck_payments_pro_amount CHECK (professional_amount >= 0),
    CONSTRAINT ck_payments_status CHECK (status IN ('due', 'processing', 'paid', 'failed', 'refunded'))
);

CREATE INDEX IF NOT EXISTS ix_payments_service_request ON payments(service_request_id);
CREATE INDEX IF NOT EXISTS ix_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS ix_payments_professional ON payments(professional_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS ix_payments_provider_order ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS ix_payments_provider_payment ON payments(provider_payment_id);

COMMENT ON TABLE payments IS 'Customer payments for completed jobs via Razorpay Standard Checkout.';
COMMENT ON COLUMN payments.id IS 'Sequential primary key.';
COMMENT ON COLUMN payments.payment_code IS 'Public unique reference code formatted as YYYY + 6 digits from code_sequences.';
COMMENT ON COLUMN payments.service_request_id IS 'Unique foreign key to the associated completed service request.';
COMMENT ON COLUMN payments.customer_id IS 'Foreign key to the customer paying for the repair.';
COMMENT ON COLUMN payments.professional_id IS 'Foreign key to the professional who completed the repair.';
COMMENT ON COLUMN payments.amount IS 'Total agreed service amount in INR.';
COMMENT ON COLUMN payments.currency IS 'Currency code, standard ISO INR.';
COMMENT ON COLUMN payments.platform_fee IS 'Platform fee amount in INR deducted before professional transfer.';
COMMENT ON COLUMN payments.professional_amount IS 'Net amount payable to the professional in INR.';
COMMENT ON COLUMN payments.status IS 'Payment lifecycle state: due, processing, paid, failed, refunded.';
COMMENT ON COLUMN payments.provider IS 'Payment processor identifier (e.g. razorpay, mock).';
COMMENT ON COLUMN payments.provider_order_id IS 'Payment processor order ID (order_xxx).';
COMMENT ON COLUMN payments.provider_payment_id IS 'Payment processor payment capture ID (pay_xxx).';
COMMENT ON COLUMN payments.method IS 'Payment instrument method: upi, card, netbanking, wallet.';
COMMENT ON COLUMN payments.failure_reason IS 'Descriptive failure reason if transaction failed.';
COMMENT ON COLUMN payments.captured_at IS 'Timestamp when payment was successfully captured.';
COMMENT ON COLUMN payments.created_at IS 'Timestamp when payment was initiated.';
COMMENT ON COLUMN payments.updated_at IS 'Timestamp when payment record was last modified.';

-- 4. Payment Attempts (Retries & idempotency tracking per checkout session)
CREATE TABLE IF NOT EXISTS payment_attempts (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY,
    payment_id              BIGINT NOT NULL,
    provider_order_id       VARCHAR(100) NOT NULL,
    provider_payment_id     VARCHAR(100),
    status                  VARCHAR(32) NOT NULL DEFAULT 'initiated',
    error_code              VARCHAR(100),
    error_description       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payment_attempts PRIMARY KEY (id),
    CONSTRAINT fk_payment_attempts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    CONSTRAINT ck_payment_attempts_status CHECK (status IN ('initiated', 'processing', 'captured', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_payment_attempts_payment ON payment_attempts(payment_id);
CREATE INDEX IF NOT EXISTS ix_payment_attempts_order ON payment_attempts(provider_order_id);
CREATE INDEX IF NOT EXISTS ix_payment_attempts_payment_id ON payment_attempts(provider_payment_id);

COMMENT ON TABLE payment_attempts IS 'Audit log of checkout attempts per payment order, ensuring retry safety.';
COMMENT ON COLUMN payment_attempts.id IS 'Sequential primary key.';
COMMENT ON COLUMN payment_attempts.payment_id IS 'Foreign key to parent payment record.';
COMMENT ON COLUMN payment_attempts.provider_order_id IS 'Provider order identifier for this attempt.';
COMMENT ON COLUMN payment_attempts.provider_payment_id IS 'Provider payment identifier for this attempt.';
COMMENT ON COLUMN payment_attempts.status IS 'Status of attempt: initiated, processing, captured, failed.';
COMMENT ON COLUMN payment_attempts.error_code IS 'Provider error code if attempt failed.';
COMMENT ON COLUMN payment_attempts.error_description IS 'Provider error message if attempt failed.';
COMMENT ON COLUMN payment_attempts.created_at IS 'Timestamp when checkout attempt occurred.';

-- 5. Payment Transfers (Razorpay Route automated settlement to professional's linked account)
CREATE TABLE IF NOT EXISTS payment_transfers (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY,
    payment_id              BIGINT NOT NULL,
    professional_id         BIGINT NOT NULL,
    provider_transfer_id    VARCHAR(100),
    status                  VARCHAR(32) NOT NULL DEFAULT 'pending',
    amount                  NUMERIC(12,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'INR',
    settled_at              TIMESTAMPTZ,
    failure_reason          TEXT,
    retry_count             INT NOT NULL DEFAULT 0,
    hold_until              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payment_transfers PRIMARY KEY (id),
    CONSTRAINT fk_payment_transfers_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_transfers_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE RESTRICT,
    CONSTRAINT ck_payment_transfers_amount CHECK (amount > 0),
    CONSTRAINT ck_payment_transfers_status CHECK (status IN ('pending', 'processing', 'settled', 'failed', 'reversed'))
);

CREATE INDEX IF NOT EXISTS ix_payment_transfers_payment ON payment_transfers(payment_id);
CREATE INDEX IF NOT EXISTS ix_payment_transfers_pro ON payment_transfers(professional_id);
CREATE INDEX IF NOT EXISTS ix_payment_transfers_status ON payment_transfers(status);
CREATE INDEX IF NOT EXISTS ix_payment_transfers_provider_id ON payment_transfers(provider_transfer_id);

COMMENT ON TABLE payment_transfers IS 'Automated route settlements transferring professional earnings to their linked bank accounts.';
COMMENT ON COLUMN payment_transfers.id IS 'Sequential primary key.';
COMMENT ON COLUMN payment_transfers.payment_id IS 'Foreign key to the source captured payment.';
COMMENT ON COLUMN payment_transfers.professional_id IS 'Foreign key to the recipient professional.';
COMMENT ON COLUMN payment_transfers.provider_transfer_id IS 'Provider transfer identifier (trf_xxx).';
COMMENT ON COLUMN payment_transfers.status IS 'Transfer status: pending, processing, settled, failed, reversed.';
COMMENT ON COLUMN payment_transfers.amount IS 'Amount in INR transferred to the professional.';
COMMENT ON COLUMN payment_transfers.currency IS 'Currency code, standard ISO INR.';
COMMENT ON COLUMN payment_transfers.settled_at IS 'Timestamp when transfer settled to the bank account.';
COMMENT ON COLUMN payment_transfers.failure_reason IS 'Error details if route transfer failed.';
COMMENT ON COLUMN payment_transfers.retry_count IS 'Number of automated transfer retries attempted.';
COMMENT ON COLUMN payment_transfers.hold_until IS 'Timestamp until which payout hold is enforced (e.g. PAYOUT_HOLD_HOURS).';
COMMENT ON COLUMN payment_transfers.created_at IS 'Timestamp when transfer instruction was created.';
COMMENT ON COLUMN payment_transfers.updated_at IS 'Timestamp when transfer record was last updated.';

-- 6. Refunds
CREATE TABLE IF NOT EXISTS refunds (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY,
    payment_id              BIGINT NOT NULL,
    amount                  NUMERIC(12,2) NOT NULL,
    reason                  TEXT NOT NULL,
    provider_refund_id      VARCHAR(100),
    status                  VARCHAR(32) NOT NULL DEFAULT 'initiated',
    processed_by_admin_id   BIGINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_refunds PRIMARY KEY (id),
    CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refunds_admin FOREIGN KEY (processed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT ck_refunds_amount CHECK (amount > 0),
    CONSTRAINT ck_refunds_status CHECK (status IN ('initiated', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS ix_refunds_provider_id ON refunds(provider_refund_id);
CREATE INDEX IF NOT EXISTS ix_refunds_status ON refunds(status);

COMMENT ON TABLE refunds IS 'Admin-issued refunds reversing captured payments and linked account transfers.';
COMMENT ON COLUMN refunds.id IS 'Sequential primary key.';
COMMENT ON COLUMN refunds.payment_id IS 'Foreign key to the captured payment being refunded.';
COMMENT ON COLUMN refunds.amount IS 'Refund amount in INR.';
COMMENT ON COLUMN refunds.reason IS 'Administrative or dispute justification for the refund.';
COMMENT ON COLUMN refunds.provider_refund_id IS 'Provider refund identifier (rfnd_xxx).';
COMMENT ON COLUMN refunds.status IS 'Refund status: initiated, processed, failed.';
COMMENT ON COLUMN refunds.processed_by_admin_id IS 'User ID of the administrator issuing the refund.';
COMMENT ON COLUMN refunds.created_at IS 'Timestamp when refund was initiated.';

-- 7. Webhook Events (Idempotency and Audit Ledger)
CREATE TABLE IF NOT EXISTS webhook_events (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY,
    provider_event_id       VARCHAR(150) NOT NULL,
    provider                VARCHAR(32) NOT NULL DEFAULT 'razorpay',
    type                    VARCHAR(100) NOT NULL,
    payload                 JSONB NOT NULL,
    processed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_webhook_events PRIMARY KEY (id),
    CONSTRAINT uq_webhook_events_provider_id UNIQUE (provider_event_id)
);

CREATE INDEX IF NOT EXISTS ix_webhook_events_provider_id ON webhook_events(provider_event_id);
CREATE INDEX IF NOT EXISTS ix_webhook_events_type ON webhook_events(type);
CREATE INDEX IF NOT EXISTS ix_webhook_events_processed_at ON webhook_events(processed_at);

COMMENT ON TABLE webhook_events IS 'Idempotent storage ledger for webhook payloads received from payment providers.';
COMMENT ON COLUMN webhook_events.id IS 'Sequential primary key.';
COMMENT ON COLUMN webhook_events.provider_event_id IS 'Unique event identifier from provider (e.g. event_xxx or X-Razorpay-Event-Id header).';
COMMENT ON COLUMN webhook_events.provider IS 'Payment processor name (razorpay or mock).';
COMMENT ON COLUMN webhook_events.type IS 'Webhook event type (e.g. payment.captured, order.paid, transfer.processed).';
COMMENT ON COLUMN webhook_events.payload IS 'Full unmodified JSON payload received with the webhook.';
COMMENT ON COLUMN webhook_events.processed_at IS 'Timestamp when the event processing completed successfully.';
COMMENT ON COLUMN webhook_events.created_at IS 'Timestamp when the webhook event was received.';
