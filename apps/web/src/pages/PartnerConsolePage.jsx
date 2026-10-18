import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePartner } from '../context/PartnerContext';
import { useLanguage } from '../context/LanguageContext';
import { evaluateAgentChecklist } from '../utils/profileStrength';
import BookingToast from '../components/BookingToast';
import UnifiedOtpInput from '../components/UnifiedOtpInput';
import PartnerActiveNavigationMap from '../components/PartnerActiveNavigationMap';
import '../styles/PartnerConsole.css';

const API_BASE = 'http://localhost:5000/api';

/**
 * Format distance cleanly:
 * Under 1 km show in meters ("~15 m away"), otherwise one decimal place ("~2.3 km away")
 */
function formatDistance(distKm) {
  if (distKm === undefined || distKm === null || isNaN(Number(distKm))) {
    return '~10 m away';
  }
  const km = Number(distKm);
  if (km < 1) {
    const meters = Math.max(10, Math.round(km * 1000));
    return `~${meters} m away`;
  }
  return `~${km.toFixed(1)} km away`;
}

function getServiceIcon(category, serviceTitle) {
  const cat = `${category || ''} ${serviceTitle || ''}`.toLowerCase();
  if (cat.includes('plumb') || cat.includes('pipe') || cat.includes('leak') || cat.includes('drain') || cat.includes('tap') || cat.includes('faucet')) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    );
  }
  if (cat.includes('elect') || cat.includes('switch') || cat.includes('wire') || cat.includes('mcb') || cat.includes('power') || cat.includes('light')) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  }
  if (cat.includes('ac') || cat.includes('appliance') || cat.includes('ro') || cat.includes('refrigerat') || cat.includes('cooler') || cat.includes('purifier') || cat.includes('machine')) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="4" y1="9" x2="20" y2="9" />
        <circle cx="8" cy="6.5" r="1" fill="currentColor" />
        <circle cx="11" cy="6.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (cat.includes('carpent') || cat.includes('wood') || cat.includes('furnit') || cat.includes('door') || cat.includes('lock')) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function StarRatingIcons({ rating }) {
  const numeric = Number(rating);
  const isRated = !isNaN(numeric) && numeric > 0;
  const rounded = isRated ? Math.min(5, Math.max(1, Math.round(numeric))) : 0;

  return (
    <div className="pro-stars-row" title={isRated ? `${numeric.toFixed(1)} out of 5 stars` : 'Pending customer rating'}>
      {[1, 2, 3, 4, 5].map((starIdx) => {
        const isFilled = isRated && starIdx <= rounded;
        return (
          <svg
            key={starIdx}
            viewBox="0 0 24 24"
            width="13"
            height="13"
            className={`pro-star-icon ${isFilled ? 'filled' : 'outline'}`}
            fill={isFilled ? 'var(--pro-accent)' : 'none'}
            stroke={isFilled ? 'var(--pro-accent)' : 'var(--pro-text-muted)'}
            strokeWidth={isFilled ? '1' : '1.8'}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      })}
    </div>
  );
}

export default function PartnerConsolePage({ agent: propAgent, partnerNavNonce = 0 }) {
  const {
    isOnline,
    toggleOnline,
    availabilityStatus,
    updatePresence,
    walletBalance,
    walletTransactions,
    completedJobsCount,
    loadWallet,
    updateLocation,
    providerLocation,
    autoFetchAndConnectLocation,
    isLocatingGPS,
    gpsStatus,
    nearbyRequests,
    setNearbyRequests,
    nearbyLoading,
    loadNearbyRequests,
    quotingRequestRef,
    setQuotingRequestRef,
    submitQuote,
    activePartnerJob,
    jobStage,
    loadActiveJob,
    markEnRoute,
    markArrived,
    verifyJobOtp,
    completeJob,
    cancelJob,
    loadProviderProfile
  } = usePartner();

  const { t } = useLanguage();

  const [currentAgent, setCurrentAgent] = useState(() => {
    if (propAgent) return propAgent;
    try {
      const saved = localStorage.getItem('nivaaro-agent');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState('');
  const [eligibilityNoticeMsg, setEligibilityNoticeMsg] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    // If active partner job exists, or if nearby requests already loaded and present, start on feed
    if (activePartnerJob || (nearbyRequests && nearbyRequests.length > 0)) {
      return 'feed';
    }
    return 'completed';
  });

  // Track whether initial tab selection has been performed on entry
  const hasInitializedTabRef = useRef(false);

  // Completion modal sheet state (Photos + Remarks)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionPhotos, setCompletionPhotos] = useState([]);
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);

  // Real database-backed completed jobs & customer reviews
  const [pastJobs, setPastJobs] = useState([]);
  const [pastJobsLoading, setPastJobsLoading] = useState(false);
  const [customerReviews, setCustomerReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Completed Jobs Filter, Sort & Interactive Accordion State
  const [completedSort, setCompletedSort] = useState('recent'); // 'recent' | 'highest_rated' | 'lowest_rated'
  const [completedRatingFilter, setCompletedRatingFilter] = useState('all'); // 'all' | '5' | '4_below'
  const [expandedJobIds, setExpandedJobIds] = useState(new Set());

  const toggleJobExpanded = (jobId) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const loadPastJobs = useCallback(async (email) => {
    if (!email) return;
    setPastJobsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/agents/completed-jobs/${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setPastJobs(data.jobs);
      } else {
        setPastJobs([]);
      }
    } catch {
      setPastJobs([]);
    } finally {
      setPastJobsLoading(false);
    }
  }, []);

  const loadCustomerReviews = useCallback(async (email) => {
    if (!email) return;
    setReviewsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/agents/reviews/${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.reviews)) {
        setCustomerReviews(data.reviews);
      } else {
        setCustomerReviews([]);
      }
    } catch {
      setCustomerReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  // Initial tab resolution on console load / entry:
  // When there are no live requests and no active job in progress, automatically land on 'completed' jobs;
  // otherwise start on 'feed' (Live Requests).
  useEffect(() => {
    if (nearbyLoading) return;
    if (!hasInitializedTabRef.current) {
      hasInitializedTabRef.current = true;
      const hasLiveWork = Boolean(activePartnerJob || (nearbyRequests && nearbyRequests.length > 0));
      if (!hasLiveWork) {
        setActiveTab('completed');
        if (currentAgent?.email) {
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
        }
      } else {
        setActiveTab('feed');
      }
    }
  }, [nearbyLoading, activePartnerJob, nearbyRequests, currentAgent?.email, loadPastJobs, loadCustomerReviews]);

  // When professional explicitly clicks "Professional Console" in navbar / navigation:
  useEffect(() => {
    if (partnerNavNonce > 0) {
      const hasLiveWork = Boolean(activePartnerJob || (nearbyRequests && nearbyRequests.length > 0));
      if (!hasLiveWork) {
        setActiveTab('completed');
        if (currentAgent?.email) {
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
        }
      } else {
        setActiveTab('feed');
      }
    }
  }, [partnerNavNonce, activePartnerJob, nearbyRequests, currentAgent?.email, loadPastJobs, loadCustomerReviews]);

  // 10-Second Toast Alert Queue (per user requirement: 10s pop message on interaction)
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'brass') => {
    const id = `pro-toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 10000); // Exactly 10 seconds
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const playDispatchChime = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (err) {
      // AudioContext policy catch
    }
  };

  // Quote Submission Modal State
  const [quoteModalReq, setQuoteModalReq] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteDuration, setQuoteDuration] = useState('30');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Active Job OTP State
  const [jobOtpInput, setJobOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [otpLockedUntil, setOtpLockedUntil] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Profile Checklist & Eligibility Calculation
  const profileCheck = evaluateAgentChecklist(currentAgent);

  const formatTitleCase = (str) => {
    if (!str) return '';
    return str
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const partnerName = formatTitleCase(
    currentAgent?.name || (currentAgent?.isLoggedIn ? 'Registered Partner' : 'Professional Partner')
  );
  const partnerId = currentAgent?.partnerId || currentAgent?.partner_id || (currentAgent?.isLoggedIn ? '202500001' : 'ID Pending');
  const formatPrecisePartnerLocation = (agent) => {
    if (!agent) return t.proLocationPending || 'Location Pending';

    // 1. If explicit address exists (e.g. "Dilshad Garden, Delhi, Delhi 110095")
    if (agent.address) {
      const cleaned = agent.address
        .replace(/\b\d{6}\b/g, '') // remove postal code
        .replace(/\b(Hub|hub)\b/gi, '') // remove hub word
        .replace(/,\s*,/g, ',')
        .trim();
      
      const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
      const uniqueParts = [];
      for (const p of parts) {
        if (!uniqueParts.some((u) => u.toLowerCase() === p.toLowerCase())) {
          uniqueParts.push(p);
        }
      }
      if (uniqueParts.length >= 2) {
        return `${uniqueParts[0]}, ${uniqueParts[1]}`;
      }
      if (uniqueParts.length === 1) {
        return uniqueParts[0];
      }
    }

    // 2. If locality exists
    if (agent.locality) {
      const loc = agent.locality.replace(/\b(Hub|hub)\b/gi, '').trim();
      const ct = (agent.city || '').replace(/\b(Hub|hub)\b/gi, '').trim();
      if (loc && ct && !ct.toLowerCase().includes(loc.toLowerCase())) {
        return `${loc}, ${ct}`;
      }
      if (loc) return loc;
    }

    // 3. If city exists
    if (agent.city) {
      const cleanCity = agent.city.replace(/\b(Hub|hub)\b/gi, '').trim();
      if (cleanCity) return cleanCity;
    }

    // 4. If state exists
    if (agent.state) {
      const cleanState = agent.state.replace(/\b(Hub|hub)\b/gi, '').trim();
      if (cleanState) return cleanState;
    }

    return t.proLocationPending || 'Location Pending';
  };

  const partnerLocation = formatPrecisePartnerLocation(currentAgent);
  const partnerTrade = currentAgent?.trade === 'both'
    ? 'Electrician & Plumber'
    : currentAgent?.trade === 'plumber' 
      ? (t.proTradePlumber || 'Plumber') 
      : (currentAgent?.trade ? formatTitleCase(currentAgent.trade) : (t.proTradeElectrician || 'Electrician'));
  const partnerInitials = (partnerName || 'P').trim().charAt(0).toUpperCase();

  // Check if provider is busy on an ongoing job (mutual exclusivity requirement)
  const isBusyOnJob = Boolean(
    activePartnerJob &&
    ['accepted', 'en route', 'otp verified', 'in progress'].includes((activePartnerJob.status || '').toLowerCase())
  );

  // Automatically refresh and switch to Live Requests feed whenever new customer requests arrive
  const prevNearbyCountRef = useRef(nearbyRequests ? nearbyRequests.length : 0);
  useEffect(() => {
    if (isBusyOnJob) return;
    const currentCount = Array.isArray(nearbyRequests) ? nearbyRequests.length : 0;
    const prevCount = prevNearbyCountRef.current;

    // Transition from 0 to >0 OR count increases: new incoming customer request arrived!
    if (currentCount > 0 && (prevCount === 0 || currentCount > prevCount)) {
      setActiveTab('feed');
      const latestReq = nearbyRequests[0];
      const title = latestReq?.serviceTitle || 'Customer Service Request';
      addToast(`New Live Request: "${title}" is waiting for quotation. Switched to Live Requests.`, 'brass');
      playDispatchChime();
    }

    prevNearbyCountRef.current = currentCount;
  }, [nearbyRequests, isBusyOnJob]);

  // Load provider data & auto-fetch live GPS on mount / agent change
  useEffect(() => {
    if (currentAgent?.email) {
      loadProviderProfile(currentAgent.email).then((profile) => {
        if (profile) {
          setCurrentAgent((prev) => {
            const merged = { ...prev, ...profile };
            try {
              localStorage.setItem('nivaaro-agent', JSON.stringify(merged));
            } catch {}
            return merged;
          });
          loadNearbyRequests(currentAgent.email, profile.lat || currentAgent.lat, profile.lng || currentAgent.lng);
        }
      });
      loadActiveJob(currentAgent.email);
      loadWallet(currentAgent.email);
      loadPastJobs(currentAgent.email);
      loadCustomerReviews(currentAgent.email);
      if (autoFetchAndConnectLocation) {
        autoFetchAndConnectLocation(currentAgent.email, currentAgent.city || 'Bengaluru');
      } else {
        loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
      }
    }
  }, [currentAgent?.email, loadProviderProfile, loadActiveJob, loadWallet, loadPastJobs, loadCustomerReviews, loadNearbyRequests, autoFetchAndConnectLocation]);

  // Real-time automatic background polling (every 3 seconds - no manual refresh needed)
  useEffect(() => {
    if (!currentAgent?.email) return;

    const pollInterval = setInterval(async () => {
      try {
        await loadActiveJob(currentAgent.email);
        await loadWallet(currentAgent.email);
        if (!isBusyOnJob) {
          const targetLat = providerLocation?.lat || currentAgent?.lat || null;
          const targetLng = providerLocation?.lng || currentAgent?.lng || null;
          loadNearbyRequests(currentAgent.email, targetLat, targetLng);
        }
        if (activeTab === 'completed') {
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
        }
      } catch (err) {
        // Silent sync catch
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [currentAgent, isBusyOnJob, activeTab, providerLocation, loadActiveJob, loadWallet, loadNearbyRequests, loadPastJobs, loadCustomerReviews]);

  // Automatic background live GPS tracking without human intervention
  useEffect(() => {
    if (!isOnline || !currentAgent?.email) return;

    // Immediate live location fetch upon going online
    if (autoFetchAndConnectLocation) {
      autoFetchAndConnectLocation(currentAgent.email, currentAgent.city || 'Bengaluru');
    }

    // Continuous browser geolocation tracking without human intervention
    let watchId = null;
    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const lat = parseFloat(pos.coords.latitude.toFixed(6));
            const lng = parseFloat(pos.coords.longitude.toFixed(6));
            if (updateLocation && currentAgent?.email) {
              updateLocation(currentAgent.email, lat, lng);
            }
          },
          () => {
            // Silent fallback to registered hub coordinates
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );
      } catch (err) {}
    }

    return () => {
      if (watchId !== null && typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isOnline, currentAgent, autoFetchAndConnectLocation, updateLocation]);

  // Real-time SSE streaming for provider
  useEffect(() => {
    if (!currentAgent?.email) return;

    let eventSource = null;
    try {
      const emailEncoded = encodeURIComponent(currentAgent.email.toLowerCase().trim());
      eventSource = new EventSource(`http://localhost:5000/api/realtime/provider/${emailEncoded}`);

      eventSource.addEventListener('quote.dispatched', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(
            `Quotation Dispatched: Your quote of ₹${data.amount} for "${data.serviceTitle}" was successfully sent to the customer!`,
            'brass'
          );
        } catch (err) {}
      });

      eventSource.addEventListener('quote.accepted', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(
            `Quote Accepted! Customer ${data.customerName || ''} accepted your quotation of ₹${data.amount} for "${data.serviceTitle}". Proceed to: ${data.address || 'Customer Location'}.`,
            'brass'
          );
          loadActiveJob(currentAgent.email);
          loadWallet(currentAgent.email);
        } catch (err) {}
      });

      eventSource.addEventListener('status.en_route', (e) => {
        try {
          addToast('Status Updated: You are now marked En Route to the customer.', 'info');
          loadActiveJob(currentAgent.email);
        } catch (err) {}
      });

      eventSource.addEventListener('status.otp_verified', (e) => {
        try {
          addToast('Door OTP Verified! Service is now In Progress. Proceed with service repair.', 'brass');
          loadActiveJob(currentAgent.email);
        } catch (err) {}
      });

      eventSource.addEventListener('status.completed', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(
            `Job Completed! ₹${parseFloat(data.payout || 0).toFixed(2)} credited to your wallet balance.`,
            'brass'
          );
          loadActiveJob(currentAgent.email);
          loadWallet(currentAgent.email);
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
          loadProviderProfile(currentAgent.email);
        } catch (err) {}
      });

      eventSource.addEventListener('rating.submitted', (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          addToast(
            `Customer submitted a ${data.rating || 5}-star review!`,
            'brass'
          );
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
          loadProviderProfile(currentAgent.email);
        } catch (err) {}
      });

      eventSource.addEventListener('request.cancelled', (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          if (data && data.requestRef) {
            setNearbyRequests(prev => prev.filter(r => r.requestRef !== data.requestRef && r.id !== data.requestRef));
          }
          addToast('A service request was cancelled or removed.', 'destructive');
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        } catch (err) {
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      });

      const handleIncomingRequestEvent = (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          const title = data.serviceTitle || 'Customer Service Request';
          addToast(
            `New Request Nearby: "${title}" within your service radius! Review details and send quote.`,
            'brass'
          );
          setActiveTab('feed');
          playDispatchChime();
          const targetLat = providerLocation?.lat || currentAgent?.lat || null;
          const targetLng = providerLocation?.lng || currentAgent?.lng || null;
          loadNearbyRequests(currentAgent.email, targetLat, targetLng);
        } catch (err) {}
      };

      eventSource.addEventListener('request.broadcast', handleIncomingRequestEvent);
      eventSource.addEventListener('request.dispatched', handleIncomingRequestEvent);
      eventSource.addEventListener('dispatch.request.sent', handleIncomingRequestEvent);
    } catch (err) {
      console.warn('Provider SSE stream notice:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [currentAgent, loadActiveJob, loadWallet, loadNearbyRequests, providerLocation]);

  const handleWithdraw = async () => {
    if (walletBalance <= 0) return;
    const withdrawAmt = walletBalance;
    try {
      if (currentAgent?.email) {
        const res = await fetch(`${API_BASE}/dispatch/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentAgent.email, amount: withdrawAmt })
        });
        const data = await res.json();
        if (data.success) {
          loadWallet(currentAgent.email);
        }
      }
    } catch (e) {
      console.warn('Withdrawal API notice:', e.message);
    }
    const msg = `₹${withdrawAmt.toLocaleString('en-IN')} transferred to primary bank account via Instant IMPS.`;
    setWithdrawSuccessMsg(msg);
    addToast(msg, 'brass');
    setTimeout(() => setWithdrawSuccessMsg(''), 10000);
  };

  const handleToggleOnline = async () => {
    if (isBusyOnJob) {
      addToast(
        `Force-locked to Busy: You cannot change availability while locked to an active job. Complete the service or door OTP to unlock.`,
        'destructive'
      );
      return;
    }
    if (!profileCheck.isFullyComplete) {
      const msg = `Profile is ${profileCheck.completionPercentage}% complete. 100% profile completion is required before going online.`;
      setEligibilityNoticeMsg(msg);
      addToast(msg, 'destructive');
      setTimeout(() => setEligibilityNoticeMsg(''), 10000);
      return;
    }
    if (currentAgent?.email) {
      const nextStatus = !isOnline;
      await toggleOnline(currentAgent.email, nextStatus);
      addToast(nextStatus ? 'You are now ONLINE and discoverable for nearby service dispatches.' : 'You are now OFFLINE.', nextStatus ? 'brass' : 'info');
      if (nextStatus) {
        if (autoFetchAndConnectLocation) {
          autoFetchAndConnectLocation(currentAgent.email, currentAgent.city || 'Bengaluru');
        } else {
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      }
    }
  };

  const handleManualFeedRefresh = async () => {
    if (!currentAgent?.email) return;
    try {
      if (autoFetchAndConnectLocation) {
        await autoFetchAndConnectLocation(currentAgent.email, currentAgent.city || 'Bengaluru');
      } else {
        await loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
      }
      addToast(t.proFeedRefreshed || 'Dispatch feed and live location refreshed.', 'info');
    } catch (err) {
      addToast('Failed to refresh dispatch feed.', 'destructive');
    }
  };

  // Accept Job / Open Quote Modal Guarded Handler (Busy State Enforced)
  const handleAcceptJob = (jobOrReq) => {
    if (isBusyOnJob) {
      addToast(
        `Busy on Active Job: You cannot accept or quote another job until your active job is completed end-to-end.`,
        'destructive'
      );
      return;
    }
    if (!profileCheck.isFullyComplete) {
      const msg = `Profile incomplete (${profileCheck.completionPercentage}%). Complete all checklist items before accepting service jobs.`;
      setEligibilityNoticeMsg(msg);
      addToast(msg, 'destructive');
      setTimeout(() => setEligibilityNoticeMsg(''), 10000);
      return;
    }
    handleOpenQuoteModal(jobOrReq);
  };

  // Open Quote Modal (Guarded against busy state)
  const handleOpenQuoteModal = (req) => {
    if (isBusyOnJob) {
      addToast(
        `Busy on Active Job: You cannot submit a quote while actively engaged on another job.`,
        'destructive'
      );
      return;
    }
    if (!profileCheck.isFullyComplete) {
      const msg = `Profile incomplete (${profileCheck.completionPercentage}%). Complete all checklist items before submitting quotes.`;
      setEligibilityNoticeMsg(msg);
      addToast(msg, 'destructive');
      setTimeout(() => setEligibilityNoticeMsg(''), 10000);
      return;
    }
    setQuoteModalReq(req);
    setQuoteAmount('');
    setQuoteDuration('30');
    setQuoteMessage('');
  };

  // Submit Quote to Customer
  const handleExecuteSubmitQuote = async (e) => {
    e.preventDefault();
    if (isBusyOnJob) {
      addToast('Cannot submit quote: You are busy on an ongoing job.', 'destructive');
      return;
    }
    if (!quoteModalReq || !quoteAmount || parseFloat(quoteAmount) <= 0) return;
    setIsSubmittingQuote(true);
    try {
      const res = await submitQuote(
        quoteModalReq.requestRef,
        currentAgent?.email,
        quoteAmount,
        quoteDuration,
        quoteMessage
      );
      if (res && res.success) {
        const title = quoteModalReq.serviceTitle;
        setQuoteModalReq(null);
        addToast(`Quote for ₹${quoteAmount} dispatched to customer for ${title}!`, 'brass');
        if (currentAgent?.email) {
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      } else {
        addToast(res?.error || 'Failed to submit quote.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to submit quote.', 'destructive');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Mark On the way / En Route
  const handleMarkEnRoute = async () => {
    setActionLoading(true);
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await markEnRoute(ref, currentAgent?.email);
      if (res && res.success && currentAgent?.email) {
        addToast('Status updated: You are now On the way to customer location.', 'brass');
        loadActiveJob(currentAgent.email);
      } else {
        addToast(res?.error || 'Failed to update status.', 'destructive');
      }
    } catch (err) {
      addToast(err.message, 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Mark Arrived at Customer Doorstep
  const handleMarkArrived = async () => {
    setActionLoading(true);
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await markArrived(ref, currentAgent?.email);
      if (res && res.success && currentAgent?.email) {
        addToast('Status updated: You have arrived. Please request the 4-digit door OTP from the customer.', 'brass');
        loadActiveJob(currentAgent.email);
      } else {
        addToast(res?.error || 'Failed to update status.', 'destructive');
      }
    } catch (err) {
      addToast(err.message, 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Verify Customer Door OTP
  const handleVerifyOtp = async (codeToVerify = null) => {
    const code = typeof codeToVerify === 'string' ? codeToVerify : jobOtpInput;
    if (!code || code.length < 4 || actionLoading) return;
    setActionLoading(true);
    setOtpError('');
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await verifyJobOtp(ref, code);
      if (res && res.success) {
        setOtpSuccess(true);
        addToast('Door OTP verified successfully! Job is now In Progress.', 'brass');
        setTimeout(() => {
          setJobOtpInput('');
          setOtpSuccess(false);
          if (currentAgent?.email) {
            loadActiveJob(currentAgent.email);
          }
        }, 300);
      } else {
        const msg = res?.error || 'Invalid OTP code. Please enter the 4-digit code provided by the customer.';
        setOtpError(msg);
        addToast(msg, 'destructive');
        if (res?.locked || res?.remainingAttempts === 0) {
          setOtpLockedUntil(Date.now() + 15 * 60 * 1000);
        }
      }
    } catch (err) {
      const msg = err.message || 'Error verifying OTP.';
      setOtpError(msg);
      addToast(msg, 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Completion Sheet Modal
  const handleOpenCompletionModal = () => {
    setCompletionPhotos([]);
    setCompletionRemarks('');
    setIsCompletionModalOpen(true);
  };

  // Handle Photo Upload with Client-Side Canvas Compression
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remainingSlots = 4 - completionPhotos.length;
    if (remainingSlots <= 0) {
      addToast('Maximum 4 completion photos allowed.', 'destructive');
      return;
    }
    const filesToProcess = files.slice(0, remainingSlots);
    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setCompletionPhotos((prev) => {
            if (prev.length >= 4) return prev;
            return [...prev, compressedDataUrl];
          });
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (index) => {
    setCompletionPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Completion Proof (1–4 Photos + Optional Remarks)
  const handleSubmitCompletion = async (e) => {
    if (e) e.preventDefault();
    if (completionPhotos.length === 0) {
      addToast('Please upload at least 1 photo of completed work.', 'destructive');
      return;
    }
    setIsSubmittingCompletion(true);
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await completeJob(ref, currentAgent?.email, completionPhotos, completionRemarks.trim());
      if (res && res.success) {
        const payout = res.wallet?.payout || res.wallet?.creditedAmount || activePartnerJob.payout || activePartnerJob.amount || 0;
        addToast(`Job completed successfully! ₹${parseFloat(payout).toFixed(2)} credited to your earnings.`, 'brass');
        setIsCompletionModalOpen(false);
        setCompletionPhotos([]);
        setCompletionRemarks('');
        setActiveTab('completed');
        if (currentAgent?.email) {
          loadActiveJob(currentAgent.email);
          loadWallet(currentAgent.email);
          loadProviderProfile(currentAgent.email);
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
          loadPastJobs(currentAgent.email);
          loadCustomerReviews(currentAgent.email);
        }
      } else {
        addToast(res?.error || 'Failed to complete job.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to complete job.', 'destructive');
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  // Professional Cancels Assignment: request reopens as Open, re-broadcasts automatically
  const handleCancelAssignment = async () => {
    if (!activePartnerJob) return;
    const ref = activePartnerJob.requestRef || activePartnerJob.id;
    const confirmed = window.confirm(
      'Cancel your assignment? The customer request will be automatically re-broadcast to other nearby professionals.'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await cancelJob(ref, 'Professional cancelled assignment');
      if (res && res.success) {
        addToast('Assignment cancelled. The request has been re-broadcast to nearby professionals.', 'brass');
        if (currentAgent?.email) {
          loadActiveJob(currentAgent.email);
          loadProviderProfile(currentAgent.email);
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      } else {
        addToast(res?.error || 'Failed to cancel assignment.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to cancel assignment.', 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Merged Completed Jobs with Ratings & Written Feedback
  const mergedJobs = pastJobs.map((job, idx) => {
    let rating = job.rating;
    let feedback = job.feedback;
    let tags = job.tags || [];

    if (!feedback || rating === null || rating === undefined) {
      const matchedReview = customerReviews.find(
        (r) => (r.bookingRef && r.bookingRef === job.bookingRef) ||
               (r.customerName && job.customerName && r.customerName.toLowerCase() === job.customerName.toLowerCase())
      ) || (customerReviews.length === pastJobs.length ? customerReviews[idx] : null);

      if (matchedReview) {
        if (rating === null || rating === undefined) rating = matchedReview.rating;
        if (!feedback) feedback = matchedReview.feedback;
        if ((!tags || tags.length === 0) && Array.isArray(matchedReview.tags)) tags = matchedReview.tags;
      }
    }

    return {
      ...job,
      rating: rating !== null && rating !== undefined ? Number(rating) : null,
      feedback: feedback || '',
      tags: tags || []
    };
  });

  const totalCompletedCount = mergedJobs.length;
  const ratedJobs = mergedJobs.filter((j) => j.rating && Number(j.rating) > 0);
  const avgRatingNum = ratedJobs.length > 0
    ? (ratedJobs.reduce((sum, j) => sum + Number(j.rating), 0) / ratedJobs.length).toFixed(1)
    : (currentAgent?.rating ? Number(currentAgent.rating).toFixed(1) : null);

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const thisMonthCount = mergedJobs.filter((j) => {
    if (!j.completedAt) return false;
    const d = new Date(j.completedAt);
    return !isNaN(d.getTime()) && d.getMonth() === curMonth && d.getFullYear() === curYear;
  }).length;

  const filteredAndSortedJobs = [...mergedJobs]
    .filter((job) => {
      if (completedRatingFilter === 'all') return true;
      const r = Number(job.rating);
      if (completedRatingFilter === '5') return r >= 5;
      if (completedRatingFilter === '4_below') return r && r <= 4;
      return true;
    })
    .sort((a, b) => {
      if (completedSort === 'highest_rated') {
        const rA = Number(a.rating) || 0;
        const rB = Number(b.rating) || 0;
        if (rB !== rA) return rB - rA;
      }
      if (completedSort === 'lowest_rated') {
        const rA = Number(a.rating) || 0;
        const rB = Number(b.rating) || 0;
        if (rA !== rB) return rA - rB;
      }
      const dateA = new Date(a.completedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.completedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  return (
    <div className="pro-console-container">
      {/* ================= 1. MINIMAL HEADER BAR ================= */}
      <header className="pro-header-bar">
        <div className="pro-header-identity">
          {currentAgent?.avatarUrl ? (
            <img
              src={currentAgent.avatarUrl}
              alt={partnerName}
              className="pro-avatar"
              style={{ objectFit: 'cover' }}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextElementSibling) {
                  e.currentTarget.nextElementSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="pro-avatar"
            style={{
              display: currentAgent?.avatarUrl ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.25rem',
              background: '#101820',
              color: '#ffffff'
            }}
          >
            {partnerInitials}
          </div>
          <div className="pro-identity-details">
            <div className="pro-name-row">
              <h1 className="pro-name-heading">{partnerName}</h1>
              <span className="pro-trade-label">{partnerTrade}</span>
            </div>
            <div className="pro-meta-sub">
              {partnerId && partnerId !== 'ID Pending' && (
                <>
                  <span className="pro-meta-id" style={{ fontFamily: "'Space Grotesk', monospace", fontWeight: 600 }}>
                    ID: {partnerId}
                  </span>
                  <span className="pro-meta-divider" aria-hidden="true" />
                </>
              )}
              <span className="pro-meta-status pro-trade-verified">
                {profileCheck.isFullyComplete ? (t.proVerifiedStatus || 'Verified') : (t.proVerificationPending || 'Verification Pending')}
              </span>
              <span className="pro-meta-divider" aria-hidden="true" />
              <span
                className="pro-meta-hub"
                title={providerLocation?.lat ? `GPS: ${providerLocation.lat.toFixed(4)}, ${providerLocation.lng.toFixed(4)}` : (t.proLocationActive || 'Location Active')}
              >
                {partnerLocation}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls (Tactile Online Toggle) */}
        <div className="pro-header-controls">
          <div className="pro-online-control">
            <span className={`pro-online-label ${isOnline && profileCheck.isFullyComplete && !isBusyOnJob ? 'is-online' : ''} ${isBusyOnJob ? 'is-busy' : ''}`}>
              {isBusyOnJob
                ? (t.proBusyStatus || 'Busy (On Job)')
                : isOnline && profileCheck.isFullyComplete
                  ? (availabilityStatus === 'PAUSED' ? (t.proPausedStatus || 'Paused') : (t.proAvailable || 'Available'))
                  : (t.proOffline || 'Offline')}
            </span>
            <button
              type="button"
              className={`pro-switch-toggle ${isOnline && profileCheck.isFullyComplete && !isBusyOnJob ? 'is-online' : ''} ${isBusyOnJob ? 'is-busy-locked' : ''}`}
              onClick={handleToggleOnline}
              disabled={isBusyOnJob || !profileCheck.isFullyComplete}
              aria-label={isBusyOnJob ? 'Availability locked to Busy' : 'Toggle Online Status'}
              title={
                isBusyOnJob
                  ? `Locked to active job: ${activePartnerJob?.serviceTitle || 'In Progress'}. Complete service to unlock dispatch availability.`
                  : !profileCheck.isFullyComplete
                    ? 'Complete profile checklist to go online'
                    : 'Toggle online status'
              }
              style={isBusyOnJob ? { opacity: 0.65, cursor: 'not-allowed' } : {}}
            >
              <span className="pro-switch-thumb" />
            </button>
          </div>
        </div>
      </header>

      {/* Guest Mode Banner for unauthenticated partners */}
      {!currentAgent?.isLoggedIn && (
        <div className="pro-alert-strip warning" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <strong>Professional Account Required</strong>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Sign in to access your live dispatch requests, complete OTP customer jobs, and withdraw wallet balance.</div>
              </div>
            </div>
            <button
              type="button"
              className="pro-btn-complete-profile"
              onClick={() => { window.location.href = 'http://localhost:5500?portal=agent'; }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Professional Sign In
            </button>
          </div>
        </div>
      )}

      {/* ================= 2. COMPACT PROFILE COMPLETION ROW ================= */}
      {!profileCheck.isFullyComplete && (
        <div className="pro-compact-completion-bar">
          <div className="pro-completion-info-left">
            <span className="pro-completion-pct-pill">
              {profileCheck.completionPercentage}% Complete
            </span>
            <div className="pro-completion-text-block">
              <span className="pro-completion-title">
                Professional Profile Incomplete — Ineligible for Live Service Jobs
              </span>
              <p className="pro-completion-desc">
                Complete all {profileCheck.missingCount} missing item{profileCheck.missingCount > 1 ? 's' : ''} ({profileCheck.missingItems.join(', ')}) to unlock live dispatch.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="pro-btn-complete-profile"
            onClick={() => {
              const payload = currentAgent ? encodeURIComponent(JSON.stringify(currentAgent)) : '';
              const agentParam = payload ? `&agent=${payload}` : '';
              window.location.href = `http://localhost:5500?portal=agent&action=profile${agentParam}`;
            }}
          >
            <span>Complete Profile</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          {/* Integrated progress track line */}
          <div
            className="pro-completion-track-inline"
            style={{ width: `${profileCheck.completionPercentage}%` }}
          />
        </div>
      )}

      {/* Action / Warning Feedback Strips */}
      {eligibilityNoticeMsg && (
        <div className="pro-alert-strip warning">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{eligibilityNoticeMsg}</span>
          </div>
        </div>
      )}

      {withdrawSuccessMsg && (
        <div className="pro-alert-strip success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{withdrawSuccessMsg}</span>
          </div>
        </div>
      )}

      {/* ================= 3. UNIFIED FLATTENED STATS BAR ================= */}
      <div className="pro-unified-stats-bar">
        {/* Metric 1: Available Balance */}
        <div className="pro-stat-cell">
          <div className="pro-stat-label-row">
            <span className="pro-stat-label">{t.proStatAvailableBalance || 'Available Balance'}</span>
          </div>
          <div className="pro-stat-value-row">
            <span className="pro-stat-number accent">
              ₹{walletBalance.toLocaleString('en-IN')}
            </span>
            {walletBalance > 0 && (
              <button
                type="button"
                className="pro-stat-action-link"
                onClick={handleWithdraw}
                title="Instant Bank Settlement (IMPS)"
              >
                <span>{t.proWithdrawBtn || 'Withdraw'}</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>
          <div className="pro-stat-caption">
            <span>{completedJobsCount} {t.proJobsSettled || 'jobs settled'}</span>
          </div>
        </div>

        {/* Metric 2: Active Requests */}
        <div className="pro-stat-cell">
          <div className="pro-stat-label-row">
            <span className="pro-stat-label">{t.proNearbyRequests || 'Nearby Requests'}</span>
          </div>
          <div className="pro-stat-value-row">
            <span className="pro-stat-number">{nearbyRequests.length}</span>
          </div>
          <div className="pro-stat-caption">
            <span>{t.proRadiusSub || 'Within 10 km service radius'}</span>
          </div>
        </div>

        {/* Metric 3: Service Rating */}
        <div className="pro-stat-cell">
          <div className="pro-stat-label-row">
            <span className="pro-stat-label">{t.proServiceRating || 'Service Rating'}</span>
          </div>
          <div className="pro-stat-value-row">
            {currentAgent?.rating && Number(currentAgent.rating) > 0 && (completedJobsCount > 0 || pastJobs.length > 0) ? (
              <span className="pro-stat-number rating-val">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{Number(currentAgent.rating).toFixed(1)}</span>
              </span>
            ) : (
              <span className="pro-stat-number muted-val">—</span>
            )}
          </div>
          <div className="pro-stat-caption">
            <span>
              {currentAgent?.rating && Number(currentAgent.rating) > 0 && (completedJobsCount > 0 || pastJobs.length > 0)
                ? (t.proRatingVerified || 'Customer verified score')
                : (t.proNoReviewsYet || 'No customer reviews yet')}
            </span>
          </div>
        </div>

        {/* Metric 4: Partner / Job Status — Reserved single pill badge */}
        <div className="pro-stat-cell">
          <div className="pro-stat-label-row">
            <span className="pro-stat-label">{t.proDispatchStatus || 'Dispatch Status'}</span>
          </div>
          <div className="pro-stat-value-row">
            <span className={`pro-live-status-pill ${activePartnerJob ? 'busy' : (isOnline ? 'active' : 'offline')}`}>
              <span className="pro-status-dot" />
              <span>
                {activePartnerJob ? (t.proActiveJob || 'Active Job') : (isOnline ? (t.proAvailable || 'Available') : (t.proOffline || 'Offline'))}
              </span>
            </span>
          </div>
          <div className="pro-stat-caption">
            <span>
              {activePartnerJob ? (() => {
                const s = (activePartnerJob.status || '').toLowerCase();
                if (s === 'en route' || s === 'on the way') return 'On the way';
                if (s === 'arrived') return 'Arrived';
                if (s === 'in progress' || s === 'otp verified') return 'In progress';
                if (s === 'accepted' || s === 'confirmed') return 'Confirmed';
                return activePartnerJob.status || 'Active Job';
              })() : (isOnline ? (t.proListeningRequests || 'Listening for requests') : (t.proGoOnlinePrompt || 'Go online to accept jobs'))}
            </span>
          </div>
        </div>
      </div>

      {/* ================= 4. ACTIVE JOB IN PROGRESS CARD ================= */}
      {activePartnerJob && (() => {
        const normStatus = (activePartnerJob.status || '').toLowerCase();
        const isAccepted = normStatus === 'accepted' || normStatus === 'confirmed';
        const isEnRoute = normStatus === 'en route' || normStatus === 'on the way';
        const isArrived = normStatus === 'arrived';
        const isInProgress = normStatus === 'in progress' || normStatus === 'otp verified';

        let stageLabel = 'Active Job';
        if (isAccepted) stageLabel = 'Confirmed · Departure Required';
        else if (isEnRoute) stageLabel = 'On the way · Approaching Customer';
        else if (isArrived) stageLabel = 'Arrived at Doorstep · Door OTP Verification';
        else if (isInProgress) stageLabel = 'Service In Progress';

        return (
          <div className="pro-active-job-card">
            <div className="pro-active-job-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="pro-job-stage-indicator">
                  <span className="pro-live-pulse-dot" />
                  <span>{stageLabel}</span>
                </span>
              </div>

              <div className="pro-job-payout-hero">
                Agreed Payout: ₹{activePartnerJob.payout || activePartnerJob.amount || activePartnerJob.totalAmount || activePartnerJob.quoteAmount || 0}
              </div>
            </div>

            <div className="pro-job-details">
              <h2 className="pro-job-title">{activePartnerJob.serviceTitle}</h2>
              <div className="pro-job-meta-line">
                <span>Customer: <strong>{activePartnerJob.customerName || activePartnerJob.userName}</strong></span>
                <span>·</span>
                <span>Location: {activePartnerJob.location || activePartnerJob.address || activePartnerJob.userAddress}</span>
                {(activePartnerJob.customerPhone || activePartnerJob.userPhone) && (
                  <>
                    <span>·</span>
                    <a
                      href={`tel:${activePartnerJob.customerPhone || activePartnerJob.userPhone}`}
                      style={{ color: 'var(--pro-accent)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {activePartnerJob.customerPhone || activePartnerJob.userPhone}
                    </a>
                  </>
                )}
              </div>

              {activePartnerJob.notes && activePartnerJob.notes.trim() !== '' && activePartnerJob.notes !== activePartnerJob.serviceTitle && (
                <div className="pro-job-notes-box">
                  <strong>Notes:</strong> {activePartnerJob.notes}
                </div>
              )}
            </div>

            {/* Live Uber/Ola-grade Turn-by-Turn Road Route & Navigation Telemetry */}
            {(isAccepted || isEnRoute || isArrived) && (
              <div style={{ margin: '0.85rem 0' }}>
                <PartnerActiveNavigationMap
                  job={activePartnerJob}
                  currentAgent={currentAgent}
                  onLocationUpdate={(lat, lng) => {
                    if (updateLocation && currentAgent?.email) {
                      updateLocation(currentAgent.email, lat, lng);
                    }
                  }}
                />
              </div>
            )}

            <div className="pro-job-action-footer">
              {/* Step 1: Confirmed -> Mark On the way */}
              {isAccepted && (
                <>
                  <div style={{ fontSize: '0.84rem', color: 'var(--pro-text-secondary)' }}>
                    Quote accepted by customer. Notify customer when you begin travel.
                  </div>
                  <button
                    type="button"
                    className="pro-primary-cta"
                    onClick={handleMarkEnRoute}
                    disabled={actionLoading}
                  >
                    <span>{actionLoading ? 'Updating...' : 'Mark On the way'}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </>
              )}

              {/* Step 2: On the way -> I've arrived */}
              {isEnRoute && (
                <>
                  <div style={{ fontSize: '0.84rem', color: 'var(--pro-text-secondary)' }}>
                    En route to customer location. Tap below once you reach the customer door.
                  </div>
                  <button
                    type="button"
                    className="pro-primary-cta"
                    onClick={handleMarkArrived}
                    disabled={actionLoading}
                  >
                    <span>{actionLoading ? 'Updating...' : "I've arrived"}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </button>
                </>
              )}

              {/* Step 3: Arrived -> Door OTP Verification */}
              {isArrived && (
                <div style={{ width: '100%', maxWidth: '420px', margin: '0.5rem 0' }}>
                  <div style={{ fontSize: '0.84rem', color: 'var(--pro-text-secondary)', marginBottom: '0.75rem', textAlign: 'center' }}>
                    Customer has received a 4-digit door OTP. Enter it to start service.
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleVerifyOtp(jobOtpInput);
                    }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.875rem' }}
                  >
                    <UnifiedOtpInput
                      length={4}
                      value={jobOtpInput}
                      onChange={setJobOtpInput}
                      onComplete={(code) => handleVerifyOtp(code)}
                      disabled={actionLoading}
                      error={otpError}
                      isSuccess={otpSuccess}
                      lockedUntil={otpLockedUntil}
                      ariaLabel="Enter 4-digit customer door OTP"
                      label="Customer Door OTP (4 digits)"
                      showSubmitFallback={true}
                      fallbackSubmitText={actionLoading ? 'Verifying...' : 'Verify Door OTP'}
                    />
                  </form>
                </div>
              )}

              {/* Step 4: In Progress -> Complete Job */}
              {isInProgress && (
                <>
                  <div style={{ fontSize: '0.84rem', color: 'var(--pro-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Door OTP verified. Service in progress.</span>
                  </div>
                  <button
                    type="button"
                    className="pro-primary-cta"
                    onClick={handleOpenCompletionModal}
                    disabled={actionLoading}
                  >
                    <span>Complete Job</span>
                  </button>
                </>
              )}

              {/* Professional Cancellation (Allowed before In Progress) */}
              {!isInProgress && (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--pro-border-subtle, rgba(0,0,0,0.06))' }}>
                  <button
                    type="button"
                    onClick={handleCancelAssignment}
                    disabled={actionLoading}
                    className="pro-quiet-action-btn"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--pro-border-subtle, #e5e7eb)',
                      color: 'var(--pro-text-secondary, #6b7280)',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      padding: '5px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Cancel Assignment &amp; Re-broadcast
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ================= 5. FULL-WIDTH SEGMENTED CONTROL / TABS ================= */}
      <nav className="pro-tabs-nav" aria-label="Console Views">
        <button
          type="button"
          className={`pro-tab-item ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          <span>{t.proTabLiveFeed || 'Live Requests'}</span>
          <span className="pro-tab-count">{nearbyRequests.length}</span>
        </button>
        <button
          type="button"
          className={`pro-tab-item ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('completed');
            if (currentAgent?.email) {
              loadPastJobs(currentAgent.email);
              loadCustomerReviews(currentAgent.email);
            }
          }}
        >
          <span>{t.proTabCompletedJobs || 'Completed Jobs'}</span>
          <span className="pro-tab-count">{pastJobs.length}</span>
        </button>
        <button
          type="button"
          className={`pro-tab-item ${activeTab === 'payouts' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('payouts');
            if (currentAgent?.email) loadWallet(currentAgent.email);
          }}
        >
          <span>{t.proTabSettlements || 'Earnings & Payouts'}</span>
        </button>
      </nav>

      {/* ================= TAB 1: LIVE REQUESTS FEED ================= */}
      {activeTab === 'feed' && (
        <div>
          {/* Mutual Exclusivity: Busy on Active Job Notice */}
          {isBusyOnJob ? (
            <div className="pro-busy-job-notice-banner" role="alert">
              <div className="pro-busy-icon-box">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="pro-busy-content">
                <h3 className="pro-busy-title">
                  {t.proBusyTitle || 'Currently Assigned to Active Service Job'}
                </h3>
                <p className="pro-busy-desc">
                  You are currently delivering <strong>{activePartnerJob.serviceTitle}</strong>. New incoming dispatches are paused to ensure focused single-job execution until this service is completed.
                </p>
                <div className="pro-busy-meta">
                  <span className="pro-status-dot" />
                  <span>{t.proBusyMeta || 'Door OTP verification required at customer location'}</span>
                </div>
              </div>
            </div>
          ) : nearbyLoading ? (
            <div className="pro-empty-feed-state">
              <div className="pro-empty-icon-radar">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                  <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4z" />
                  <circle cx="12" cy="12" r="1.5" />
                </svg>
              </div>
              <h3 className="pro-empty-heading">Scanning Geospatial Dispatch Mesh</h3>
              <p className="pro-empty-sub">
                Connecting to active H3 cells within your service radius...
              </p>
            </div>
          ) : nearbyRequests.length === 0 ? (
            <div className="pro-empty-feed-state">
              <div className="pro-empty-icon-radar">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m5.65 2.83a2 2 0 0 1 0 2.83m-2.82 0a2 2 0 0 1 0-2.83" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                </svg>
              </div>
              <h3 className="pro-empty-heading">{t.proEmptyFeedHeading || 'No service requests in your dispatch radius'}</h3>
              <p className="pro-empty-sub">
                {t.proEmptyFeedSub || 'You are currently online. New incoming customer repair requests within 10 km will appear here in real-time.'}
              </p>
              <button
                type="button"
                className="pro-btn-secondary-ghost"
                onClick={handleManualFeedRefresh}
              >
                <span>{t.proRefreshFeed || 'Refresh Dispatch Feed'}</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="pro-feed-list">
              {nearbyRequests.map((req) => (
                <div key={req.id || req.requestRef} className="pro-request-card">
                  {/* Top row: Service category (bold, primary) + distance away (muted, right-aligned) */}
                  <div className="pro-card-top-row">
                    <div className="pro-card-header-titles">
                      <h3 className="pro-card-service-title">{req.serviceTitle || (req.category === 'plumber' ? 'Plumbing - Pipe Leakage & Repair' : 'Electrical Repair')}</h3>
                    </div>

                    {req.distanceKm !== undefined && (
                      <div className="pro-card-distance-badge" title={`Exact distance: ${req.distanceKm} km`}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        <span>{req.formattedDistance || formatDistance(req.distanceKm)}</span>
                      </div>
                    )}
                  </div>

                  {/* Problem description: shown as a quoted customer note, visually distinct from labeled fields */}
                  <div className="pro-card-customer-note-box">
                    <span className="pro-card-note-mark" aria-hidden="true">“</span>
                    <p className="pro-card-note-text">
                      {req.problemDescription || req.issueType || 'Inspection & Repair required'}
                    </p>
                    <span className="pro-card-note-mark" aria-hidden="true">”</span>
                  </div>

                  {/* Area/location, schedule, quotes count: grouped as a compact meta row with clear separators */}
                  <div className="pro-card-meta-row">
                    <div className="pro-card-meta-item">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{req.area || 'Nearby Customer'}</span>
                    </div>

                    <span className="pro-card-meta-dot" aria-hidden="true">•</span>

                    <div className="pro-card-meta-item">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>Schedule: {req.problemTiming || 'Immediate'}</span>
                    </div>

                    <span className="pro-card-meta-dot" aria-hidden="true">•</span>

                    <div className="pro-card-meta-item">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{req.totalQuotes || 0} {req.totalQuotes === 1 ? 'quote' : 'quotes'} submitted</span>
                    </div>
                  </div>

                  {/* Action & Status Row */}
                  <div className="pro-card-footer-action-row">
                    <button
                      type="button"
                      className="pro-btn-view-quote"
                      onClick={() => handleOpenQuoteModal(req)}
                      disabled={!profileCheck.isFullyComplete}
                      title={!profileCheck.isFullyComplete ? 'Complete 100% profile checklist to send quotes' : (req.alreadyQuoted ? 'Review quote details' : 'View details and submit quote')}
                    >
                      <span>{req.alreadyQuoted ? 'View & Modify Quote' : 'View & Quote'}</span>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>

                    {req.alreadyQuoted && (
                      <div className="pro-card-status-badge">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Quote Dispatched</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ================= TAB 2: COMPLETED JOBS (MERGED & EXPANDABLE) ================= */}
      {activeTab === 'completed' && (
        <div className="pro-ledger-container">
          {/* Header Toolbar: Single clean title & subtitle */}
          <div className="pro-ledger-toolbar">
            <div className="pro-ledger-header-meta">
              <h3 className="pro-ledger-title">Completed Jobs</h3>
              <p className="pro-ledger-desc">
                Verified via customer door OTP, with ratings and feedback.
              </p>
            </div>
            <button
              type="button"
              className="pro-btn-secondary-ghost"
              onClick={() => {
                if (currentAgent?.email) {
                  loadPastJobs(currentAgent.email);
                  loadCustomerReviews(currentAgent.email);
                }
              }}
              disabled={pastJobsLoading || reviewsLoading}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{pastJobsLoading || reviewsLoading ? 'Refreshing...' : 'Refresh History'}</span>
            </button>
          </div>

          {/* Compact Summary Bar (Top of Panel) */}
          <div className="pro-completed-summary-bar">
            <div className="pro-summary-stat-cell">
              <span className="pro-summary-stat-label">Total Completed Jobs</span>
              <div className="pro-summary-stat-value">
                {totalCompletedCount}
              </div>
              <span className="pro-summary-stat-sub">Verified doorstep deliveries</span>
            </div>

            <div className="pro-summary-stat-cell">
              <span className="pro-summary-stat-label">Average Customer Rating</span>
              <div className="pro-summary-stat-value accented">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--pro-accent)" stroke="var(--pro-accent)" strokeWidth="1" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{avgRatingNum ? `${avgRatingNum} / 5.0` : '—'}</span>
              </div>
              <span className="pro-summary-stat-sub">
                {ratedJobs.length > 0
                  ? `Based on ${ratedJobs.length} verified review${ratedJobs.length === 1 ? '' : 's'}`
                  : 'Awaiting initial customer ratings'}
              </span>
            </div>

            <div className="pro-summary-stat-cell">
              <span className="pro-summary-stat-label">This Month's Completed</span>
              <div className="pro-summary-stat-value">
                {thisMonthCount}
              </div>
              <span className="pro-summary-stat-sub">Current settlement period</span>
            </div>
          </div>

          {/* Lightweight Filter & Sort Controls */}
          <div className="pro-completed-controls-bar">
            <div className="pro-filter-chips-group">
              <button
                type="button"
                className={`pro-filter-chip ${completedRatingFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCompletedRatingFilter('all')}
              >
                <span>All Jobs</span>
                <span>({mergedJobs.length})</span>
              </button>
              <button
                type="button"
                className={`pro-filter-chip ${completedRatingFilter === '5' ? 'active' : ''}`}
                onClick={() => setCompletedRatingFilter('5')}
              >
                <span>5 Stars</span>
                <span>({mergedJobs.filter((j) => Number(j.rating) >= 5).length})</span>
              </button>
              <button
                type="button"
                className={`pro-filter-chip ${completedRatingFilter === '4_below' ? 'active' : ''}`}
                onClick={() => setCompletedRatingFilter('4_below')}
              >
                <span>4 Stars &amp; Below</span>
                <span>({mergedJobs.filter((j) => j.rating && Number(j.rating) <= 4).length})</span>
              </button>
            </div>

            <div className="pro-sort-dropdown-wrap">
              <label htmlFor="pro-job-sort-select" className="pro-sort-label">Sort by:</label>
              <select
                id="pro-job-sort-select"
                className="pro-sort-select"
                value={completedSort}
                onChange={(e) => setCompletedSort(e.target.value)}
              >
                <option value="recent">Most Recent</option>
                <option value="highest_rated">Highest Rated</option>
                <option value="lowest_rated">Lowest Rated</option>
              </select>
            </div>
          </div>

          {/* Job List / Loading / Empty States */}
          {pastJobsLoading ? (
            <div className="pro-ledger-empty-state">
              <div className="pro-empty-icon-radar">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h4 className="pro-ledger-empty-title">Loading Job History...</h4>
            </div>
          ) : mergedJobs.length === 0 ? (
            <div className="pro-ledger-empty-state">
              <div className="pro-ledger-empty-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h4 className="pro-ledger-empty-title">No completed jobs yet</h4>
              <p className="pro-ledger-empty-desc">
                Verified doorstep repair jobs completed via customer 4-digit OTP will appear here in your verified ledger.
              </p>
              <div className="pro-ledger-empty-meta">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Doorstep 4-digit OTP verification ensures fraud-proof completion</span>
              </div>
            </div>
          ) : filteredAndSortedJobs.length === 0 ? (
            <div className="pro-ledger-empty-state" style={{ padding: '2.5rem 1.5rem' }}>
              <h4 className="pro-ledger-empty-title">No completed jobs match this filter</h4>
              <p className="pro-ledger-empty-desc">
                Try switching to "All Jobs" to view your full verified service ledger.
              </p>
              <button
                type="button"
                className="pro-btn-secondary-ghost"
                onClick={() => setCompletedRatingFilter('all')}
              >
                Clear Filter
              </button>
            </div>
          ) : (
            <div className="pro-completed-jobs-list">
              {filteredAndSortedJobs.map((job) => {
                const jobKey = job.id || job.bookingRef;
                const isExpanded = expandedJobIds.has(jobKey);
                const hasWrittenFeedback = Boolean(job.feedback && job.feedback.trim());
                const refId = job.bookingRef || `JOB-${job.id}`;

                return (
                  <div
                    key={jobKey}
                    className={`pro-completed-job-card ${isExpanded ? 'expanded' : ''}`}
                  >
                    {/* Collapsed One Clean Row Header */}
                    <button
                      type="button"
                      className="pro-job-row-header"
                      onClick={() => toggleJobExpanded(jobKey)}
                      aria-expanded={isExpanded}
                    >
                      {/* 1. Service Type + Icon + Reference ID */}
                      <div className="pro-job-service-col">
                        <div className="pro-job-icon-box">
                          {getServiceIcon(job.category, job.serviceTitle)}
                        </div>
                        <div className="pro-job-title-stack">
                          <span className="pro-job-service-name" title={job.serviceTitle}>
                            {job.serviceTitle}
                          </span>
                          <span className="pro-job-ref-tag">Ref: {refId}</span>
                        </div>
                      </div>

                      {/* 2. Completion Date */}
                      <div className="pro-job-date-col">
                        <span className="pro-job-date-val">
                          {job.completedAt
                            ? new Date(job.completedAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })
                            : 'Completed'}
                        </span>
                        {job.completedAt && (
                          <span className="pro-job-date-time">
                            {new Date(job.completedAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>

                      {/* 3. Customer Star Rating (Star Icons, No numeric badge) */}
                      <div className="pro-job-rating-col">
                        <StarRatingIcons rating={job.rating} />
                        <span className="pro-rating-subtext">
                          {job.rating ? `${Number(job.rating).toFixed(1)} Rating` : 'Unrated'}
                        </span>
                      </div>

                      {/* 4. Payout Amount */}
                      <div className="pro-job-payout-col">
                        <span className="pro-job-payout-val">
                          ₹{parseFloat(job.amount || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </span>
                        <span className="pro-job-payout-status">Settled</span>
                      </div>

                      {/* 5. Chevron Toggle */}
                      <div className="pro-job-chevron-col" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {/* Accordion Expandable Body (Smooth ~200ms) */}
                    <div className={`pro-job-accordion-body ${isExpanded ? 'open' : ''}`}>
                      <div className="pro-job-accordion-inner">
                        <div className="pro-job-expanded-content">
                          {/* Written Feedback (Silently collapsed if none) */}
                          {hasWrittenFeedback && (
                            <div className="pro-job-feedback-box">
                              <div className="pro-job-feedback-header">
                                <span className="pro-job-feedback-customer">
                                  Customer Review · {job.customerName || 'Verified Customer'}
                                </span>
                                <span className="pro-job-feedback-verified-tag">
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Verified Service
                                </span>
                              </div>
                              <p className="pro-job-feedback-text">
                                "{job.feedback.trim()}"
                              </p>
                              {Array.isArray(job.tags) && job.tags.length > 0 && (
                                <div className="pro-job-feedback-tags">
                                  {job.tags.map((tag, tIdx) => (
                                    <span key={tIdx} className="pro-job-feedback-tag">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Details Grid: Address, OTP Timestamp, Payout Breakdown */}
                          <div className="pro-job-details-grid">
                            {/* Service Address */}
                            <div className="pro-job-detail-card">
                              <div className="pro-job-detail-label">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                                <span>Service Address</span>
                              </div>
                              <div className="pro-job-detail-val">
                                {job.serviceAddress || 'Customer Doorstep Location'}
                              </div>
                              <div className="pro-job-detail-sub">
                                Customer: {job.customerName || 'Verified Customer'}
                              </div>
                            </div>

                            {/* OTP Verified Completion */}
                            <div className="pro-job-detail-card">
                              <div className="pro-job-detail-label">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                  <polyline points="9 12 11 14 15 10" />
                                </svg>
                                <span>Door OTP Verified</span>
                              </div>
                              <div className="pro-job-detail-val">
                                {job.otpVerifiedAt || job.completedAt
                                  ? new Date(job.otpVerifiedAt || job.completedAt).toLocaleString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : 'Verified at Doorstep'}
                              </div>
                              <div className="pro-job-detail-sub pro-job-otp-badge">
                                4-digit customer security PIN verified
                              </div>
                            </div>

                            {/* Payout Breakdown */}
                            <div className="pro-job-detail-card">
                              <div className="pro-job-detail-label">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="2" y="4" width="20" height="16" rx="2" />
                                  <line x1="2" y1="10" x2="22" y2="10" />
                                </svg>
                                <span>Payout Breakdown</span>
                              </div>
                              <div className="pro-job-payout-breakdown">
                                <div className="pro-payout-line">
                                  <span>Gross Fare</span>
                                  <span>₹{parseFloat(job.amount || 0).toFixed(2)}</span>
                                </div>
                                <div className="pro-payout-line">
                                  <span>Platform Fee</span>
                                  <span className="pro-payout-free">₹0.00 (Zero Fee)</span>
                                </div>
                                <div className="pro-payout-line total">
                                  <span>Net Credited</span>
                                  <span className="pro-payout-credited">₹{parseFloat(job.amount || 0).toFixed(2)}</span>
                                </div>
                                <div className="pro-payout-method-tag">
                                  {job.paymentMethod || 'UPI / Cash on completion'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: FINANCIAL EARNINGS & PAYOUTS ================= */}
      {activeTab === 'payouts' && (
        <div className="pro-ledger-panel">
          <div className="pro-ledger-header">
            <div>
              <h3 className="pro-section-title">
                {t.proEarningsTitle || 'Earnings & Payouts'}
              </h3>
              <p className="pro-section-subtitle">
                {t.proEarningsSubtitle || 'Automated payout ledger for verified service jobs, door OTP releases, and bank transfers.'}
              </p>
            </div>

            <div className="pro-ledger-header-actions">
              <div className="pro-ledger-balance-display">
                <span className="pro-ledger-balance-label">{t.proNetAvailable || 'Available for Withdrawal'}</span>
                <span className="pro-ledger-balance-val">
                  ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <button
                type="button"
                className="pro-btn-settlement"
                onClick={handleWithdraw}
                disabled={walletBalance <= 0}
                title={walletBalance <= 0 ? 'No funds available to withdraw' : 'Withdraw to Bank via IMPS'}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <rect x="9" y="9" width="12" height="10" rx="2" />
                  <circle cx="15" cy="14" r="1" />
                </svg>
                <span>{t.proWithdrawBtn || 'Withdraw to Bank'}</span>
              </button>
            </div>
          </div>

          {walletTransactions.length === 0 ? (
            <div className="pro-ledger-empty-state">
              <div className="pro-ledger-empty-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h4 className="pro-ledger-empty-title">{t.proNoTransactions || 'No Transactions Recorded'}</h4>
              <p className="pro-ledger-empty-desc">
                {t.proNoTransactionsDesc || 'Your completed jobs will appear here once settled.'}
              </p>
              <div className="pro-ledger-empty-meta">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>{t.proPayoutProtection || 'Automated payouts with door-step payment protection'}</span>
              </div>
            </div>
          ) : (
            <div className="pro-table-wrapper">
              <table className="pro-ledger-table">
                <thead>
                  <tr>
                    <th>{t.proColJobRef || 'Job Reference'}</th>
                    <th>{t.proColDateTime || 'Date & Time'}</th>
                    <th>{t.proColPayoutType || 'Payout Type'}</th>
                    <th style={{ textAlign: 'right' }}>{t.proColAmount || 'Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  {walletTransactions.map((tx) => (
                    <tr key={tx.id} className="pro-ledger-row">
                      <td className="pro-tx-cell-ref">
                        <div className="pro-tx-desc">
                          {tx.description || (tx.requestRef ? `Service Payout: ${tx.requestRef}` : 'Service Payout')}
                        </div>
                      </td>
                      <td className="pro-tx-cell-date">
                        <div className="pro-tx-datetime">
                          <span className="pro-tx-date">
                            {tx.createdAt
                              ? new Date(tx.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })
                              : 'Recent'}
                          </span>
                          {tx.createdAt && (
                            <span className="pro-tx-time">
                              {new Date(tx.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="pro-tx-cell-type">
                        <span className="pro-tx-type">
                          {tx.type === 'credit' ? (t.proTypeServicePayout || 'Service Payout') : (t.proTypeBankPayout || 'Bank IMPS Payout')}
                        </span>
                      </td>
                      <td className="pro-tx-cell-amount" style={{ textAlign: 'right' }}>
                        <span className={`pro-tx-amount ${tx.type === 'credit' ? 'credit' : 'debit'}`}>
                          <span className="pro-tx-prefix">{tx.type === 'credit' ? '+' : '-'}</span>
                          ₹{parseFloat(tx.amount || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: SUBMIT CUSTOM QUOTE ================= */}
      {quoteModalReq && (
        <div className="pro-modal-backdrop" onClick={() => setQuoteModalReq(null)}>
          <div className="pro-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="pro-modal-header">
              <div>
                <h3 className="pro-modal-title">Submit Service Quote</h3>
                <p className="pro-modal-subtitle">
                  {quoteModalReq.serviceTitle}
                </p>
              </div>
              <button
                type="button"
                className="pro-modal-close-btn"
                onClick={() => setQuoteModalReq(null)}
                aria-label="Close quote modal"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ background: 'var(--pro-surface-subtle)', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '1.25rem', color: 'var(--pro-text-secondary)' }}>
              <strong>Customer Problem:</strong> "{quoteModalReq.problemDescription}"
            </div>

            <form onSubmit={handleExecuteSubmitQuote}>
              <div className="pro-form-group">
                <label className="pro-form-label">
                  Quote Amount (₹) <span style={{ color: 'var(--pro-danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="50"
                  step="10"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="e.g. 450"
                  required
                  autoFocus
                  className="pro-input-field"
                />
              </div>

              <div className="pro-form-group">
                <label className="pro-form-label">Estimated Service Duration</label>
                <select
                  value={quoteDuration}
                  onChange={(e) => setQuoteDuration(e.target.value)}
                  className="pro-input-field"
                >
                  <option value="20">20 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="45">45 Minutes</option>
                  <option value="60">1 Hour</option>
                  <option value="90">1.5 Hours</option>
                  <option value="120">2+ Hours</option>
                </select>
              </div>

              <div className="pro-form-group">
                <label className="pro-form-label">Technician Note (Optional)</label>
                <textarea
                  rows={2}
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                  placeholder="e.g. OEM parts on hand in kit. Can arrive in 20 minutes."
                  className="pro-input-field"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="pro-modal-actions">
                <button
                  type="button"
                  className="pro-btn-cancel"
                  onClick={() => setQuoteModalReq(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuote}
                  className="pro-btn-submit-quote"
                >
                  {isSubmittingQuote ? 'Dispatched...' : 'Send Quote to Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: COMPLETE JOB / PROOF OF WORK SHEET ================= */}
      {isCompletionModalOpen && activePartnerJob && (
        <div className="pro-modal-backdrop" onClick={() => !isSubmittingCompletion && setIsCompletionModalOpen(false)}>
          <div className="pro-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="pro-modal-header">
              <div>
                <h3 className="pro-modal-title">Complete Job</h3>
                <p className="pro-modal-subtitle">
                  Upload 1–4 photos of finished work to settle payout.
                </p>
              </div>
              <button
                type="button"
                className="pro-modal-close-btn"
                onClick={() => !isSubmittingCompletion && setIsCompletionModalOpen(false)}
                aria-label="Close completion modal"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitCompletion} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
              {/* Photo Upload Section */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--pro-text-main)', marginBottom: '0.5rem' }}>
                  Work Completion Photos (1–4 required) <span style={{ color: '#059669' }}>*</span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {completionPhotos.map((photoUrl, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--pro-border-card)' }}>
                      <img
                        src={photoUrl}
                        alt={`Proof ${idx + 1}`}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        aria-label="Remove photo"
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: 0
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {completionPhotos.length < 4 && (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        borderRadius: '8px',
                        border: '1.5px dashed var(--pro-border-card, #d1d5db)',
                        background: 'var(--pro-bg-input, #f9fafb)',
                        cursor: 'pointer',
                        color: 'var(--pro-text-muted)',
                        fontSize: '0.75rem',
                        gap: '4px'
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Add Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--pro-text-muted)' }}>
                  {completionPhotos.length} of 4 photos added {completionPhotos.length === 0 ? '(At least 1 photo required)' : ''}
                </span>
              </div>

              {/* Optional Remarks Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--pro-text-main)' }}>
                    Work Remarks (Optional)
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--pro-text-muted)' }}>
                    {completionRemarks.length}/300
                  </span>
                </div>
                <textarea
                  value={completionRemarks}
                  onChange={(e) => setCompletionRemarks(e.target.value.slice(0, 300))}
                  placeholder="Brief note on repairs or parts replaced..."
                  rows={3}
                  maxLength={300}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--pro-border-card, #d1d5db)',
                    background: 'var(--pro-bg-input, #fff)',
                    color: 'var(--pro-text-main)',
                    fontSize: '0.85rem',
                    resize: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="pro-btn-secondary"
                  onClick={() => setIsCompletionModalOpen(false)}
                  disabled={isSubmittingCompletion}
                  style={{ padding: '0.65rem 1.25rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pro-primary-cta"
                  disabled={completionPhotos.length === 0 || isSubmittingCompletion}
                  style={{ padding: '0.65rem 1.5rem', opacity: completionPhotos.length === 0 ? 0.6 : 1 }}
                >
                  {isSubmittingCompletion ? 'Submitting...' : 'Submit & Complete Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating 10-Second Toast Alerts Queue */}
      <BookingToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
