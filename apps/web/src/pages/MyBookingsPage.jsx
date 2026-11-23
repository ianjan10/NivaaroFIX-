import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBooking } from '../context/BookingContext';
import { useLanguage } from '../context/LanguageContext';
import BookingTrackLiveModal from '../components/BookingTrackLiveModal';
import BookingContactProModal from '../components/BookingContactProModal';
import BookingCancelConfirmModal from '../components/BookingCancelConfirmModal';
import BookingInvoiceModal from '../components/BookingInvoiceModal';
import BookingRescheduleModal from '../components/BookingRescheduleModal';
import BookingRateModal from '../components/BookingRateModal';
import CustomerPaymentModal from '../components/CustomerPaymentModal';
import PaymentReceiptModal from '../components/PaymentReceiptModal';
import UnpaidCompletedJobModal from '../components/UnpaidCompletedJobModal';
import BookingToast from '../components/BookingToast';
import BookingProgressTracker from '../components/BookingProgressTracker';
import Button from '../components/Button';

/**
 * Format saved address into short label plus area (e.g. "Home · Thuvakudi")
 * Never returns "Your Address".
 */
function formatDisplayAddress(rawAddress) {
  if (!rawAddress) return 'Trichy';
  const clean = rawAddress.trim();
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 'Trichy';

  const lower = clean.toLowerCase();
  if (lower.startsWith('home') || lower.startsWith('work')) {
    const label = lower.startsWith('home') ? 'Home' : 'Work';
    const area = parts.find((p) => !p.toLowerCase().includes('home') && !p.toLowerCase().includes('work')) || parts[1] || parts[0];
    return `${label} · ${area}`;
  }

  if (parts.length >= 2) {
    return `${parts[0]} · ${parts[1]}`;
  }
  return parts[0];
}

/**
 * Format subtitle into Trade and Date (e.g. "Electrician · 12 Oct, 4:30 PM")
 */
function formatJobSubtitle(category, createdAt) {
  const tradeMap = {
    electrician: 'Electrician',
    plumber: 'Plumber'
  };
  const trade = tradeMap[category?.toLowerCase()] || (category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Technician');
  const d = createdAt ? new Date(createdAt) : new Date();
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${trade} · ${day}, ${time}`;
}

export function formatName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function isGenericPlaceholder(text) {
  if (!text || typeof text !== 'string') return true;
  const lower = text.trim().toLowerCase();
  return [
    'standard diagnosis and repair dispatch.',
    'standard diagnosis & repair dispatch',
    'general repair',
    'repair',
    'standard repair',
    'photo inspection provided',
    'not specified',
    'service request',
    'inspection & repair',
    'home service repair'
  ].includes(lower);
}

export function getJobDisplayTitle(job) {
  const prob = (job?.problemDescription || '').trim();
  const issue = (job?.issueType || '').trim();
  const title = (job?.serviceTitle || '').trim();

  // 1. If customer entered their specific problem, write that problem
  if (prob && !isGenericPlaceholder(prob)) {
    return prob.charAt(0).toUpperCase() + prob.slice(1);
  }
  // 2. Else if customer selected from some option, write that option
  if (issue && !isGenericPlaceholder(issue) && issue.toLowerCase() !== 'inspection & repair') {
    return issue.charAt(0).toUpperCase() + issue.slice(1);
  }
  // 3. Fallback to service title if genuine (not generic Taps, Mixers & Showers placeholder)
  if (title && !isGenericPlaceholder(title) && !title.toLowerCase().includes('taps, mixers & showers')) {
    return title.charAt(0).toUpperCase() + title.slice(1);
  }
  if (title && !isGenericPlaceholder(title)) {
    return title;
  }
  // 4. Fallback to category default
  return job?.category === 'plumber' ? 'Plumbing Repair' : 'Electrical Repair';
}

/**
 * Check if the user wrote a genuine custom problem description that differs from the card title
 */
function hasCustomDetails(problemDescription, displayTitle) {
  if (!problemDescription) return false;
  const desc = problemDescription.trim();
  if (desc.length === 0 || isGenericPlaceholder(desc)) return false;
  const title = (displayTitle || '').trim().toLowerCase();
  const descLower = desc.toLowerCase();
  // If the card heading already displays this problem text, don't duplicate "Details: ..."
  if (descLower === title) return false;
  return true;
}

export default function MyBookingsPage({
  currentUser,
  onNavigateToHome,
  onNavigateToServices,
  onOpenAuth,
  bookingsNavNonce = 0
}) {
  const {
    activeBookings: liveDbBookings,
    loadUserBookings,
    activeRequests,
    loadMyRequests,
    acceptQuote,
    cancelRequest,
    cancelAndRebroadcast,
    rateCompletedJob
  } = useBooking();

  const { t } = useLanguage();

  // Active tab state: 'active' | 'completed' | 'all'
  // If active requests are already in context and empty, default directly to 'all'
  const [activeTab, setActiveTab] = useState(() => {
    if (Array.isArray(activeRequests)) {
      const hasActive = activeRequests.some((r) =>
        !['completed', 'cancelled'].includes((r.status || '').toLowerCase())
      );
      if (!hasActive && activeRequests.length > 0) {
        return 'all';
      }
    }
    return 'active';
  });

  // Track whether initial tab selection has been performed on entry
  const hasInitializedTabRef = useRef(false);

  // Search input & debounced query
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Modals state
  const [liveTrackBooking, setLiveTrackBooking] = useState(null);
  const [contactProBooking, setContactProBooking] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [invoiceModalBooking, setInvoiceModalBooking] = useState(null);
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [rateModalBooking, setRateModalBooking] = useState(null);
  const [payModalBooking, setPayModalBooking] = useState(null);
  const [receiptModalData, setReceiptModalData] = useState(null);
  const [unpaidAlertJob, setUnpaidAlertJob] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  useEffect(() => {
    if (!previewPhoto) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setPreviewPhoto(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPhoto]);

  // Accordion state to minimize/expand booking cards: { [jobId]: boolean }
  const [cardExpandedMap, setCardExpandedMap] = useState({});

  const isCardExpanded = (job) => {
    if (cardExpandedMap[job.id] !== undefined) {
      return cardExpandedMap[job.id];
    }
    // Default: Completed and Cancelled jobs are minimized (collapsed). Active jobs are expanded.
    return job.status !== 'Completed' && job.status !== 'Cancelled';
  };

  const toggleCardExpanded = (jobId, currentStatus) => {
    setCardExpandedMap((prev) => {
      const current = prev[jobId] !== undefined ? prev[jobId] : (currentStatus !== 'Completed' && currentStatus !== 'Cancelled');
      return { ...prev, [jobId]: !current };
    });
  };

  // Pending Quote Acceptance dialog state: { quote, job } | null
  const [pendingAcceptQuote, setPendingAcceptQuote] = useState(null);
  const [isAcceptingQuote, setIsAcceptingQuote] = useState(false);

  // Quotes sorting map: { [reqRef]: 'lowest' | 'best' | 'fastest' }
  const [quotesSortMap, setQuotesSortMap] = useState({});

  // Real-time quotes cache
  const [quotesByRef, setQuotesByRef] = useState({});

  // Scroll track references for horizontal navigation
  const scrollTrackRefs = useRef({});

  // 10-second toast notification queue
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 10000);
  };
  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  // Debounce search input (~250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Initial load
  const loadBookingsData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      if (currentUser?.isLoggedIn) {
        await Promise.all([
          loadUserBookings ? loadUserBookings(currentUser) : Promise.resolve(),
          loadMyRequests ? loadMyRequests(currentUser) : Promise.resolve()
        ]);
      }
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setFetchError('Unable to load your service bookings. Please check your connection and try again.');
    }
  };

  useEffect(() => {
    loadBookingsData();
  }, [currentUser]);

  // Real-time automatic background polling synchronization (every 3s)
  useEffect(() => {
    if (!currentUser?.isLoggedIn) return;
    const pollInterval = setInterval(async () => {
      try {
        if (loadMyRequests) await loadMyRequests(currentUser, true);
        if (loadUserBookings) await loadUserBookings(currentUser, true);
      } catch (err) {}
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [currentUser, loadMyRequests, loadUserBookings]);

  // Real-time SSE streaming for active request updates
  const activeServiceRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['open', 'quoting', 'confirmed', 'accepted', 'on the way', 'en route', 'arrived', 'in progress', 'otp verified'].includes(
        (r.status || '').toLowerCase()
      )
    ) || null;
  }, [activeRequests]);

  const activeReqRef = activeServiceRequest?.requestRef;

  useEffect(() => {
    if (!activeReqRef) return;
    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/realtime/request/${activeReqRef}`);

      eventSource.addEventListener('quote.received', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(`Quotation Received: ${data.agentName || 'A technician'} offered ₹${data.amount}.`, 'brass');
          if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
        } catch (err) {}
      });

      eventSource.addEventListener('quote.accepted', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(`Technician Assigned: ${data.agentName} has confirmed your booking.`, 'brass');
          if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
        } catch (err) {}
      });

      eventSource.addEventListener('status.en_route', () => {
        addToast('Your technician is now On the way to your address.', 'brass');
        if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
      });

      eventSource.addEventListener('status.arrived', () => {
        addToast("Technician has arrived at your doorstep! Share the 4-digit Door OTP to start work.", 'brass');
        if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
      });

      eventSource.addEventListener('status.otp_verified', () => {
        addToast('Door OTP verified. Service is now In Progress.', 'brass');
        if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
      });

      eventSource.addEventListener('status.completed', () => {
        addToast('Service Completed! Please rate your technician.', 'brass');
        if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
      });

      eventSource.addEventListener('status.cancelled', () => {
        addToast('The service request has been cancelled.', 'destructive');
        if (currentUser && loadMyRequests) loadMyRequests(currentUser, true);
      });
    } catch (err) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [activeReqRef, currentUser, loadMyRequests]);

  // Exclusive Job-Lock: customer cannot book when active job is in progress
  const lockedJobRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['confirmed', 'accepted', 'on the way', 'en route', 'arrived', 'in progress', 'otp verified'].includes(
        (r.status || '').toLowerCase()
      )
    ) || null;
  }, [activeRequests]);

  const isCustomerLocked = Boolean(lockedJobRequest);

  // -------------------------------------------------------------------------
  // UNIFIED REQUESTS LIST: Deduplicated, One Request Renders Once
  // -------------------------------------------------------------------------
  const unifiedJobs = useMemo(() => {
    const list = [];
    const seenRefs = new Set();

    // 1. Process activeRequests (PostgreSQL service_requests)
    if (Array.isArray(activeRequests)) {
      activeRequests.forEach((req) => {
        const ref = req.requestRef || req.id;
        if (!ref || seenRefs.has(ref)) return;
        seenRefs.add(ref);

        const statusLower = (req.status || '').toLowerCase();
        let normalizedStatus = 'Open';
        if (statusLower === 'completed') normalizedStatus = 'Completed';
        else if (statusLower === 'cancelled') normalizedStatus = 'Cancelled';
        else if (['in progress', 'in_progress', 'otp verified'].includes(statusLower)) normalizedStatus = 'In progress';
        else if (statusLower === 'arrived') normalizedStatus = 'Arrived';
        else if (['on the way', 'en route', 'on_the_way'].includes(statusLower)) normalizedStatus = 'On the way';
        else if (['confirmed', 'accepted'].includes(statusLower)) normalizedStatus = 'Confirmed';
        else if (Array.isArray(req.quotes) && req.quotes.length > 0) normalizedStatus = 'Quoted';
        else normalizedStatus = 'Open';

        list.push({
          id: ref,
          requestRef: ref,
          serviceTitle: req.serviceTitle || (req.category === 'plumber' ? 'Taps, Mixers & Showers' : 'Fans & Fittings'),
          category: req.category || 'electrician',
          trade: req.category === 'plumber' ? 'Plumber' : 'Electrician',
          createdAt: req.createdAt,
          userAddress: req.userAddress || req.address,
          displayAddress: formatDisplayAddress(req.userAddress || req.address),
          subtitle: formatJobSubtitle(req.category, req.createdAt),
          problemDescription: req.problemDescription,
          issueType: req.issueType || req.issue_type || null,
          status: normalizedStatus,
          otpCode: req.otpCode,
          quotes: Array.isArray(req.quotes) ? req.quotes : (quotesByRef[ref] || []),
          acceptedProvider: req.acceptedProvider || null,
          totalAmount: req.paymentAmount || req.totalAmount || req.acceptedProvider?.amount || 0,
          paymentStatus: req.paymentStatus || (normalizedStatus === 'Completed' ? 'due' : null),
          paymentCode: req.paymentCode || null,
          paymentAmount: req.paymentAmount || req.totalAmount || req.acceptedProvider?.amount || 0,
          paymentCapturedAt: req.paymentCapturedAt || null,
          completionPhotos: req.completionPhotos || [],
          completionRemarks: req.completionRemarks || '',
          startedAt: req.startedAt,
          arrivedAt: req.arrivedAt,
          completedAt: req.completedAt,
          confirmed_at: req.confirmed_at || req.confirmedAt || (['Confirmed', 'On the way', 'Arrived', 'In progress', 'Completed'].includes(normalizedStatus) ? (req.createdAt || req.created_at) : null),
          on_the_way_at: req.on_the_way_at || req.onTheWayAt || null,
          arrived_at: req.arrived_at || req.arrivedAt || null,
          in_progress_at: req.in_progress_at || req.inProgressAt || req.started_at || req.startedAt || null,
          completed_at: req.completed_at || req.completedAt || null,
          isDelayed: req.isDelayed || false,
          isServiceRequest: true
        });
      });
    }

    // 2. Add local direct bookings if not already present
    if (Array.isArray(liveDbBookings)) {
      liveDbBookings.forEach((b) => {
        const ref = b.bookingId || b.bookingRef || b.id;
        if (!ref || seenRefs.has(ref)) return;
        seenRefs.add(ref);

        const statusLower = (b.status || '').toLowerCase().trim();
        let normalizedStatus = 'Open';
        if (statusLower === 'completed') normalizedStatus = 'Completed';
        else if (statusLower === 'cancelled') normalizedStatus = 'Cancelled';
        else if (['in progress', 'in_progress', 'otp verified'].includes(statusLower)) normalizedStatus = 'In progress';
        else if (statusLower === 'arrived') normalizedStatus = 'Arrived';
        else if (['on the way', 'en route', 'on_the_way'].includes(statusLower)) normalizedStatus = 'On the way';
        else if (['confirmed', 'accepted'].includes(statusLower)) normalizedStatus = 'Confirmed';
        else if (statusLower === 'quoted') normalizedStatus = 'Quoted';
        else normalizedStatus = 'Open';

        list.push({
          id: ref,
          requestRef: ref,
          serviceTitle: b.serviceTitle || 'Home Service Repair',
          category: b.category || 'electrician',
          trade: b.category === 'plumber' ? 'Plumber' : 'Electrician',
          createdAt: b.createdAt,
          userAddress: b.address,
          displayAddress: formatDisplayAddress(b.address),
          subtitle: formatJobSubtitle(b.category, b.createdAt),
          problemDescription: b.problemDescription || b.issueType,
          issueType: b.issueType || null,
          status: normalizedStatus,
          otpCode: b.otpCode,
          quotes: [],
          acceptedProvider: b.technicianName
            ? {
                agentName: b.technicianName,
                agentTrade: b.technicianRole || (b.category === 'plumber' ? 'Plumber' : 'Electrician'),
                agentRating: b.technicianRating || '4.9',
                agentCompletedJobs: b.technicianJobs || 120,
                amount: b.totalAmount
              }
            : null,
          totalAmount: b.totalAmount || 0,
          paymentStatus: b.paymentStatus || (normalizedStatus === 'Completed' ? 'due' : null),
          paymentCode: b.paymentCode || null,
          paymentAmount: b.paymentAmount || b.totalAmount || 0,
          paymentCapturedAt: b.paymentCapturedAt || null,
          confirmed_at: b.confirmed_at || b.confirmedAt || (['Confirmed', 'On the way', 'Arrived', 'In progress', 'Completed'].includes(normalizedStatus) ? (b.createdAt || b.created_at) : null),
          on_the_way_at: b.on_the_way_at || b.onTheWayAt || null,
          arrived_at: b.arrived_at || b.arrivedAt || null,
          in_progress_at: b.in_progress_at || b.inProgressAt || null,
          completed_at: b.completed_at || b.completedAt || null,
          completionPhotos: [],
          completionRemarks: '',
          isServiceRequest: false
        });
      });
    }

    return list;
  }, [activeRequests, liveDbBookings, quotesByRef]);

  // Tab counts
  const activeCount = useMemo(() => {
    return unifiedJobs.filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled').length;
  }, [unifiedJobs]);

  const completedCount = useMemo(() => {
    return unifiedJobs.filter((j) => j.status === 'Completed').length;
  }, [unifiedJobs]);

  const allCount = unifiedJobs.length;

  // Filtered jobs partitioned by active/completed/all and search query
  const filteredJobs = useMemo(() => {
    return unifiedJobs.filter((job) => {
      const isCompleted = job.status === 'Completed';
      const isCancelled = job.status === 'Cancelled';
      const isActive = !isCompleted && !isCancelled;

      if (activeTab === 'active' && !isActive) return false;
      if (activeTab === 'completed' && !isCompleted) return false;

      if (debouncedSearch) {
        const matchesTitle = (job.serviceTitle || '').toLowerCase().includes(debouncedSearch);
        const matchesPro = (job.acceptedProvider?.agentName || '').toLowerCase().includes(debouncedSearch);
        const matchesTrade = (job.trade || '').toLowerCase().includes(debouncedSearch);
        if (!matchesTitle && !matchesPro && !matchesTrade) return false;
      }

      return true;
    });
  }, [unifiedJobs, activeTab, debouncedSearch]);

  // Initial tab resolution on page load / entry:
  // When there are no active bookings, automatically start on 'all'; otherwise start on 'active'.
  useEffect(() => {
    if (isLoading) return;
    if (!hasInitializedTabRef.current) {
      hasInitializedTabRef.current = true;
      if (activeCount === 0) {
        setActiveTab('all');
      } else {
        setActiveTab('active');
      }
    }
  }, [isLoading, activeCount]);

  // When user explicitly clicks "My Bookings" in navbar or header navigation:
  useEffect(() => {
    if (bookingsNavNonce > 0) {
      if (activeCount === 0) {
        setActiveTab('all');
      } else {
        setActiveTab('active');
      }
    }
  }, [bookingsNavNonce, activeCount]);

  // Automatically prompt Pay Sheet if an active request just completed and is unpaid;
  // If paid and unrated, prompt full-screen rating.
  useEffect(() => {
    const unpaidCompleted = unifiedJobs.find(
      (j) => j.status === 'Completed' && j.paymentStatus !== 'paid' && !sessionStorage.getItem(`pay_dismissed_${j.id}`)
    );
    if (unpaidCompleted && !payModalBooking) {
      setPayModalBooking(unpaidCompleted);
      return;
    }

    const unratedCompleted = unifiedJobs.find(
      (j) => j.status === 'Completed' && j.paymentStatus === 'paid' && j.isServiceRequest && !j.ratingGiven && !sessionStorage.getItem(`rated_dismissed_${j.id}`)
    );
    if (unratedCompleted && !rateModalBooking && !payModalBooking) {
      setRateModalBooking(unratedCompleted);
    }
  }, [unifiedJobs, rateModalBooking, payModalBooking]);

  // Quotes sorting helper
  const getSortedQuotes = (quotes, reqRef) => {
    if (!Array.isArray(quotes)) return [];
    const sortBy = quotesSortMap[reqRef] || 'lowest';
    const list = [...quotes];
    if (sortBy === 'lowest') {
      return list.sort((a, b) => parseFloat(a.amount || 0) - parseFloat(b.amount || 0));
    }
    if (sortBy === 'best') {
      return list.sort((a, b) => {
        const rA = parseFloat(a.agentRating || 0);
        const rB = parseFloat(b.agentRating || 0);
        if (rB !== rA) return rB - rA;
        return (b.agentCompletedJobs || 0) - (a.agentCompletedJobs || 0);
      });
    }
    if (sortBy === 'fastest') {
      return list.sort((a, b) => (a.etaMinutes || 99) - (b.etaMinutes || 99));
    }
    return list;
  };

  // Horizontal scroll arrow navigation
  const handleScrollQuotes = (reqRef, direction) => {
    const el = scrollTrackRefs.current[reqRef];
    if (el) {
      el.scrollBy({ left: direction * 260, behavior: 'smooth' });
    }
  };

  // Quote acceptance execution
  const handleExecuteAcceptQuote = async () => {
    if (!pendingAcceptQuote) return;
    const { quote, job } = pendingAcceptQuote;
    setIsAcceptingQuote(true);
    try {
      const res = await acceptQuote(quote.quoteId);
      if (res && res.success) {
        addToast(`Quote accepted! ${quote.agentName} has been assigned.`, 'brass');
        setPendingAcceptQuote(null);
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Failed to accept quote. Please try again.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to accept quote.', 'destructive');
    } finally {
      setIsAcceptingQuote(false);
    }
  };

  // Cancel request execution
  const handleConfirmCancelRequest = async (job) => {
    if (!job) return;
    try {
      const res = await cancelRequest(job.requestRef, 'Customer cancelled');
      if (res && res.success) {
        addToast('Service request has been cancelled.', 'destructive');
        setCancelModalBooking(null);
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Could not cancel request.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to cancel request.', 'destructive');
    }
  };

  const handleCancelAndRebroadcast = async (requestRef) => {
    try {
      const res = await cancelAndRebroadcast(requestRef);
      if (res && res.success) {
        addToast('Professional reassignment started. Re-broadcasting to nearby verified technicians.', 'brass');
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Could not re-broadcast request.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to re-broadcast request.', 'destructive');
    }
  };

  // Submit rating execution
  const handleExecuteRating = async (job, { rating, feedback }) => {
    try {
      const res = await rateCompletedJob(job.requestRef, rating, feedback);
      if (res && res.success) {
        addToast('Thank you! Your verified rating has been submitted.', 'brass');
        setRateModalBooking(null);
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Failed to submit rating.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to submit rating.', 'destructive');
    }
  };

  // Dismiss rate modal with Rate later
  const handleRateLater = (job) => {
    if (job) {
      sessionStorage.setItem(`rated_dismissed_${job.id}`, 'true');
    }
    setRateModalBooking(null);
  };

  return (
    <div className="my-bookings-page-wrapper" role="main">
      <div className="bookings-layout-container">
        {/* Page Header */}
        <header className="bookings-page-header">
          <div className="bookings-header-text">
            <h1 className="bookings-main-title">My Bookings</h1>
            <p className="bookings-subhead">Every job, tracked from request to completion.</p>
          </div>

          <div className="bookings-header-cta">
            <button
              type="button"
              className={`btn-book-certified-pro ${isCustomerLocked ? 'disabled-busy-pro' : ''}`}
              onClick={() => {
                if (isCustomerLocked) {
                  addToast('Active Job in Progress: Please complete your ongoing service before creating a new booking.', 'destructive');
                  return;
                }
                if (onNavigateToServices) onNavigateToServices('all');
              }}
              disabled={isCustomerLocked}
              title={isCustomerLocked ? 'Complete ongoing service before creating a new booking' : 'Book a Service'}
              style={isCustomerLocked ? { opacity: 0.65, cursor: 'not-allowed' } : {}}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>{isCustomerLocked ? 'Active Job in Progress' : 'Book a Service'}</span>
            </button>
          </div>
        </header>

        {/* Control Bar: Unified Tabs & Search with non-clipping placeholder */}
        <div className="bookings-control-bar">
          <div className="bookings-filter-row">
            <div className="filter-controls-left">
              <div className="segmented-tab-switcher" role="tablist" aria-label="Booking status tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'active'}
                  className={`segmented-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveTab('active')}
                >
                  <span>Active</span>
                  <span className="tab-count-badge active-badge">{activeCount}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'completed'}
                  className={`segmented-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                  onClick={() => setActiveTab('completed')}
                >
                  <span>Completed</span>
                  <span className="tab-count-badge completed-badge">{completedCount}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'all'}
                  className={`segmented-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  <span>All</span>
                  <span className="tab-count-badge all-badge">{allCount}</span>
                </button>
              </div>
            </div>

            {/* Search Input: Placeholder strictly "Search by service or professional" */}
            <div className="bookings-search-input-wrap">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="search-icon-svg">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by service or professional"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bookings-search-input"
                aria-label="Search by service or professional"
              />
              {searchInput && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search query"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Unified Bookings Feed Section (No Section Headings) */}
        <section className="bookings-feed-section" aria-live="polite">
          {isLoading && (!activeRequests || activeRequests.length === 0) && (!liveDbBookings || liveDbBookings.length === 0) ? (
            <div className="bookings-card-grid" aria-label="Loading your bookings">
              {[1, 2].map((idx) => (
                <div key={idx} className="booking-skeleton-card">
                  <div className="skeleton-line skeleton-header-line" />
                  <div className="skeleton-bar skeleton-progress-bar" />
                  <div className="skeleton-line skeleton-footer-line" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bookings-error-card">
              <div className="error-icon-circle" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="error-headline">Unable to load bookings</h2>
              <p className="error-sub">{fetchError}</p>
              <button type="button" className="btn-retry-fetch" onClick={loadBookingsData}>
                <span>Retry</span>
              </button>
            </div>
          ) : filteredJobs.length === 0 ? (
            (() => {
              const isSearchNoMatch = Boolean(debouncedSearch);
              let emptyTitle = 'No active bookings';
              let emptySubtext = 'Book a service and track it here from request to completion.';
              let showButton = true;

              if (isSearchNoMatch) {
                emptyTitle = 'No results';
                emptySubtext = 'Try a different service or professional name.';
                showButton = false;
              } else if (activeTab === 'completed') {
                emptyTitle = 'No completed jobs yet';
                emptySubtext = 'Finished jobs and your ratings will appear here.';
                showButton = false;
              } else if (activeTab === 'all') {
                emptyTitle = 'No bookings yet';
                emptySubtext = 'Your service history will appear here.';
                showButton = true;
              }

              return (
                <div className="bookings-empty-state-card">
                  <div className="empty-state-circle-icon" aria-hidden="true">
                    {isSearchNoMatch ? (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    )}
                  </div>
                  <h2 className="empty-state-title">{emptyTitle}</h2>
                  <p className={`empty-state-desc ${!showButton ? 'no-button' : ''}`}>{emptySubtext}</p>
                  {showButton && (
                    <Button
                      variant="outline"
                      className="btn-empty-book-now"
                      onClick={() => onNavigateToServices && onNavigateToServices('all')}
                    >
                      Book a Service
                    </Button>
                  )}
                </div>
              );
            })()
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {filteredJobs.map((job) => {
                const isOpen = job.status === 'Open';
                const isQuoted = job.status === 'Quoted';
                const isConfirmed = job.status === 'Confirmed';
                const isOnTheWay = job.status === 'On the way';
                const isArrived = job.status === 'Arrived';
                const isInProgress = job.status === 'In progress';
                const isCompleted = job.status === 'Completed';
                const isCancelled = job.status === 'Cancelled';

                const sortedQuotes = getSortedQuotes(job.quotes, job.id);
                const currentSort = quotesSortMap[job.id] || 'lowest';
                const displayTitle = getJobDisplayTitle(job);
                const hasDetails = hasCustomDetails(job.problemDescription, displayTitle);
                const isTrackerVisible = !isOpen && !isQuoted && !isCancelled;
                const isExpanded = isCardExpanded(job);

                return (
                  <div
                    key={job.id}
                    className="booking-item-card"
                    style={{
                      padding: isExpanded ? '1.5rem' : '1.15rem 1.5rem'
                    }}
                  >
                    {/* 1. CARD HEADER (Clickable to minimize/expand details) */}
                    <div
                      className="card-top-header clickable-header"
                      style={{ marginBottom: isExpanded ? '0.85rem' : 0 }}
                      onClick={() => toggleCardExpanded(job.id, job.status)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Minimize' : 'Expand'} details for ${displayTitle}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleCardExpanded(job.id, job.status);
                        }
                      }}
                    >
                      <div className="card-service-meta">
                        <div className="service-icon-badge" aria-hidden="true">
                          {job.category === 'plumber' ? (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                          )}
                        </div>

                        <div className="service-title-col">
                          <h2 className="service-main-heading">{displayTitle}</h2>
                          <div className="service-sub-meta">
                            <span>{job.subtitle}</span>
                            <span className="meta-bullet">•</span>
                            <span className="locality-text">{job.displayAddress}</span>
                          </div>
                        </div>
                      </div>

                      {/* Header right: Calm status or job price + chevron */}
                      <div className="card-status-container" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isCompleted && (
                          job.paymentStatus === 'paid' ? (
                            <span className="live-status-pill forest-pill" style={{ background: '#ecfdf5', color: '#065f46' }}>
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="live-status-pill" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                              <span>Payment Due</span>
                            </span>
                          )
                        )}
                        {isCancelled && (
                          <span className="live-status-pill" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            <span>Cancelled</span>
                          </span>
                        )}
                        <span
                          className="card-expand-toggle-btn"
                          aria-hidden="true"
                          title={isExpanded ? 'Minimize details' : 'Click to view details'}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Expandable Details Body */}
                    {isExpanded && (
                      <div className="card-expanded-body">
                        {/* Details Box: Rendered ONLY if customer wrote custom text */}
                        {hasDetails && (
                          <div className="card-details-box">
                            <span className="card-details-label">Details:</span>
                            <span>{job.problemDescription}</span>
                          </div>
                        )}

                    {/* 2. QUOTES SECTION (When Open or Quoted) */}
                    {(isOpen || isQuoted) && (
                      <div className="quotes-section-container">
                        {sortedQuotes.length === 0 ? (
                          <>
                            <div className="quotes-calm-status">
                              <span className="quotes-pulse-dot" />
                              <span>Searching for nearby verified technicians... Quotes will appear automatically.</span>
                            </div>
                            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="quiet-cancel-btn"
                                onClick={() => setCancelModalBooking(job)}
                              >
                                Cancel request
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="quotes-section-header">
                              <span className="quotes-count-label">
                                {sortedQuotes.length} Quote{sortedQuotes.length > 1 ? 's' : ''} Received
                              </span>
                              <div className="quotes-sort-pills">
                                <button
                                  type="button"
                                  className={`quotes-sort-btn ${currentSort === 'lowest' ? 'active' : ''}`}
                                  onClick={() => setQuotesSortMap((prev) => ({ ...prev, [job.id]: 'lowest' }))}
                                >
                                  Lowest price
                                </button>
                                <button
                                  type="button"
                                  className={`quotes-sort-btn ${currentSort === 'best' ? 'active' : ''}`}
                                  onClick={() => setQuotesSortMap((prev) => ({ ...prev, [job.id]: 'best' }))}
                                >
                                  Best rated
                                </button>
                                <button
                                  type="button"
                                  className={`quotes-sort-btn ${currentSort === 'fastest' ? 'active' : ''}`}
                                  onClick={() => setQuotesSortMap((prev) => ({ ...prev, [job.id]: 'fastest' }))}
                                >
                                  Fastest
                                </button>
                              </div>
                            </div>

                            {/* Always-visible horizontal row with scroll snap & desktop navigation arrows */}
                            <div className="quotes-carousel-wrapper">
                              {sortedQuotes.length > 2 && (
                                <button
                                  type="button"
                                  className="quotes-scroll-arrow"
                                  onClick={() => handleScrollQuotes(job.id, -1)}
                                  aria-label="Scroll quotes left"
                                >
                                  ‹
                                </button>
                              )}

                              <div
                                className="quotes-scroll-track"
                                ref={(el) => {
                                  scrollTrackRefs.current[job.id] = el;
                                }}
                              >
                                {sortedQuotes.map((q) => {
                                  const ratingNum = parseFloat(q.agentRating || 0);
                                  const rawTrade = q.agentTrade || job.trade || 'Plumber';
                                  const formattedTrade = rawTrade.charAt(0).toUpperCase() + rawTrade.slice(1);
                                  const hasRating = ratingNum > 0;

                                  return (
                                    <div key={q.quoteId} className="horizontal-quote-card">
                                      <div>
                                        <div className="quote-pro-header">
                                          <div className="quote-pro-name">{formatName(q.agentName)}</div>
                                          <div className="quote-pro-sub">
                                            <span>{formattedTrade}</span>
                                            {hasRating && (
                                              <>
                                                <span>•</span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="#d97706" stroke="#d97706" strokeWidth="1" aria-hidden="true">
                                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                  </svg>
                                                  <span>{ratingNum.toFixed(1)}</span>
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        <div className="quote-pricing-row">
                                          <span className="quote-price-tag">₹{q.amount}</span>
                                          <span className="quote-eta-tag">~{q.etaMinutes || 25} mins arrival</span>
                                        </div>

                                        {q.providerNote && (
                                          <div className="quote-note-box">
                                            "{q.providerNote}"
                                          </div>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        className="quote-accept-cta"
                                        onClick={() => setPendingAcceptQuote({ quote: q, job })}
                                      >
                                        Accept
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {sortedQuotes.length > 2 && (
                                <button
                                  type="button"
                                  className="quotes-scroll-arrow"
                                  onClick={() => handleScrollQuotes(job.id, 1)}
                                  aria-label="Scroll quotes right"
                                >
                                  ›
                                </button>
                              )}
                            </div>

                            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="quiet-cancel-btn"
                                onClick={() => setCancelModalBooking(job)}
                              >
                                Cancel request
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* 3. PROGRESS TRACKER (When Confirmed, On the way, Arrived, In progress, Completed) */}
                    {isTrackerVisible && <BookingProgressTracker job={job} />}

                    {/* 4. PRO DETAILS CARD (After Acceptance) */}
                    {isTrackerVisible && job.acceptedProvider && (
                      <div className="assigned-pro-strip">
                        <div className="assigned-pro-left">
                          <div className="assigned-pro-name">{formatName(job.acceptedProvider.agentName)}</div>
                          <div className="assigned-pro-meta">
                            <span>
                              {(() => {
                                const t = job.acceptedProvider.agentTrade || job.trade || 'Plumber';
                                return t.charAt(0).toUpperCase() + t.slice(1);
                              })()}
                            </span>
                            {parseFloat(job.acceptedProvider.agentRating || 0) > 0 && (
                              <>
                                <span> • </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="#d97706" stroke="#d97706" strokeWidth="1" aria-hidden="true">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                  <span>{parseFloat(job.acceptedProvider.agentRating).toFixed(1)}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="assigned-pro-price">
                          <div className="assigned-price-label">Quoted price</div>
                          <div className="assigned-price-value">₹{job.acceptedProvider.amount || job.totalAmount || 0}</div>
                        </div>
                      </div>
                    )}

                    {/* 5. LIVE TRACKING MAP CARD & ETA (When Confirmed, On the way, or Arrived) */}
                    {(isConfirmed || isOnTheWay || isArrived) && (
                      <div className="on-the-way-map-card">
                        <div className="on-the-way-status-col">
                          <div className="on-the-way-title">
                            {isOnTheWay
                              ? 'Technician is On the way'
                              : isArrived
                              ? 'Technician has Arrived'
                              : 'Technician Assigned & Confirmed'}
                          </div>
                          <div className="on-the-way-sub">
                            {isArrived
                              ? 'At your doorstep · Share 4-digit verification code'
                              : `Live GPS tracking active · ETA ~${job.acceptedProvider?.etaMinutes || (isConfirmed ? 25 : 15)} mins`}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-book-certified-pro"
                          style={{ padding: '0.45rem 0.95rem', fontSize: '0.8rem' }}
                          onClick={() => setLiveTrackBooking(job)}
                        >
                          Track Live Map
                        </button>
                      </div>
                    )}

                    {/* 6. ARRIVED STATE: Doorstep OTP Card (Shown ONLY NOW) */}
                    {isArrived && job.otpCode && (
                      <div className="doorstep-otp-card">
                        <div>
                          <div className="doorstep-otp-heading">Doorstep Verification Code</div>
                          <div className="doorstep-otp-desc">
                            Share this 4-digit code with {formatName(job.acceptedProvider?.agentName) || 'technician'} to begin service.
                          </div>
                        </div>
                        <div className="doorstep-otp-digits">{job.otpCode}</div>
                      </div>
                    )}

                    {/* 7. IN PROGRESS STATE */}
                    {isInProgress && (
                      <div className="in-progress-banner">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        <span>Door OTP verified. Service is in progress.</span>
                      </div>
                    )}

                    {/* 8. COMPLETED STATE: Proof & Rating */}
                    {isCompleted && (
                      <>
                        {((job.completionPhotos && job.completionPhotos.length > 0) || job.completionRemarks) && (
                          <div className="completed-proof-banner">
                            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                              Completed Work Proof
                            </div>
                            {job.completionPhotos && job.completionPhotos.length > 0 && (
                              <div className="proof-thumbnails-row">
                                {job.completionPhotos.map((imgUrl, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="proof-thumbnail-btn"
                                    onClick={() => setPreviewPhoto(imgUrl)}
                                    title="Click to view full photo"
                                    aria-label={`View full proof photo ${i + 1}`}
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`Proof ${i + 1}`}
                                      className="proof-thumbnail-img"
                                    />
                                    <span className="proof-thumbnail-zoom-icon" aria-hidden="true">
                                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="7" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                        <line x1="11" y1="8" x2="11" y2="14" />
                                        <line x1="8" y1="11" x2="14" y2="11" />
                                      </svg>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {job.completionRemarks && (
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary, #111827)', fontStyle: 'italic', marginTop: job.completionPhotos?.length > 0 ? '0.5rem' : 0 }}>
                                "{job.completionRemarks}"
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                          {job.paymentStatus === 'paid' ? (
                            <>
                              <button
                                type="button"
                                className="receipt-btn-print"
                                style={{ height: '34px', fontSize: '0.8rem', padding: '0 12px' }}
                                onClick={() => setReceiptModalData({
                                  ...job,
                                  amount: job.paymentAmount || job.amount || (job.quotes?.[0]?.amount) || 150,
                                  payment_code: job.paymentCode || `PAY-${job.id || '2026000001'}`,
                                  paymentCode: job.paymentCode || `PAY-${job.id || '2026000001'}`,
                                  captured_at: job.paymentCapturedAt || job.completedAt || new Date().toISOString(),
                                  method: job.paymentMethod || 'UPI / Online',
                                  partnerId: job.proPartnerId || job.partnerId || '202600001',
                                  proPartnerId: job.proPartnerId || job.partnerId || '202600001',
                                  proName: job.acceptedProvider?.agentName || job.assigned_pro_name || 'Rahul'
                                })}
                              >
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="6 9 6 2 18 2 18 9" />
                                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                  <rect x="6" y="14" width="12" height="8" />
                                </svg>
                                <span>Receipt</span>
                              </button>
                              {!job.ratingGiven && (
                                <button
                                  type="button"
                                  className="btn-book-certified-pro"
                                  style={{ padding: '0.5rem 1.15rem', fontSize: '0.82rem' }}
                                  onClick={() => setRateModalBooking(job)}
                                >
                                  Rate this job
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-book-certified-pro"
                              style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', background: '#047857' }}
                              onClick={() => setPayModalBooking(job)}
                            >
                              Pay ₹{Number(job.paymentAmount || job.totalAmount || 0).toLocaleString('en-IN')}
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Cancellation option before In progress */}
                    {(isConfirmed || isOnTheWay || isArrived) && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="quiet-cancel-btn"
                          onClick={() => setCancelModalBooking(job)}
                        >
                          Cancel request
                        </button>
                      </div>
                    )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Floating 10-Second Toast Alerts Queue */}
      <BookingToast toasts={toasts} onDismiss={dismissToast} />

      {/* Accept Quote Confirmation Dialog */}
      {pendingAcceptQuote && (
        <div className="uber-lang-modal-backdrop open" onClick={() => !isAcceptingQuote && setPendingAcceptQuote(null)}>
          <div className="booking-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary, #111827)' }}>
              Accept Quote from {formatName(pendingAcceptQuote.quote.agentName)}?
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #6b7280)', margin: '0 0 1.25rem', lineHeight: 1.45 }}>
              Agreed price: <strong style={{ color: '#059669' }}>₹{pendingAcceptQuote.quote.amount}</strong>. Other quotes will be withdrawn and technician will be notified.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary-neutral"
                onClick={() => setPendingAcceptQuote(null)}
                disabled={isAcceptingQuote}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary-confirm"
                onClick={handleExecuteAcceptQuote}
                disabled={isAcceptingQuote}
              >
                {isAcceptingQuote ? 'Accepting...' : 'Confirm & Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Request Confirmation Dialog */}
      {cancelModalBooking && (
        <div className="uber-lang-modal-backdrop open" onClick={() => setCancelModalBooking(null)}>
          <div className="booking-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary, #111827)' }}>
              Cancel Request?
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #6b7280)', margin: '0 0 1.25rem', lineHeight: 1.45 }}>
              Are you sure you want to cancel this service request? Any pending quotes will be withdrawn.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => setCancelModalBooking(null)}
              >
                Keep Request
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmCancelRequest(cancelModalBooking)}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live Track Modal */}
      <BookingTrackLiveModal
        isOpen={Boolean(liveTrackBooking)}
        onClose={() => setLiveTrackBooking(null)}
        booking={liveTrackBooking}
        onContactPro={(b) => setContactProBooking(b)}
      />

      {/* Contact Pro Modal */}
      <BookingContactProModal
        isOpen={Boolean(contactProBooking)}
        onClose={() => setContactProBooking(null)}
        booking={contactProBooking}
        onToast={(msg) => addToast(msg, 'info')}
      />

      {/* Full-Screen Customer Rating Prompt */}
      <BookingRateModal
        isOpen={Boolean(rateModalBooking)}
        onClose={() => handleRateLater(rateModalBooking)}
        booking={rateModalBooking}
        onSubmitRating={handleExecuteRating}
      />

      {/* Work Proof Full-Screen / Lightbox Modal */}
      {previewPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Work proof photo preview"
          className="proof-lightbox-backdrop"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="proof-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="proof-lightbox-close-btn"
              onClick={() => setPreviewPhoto(null)}
              aria-label="Close full preview"
              title="Close full preview"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <img
              src={previewPhoto}
              alt="Completed work proof preview"
              className="proof-lightbox-img"
              onClick={() => setPreviewPhoto(null)}
              title="Click image to minimize"
            />
            <div className="proof-lightbox-hint">
              Click anywhere or press Esc to minimize
            </div>
          </div>
        </div>
      )}
      {/* Customer Glass Pay Sheet */}
      <CustomerPaymentModal
        isOpen={Boolean(payModalBooking)}
        onClose={() => {
          if (payModalBooking?.id) {
            sessionStorage.setItem(`pay_dismissed_${payModalBooking.id}`, 'true');
          }
          setPayModalBooking(null);
        }}
        booking={payModalBooking}
        onPaymentSuccess={(verifyResult) => {
          const completedJob = payModalBooking;
          setPayModalBooking(null);
          // Auto-transition to rating prompt
          if (completedJob) {
            setRateModalBooking(completedJob);
          }
          addToast('Payment captured successfully. Technician payout initiated.', 'brass');
          if (loadMyRequests && currentUser) {
            loadMyRequests(currentUser);
          }
        }}
        onOpenReceipt={(payment) => {
          setReceiptModalData(payment);
        }}
      />

      {/* Printable Receipt Modal */}
      <PaymentReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        payment={receiptModalData}
        booking={receiptModalData}
      />

      {/* Unpaid Completed Booking Alert */}
      <UnpaidCompletedJobModal
        isOpen={Boolean(unpaidAlertJob)}
        onClose={() => setUnpaidAlertJob(null)}
        unpaidJob={unpaidAlertJob}
        onPayNow={(job) => {
          setUnpaidAlertJob(null);
          setPayModalBooking(job);
        }}
      />
    </div>
  );
}
