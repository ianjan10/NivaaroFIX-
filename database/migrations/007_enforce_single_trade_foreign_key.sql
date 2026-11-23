-- ============================================================================
-- Migration 007: Enforce Single Trade Foreign Key (Electrician & Plumber Only)
-- ============================================================================

-- 1. Ensure service_categories contains only active Electrician and Plumber
DELETE FROM service_categories WHERE slug NOT IN ('electrician', 'plumber');

INSERT INTO service_categories (id, slug, name, description, icon_name, sort_order, is_active)
OVERRIDING SYSTEM VALUE
VALUES 
    (1, 'electrician', 'Electrician', 'MCB, wiring, switches, lighting, earthing and distribution repairs.', 'zap', 1, TRUE),
    (2, 'plumber', 'Plumber', 'Pipes, taps, drains, water tanks, pumps, and sanitary fixtures.', 'droplet', 2, TRUE)
ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = TRUE;

-- 2. Add trade_id column to professionals with default 1 (Electrician)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS trade_id BIGINT DEFAULT 1;

-- Map existing trade slugs to valid trade_id
UPDATE professionals 
SET trade_id = 2, trade = 'plumber' 
WHERE LOWER(COALESCE(trade, '')) = 'plumber';

UPDATE professionals 
SET trade_id = 1, trade = 'electrician' 
WHERE LOWER(COALESCE(trade, '')) != 'plumber';

-- Enforce NOT NULL and foreign key constraint
ALTER TABLE professionals ALTER COLUMN trade_id SET NOT NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_professionals_trade_cat' AND table_name = 'professionals'
    ) THEN
        ALTER TABLE professionals 
        ADD CONSTRAINT fk_professionals_trade_cat 
        FOREIGN KEY (trade_id) REFERENCES service_categories(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_professionals_trade_id ON professionals(trade_id);

-- 3. Add trade_id column to agent_login for credential sync
ALTER TABLE agent_login ADD COLUMN IF NOT EXISTS trade_id BIGINT DEFAULT 1;

UPDATE agent_login 
SET trade_id = 2, trade = 'plumber' 
WHERE LOWER(COALESCE(trade, '')) = 'plumber';

UPDATE agent_login 
SET trade_id = 1, trade = 'electrician' 
WHERE LOWER(COALESCE(trade, '')) != 'plumber';

ALTER TABLE agent_login ALTER COLUMN trade_id SET NOT NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_agent_login_trade_cat' AND table_name = 'agent_login'
    ) THEN
        ALTER TABLE agent_login 
        ADD CONSTRAINT fk_agent_login_trade_cat 
        FOREIGN KEY (trade_id) REFERENCES service_categories(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_agent_login_trade_id ON agent_login(trade_id);

COMMENT ON COLUMN professionals.trade_id IS 'Foreign key to service_categories(id). Exactly one trade per professional (Electrician or Plumber).';
COMMENT ON COLUMN agent_login.trade_id IS 'Foreign key to service_categories(id) synchronized with professional profile.';
