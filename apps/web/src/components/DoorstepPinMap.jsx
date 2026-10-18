import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom clean pin icon
const destinationIcon = L.divIcon({
  className: 'doorstep-pin-icon',
  html: `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="width: 24px; height: 24px; background: #059669; border: 2.5px solid #ffffff; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center;">
        <div style="width: 7px; height: 7px; background: #ffffff; border-radius: 2px;"></div>
      </div>
      <div style="position: absolute; bottom: 0px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #059669;"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

export default function DoorstepPinMap({ lat, lng, onLocationChange }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const initialLat = lat || 12.9716;
  const initialLng = lng || 77.5946;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false
      });

      // Clean OpenStreetMap tiles (no API key required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const marker = L.marker([initialLat, initialLng], {
        icon: destinationIcon,
        draggable: true
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (onLocationChange) {
          onLocationChange({
            lat: parseFloat(pos.lat.toFixed(6)),
            lng: parseFloat(pos.lng.toFixed(6))
          });
        }
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        if (onLocationChange) {
          onLocationChange({
            lat: parseFloat(e.latlng.lat.toFixed(6)),
            lng: parseFloat(e.latlng.lng.toFixed(6))
          });
        }
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    } else {
      if (lat && lng && markerRef.current && mapInstanceRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.panTo([lat, lng]);
      }
    }

    return () => {
      // Keep instance until unmount
    };
  }, [lat, lng, onLocationChange]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ margin: '0.65rem 0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
          Confirm Exact Doorstep Location
        </span>
        <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
          Drag pin or click map
        </span>
      </div>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '180px',
          borderRadius: '10px',
          border: '1px solid #d1d5db',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)'
        }}
      />
      {lat && lng && (
        <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '0.25rem', fontWeight: 500 }}>
          Door location confirmed ({lat.toFixed(4)}, {lng.toFixed(4)})
        </div>
      )}
    </div>
  );
}
