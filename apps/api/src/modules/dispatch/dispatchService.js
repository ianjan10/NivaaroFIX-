import { pool } from '../../config/db.js';
import { DISPATCH_CONFIG } from '../../config/dispatchConfig.js';
import { latLngToH3, getNearbyCells, radiusToRingSize } from '../../utils/geoDispatch.js';
import { notifyCustomer, notifyProvider } from '../realtime/realtimeService.js';

/**
 * Find eligible providers for a service request within a specific radius in meters.
 * Employs H3 candidate filtering + PostgreSQL earth_distance exact meter calculation.
 * 
 * Strict Eligibility Rules:
 * - Trade matching (trade = category OR trade = 'both')
 * - availability_status = 'AVAILABLE'
 * - kyc_status = 'Verified'
 * - Location freshness <= PROVIDER_LOCATION_MAX_AGE_SECONDS
 * - GPS accuracy <= LOCATION_MAX_ACCURACY_METERS
 * - Distance <= radiusMeters
 * - Not already dispatched for this request
 * - Not currently busy on an active confirmed/in-progress booking
 */
export async function findEligibleProviders(requestId, radiusMeters) {
  // 1. Fetch request details
  const reqRes = await pool.query(
    'SELECT id, request_ref, lat, lng, category, h3_index_res9, h3_res_8, status FROM service_requests WHERE id = $1 LIMIT 1;',
    [requestId]
  );
  if (reqRes.rows.length === 0) return [];
  const sr = reqRes.rows[0];

  if (!sr.lat || !sr.lng || isNaN(parseFloat(sr.lat)) || isNaN(parseFloat(sr.lng))) {
    return [];
  }

  const radiusKm = radiusMeters / 1000;
  const maxAgeSeconds = DISPATCH_CONFIG.PROVIDER_LOCATION_MAX_AGE_SECONDS || 1800;
  const maxAccuracyMeters = DISPATCH_CONFIG.LOCATION_MAX_ACCURACY_METERS || 100;

  // 2. Determine H3 ring for candidate indexing
  const ringSize = Math.max(1, radiusToRingSize(radiusKm) + 1);
  const centerH3 = sr.h3_index_res9 || latLngToH3(sr.lat, sr.lng);
  const candidateCells = centerH3 ? getNearbyCells(centerH3, ringSize) : [];

  let cellClause = '';
  let queryParams = [
    sr.lat,
    sr.lng,
    sr.category,
    maxAgeSeconds,
    maxAccuracyMeters,
    radiusMeters,
    sr.id
  ];

  if (candidateCells.length > 0 && candidateCells.length <= 150) {
    cellClause = `AND (a.h3_index_res9 = ANY($${queryParams.length + 1}::text[]) OR a.h3_index_res9 IS NULL)`;
    queryParams.push(candidateCells);
  }

  // 3. PostgreSQL query with earth_distance exact verification
  const query = `
    SELECT 
      a.id AS agent_id,
      a.partner_id,
      a.name,
      a.email,
      a.phone,
      a.trade,
      a.rating,
      a.completed_jobs,
      a.experience_years,
      a.lat,
      a.lng,
      a.location_accuracy_m,
      a.location_updated_at,
      ROUND(earth_distance(ll_to_earth($1, $2), ll_to_earth(a.lat, a.lng))::numeric, 1) AS distance_meters
    FROM agent_login a
    WHERE a.is_online = true
      AND a.availability_status = 'AVAILABLE'
      AND a.kyc_status = 'Verified'
      AND a.lat IS NOT NULL
      AND a.lng IS NOT NULL
      AND (a.trade = $3 OR a.trade = 'both')
      AND (a.location_updated_at >= CURRENT_TIMESTAMP - ($4 * INTERVAL '1 second'))
      AND (COALESCE(a.location_accuracy_m, 10) <= $5)
      AND (earth_distance(ll_to_earth($1, $2), ll_to_earth(a.lat, a.lng)) <= $6)
      -- Exclude providers already dispatched for this request
      AND a.id NOT IN (
        SELECT rd.agent_id FROM request_dispatches rd WHERE rd.request_id = $7
      )
      -- Exclude providers with active jobs
      AND a.id NOT IN (
        SELECT b.assigned_agent_id FROM bookings b 
        WHERE b.assigned_agent_id IS NOT NULL 
          AND b.status IN ('Confirmed', 'On The Way', 'In Progress')
      )
      ${cellClause}
    ORDER BY distance_meters ASC, a.rating DESC, a.completed_jobs DESC;
  `;

  const result = await pool.query(query, queryParams);
  return result.rows.map(row => ({
    agentId: row.agent_id,
    partnerId: row.partner_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    trade: row.trade,
    rating: parseFloat(row.rating || 5.0),
    completedJobs: row.completed_jobs || 0,
    experienceYears: row.experience_years || 0,
    distanceMeters: parseFloat(row.distance_meters),
    locationAccuracyMeters: parseFloat(row.location_accuracy_m || 10)
  }));
}

/**
 * Execute a progressive dispatch wave for a request at the designated radius.
 * If radiusMeters is not supplied, starts at DISPATCH_CONFIG.INITIAL_RADIUS_METERS (50m).
 */
export async function dispatchProgressiveWave(requestId, targetRadiusMeters = null) {
  // 1. Validate request state
  const reqRes = await pool.query(`
    SELECT sr.*, 
      (SELECT COUNT(*) FROM request_dispatches rd WHERE rd.request_id = sr.id) AS total_dispatched_count,
      (SELECT MAX(wave_number) FROM request_dispatches rd WHERE rd.request_id = sr.id) AS current_wave
    FROM service_requests sr
    WHERE sr.id = $1 LIMIT 1;
  `, [requestId]);

  if (reqRes.rows.length === 0) {
    return { success: false, error: 'Request not found' };
  }
  const sr = reqRes.rows[0];

  // Do not dispatch if request is not open for quotes
  if (sr.status !== 'Open' && sr.status !== 'Quoting') {
    return {
      success: false,
      status: sr.status,
      message: `Request is in '${sr.status}' state and not accepting new dispatches.`
    };
  }

  // 2. Determine wave and radius
  const steps = DISPATCH_CONFIG.RADIUS_STEPS_METERS || [50, 100, 500, 1000, 5000, 10000];
  const lastWave = parseInt(sr.current_wave || '0', 10);
  const nextWaveNumber = lastWave + 1;

  let radius = targetRadiusMeters;
  if (!radius) {
    if (lastWave === 0) {
      radius = DISPATCH_CONFIG.INITIAL_RADIUS_METERS || 50;
    } else {
      const nextStepIndex = Math.min(lastWave, steps.length - 1);
      radius = steps[nextStepIndex];
    }
  }

  // 3. Find newly eligible providers
  const eligibleProviders = await findEligibleProviders(sr.id, radius);

  // 4. Record dispatches and notify providers in real time
  const dispatchedProviders = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const p of eligibleProviders) {
      const insRes = await client.query(`
        INSERT INTO request_dispatches (request_id, agent_id, wave_number, radius_m, status)
        VALUES ($1, $2, $3, $4, 'sent')
        ON CONFLICT (request_id, agent_id) DO NOTHING
        RETURNING id;
      `, [sr.id, p.agentId, nextWaveNumber, radius]);

      if (insRes.rows.length > 0) {
        dispatchedProviders.push(p);
      }
    }

    // Audit event
    if (dispatchedProviders.length > 0) {
      await client.query(`
        INSERT INTO job_events (request_id, actor_type, actor_id, event_type, metadata)
        VALUES ($1, 'system', 'dispatch_engine', 'DISPATCH_WAVE_SENT', $2::jsonb);
      `, [
        sr.id,
        JSON.stringify({
          waveNumber: nextWaveNumber,
          radiusMeters: radius,
          providersNotified: dispatchedProviders.map(p => ({
            agentId: p.agentId,
            distanceMeters: p.distanceMeters
          }))
        })
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to commit dispatch records:', err);
    throw err;
  } finally {
    client.release();
  }

  // 5. Send Realtime SSE Notifications
  // Privacy rule: Provider receives service, problem, photos, approximate locality, distance.
  // Exact street address / phone is withheld until quotation acceptance!
  const privacyLocality = sr.user_address
    ? sr.user_address.split(',').slice(-2).join(', ').trim()
    : 'Local Area';

  for (const p of dispatchedProviders) {
    notifyProvider(p.email, 'dispatch.request.sent', {
      requestId: sr.id,
      requestRef: sr.request_ref,
      serviceTitle: sr.service_title,
      category: sr.category,
      issueType: sr.issue_type,
      problemDescription: sr.problem_description,
      photos: sr.photos || [],
      approximateArea: privacyLocality,
      distanceMeters: p.distanceMeters,
      createdAt: sr.created_at,
      expiresAt: sr.expires_at
    });
  }

  // 6. Notify customer of dispatch progress
  const totalDispatched = parseInt(sr.total_dispatched_count || '0', 10) + dispatchedProviders.length;
  notifyCustomer(sr.request_ref, 'dispatch.wave_progress', {
    requestRef: sr.request_ref,
    waveNumber: nextWaveNumber,
    radiusMeters: radius,
    newlyNotifiedCount: dispatchedProviders.length,
    totalDispatchedCount: totalDispatched
  });

  return {
    success: true,
    waveNumber: nextWaveNumber,
    radiusMeters: radius,
    newlyDispatchedCount: dispatchedProviders.length,
    totalDispatchedCount: totalDispatched,
    providers: dispatchedProviders
  };
}

/**
 * Expand search radius to next step if no quotes have arrived yet.
 */
export async function expandSearchRadiusIfNeeded(requestId) {
  // Check if quotes exist
  const quoteCheck = await pool.query(
    "SELECT COUNT(*) FROM quotes WHERE request_id = $1 AND status IN ('Pending', 'SUBMITTED', 'Accepted');",
    [requestId]
  );
  const activeQuotesCount = parseInt(quoteCheck.rows[0].count, 10);
  if (activeQuotesCount > 0) {
    return { expanded: false, reason: 'QUOTES_ALREADY_RECEIVED', activeQuotesCount };
  }

  // Determine current radius
  const dispatchHistory = await pool.query(
    'SELECT MAX(radius_m) AS max_radius FROM request_dispatches WHERE request_id = $1;',
    [requestId]
  );
  const currentMaxRadius = parseInt(dispatchHistory.rows[0]?.max_radius || '0', 10);
  const steps = DISPATCH_CONFIG.RADIUS_STEPS_METERS || [50, 100, 500, 1000, 5000, 10000];

  const currentIdx = steps.indexOf(currentMaxRadius);
  let nextRadius = steps[0];
  if (currentIdx !== -1 && currentIdx < steps.length - 1) {
    nextRadius = steps[currentIdx + 1];
  } else if (currentIdx >= steps.length - 1) {
    return { expanded: false, reason: 'MAX_RADIUS_REACHED', maxRadius: steps[steps.length - 1] };
  }

  const result = await dispatchProgressiveWave(requestId, nextRadius);
  return { expanded: true, nextRadius, ...result };
}

export default {
  findEligibleProviders,
  dispatchProgressiveWave,
  expandSearchRadiusIfNeeded
};
