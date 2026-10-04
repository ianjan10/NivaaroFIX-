import React, { useState, useEffect } from 'react';
import { usePartner } from '../context/PartnerContext';
import { useLanguage } from '../context/LanguageContext';
import { evaluateAgentChecklist } from '../utils/profileStrength';
import BookingToast from '../components/BookingToast';
import '../styles/PartnerConsole.css';

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

export default function PartnerConsolePage({ agent: propAgent }) {
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
    nearbyLoading,
    loadNearbyRequests,
    quotingRequestRef,
    setQuotingRequestRef,
    submitQuote,
    activePartnerJob,
    jobStage,
    loadActiveJob,
    markEnRoute,
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
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'payouts'

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

  // Quote Submission Modal State
  const [quoteModalReq, setQuoteModalReq] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteDuration, setQuoteDuration] = useState('30');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Active Job OTP State
  const [jobOtpInput, setJobOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
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
  const partnerHub = currentAgent?.city ? `${currentAgent.city} ${t.proHubLabel || 'Hub'}` : (currentAgent?.state ? `${currentAgent.state} ${t.proHubLabel || 'Hub'}` : (t.proHubPending || 'Hub Pending'));
  const partnerTrade = currentAgent?.trade === 'plumber' 
    ? (t.proTradePlumber || 'Plumber') 
    : (currentAgent?.trade ? formatTitleCase(currentAgent.trade) : (t.proTradeElectrician || 'Electrician'));
  const partnerInitials = (partnerName || 'P').trim().charAt(0).toUpperCase();

  // Check if provider is busy on an ongoing job (mutual exclusivity requirement)
  const isBusyOnJob = Boolean(
    activePartnerJob &&
    ['accepted', 'en route', 'otp verified', 'in progress'].includes((activePartnerJob.status || '').toLowerCase())
  );

  // Load provider data & auto-fetch live GPS on mount / agent change
  useEffect(() => {
    if (currentAgent?.email) {
      loadProviderProfile(currentAgent.email);
      loadActiveJob(currentAgent.email);
      loadWallet(currentAgent.email);
      if (autoFetchAndConnectLocation) {
        autoFetchAndConnectLocation(currentAgent.email, currentAgent.city || 'Bengaluru');
      } else {
        loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
      }
    }
  }, [currentAgent, loadProviderProfile, loadActiveJob, loadWallet, loadNearbyRequests, autoFetchAndConnectLocation]);

  // Real-time automatic background polling (every 3 seconds - no manual refresh needed)
  useEffect(() => {
    if (!currentAgent?.email) return;

    const pollInterval = setInterval(async () => {
      try {
        await loadActiveJob(currentAgent.email);
        await loadWallet(currentAgent.email);
        if (!isBusyOnJob) {
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      } catch (err) {
        // Silent sync catch
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [currentAgent, isBusyOnJob, loadActiveJob, loadWallet, loadNearbyRequests]);

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
        } catch (err) {}
      });

      eventSource.addEventListener('request.cancelled', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(`Service request ${data.requestRef} was cancelled by customer.`, 'destructive');
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        } catch (err) {}
      });
    } catch (err) {
      console.warn('Provider SSE stream notice:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [currentAgent, loadActiveJob, loadWallet, loadNearbyRequests]);

  const handleWithdraw = () => {
    if (walletBalance <= 0) return;
    const msg = `₹${walletBalance.toLocaleString('en-IN')} transferred to primary bank account via Instant IMPS.`;
    setWithdrawSuccessMsg(msg);
    addToast(msg, 'brass');
    setTimeout(() => setWithdrawSuccessMsg(''), 10000);
  };

  const handleToggleOnline = async () => {
    if (isBusyOnJob) {
      addToast(
        `Force-locked to Busy: You cannot change availability while locked to active job (${activePartnerJob?.requestRef || 'ongoing'}). Complete the job or door OTP to unlock.`,
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
        `Busy on Active Job (${activePartnerJob.requestRef}): You cannot accept or quote another job until your active job is completed end-to-end.`,
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
        `Busy on Active Job (${activePartnerJob.requestRef}): You cannot submit a quote while actively engaged on another job.`,
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

  // Mark En Route
  const handleMarkEnRoute = async () => {
    setActionLoading(true);
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await markEnRoute(ref, currentAgent?.email);
      if (res && res.success && currentAgent?.email) {
        addToast('Status updated: You are now marked En Route to customer location.', 'brass');
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
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!jobOtpInput || jobOtpInput.length < 4) return;
    setActionLoading(true);
    setOtpError('');
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await verifyJobOtp(ref, jobOtpInput);
      if (res && res.success) {
        setJobOtpInput('');
        addToast('Door OTP verified successfully! Job is now In Progress.', 'brass');
        if (currentAgent?.email) {
          loadActiveJob(currentAgent.email);
        }
      } else {
        const msg = res?.error || 'Invalid OTP code. Please enter the 4-digit code provided by the customer.';
        setOtpError(msg);
        addToast(msg, 'destructive');
      }
    } catch (err) {
      const msg = err.message || 'Error verifying OTP.';
      setOtpError(msg);
      addToast(msg, 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Active Job
  const handleCompleteActiveJob = async () => {
    setActionLoading(true);
    try {
      const ref = activePartnerJob.requestRef || activePartnerJob.id;
      const res = await completeJob(ref, currentAgent?.email);
      if (res && res.success) {
        const payout = res.wallet?.payout || res.wallet?.creditedAmount || activePartnerJob.payout || activePartnerJob.amount || 0;
        addToast(`Job completed successfully! ₹${parseFloat(payout).toFixed(2)} credited to your ledger.`, 'brass');
        if (currentAgent?.email) {
          loadActiveJob(currentAgent.email);
          loadWallet(currentAgent.email);
          loadProviderProfile(currentAgent.email);
          loadNearbyRequests(currentAgent.email, currentAgent.lat, currentAgent.lng);
        }
      } else {
        addToast(res?.error || 'Failed to complete job.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to complete job.', 'destructive');
    } finally {
      setActionLoading(false);
    }
  };

  // Professional Cancels Assignment: request reopens as Open, re-broadcasts automatically
  const handleCancelAssignment = async () => {
    if (!activePartnerJob) return;
    const ref = activePartnerJob.requestRef || activePartnerJob.id;
    const confirmed = window.confirm(
      `Cancel your assignment for ${ref}? The customer request will be automatically re-broadcast to other nearby professionals.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await cancelJob(ref, 'Professional cancelled assignment');
      if (res && res.success) {
        addToast(`Assignment cancelled. Request ${ref} has been re-broadcast to nearby professionals.`, 'brass');
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
                {partnerHub}
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
                  ? `Locked to active job ${activePartnerJob?.requestRef || ''}. Complete service or door OTP to unlock dispatch availability.`
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
            {currentAgent?.rating && Number(currentAgent.rating) > 0 ? (
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
              {currentAgent?.rating && Number(currentAgent.rating) > 0
                ? (t.proRatingVerified || 'Customer verified score')
                : (t.proNoReviewsYet || 'No reviews logged yet')}
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
              {activePartnerJob
                ? (t.proDoorOtpProgress || 'Door OTP in progress')
                : (isOnline ? (t.proListeningRequests || 'Listening for requests') : (t.proGoOnlinePrompt || 'Go online to accept jobs'))}
            </span>
          </div>
        </div>
      </div>

      {/* ================= 4. ACTIVE JOB IN PROGRESS CARD ================= */}
      {activePartnerJob && (
        <div className="pro-active-job-card">
          <div className="pro-active-job-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="pro-job-stage-indicator">
                <span className="pro-live-pulse-dot" />
                <span>
                  {activePartnerJob.status === 'Accepted'
                    ? 'Quote Accepted · Departure Required'
                    : activePartnerJob.status === 'En Route'
                    ? 'En Route · Door OTP Verification'
                    : 'Service In Progress'}
                </span>
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--pro-text-muted)' }}>
                Ref: <strong style={{ color: 'var(--pro-text-main)' }}>{activePartnerJob.requestRef || activePartnerJob.id}</strong>
              </span>
            </div>

            <div className="pro-job-payout-hero">
              Agreed Payout: ₹{activePartnerJob.payout || activePartnerJob.amount || activePartnerJob.totalAmount || 0}
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

            <div className="pro-job-notes-box">
              <strong>Notes:</strong> {activePartnerJob.notes || activePartnerJob.problemDescription || 'Standard diagnosis and repair dispatch.'}
            </div>
          </div>

          <div className="pro-job-action-footer">
            {/* Step 1: Mark En Route */}
            {activePartnerJob.status === 'Accepted' && (
              <>
                <div style={{ fontSize: '0.84rem', color: 'var(--pro-text-secondary)' }}>
                  Quote accepted by customer. Notify when en route to location.
                </div>
                <button
                  type="button"
                  className="pro-primary-cta"
                  onClick={handleMarkEnRoute}
                  disabled={actionLoading}
                >
                  <span>{actionLoading ? 'Updating...' : 'Mark En Route to Location'}</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </>
            )}

            {/* Step 2: Door OTP Verification */}
            {activePartnerJob.status === 'En Route' && (
              <div style={{ width: '100%' }}>
                <form onSubmit={handleVerifyOtp} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <input
                      type="text"
                      className="pro-input-field"
                      value={jobOtpInput}
                      onChange={(e) => setJobOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Enter 4-Digit Customer Door OTP"
                      required
                      style={{ letterSpacing: '0.15em', fontWeight: 700, textAlign: 'center' }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="pro-primary-cta"
                    disabled={actionLoading || jobOtpInput.length < 4}
                  >
                    {actionLoading ? 'Verifying...' : 'Verify OTP & Begin Work'}
                  </button>
                </form>
                {otpError && (
                  <div style={{ color: 'var(--pro-danger)', fontSize: '0.82rem', marginTop: '0.45rem', fontWeight: 600 }}>
                    {otpError}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Complete Job */}
            {(activePartnerJob.status === 'In Progress' || activePartnerJob.status === 'OTP Verified') && (
              <>
                <div style={{ fontSize: '0.84rem', color: 'var(--pro-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>OTP verified. Complete repair to settle payout.</span>
                </div>
                <button
                  type="button"
                  className="pro-primary-cta"
                  onClick={handleCompleteActiveJob}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Completing...' : `Complete Job & Collect ₹${activePartnerJob.payout || activePartnerJob.amount || activePartnerJob.totalAmount || 0}`}
                </button>
              </>
            )}

            {/* Professional Cancellation */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--pro-border-subtle, rgba(0,0,0,0.06))' }}>
              <button
                type="button"
                onClick={handleCancelAssignment}
                disabled={actionLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pro-text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Cancel Assignment &amp; Re-broadcast
              </button>
            </div>
          </div>
        </div>
      )}

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
                  You are currently delivering <strong>{activePartnerJob.serviceTitle}</strong> (Ref: {activePartnerJob.requestRef}). New incoming dispatches are paused to ensure focused single-job execution until this service is completed.
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
                      {/* Reference ID: small, muted, below category */}
                      <span className="pro-card-ref-id">Ref: {req.requestRef}</span>
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


      {/* ================= TAB 2: FINANCIAL EARNINGS & PAYOUTS ================= */}
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
                  {quoteModalReq.serviceTitle} · Ref: {quoteModalReq.requestRef}
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

      {/* Floating 10-Second Toast Alerts Queue */}
      <BookingToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
