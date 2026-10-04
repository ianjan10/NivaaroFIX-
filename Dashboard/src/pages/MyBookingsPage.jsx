import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBooking } from '../context/BookingContext';
import { useLanguage } from '../context/LanguageContext';
import { CANONICAL_BOOKINGS } from '../data/bookingsData';
import { computeWarrantyInfo, getStageIndex } from '../utils/bookingUtils';
import BookingTrackLiveModal from '../components/BookingTrackLiveModal';
import BookingContactProModal from '../components/BookingContactProModal';
import BookingCancelConfirmModal from '../components/BookingCancelConfirmModal';
import BookingInvoiceModal from '../components/BookingInvoiceModal';
import BookingRescheduleModal from '../components/BookingRescheduleModal';
import BookingRateModal from '../components/BookingRateModal';
import BookingToast from '../components/BookingToast';

export default function MyBookingsPage({
  currentUser,
  onNavigateToHome,
  onNavigateToServices,
  onOpenAuth
}) {
  const {
    activeBookings: liveDbBookings,
    loadUserBookings,
    openBookingFor,
    activeRequests,
    loadMyRequests,
    acceptQuote,
    cancelRequest,
    cancelAndRebroadcast,
    rateCompletedJob
  } = useBooking();
  const { t } = useLanguage();

  // Active tab state: 'active' | 'completed' | 'all'
  const [activeTab, setActiveTab] = useState('active');

  // Category filter state: 'all' | (dynamic categories present in bookings)
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Search input & debounced search query
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Loading & error states
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Expanded card tracking (set of booking IDs)
  const [expandedCards, setExpandedCards] = useState(() => new Set());

  // Modals state
  const [liveTrackBooking, setLiveTrackBooking] = useState(null);
  const [contactProBooking, setContactProBooking] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [invoiceModalBooking, setInvoiceModalBooking] = useState(null);
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [rateModalBooking, setRateModalBooking] = useState(null);

  // Marketplace Request & Quote states
  const [expandedQuotesReqRef, setExpandedQuotesReqRef] = useState(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState(null);
  const [ratingReqRef, setRatingReqRef] = useState(null);
  const [serviceRating, setServiceRating] = useState(5);
  const [serviceFeedback, setServiceFeedback] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [quotesByRef, setQuotesByRef] = useState({});

  // Local state for interactive mutations (reschedule, cancel, rate)
  const [localBookings, setLocalBookings] = useState([]);

  // Toast notification queue
  // Toast notification queue (10-second auto-dismiss per requirements)
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 10000); // Exactly 10 seconds
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Identify if customer currently has an active engaged service request
  const activeServiceRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['open', 'broadcasting', 'quoting', 'accepted', 'en route', 'otp verified', 'in progress'].includes((r.status || '').toLowerCase())
    ) || null;
  }, [activeRequests]);

  const hasActiveRequest = Boolean(activeServiceRequest);

  // Exclusive Job-Lock: customer cannot book when having an active job in Accepted or InProgress state
  const lockedJobRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['accepted', 'en route', 'otp verified', 'in progress'].includes((r.status || '').toLowerCase())
    ) || null;
  }, [activeRequests]);

  const isCustomerLocked = Boolean(lockedJobRequest);

  // Debounce search input (~250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Initial load & database fetch
  const loadBookingsData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      if (currentUser?.isLoggedIn) {
        await Promise.all([
          loadUserBookings(currentUser),
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

  // Real-time automatic background synchronization (every 3s without manual refresh)
  useEffect(() => {
    if (!currentUser?.isLoggedIn) return;

    const pollInterval = setInterval(async () => {
      try {
        if (loadMyRequests) {
          await loadMyRequests(currentUser);
        }
        if (loadUserBookings) {
          await loadUserBookings(currentUser);
        }
      } catch (err) {
        // Silent background sync
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [currentUser, loadMyRequests, loadUserBookings]);

  // Real-time SSE streaming for active request updates
  const activeReqRef = activeServiceRequest?.requestRef;
  const activeReqStatus = activeServiceRequest?.status;

  useEffect(() => {
    if (!activeReqRef) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`http://localhost:5000/api/realtime/request/${activeReqRef}`);

      eventSource.addEventListener('quote.received', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(
            `Quotation Received: ${data.agentName || 'A certified pro'} offered ₹${data.amount} for "${data.serviceTitle || 'your request'}".`,
            'brass'
          );
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
          fetch(`http://localhost:5000/api/dispatch/request/${activeReqRef}/quotes`)
            .then(res => res.json())
            .then(resData => {
              if (resData.success && Array.isArray(resData.quotes)) {
                setQuotesByRef(prev => ({ ...prev, [activeReqRef]: resData.quotes }));
              }
            })
            .catch(() => {});
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      });

      eventSource.addEventListener('quote.accepted', (e) => {
        try {
          const data = JSON.parse(e.data);
          addToast(`Professional Assigned: ${data.agentName} has been assigned to your service.`, 'brass');
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('status.en_route', (e) => {
        try {
          addToast('Status Update: Your technician is now EN ROUTE to your address!', 'brass');
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('status.otp_verified', (e) => {
        try {
          addToast('Security Verified: Door OTP verified. Service is now IN PROGRESS.', 'brass');
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('status.completed', (e) => {
        try {
          addToast('Service Completed: Your repair has been completed successfully! Please leave a review.', 'brass');
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('status.cancelled', (e) => {
        try {
          addToast(`Service request ${activeReqRef} has been cancelled.`, 'destructive');
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        } catch (err) {}
      });
    } catch (err) {
      console.warn('Realtime SSE setup notice:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [activeReqRef, currentUser, loadMyRequests]);

  // Map PostgreSQL database bookings into local state
  useEffect(() => {
    if (Array.isArray(liveDbBookings) && liveDbBookings.length > 0) {
      const mappedDb = liveDbBookings.map((b) => {
        const isCompleted = (b.status || '').toLowerCase() === 'completed';
        const isCancelled = (b.status || '').toLowerCase() === 'cancelled';
        return {
          id: b.bookingId || b.bookingRef,
          bookingId: b.bookingId || b.bookingRef,
          bookingRef: b.bookingId || b.bookingRef,
          serviceTitle: b.serviceTitle || 'Home Service Repair',
          category: b.category || 'electrician',
          issueType: b.issueType || b.problemDescription || 'Standard Inspection & Repair',
          locality: b.address ? b.address.split(',')[0] : 'Bengaluru',
          address: b.address || 'Address on file',
          scheduledTime: b.scheduledTime || 'Scheduled Express',
          date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent',
          completedAt: isCompleted ? (b.updatedAt || b.createdAt) : null,
          status: isCancelled ? 'Cancelled' : (isCompleted ? 'Completed' : (b.status || 'Request Received')),
          stageIndex: isCancelled ? 0 : getStageIndex(b.status),
          etaMinutes: b.etaMinutes || 25,
          totalAmount: parseFloat(b.totalAmount || 350),
          isEstimate: !isCompleted,
          partsAmount: b.partsAmount || 0,
          otpCode: b.otpCode || '4321',
          technicianName: b.technicianName || 'Technician Assigned',
          technicianRole: b.category === 'plumber' ? 'Certified Master Plumber' : 'Master Electrician',
          technicianRating: '4.9',
          technicianJobs: 312,
          technicianPhone: b.technicianPhone || '+91 98401 23456',
          paymentMethod: 'UPI / Instant Verified',
          ratingGiven: null,
          breakdown: {
            inspectionFee: Math.round(parseFloat(b.totalAmount || 350) * 0.82),
            laborFee: Math.round(parseFloat(b.totalAmount || 350) * 0.82),
            partsEstimate: 0,
            parts: 0,
            gst: Math.round(parseFloat(b.totalAmount || 350) * 0.18),
            total: parseFloat(b.totalAmount || 350)
          },
          createdAt: b.createdAt
        };
      });

      setLocalBookings(mappedDb);
    } else {
      setLocalBookings([]);
    }
  }, [liveDbBookings]);

  // Compute dynamic category filter chips based on services present in user's bookings
  const availableCategories = useMemo(() => {
    const cats = new Set();
    localBookings.forEach((b) => {
      if (b.category) cats.add(b.category.toLowerCase());
    });
    return ['all', ...Array.from(cats)];
  }, [localBookings]);

  // Reset category if user switches to a category no longer present
  useEffect(() => {
    if (selectedCategory !== 'all' && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [availableCategories, selectedCategory]);

  // Toggle card expansion (chevron)
  const toggleExpand = (bookingId) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  };

  // Filter logic
  const filteredBookings = useMemo(() => {
    return localBookings.filter((b) => {
      const isCompleted = (b.status || '').toLowerCase() === 'completed';
      const isCancelled = (b.status || '').toLowerCase() === 'cancelled';
      const isActive = !isCompleted && !isCancelled;

      // Tab filtering
      if (activeTab === 'active' && !isActive) return false;
      if (activeTab === 'completed' && !isCompleted) return false;

      // Category filtering
      if (selectedCategory !== 'all' && (b.category || '').toLowerCase() !== selectedCategory) {
        return false;
      }

      // Debounced live-search filtering against booking ID and technician name (plus title/locality)
      if (debouncedSearch) {
        const matchesRef = (b.bookingId || '').toLowerCase().includes(debouncedSearch);
        const matchesTech = (b.technicianName || '').toLowerCase().includes(debouncedSearch);
        const matchesTitle = (b.serviceTitle || '').toLowerCase().includes(debouncedSearch);
        const matchesLoc = (b.locality || b.address || '').toLowerCase().includes(debouncedSearch);
        if (!matchesRef && !matchesTech && !matchesTitle && !matchesLoc) {
          return false;
        }
      }

      return true;
    });
  }, [localBookings, activeTab, selectedCategory, debouncedSearch]);

  // Marketplace Service Requests filtering
  const filteredRequests = useMemo(() => {
    if (!Array.isArray(activeRequests)) return [];
    return activeRequests.filter((req) => {
      const isCompleted = req.status === 'Completed';
      const isCancelled = req.status === 'Cancelled';
      const isActive = !isCompleted && !isCancelled;

      if (activeTab === 'active' && !isActive) return false;
      if (activeTab === 'completed' && !isCompleted) return false;

      if (selectedCategory !== 'all' && (req.category || '').toLowerCase() !== selectedCategory) {
        return false;
      }

      if (debouncedSearch) {
        const matchesRef = (req.requestRef || '').toLowerCase().includes(debouncedSearch);
        const matchesTitle = (req.serviceTitle || '').toLowerCase().includes(debouncedSearch);
        const matchesDesc = (req.problemDescription || '').toLowerCase().includes(debouncedSearch);
        const matchesLoc = (req.userAddress || '').toLowerCase().includes(debouncedSearch);
        if (!matchesRef && !matchesTitle && !matchesDesc && !matchesLoc) return false;
      }

      return true;
    });
  }, [activeRequests, activeTab, selectedCategory, debouncedSearch]);

  // Dynamic count badges (combined legacy bookings + marketplace requests)
  const activeCount = useMemo(() => {
    const bookingActives = localBookings.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s !== 'completed' && s !== 'cancelled';
    }).length;
    const reqActives = (activeRequests || []).filter(r => r.status !== 'Completed' && r.status !== 'Cancelled').length;
    return bookingActives + reqActives;
  }, [localBookings, activeRequests]);

  const completedCount = useMemo(() => {
    const bookingCompleted = localBookings.filter(b => (b.status || '').toLowerCase() === 'completed').length;
    const reqCompleted = (activeRequests || []).filter(r => r.status === 'Completed').length;
    return bookingCompleted + reqCompleted;
  }, [localBookings, activeRequests]);

  const allCount = localBookings.length + (activeRequests || []).length;

  // Marketplace Quote & Request Handlers
  const handleToggleQuotes = async (requestRef) => {
    if (expandedQuotesReqRef === requestRef) {
      setExpandedQuotesReqRef(null);
      return;
    }
    setExpandedQuotesReqRef(requestRef);
    try {
      const res = await fetch(`http://localhost:5000/api/dispatch/request/${requestRef}/quotes`);
      const data = await res.json();
      if (data.success && Array.isArray(data.quotes)) {
        setQuotesByRef(prev => ({ ...prev, [requestRef]: data.quotes }));
      }
    } catch (err) {
      console.warn('Quotes fetch error:', err.message);
    }
  };

  const handleAcceptQuote = async (quoteId, requestRef) => {
    setAcceptingQuoteId(quoteId);
    try {
      const res = await acceptQuote(quoteId);
      if (res && res.success) {
        addToast('Quote accepted! Professional assigned and notified.', 'brass');
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
        if (requestRef) {
          const quotesRes = await fetch(`http://localhost:5000/api/dispatch/request/${requestRef}/quotes`);
          const quotesData = await quotesRes.json();
          if (quotesData.success) {
            setQuotesByRef(prev => ({ ...prev, [requestRef]: quotesData.quotes }));
          }
        }
      } else {
        addToast(res?.error || 'Failed to accept quote. Please try again.', 'destructive');
      }
    } catch (err) {
      addToast(err.message || 'Failed to accept quote.', 'destructive');
    } finally {
      setAcceptingQuoteId(null);
    }
  };

  const handleCancelServiceRequest = async (requestRef) => {
    if (!window.confirm(`Are you sure you want to cancel service request ${requestRef}?`)) return;
    try {
      const res = await cancelRequest(requestRef, 'Customer cancelled');
      if (res && res.success) {
        addToast(`Request ${requestRef} has been cancelled.`, 'destructive');
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Could not cancel request.', 'destructive');
      }
    } catch (err) {
      addToast(err.message, 'destructive');
    }
  };

  const handleSubmitRequestRating = async (requestRef) => {
    if (!serviceFeedback.trim()) {
      addToast('Please provide a brief review note before submitting.', 'info');
      return;
    }
    setIsSubmittingRating(true);
    try {
      const res = await rateCompletedJob(requestRef, serviceRating, serviceFeedback);
      if (res && res.success) {
        addToast('Thank you! Your verified service rating has been submitted.', 'brass');
        setRatingReqRef(null);
        setServiceFeedback('');
        if (currentUser && loadMyRequests) {
          await loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Failed to submit rating.', 'destructive');
      }
    } catch (err) {
      addToast(err.message, 'destructive');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Reschedule handler: updates booking time immediately and shows confirmation toast
  const handleExecuteReschedule = async (booking, newTimeSlot) => {
    setLocalBookings((prev) =>
      prev.map((b) =>
        b.bookingId === booking.bookingId
          ? { ...b, scheduledTime: newTimeSlot, date: newTimeSlot, status: 'Confirmed', stageIndex: 0 }
          : b
      )
    );
    addToast(`Booking rescheduled to ${newTimeSlot}.`, 'brass');
  };

  // Cancel handler: moves card out of active into cancelled and shows confirmation toast
  const handleExecuteCancel = async (booking, reason) => {
    setLocalBookings((prev) =>
      prev.map((b) =>
        b.bookingId === booking.bookingId
          ? { ...b, status: 'Cancelled', stageIndex: 0, cancelReason: reason }
          : b
      )
    );
    addToast(`Booking ${booking.bookingId || booking.bookingRef} has been cancelled.`, 'destructive');
  };

  // Rate handler: updates star review and confirms via toast
  const handleExecuteRating = async (booking, { rating, feedback, tags }) => {
    setLocalBookings((prev) =>
      prev.map((b) =>
        b.bookingId === booking.bookingId
          ? { ...b, ratingGiven: rating, reviewFeedback: feedback, reviewTags: tags }
          : b
      )
    );
    addToast(`Thank you for rating ${booking.technicianName || 'your technician'}!`, 'info');
  };

  // Guarded new booking initiator (exclusive job-lock enforcement)
  const handleInitiateNewBooking = () => {
    if (isCustomerLocked) {
      addToast(
        `Active Job in Progress (${lockedJobRequest.requestRef}): You cannot create another booking until your ongoing service (${lockedJobRequest.status}) resolves.`,
        'destructive'
      );
      return;
    }
    if (onNavigateToServices) {
      onNavigateToServices('all');
    }
  };

  // Timeout safeguard handler: Cancel delinquent pro and re-broadcast request
  const handleCancelAndRebroadcast = async (requestRef) => {
    if (cancelAndRebroadcast) {
      const res = await cancelAndRebroadcast(requestRef);
      if (res && res.success) {
        addToast(`Request ${requestRef} has been re-broadcast to nearby verified professionals.`, 'brass');
        if (currentUser?.isLoggedIn) {
          loadMyRequests(currentUser);
        }
      } else {
        addToast(res?.error || 'Unable to re-broadcast request.', 'destructive');
      }
    }
  };

  // Rebook service: pre-fills service category and routes to booking
  const handleRebook = (booking) => {
    if (isCustomerLocked) {
      addToast(
        `Active Job in Progress (${lockedJobRequest.requestRef}): Please complete your ongoing service before creating a new booking.`,
        'destructive'
      );
      return;
    }
    addToast(`Starting new booking for ${booking.serviceTitle}...`, 'info');
    if (onNavigateToServices) {
      onNavigateToServices(booking.category || 'all');
    }
  };

  // Clear search query
  const handleClearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
  };

  return (
    <div className="my-bookings-page-wrapper" role="main">
      <div className="bookings-layout-container">
        {/* Top Breadcrumb Navigation */}
        <nav className="bookings-breadcrumb-nav" aria-label="Breadcrumb">
          <button
            type="button"
            className="bookings-breadcrumb-link"
            onClick={onNavigateToHome}
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to dashboard</span>
          </button>
        </nav>

        {/* Page Header */}
        <header className="bookings-page-header">
          <div className="bookings-header-text">
            <h1 className="bookings-main-title">My Bookings</h1>
            <p className="bookings-subhead">
              Every job, tracked from request to completion.
            </p>
          </div>

          {/* Real Route Action: Book a Service */}
          <div className="bookings-header-cta">
            <button
              type="button"
              className={`btn-book-certified-pro ${isCustomerLocked ? 'disabled-busy-pro' : ''}`}
              onClick={handleInitiateNewBooking}
              disabled={isCustomerLocked}
              aria-label={isCustomerLocked ? `Cannot book new service while job (${lockedJobRequest?.requestRef}) is active` : 'Browse services catalog and book a certified pro'}
              title={isCustomerLocked ? `Active job in progress (Ref: ${lockedJobRequest?.requestRef}). Complete ongoing service before requesting a new booking.` : 'Book a Service'}
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

        {/* Consolidated Unified Filter Bar */}
        <div className="bookings-control-bar">
          <div className="bookings-filter-row">
            <div className="filter-controls-left">
              {/* Status Tabs */}
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

            {/* Search Input with Non-Clipping Placeholder */}
            <div className="bookings-search-input-wrap">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="search-icon-svg">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search ID or technician..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bookings-search-input"
                aria-label="Search bookings by booking ID or provider name"
              />
              {searchInput && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={handleClearSearch}
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

        {/* Bookings Feed Section */}
        <section className="bookings-feed-section" aria-live="polite">
          {/* 1. Loading Skeleton State */}
          {isLoading ? (
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
            /* 2. Error State with Retry Button */
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
              <button
                type="button"
                className="btn-retry-fetch"
                onClick={loadBookingsData}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Retry</span>
              </button>
            </div>
          ) : (filteredRequests.length > 0 || filteredBookings.length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* ========================================================== */}
              {/* MARKETPLACE SERVICE REQUESTS & LIVE QUOTES FEED */}
              {/* ========================================================== */}
              {filteredRequests.length > 0 && (
                <div className="marketplace-requests-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h2 className="bookings-section-heading">
                        <span>Service Requests & Live Quotes</span>
                        {filteredRequests.length > 1 && (
                          <span className="bookings-section-count-badge">
                            {filteredRequests.length} Active
                          </span>
                        )}
                      </h2>
                      <p className="bookings-section-subhead">
                        Real-time quotes from local verified technicians & door OTP verification.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {filteredRequests.map((req) => {
                      const quotes = quotesByRef[req.requestRef] || [];
                      const isQuotesExpanded = expandedQuotesReqRef === req.requestRef;
                      const isCompleted = req.status === 'Completed';
                      const isCancelled = req.status === 'Cancelled';
                      const isAccepted = req.status === 'Accepted';
                      const isEnRoute = req.status === 'En Route';
                      const isInProgress = req.status === 'In Progress' || req.status === 'OTP Verified';
                      const isOpen = req.status === 'Open' || req.status === 'Quoting';

                      return (
                        <div
                          key={req.requestRef}
                          className="booking-item-card booking-item-active"
                          style={{
                            border: '1.5px solid var(--bg-card-border)',
                            borderRadius: '16px',
                            background: 'var(--bg-card)',
                            padding: '1.5rem',
                            boxShadow: '0 4px 18px rgba(0,0,0,0.04)'
                          }}
                        >
                          {/* Top Header */}
                          <div className="card-top-header" style={{ marginBottom: '0.85rem' }}>
                            <div className="card-service-meta">
                              <div className="service-icon-badge" aria-hidden="true">
                                {req.category === 'plumber' ? (
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
                                <h2 className="service-main-heading">{req.serviceTitle}</h2>
                                <div className="service-sub-meta">
                                  <span className="booking-ref-tag">{req.requestRef}</span>
                                  <span className="meta-bullet">•</span>
                                  <span className="locality-text">{req.userAddress ? req.userAddress.split(',')[0] : 'Your Address'}</span>
                                  {req.createdAt && (
                                    <>
                                      <span className="meta-bullet">•</span>
                                      <span className="completed-date-text">
                                        {new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="card-status-container">
                              {isOpen && (
                                <span className="live-status-pill brass-pill">
                                  <span className="pulsing-live-dot" aria-hidden="true" />
                                  <span>Broadcasted · Awaiting Quotes</span>
                                </span>
                              )}
                              {req.isDelayed ? (
                                <span className="live-status-pill" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' }}>
                                  <span className="pulsing-live-dot" style={{ background: '#dc2626' }} aria-hidden="true" />
                                  <span>Delayed · Awaiting Confirmation</span>
                                </span>
                              ) : isAccepted ? (
                                <span className="live-status-pill" style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}>
                                  <span>Quote Accepted</span>
                                </span>
                              ) : null}
                              {isEnRoute && (
                                <span className="live-status-pill brass-pill">
                                  <span className="pulsing-live-dot" aria-hidden="true" />
                                  <span>En Route to Location</span>
                                </span>
                              )}
                              {isInProgress && (
                                <span className="live-status-pill" style={{ background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}>
                                  <span className="pulsing-live-dot" aria-hidden="true" />
                                  <span>Work In Progress</span>
                                </span>
                              )}
                              {isCompleted && (
                                <span className="live-status-pill forest-pill">
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Job Completed</span>
                                </span>
                              )}
                              {isCancelled && (
                                <span className="live-status-pill" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                  <span>Cancelled</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Problem details */}
                          <div className="booking-problem-box">
                            <strong>Problem Reported:</strong> "{req.problemDescription}"
                          </div>

                          {/* Timeout Safeguard Banner: Surface Cancel & Re-broadcast action */}
                          {req.isDelayed && (
                            <div
                              style={{
                                background: 'rgba(239, 68, 68, 0.05)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                margin: '0.85rem 0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '0.85rem'
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Delayed &bull; Awaiting Confirmation
                                </div>
                                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                  The accepted technician has not arrived or verified door OTP within the expected window.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCancelAndRebroadcast(req.requestRef)}
                                style={{
                                  background: '#059669',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '7px',
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                Cancel &amp; Re-broadcast &rarr;
                              </button>
                            </div>
                          )}

                          {/* Door OTP Card if accepted / en route / in progress */}
                          {(isAccepted || isEnRoute || isInProgress) && req.otpCode && (
                            <div style={{ background: '#fffbeb', border: '1.5px dashed #f59e0b', borderRadius: '12px', padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', margin: '1rem 0' }}>
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: '#92400e', letterSpacing: '0.05em' }}>
                                  Door Verification OTP
                                </div>
                                <div style={{ fontSize: '0.84rem', color: '#78350f', marginTop: '0.2rem', fontWeight: 400 }}>
                                  Provide this 4-digit code to the technician upon door arrival to verify authorization.
                                </div>
                              </div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.45rem', fontWeight: 700, letterSpacing: '0.15em', color: '#b45309', background: '#fff', padding: '0.35rem 0.85rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                {req.otpCode}
                              </div>
                            </div>
                          )}

                          {/* Assigned Provider Details if accepted */}
                          {(isAccepted || isEnRoute || isInProgress) && req.acceptedProvider && (
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', borderRadius: '12px', padding: '0.85rem 1rem', margin: '0.85rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                              <div>
                                <div className="booking-allcaps-label">Assigned Professional</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{req.acceptedProvider.name}</div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{req.acceptedProvider.trade} • Rating: {req.acceptedProvider.rating || '4.9'}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div className="booking-allcaps-label">Agreed Quote</div>
                                <div style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669' }}>
                                  ₹{req.acceptedProvider.amount || req.totalAmount || 0}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Quotes comparison section if open / quoting */}
                          {isOpen && (
                            <div style={{ marginTop: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleQuotes(req.requestRef)}
                                  style={{
                                    background: 'var(--primary-color, #101820)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.65rem 1.15rem',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                  }}
                                >
                                  <span>
                                    {isQuotesExpanded
                                      ? 'Hide Quotes ▲'
                                      : `Review Quotes (${quotes.length || req.totalQuotes || 0} Received) ▼`}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCancelServiceRequest(req.requestRef)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    fontSize: '0.84rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                  }}
                                >
                                  Cancel Request
                                </button>
                              </div>

                              {isQuotesExpanded && (
                                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--bg-card-border)', paddingTop: '1rem' }}>
                                  {quotes.length === 0 ? (
                                    <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-input)', borderRadius: '10px' }}>
                                      <p style={{ margin: 0, fontWeight: 700 }}>Nearby professionals are assessing your request.</p>
                                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                                        Quotes typically arrive within 2–5 minutes. Check back shortly.
                                      </p>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                      {quotes.map((q) => (
                                        <div
                                          key={q.quoteId}
                                          style={{
                                            border: '1.5px solid #d1d5db',
                                            borderRadius: '12px',
                                            padding: '1.15rem',
                                            background: '#ffffff',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                          }}
                                        >
                                          <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                              <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{q.agentName}</div>
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                                  Rating: {q.agentRating} ({q.agentCompletedJobs} jobs) • {q.agentExperience} yrs exp
                                                </div>
                                              </div>
                                              <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669' }}>
                                                  ₹{q.amount}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                  Est. {q.estimatedDuration} mins
                                                </div>
                                              </div>
                                            </div>
                                            {q.message && (
                                              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '0.5rem 0.75rem', borderRadius: '6px', margin: '0.5rem 0' }}>
                                                "{q.message}"
                                              </p>
                                            )}
                                          </div>
                                          <div style={{ marginTop: '0.85rem' }}>
                                            {q.status === 'Accepted' ? (
                                              <span style={{ color: '#059669', fontWeight: 800, fontSize: '0.88rem' }}>Quote Accepted</span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => handleAcceptQuote(q.quoteId, req.requestRef)}
                                                disabled={acceptingQuoteId === q.quoteId}
                                                style={{
                                                  width: '100%',
                                                  background: '#059669',
                                                  color: '#ffffff',
                                                  border: 'none',
                                                  borderRadius: '8px',
                                                  padding: '0.65rem 1rem',
                                                  fontWeight: 700,
                                                  fontSize: '0.88rem',
                                                  cursor: 'pointer'
                                                }}
                                              >
                                                {acceptingQuoteId === q.quoteId ? 'Accepting Quote...' : 'Accept Quote →'}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* If Completed: Warranty & Review */}
                          {isCompleted && (
                            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--bg-card-border)', paddingTop: '1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                                <span style={{ background: '#ecfdf5', color: '#065f46', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                                  30-Day NivaaroFix Guarantee Active
                                </span>
                              </div>

                              {req.rating ? (
                                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                                  <strong>Your Verified Rating:</strong> {req.rating} / 5 Stars
                                  {req.ratingFeedback && <p style={{ margin: '0.35rem 0 0', fontStyle: 'italic' }}>"{req.ratingFeedback}"</p>}
                                </div>
                              ) : (
                                <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '10px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                    Rate your service experience with this professional:
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() => setServiceRating(star)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '0 2px'
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" width="22" height="22" fill={star <= serviceRating ? '#f59e0b' : '#d1d5db'} stroke="none">
                                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                        </svg>
                                      </button>
                                    ))}
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, marginLeft: '0.5rem' }}>
                                      {serviceRating}/5 Stars
                                    </span>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={ratingReqRef === req.requestRef ? serviceFeedback : ''}
                                    onChange={(e) => {
                                      setRatingReqRef(req.requestRef);
                                      setServiceFeedback(e.target.value);
                                    }}
                                    placeholder="Share feedback on technician punctuality, skill and cleanliness..."
                                    style={{
                                      width: '100%',
                                      padding: '0.6rem 0.8rem',
                                      borderRadius: '8px',
                                      border: '1px solid var(--bg-card-border)',
                                      fontSize: '0.85rem',
                                      marginBottom: '0.5rem'
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSubmitRequestRating(req.requestRef)}
                                    disabled={isSubmittingRating}
                                    style={{
                                      background: '#101820',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '8px',
                                      padding: '0.5rem 1rem',
                                      fontWeight: 700,
                                      fontSize: '0.84rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {isSubmittingRating ? 'Submitting...' : 'Submit Rating & Feedback'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Confirmed Bookings Feed */}
              {filteredBookings.length > 0 && (
                <div>
                  {filteredRequests.length > 0 && (
                    <div style={{ marginBottom: '1rem', borderTop: '1px solid var(--bg-card-border)', paddingTop: '1.5rem' }}>
                      <h2 className="bookings-section-heading">
                        <span>Direct Bookings & Historic Orders</span>
                      </h2>
                    </div>
                  )}
                  <div className="bookings-card-grid">
              {filteredBookings.map((b) => {
                const isCompleted = (b.status || '').toLowerCase() === 'completed';
                const isCancelled = (b.status || '').toLowerCase() === 'cancelled';
                const isActive = !isCompleted && !isCancelled;
                const isExpanded = expandedCards.has(b.bookingId);
                const warrantyInfo = isCompleted ? computeWarrantyInfo(b.completedAt || b.date) : null;

                return (
                  <article
                    key={b.bookingId}
                    className={`booking-item-card ${isActive ? 'booking-item-active' : 'booking-item-completed'} ${isCancelled ? 'booking-item-cancelled' : ''}`}
                  >
                    {/* Header Row */}
                    <div className="card-top-header">
                      <div className="card-service-meta">
                        {/* Service Icon Badge */}
                        <div className="service-icon-badge" aria-hidden="true">
                          {b.category === 'plumber' ? (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                          )}
                        </div>

                        <div className="service-title-col">
                          <h2 className="service-main-heading">{b.serviceTitle}</h2>
                          <div className="service-sub-meta">
                            <span className="booking-ref-tag">{b.bookingId}</span>
                            <span className="meta-bullet">•</span>
                            <span className="locality-text">{b.locality || b.address || 'Chennai'}</span>
                            {isCompleted && b.date && (
                              <>
                                <span className="meta-bullet">•</span>
                                <span className="completed-date-text">{b.date}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="card-status-container">
                        {isActive && (
                          <span className="live-status-pill brass-pill">
                            <span className="pulsing-live-dot" aria-hidden="true" />
                            <span>
                              {b.status === 'En route' && b.etaMinutes
                                ? `En route · ETA ${b.etaMinutes} min`
                                : (b.status || 'Active')}
                            </span>
                          </span>
                        )}

                        {isCompleted && (
                          <span className="live-status-pill forest-pill">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Completed</span>
                          </span>
                        )}

                        {isCancelled && (
                          <span className="live-status-pill neutral-pill">
                            <span>Cancelled</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active Booking: 4-Segment Animated Progress Bar */}
                    {isActive && (
                      <div className="booking-progress-track-wrapper">
                        <div
                          className="booking-progress-segments"
                          role="progressbar"
                          aria-valuenow={b.stageIndex + 1}
                          aria-valuemin={1}
                          aria-valuemax={4}
                          aria-label={`Booking progress: stage ${b.stageIndex + 1} of 4`}
                        >
                          {['Confirmed', 'Assigned', 'En route', 'In progress'].map((stageName, idx) => {
                            const isPassed = idx < b.stageIndex;
                            const isCurrent = idx === b.stageIndex;

                            let segmentClass = 'segment-pending';
                            if (isPassed) segmentClass = 'segment-passed';
                            if (isCurrent) segmentClass = 'segment-current';

                            return (
                              <div key={stageName} className={`progress-segment-col ${segmentClass}`}>
                                <div className="progress-bar-segment">
                                  <div className="segment-fill" />
                                </div>
                                <span className="segment-label">{stageName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Completed Booking: Dynamic Warranty Row */}
                    {isCompleted && warrantyInfo && (
                      <div className="booking-warranty-strip">
                        <div className={`warranty-pill-tag ${warrantyInfo.isActive ? 'warranty-active' : 'warranty-expired'}`}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="m9 12 2 2 4-4" />
                          </svg>
                          <span>{warrantyInfo.text}</span>
                        </div>

                        {b.otpCode && (
                          <span className="completed-otp-note">
                            Verified Doorstep OTP: <strong>{b.otpCode}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Card Body Divider */}
                    <div className="card-divider-line" />

                    {/* Below Divider: Technician & Pricing Footer Row */}
                    <div className="card-footer-row">
                      <div className="technician-info-block">
                        <div className="tech-avatar-mini" aria-hidden="true">
                          {(b.technicianName || 'T').charAt(0)}
                        </div>
                        <div className="tech-details-text">
                          <span className="tech-full-line">
                            <strong>{b.technicianName}</strong> · {b.technicianRole} · <svg viewBox="0 0 24 24" width="12" height="12" fill="#059669" stroke="none" style={{ verticalAlign: '-1px', display: 'inline' }} aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> {b.technicianRating} ({b.technicianJobs} jobs)
                          </span>
                        </div>
                      </div>

                      <div className="footer-right-actions">
                        {isCompleted && (
                          <button
                            type="button"
                            className="btn-invoice-link"
                            onClick={() => setInvoiceModalBooking(b)}
                            aria-label={`View and download invoice for ${b.bookingId}`}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>Invoice</span>
                          </button>
                        )}

                        <div className="price-tag-amount">
                          ₹{b.totalAmount} {b.isEstimate ? <span className="estimate-label">(estimate)</span> : ''}
                        </div>

                        <button
                          type="button"
                          className={`btn-expand-chevron ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleExpand(b.bookingId)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Collapse booking details' : 'Expand booking details'}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Drawer Content (Calm Ease-Out Animation) */}
                    {isExpanded && (
                      <div className="booking-expandable-drawer" role="region" aria-label="Detailed booking information">
                        {/* Issue description */}
                        {b.issueType && (
                          <div className="drawer-problem-box">
                            <span className="drawer-sub-title">Reported Issue</span>
                            <p className="drawer-problem-text">"{b.issueType}"</p>
                          </div>
                        )}

                        {/* Active Booking Drawer: Interactive Actions */}
                        {isActive && (
                          <div className="drawer-actions-grid">
                            <button
                              type="button"
                              className="drawer-action-btn btn-track-live"
                              onClick={() => setLiveTrackBooking(b)}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                              </svg>
                              <span>Track live</span>
                            </button>

                            <button
                              type="button"
                              className="drawer-action-btn btn-contact-pro"
                              onClick={() => setContactProBooking(b)}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              <span>Contact pro</span>
                            </button>

                            <button
                              type="button"
                              className="drawer-action-btn btn-reschedule"
                              onClick={() => setRescheduleBooking(b)}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>Reschedule</span>
                            </button>

                            <button
                              type="button"
                              className="drawer-action-btn btn-cancel-booking"
                              onClick={() => setCancelModalBooking(b)}
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                              <span>Cancel booking</span>
                            </button>
                          </div>
                        )}

                        {/* Completed Booking Drawer: Itemized Breakdown & Actions */}
                        {isCompleted && (
                          <div className="completed-drawer-content">
                            <div className="itemized-pricing-grid">
                              <div className="price-row-item">
                                <span>Inspection & Diagnostic Labor</span>
                                <span>₹{b.breakdown?.laborFee || (b.totalAmount - (b.partsAmount || 0))}</span>
                              </div>

                              {b.partsAmount > 0 && (
                                <div className="price-row-item">
                                  <span>OEM Approved Replacement Parts</span>
                                  <span>₹{b.partsAmount}</span>
                                </div>
                              )}

                              <div className="price-row-item">
                                <span>GST (18%)</span>
                                <span>₹{b.breakdown?.gst || Math.round(b.totalAmount * 0.18)}</span>
                              </div>

                              <div className="price-row-item total-item">
                                <span>Total Paid ({b.paymentMethod || 'UPI / Instant Verified'})</span>
                                <span>₹{b.totalAmount}</span>
                              </div>
                            </div>

                            <div className="completed-actions-bar">
                              <button
                                type="button"
                                className="btn-rebook-service"
                                onClick={() => handleRebook(b)}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="1 4 1 10 7 10" />
                                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                </svg>
                                <span>Rebook this service</span>
                              </button>

                              <button
                                type="button"
                                className="btn-rate-visit"
                                onClick={() => setRateModalBooking(b)}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none" aria-hidden="true">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                <span>{b.ratingGiven ? `Rated ${b.ratingGiven}/5 (Update)` : 'Rate this visit'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
                  </div>
                </div>
              )}
            </div>
          ) : debouncedSearch ? (
            /* 4. Search Empty State (No search results match) */
            <div className="bookings-empty-state-card search-empty-state">
              <div className="empty-state-icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </div>
              <h2 className="empty-state-headline">No matching bookings found</h2>
              <p className="empty-state-invitation">
                No bookings match your search — try a different booking ID or provider name.
              </p>
              <button
                type="button"
                className="btn-clear-search-action"
                onClick={handleClearSearch}
              >
                Clear search
              </button>
            </div>
          ) : (
            /* 5. General Tab Empty State */
            <div className="bookings-empty-state-card">
              <div className="empty-state-icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                  <line x1="7" y1="15" x2="7.01" y2="15" />
                  <line x1="11" y1="15" x2="13" y2="15" />
                </svg>
              </div>

              <h2 className="empty-state-headline">
                {activeTab === 'active'
                  ? 'All quiet for now'
                  : activeTab === 'completed'
                  ? 'No completed bookings recorded'
                  : 'All quiet for now'}
              </h2>

              <p className="empty-state-invitation">
                Book a service and track it here in real time.
              </p>

              <button
                type="button"
                className="btn-empty-book-pro"
                onClick={() => onNavigateToServices && onNavigateToServices('all')}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <span>Book a certified pro</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Floating Toast Alerts Queue */}
      <BookingToast toasts={toasts} onDismiss={dismissToast} />

      {/* Interactive Modals */}
      <BookingTrackLiveModal
        isOpen={Boolean(liveTrackBooking)}
        onClose={() => setLiveTrackBooking(null)}
        booking={liveTrackBooking}
        onContactPro={(b) => setContactProBooking(b)}
      />

      <BookingContactProModal
        isOpen={Boolean(contactProBooking)}
        onClose={() => setContactProBooking(null)}
        booking={contactProBooking}
        onToast={(msg) => addToast(msg, 'info')}
      />

      <BookingCancelConfirmModal
        isOpen={Boolean(cancelModalBooking)}
        onClose={() => setCancelModalBooking(null)}
        booking={cancelModalBooking}
        onConfirmCancel={handleExecuteCancel}
      />

      <BookingInvoiceModal
        isOpen={Boolean(invoiceModalBooking)}
        onClose={() => setInvoiceModalBooking(null)}
        booking={invoiceModalBooking}
      />

      <BookingRescheduleModal
        isOpen={Boolean(rescheduleBooking)}
        onClose={() => setRescheduleBooking(null)}
        booking={rescheduleBooking}
        onConfirmReschedule={handleExecuteReschedule}
      />

      <BookingRateModal
        isOpen={Boolean(rateModalBooking)}
        onClose={() => setRateModalBooking(null)}
        booking={rateModalBooking}
        onSubmitRating={handleExecuteRating}
      />
    </div>
  );
}
