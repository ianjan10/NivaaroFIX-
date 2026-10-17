import { WebSocketServer } from 'ws';
import { pool } from '../../config/db.js';
import { haversineDistance } from '../../utils/geoDispatch.js';
import { notifyCustomer } from '../realtime/realtimeService.js';

// In-memory telemetry storage per active job:
// Map<jobRef, {
//   assignedProId: number,
//   assignedProEmail: string,
//   customerEmail: string,
//   destLat: number,
//   destLng: number,
//   latestPosition: { lat, lng, accuracy, heading, speed, updatedAt },
//   breadcrumbs: Array<{ lat, lng, timestamp }>,
//   lastRouteCalculatedAt: number,
//   lastRouteCoords: { lat, lng },
//   cachedRoute: Array<[number, number]>,
//   cachedEtaMinutes: number,
//   cachedDistanceKm: number,
//   proSockets: Set<WebSocket>,
//   customerSockets: Set<WebSocket>
// }>
const activeJobChannels = new Map();

/**
 * Fetch or initialize tracking channel metadata from DB.
 */
export async function getOrInitChannel(jobRef) {
  if (activeJobChannels.has(jobRef)) {
    return activeJobChannels.get(jobRef);
  }

  const res = await pool.query(`
    SELECT sr.id, sr.request_ref, sr.assigned_professional_id, sr.user_email, sr.lat, sr.lng,
           al.email AS pro_email
    FROM service_requests sr
    LEFT JOIN agent_login al ON al.id = sr.assigned_professional_id
    WHERE sr.request_ref = $1;
  `, [jobRef]);

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  const channel = {
    jobRef,
    assignedProId: row.assigned_professional_id,
    assignedProEmail: (row.pro_email || '').toLowerCase(),
    customerEmail: (row.user_email || '').toLowerCase(),
    destLat: parseFloat(row.lat),
    destLng: parseFloat(row.lng),
    latestPosition: null,
    breadcrumbs: [],
    lastRouteCalculatedAt: 0,
    lastRouteCoords: null,
    cachedRoute: null,
    cachedEtaMinutes: 15,
    cachedDistanceKm: 2.5,
    proSockets: new Set(),
    customerSockets: new Set()
  };

  activeJobChannels.set(jobRef, channel);
  return channel;
}

/**
 * Delete tracking breadcrumbs and channel when job completes or cancels.
 */
export function cleanupJobTracking(jobRef) {
  const channel = activeJobChannels.get(jobRef);
  if (channel) {
    const closeMsg = JSON.stringify({ type: 'job_ended', jobRef });
    channel.proSockets.forEach(ws => {
      try { ws.send(closeMsg); } catch {}
    });
    channel.customerSockets.forEach(ws => {
      try { ws.send(closeMsg); } catch {}
    });
    activeJobChannels.delete(jobRef);
  }
}

/**
 * Calculate heading angle in degrees between two lat/lng coordinates.
 */
export function calculateHeading(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Fetch real road route & ETA from OSRM driving API with graceful fallback.
 */
export async function fetchRoadRoute(fromLat, fromLng, toLat, toLng) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const etaMinutes = Math.max(1, Math.round(route.duration / 60));
        return { coordinates, distanceKm, etaMinutes };
      }
    }
  } catch (err) {
    // network timeout or OSRM unavailable
  }

  // Fallback: Generate direct road line
  const distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
  const etaMins = Math.max(2, Math.round((distKm / 25) * 60)); // ~25 km/h urban average speed
  return {
    coordinates: [[fromLat, fromLng], [toLat, toLng]],
    distanceKm: Number(distKm.toFixed(2)),
    etaMinutes: etaMins
  };
}

/**
 * Process location update from professional: filter, smooth, snap & broadcast.
 */
export async function processLocationUpdate(jobRef, rawLocation, proEmail) {
  const channel = await getOrInitChannel(jobRef);
  if (!channel) {
    return { success: false, error: 'Job not found' };
  }

  // Authorization check: Only assigned professional can publish
  if (proEmail && channel.assignedProEmail && channel.assignedProEmail !== proEmail.toLowerCase()) {
    return { success: false, error: 'Unauthorized: You are not the assigned professional for this job.' };
  }

  const {
    lat: rawLat,
    lng: rawLng,
    accuracy = 10,
    heading: rawHeading = null,
    speed = null
  } = rawLocation;

  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);

  if (isNaN(lat) || isNaN(lng)) {
    return { success: false, error: 'Invalid coordinates' };
  }

  // 1. Accuracy filter: discard readings worse than ~50m
  if (accuracy > 50) {
    return { success: false, ignored: true, reason: 'Accuracy exceeds 50m threshold' };
  }

  const now = Date.now();
  const prev = channel.latestPosition;

  // 2. Impossible jump detection: discard jumps > 500m in < 5 seconds
  if (prev) {
    const timeDeltaSec = Math.max(1, (now - prev.updatedAt) / 1000);
    const jumpKm = haversineDistance(prev.lat, prev.lng, lat, lng);
    const speedKmh = (jumpKm / (timeDeltaSec / 3600));

    if (jumpKm > 0.5 && timeDeltaSec < 5 && speedKmh > 140) {
      return { success: false, ignored: true, reason: 'Impossible jump detected' };
    }
  }

  // 3. Smooth coordinates (exponential smoothing 0.7 new + 0.3 old)
  let smoothedLat = lat;
  let smoothedLng = lng;
  if (prev) {
    smoothedLat = parseFloat((0.7 * lat + 0.3 * prev.lat).toFixed(6));
    smoothedLng = parseFloat((0.7 * lng + 0.3 * prev.lng).toFixed(6));
  }

  // 4. Heading calculation
  let finalHeading = rawHeading;
  if ((finalHeading === null || isNaN(finalHeading) || finalHeading === 0) && prev) {
    const distM = haversineDistance(prev.lat, prev.lng, smoothedLat, smoothedLng) * 1000;
    if (distM > 3) {
      finalHeading = calculateHeading(prev.lat, prev.lng, smoothedLat, smoothedLng);
    } else {
      finalHeading = prev.heading || 0;
    }
  }
  finalHeading = finalHeading !== null ? Math.round(finalHeading) : 0;

  // 5. Update latest position & breadcrumb (keep last 20)
  channel.latestPosition = {
    lat: smoothedLat,
    lng: smoothedLng,
    accuracy: Math.round(accuracy),
    heading: finalHeading,
    speed: speed ? parseFloat(speed) : 0,
    updatedAt: now
  };

  channel.breadcrumbs.push({ lat: smoothedLat, lng: smoothedLng, timestamp: now });
  if (channel.breadcrumbs.length > 20) {
    channel.breadcrumbs.shift();
  }

  // 6. Route and ETA computation: recomputed every 15 to 30 seconds or when deviating > 50m
  let needsNewRoute = false;
  if (!channel.cachedRoute) {
    needsNewRoute = true;
  } else if (now - channel.lastRouteCalculatedAt > 20000) {
    needsNewRoute = true;
  } else if (channel.lastRouteCoords) {
    const devMeters = haversineDistance(
      channel.lastRouteCoords.lat,
      channel.lastRouteCoords.lng,
      smoothedLat,
      smoothedLng
    ) * 1000;
    if (devMeters > 50) {
      needsNewRoute = true;
    }
  }

  if (needsNewRoute && channel.destLat && channel.destLng) {
    const routeData = await fetchRoadRoute(
      smoothedLat,
      smoothedLng,
      channel.destLat,
      channel.destLng
    );
    channel.cachedRoute = routeData.coordinates;
    channel.cachedDistanceKm = routeData.distanceKm;
    channel.cachedEtaMinutes = routeData.etaMinutes;
    channel.lastRouteCalculatedAt = now;
    channel.lastRouteCoords = { lat: smoothedLat, lng: smoothedLng };
  }

  // 7. Payload for customer
  const updatePayload = {
    type: 'location_update',
    jobRef,
    lat: smoothedLat,
    lng: smoothedLng,
    heading: finalHeading,
    speed: channel.latestPosition.speed,
    accuracy: channel.latestPosition.accuracy,
    route: channel.cachedRoute || [[smoothedLat, smoothedLng], [channel.destLat, channel.destLng]],
    distanceKm: channel.cachedDistanceKm,
    etaMinutes: channel.cachedEtaMinutes,
    updatedAt: new Date(now).toISOString()
  };

  // Broadcast to customer WebSocket subscribers
  const jsonStr = JSON.stringify(updatePayload);
  channel.customerSockets.forEach(ws => {
    try {
      if (ws.readyState === 1) ws.send(jsonStr);
    } catch {}
  });

  // Also broadcast over SSE fallback channel
  notifyCustomer(jobRef, 'location.update', updatePayload);

  return { success: true, payload: updatePayload };
}

/**
 * Initialize WebSocket Server for Realtime Location Pipeline.
 */
export function initTrackingWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws/tracking' });

  wss.on('connection', (ws) => {
    let currentJobRef = null;
    let currentRole = null;

    ws.on('message', async (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());

        // 1. Subscription handshake: { type: 'subscribe', jobRef, role, email }
        if (msg.type === 'subscribe') {
          const { jobRef, role, email } = msg;
          if (!jobRef) return ws.send(JSON.stringify({ type: 'error', error: 'jobRef is required' }));

          const channel = await getOrInitChannel(jobRef);
          if (!channel) {
            return ws.send(JSON.stringify({ type: 'error', error: 'Active job not found' }));
          }

          currentJobRef = jobRef;
          currentRole = role;

          if (role === 'professional') {
            channel.proSockets.add(ws);
            ws.send(JSON.stringify({
              type: 'subscribed',
              jobRef,
              role: 'professional',
              destLat: channel.destLat,
              destLng: channel.destLng
            }));
          } else {
            // Customer role
            channel.customerSockets.add(ws);
            ws.send(JSON.stringify({
              type: 'subscribed',
              jobRef,
              role: 'customer',
              latestPosition: channel.latestPosition,
              route: channel.cachedRoute,
              etaMinutes: channel.cachedEtaMinutes,
              distanceKm: channel.cachedDistanceKm
            }));
          }
        }

        // 2. Professional sends high-accuracy location telemetry:
        // { type: 'publish_location', jobRef, lat, lng, accuracy, heading, speed, email }
        if (msg.type === 'publish_location' || msg.type === 'location') {
          const jobRef = msg.jobRef || currentJobRef;
          if (!jobRef) return;

          const res = await processLocationUpdate(jobRef, msg, msg.email);
          if (res.success) {
            ws.send(JSON.stringify({ type: 'location_ack', jobRef, timestamp: Date.now() }));
          }
        }
      } catch (err) {
        console.error('Tracking socket message error:', err.message);
      }
    });

    ws.on('close', () => {
      if (currentJobRef && activeJobChannels.has(currentJobRef)) {
        const channel = activeJobChannels.get(currentJobRef);
        if (currentRole === 'professional') {
          channel.proSockets.delete(ws);
        } else {
          channel.customerSockets.delete(ws);
        }
      }
    });
  });

  console.log('🛰️ Real-time high-accuracy tracking WebSocket attached on /ws/tracking');
  return wss;
}
