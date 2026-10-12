-- ==============================================================================
-- NivaaroFix — Reference Data: Service Catalog
-- Clean catalog seed: Electrician and Plumber categories & services
-- ==============================================================================

-- 1. Reference Service Categories
INSERT INTO service_categories (slug, name, description, icon_name, sort_order, is_active)
VALUES
    ('electrician', 'Electrician', 'Electrical fittings, repairs, switchboards, MCBs, wiring, and appliance installation.', 'zap', 1, TRUE),
    ('plumber', 'Plumber', 'Pipe leakages, taps, sanitary fittings, drain unclogging, water heaters, and water tanks.', 'droplet', 2, TRUE)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- 2. Reference Services (Electrician)
INSERT INTO services (category_id, slug, name, description, base_price, currency, estimated_duration_minutes, warranty_days, is_active)
SELECT 
    sc.id,
    v.slug,
    v.name,
    v.description,
    v.base_price,
    'INR',
    v.estimated_duration_minutes,
    30,
    TRUE
FROM service_categories sc
JOIN (
    VALUES
        ('switchboard-socket-repair', 'Switches & Sockets', 'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.', 149.00, 30),
        ('mcb-fuse-short-circuit', 'Tripping & Short Circuits', 'Diagnosis of tripping MCBs, neutral link fixing, main board fuse wire & RCCB issues.', 249.00, 45),
        ('fan-installation-repair', 'Fans & Regulators', 'Ceiling fan, exhaust fan, decorative BLDC fan replacement, regulator replacement, bearing noise.', 149.00, 30),
        ('light-fitting-chandelier', 'Lights & Chandeliers', 'LED tube lights, panel ceiling lights, decorative spotlights, pendant & heavy chandelier hanging.', 99.00, 25),
        ('appliance-wiring-point', 'Appliance Power Line', 'Heavy load dedicated wiring line for geyser, air conditioner, microwave, induction & EV charger.', 299.00, 45),
        ('inverter-ups-setup', 'Inverter & Battery Wiring', 'Inverter battery setup, bypass switch wiring, backup load segregation & terminal cleaning.', 349.00, 60)
) AS v(slug, name, description, base_price, estimated_duration_minutes)
ON sc.slug = 'electrician'
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
    updated_at = CURRENT_TIMESTAMP;

-- 3. Reference Services (Plumber)
INSERT INTO services (category_id, slug, name, description, base_price, currency, estimated_duration_minutes, warranty_days, is_active)
SELECT 
    sc.id,
    v.slug,
    v.name,
    v.description,
    v.base_price,
    'INR',
    v.estimated_duration_minutes,
    30,
    TRUE
FROM service_categories sc
JOIN (
    VALUES
        ('tap-faucet-repair', 'Taps & Mixers', 'Dripping tap repair, cartridge replacement, wall mixer installation, kitchen sink bib cock fix.', 129.00, 25),
        ('toilet-flush-repair', 'Toilets & Flush Tanks', 'Dual flush valve fix, toilet jet spray leak, siphon replacement, wall-hung commode repair.', 179.00, 35),
        ('drain-blockage-removal', 'Drain Blockage & Sink Unclog', 'Kitchen sink, washbasin, bathroom floor drain cleaning with heavy drain auger & descaler.', 249.00, 40),
        ('pipe-leakage-seepage', 'Pipe Leak & Wall Seepage', 'Concealed CPVC/PVC pipe joint repair, crack sealing, elbow leak fixing & pressure check.', 299.00, 60),
        ('water-tank-motor-pump', 'Water Pump & Overheads', 'Water motor pump airlock release, float ball valve replacement, tank connection fixing.', 349.00, 50),
        ('geyser-connection-plumbing', 'Geyser Plumbing Lines', 'Inlet/outlet braided hose connection, angle valve fix, pressure release valve installation.', 199.00, 30)
) AS v(slug, name, description, base_price, estimated_duration_minutes)
ON sc.slug = 'plumber'
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
    updated_at = CURRENT_TIMESTAMP;
