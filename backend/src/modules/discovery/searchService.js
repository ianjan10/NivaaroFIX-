import { pool } from '../../config/db.js';

// Curated high-precision repair aliases mapped to trade category & service slug
const INTENT_TAXONOMY = [
  // Plumbing - Pipe & Leakage
  {
    patterns: [
      'pipe burst', 'burst pipe', 'pipe leak', 'pipe leakage', 'water pipe burst',
      'water coming through wall', 'water leaking from wall', 'water leak',
      'pipeline burst', 'pipeline leak', 'ceiling water leakage', 'cpvc pipe leak'
    ],
    category: 'plumber',
    serviceId: 'overhead-tank-water-pump',
    title: 'Water Tank, Motor Pump & Pressure Booster Setup',
    confidence: 0.98,
    action: 'direct'
  },
  // Plumbing - Tap, Faucet & Mixer
  {
    patterns: [
      'tap leaking', 'dripping tap', 'tap dripping', 'leaking tap', 'faucet repair',
      'tap broken', 'mixer valve', 'diverter leaking', 'bathroom tap', 'kitchen tap',
      'shower dripping', 'water dripping from tap'
    ],
    category: 'plumber',
    serviceId: 'tap-faucet-mixer-repair',
    title: 'Tap, Faucet & Diverter Mixer Valve Repair',
    confidence: 0.97,
    action: 'direct'
  },
  // Plumbing - Drainage & Blockage
  {
    patterns: [
      'water not draining', 'drain blockage', 'clogged drain', 'blocked sink',
      'kitchen sink choked', 'bathroom drain blocked', 'water logging',
      'drain pipe clogged', 'sewer blocked', 'pipe blockage'
    ],
    category: 'plumber',
    serviceId: 'drain-pipe-blockage-clear',
    title: 'Drain Blockage & Clogged Sewer Line Clearance',
    confidence: 0.96,
    action: 'direct'
  },
  // Plumbing - Toilet & Flush
  {
    patterns: [
      'commode repair', 'flush tank leaking', 'toilet flush not working',
      'cistern leaking', 'commode flush', 'western toilet leak', 'flush button broken',
      'toilet running'
    ],
    category: 'plumber',
    serviceId: 'toilet-commode-cistern-fix',
    title: 'Western / Indian Commode & Flush Tank Repair',
    confidence: 0.96,
    action: 'direct'
  },
  // Electrical - MCB & Short Circuit
  {
    patterns: [
      'mcb keeps tripping', 'mcb tripping', 'short circuit', 'fuse blown',
      'sparking in meter', 'main switch tripping', 'rccb trip', 'power trip',
      'circuit breaker'
    ],
    category: 'electrician',
    serviceId: 'mcb-fuse-short-circuit',
    title: 'MCB Tripping, Short-Circuit & Fuse Diagnostics',
    confidence: 0.98,
    action: 'direct'
  },
  // Electrical - Switchboard & Socket
  {
    patterns: [
      'socket sparking', 'burnt switch', 'switchboard repair', 'plug not working',
      'power point loose', '16a socket', 'switch sparking', 'plug burnt'
    ],
    category: 'electrician',
    serviceId: 'switchboard-socket-repair',
    title: 'Switchboard, Socket & Power Point Repair',
    confidence: 0.97,
    action: 'direct'
  },
  // Electrical - Fan & Light Fixtures
  {
    patterns: [
      'fan not working', 'ceiling fan repair', 'fan making noise', 'fan slow',
      'chandelier installation', 'light fitting', 'bulb holder replace', 'spotlight fitting'
    ],
    category: 'electrician',
    serviceId: 'fan-chandelier-install',
    title: 'Ceiling Fan, Chandelier & Light Fixture Installation',
    confidence: 0.96,
    action: 'direct'
  },
  // Electrical - Inverter & Heavy Wiring
  {
    patterns: [
      'inverter not charging', 'inverter wiring', 'battery water', 'changeover switch',
      'home wiring', 'earthing issue', 'shock from tap', 'neutral leakage'
    ],
    category: 'electrician',
    serviceId: 'inverter-wiring-setup',
    title: 'Home Inverter, Battery & Heavy Wiring Setup',
    confidence: 0.95,
    action: 'direct'
  }
];

export async function resolveServiceSearch(rawQuery) {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) {
    return {
      query: '',
      confidence: 0,
      category: null,
      service: null,
      suggestions: []
    };
  }

  // 1. Direct High-Confidence Exact Alias Matching
  for (const item of INTENT_TAXONOMY) {
    for (const pattern of item.patterns) {
      if (query.includes(pattern) || pattern.includes(query)) {
        // Fetch full service row from database
        const dbRes = await pool.query(
          'SELECT * FROM services WHERE id = $1 LIMIT 1',
          [item.serviceId]
        );
        const serviceData = dbRes.rows[0] || {
          id: item.serviceId,
          title: item.title,
          category_id: item.category
        };

        return {
          query: rawQuery,
          confidence: item.confidence,
          category: item.category,
          service: serviceData,
          action: 'direct',
          matchType: 'exact_alias'
        };
      }
    }
  }

  // 2. Keyword & Full-Text Search in PostgreSQL Services
  const dbServices = await pool.query(`
    SELECT * FROM services 
    WHERE 
      LOWER(title) LIKE $1 
      OR LOWER(short_desc) LIKE $1 
      OR LOWER(category_id) LIKE $1
    ORDER BY is_popular DESC, rating DESC
    LIMIT 6;
  `, [`%${query}%`]);

  if (dbServices.rows.length > 0) {
    const top = dbServices.rows[0];
    const confidence = dbServices.rows.length === 1 ? 0.91 : 0.82;
    return {
      query: rawQuery,
      confidence,
      category: top.category_id,
      service: top,
      suggestions: dbServices.rows,
      action: confidence >= 0.85 ? 'direct' : 'suggest',
      matchType: 'database_keyword'
    };
  }

  // 3. Trade Category Fallback Detection
  if (query.includes('plumb') || query.includes('water') || query.includes('leak') || query.includes('drain') || query.includes('pipe')) {
    const plumberServices = await pool.query("SELECT * FROM services WHERE category_id = 'plumber' LIMIT 4;");
    return {
      query: rawQuery,
      confidence: 0.75,
      category: 'plumber',
      service: plumberServices.rows[0] || null,
      suggestions: plumberServices.rows,
      action: 'suggest',
      matchType: 'category_heuristic'
    };
  }

  if (query.includes('electr') || query.includes('wire') || query.includes('power') || query.includes('current') || query.includes('shock') || query.includes('switch')) {
    const electricServices = await pool.query("SELECT * FROM services WHERE category_id = 'electrician' LIMIT 4;");
    return {
      query: rawQuery,
      confidence: 0.75,
      category: 'electrician',
      service: electricServices.rows[0] || null,
      suggestions: electricServices.rows,
      action: 'suggest',
      matchType: 'category_heuristic'
    };
  }

  // 4. Low Confidence / General Fallback
  return {
    query: rawQuery,
    confidence: 0.25,
    category: null,
    service: null,
    suggestions: [],
    action: 'browse',
    matchType: 'none'
  };
}

export const resolveServiceIntent = resolveServiceSearch;

