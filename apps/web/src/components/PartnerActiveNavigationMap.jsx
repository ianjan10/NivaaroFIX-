import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Destination marker: Uber-style square black pin with emerald center dot
const createDestinationPin = () => L.divIcon({
  className: 'partner-nav-dest-pin',
  html: `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(5, 150, 105, 0.18); animation: navPulsePin 2s infinite ease-out;"></div>
      <div style="width: 22px; height: 22px; background: #0f172a; border: 2.5px solid #ffffff; border-radius: 5px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 2;">
        <div style="width: 6px; height: 6px; background: #10b981; border-radius: 1px;"></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// Partner navigation vehicle marker: directional emerald arrow with heading rotation
const createPartnerMarker = (heading = 0) => L.divIcon({
  className: 'partner-nav-vehicle-pin',
  html: `
    <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: rgba(5, 150, 105, 0.25); animation: navPulsePin 1.5s infinite ease-out;"></div>
      <div style="width: 32px; height: 32px; background: #059669; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 14px rgba(5,150,105,0.45); display: flex; align-items: center; justify-content: center; transform: rotate(${heading}deg); transition: transform 0.35s ease-out; z-index: 2;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff" stroke="none">
          <polygon points="12,2 22,21 12,17 2,21" />
        </svg>
      </div>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19]
});

/**
 * Calculate heading angle in degrees between two lat/lng coordinates.
 */
function computeBearing(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export default function PartnerActiveNavigationMap({
  job,
  currentAgent,
  onLocationUpdate
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const casingPolylineRef = useRef(null);
  const routePolylineRef = useRef(null);
  const partnerMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const socketRef = useRef(null);
  const simTimerRef = useRef(null);

  const jobRef = job?.requestRef || job?.bookingRef || job?.id;
  const destLat = parseFloat(job?.lat || job?.service_lat || 12.9716);
  const destLng = parseFloat(job?.lng || job?.service_lng || 77.5946);

  const initialLat = parseFloat(currentAgent?.lat || destLat - 0.015);
  const initialLng = parseFloat(currentAgent?.lng || destLng - 0.012);

  const [partnerPos, setPartnerPos] = useState({
    lat: initialLat,
    lng: initialLng,
    heading: 0,
    speed: 0
  });

  const [etaMinutes, setEtaMinutes] = useState(12);
  const [distanceKm, setDistanceKm] = useState(2.8);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [cachedRouteCoords, setCachedRouteCoords] = useState([]);
  const [liveAccuracy, setLiveAccuracy] = useState(10);
  const [telemetryCount, setTelemetryCount] = useState(0);

  // Send telemetry payload to backend WebSocket and HTTP fallback
  const broadcastTelemetry = useCallback((lat, lng, heading = 0, speed = 0, accuracy = 10) => {
    if (!jobRef) return;

    // 1. WebSocket stream
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({
          type: 'publish_location',
          jobRef,
          lat,
          lng,
          heading: Math.round(heading),
          speed: Number(speed.toFixed(1)),
          accuracy: Math.round(accuracy),
          email: currentAgent?.email
        }));
      } catch (err) {}
    }

    // 2. HTTP fallback for high reliability
    fetch(`/api/dispatch/job/${jobRef}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        heading: Math.round(heading),
        speed: Number(speed.toFixed(1)),
        accuracy: Math.round(accuracy),
        email: currentAgent?.email
      })
    }).catch(() => {});

    if (onLocationUpdate) {
      onLocationUpdate(lat, lng);
    }

    setTelemetryCount(prev => prev + 1);
  }, [jobRef, currentAgent?.email, onLocationUpdate]);

  // Update Route Polyline with high contrast styling
  const updateRouteLine = useCallback((coordinates) => {
    if (!mapInstanceRef.current || !coordinates || coordinates.length < 2) return;

    if (casingPolylineRef.current) casingPolylineRef.current.remove();
    if (routePolylineRef.current) routePolylineRef.current.remove();

    // White outer casing
    casingPolylineRef.current = L.polyline(coordinates, {
      color: '#ffffff',
      weight: 7,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstanceRef.current);

    // Dark high-contrast inner route (Uber style)
    routePolylineRef.current = L.polyline(coordinates, {
      color: '#0f172a',
      weight: 4.5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstanceRef.current);
  }, []);

  // Fetch real road route from OSRM
  const fetchRoute = useCallback(async (startLat, startLng, endLat, endLng) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const dist = Number((route.distance / 1000).toFixed(1));
          const eta = Math.max(1, Math.round(route.duration / 60));

          setCachedRouteCoords(coords);
          setDistanceKm(dist);
          setEtaMinutes(eta);
          updateRouteLine(coords);
          return coords;
        }
      }
    } catch (err) {}

    // Fallback: direct line
    const fallbackCoords = [[startLat, startLng], [endLat, endLng]];
    setCachedRouteCoords(fallbackCoords);
    updateRouteLine(fallbackCoords);
    return fallbackCoords;
  }, [updateRouteLine]);

  // Smooth animated movement for partner marker
  const animateMarkerTo = useCallback((targetLat, targetLng, targetHeading) => {
    if (!partnerMarkerRef.current) return;
    const startLatLng = partnerMarkerRef.current.getLatLng();
    const startLat = startLatLng.lat;
    const startLng = startLatLng.lng;
    const startTime = performance.now();
    const duration = 650;

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;

      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.setLatLng([currentLat, currentLng]);
        partnerMarkerRef.current.setIcon(createPartnerMarker(targetHeading));
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      }
    };

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [partnerPos.lat, partnerPos.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    // Clean OpenStreetMap tiles (no API key required)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Destination Pin
    destMarkerRef.current = L.marker([destLat, destLng], {
      icon: createDestinationPin(),
      zIndexOffset: 1000
    }).addTo(map);

    // Partner Marker
    partnerMarkerRef.current = L.marker([partnerPos.lat, partnerPos.lng], {
      icon: createPartnerMarker(partnerPos.heading),
      zIndexOffset: 2000
    }).addTo(map);

    // Fit initial bounds
    const bounds = L.latLngBounds([[partnerPos.lat, partnerPos.lng], [destLat, destLng]]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });

    map.on('dragstart', () => {
      setIsFollowing(false);
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      try { map.invalidateSize(); } catch {}
    }, 200);

    // Initial route fetch
    fetchRoute(partnerPos.lat, partnerPos.lng, destLat, destLng);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      try { map.remove(); } catch {}
      mapInstanceRef.current = null;
    };
  }, []);

  // Connect WebSocket for Pro role
  useEffect(() => {
    if (!jobRef) return;

    let ws = null;
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/tracking`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          jobRef,
          role: 'professional',
          email: currentAgent?.email
        }));
      };

      socketRef.current = ws;
    } catch (e) {}

    return () => {
      if (ws) ws.close();
    };
  }, [jobRef, currentAgent?.email]);

  // Real-time Geolocation tracking via browser watchPosition
  useEffect(() => {
    if (isSimulating) return;
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let prevCoords = null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy || 10);
        const speed = pos.coords.speed ? pos.coords.speed * 3.6 : 0; // m/s to km/h

        let heading = pos.coords.heading;
        if ((heading === null || isNaN(heading) || heading === 0) && prevCoords) {
          heading = computeBearing(prevCoords.lat, prevCoords.lng, lat, lng);
        }
        heading = heading !== null && !isNaN(heading) ? Math.round(heading) : 0;

        prevCoords = { lat, lng };

        setPartnerPos({ lat, lng, heading, speed });
        setLiveAccuracy(accuracy);
        animateMarkerTo(lat, lng, heading);

        if (isFollowing && mapInstanceRef.current) {
          mapInstanceRef.current.panTo([lat, lng], { animate: true, duration: 0.6 });
        }

        // Broadcast to backend & customer
        broadcastTelemetry(lat, lng, heading, speed, accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isSimulating, isFollowing, animateMarkerTo, broadcastTelemetry]);

  // Interactive Route Simulation Engine (For demo/testing without vehicle)
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      setIsSimulating(false);
      return;
    }

    if (!cachedRouteCoords || cachedRouteCoords.length < 2) {
      fetchRoute(partnerPos.lat, partnerPos.lng, destLat, destLng).then((coords) => {
        startSimulationOnCoords(coords);
      });
      return;
    }

    startSimulationOnCoords(cachedRouteCoords);
  };

  const startSimulationOnCoords = (coords) => {
    if (!coords || coords.length < 2) return;
    setIsSimulating(true);

    let stepIdx = 0;
    const totalSteps = coords.length;

    simTimerRef.current = setInterval(() => {
      if (stepIdx >= totalSteps - 1) {
        clearInterval(simTimerRef.current);
        setIsSimulating(false);
        return;
      }

      const currentPoint = coords[stepIdx];
      const nextPoint = coords[stepIdx + 1];
      const heading = computeBearing(currentPoint[0], currentPoint[1], nextPoint[0], nextPoint[1]);
      const speed = 28 + Math.round(Math.random() * 8); // ~28-36 km/h realistic urban speed

      stepIdx += 1;

      setPartnerPos({
        lat: nextPoint[0],
        lng: nextPoint[1],
        heading,
        speed
      });

      animateMarkerTo(nextPoint[0], nextPoint[1], heading);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo([nextPoint[0], nextPoint[1]], { animate: true, duration: 0.6 });
      }

      // Compute remaining distance & ETA
      const remainingFraction = 1 - (stepIdx / totalSteps);
      const remainingDist = Number((distanceKm * remainingFraction).toFixed(1));
      const remainingEta = Math.max(1, Math.round(etaMinutes * remainingFraction));

      setDistanceKm(remainingDist);
      setEtaMinutes(remainingEta);

      // Broadcast telemetry to backend & customer
      broadcastTelemetry(nextPoint[0], nextPoint[1], heading, speed, 8);
    }, 1400);
  };

  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, []);

  const handleRecenter = () => {
    if (mapInstanceRef.current && partnerPos) {
      mapInstanceRef.current.panTo([partnerPos.lat, partnerPos.lng], { animate: true, duration: 0.5 });
      setIsFollowing(true);
    }
  };

  const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
    }}>
      {/* Top Navigation HUD Header */}
      <div style={{
        padding: '10px 14px',
        background: '#0f172a',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isSimulating ? '#f59e0b' : '#10b981',
            boxShadow: `0 0 8px ${isSimulating ? '#f59e0b' : '#10b981'}`
          }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {isSimulating ? 'Simulating Road Navigation' : 'Live Road Telemetry Streaming'}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.12)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: '#cbd5e1'
          }}>
            Accuracy: {liveAccuracy}m
          </span>
        </div>

        {/* ETA & Distance Hero Readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399' }}>
            {etaMinutes} min · {distanceKm} km
          </span>
          {partnerPos.speed > 0 && (
            <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>
              {Math.round(partnerPos.speed)} km/h
            </span>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Recenter button */}
        {!isFollowing && (
          <button
            type="button"
            onClick={handleRecenter}
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              zIndex: 1000,
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Recenter</span>
          </button>
        )}
      </div>

      {/* Bottom Action Strip: External Google Maps Turn-by-Turn + Simulation Toggle */}
      <div style={{
        padding: '10px 14px',
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {/* Turn-by-Turn External Link */}
        <a
          href={googleMapsNavUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#059669',
            color: '#ffffff',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(5,150,105,0.3)',
            transition: 'background 0.2s ease'
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
          <span>Open in Google Maps Navigation</span>
        </a>

        {/* Demo Simulation Action */}
        <button
          type="button"
          onClick={toggleSimulation}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isSimulating ? '#ef4444' : '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {isSimulating ? (
              <rect x="6" y="6" width="12" height="12" />
            ) : (
              <polygon points="5 3 19 12 5 21 5 3" />
            )}
          </svg>
          <span>{isSimulating ? 'Stop Driving Simulation' : 'Simulate Live GPS Route'}</span>
        </button>
      </div>

      <style>{`
        @keyframes navPulsePin {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
