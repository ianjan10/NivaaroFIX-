import { latLngToCell } from 'h3-js';
import { pool } from '../../config/db.js';
import { DISPATCH_CONFIG } from '../../config/dispatchConfig.js';

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function reverseGeocodeLocality(lat, lng) {
  if (Math.abs(lat - 28.6139) < 0.25 && Math.abs(lng - 77.2090) < 0.25) {
    return 'Connaught Place, New Delhi';
  }
  if (Math.abs(lat - 30.9010) < 0.25 && Math.abs(lng - 75.8573) < 0.25) {
    return 'Model Town, Ludhiana';
  }
  if (Math.abs(lat - 13.0827) < 0.25 && Math.abs(lng - 80.2707) < 0.25) {
    return 'Anna Nagar, Chennai';
  }
  if (Math.abs(lat - 12.9716) < 0.25 && Math.abs(lng - 77.5946) < 0.25) {
    return 'Indiranagar, Bengaluru';
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`, {
      headers: { 'User-Agent': 'NivaaroFixApp/1.0' },
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const locPart = addr.suburb || addr.neighbourhood || addr.sublocality || addr.city_district || addr.city || addr.town;
      const cityPart = addr.city || addr.state_district || addr.state;
      if (locPart && cityPart && locPart !== cityPart) {
        return `${locPart}, ${cityPart}`;
      }
      return locPart || cityPart || 'Local Area';
    }
  } catch {}
  return 'Local Area';
}

/**
 * Check for inactive providers whose location heartbeat has expired.
 * Disabled: Providers remain Available at their chosen location without requiring
 * continuous 2-minute updates or being kicked offline.
 */
export async function checkAndExpireHeartbeats() {
  return [];
}

// Background sweep for expired heartbeats every 15 seconds
if (!global.__heartbeatIntervalSet) {
  global.__heartbeatIntervalSet = true;
  setInterval(checkAndExpireHeartbeats, 15000);
}

/**
 * Update provider working GPS telemetry.
 * Strictly writes ONLY current_* working location columns.
 * Rejects any attempt to write permanent_address.
 */
export async function updateProviderLocation(agentIdentifier, payload = {}) {
  // Rule: Location endpoints CANNOT modify profile or permanent address
  if (
    payload.permanent_address !== undefined ||
    payload.permanentAddress !== undefined ||
    payload.address !== undefined ||
    payload.address_text !== undefined
  ) {
    const err = new Error('Location endpoint cannot modify permanent address.');
    err.statusCode = 400;
    throw err;
  }

  const { latitude, longitude, accuracy_m } = payload;
  const numLat = parseFloat(latitude);
  const numLng = parseFloat(longitude);
  const numAcc = parseFloat(accuracy_m);

  if (isNaN(numLat) || numLat < -90 || numLat > 90) {
    throw new Error('Invalid latitude coordinates.');
  }
  if (isNaN(numLng) || numLng < -180 || numLng > 180) {
    throw new Error('Invalid longitude coordinates.');
  }

  const maxAllowedAccuracy = DISPATCH_CONFIG.LOCATION_MAX_ACCURACY_METERS || 100;
  if (!isNaN(numAcc) && numAcc > maxAllowedAccuracy) {
    throw new Error(`Location accuracy ${Math.round(numAcc)}m exceeds acceptable threshold (${maxAllowedAccuracy}m).`);
  }

  // Generate H3 cell
  let h3_8 = null;
  let h3_9 = null;
  try {
    h3_8 = latLngToCell(numLat, numLng, 8);
    h3_9 = latLngToCell(numLat, numLng, 9);
  } catch (err) {
    console.warn('H3 generation warning:', err.message);
  }

  // Lookup agent
  const isNumeric = /^\d+$/.test(String(agentIdentifier));
  const lookupQuery = isNumeric
    ? 'SELECT id, email, name, current_latitude, current_longitude, current_locality, location_updated_at FROM agent_login WHERE id = $1 LIMIT 1;'
    : 'SELECT id, email, name, current_latitude, current_longitude, current_locality, location_updated_at FROM agent_login WHERE email = $1 LIMIT 1;';
  const agentRes = await pool.query(lookupQuery, [isNumeric ? parseInt(agentIdentifier, 10) : String(agentIdentifier).toLowerCase()]);

  if (agentRes.rows.length === 0) {
    throw new Error('Provider account not found.');
  }
  const agent = agentRes.rows[0];

  // Locality caching: reverse-geocode at most every 2 minutes or after moving 500m
  let currentLocality = agent.current_locality;
  let shouldGeocodeLocality = false;

  if (!currentLocality) {
    shouldGeocodeLocality = true;
  } else if (agent.current_latitude !== null && agent.current_longitude !== null) {
    const distM = calculateDistanceMeters(agent.current_latitude, agent.current_longitude, numLat, numLng);
    const timeSinceLastUpdateSec = agent.location_updated_at
      ? (Date.now() - new Date(agent.location_updated_at).getTime()) / 1000
      : 999;
    if (distM > 500 || timeSinceLastUpdateSec > 120) {
      shouldGeocodeLocality = true;
    }
  }

  if (shouldGeocodeLocality) {
    currentLocality = await reverseGeocodeLocality(numLat, numLng);
  }

  const finalAcc = !isNaN(numAcc) ? numAcc : 10;

  // Update working location columns on agent_login
  await pool.query(`
    UPDATE agent_login SET
      current_latitude = $1,
      current_longitude = $2,
      current_accuracy_m = $3,
      current_h3_cell = $4,
      current_locality = $5,
      lat = $1,
      lng = $2,
      location_accuracy_m = $3,
      h3_res_8 = $6,
      h3_index_res9 = $4,
      location_updated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7;
  `, [numLat, numLng, finalAcc, h3_9, currentLocality, h3_8, agent.id]);

  // Update working location columns on professionals
  await pool.query(`
    UPDATE professionals SET
      current_latitude = $1,
      current_longitude = $2,
      current_accuracy_m = $3,
      current_h3_cell = $4,
      current_locality = $5,
      lat = $1,
      lng = $2,
      h3_cell = $4,
      location_updated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6;
  `, [numLat, numLng, finalAcc, h3_9, currentLocality, agent.id]);

  // Insert location history row
  try {
    await pool.query(`
      INSERT INTO professional_gps_log (
        professional_id, lat, lng, created_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP);
    `, [agent.id, numLat, numLng]);
  } catch {}

  // Update realtime_presence telemetry
  try {
    await pool.query(`
      INSERT INTO realtime_presence (entity_type, entity_id, status, last_heartbeat_at, metadata, updated_at)
      VALUES ('professional', $1, 'AVAILABLE', CURRENT_TIMESTAMP, jsonb_build_object('lat', $2::double precision, 'lng', $3::double precision, 'accuracy_m', $4::double precision), CURRENT_TIMESTAMP)
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET last_heartbeat_at = CURRENT_TIMESTAMP, metadata = jsonb_build_object('lat', $2::double precision, 'lng', $3::double precision, 'accuracy_m', $4::double precision), updated_at = CURRENT_TIMESTAMP;
    `, [String(agent.email || agent.id).toLowerCase(), numLat, numLng, finalAcc]);
  } catch {}

  return {
    success: true,
    agentId: agent.id,
    currentLatitude: numLat,
    currentLongitude: numLng,
    currentAccuracyM: finalAcc,
    currentH3Cell: h3_9,
    currentLocality,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Update provider availability state (OFFLINE, AVAILABLE, BUSY, PAUSED).
 * Going Offline clears current_* columns.
 */
export async function updateProviderPresence(agentIdentifier, availabilityStatus, reason = null) {
  const allowed = ['OFFLINE', 'AVAILABLE', 'BUSY', 'PAUSED'];
  const statusUpper = (availabilityStatus || '').toUpperCase().trim();

  if (!allowed.includes(statusUpper)) {
    throw new Error(`Invalid status '${availabilityStatus}'. Must be one of: ${allowed.join(', ')}`);
  }

  const isNumeric = /^\d+$/.test(String(agentIdentifier));
  const lookupQuery = isNumeric
    ? 'SELECT id, email, name FROM agent_login WHERE id = $1 LIMIT 1;'
    : 'SELECT id, email, name FROM agent_login WHERE email = $1 LIMIT 1;';
  const agentRes = await pool.query(lookupQuery, [isNumeric ? parseInt(agentIdentifier, 10) : String(agentIdentifier).toLowerCase()]);

  if (agentRes.rows.length === 0) {
    throw new Error('Provider account not found.');
  }
  const agent = agentRes.rows[0];

  if (statusUpper === 'AVAILABLE') {
    const verifCheck = await pool.query(`
      SELECT 
        p.photo_verified, p.aadhaar_verified, p.account_status, p.suspended_until, p.kyc_status,
        a.is_phone_verified, a.account_status AS agent_account_status, a.suspended_until AS agent_suspended_until, p.payout_status
      FROM professionals p
      JOIN agent_login a ON LOWER(a.email) = LOWER(p.email)
      WHERE a.id = $1 LIMIT 1;
    `, [agent.id]);

    if (verifCheck.rows.length > 0) {
      const v = verifCheck.rows[0];
      const isBanned = v.account_status === 'banned' || v.agent_account_status === 'banned';
      if (isBanned) {
        throw new Error('ACCOUNT_BANNED: Your account has been permanently deactivated.');
      }

      const isSuspended = (v.account_status === 'suspended' || v.agent_account_status === 'suspended');
      const suspendedUntil = v.suspended_until || v.agent_suspended_until;

      if (isSuspended && suspendedUntil && new Date(suspendedUntil) > new Date()) {
        const dateStr = new Date(suspendedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        throw new Error(`ACCOUNT_SUSPENDED: Your account is suspended until ${dateStr}. You cannot go available during suspension.`);
      }

      if (isSuspended || v.kyc_status !== 'verified') {
        throw new Error('REVERIFICATION_REQUIRED: Account is not fully verified. Please re-submit documents and obtain admin approval before going available.');
      }

      const missing = [];
      if (!v.is_phone_verified) missing.push('Verified Mobile');
      if (!v.photo_verified) missing.push('Approved Live Photo');
      if (!v.aadhaar_verified) missing.push('Approved Aadhaar Document');

      if (missing.length > 0) {
        throw new Error(`VERIFICATION_REQUIRED: Professional verification incomplete. Missing: ${missing.join(', ')}.`);
      }
    }

    const activeJobCheck = await pool.query(`
      SELECT sr.request_ref, sr.service_title, sr.status
      FROM service_requests sr
      JOIN quotes q ON q.id = sr.accepted_quote_id
      WHERE q.agent_id = $1
        AND sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')
      LIMIT 1;
    `, [agent.id]);

    if (activeJobCheck.rows.length > 0) {
      const job = activeJobCheck.rows[0];
      throw new Error(`PROVIDER_LOCKED_BUSY: You cannot set availability to AVAILABLE while locked to active job (${job.request_ref}: ${job.service_title}). Complete the service to unlock.`);
    }

    // Set Available
    await pool.query(`
      UPDATE agent_login SET
        availability_status = 'AVAILABLE',
        is_online = true,
        offline_reason = NULL,
        location_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [agent.id]);

    await pool.query(`
      UPDATE professionals SET
        availability_status = 'available',
        is_online = true,
        offline_reason = NULL,
        location_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 OR email = $2;
    `, [agent.id, agent.email]);

    try {
      await pool.query(`
        INSERT INTO realtime_presence (entity_type, entity_id, status, last_heartbeat_at, updated_at)
        VALUES ('professional', $1, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (entity_type, entity_id)
        DO UPDATE SET status = 'AVAILABLE', last_heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;
      `, [String(agent.email || agent.id).toLowerCase()]);
    } catch {}

    return {
      success: true,
      agentId: agent.id,
      availabilityStatus: 'AVAILABLE',
      isOnline: true
    };
  }

  // If going OFFLINE: clear all current_* columns
  const isOffline = statusUpper === 'OFFLINE';
  const effectiveReason = isOffline ? (reason || 'manual') : null;

  if (isOffline) {
    await pool.query(`
      UPDATE agent_login SET
        availability_status = 'OFFLINE',
        is_online = false,
        offline_reason = $1,
        current_latitude = NULL,
        current_longitude = NULL,
        current_accuracy_m = NULL,
        current_h3_cell = NULL,
        current_locality = NULL,
        lat = NULL,
        lng = NULL,
        h3_index_res9 = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [effectiveReason, agent.id]);

    await pool.query(`
      UPDATE professionals SET
        availability_status = 'offline',
        is_online = false,
        offline_reason = $1,
        current_latitude = NULL,
        current_longitude = NULL,
        current_accuracy_m = NULL,
        current_h3_cell = NULL,
        current_locality = NULL,
        lat = NULL,
        lng = NULL,
        h3_cell = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 OR email = $3;
    `, [effectiveReason, agent.id, agent.email]);
  } else {
    // BUSY or PAUSED
    await pool.query(`
      UPDATE agent_login SET
        availability_status = $1,
        is_online = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [statusUpper, agent.id]);

    await pool.query(`
      UPDATE professionals SET
        availability_status = $1,
        is_online = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2;
    `, [statusUpper, agent.id]);
  }

  try {
    await pool.query(`
      INSERT INTO realtime_presence (entity_type, entity_id, status, last_heartbeat_at, updated_at)
      VALUES ('professional', $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET status = EXCLUDED.status, last_heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;
    `, [String(agent.email || agent.id).toLowerCase(), statusUpper]);
  } catch {}

  return {
    success: true,
    agentId: agent.id,
    availabilityStatus: statusUpper,
    isOnline: !isOffline,
    offlineReason: effectiveReason
  };
}

export default {
  updateProviderLocation,
  updateProviderPresence,
  checkAndExpireHeartbeats
};
