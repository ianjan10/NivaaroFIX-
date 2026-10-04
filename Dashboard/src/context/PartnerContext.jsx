import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const PartnerContext = createContext();

const API_BASE = 'http://localhost:5000/api';

export function PartnerProvider({ children }) {
  // Provider online/offline status (from PostgreSQL)
  const [isOnline, setIsOnline] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState('AVAILABLE');
  const [activeEmail, setActiveEmail] = useState('');

  // Provider wallet balance (from PostgreSQL, zero until fetched)
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);

  // Nearby service requests (from PostgreSQL dispatch API)
  const [nearbyRequests, setNearbyRequests] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // Currently active job (from PostgreSQL -- accepted/en-route/in-progress)
  const [activePartnerJob, setActivePartnerJob] = useState(null);
  const [jobStage, setJobStage] = useState(null); // 'accepted' | 'en_route' | 'in_progress' | null

  // Quote submission state
  const [quotingRequestRef, setQuotingRequestRef] = useState(null);

  // Provider location & GPS connectivity
  const [providerLocation, setProviderLocation] = useState({ lat: null, lng: null });
  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle' | 'locating' | 'locked' | 'fallback' | 'unsupported'

  // -----------------------------------------------------------------------
  // 1. Fetch provider profile from PostgreSQL
  // -----------------------------------------------------------------------
  const loadProviderProfile = useCallback(async (email) => {
    if (!email) return null;
    setActiveEmail(email);
    try {
      const res = await fetch(`${API_BASE}/agents/profile/${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success && data.agent) {
        setWalletBalance(data.agent.walletBalance || 0);
        setCompletedJobsCount(data.agent.completedJobs || 0);
        setIsOnline(data.agent.isOnline || false);
        setAvailabilityStatus(data.agent.availabilityStatus || (data.agent.isOnline ? 'AVAILABLE' : 'OFFLINE'));
        if (data.agent.lat && data.agent.lng) {
          setProviderLocation({ lat: data.agent.lat, lng: data.agent.lng });
        }
        return data.agent;
      }
      return null;
    } catch (err) {
      console.warn('Provider profile fetch notice:', err.message);
      return null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // 2. Update provider location (lat/lng -> H3 index)
  // -----------------------------------------------------------------------
  const updateLocation = useCallback(async (email, lat, lng) => {
    if (!email || !lat || !lng) return;
    try {
      const res = await fetch(`${API_BASE}/agents/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lat, lng })
      });
      const data = await res.json();
      if (data.success) {
        setProviderLocation({ lat: data.location.lat, lng: data.location.lng });
      }
      return data;
    } catch (err) {
      console.warn('Location update notice:', err.message);
      return null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // 3. Update provider availability status (AVAILABLE, OFFLINE, BUSY, PAUSED)
  // -----------------------------------------------------------------------
  const updatePresence = useCallback(async (email, newStatus) => {
    if (!email) return;
    try {
      const res = await fetch(`${API_BASE}/providers/me/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, availabilityStatus: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        setAvailabilityStatus(newStatus);
        setIsOnline(newStatus === 'AVAILABLE');
      }
      return data;
    } catch (err) {
      console.warn('Update presence notice:', err.message);
      return null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // 4. Toggle online/offline status via PostgreSQL
  // -----------------------------------------------------------------------
  const toggleOnline = useCallback(async (email, newStatus) => {
    if (!email) return;
    const targetPresence = newStatus ? 'AVAILABLE' : 'OFFLINE';
    return updatePresence(email, targetPresence);
  }, [updatePresence]);

  // -----------------------------------------------------------------------
  // 5. Fetch nearby open service requests (H3 dispatch)
  // -----------------------------------------------------------------------
  const loadNearbyRequests = useCallback(async (email, lat, lng, radiusKm = 10) => {
    if (!email) return;
    setNearbyLoading(true);
    try {
      const params = new URLSearchParams({ email });
      if (lat) params.set('lat', lat);
      if (lng) params.set('lng', lng);
      if (radiusKm) params.set('radiusKm', radiusKm);

      const res = await fetch(`${API_BASE}/dispatch/nearby-requests?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setNearbyRequests(data.requests);
      } else {
        setNearbyRequests([]);
      }
    } catch (err) {
      console.warn('Nearby requests fetch notice:', err.message);
      setNearbyRequests([]);
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // 6. Automatically turn location on, fetch GPS, and connect nearby dispatch
  // -----------------------------------------------------------------------
  const autoFetchAndConnectLocation = useCallback(async (email, fallbackCity = null) => {
    if (!email) return null;
    setIsLocatingGPS(true);
    setGpsStatus('locating');

    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = parseFloat(pos.coords.latitude.toFixed(6));
            const lng = parseFloat(pos.coords.longitude.toFixed(6));
            setProviderLocation({ lat, lng });
            setGpsStatus('locked');
            setIsLocatingGPS(false);

            // Update backend PostgreSQL and H3 spatial index
            await updateLocation(email, lat, lng);
            // Immediately fetch nearby jobs for new coordinates
            await loadNearbyRequests(email, lat, lng);
            resolve({ lat, lng, source: 'gps' });
          },
          async (err) => {
            console.warn('GPS location request notice:', err.message);
            // City coordinate fallback if GPS denied/timed out
            let fallbackLat = 12.9716;
            let fallbackLng = 77.5946;
            if (fallbackCity) {
              const norm = fallbackCity.trim().toLowerCase();
              if (norm.includes('mumbai')) { fallbackLat = 19.0760; fallbackLng = 72.8777; }
              else if (norm.includes('delhi')) { fallbackLat = 28.7041; fallbackLng = 77.1025; }
              else if (norm.includes('chennai')) { fallbackLat = 13.0827; fallbackLng = 80.2707; }
              else if (norm.includes('hyderabad')) { fallbackLat = 17.3850; fallbackLng = 78.4867; }
              else if (norm.includes('kolkata')) { fallbackLat = 22.5726; fallbackLng = 88.3639; }
              else if (norm.includes('pune')) { fallbackLat = 18.5204; fallbackLng = 73.8567; }
              else if (norm.includes('jaipur')) { fallbackLat = 26.9124; fallbackLng = 75.7873; }
              else if (norm.includes('ahmedabad')) { fallbackLat = 23.0225; fallbackLng = 72.5714; }
            }
            setProviderLocation({ lat: fallbackLat, lng: fallbackLng });
            setGpsStatus('fallback');
            setIsLocatingGPS(false);
            await updateLocation(email, fallbackLat, fallbackLng);
            await loadNearbyRequests(email, fallbackLat, fallbackLng);
            resolve({ lat, fallbackLng, source: 'fallback' });
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      } else {
        setIsLocatingGPS(false);
        setGpsStatus('unsupported');
        resolve(null);
      }
    });
  }, [updateLocation, loadNearbyRequests]);

  // -----------------------------------------------------------------------
  // 7. Submit a quote for a service request
  // -----------------------------------------------------------------------
  const submitQuote = useCallback(async (requestRef, agentEmail, amount, estimatedDuration, message) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestRef,
          agentEmail,
          amount: parseFloat(amount),
          estimatedDuration: parseInt(estimatedDuration || 30, 10),
          message: (message || '').trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        // Mark as quoted in local state
        setNearbyRequests(prev =>
          prev.map(r => r.requestRef === requestRef ? { ...r, alreadyQuoted: true } : r)
        );
        setQuotingRequestRef(null);
      }
      return data;
    } catch (err) {
      console.warn('Submit quote notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // 8. Fetch provider's currently active job
  // -----------------------------------------------------------------------
  const loadActiveJob = useCallback(async (email) => {
    if (!email) return;
    try {
      const res = await fetch(`${API_BASE}/dispatch/provider/active-job?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success && data.activeJob) {
        setActivePartnerJob(data.activeJob);
        // Derive stage from status
        const statusMap = {
          'Accepted': 'accepted',
          'En Route': 'en_route',
          'OTP Verified': 'in_progress',
          'In Progress': 'in_progress'
        };
        setJobStage(statusMap[data.activeJob.status] || 'accepted');
      } else {
        setActivePartnerJob(null);
        setJobStage(null);
      }
    } catch (err) {
      console.warn('Active job fetch notice:', err.message);
    }
  }, []);

  // -----------------------------------------------------------------------
  // 9. Mark en route
  // -----------------------------------------------------------------------
  const markEnRoute = useCallback(async (requestRef, agentEmail) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/en-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentEmail })
      });
      const data = await res.json();
      if (data.success) {
        setJobStage('en_route');
        setActivePartnerJob(prev => prev ? { ...prev, status: 'En Route' } : prev);
      }
      return data;
    } catch (err) {
      console.warn('En route notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // 10. Verify OTP at customer door
  // -----------------------------------------------------------------------
  const verifyJobOtp = useCallback(async (requestRef, otp) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
      });
      const data = await res.json();
      if (data.success) {
        setJobStage('in_progress');
        setActivePartnerJob(prev => prev ? { ...prev, status: 'In Progress' } : prev);
      }
      return data;
    } catch (err) {
      console.warn('OTP verify notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // 11. Complete job (credits wallet via PostgreSQL)
  // -----------------------------------------------------------------------
  const completeJob = useCallback(async (requestRef, agentEmail) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentEmail })
      });
      const data = await res.json();
      if (data.success) {
        setActivePartnerJob(null);
        setJobStage(null);
        if (data.wallet) {
          setWalletBalance(data.wallet.newBalance);
          setCompletedJobsCount(data.wallet.completedJobs);
        }
      }
      return data;
    } catch (err) {
      console.warn('Complete job notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // 12. Cancel active job from partner console
  // -----------------------------------------------------------------------
  const cancelJob = useCallback(async (requestRef, reason = 'provider_cancelled') => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelledBy: 'provider',
          reason,
          agentEmail: activeEmail
        })
      });
      const data = await res.json();
      if (data.success) {
        setActivePartnerJob(null);
        setJobStage(null);
        setIsOnline(true);
        setAvailabilityStatus('AVAILABLE');
      }
      return data;
    } catch (err) {
      console.warn('Cancel job notice:', err.message);
      return { success: false, error: err.message };
    }
  }, [activeEmail]);

  // -----------------------------------------------------------------------
  // 12. Fetch wallet balance and transaction history
  // -----------------------------------------------------------------------
  const loadWallet = useCallback(async (email) => {
    if (!email) return;
    try {
      const res = await fetch(`${API_BASE}/dispatch/wallet/${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success && data.wallet) {
        setWalletBalance(data.wallet.balance);
        setCompletedJobsCount(data.wallet.completedJobs);
        setWalletTransactions(data.wallet.transactions || []);
      }
    } catch (err) {
      console.warn('Wallet fetch notice:', err.message);
    }
  }, []);

  // -----------------------------------------------------------------------
  // 13. Watch provider position with sensible throttling (>=25m or >=30s)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activeEmail || typeof window === 'undefined' || !navigator.geolocation) return;

    let lastSent = { lat: null, lng: null, time: 0 };
    const THROTTLE_TIME_MS = 30000; // 30s
    const THROTTLE_DIST_KM = 0.025; // 25m

    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const accuracy_m = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : 10;
        const now = Date.now();

        const timeDiff = now - lastSent.time;
        const distDiff = lastSent.lat ? getDistanceKm(lastSent.lat, lastSent.lng, lat, lng) : 999;

        if (timeDiff >= THROTTLE_TIME_MS || distDiff >= THROTTLE_DIST_KM) {
          lastSent = { lat, lng, time: now };
          setProviderLocation({ lat, lng });

          try {
            await fetch(`${API_BASE}/providers/me/location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: activeEmail, latitude: lat, longitude: lng, accuracy_m })
            });
          } catch (e) {}
        }
      },
      (err) => {
        console.warn('Watch location error:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeEmail]);

  // -----------------------------------------------------------------------
  // 14. Real-time Provider SSE Listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activeEmail) return;

    let sse;
    try {
      sse = new EventSource(`${API_BASE}/realtime/provider/${encodeURIComponent(activeEmail)}`);
      sse.addEventListener('dispatch.request.sent', (e) => {
        try {
          const reqData = JSON.parse(e.data);
          setNearbyRequests((prev) => {
            const exists = prev.some((r) => r.requestRef === reqData.requestRef);
            if (exists) return prev;
            return [reqData, ...prev];
          });
        } catch (err) {}
      });

      sse.addEventListener('quote.accepted', (e) => {
        try {
          loadActiveJob(activeEmail);
          loadWallet(activeEmail);
        } catch (err) {}
      });
    } catch (sseErr) {
      console.warn('Provider SSE warning:', sseErr.message);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [activeEmail, loadActiveJob, loadWallet]);

  return (
    <PartnerContext.Provider
      value={{
        // Status
        isOnline,
        setIsOnline,
        toggleOnline,
        availabilityStatus,
        updatePresence,

        // Profile
        loadProviderProfile,

        // Wallet (from PostgreSQL)
        walletBalance,
        walletTransactions,
        completedJobsCount,
        loadWallet,

        // Location & Auto-GPS
        providerLocation,
        updateLocation,
        autoFetchAndConnectLocation,
        isLocatingGPS,
        gpsStatus,

        // Nearby requests (from dispatch API)
        nearbyRequests,
        nearbyLoading,
        loadNearbyRequests,

        // Quote submission
        quotingRequestRef,
        setQuotingRequestRef,
        submitQuote,

        // Active job lifecycle
        activePartnerJob,
        jobStage,
        loadActiveJob,
        markEnRoute,
        verifyJobOtp,
        completeJob,
        cancelJob
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
}

export function usePartner() {
  const context = useContext(PartnerContext);
  if (!context) {
    return {
      isOnline: false,
      toggleOnline: async () => {},
      availabilityStatus: 'OFFLINE',
      updatePresence: async () => {},
      walletBalance: 0,
      walletTransactions: [],
      completedJobsCount: 0,
      loadWallet: async () => {},
      updateLocation: async () => {},
      providerLocation: null,
      autoFetchAndConnectLocation: async () => {},
      isLocatingGPS: false,
      gpsStatus: 'idle',
      nearbyRequests: [],
      nearbyLoading: false,
      loadNearbyRequests: async () => {},
      quotingRequestRef: null,
      setQuotingRequestRef: () => {},
      submitQuote: async () => {},
      activePartnerJob: null,
      jobStage: null,
      loadActiveJob: async () => {},
      markEnRoute: async () => {},
      verifyJobOtp: async () => {},
      completeJob: async () => {},
      cancelJob: async () => {},
      loadProviderProfile: async () => {}
    };
  }
  return context;
}
