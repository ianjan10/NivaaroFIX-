import { latLngToCell, gridDisk } from 'h3-js';
import { pool } from '../config/db.js';

/**
 * NivaaroFix Geospatial Dispatch Utility
 *
 * Uses H3 (v4.x) at resolution 9 (~201m edge length) for hierarchical
 * candidate-cell expansion, with Haversine as the exact distance filter.
 *
 * H3 resolution 9 is optimal for urban dispatch partitioning.
 * PostGIS (ST_DWithin, KNN) can be layered on top when available.
 */

const H3_RESOLUTION = 9;

/**
 * Convert latitude/longitude to H3 cell index at resolution 9.
 * @param {number} lat
 * @param {number} lng
 * @returns {string} H3 cell index
 */
export function latLngToH3(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    return latLngToCell(lat, lng, H3_RESOLUTION);
  } catch (err) {
    console.warn('H3 latLngToCell error:', err.message);
    return null;
  }
}

/**
 * Get the set of H3 cells within `ringSize` rings of the origin cell.
 * Ring 0 = origin cell only. Ring 1 = origin + immediate neighbors (7 cells).
 * Ring 2 = ~19 cells, Ring 3 = ~37 cells, etc.
 *
 * @param {string} h3Index - Origin H3 cell
 * @param {number} ringSize - Number of rings to expand (default 2)
 * @returns {string[]} Array of H3 cell indexes
 */
export function getNearbyCells(h3Index, ringSize = 2) {
  if (!h3Index) return [];
  try {
    return gridDisk(h3Index, ringSize);
  } catch (err) {
    console.warn('H3 gridDisk error:', err.message);
    return [h3Index]; // Fallback to origin cell only
  }
}

/**
 * Haversine distance between two lat/lng points in kilometers.
 * Used as the exact distance filter after H3 candidate expansion.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in km
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Standard radius expansion tiers for technician matching:
 * Tier 1: 1 km (Immediate neighborhood)
 * Tier 2: 3 km (Locality / Suburb)
 * Tier 3: 5 km (Extended district)
 * Tier 4: 10 km (Metropolitan radius maximum)
 */
export const RADIUS_EXPANSION_TIERS_KM = [1, 3, 5, 10];

/**
 * Expanding-radius technician search across defined tiers:
 * Tier 1 (1 km) -> Tier 2 (3 km) -> Tier 3 (5 km) -> Tier 4 (10 km).
 *
 * Search strategy:
 * 1. Evaluate candidate providers in the smallest radius tier first (1 km).
 * 2. If zero verified, online providers are found, automatically escalate to the next tier.
 * 3. Within any matched tier: Sort strictly by distance (ascending) first,
 *    then by provider rating and completed job count (descending) as secondary tie-breakers.
 * 4. Stop immediately once at least one qualified provider is matched, or return none if 10 km is exhausted.
 *
 * INFRASTRUCTURE DEPENDENCY NOTES:
 * - Real-time provider GPS coordinates and live heartbeat status depend on the provider
 *   mobile client/app actively reporting telemetry (`provider_locations` / `agent_login.lat/lng`).
 * - Geocoding fallback: If client browser GPS is blocked, the request coordinates fall back to
 *   city-center reference coordinates or profile-saved locality geocoding.
 *
 * @param {number} lat - Request service address latitude
 * @param {number} lng - Request service address longitude
 * @param {string} category - Service category ('electrician', 'plumber', 'carpenter', etc.)
 * @param {number[]} tiers - Radius tiers in km (default: [1, 3, 5, 10])
 * @returns {Promise<{
 *   matched: boolean,
 *   matchedTierKm: number|null,
 *   tiersSearched: number[],
 *   totalMatched: number,
 *   providers: Array
 * }>}
 */
export async function findNearbyProvidersExpandingRadius(
  lat,
  lng,
  category = 'electrician',
  tiers = RADIUS_EXPANSION_TIERS_KM
) {
  const tiersSearched = [];

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return {
      matched: false,
      matchedTierKm: null,
      tiersSearched,
      totalMatched: 0,
      providers: [],
      reason: 'INVALID_COORDINATES'
    };
  }

  for (const tierKm of tiers) {
    tiersSearched.push(tierKm);
    const ringSize = radiusToRingSize(tierKm);

    // Query candidate providers within this tier
    const candidates = await findNearbyProviders(lat, lng, category, tierKm, ringSize);

    if (candidates && candidates.length > 0) {
      // Sort within the tier: distance ascending (primary), rating descending (secondary), completed jobs descending (tertiary)
      const sortedCandidates = [...candidates].sort((a, b) => {
        if (Math.abs(a.distanceKm - b.distanceKm) > 0.05) {
          return a.distanceKm - b.distanceKm;
        }
        const ratingA = parseFloat(a.rating || 5.0);
        const ratingB = parseFloat(b.rating || 5.0);
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
        return (b.completed_jobs || 0) - (a.completed_jobs || 0);
      });

      return {
        matched: true,
        matchedTierKm: tierKm,
        tiersSearched,
        totalMatched: sortedCandidates.length,
        providers: sortedCandidates
      };
    }
  }

  // Exhausted all tiers up to maximum (10 km) with zero matches
  return {
    matched: false,
    matchedTierKm: null,
    tiersSearched,
    totalMatched: 0,
    providers: []
  };
}

/**
 * Find online providers near a given location, filtered by category.
 *
 * Strategy:
 * 1. Compute the H3 cell of the request location at resolution 9.
 * 2. Expand to `ringSize` rings using gridDisk.
 * 3. Query agent_login for providers whose h3_index_res9 is in the cell set.
 * 4. Apply Haversine distance filter and sort by distance ascending.
 *
 * @param {number} lat - Request latitude
 * @param {number} lng - Request longitude
 * @param {string} category - 'electrician', 'plumber', or 'both'
 * @param {number} radiusKm - Maximum distance in km (default 10)
 * @param {number} ringSize - H3 ring expansion size (default 3)
 * @returns {Promise<Array>} Sorted array of nearby providers with distance
 */
export async function findNearbyProviders(lat, lng, category = 'electrician', radiusKm = 10, ringSize = 3) {
  const h3Index = latLngToH3(lat, lng);
  let candidates = [];

  if (h3Index) {
    // H3 cell-based candidate selection
    const cells = getNearbyCells(h3Index, ringSize);
    const placeholders = cells.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      SELECT id, partner_id, name, email, phone, trade, experience_years,
             rating, completed_jobs, is_online, lat, lng, h3_index_res9
      FROM agent_login
      WHERE is_online = true
        AND h3_index_res9 IN (${placeholders})
        AND lat IS NOT NULL
        AND lng IS NOT NULL
        AND (trade = $${cells.length + 1} OR trade = 'both')
      ORDER BY rating DESC, completed_jobs DESC;
    `;

    const result = await pool.query(query, [...cells, category]);
    candidates = result.rows;
  } else {
    // Fallback: no H3 cell available, fetch all online providers in the category
    const result = await pool.query(`
      SELECT id, partner_id, name, email, phone, trade, experience_years,
             rating, completed_jobs, is_online, lat, lng, h3_index_res9
      FROM agent_login
      WHERE is_online = true
        AND lat IS NOT NULL
        AND lng IS NOT NULL
        AND (trade = $1 OR trade = 'both')
      ORDER BY rating DESC, completed_jobs DESC
      LIMIT 50;
    `, [category]);
    candidates = result.rows;
  }

  // Apply Haversine distance filter and sort by distance
  const withDistance = candidates
    .map(provider => ({
      ...provider,
      distanceKm: haversineDistance(lat, lng, parseFloat(provider.lat), parseFloat(provider.lng))
    }))
    .filter(p => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return withDistance;
}

/**
 * Get the ring size needed to cover a given radius at H3 resolution 9.
 * At res 9, average edge length is ~201m. A ring of k covers roughly k * 400m.
 *
 * @param {number} radiusKm
 * @returns {number} Ring size
 */
export function radiusToRingSize(radiusKm) {
  const edgeLengthKm = 0.201; // H3 res 9 average edge length
  const approxCellDiameter = edgeLengthKm * 2;
  return Math.max(1, Math.ceil(radiusKm / approxCellDiameter));
}

/**
 * Standard coordinates for major Indian metropolitan hubs.
 * Provides fallback coordinates for H3 indexing when browser GPS is unavailable.
 */
export const CITY_COORDINATES = {
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  delhi: { lat: 28.7041, lng: 77.1025 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  surat: { lat: 21.1702, lng: 72.8311 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  kanpur: { lat: 26.4499, lng: 80.3319 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  indore: { lat: 22.7196, lng: 75.8577 },
  thane: { lat: 19.2183, lng: 72.9781 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  patna: { lat: 25.5941, lng: 85.1376 },
  vadodara: { lat: 22.3072, lng: 73.1812 },
  coimbatore: { lat: 11.0168, lng: 76.9558 }
};

export function getCityCoordinates(city) {
  if (!city || typeof city !== 'string') return null;
  const normalized = city.trim().toLowerCase();
  return CITY_COORDINATES[normalized] || null;
}

