import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Destination marker: square black icon with white dot (Uber style)
const createDestinationMarker = () => L.divIcon({
  className: 'uber-destination-marker',
  html: `
    <div style="width: 22px; height: 22px; background: #111827; border: 2.5px solid #ffffff; border-radius: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
      <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 1px;"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

// Professional vehicle/navigation marker: rotated by heading
const createProMarker = (heading = 0) => L.divIcon({
  className: 'uber-pro-marker',
  html: `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
      <div style="width: 32px; height: 32px; background: #059669; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 14px rgba(5,150,105,0.4); display: flex; align-items: center; justify-content: center; transform: rotate(${heading}deg); transition: transform 0.4s ease-out;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff" stroke="none">
          <polygon points="12,2 22,21 12,17 2,21" />
        </svg>
      </div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

export default function UberStyleTrackingMap({
  jobRef,
  destLat,
  destLng,
  initialProLat,
  initialProLng,
  initialEtaMinutes = 15,
  initialDistanceKm = 2.5,
  onEtaChange
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const casingPolylineRef = useRef(null);
  const routePolylineRef = useRef(null);
  const destMarkerRef = useRef(null);
  const proMarkerRef = useRef(null);

  const [proLocation, setProLocation] = useState(() => {
    if (initialProLat && initialProLng) {
      return { lat: initialProLat, lng: initialProLng, heading: 0 };
    }
    return null;
  });

  const [eta, setEta] = useState(initialEtaMinutes);
  const [distanceKm, setDistanceKm] = useState(initialDistanceKm);
  const [isFollowing, setIsFollowing] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [stallSeconds, setStallSeconds] = useState(0);
  const [isLocating, setIsLocating] = useState(!initialProLat);

  // Monitor update stall time
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - lastUpdated) / 1000);
      setStallSeconds(elapsed);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // Update Route Polyline
  const updateRouteLine = useCallback((coordinates) => {
    if (!mapInstanceRef.current || !coordinates || coordinates.length < 2) return;

    if (casingPolylineRef.current) casingPolylineRef.current.remove();
    if (routePolylineRef.current) routePolylineRef.current.remove();

    // White casing underneath for high contrast
    casingPolylineRef.current = L.polyline(coordinates, {
      color: '#ffffff',
      weight: 7,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstanceRef.current);

    // Dark route line (Uber style)
    routePolylineRef.current = L.polyline(coordinates, {
      color: '#111827',
      weight: 4,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstanceRef.current);
  }, []);

  // Handle new incoming position
  const handlePositionUpdate = useCallback((data) => {
    if (!data || !data.lat || !data.lng) return;

    const newLat = parseFloat(data.lat);
    const newLng = parseFloat(data.lng);
    const heading = data.heading || 0;

    setIsLocating(false);
    setLastUpdated(Date.now());
    setStallSeconds(0);

    setProLocation({ lat: newLat, lng: newLng, heading });

    if (data.etaMinutes !== undefined) {
      setEta(data.etaMinutes);
      if (onEtaChange) onEtaChange(data.etaMinutes);
    }
    if (data.distanceKm !== undefined) {
      setDistanceKm(data.distanceKm);
    }

    // Update Pro Marker
    if (proMarkerRef.current && mapInstanceRef.current) {
      proMarkerRef.current.setLatLng([newLat, newLng]);
      proMarkerRef.current.setIcon(createProMarker(heading));

      if (isFollowing) {
        mapInstanceRef.current.panTo([newLat, newLng], { animate: true, duration: 0.6 });
      }
    }

    if (data.route && Array.isArray(data.route)) {
      updateRouteLine(data.route);
    }
  }, [isFollowing, onEtaChange, updateRouteLine]);

  // WebSocket & SSE live location listener
  useEffect(() => {
    if (!jobRef) return;

    let ws = null;
    let sse = null;
    let isSubscribed = false;

    // Connect WebSocket
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/tracking`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          jobRef,
          role: 'customer'
        }));
        isSubscribed = true;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'location_update') {
            handlePositionUpdate(msg);
          } else if (msg.type === 'subscribed' && msg.latestPosition) {
            handlePositionUpdate({
              ...msg.latestPosition,
              route: msg.route,
              etaMinutes: msg.etaMinutes,
              distanceKm: msg.distanceKm
            });
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        // Fallback to SSE
      };
    } catch (e) {}

    // SSE fallback
    try {
      sse = new EventSource(`/api/dispatch/request/${jobRef}/events`);
      sse.addEventListener('location.update', (e) => {
        try {
          const payload = JSON.parse(e.data);
          handlePositionUpdate(payload);
        } catch {}
      });
    } catch (e) {}

    return () => {
      if (ws) ws.close();
      if (sse) sse.close();
    };
  }, [jobRef, handlePositionUpdate]);

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const dLat = destLat || 12.9716;
    const dLng = destLng || 77.5946;
    const pLat = proLocation?.lat || (dLat - 0.015);
    const pLng = proLocation?.lng || (dLng - 0.012);

    const map = L.map(mapContainerRef.current, {
      center: [(dLat + pLat) / 2, (dLng + pLng) / 2],
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    const mapProvider = import.meta.env.VITE_MAP_PROVIDER || 'carto_osm';
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (typeof window !== 'undefined' && !window.__nivaaro_maps_warned) {
      window.__nivaaro_maps_warned = true;
      if (!mapboxToken && !googleApiKey) {
        console.warn('[NivaaroFix Maps] Running in keyless development mode using Carto/OSRM basemap. Provide VITE_MAPBOX_TOKEN or VITE_GOOGLE_MAPS_API_KEY for production traffic layers.');
      }
    }

    // Basemap Provider Adapter: Mapbox Light or Keyless Carto Positron
    if (mapProvider === 'mapbox' && mapboxToken) {
      L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`, {
        maxZoom: 19,
        tileSize: 512,
        zoomOffset: -1
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);
    }

    // Destination Marker
    const destMarker = L.marker([dLat, dLng], {
      icon: createDestinationMarker(),
      zIndexOffset: 1000
    }).addTo(map);
    destMarkerRef.current = destMarker;

    // Professional Marker
    const proMarker = L.marker([pLat, pLng], {
      icon: createProMarker(proLocation?.heading || 0),
      zIndexOffset: 2000
    }).addTo(map);
    proMarkerRef.current = proMarker;

    // Fit bounds initially
    const bounds = L.latLngBounds([[dLat, dLng], [pLat, pLng]]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    // Initial direct route line until OSRM returns
    updateRouteLine([[pLat, pLng], [dLat, dLng]]);

    // Pause follow on user pan
    map.on('dragstart', () => {
      setIsFollowing(false);
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const handleRecenter = () => {
    if (mapInstanceRef.current && proLocation) {
      mapInstanceRef.current.panTo([proLocation.lat, proLocation.lng], { animate: true, duration: 0.5 });
      setIsFollowing(true);
    } else if (mapInstanceRef.current && destLat && destLng) {
      mapInstanceRef.current.panTo([destLat, destLng], { animate: true, duration: 0.5 });
      setIsFollowing(true);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '240px', overflow: 'hidden', background: '#f3f4f6' }}>
      {/* Map DOM viewport */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Dark ETA overlay chip ("12 min · 3.4 km") */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 1000,
          background: '#111827',
          color: '#ffffff',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: '0.85rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
        <span>
          {isLocating
            ? 'Locating your professional...'
            : `${eta} min · ${distanceKm} km`}
        </span>
      </div>

      {/* Stale update warning if > 30 seconds */}
      {stallSeconds > 30 && !isLocating && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 1000,
            background: 'rgba(255,255,255,0.92)',
            color: '#6b7280',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.72rem',
            backdropFilter: 'blur(4px)'
          }}
        >
          Last updated {stallSeconds}s ago
        </div>
      )}

      {/* Recenter button (appears when panning pauses follow) */}
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
            color: '#111827',
            border: '1px solid #e5e7eb',
            borderRadius: '20px',
            padding: '6px 14px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Recenter</span>
        </button>
      )}
    </div>
  );
}
