-- ==============================================================================
-- NivaaroFix — Baseline Clean Numbered Database Schema
-- Migration: 001_initial_schema.sql
-- All primary keys: BIGINT GENERATED ALWAYS AS IDENTITY (sequential, starting at 1)
-- Public entity codes: atomic sequence-driven (YYYY + 5 digits / 6 digits)
-- ==============================================================================

-- Drop existing legacy views and tables
-- Recreate clean public schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- 1. Code Sequences (Atomic generator for human-facing numeric codes)
CREATE TABLE IF NOT EXISTS code_sequences (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    entity              VARCHAR(50) NOT NULL,
    year                INT NOT NULL,
    last_value          BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_code_sequences PRIMARY KEY (id),
    CONSTRAINT uq_code_sequences_entity_year UNIQUE (entity, year)
);

COMMENT ON TABLE code_sequences IS 'Atomic sequence tracker for generating collision-free public reference numbers by year.';
COMMENT ON COLUMN code_sequences.id IS 'Sequential primary key.';
COMMENT ON COLUMN code_sequences.entity IS 'Entity identifier (customer, professional, service_request).';
COMMENT ON COLUMN code_sequences.year IS 'Calendar year prefix for codes.';
COMMENT ON COLUMN code_sequences.last_value IS 'Highest assigned sequence number in the year.';
COMMENT ON COLUMN code_sequences.updated_at IS 'Timestamp of last sequence value increment.';

-- Atomic Sequence Increment Function
CREATE OR REPLACE FUNCTION next_entity_code(p_entity TEXT, p_pad_len INT DEFAULT 5)
RETURNS TEXT AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::INT;
    v_val BIGINT;
BEGIN
    INSERT INTO code_sequences (entity, year, last_value, updated_at)
    VALUES (p_entity, v_year, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (entity, year)
    DO UPDATE SET 
        last_value = code_sequences.last_value + 1,
        updated_at = CURRENT_TIMESTAMP
    RETURNING last_value INTO v_val;

    RETURN v_year::TEXT || LPAD(v_val::TEXT, p_pad_len, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. Base Users (Shared authentication & account identity)
CREATE TABLE IF NOT EXISTS users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(32),
    password_hash       VARCHAR(255),
    role                VARCHAR(32) NOT NULL DEFAULT 'customer',
    auth_provider       VARCHAR(32) NOT NULL DEFAULT 'local',
    is_phone_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_role CHECK (role IN ('customer', 'professional', 'admin')),
    CONSTRAINT ck_users_auth_provider CHECK (auth_provider IN ('local', 'google', 'phone_otp', 'agent_id', 'partner_code', 'email'))
);

CREATE INDEX IF NOT EXISTS ix_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);

COMMENT ON TABLE users IS 'Master authentication accounts across customers, professionals, and admins.';
COMMENT ON COLUMN users.id IS 'Sequential primary key.';
COMMENT ON COLUMN users.email IS 'Unique email address for login and communication.';
COMMENT ON COLUMN users.phone IS 'Mobile number with country code.';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt password hash for password-authenticated accounts.';
COMMENT ON COLUMN users.role IS 'User permission role: customer, professional, admin.';
COMMENT ON COLUMN users.auth_provider IS 'Identity provider: local, google, phone_otp, agent_id.';
COMMENT ON COLUMN users.is_phone_verified IS 'True once OTP verification succeeds.';
COMMENT ON COLUMN users.is_active IS 'Whether account is permitted to login and transact.';
COMMENT ON COLUMN users.created_at IS 'Account creation timestamp.';
COMMENT ON COLUMN users.updated_at IS 'Last profile update timestamp.';

-- 3. Customers
CREATE TABLE IF NOT EXISTS customers (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id             BIGINT,
    customer_code       VARCHAR(32) NOT NULL,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(32),
    default_address     TEXT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    h3_cell             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_customers PRIMARY KEY (id),
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_customers_code UNIQUE (customer_code),
    CONSTRAINT uq_customers_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS ix_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS ix_customers_phone ON customers(phone);

COMMENT ON TABLE customers IS 'Customer account profiles for on-demand home service bookings.';
COMMENT ON COLUMN customers.id IS 'Sequential primary key.';
COMMENT ON COLUMN customers.user_id IS 'Foreign key to master users table.';
COMMENT ON COLUMN customers.customer_code IS 'Public sequential identifier formatted as YYYY + 5 digits (e.g. 202600001).';
COMMENT ON COLUMN customers.name IS 'Full legal or display name.';
COMMENT ON COLUMN customers.email IS 'Customer email address.';
COMMENT ON COLUMN customers.phone IS 'Customer contact telephone.';
COMMENT ON COLUMN customers.default_address IS 'Primary delivery doorstep address.';
COMMENT ON COLUMN customers.lat IS 'Doorstep latitude coordinate.';
COMMENT ON COLUMN customers.lng IS 'Doorstep longitude coordinate.';
COMMENT ON COLUMN customers.h3_cell IS 'H3 geospatial index cell for proximity calculations.';
COMMENT ON COLUMN customers.created_at IS 'Customer creation timestamp.';
COMMENT ON COLUMN customers.updated_at IS 'Customer profile last updated timestamp.';

-- 4. Professionals
CREATE TABLE IF NOT EXISTS professionals (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id             BIGINT,
    professional_code   VARCHAR(32) NOT NULL,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(32),
    trade               VARCHAR(64) NOT NULL DEFAULT 'electrician',
    experience_years    INT NOT NULL DEFAULT 0,
    address             TEXT,
    city                VARCHAR(100) DEFAULT 'Bengaluru',
    state               VARCHAR(100) DEFAULT 'Karnataka',
    kyc_status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    rating              NUMERIC(3,2),
    completed_jobs      INT NOT NULL DEFAULT 0,
    is_online           BOOLEAN NOT NULL DEFAULT FALSE,
    availability_status VARCHAR(32) NOT NULL DEFAULT 'available',
    wallet_balance      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    h3_cell             TEXT,
    last_location_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_professionals PRIMARY KEY (id),
    CONSTRAINT fk_professionals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_professionals_code UNIQUE (professional_code),
    CONSTRAINT uq_professionals_email UNIQUE (email),
    CONSTRAINT ck_professionals_kyc CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    CONSTRAINT ck_professionals_avail CHECK (availability_status IN ('available', 'busy', 'offline'))
);

CREATE INDEX IF NOT EXISTS ix_professionals_trade ON professionals(trade);
CREATE INDEX IF NOT EXISTS ix_professionals_status ON professionals(is_online, availability_status);
CREATE INDEX IF NOT EXISTS ix_professionals_h3 ON professionals(h3_cell);

COMMENT ON TABLE professionals IS 'Verified service professionals dispatchable for home repair requests.';
COMMENT ON COLUMN professionals.id IS 'Sequential primary key.';
COMMENT ON COLUMN professionals.user_id IS 'Foreign key to master users table.';
COMMENT ON COLUMN professionals.professional_code IS 'Public sequential partner identifier formatted as YYYY + 5 digits (e.g. 202600001).';
COMMENT ON COLUMN professionals.name IS 'Full technician name.';
COMMENT ON COLUMN professionals.email IS 'Professional contact and login email.';
COMMENT ON COLUMN professionals.phone IS 'Verified professional mobile number.';
COMMENT ON COLUMN professionals.trade IS 'Primary trade specialization (electrician, plumber, etc.).';
COMMENT ON COLUMN professionals.experience_years IS 'Field experience in years.';
COMMENT ON COLUMN professionals.address IS 'Professional base address.';
COMMENT ON COLUMN professionals.city IS 'Operating city jurisdiction.';
COMMENT ON COLUMN professionals.state IS 'Operating state jurisdiction.';
COMMENT ON COLUMN professionals.kyc_status IS 'Background check status: pending, verified, rejected.';
COMMENT ON COLUMN professionals.rating IS 'Aggregate customer rating (1.00 to 5.00).';
COMMENT ON COLUMN professionals.completed_jobs IS 'Count of successfully finished jobs.';
COMMENT ON COLUMN professionals.is_online IS 'Online switch for receiving nearby dispatch broadcasts.';
COMMENT ON COLUMN professionals.availability_status IS 'Engagement state: available, busy, offline.';
COMMENT ON COLUMN professionals.wallet_balance IS 'Withdrawable earnings balance.';
COMMENT ON COLUMN professionals.currency IS 'Currency code for balance, default INR.';
COMMENT ON COLUMN professionals.lat IS 'Last reported GPS latitude.';
COMMENT ON COLUMN professionals.lng IS 'Last reported GPS longitude.';
COMMENT ON COLUMN professionals.h3_cell IS 'H3 geospatial index for rapid dispatch matching.';
COMMENT ON COLUMN professionals.last_location_at IS 'Timestamp of latest telemetry packet.';
COMMENT ON COLUMN professionals.created_at IS 'Registration timestamp.';
COMMENT ON COLUMN professionals.updated_at IS 'Last profile update timestamp.';

-- 5. Professional Documents
CREATE TABLE IF NOT EXISTS professional_documents (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    professional_id     BIGINT NOT NULL,
    document_type       VARCHAR(64) NOT NULL,
    file_url            TEXT NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_professional_documents PRIMARY KEY (id),
    CONSTRAINT fk_documents_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    CONSTRAINT ck_documents_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_documents_pro_id ON professional_documents(professional_id);

COMMENT ON TABLE professional_documents IS 'Verification documents uploaded by professionals for onboarding.';
COMMENT ON COLUMN professional_documents.id IS 'Sequential primary key.';
COMMENT ON COLUMN professional_documents.professional_id IS 'Foreign key to professionals table.';
COMMENT ON COLUMN professional_documents.document_type IS 'Aadhaar, PAN, trade certification, or driving license.';
COMMENT ON COLUMN professional_documents.file_url IS 'Encrypted storage URL of the uploaded document.';
COMMENT ON COLUMN professional_documents.status IS 'Verification outcome: pending, approved, rejected.';
COMMENT ON COLUMN professional_documents.verified_at IS 'Timestamp of administrative audit approval.';
COMMENT ON COLUMN professional_documents.created_at IS 'Document upload timestamp.';

-- 6. Service Categories
CREATE TABLE IF NOT EXISTS service_categories (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    slug                VARCHAR(64) NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    icon_name           VARCHAR(64),
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_service_categories PRIMARY KEY (id),
    CONSTRAINT uq_service_categories_slug UNIQUE (slug)
);

COMMENT ON TABLE service_categories IS 'Parent trade service categories (e.g. Electrician, Plumber).';
COMMENT ON COLUMN service_categories.id IS 'Sequential primary key.';
COMMENT ON COLUMN service_categories.slug IS 'Unique URL-safe category identifier.';
COMMENT ON COLUMN service_categories.name IS 'Display name of trade category.';
COMMENT ON COLUMN service_categories.description IS 'Customer-facing category scope summary.';
COMMENT ON COLUMN service_categories.icon_name IS 'Icon token name in design system.';
COMMENT ON COLUMN service_categories.sort_order IS 'Display ordering priority in navigation.';
COMMENT ON COLUMN service_categories.is_active IS 'Whether category is open for customer bookings.';
COMMENT ON COLUMN service_categories.created_at IS 'Category creation timestamp.';
COMMENT ON COLUMN service_categories.updated_at IS 'Last category modification timestamp.';

-- 7. Services (Catalog Offerings)
CREATE TABLE IF NOT EXISTS services (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    category_id         BIGINT NOT NULL,
    slug                VARCHAR(100) NOT NULL,
    name                VARCHAR(150) NOT NULL,
    description         TEXT,
    base_price          NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    estimated_duration_minutes INT NOT NULL DEFAULT 30,
    warranty_days       INT NOT NULL DEFAULT 30,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_services PRIMARY KEY (id),
    CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT,
    CONSTRAINT uq_services_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_services_category_id ON services(category_id);

COMMENT ON TABLE services IS 'Catalog offerings available for on-demand dispatch.';
COMMENT ON COLUMN services.id IS 'Sequential primary key.';
COMMENT ON COLUMN services.category_id IS 'Foreign key to parent service_categories.';
COMMENT ON COLUMN services.slug IS 'Unique URL-safe service identifier.';
COMMENT ON COLUMN services.name IS 'Service title displayed in catalog and checkout.';
COMMENT ON COLUMN services.description IS 'Technical details and common issues covered.';
COMMENT ON COLUMN services.base_price IS 'Starting base price in local currency.';
COMMENT ON COLUMN services.currency IS 'Currency code, default INR.';
COMMENT ON COLUMN services.estimated_duration_minutes IS 'Typical service completion time.';
COMMENT ON COLUMN services.warranty_days IS 'Service warranty coverage window in days.';
COMMENT ON COLUMN services.is_active IS 'Whether service is available for customer booking.';
COMMENT ON COLUMN services.created_at IS 'Catalog insertion timestamp.';
COMMENT ON COLUMN services.updated_at IS 'Catalog modification timestamp.';

-- 8. Service Requests (Central work order entity)
CREATE TABLE IF NOT EXISTS service_requests (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_code        VARCHAR(32) NOT NULL,
    request_ref                 VARCHAR(32),
    customer_id                 BIGINT,
    user_id                     BIGINT,
    user_email                  VARCHAR(255),
    user_name                   VARCHAR(150),
    user_phone                  VARCHAR(32),
    service_id                  BIGINT,
    service_title               VARCHAR(200) NOT NULL,
    category                    VARCHAR(64) NOT NULL,
    issue_type                  VARCHAR(150),
    problem_description         TEXT,
    problem_timing              VARCHAR(100),
    problem_frequency           VARCHAR(100),
    photos                      JSONB NOT NULL DEFAULT '[]'::jsonb,
    otp_code                    VARCHAR(10),
    otp_verified                BOOLEAN NOT NULL DEFAULT FALSE,
    otp_attempts                INT NOT NULL DEFAULT 0,
    otp_locked_until            TIMESTAMPTZ,
    otp_verified_at             TIMESTAMPTZ,
    completion_photos           JSONB NOT NULL DEFAULT '[]'::jsonb,
    completion_remarks          TEXT,
    rating                      INT,
    rating_feedback             TEXT,
    user_address                TEXT NOT NULL,
    lat                         DOUBLE PRECISION NOT NULL,
    lng                         DOUBLE PRECISION NOT NULL,
    h3_cell                     TEXT,
    h3_index_res9               TEXT,
    h3_res_8                    TEXT,
    status                      VARCHAR(32) NOT NULL DEFAULT 'open',
    accepted_quote_id           BIGINT,
    assigned_professional_id    BIGINT,
    started_at                  TIMESTAMPTZ,
    arrived_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    cancel_reason               TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_service_requests PRIMARY KEY (id),
    CONSTRAINT fk_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_requests_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
    CONSTRAINT fk_requests_pro FOREIGN KEY (assigned_professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
    CONSTRAINT uq_service_requests_code UNIQUE (service_request_code),
    CONSTRAINT ck_service_requests_status CHECK (LOWER(REPLACE(status, ' ', '_')) IN (
        'open', 'quoted', 'quoting', 'confirmed', 'accepted', 'en_route', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS ix_requests_customer_id ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS ix_requests_pro_id ON service_requests(assigned_professional_id);
CREATE INDEX IF NOT EXISTS ix_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS ix_requests_category ON service_requests(category);
CREATE INDEX IF NOT EXISTS ix_requests_h3 ON service_requests(h3_cell);

COMMENT ON TABLE service_requests IS 'Customer-initiated service requests with lifecycle state transitions.';
COMMENT ON COLUMN service_requests.id IS 'Sequential primary key.';
COMMENT ON COLUMN service_requests.service_request_code IS 'Public sequential reference number formatted as YYYY + 6 digits (e.g. 2026000001).';
COMMENT ON COLUMN service_requests.customer_id IS 'Foreign key to customers table.';
COMMENT ON COLUMN service_requests.service_id IS 'Foreign key to catalog services table.';
COMMENT ON COLUMN service_requests.service_title IS 'Name of the selected catalog service.';
COMMENT ON COLUMN service_requests.category IS 'Service category (electrician, plumber).';
COMMENT ON COLUMN service_requests.issue_type IS 'Specific problem symptom reported by customer.';
COMMENT ON COLUMN service_requests.problem_description IS 'Customer notes regarding the repair.';
COMMENT ON COLUMN service_requests.problem_timing IS 'When the problem first occurred.';
COMMENT ON COLUMN service_requests.problem_frequency IS 'How frequently the problem recurs.';
COMMENT ON COLUMN service_requests.user_address IS 'Confirmed delivery doorstep address.';
COMMENT ON COLUMN service_requests.lat IS 'Exact doorstep confirmed latitude coordinate.';
COMMENT ON COLUMN service_requests.lng IS 'Exact doorstep confirmed longitude coordinate.';
COMMENT ON COLUMN service_requests.h3_cell IS 'H3 geospatial index for progressive ring dispatch.';
COMMENT ON COLUMN service_requests.status IS 'Lifecycle state: open, quoted, confirmed, on_the_way, arrived, in_progress, completed, cancelled.';
COMMENT ON COLUMN service_requests.accepted_quote_id IS 'Foreign key to accepted quote.';
COMMENT ON COLUMN service_requests.assigned_professional_id IS 'Foreign key to engaged professional.';
COMMENT ON COLUMN service_requests.started_at IS 'Timestamp when work began (after door OTP).';
COMMENT ON COLUMN service_requests.arrived_at IS 'Timestamp when professional arrived at doorstep.';
COMMENT ON COLUMN service_requests.completed_at IS 'Timestamp of finished work order.';
COMMENT ON COLUMN service_requests.cancelled_at IS 'Timestamp of job cancellation.';
COMMENT ON COLUMN service_requests.cancel_reason IS 'Explanation recorded for cancellation.';
COMMENT ON COLUMN service_requests.created_at IS 'Request broadcast timestamp.';
COMMENT ON COLUMN service_requests.updated_at IS 'Last state transition timestamp.';

-- 9. Request Photos
CREATE TABLE IF NOT EXISTS request_photos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    photo_url           TEXT NOT NULL,
    photo_type          VARCHAR(32) NOT NULL DEFAULT 'customer_upload',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_request_photos PRIMARY KEY (id),
    CONSTRAINT fk_photos_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT ck_photos_type CHECK (photo_type IN ('customer_upload', 'diagnostic_snapshot'))
);

CREATE INDEX IF NOT EXISTS ix_request_photos_request_id ON request_photos(service_request_id);

COMMENT ON TABLE request_photos IS 'Diagnostic photos uploaded by customer during request creation.';
COMMENT ON COLUMN request_photos.id IS 'Sequential primary key.';
COMMENT ON COLUMN request_photos.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN request_photos.photo_url IS 'Storage URL of customer photo.';
COMMENT ON COLUMN request_photos.photo_type IS 'Upload category: customer_upload, diagnostic_snapshot.';
COMMENT ON COLUMN request_photos.created_at IS 'Photo upload timestamp.';

-- 10. Quotes
CREATE TABLE IF NOT EXISTS quotes (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id          BIGINT NOT NULL,
    professional_id             BIGINT NOT NULL,
    request_id                  BIGINT,
    agent_id                    BIGINT,
    agent_email                 VARCHAR(255),
    agent_name                  VARCHAR(150),
    agent_phone                 VARCHAR(32),
    amount                      NUMERIC(12,2) NOT NULL,
    currency                    VARCHAR(3) NOT NULL DEFAULT 'INR',
    estimated_duration_minutes  INT NOT NULL DEFAULT 30,
    eta_minutes                 INT NOT NULL DEFAULT 30,
    provider_note               TEXT,
    warranty_days               INT NOT NULL DEFAULT 30,
    message                     TEXT,
    status                      VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_quotes PRIMARY KEY (id),
    CONSTRAINT fk_quotes_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_quotes_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    CONSTRAINT uq_quotes_request_pro UNIQUE (service_request_id, professional_id),
    CONSTRAINT ck_quotes_amount CHECK (amount > 0),
    CONSTRAINT ck_quotes_status CHECK (LOWER(status) IN ('pending', 'accepted', 'rejected', 'expired', 'withdrawn', 'submitted', 'viewed', 'declined'))
);

CREATE INDEX IF NOT EXISTS ix_quotes_request_id ON quotes(service_request_id);
CREATE INDEX IF NOT EXISTS ix_quotes_pro_id ON quotes(professional_id);

COMMENT ON TABLE quotes IS 'Competitive bids submitted by nearby professionals for service requests.';
COMMENT ON COLUMN quotes.id IS 'Sequential primary key.';
COMMENT ON COLUMN quotes.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN quotes.professional_id IS 'Foreign key to bidding professionals table.';
COMMENT ON COLUMN quotes.amount IS 'Quoted repair price in INR (strictly positive).';
COMMENT ON COLUMN quotes.currency IS 'Currency code, default INR.';
COMMENT ON COLUMN quotes.estimated_duration_minutes IS 'Estimated job duration in minutes.';
COMMENT ON COLUMN quotes.message IS 'Introductory message and parts availability note from pro.';
COMMENT ON COLUMN quotes.status IS 'Quote state: pending, accepted, rejected, expired.';
COMMENT ON COLUMN quotes.created_at IS 'Bid submission timestamp.';
COMMENT ON COLUMN quotes.updated_at IS 'Last quote status update timestamp.';

-- 11. Door OTPs
CREATE TABLE IF NOT EXISTS door_otps (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    otp_code            VARCHAR(10) NOT NULL,
    attempts            INT NOT NULL DEFAULT 0,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    locked_until        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_door_otps PRIMARY KEY (id),
    CONSTRAINT fk_door_otps_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT uq_door_otps_request UNIQUE (service_request_id)
);

CREATE INDEX IF NOT EXISTS ix_door_otps_request_id ON door_otps(service_request_id);

COMMENT ON TABLE door_otps IS 'Four-digit customer door verification codes ensuring physical technician presence.';
COMMENT ON COLUMN door_otps.id IS 'Sequential primary key.';
COMMENT ON COLUMN door_otps.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN door_otps.otp_code IS '4-digit verification code revealed strictly after arrival.';
COMMENT ON COLUMN door_otps.attempts IS 'Failed verification attempt counter.';
COMMENT ON COLUMN door_otps.is_verified IS 'True once correct code is verified on doorstep.';
COMMENT ON COLUMN door_otps.verified_at IS 'Timestamp of physical door verification.';
COMMENT ON COLUMN door_otps.locked_until IS 'Lockout timestamp after 5 failed entries.';
COMMENT ON COLUMN door_otps.created_at IS 'Code generation timestamp.';
COMMENT ON COLUMN door_otps.updated_at IS 'Last verification update timestamp.';

-- 12. Completion Proofs
CREATE TABLE IF NOT EXISTS completion_proofs (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    professional_id     BIGINT NOT NULL,
    photo_urls          JSONB NOT NULL DEFAULT '[]'::jsonb,
    remarks             TEXT,
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_completion_proofs PRIMARY KEY (id),
    CONSTRAINT fk_proofs_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_proofs_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_completion_proofs_request_id ON completion_proofs(service_request_id);
CREATE INDEX IF NOT EXISTS ix_completion_proofs_pro_id ON completion_proofs(professional_id);

COMMENT ON TABLE completion_proofs IS 'Photographic proof of completed work required before job completion.';
COMMENT ON COLUMN completion_proofs.id IS 'Sequential primary key.';
COMMENT ON COLUMN completion_proofs.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN completion_proofs.professional_id IS 'Foreign key to professionals table.';
COMMENT ON COLUMN completion_proofs.photo_urls IS 'JSON array of 1-4 finished repair photo URLs.';
COMMENT ON COLUMN completion_proofs.remarks IS 'Technician closing notes on work executed.';
COMMENT ON COLUMN completion_proofs.verified_at IS 'Timestamp of proof validation.';
COMMENT ON COLUMN completion_proofs.created_at IS 'Proof submission timestamp.';

-- 13. Location Updates (Ephemeral Breadcrumbs)
CREATE TABLE IF NOT EXISTS location_updates (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    professional_id     BIGINT NOT NULL,
    lat                 DOUBLE PRECISION NOT NULL,
    lng                 DOUBLE PRECISION NOT NULL,
    accuracy            DOUBLE PRECISION,
    heading             DOUBLE PRECISION,
    speed               DOUBLE PRECISION,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_location_updates PRIMARY KEY (id),
    CONSTRAINT fk_location_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_location_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_location_request_id ON location_updates(service_request_id);

COMMENT ON TABLE location_updates IS 'Real-time GPS telemetry breadcrumbs logged during en-route tracking.';
COMMENT ON COLUMN location_updates.id IS 'Sequential primary key.';
COMMENT ON COLUMN location_updates.service_request_id IS 'Foreign key to active service_requests.';
COMMENT ON COLUMN location_updates.professional_id IS 'Foreign key to broadcasting professionals.';
COMMENT ON COLUMN location_updates.lat IS 'Reported latitude coordinate.';
COMMENT ON COLUMN location_updates.lng IS 'Reported longitude coordinate.';
COMMENT ON COLUMN location_updates.accuracy IS 'GPS horizontal accuracy in meters.';
COMMENT ON COLUMN location_updates.heading IS 'Vehicle heading angle in degrees (0 to 360).';
COMMENT ON COLUMN location_updates.speed IS 'Current vehicle velocity in meters per second.';
COMMENT ON COLUMN location_updates.created_at IS 'Telemetry timestamp.';

-- 14. Payouts (Wallet Ledgers & Settlements)
CREATE TABLE IF NOT EXISTS payouts (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    professional_id     BIGINT NOT NULL,
    gross_amount        NUMERIC(12,2) NOT NULL,
    platform_fee        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_payout          NUMERIC(12,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    status              VARCHAR(32) NOT NULL DEFAULT 'credited',
    balance_after       NUMERIC(12,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payouts PRIMARY KEY (id),
    CONSTRAINT fk_payouts_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_payouts_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    CONSTRAINT ck_payouts_status CHECK (status IN ('pending', 'credited', 'settled', 'reversed'))
);

CREATE INDEX IF NOT EXISTS ix_payouts_request_id ON payouts(service_request_id);
CREATE INDEX IF NOT EXISTS ix_payouts_pro_id ON payouts(professional_id);

COMMENT ON TABLE payouts IS 'Financial earnings ledger recording gross quotes, commission, and net payouts.';
COMMENT ON COLUMN payouts.id IS 'Sequential primary key.';
COMMENT ON COLUMN payouts.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN payouts.professional_id IS 'Foreign key to professionals table.';
COMMENT ON COLUMN payouts.gross_amount IS 'Total accepted quote value.';
COMMENT ON COLUMN payouts.platform_fee IS 'Platform service commission fee (default 15%).';
COMMENT ON COLUMN payouts.net_payout IS 'Net earnings credited to professional wallet (85%).';
COMMENT ON COLUMN payouts.currency IS 'Currency code, default INR.';
COMMENT ON COLUMN payouts.status IS 'Settlement state: pending, credited, settled, reversed.';
COMMENT ON COLUMN payouts.balance_after IS 'Professional wallet balance after transaction.';
COMMENT ON COLUMN payouts.created_at IS 'Earnings transaction timestamp.';

-- 15. Feedback & Ratings
CREATE TABLE IF NOT EXISTS feedback (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    service_request_id  BIGINT NOT NULL,
    customer_id         BIGINT NOT NULL,
    professional_id     BIGINT NOT NULL,
    rating              INT NOT NULL,
    comment             TEXT,
    tags                JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_feedback PRIMARY KEY (id),
    CONSTRAINT fk_feedback_request FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_pro FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
    CONSTRAINT ck_feedback_rating CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS ix_feedback_pro_id ON feedback(professional_id);
CREATE INDEX IF NOT EXISTS ix_feedback_customer_id ON feedback(customer_id);

COMMENT ON TABLE feedback IS 'Customer ratings and written reviews after completed service.';
COMMENT ON COLUMN feedback.id IS 'Sequential primary key.';
COMMENT ON COLUMN feedback.service_request_id IS 'Foreign key to service_requests table.';
COMMENT ON COLUMN feedback.customer_id IS 'Foreign key to rating customers table.';
COMMENT ON COLUMN feedback.professional_id IS 'Foreign key to rated professionals table.';
COMMENT ON COLUMN feedback.rating IS 'Customer star score (strictly 1 to 5).';
COMMENT ON COLUMN feedback.comment IS 'Customer review remarks.';
COMMENT ON COLUMN feedback.tags IS 'Structured review tag chips (e.g. On-time, Polite).';
COMMENT ON COLUMN feedback.created_at IS 'Feedback submission timestamp.';

-- 16. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id             BIGINT NOT NULL,
    title               VARCHAR(200) NOT NULL,
    body                TEXT NOT NULL,
    type                VARCHAR(50) NOT NULL,
    metadata            JSONB DEFAULT '{}'::jsonb,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_notifications PRIMARY KEY (id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(user_id, is_read);

COMMENT ON TABLE notifications IS 'Transactional alerts delivered to customers and professionals.';
COMMENT ON COLUMN notifications.id IS 'Sequential primary key.';
COMMENT ON COLUMN notifications.user_id IS 'Foreign key to recipient in users table.';
COMMENT ON COLUMN notifications.title IS 'Alert title string.';
COMMENT ON COLUMN notifications.body IS 'Detailed notification message.';
COMMENT ON COLUMN notifications.type IS 'Event category token (quote_received, pro_arrived, etc.).';
COMMENT ON COLUMN notifications.metadata IS 'Contextual IDs or action links.';
COMMENT ON COLUMN notifications.is_read IS 'Read receipt flag.';
COMMENT ON COLUMN notifications.created_at IS 'Notification creation timestamp.';

-- ==============================================================================
-- Service Requests Automation Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_service_requests_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_cust_id BIGINT;
    v_cust_code TEXT;
BEGIN
    -- Synchronize service_request_code and request_ref
    IF NEW.service_request_code IS NULL OR NEW.service_request_code = '' THEN
        IF NEW.request_ref IS NOT NULL AND NEW.request_ref <> '' THEN
            NEW.service_request_code := NEW.request_ref;
        ELSE
            NEW.service_request_code := next_entity_code('service_request', 6);
        END IF;
    END IF;
    IF NEW.request_ref IS NULL OR NEW.request_ref = '' THEN
        NEW.request_ref := NEW.service_request_code;
    END IF;

    -- Synchronize h3
    IF NEW.h3_cell IS NULL AND NEW.h3_index_res9 IS NOT NULL THEN
        NEW.h3_cell := NEW.h3_index_res9;
    END IF;
    IF NEW.h3_index_res9 IS NULL AND NEW.h3_cell IS NOT NULL THEN
        NEW.h3_index_res9 := NEW.h3_cell;
    END IF;

    -- Auto-resolve or create customer profile if customer_id not supplied
    IF NEW.customer_id IS NULL AND (NEW.user_email IS NOT NULL OR NEW.user_phone IS NOT NULL) THEN
        SELECT id INTO v_cust_id FROM customers WHERE email = NEW.user_email LIMIT 1;
        IF v_cust_id IS NULL THEN
            v_cust_code := next_entity_code('customer', 5);
            INSERT INTO customers (customer_code, name, email, phone, default_address, lat, lng, h3_cell)
            VALUES (v_cust_code, COALESCE(NEW.user_name, 'Customer'), COALESCE(NEW.user_email, 'customer@nivaarofix.test'), NEW.user_phone, NEW.user_address, NEW.lat, NEW.lng, NEW.h3_cell)
            RETURNING id INTO v_cust_id;
        END IF;
        NEW.customer_id := v_cust_id;
    END IF;

    -- Normalize status to lowercase
    NEW.status := LOWER(COALESCE(NEW.status, 'open'));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_requests_before_insert ON service_requests;
CREATE TRIGGER trg_service_requests_before_insert
    BEFORE INSERT ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_service_requests_before_insert();

CREATE OR REPLACE FUNCTION fn_service_requests_after_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.otp_code IS NOT NULL AND NEW.otp_code <> '' THEN
        INSERT INTO door_otps (service_request_id, otp_code, expires_at)
        VALUES (NEW.id, NEW.otp_code, CURRENT_TIMESTAMP + INTERVAL '4 hours')
        ON CONFLICT (service_request_id) DO UPDATE SET otp_code = EXCLUDED.otp_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_requests_after_insert ON service_requests;
CREATE TRIGGER trg_service_requests_after_insert
    AFTER INSERT ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_service_requests_after_insert();

-- ==============================================================================
-- Compatibility Tables & Sync Triggers for Auth & Agent Endpoints
-- ==============================================================================

CREATE TABLE IF NOT EXISTS agent_login (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partner_id          VARCHAR(32) NOT NULL,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    phone               VARCHAR(32),
    trade               VARCHAR(64) NOT NULL DEFAULT 'electrician',
    experience_years    INT NOT NULL DEFAULT 0,
    dob                 VARCHAR(32),
    state               VARCHAR(100) DEFAULT 'Karnataka',
    city                VARCHAR(100) DEFAULT 'Bengaluru',
    address             TEXT,
    password            VARCHAR(255),
    auth_provider       VARCHAR(32) DEFAULT 'partner_code',
    is_online           BOOLEAN NOT NULL DEFAULT FALSE,
    is_phone_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    kyc_status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    rating              NUMERIC(3,2),
    completed_jobs      INT NOT NULL DEFAULT 0,
    wallet_balance      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    avatar_url          TEXT,
    google_id           VARCHAR(128),
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    h3_index_res9       TEXT,
    h3_res_8            TEXT,
    location_accuracy_m DOUBLE PRECISION DEFAULT 10,
    availability_status VARCHAR(32) NOT NULL DEFAULT 'available',
    last_login_at       TIMESTAMPTZ,
    location_updated_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_sync_agent_login_to_pro()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id BIGINT;
BEGIN
    INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
    VALUES (NEW.email, NEW.phone, NEW.password, 'professional', COALESCE(NEW.auth_provider, 'local'), COALESCE(NEW.is_phone_verified, false))
    ON CONFLICT (email) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, users.phone),
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_user_id;

    INSERT INTO professionals (
        user_id, professional_code, name, email, phone, trade, experience_years,
        address, city, state, kyc_status, rating, completed_jobs, is_online,
        availability_status, wallet_balance, lat, lng, h3_cell, updated_at
    ) VALUES (
        v_user_id, NEW.partner_id, NEW.name, NEW.email, NEW.phone, NEW.trade,
        COALESCE(NEW.experience_years, 0), NEW.address, NEW.city, NEW.state,
        LOWER(COALESCE(NEW.kyc_status, 'pending')), NEW.rating, COALESCE(NEW.completed_jobs, 0),
        COALESCE(NEW.is_online, false), LOWER(COALESCE(NEW.availability_status, 'available')),
        COALESCE(NEW.wallet_balance, 0.00), NEW.lat, NEW.lng, NEW.h3_index_res9, CURRENT_TIMESTAMP
    )
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, professionals.phone),
        trade = EXCLUDED.trade,
        experience_years = EXCLUDED.experience_years,
        address = COALESCE(EXCLUDED.address, professionals.address),
        city = COALESCE(EXCLUDED.city, professionals.city),
        state = COALESCE(EXCLUDED.state, professionals.state),
        is_online = EXCLUDED.is_online,
        availability_status = EXCLUDED.availability_status,
        rating = COALESCE(EXCLUDED.rating, professionals.rating),
        completed_jobs = EXCLUDED.completed_jobs,
        wallet_balance = EXCLUDED.wallet_balance,
        lat = COALESCE(EXCLUDED.lat, professionals.lat),
        lng = COALESCE(EXCLUDED.lng, professionals.lng),
        h3_cell = COALESCE(EXCLUDED.h3_cell, professionals.h3_cell),
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_agent_login ON agent_login;
CREATE TRIGGER trg_sync_agent_login
    AFTER INSERT OR UPDATE ON agent_login
    FOR EACH ROW EXECUTE FUNCTION fn_sync_agent_login_to_pro();

CREATE TABLE IF NOT EXISTS user_login (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    phone               VARCHAR(32),
    dob                 VARCHAR(32),
    state               VARCHAR(100),
    city                VARCHAR(100),
    address             TEXT,
    password            VARCHAR(255),
    auth_provider       VARCHAR(32) DEFAULT 'email',
    is_verified         BOOLEAN NOT NULL DEFAULT TRUE,
    is_phone_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url          TEXT,
    google_id           VARCHAR(128),
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_sync_user_login_to_cust()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id BIGINT;
    v_cust_code TEXT;
BEGIN
    INSERT INTO users (email, phone, password_hash, role, auth_provider, is_phone_verified)
    VALUES (NEW.email, NEW.phone, NEW.password, 'customer', COALESCE(NEW.auth_provider, 'local'), COALESCE(NEW.is_phone_verified, false))
    ON CONFLICT (email) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, users.phone),
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_user_id;

    SELECT customer_code INTO v_cust_code FROM customers WHERE email = NEW.email;
    IF v_cust_code IS NULL THEN
        v_cust_code := next_entity_code('customer', 5);
    END IF;

    INSERT INTO customers (
        user_id, customer_code, name, email, phone, default_address, lat, lng, updated_at
    ) VALUES (
        v_user_id, v_cust_code, NEW.name, NEW.email, NEW.phone, NEW.address, NEW.lat, NEW.lng, CURRENT_TIMESTAMP
    )
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        default_address = COALESCE(EXCLUDED.default_address, customers.default_address),
        lat = COALESCE(EXCLUDED.lat, customers.lat),
        lng = COALESCE(EXCLUDED.lng, customers.lng),
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_login ON user_login;
CREATE TRIGGER trg_sync_user_login
    AFTER INSERT OR UPDATE ON user_login
    FOR EACH ROW EXECUTE FUNCTION fn_sync_user_login_to_cust();

-- Quotes Sync Trigger
CREATE OR REPLACE FUNCTION fn_quotes_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_pro_id BIGINT;
BEGIN
    IF NEW.service_request_id IS NULL AND NEW.request_id IS NOT NULL THEN
        NEW.service_request_id := NEW.request_id;
    END IF;
    IF NEW.request_id IS NULL AND NEW.service_request_id IS NOT NULL THEN
        NEW.request_id := NEW.service_request_id;
    END IF;

    -- Look up professional_id from professionals table by email or agent_id
    IF NEW.professional_id IS NULL OR NOT EXISTS (SELECT 1 FROM professionals WHERE id = NEW.professional_id) THEN
        IF NEW.agent_email IS NOT NULL THEN
            SELECT id INTO v_pro_id FROM professionals WHERE email = NEW.agent_email LIMIT 1;
        END IF;
        IF v_pro_id IS NULL AND NEW.agent_id IS NOT NULL THEN
            SELECT p.id INTO v_pro_id FROM professionals p JOIN agent_login a ON a.email = p.email WHERE a.id = NEW.agent_id LIMIT 1;
        END IF;
        IF v_pro_id IS NOT NULL THEN
            NEW.professional_id := v_pro_id;
        ELSIF NEW.agent_id IS NOT NULL THEN
            NEW.professional_id := NEW.agent_id;
        END IF;
    END IF;

    IF NEW.agent_id IS NULL THEN
        NEW.agent_id := NEW.professional_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quotes_sync ON quotes;
CREATE TRIGGER trg_quotes_sync
    BEFORE INSERT OR UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION fn_quotes_sync();

-- Wallet Transactions compatibility table & sync trigger
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id            BIGINT NOT NULL,
    request_ref         VARCHAR(32),
    type                VARCHAR(32) NOT NULL DEFAULT 'credit',
    amount              NUMERIC(12,2) NOT NULL,
    balance_after       NUMERIC(12,2) NOT NULL,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_sync_wallet_transaction_to_payout()
RETURNS TRIGGER AS $$
DECLARE
    v_sr_id BIGINT;
    v_pro_id BIGINT;
BEGIN
    SELECT id INTO v_sr_id FROM service_requests WHERE service_request_code = NEW.request_ref OR request_ref = NEW.request_ref LIMIT 1;
    
    IF EXISTS (SELECT 1 FROM professionals WHERE id = NEW.agent_id) THEN
        v_pro_id := NEW.agent_id;
    ELSE
        SELECT p.id INTO v_pro_id FROM professionals p JOIN agent_login a ON a.email = p.email WHERE a.id = NEW.agent_id LIMIT 1;
        IF v_pro_id IS NULL THEN
            SELECT id INTO v_pro_id FROM professionals ORDER BY id ASC LIMIT 1;
        END IF;
    END IF;

    INSERT INTO payouts (
        service_request_id, professional_id, gross_amount, platform_fee, net_payout, currency, status, balance_after
    ) VALUES (
        COALESCE(v_sr_id, 1), COALESCE(v_pro_id, 1), NEW.amount, 0.00, NEW.amount, 'INR', 'credited', NEW.balance_after
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wallet_transaction ON wallet_transactions;
CREATE TRIGGER trg_sync_wallet_transaction
    AFTER INSERT ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_wallet_transaction_to_payout();

-- Reviews compatibility table & sync trigger
CREATE TABLE IF NOT EXISTS reviews (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id          BIGINT NOT NULL,
    customer_id         BIGINT,
    provider_id         BIGINT NOT NULL,
    rating              INT NOT NULL,
    feedback            TEXT,
    tags                JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_sync_reviews_to_feedback()
RETURNS TRIGGER AS $$
DECLARE
    v_cust_id BIGINT := NEW.customer_id;
    v_pro_id BIGINT;
BEGIN
    IF v_cust_id IS NULL THEN
        SELECT customer_id INTO v_cust_id FROM service_requests WHERE id = NEW.request_id LIMIT 1;
    END IF;

    IF EXISTS (SELECT 1 FROM professionals WHERE id = NEW.provider_id) THEN
        v_pro_id := NEW.provider_id;
    ELSE
        SELECT p.id INTO v_pro_id FROM professionals p JOIN agent_login a ON a.email = p.email WHERE a.id = NEW.provider_id LIMIT 1;
        IF v_pro_id IS NULL THEN
            SELECT id INTO v_pro_id FROM professionals ORDER BY id ASC LIMIT 1;
        END IF;
    END IF;

    INSERT INTO feedback (
        service_request_id, customer_id, professional_id, rating, comment, tags
    ) VALUES (
        NEW.request_id, COALESCE(v_cust_id, 1), COALESCE(v_pro_id, 1), NEW.rating, NEW.feedback, COALESCE(NEW.tags, '[]'::jsonb)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_reviews ON reviews;
CREATE TRIGGER trg_sync_reviews
    AFTER INSERT ON reviews
    FOR EACH ROW EXECUTE FUNCTION fn_sync_reviews_to_feedback();

-- Operational Audit & Event Tables
CREATE TABLE IF NOT EXISTS job_events (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT,
    request_id          BIGINT,
    actor_type          VARCHAR(50),
    actor_id            VARCHAR(255),
    event_type          VARCHAR(100),
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_photos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT,
    photo_url           TEXT,
    photo_type          VARCHAR(50) DEFAULT 'completion_proof',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_media (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT,
    media_id            VARCHAR(64),
    media_type          VARCHAR(32),
    url                 TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS request_dispatches (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id          BIGINT,
    agent_id            BIGINT,
    status              VARCHAR(50) DEFAULT 'dispatched',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT,
    customer_id         BIGINT,
    professional_id     BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id     BIGINT,
    sender_type         VARCHAR(50),
    sender_id           BIGINT,
    body                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT,
    amount              NUMERIC(12,2),
    status              VARCHAR(50) DEFAULT 'success',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professional_gps_log (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professional_id     BIGINT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


