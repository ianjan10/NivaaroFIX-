/**
 * ============================================================
 *  NivaaroFix — PostgreSQL Database Engine & Schema v2.0
 * ============================================================
 *
 *  Naming Conventions:
 *    - Tables       : snake_case, plural nouns
 *    - Primary keys : id SERIAL PRIMARY KEY
 *    - Foreign keys : {singular_table}_id INT REFERENCES {table}(id)
 *    - Timestamps   : created_at, updated_at (auto-managed via trigger)
 *    - Booleans     : is_{state}  (e.g. is_verified, is_online)
 *
 *  Core Interconnected Tables:
 *    1. customers                  - Customer identity, addresses & credentials
 *    2. professionals              - Service technician/partner identity & state
 *    3. service_categories         - Main trades (Electrician, Plumber, etc.)
 *    4. services                   - Specific catalog services with pricing & duration
 *    5. professional_skills        - Skill mappings between professionals and services
 *    6. professional_gps_log       - Granular GPS movement history & telemetry
 *    7. customer_saved_addresses   - Saved user delivery/service locations
 *    8. media_files                - Central image/file storage repository
 *    9. service_requests           - Customer job bookings & dispatch requests
 *   10. request_dispatches         - Geo-dispatch waves sent to nearby professionals
 *   11. quotes                     - Price bids and estimates from professionals
 *   12. bookings                   - Confirmed service engagements & lifecycle
 *   13. booking_media              - Before/After/Problem photos linked to bookings
 *   14. conversations              - Real-time live messaging channels per booking
 *   15. messages                   - Chat messages (text, image, location)
 *   16. professional_wallets       - Authoritative financial wallet balances
 *   17. wallet_transactions        - Append-only financial ledger
 *   18. payments                   - Gateway transaction records
 *   19. reviews                    - Customer ratings and feedback
 *   20. professional_documents     - KYC verification documents
 * ============================================================
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'root',
  database: process.env.PG_DATABASE || 'nivaarofix_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔗 Connecting to nivaarofix_db — initializing Schema v2.0...');

    // 1. Extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS cube;').catch(() => {});
    await client.query('CREATE EXTENSION IF NOT EXISTS earthdistance;').catch(() => {});

    // 2. Shared trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 3. Service Categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id            VARCHAR(60) PRIMARY KEY,
        slug          VARCHAR(60) UNIQUE NOT NULL,
        name          VARCHAR(120),
        display_name  VARCHAR(120) NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        sort_order    INT NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS name VARCHAR(120);
      ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
      ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
      ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

      UPDATE service_categories SET display_name = COALESCE(display_name, name, id) WHERE display_name IS NULL;
      UPDATE service_categories SET name = COALESCE(name, display_name, id) WHERE name IS NULL;

      INSERT INTO service_categories (id, slug, name, display_name, description, sort_order) VALUES
        ('electrician', 'electrician', 'Certified Electrician', 'Certified Electrician', 'Home electrical repairs, circuit breakers, lighting and wiring', 1),
        ('plumber',     'plumber',     'Master Plumber',        'Master Plumber',        'Pipe leakages, blockage clearing, sanitary and water pump fixtures', 2),
        ('carpenter',   'carpenter',   'Artisan Carpenter',     'Artisan Carpenter',     'Furniture assembly, door fixtures, lock repairs and woodwork', 3),
        ('appliance',   'appliance',   'Appliance Specialist',  'Appliance Specialist',  'Washing machine, refrigerator and microwave repair', 4),
        ('painter',     'painter',     'Interior Painter',      'Interior Painter',      'Wall damp-proofing, touch-ups and home repainting', 5)
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order;
    `);

    // 4. Services Catalog
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id                      VARCHAR(120) PRIMARY KEY,
        category_id             VARCHAR(60) NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
        title                   VARCHAR(220) NOT NULL,
        short_description       TEXT,
        short_desc              TEXT,
        base_price              NUMERIC(10,2) NOT NULL DEFAULT 149.00,
        starting_price          NUMERIC(10,2) DEFAULT 149.00,
        original_price          NUMERIC(10,2),
        min_quote_price         NUMERIC(10,2),
        max_quote_price         NUMERIC(10,2),
        duration_minutes        INT NOT NULL DEFAULT 30,
        warranty_days           INT NOT NULL DEFAULT 30,
        badge_label             VARCHAR(60) DEFAULT 'Express 30 Mins',
        badge                   VARCHAR(60) DEFAULT 'Express 30 Mins',
        avg_rating              NUMERIC(3,2) NOT NULL DEFAULT 4.90,
        rating                  NUMERIC(3,2) DEFAULT 4.90,
        total_reviews           INT NOT NULL DEFAULT 0,
        reviews_count           INT NOT NULL DEFAULT 0,
        is_popular              BOOLEAN NOT NULL DEFAULT false,
        is_active               BOOLEAN NOT NULL DEFAULT true,
        keywords_json           JSONB NOT NULL DEFAULT '[]',
        keywords                JSONB NOT NULL DEFAULT '[]',
        common_issues_json      JSONB NOT NULL DEFAULT '[]',
        common_issues           JSONB NOT NULL DEFAULT '[]',
        created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE services ADD COLUMN IF NOT EXISTS short_description TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS short_desc TEXT;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2) DEFAULT 149.00;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS starting_price NUMERIC(10,2) DEFAULT 149.00;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS min_quote_price NUMERIC(10,2);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS max_quote_price NUMERIC(10,2);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS badge_label VARCHAR(60);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS badge VARCHAR(60);
      ALTER TABLE services ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) DEFAULT 4.90;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 4.90;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS total_reviews INT DEFAULT 0;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS reviews_count INT DEFAULT 0;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS keywords_json JSONB DEFAULT '[]';
      ALTER TABLE services ADD COLUMN IF NOT EXISTS common_issues_json JSONB DEFAULT '[]';

      INSERT INTO services (id, category_id, title, short_description, short_desc, base_price, starting_price, original_price, duration_minutes, warranty_days, badge_label, badge, is_popular, min_quote_price, max_quote_price) VALUES
        ('switchboard-socket-repair',  'electrician', 'Switchboard, Socket & Power Point Repair',            'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.', 'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.', 149.00, 149.00, 249.00, 30, 90, 'Express 30 Mins', 'Express 30 Mins', true,  100.00,  500.00),
        ('mcb-repair',                 'electrician', 'Switchboard Sparks, Sockets & MCB Diagnostics',       'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.', 'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.', 149.00, 149.00, 249.00, 30, 90, 'Express 30 Mins', 'Express 30 Mins', true,  100.00,  500.00),
        ('mcb-fuse-short-circuit',     'electrician', 'MCB Tripping, Short-Circuit & Fuse Diagnostics',      'High-precision multimeter short-circuit detection, faulty MCB/RCCB replacement & load balancing.', 'High-precision multimeter short-circuit detection, faulty MCB/RCCB replacement & load balancing.', 199.00, 199.00, 350.00, 40, 90, 'Emergency Safe',  'Emergency Safe',  true,  150.00,  800.00),
        ('fan-chandelier-install',     'electrician', 'Ceiling Fan, Chandelier & Light Fixture Installation', 'Heavy chandelier mounting, smart ceiling fan installation, concealed spot lighting.', 'Heavy chandelier mounting, smart ceiling fan installation, concealed spot lighting.', 179.00, 179.00, 299.00, 35, 90, 'Popular',         'Popular',         true,  120.00,  600.00),
        ('inverter-wiring-setup',      'electrician', 'Home Inverter, Battery & Heavy Wiring Setup',          'Sine-wave inverter battery wiring, changeover switch installation, dedicated earthing test.', 'Sine-wave inverter battery wiring, changeover switch installation, dedicated earthing test.', 349.00, 349.00, 599.00, 60, 180,'Heavy Duty',      'Heavy Duty',      false, 250.00, 1200.00),
        ('tap-faucet-mixer-repair',    'plumber',     'Tap, Faucet & Diverter Mixer Valve Repair',            'Dripping tap repair, cartridge replacement, wall-mounted quarter-turn mixer installation.', 'Dripping tap repair, cartridge replacement, wall-mounted quarter-turn mixer installation.', 129.00, 129.00, 199.00, 25, 90, 'Express 30 Mins', 'Express 30 Mins', true,   80.00,  400.00),
        ('drain-pipe-blockage-clear',  'plumber',     'Drain Blockage & Clogged Sewer Line Clearance',        'High-pressure mechanized rotary snake unclogging for kitchen sinks, bathroom floor traps & main lines.', 'High-pressure mechanized rotary snake unclogging for kitchen sinks, bathroom floor traps & main lines.', 249.00, 249.00, 450.00, 45, 90, 'Instant Relief',  'Instant Relief',  true,  150.00,  700.00),
        ('toilet-commode-cistern-fix', 'plumber',     'Western / Indian Commode & Flush Tank Repair',         'Concealed dual-flush cistern repair, leaking inlet ball valve fix, wax ring seal replacement.', 'Concealed dual-flush cistern repair, leaking inlet ball valve fix, wax ring seal replacement.', 199.00, 199.00, 349.00, 35, 90, 'Hygienic Pro',    'Hygienic Pro',    false, 120.00,  600.00),
        ('overhead-tank-water-pump',   'plumber',     'Water Tank, Motor Pump & Pressure Booster Setup',      'Automatic water level float switch, 1HP booster pump setup, concealed CPVC main pipeline leak fix.', 'Automatic water level float switch, 1HP booster pump setup, concealed CPVC main pipeline leak fix.', 399.00, 399.00, 699.00, 60, 180,'Heavy Duty',      'Heavy Duty',      false, 250.00, 1500.00),
        ('general-service',            'plumber',     'General Inspection, Diagnostics & On-Demand Repair',   'Comprehensive on-site diagnosis and repair by certified multi-trade technicians.', 'Comprehensive on-site diagnosis and repair by certified multi-trade technicians.', 149.00, 149.00, 249.00, 30, 30, 'Standard',        'Standard',        false,  50.00,  2000.00)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        base_price = EXCLUDED.base_price,
        starting_price = EXCLUDED.starting_price;
    `);

    // 4.1 Core Auth Tables: user_login & agent_login
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_login (
        id                SERIAL PRIMARY KEY,
        name              VARCHAR(150) NOT NULL,
        email             VARCHAR(150) UNIQUE NOT NULL,
        phone             VARCHAR(25),
        dob               VARCHAR(50),
        state             VARCHAR(100),
        city              VARCHAR(100),
        address           TEXT,
        password          VARCHAR(255),
        auth_provider     VARCHAR(50) DEFAULT 'email',
        google_id         VARCHAR(150),
        avatar_url        TEXT,
        is_verified       BOOLEAN DEFAULT true,
        is_phone_verified BOOLEAN DEFAULT false,
        last_login_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_login_email ON user_login(email);

      CREATE TABLE IF NOT EXISTS agent_login (
        id                  SERIAL PRIMARY KEY,
        partner_id          VARCHAR(50) UNIQUE NOT NULL,
        name                VARCHAR(150) NOT NULL,
        email               VARCHAR(150) UNIQUE NOT NULL,
        phone               VARCHAR(25),
        trade               VARCHAR(50) DEFAULT 'both',
        experience_years    INT DEFAULT 0,
        dob                 VARCHAR(50),
        state               VARCHAR(100),
        city                VARCHAR(100),
        address             TEXT,
        password            VARCHAR(255),
        auth_provider       VARCHAR(50) DEFAULT 'agent_id',
        google_id           VARCHAR(150),
        avatar_url          TEXT,
        kyc_status          VARCHAR(50) DEFAULT 'Pending',
        rating              NUMERIC(3,2),
        completed_jobs      INT DEFAULT 0,
        is_online           BOOLEAN DEFAULT true,
        wallet_balance      NUMERIC(12,2) DEFAULT 0.00,
        availability_status VARCHAR(50) DEFAULT 'AVAILABLE',
        location_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        location_accuracy_m DOUBLE PRECISION DEFAULT 10,
        h3_res_8            VARCHAR(30),
        lat                 DOUBLE PRECISION,
        lng                 DOUBLE PRECISION,
        h3_index_res9       VARCHAR(30),
        is_phone_verified   BOOLEAN DEFAULT false,
        is_verified         BOOLEAN DEFAULT false,
        last_login_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_login_email ON agent_login(email);
      CREATE INDEX IF NOT EXISTS idx_agent_login_partner ON agent_login(partner_id);
    `);

    // 5. Customers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id                SERIAL PRIMARY KEY,
        full_name         VARCHAR(150) NOT NULL,
        email             VARCHAR(150) UNIQUE NOT NULL,
        phone             VARCHAR(20),
        date_of_birth     DATE,
        avatar_url        TEXT,
        state             VARCHAR(100),
        city              VARCHAR(100),
        address           TEXT,
        password_hash     VARCHAR(255),
        auth_provider     VARCHAR(30) NOT NULL DEFAULT 'email',
        google_id         VARCHAR(120),
        is_email_verified BOOLEAN NOT NULL DEFAULT false,
        is_phone_verified BOOLEAN NOT NULL DEFAULT false,
        last_login_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customers_email  ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_customers_google ON customers(google_id);
    `);

    // 6. Professionals Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS professionals (
        id                    SERIAL PRIMARY KEY,
        partner_code          VARCHAR(20) UNIQUE NOT NULL,
        full_name             VARCHAR(150) NOT NULL,
        email                 VARCHAR(150) UNIQUE NOT NULL,
        phone                 VARCHAR(20),
        date_of_birth         DATE,
        avatar_url            TEXT,
        state                 VARCHAR(100),
        city                  VARCHAR(100),
        address               TEXT,
        trade                 VARCHAR(50) NOT NULL DEFAULT 'electrician',
        experience_years      INT NOT NULL DEFAULT 0,
        password_hash         VARCHAR(255),
        auth_provider         VARCHAR(30) NOT NULL DEFAULT 'agent_id',
        google_id             VARCHAR(120),
        is_email_verified     BOOLEAN NOT NULL DEFAULT false,
        is_phone_verified     BOOLEAN NOT NULL DEFAULT false,
        kyc_status            VARCHAR(30) NOT NULL DEFAULT 'pending',
        is_online             BOOLEAN NOT NULL DEFAULT false,
        availability_status   VARCHAR(30) NOT NULL DEFAULT 'available',
        gps_lat               DOUBLE PRECISION,
        gps_lng               DOUBLE PRECISION,
        gps_accuracy_m        DOUBLE PRECISION DEFAULT 10,
        gps_h3_res8           VARCHAR(20),
        gps_h3_res9           VARCHAR(20),
        gps_updated_at        TIMESTAMPTZ,
        rating                NUMERIC(3,2),
        total_reviews         INT NOT NULL DEFAULT 0,
        completed_jobs        INT NOT NULL DEFAULT 0,
        wallet_balance        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        last_login_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_professionals_email  ON professionals(email);
      CREATE INDEX IF NOT EXISTS idx_professionals_phone  ON professionals(phone);
      CREATE INDEX IF NOT EXISTS idx_professionals_code   ON professionals(partner_code);
      CREATE INDEX IF NOT EXISTS idx_professionals_h3_8   ON professionals(gps_h3_res8);
      CREATE INDEX IF NOT EXISTS idx_professionals_h3_9   ON professionals(gps_h3_res9);
      CREATE INDEX IF NOT EXISTS idx_professionals_avail  ON professionals(availability_status);
    `);

    // 7. Professional Skills
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_skills (
        id              SERIAL PRIMARY KEY,
        professional_id INT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
        service_id      VARCHAR(120) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        category_id     VARCHAR(60) NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
        skill_level     VARCHAR(60) NOT NULL DEFAULT 'certified',
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (professional_id, service_id)
      );
      CREATE INDEX IF NOT EXISTS idx_prof_skills_prof     ON professional_skills(professional_id);
      CREATE INDEX IF NOT EXISTS idx_prof_skills_service  ON professional_skills(service_id);
      CREATE INDEX IF NOT EXISTS idx_prof_skills_category ON professional_skills(category_id);
    `);

    // 8. GPS Log Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_gps_log (
        id              BIGSERIAL PRIMARY KEY,
        professional_id INT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
        lat             DOUBLE PRECISION NOT NULL,
        lng             DOUBLE PRECISION NOT NULL,
        accuracy_m      DOUBLE PRECISION NOT NULL DEFAULT 10,
        altitude_m      DOUBLE PRECISION,
        speed_kmh       DOUBLE PRECISION,
        heading_deg     DOUBLE PRECISION,
        h3_res8         VARCHAR(20),
        h3_res9         VARCHAR(20),
        source          VARCHAR(30) NOT NULL DEFAULT 'browser_gps',
        recorded_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_gps_log_prof     ON professional_gps_log(professional_id);
      CREATE INDEX IF NOT EXISTS idx_gps_log_recorded ON professional_gps_log(recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gps_log_h3_9     ON professional_gps_log(h3_res9);
    `);

    // 9. Customer Saved Addresses
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_saved_addresses (
        id            SERIAL PRIMARY KEY,
        customer_id   INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label         VARCHAR(30) NOT NULL DEFAULT 'Home',
        address_line  TEXT NOT NULL,
        landmark      VARCHAR(200),
        city          VARCHAR(100) NOT NULL,
        state         VARCHAR(100) NOT NULL,
        pincode       VARCHAR(10),
        lat           DOUBLE PRECISION,
        lng           DOUBLE PRECISION,
        h3_res9       VARCHAR(20),
        is_default    BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cust_addr_customer ON customer_saved_addresses(customer_id);
    `);

    // 10. Central Media Files Table (Proper image storing for all photos)
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_files (
        id                  BIGSERIAL PRIMARY KEY,
        uploaded_by_type    VARCHAR(30) NOT NULL DEFAULT 'customer',
        uploaded_by_id      INT,
        entity_type         VARCHAR(60) NOT NULL,
        entity_id           VARCHAR(120),
        file_name           VARCHAR(255) NOT NULL,
        mime_type           VARCHAR(80)  NOT NULL,
        file_size_bytes     INT NOT NULL DEFAULT 0,
        storage_path        TEXT NOT NULL,
        cdn_url             TEXT,
        width_px            INT,
        height_px           INT,
        is_thumbnail        BOOLEAN NOT NULL DEFAULT false,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_media_entity   ON media_files(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_media_uploader ON media_files(uploaded_by_type, uploaded_by_id);
    `);

    // 11. Service Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id                        SERIAL PRIMARY KEY,
        request_ref               VARCHAR(60) UNIQUE NOT NULL,
        customer_id               INT REFERENCES customers(id) ON DELETE SET NULL,
        user_id                   INT,
        customer_name             VARCHAR(150),
        user_name                 VARCHAR(150),
        customer_phone            VARCHAR(20),
        user_phone                VARCHAR(20),
        customer_email            VARCHAR(150),
        user_email                VARCHAR(150),
        service_id                VARCHAR(120) REFERENCES services(id) ON DELETE SET NULL,
        category_id               VARCHAR(60)  REFERENCES service_categories(id) ON DELETE SET NULL,
        category                  VARCHAR(60),
        service_title             VARCHAR(220) NOT NULL,
        issue_type                VARCHAR(150) NOT NULL DEFAULT 'Inspection & Repair',
        problem_description       TEXT NOT NULL DEFAULT '',
        problem_timing            VARCHAR(100) NOT NULL DEFAULT 'Immediate',
        problem_frequency         VARCHAR(100) NOT NULL DEFAULT 'First time',
        service_address           TEXT,
        user_address              TEXT,
        service_city              VARCHAR(100),
        service_state             VARCHAR(100),
        service_lat               DOUBLE PRECISION,
        service_lng               DOUBLE PRECISION,
        lat                       DOUBLE PRECISION,
        lng                       DOUBLE PRECISION,
        service_h3_res8           VARCHAR(20),
        service_h3_res9           VARCHAR(20),
        h3_res_8                  VARCHAR(20),
        h3_index_res9             VARCHAR(20),
        location_accuracy_m       DOUBLE PRECISION DEFAULT 10,
        budget_min                NUMERIC(10,2),
        budget_max                NUMERIC(10,2),
        customer_budget_min       NUMERIC(10,2),
        customer_budget_max       NUMERIC(10,2),
        photos_json               JSONB NOT NULL DEFAULT '[]',
        photos                    JSONB NOT NULL DEFAULT '[]',
        otp_code                  VARCHAR(10),
        otp_hash                  VARCHAR(255),
        otp_verified              BOOLEAN NOT NULL DEFAULT false,
        otp_verified_at           TIMESTAMPTZ,
        status                    VARCHAR(30) NOT NULL DEFAULT 'open',
        accepted_quote_id         INT,
        assigned_professional_id  INT,
        accepted_at               TIMESTAMPTZ,
        en_route_at               TIMESTAMPTZ,
        started_at                TIMESTAMPTZ,
        completed_at              TIMESTAMPTZ,
        cancelled_at              TIMESTAMPTZ,
        expires_at                TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
        rating                    INT,
        rating_feedback           TEXT,
        rated_at                  TIMESTAMPTZ,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sreq_ref          ON service_requests(request_ref);
      CREATE INDEX IF NOT EXISTS idx_sreq_customer     ON service_requests(customer_id);
      CREATE INDEX IF NOT EXISTS idx_sreq_status       ON service_requests(status);
    `);

    // 12. Request Dispatches
    await client.query(`
      CREATE TABLE IF NOT EXISTS request_dispatches (
        id                  SERIAL PRIMARY KEY,
        request_id          INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        professional_id     INT REFERENCES professionals(id) ON DELETE CASCADE,
        agent_id            INT,
        wave_number         INT NOT NULL DEFAULT 1,
        radius_km           NUMERIC(6,2) NOT NULL DEFAULT 5.00,
        radius_m            NUMERIC(10,2) DEFAULT 5000,
        status              VARCHAR(20) NOT NULL DEFAULT 'sent',
        dispatched_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        seen_at             TIMESTAMPTZ,
        responded_at        TIMESTAMPTZ,
        CONSTRAINT uq_dispatch_request_agent UNIQUE (request_id, agent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dispatch_request      ON request_dispatches(request_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_professional ON request_dispatches(professional_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_agent        ON request_dispatches(agent_id);
    `);

    // 13. Quotes
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id                          SERIAL PRIMARY KEY,
        request_id                  INT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        professional_id             INT REFERENCES professionals(id) ON DELETE CASCADE,
        agent_id                    INT,
        agent_email                 VARCHAR(150),
        agent_name                  VARCHAR(150),
        agent_phone                 VARCHAR(20),
        total_amount                NUMERIC(10,2),
        amount                      NUMERIC(10,2),
        labour_amount               NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        parts_amount                NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        visit_fee                   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        tax_amount                  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        discount_amount             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        currency                    VARCHAR(5) NOT NULL DEFAULT 'INR',
        warranty_days               INT NOT NULL DEFAULT 30,
        estimated_duration_minutes  INT NOT NULL DEFAULT 30,
        eta_minutes                 INT NOT NULL DEFAULT 30,
        message                     TEXT NOT NULL DEFAULT '',
        provider_note               TEXT,
        status                      VARCHAR(20) NOT NULL DEFAULT 'submitted',
        expires_at                  TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 hours'),
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_request      ON quotes(request_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_professional ON quotes(professional_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_status       ON quotes(status);
    `);

    // 14. Bookings
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id                    SERIAL PRIMARY KEY,
        booking_ref           VARCHAR(60) UNIQUE NOT NULL,
        service_request_id    INT REFERENCES service_requests(id) ON DELETE SET NULL,
        request_id            INT,
        accepted_quote_id     INT REFERENCES quotes(id) ON DELETE SET NULL,
        customer_id           INT REFERENCES customers(id) ON DELETE SET NULL,
        user_id               INT,
        customer_name         VARCHAR(150),
        user_name             VARCHAR(150),
        customer_phone        VARCHAR(20),
        user_phone            VARCHAR(20),
        customer_email        VARCHAR(150),
        user_email            VARCHAR(150),
        service_id            VARCHAR(120) REFERENCES services(id) ON DELETE SET NULL,
        category_id           VARCHAR(60)  REFERENCES service_categories(id) ON DELETE SET NULL,
        category              VARCHAR(60),
        service_title         VARCHAR(220) NOT NULL,
        issue_type            VARCHAR(150) NOT NULL DEFAULT 'Inspection & Repair',
        problem_description   TEXT,
        problem_timing        VARCHAR(100),
        problem_frequency     VARCHAR(100),
        service_address       TEXT,
        user_address          TEXT,
        service_city          VARCHAR(100),
        service_state         VARCHAR(100),
        service_lat           DOUBLE PRECISION,
        service_lng           DOUBLE PRECISION,
        professional_id       INT REFERENCES professionals(id) ON DELETE SET NULL,
        assigned_agent_id     INT,
        professional_name     VARCHAR(150),
        technician_name       VARCHAR(150),
        professional_phone    VARCHAR(20),
        technician_phone      VARCHAR(20),
        eta_minutes           INT DEFAULT 30,
        photos                JSONB NOT NULL DEFAULT '[]',
        time_slot             VARCHAR(100) DEFAULT 'Today, Express 30 Mins',
        total_amount          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        is_estimate           BOOLEAN NOT NULL DEFAULT true,
        payment_method        VARCHAR(60) DEFAULT 'UPI / Cash on completion',
        otp_code              VARCHAR(10) NOT NULL,
        otp_hash              VARCHAR(255),
        otp_verified          BOOLEAN NOT NULL DEFAULT false,
        otp_verified_at       TIMESTAMPTZ,
        otp_attempt_count     INT NOT NULL DEFAULT 0,
        otp_expires_at        TIMESTAMPTZ,
        status                VARCHAR(30) NOT NULL DEFAULT 'confirmed',
        rating                INT,
        review_feedback       TEXT,
        review_tags_json      JSONB NOT NULL DEFAULT '[]',
        review_tags           JSONB NOT NULL DEFAULT '[]',
        reviewed_at           TIMESTAMPTZ,
        payment_status        VARCHAR(20) NOT NULL DEFAULT 'pending',
        scheduled_at          TIMESTAMPTZ,
        arrived_at            TIMESTAMPTZ,
        arrival_at            TIMESTAMPTZ,
        started_at            TIMESTAMPTZ,
        completed_at          TIMESTAMPTZ,
        cancelled_at          TIMESTAMPTZ,
        cancel_reason         TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_ref          ON bookings(booking_ref);
      CREATE INDEX IF NOT EXISTS idx_bookings_customer     ON bookings(customer_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_professional ON bookings(professional_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_status       ON bookings(status);

      CREATE TABLE IF NOT EXISTS booking_photos (
        id                SERIAL PRIMARY KEY,
        booking_id        INT REFERENCES bookings(id) ON DELETE CASCADE,
        booking_ref       VARCHAR(60),
        storage_path      TEXT,
        original_filename VARCHAR(255),
        mime_type         VARCHAR(100),
        file_size         INT,
        uploaded_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE booking_photos ADD COLUMN IF NOT EXISTS booking_id INT REFERENCES bookings(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_booking_photos_ref ON booking_photos(booking_ref);
      CREATE INDEX IF NOT EXISTS idx_booking_photos_booking ON booking_photos(booking_id);
    `);

    // 14.1 Job Lifecycle Audit Trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_events (
        id            SERIAL PRIMARY KEY,
        booking_id    INT REFERENCES bookings(id) ON DELETE CASCADE,
        request_id    INT REFERENCES service_requests(id) ON DELETE CASCADE,
        actor_type    VARCHAR(50) NOT NULL DEFAULT 'system',
        actor_id      VARCHAR(100),
        event_type    VARCHAR(100) NOT NULL,
        metadata      JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_job_events_request ON job_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_job_events_booking ON job_events(booking_id);
      CREATE INDEX IF NOT EXISTS idx_job_events_type    ON job_events(event_type);
    `);

    // 15. Booking Media
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_media (
        id                SERIAL PRIMARY KEY,
        booking_id        INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        media_file_id     BIGINT REFERENCES media_files(id) ON DELETE CASCADE,
        media_url         TEXT,
        media_role        VARCHAR(30) NOT NULL DEFAULT 'problem_photo',
        uploaded_by_type  VARCHAR(20) NOT NULL DEFAULT 'customer',
        uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_booking_media_booking ON booking_media(booking_id);
    `);

    // 16. Real-Time Chat (Conversations & Messages)
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id                          SERIAL PRIMARY KEY,
        booking_id                  INT REFERENCES bookings(id) ON DELETE CASCADE,
        request_id                  INT REFERENCES service_requests(id) ON DELETE CASCADE,
        customer_id                 INT REFERENCES customers(id) ON DELETE CASCADE,
        professional_id             INT REFERENCES professionals(id) ON DELETE CASCADE,
        status                      VARCHAR(20) NOT NULL DEFAULT 'active',
        customer_unread_count       INT NOT NULL DEFAULT 0,
        professional_unread_count   INT NOT NULL DEFAULT 0,
        last_message_at             TIMESTAMPTZ,
        last_message_preview        VARCHAR(200),
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_conv_booking      ON conversations(booking_id);
      CREATE INDEX IF NOT EXISTS idx_conv_customer     ON conversations(customer_id);
      CREATE INDEX IF NOT EXISTS idx_conv_professional ON conversations(professional_id);

      CREATE TABLE IF NOT EXISTS messages (
        id                BIGSERIAL PRIMARY KEY,
        conversation_id   INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_type       VARCHAR(20) NOT NULL,
        sender_id         INT NOT NULL,
        message_type      VARCHAR(20) NOT NULL DEFAULT 'text',
        content_text      TEXT,
        media_file_id     BIGINT REFERENCES media_files(id) ON DELETE SET NULL,
        media_url         TEXT,
        location_lat      DOUBLE PRECISION,
        location_lng      DOUBLE PRECISION,
        is_read           BOOLEAN NOT NULL DEFAULT false,
        read_at           TIMESTAMPTZ,
        is_deleted        BOOLEAN NOT NULL DEFAULT false,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv    ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sender  ON messages(sender_type, sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_unread  ON messages(conversation_id, is_read) WHERE is_read = false;
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
    `);

    // 17. Wallets & Append-Only Financial Ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_wallets (
        id                    SERIAL PRIMARY KEY,
        professional_id       INT UNIQUE NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
        balance               NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
        total_earned          NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        total_withdrawn       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        pending_payout        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        bank_account_name     VARCHAR(150),
        bank_account_number   VARCHAR(30),
        bank_ifsc             VARCHAR(20),
        bank_upi_id           VARCHAR(100),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id                BIGSERIAL PRIMARY KEY,
        wallet_id         INT REFERENCES professional_wallets(id) ON DELETE RESTRICT,
        professional_id   INT REFERENCES professionals(id) ON DELETE RESTRICT,
        agent_id          INT,
        txn_type          VARCHAR(20) NOT NULL DEFAULT 'job_credit',
        type              VARCHAR(20),
        booking_id        INT REFERENCES bookings(id) ON DELETE SET NULL,
        request_ref       VARCHAR(60),
        amount            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        balance_before    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        balance_after     NUMERIC(12,2) NOT NULL DEFAULT 0.00,
        description       TEXT NOT NULL DEFAULT '',
        status            VARCHAR(20) NOT NULL DEFAULT 'settled',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_txn_prof ON wallet_transactions(professional_id);
    `);

    // 18. Payments
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                    SERIAL PRIMARY KEY,
        booking_id            INT REFERENCES bookings(id) ON DELETE SET NULL,
        request_id            INT REFERENCES service_requests(id) ON DELETE SET NULL,
        customer_id           INT REFERENCES customers(id) ON DELETE SET NULL,
        gateway               VARCHAR(30) NOT NULL DEFAULT 'razorpay',
        gateway_order_id      VARCHAR(120),
        payment_order_id      VARCHAR(120),
        gateway_payment_id    VARCHAR(120),
        payment_id            VARCHAR(120),
        gateway_signature     VARCHAR(255),
        signature             VARCHAR(255),
        amount                NUMERIC(10,2) NOT NULL,
        currency              VARCHAR(5) NOT NULL DEFAULT 'INR',
        status                VARCHAR(20) NOT NULL DEFAULT 'created',
        idempotency_key       VARCHAR(120) UNIQUE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 19. Reviews
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          SERIAL PRIMARY KEY,
        booking_id  INT REFERENCES bookings(id) ON DELETE CASCADE,
        request_id  INT REFERENCES service_requests(id) ON DELETE CASCADE,
        customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
        provider_id INT REFERENCES professionals(id) ON DELETE CASCADE,
        rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        feedback    TEXT,
        tags        JSONB NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_booking  ON reviews(booking_id);
    `);

    // 20. Professional KYC Documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS professional_documents (
        id                SERIAL PRIMARY KEY,
        professional_id   INT REFERENCES professionals(id) ON DELETE CASCADE,
        agent_id          INT,
        partner_id        VARCHAR(50),
        agent_email       VARCHAR(150),
        document_type     VARCHAR(60) NOT NULL,
        file_name         VARCHAR(255),
        file_size_bytes   INT,
        file_size         INT,
        mime_type         VARCHAR(80),
        file_type         VARCHAR(80),
        storage_path      TEXT,
        file_url          TEXT,
        status            VARCHAR(30) NOT NULL DEFAULT 'not_uploaded',
        rejection_reason  TEXT,
        verified_by       VARCHAR(120),
        verified_at       TIMESTAMPTZ,
        uploaded_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pro_docs_prof ON professional_documents(professional_id);

      -- Legacy / Compat Table: agent_documents
      CREATE TABLE IF NOT EXISTS agent_documents (
        id                SERIAL PRIMARY KEY,
        agent_id          INT,
        partner_id        VARCHAR(50),
        agent_email       VARCHAR(150),
        document_type     VARCHAR(60) NOT NULL,
        file_name         VARCHAR(255),
        file_type         VARCHAR(80),
        file_size         INT,
        file_url          TEXT,
        status            VARCHAR(30) NOT NULL DEFAULT 'Not Uploaded',
        rejection_reason  TEXT,
        uploaded_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure sync trigger functions and triggers exist
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_sync_user_to_customer()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO customers (
          full_name, email, phone, avatar_url, state, city, address,
          password_hash, auth_provider, google_id, is_email_verified, is_phone_verified,
          last_login_at, created_at, updated_at
        ) VALUES (
          NEW.name, NEW.email, NEW.phone, NEW.avatar_url, NEW.state, NEW.city, NEW.address,
          NEW.password, COALESCE(NEW.auth_provider, 'email'), NEW.google_id,
          COALESCE(NEW.is_verified, false), COALESCE(NEW.is_phone_verified, false),
          NEW.last_login_at, COALESCE(NEW.created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
        )
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, customers.phone),
          avatar_url = COALESCE(EXCLUDED.avatar_url, customers.avatar_url),
          state = COALESCE(EXCLUDED.state, customers.state),
          city = COALESCE(EXCLUDED.city, customers.city),
          address = COALESCE(EXCLUDED.address, customers.address),
          password_hash = COALESCE(EXCLUDED.password_hash, customers.password_hash),
          is_email_verified = COALESCE(EXCLUDED.is_email_verified, customers.is_email_verified),
          is_phone_verified = COALESCE(EXCLUDED.is_phone_verified, customers.is_phone_verified),
          last_login_at = EXCLUDED.last_login_at,
          updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION fn_sync_agent_to_professional()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO professionals (
          partner_code, full_name, email, phone, avatar_url,
          state, city, address, trade, experience_years,
          password_hash, auth_provider, google_id,
          is_email_verified, is_phone_verified, kyc_status,
          is_online, availability_status,
          gps_lat, gps_lng, gps_accuracy_m, gps_h3_res8, gps_h3_res9, gps_updated_at,
          rating, completed_jobs, wallet_balance,
          last_login_at, created_at, updated_at
        ) VALUES (
          NEW.partner_id, NEW.name, NEW.email, NEW.phone, NEW.avatar_url,
          NEW.state, NEW.city, NEW.address, NEW.trade, COALESCE(NEW.experience_years, 0),
          NEW.password, COALESCE(NEW.auth_provider, 'partner_code'), NEW.google_id,
          COALESCE(NEW.is_verified, false), COALESCE(NEW.is_phone_verified, false),
          COALESCE(NEW.kyc_status, 'pending'),
          COALESCE(NEW.is_online, false),
          COALESCE(NEW.availability_status, 'available'),
          NEW.lat, NEW.lng, COALESCE(NEW.location_accuracy_m, 10), NEW.h3_res_8, NEW.h3_index_res9, NEW.location_updated_at,
          NEW.rating, COALESCE(NEW.completed_jobs, 0), COALESCE(NEW.wallet_balance, 0.00),
          NEW.last_login_at, COALESCE(NEW.created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
        )
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, professionals.phone),
          trade = EXCLUDED.trade,
          experience_years = EXCLUDED.experience_years,
          is_online = EXCLUDED.is_online,
          availability_status = EXCLUDED.availability_status,
          gps_lat = EXCLUDED.gps_lat,
          gps_lng = EXCLUDED.gps_lng,
          gps_accuracy_m = EXCLUDED.gps_accuracy_m,
          gps_h3_res8 = EXCLUDED.gps_h3_res8,
          gps_h3_res9 = EXCLUDED.gps_h3_res9,
          gps_updated_at = EXCLUDED.gps_updated_at,
          wallet_balance = EXCLUDED.wallet_balance,
          updated_at = CURRENT_TIMESTAMP;

        -- Ensure wallet matches
        INSERT INTO professional_wallets (professional_id, balance, total_earned)
        SELECT p.id, COALESCE(NEW.wallet_balance, 0.00), COALESCE(NEW.wallet_balance, 0.00)
        FROM professionals p WHERE p.email = NEW.email
        ON CONFLICT (professional_id) DO UPDATE SET
          balance = EXCLUDED.balance,
          updated_at = CURRENT_TIMESTAMP;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_user_to_customer ON user_login;
      CREATE TRIGGER trg_sync_user_to_customer
        AFTER INSERT OR UPDATE ON user_login
        FOR EACH ROW EXECUTE FUNCTION fn_sync_user_to_customer();

      DROP TRIGGER IF EXISTS trg_sync_agent_to_professional ON agent_login;
      CREATE TRIGGER trg_sync_agent_to_professional
        AFTER INSERT OR UPDATE ON agent_login
        FOR EACH ROW EXECUTE FUNCTION fn_sync_agent_to_professional();
    `);

    console.log('✅  NivaaroFix DB Schema v2.0 verified & ready!');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
