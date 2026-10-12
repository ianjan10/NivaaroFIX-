import { latLngToCell } from 'h3-js';
import { pool } from '../../config/db.js';
import { DISPATCH_CONFIG } from '../../config/dispatchConfig.js';

/**
 * Update provider GPS telemetry with validation and H3 multi-resolution indexing.
 */
export async function updateProviderLocation(agentIdentifier, { latitude, longitude, accuracy_m }) {
  const numLat = parseFloat(latitude);
  const numLng = parseFloat(longitude);
  const numAcc = parseFloat(accuracy_m);

  if (isNaN(numLat) || numLat < -90 || numLat > 90) {
    throw new Error('Invalid latitude coordinates.');
  }
  if (isNaN(numLng) || numLng < -180 || numLng > 180) {
    throw new Error('Invalid longitude coordinates.');
  }

  // Reject inaccurate GPS fixes
  const maxAllowedAccuracy = DISPATCH_CONFIG.LOCATION_MAX_ACCURACY_METERS || 100;
  if (!isNaN(numAcc) && numAcc > maxAllowedAccuracy) {
    throw new Error(`Location accuracy ${Math.round(numAcc)}m exceeds acceptable threshold (${maxAllowedAccuracy}m).`);
  }

  // Generate H3 cells
  let h3_8 = null;
  let h3_9 = null;
  try {
    h3_8 = latLngToCell(numLat, numLng, 8);
    h3_9 = latLngToCell(numLat, numLng, 9);
  } catch (err) {
    console.warn('H3 generation warning:', err.message);
  }

  // Determine agent ID
  const isNumeric = /^\d+$/.test(String(agentIdentifier));
  const lookupQuery = isNumeric
    ? 'SELECT id, email, name FROM agent_login WHERE id = $1 LIMIT 1;'
    : 'SELECT id, email, name FROM agent_login WHERE email = $1 LIMIT 1;';
  const agentRes = await pool.query(lookupQuery, [isNumeric ? parseInt(agentIdentifier, 10) : String(agentIdentifier).toLowerCase()]);

  if (agentRes.rows.length === 0) {
    throw new Error('Provider account not found.');
  }
  const agent = agentRes.rows[0];

  // Update current location in agent_login
  await pool.query(`
    UPDATE agent_login SET
      lat = $1,
      lng = $2,
      location_accuracy_m = $3,
      h3_res_8 = $4,
      h3_index_res9 = $5,
      location_updated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6;
  `, [numLat, numLng, !isNaN(numAcc) ? numAcc : 10, h3_8, h3_9, agent.id]);

  // Insert location history row
  await pool.query(`
    INSERT INTO provider_locations (
      agent_id, latitude, longitude, accuracy_m, h3_res_8, h3_res_9, recorded_at
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP);
  `, [agent.id, numLat, numLng, !isNaN(numAcc) ? numAcc : 10, h3_8, h3_9]);

  return {
    success: true,
    agentId: agent.id,
    latitude: numLat,
    longitude: numLng,
    accuracyMeters: !isNaN(numAcc) ? numAcc : 10,
    h3_res_8: h3_8,
    h3_res_9: h3_9,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Update provider availability state (OFFLINE, AVAILABLE, BUSY, PAUSED).
 */
export async function updateProviderPresence(agentIdentifier, availabilityStatus) {
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

  // Exclusive Job-Lock: Reject override to AVAILABLE if provider is locked to an active job
  if (statusUpper === 'AVAILABLE') {
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
  }

  const isOnline = statusUpper === 'AVAILABLE';

  await pool.query(`
    UPDATE agent_login SET
      availability_status = $1,
      is_online = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3;
  `, [statusUpper, isOnline, agent.id]);

  return {
    success: true,
    agentId: agent.id,
    availabilityStatus: statusUpper,
    isOnline
  };
}

export default {
  updateProviderLocation,
  updateProviderPresence
};
