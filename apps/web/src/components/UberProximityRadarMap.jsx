import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Uber-style square destination marker for customer location
const createCustomerPin = () => L.divIcon({
  className: 'uber-customer-pin',
  html: `
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(5, 150, 105, 0.2); animation: pulsePin 2s infinite ease-out;"></div>
      <div style="width: 20px; height: 20px; background: #0f172a; border: 2.5px solid #ffffff; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 2;">
        <div style="width: 6px; height: 6px; background: #10b981; border-radius: 1px;"></div>
      </div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// Uber-style vehicle/craftsman pin for nearby professionals
const createProMarker = (trade = 'electrician', name = 'Pro', isSelected = false) => {
  const isPlumber = (trade || '').toLowerCase().includes('plumb');
  const bg = isSelected ? '#0f172a' : '#059669';
  const border = isSelected ? '#10b981' : '#ffffff';

  return L.divIcon({
    className: 'uber-pro-radar-pin',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <div style="width: 32px; height: 32px; background: ${bg}; border: 2.5px solid ${border}; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.28); display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;">
          ${isPlumber ? `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff" stroke="none">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          `}
        </div>
        <div style="position: absolute; bottom: -8px; background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15);">
          ${name.split(' ')[0]}
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
};

export default function UberProximityRadarMap({
  customerLat,
  customerLng,
  providers = [],
  serviceCategory = 'electrician',
  matchedTierKm = 3,
  selectedProvider = null,
  onSelectProvider = null,
  height = '280px'
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const radarCircleRef = useRef(null);
  const [activePros, setActivePros] = useState(providers);

  // If providers not passed directly, fetch nearby pros from API
  useEffect(() => {
    if (providers && providers.length > 0) {
      setActivePros(providers);
      return;
    }
    if (!customerLat || !customerLng) return;

    let isMounted = true;
    fetch(`/api/dispatch/nearby-pros?lat=${customerLat}&lng=${customerLng}&category=${encodeURIComponent(serviceCategory || 'all')}`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.success && Array.isArray(data.providers)) {
          setActivePros(data.providers);
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [customerLat, customerLng, serviceCategory, providers]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const lat = customerLat || 12.9716;
    const lng = customerLng || 77.5946;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false
    });

    // Clean modern OpenStreetMap CartoDB Positron tiles (Understated, high-contrast, Uber-like)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    setTimeout(() => {
      try { map.invalidateSize(); } catch {}
    }, 200);

    return () => {
      try {
        map.remove();
        mapInstanceRef.current = null;
      } catch {}
    };
  }, []);

  // Update Customer Pin, Nearby Pros and H3 Radar Ring
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (!customerLat || !customerLng) return;

    // 1. Customer Destination Pin
    const customerMarker = L.marker([customerLat, customerLng], {
      icon: createCustomerPin(),
      zIndexOffset: 1000
    }).addTo(layer);

    customerMarker.bindPopup(`
      <div style="font-family: -apple-system, sans-serif; font-size: 12px; padding: 4px;">
        <strong style="color: #0f172a; display: block; margin-bottom: 2px;">Service Address</strong>
        <span style="color: #64748b;">Your confirmed location</span>
      </div>
    `);

    // 2. Concentric H3 Search Radar Ring (expanding tier)
    if (radarCircleRef.current) {
      radarCircleRef.current.remove();
    }
    const tierRadiusMeters = (matchedTierKm || 3) * 1000;
    radarCircleRef.current = L.circle([customerLat, customerLng], {
      radius: tierRadiusMeters,
      color: '#059669',
      weight: 1.5,
      opacity: 0.5,
      fillColor: '#10b981',
      fillOpacity: 0.05,
      dashArray: '4, 6'
    }).addTo(layer);

    // 3. Plot Nearby Professionals
    const bounds = L.latLngBounds([[customerLat, customerLng]]);

    activePros.forEach(pro => {
      if (!pro.lat || !pro.lng) return;
      const isSelected = selectedProvider && (selectedProvider.id === pro.id || selectedProvider.partnerId === pro.partnerId);
      const marker = L.marker([pro.lat, pro.lng], {
        icon: createProMarker(pro.trade, pro.name, isSelected),
        zIndexOffset: isSelected ? 900 : 500
      }).addTo(layer);

      bounds.extend([pro.lat, pro.lng]);

      const eta = pro.etaMinutes || Math.max(4, Math.round(((pro.distanceKm || 1.5) / 25) * 60));
      const dist = pro.distanceKm ? `~${pro.distanceKm} km` : '~1.2 km';

      marker.bindPopup(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 6px; min-width: 160px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="font-size: 13px; color: #0f172a;">${pro.name}</strong>
            <span style="background: #ecfdf5; color: #065f46; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
              ★ ${pro.rating ? Number(pro.rating).toFixed(1) : '4.9'}
            </span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
            ${pro.trade === 'plumber' ? 'Certified Plumber' : 'Master Electrician'} • ${pro.completedJobs || 120}+ jobs
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 11px; color: #475569; font-weight: 600;">Estimated Arrival</span>
            <span style="font-size: 12px; font-weight: 800; color: #059669;">~${eta} mins (${dist})</span>
          </div>
        </div>
      `);

      if (onSelectProvider) {
        marker.on('click', () => onSelectProvider(pro));
      }
    });

    try {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    } catch {}
  }, [customerLat, customerLng, activePros, matchedTierKm, selectedProvider, onSelectProvider]);

  const closestPro = activePros.length > 0 ? activePros[0] : null;
  const closestEta = closestPro ? (closestPro.etaMinutes || Math.max(4, Math.round(((closestPro.distanceKm || 1.2) / 25) * 60))) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-subtle, #e2e8f0)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
      {/* Map Canvas */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Uber-style Status Overlay Pill */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        color: '#ffffff',
        padding: '7px 14px',
        borderRadius: '10px',
        fontSize: '0.78rem',
        zIndex: 500,
        boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
            H3 Proximity Radar • {activePros.length} Certified Pro{activePros.length === 1 ? '' : 's'} in Range
          </span>
        </div>
        {closestEta && (
          <div style={{ fontWeight: 700, color: '#34d399', background: 'rgba(16, 185, 129, 0.16)', padding: '2px 8px', borderRadius: '6px' }}>
            Closest: ~{closestEta} mins away
          </div>
        )}
      </div>

      {/* CSS Pulse Animation for Pin */}
      <style>{`
        @keyframes pulsePin {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
