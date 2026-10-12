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
            setIsLocatingGPS(false);
            setGpsStatus('denied');
            resolve(null);
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
        setJobStage('on_the_way');
        setActivePartnerJob(prev => prev ? { ...prev, status: 'On the way' } : prev);
      }
      return data;
    } catch (err) {
      console.warn('En route notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // 9.5. Mark arrived at doorstep
  // -----------------------------------------------------------------------
  const markArrived = useCallback(async (requestRef, agentEmail) => {
    try {
      const payload = { agentEmail };
      if (providerLocation?.lat && providerLocation?.lng) {
        payload.lat = providerLocation.lat;
        payload.lng = providerLocation.lng;
      }
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/arrived`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { success: false, error: 'Something went wrong. Please try again.' };
      }
      const data = await res.json();
      if (data.success) {
        setJobStage('arrived');
        setActivePartnerJob(prev => prev ? { ...prev, status: 'Arrived' } : prev);
      }
      return data;
    } catch (err) {
      console.warn('Mark arrived notice:', err.message);
      return { success: false, error: 'Something went wrong. Please try again.' };
    }
  }, [providerLocation]);

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
  const completeJob = useCallback(async (requestRef, agentEmail, photos = [], remarks = '') => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentEmail, photos, remarks })
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

  // -----------------------------------------------------------------------
  // 14. Real-time GPS watchPosition pipeline during active job (3-5 seconds)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activePartnerJob || !activeEmail) return;
    const ref = activePartnerJob.requestRef || activePartnerJob.id;
    if (!ref) return;

    const normStatus = (activePartnerJob.status || '').toLowerCase();
    const isEnRoute = normStatus === 'en route' || normStatus === 'on the way';
    if (!isEnRoute) return;

    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let ws = null;
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/tracking`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          jobRef: ref,
          role: 'professional',
          email: activeEmail
        }));
      };
    } catch (e) {}

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        setProviderLocation({ lat: latitude, lng: longitude });

        const locPayload = {
          type: 'publish_location',
          jobRef: ref,
          email: activeEmail,
          lat: latitude,
          lng: longitude,
          accuracy,
          heading,
          speed,
          timestamp: pos.timestamp
        };

        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify(locPayload));
        } else {
          // HTTP fallback
          fetch(`${API_BASE}/dispatch/job/${ref}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(locPayload)
          }).catch(() => {});
        }
      },
      (err) => {
        console.warn('Live tracking watchPosition notice:', err.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (ws) ws.close();
    };
  }, [activePartnerJob, activeEmail]);

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
        markArrived,
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
      markArrived: async () => {},
      verifyJobOtp: async () => {},
      completeJob: async () => {},
      cancelJob: async () => {},
      loadProviderProfile: async () => {}
    };
  }
  return context;
}
