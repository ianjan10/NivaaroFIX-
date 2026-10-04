import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { allServicesList, servicesDirectory } from '../data/servicesCatalogData';
import { evaluateCustomerChecklist } from '../utils/profileStrength';

const BookingContext = createContext();

const BOOKING_INTENT_KEY = 'nivaarofix_booking_intent';
const API_BASE = 'http://localhost:5000/api';

export function BookingProvider({ children }) {
  // Booking Drawer State (Protected Booking Workflow)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [activeServiceForBooking, setActiveServiceForBooking] = useState(null);
  const [initialIssueForBooking, setInitialIssueForBooking] = useState(null);

  // Service Detail Exploration Modal State (No login required)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeServiceDetail, setActiveServiceDetail] = useState(null);
  const [highlightedIssue, setHighlightedIssue] = useState(null);

  // Agent Role Notice Modal State (Wrong account type warning)
  const [isAgentNoticeOpen, setIsAgentNoticeOpen] = useState(false);

  // Customer Profile Incomplete Modal State (100% checklist required before booking)
  const [isProfileIncompleteModalOpen, setIsProfileIncompleteModalOpen] = useState(false);

  // Active Bookings from PostgreSQL (legacy -- strictly authentic user records)
  const [activeBookings, setActiveBookings] = useState([]);

  // Service Requests from PostgreSQL (new marketplace flow)
  const [activeRequests, setActiveRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Quotes for a selected request
  const [selectedRequestQuotes, setSelectedRequestQuotes] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Active customer request memo (Single-request mutual exclusivity check)
  const activeCustomerRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['open', 'broadcasting', 'quoting', 'accepted', 'en route', 'otp verified', 'in progress'].includes((r.status || '').toLowerCase())
    ) || null;
  }, [activeRequests]);

  const hasActiveCustomerRequest = Boolean(activeCustomerRequest);

  // Exclusive Job-Lock: customer is locked when request is in Accepted or InProgress state
  const lockedCustomerRequest = useMemo(() => {
    if (!Array.isArray(activeRequests)) return null;
    return activeRequests.find((r) =>
      ['accepted', 'en route', 'otp verified', 'in progress'].includes((r.status || '').toLowerCase())
    ) || null;
  }, [activeRequests]);

  const isCustomerJobLocked = Boolean(lockedCustomerRequest);

  // -----------------------------------------------------------------------
  // Service Request Operations (New Marketplace Pipeline)
  // -----------------------------------------------------------------------

  // Create a service request (replaces direct booking for the new flow)
  const createServiceRequest = useCallback(async (requestData, currentUser = null) => {
    try {
      const payload = {
        userId: currentUser?.id || requestData.userId || null,
        userEmail: currentUser?.email || requestData.userEmail || null,
        userName: currentUser?.name || requestData.userName || 'Customer',
        userPhone: currentUser?.phone || requestData.phone || '',
        userAddress: requestData.address || currentUser?.address || '',
        lat: requestData.lat || null,
        lng: requestData.lng || null,
        accuracy_m: requestData.accuracy_m || null,
        serviceId: requestData.serviceId || activeServiceForBooking?.id || 'general-service',
        serviceTitle: requestData.serviceTitle || activeServiceForBooking?.title || 'General Home Service',
        category: requestData.category || activeServiceForBooking?.categoryId || 'electrician',
        issueType: requestData.issueType || 'Inspection & Repair',
        problemDescription: requestData.problemDescription || '',
        problemTiming: requestData.problemTiming || 'Not specified',
        problemFrequency: requestData.problemFrequency || 'Not specified',
        photos: Array.isArray(requestData.photos) ? requestData.photos : []
      };

      const res = await fetch(`${API_BASE}/dispatch/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to create service request.');
      }

      const createdRequest = data.request;
      setActiveRequests(prev => [createdRequest, ...prev]);
      return { success: true, request: createdRequest };
    } catch (err) {
      console.error('Service request creation error:', err);
      throw err;
    }
  }, [activeServiceForBooking]);

  // Fetch customer's service requests from PostgreSQL
  const loadMyRequests = useCallback(async (currentUser) => {
    if (!currentUser || (!currentUser.email && !currentUser.id)) {
      setActiveRequests([]);
      return;
    }
    setRequestsLoading(true);
    try {
      const emailQuery = currentUser.email ? `email=${encodeURIComponent(currentUser.email)}` : '';
      const idQuery = currentUser.id ? `userId=${currentUser.id}` : '';
      const queryString = [emailQuery, idQuery].filter(Boolean).join('&');

      const res = await fetch(`${API_BASE}/dispatch/my-requests?${queryString}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setActiveRequests(data.requests);
      } else {
        setActiveRequests([]);
      }
    } catch (err) {
      console.warn('Service requests fetch notice:', err.message);
      setActiveRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  // Fetch quotes for a specific service request
  const loadQuotesForRequest = useCallback(async (requestRef) => {
    if (!requestRef) return;
    setQuotesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/quotes`);
      const data = await res.json();
      if (data.success && Array.isArray(data.quotes)) {
        setSelectedRequestQuotes(data.quotes);
      } else {
        setSelectedRequestQuotes([]);
      }
    } catch (err) {
      console.warn('Quotes fetch notice:', err.message);
      setSelectedRequestQuotes([]);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  // Accept a quote (transitions request to Accepted state)
  const acceptQuote = useCallback(async (quoteId) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/quote/${quoteId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setActiveRequests(prev =>
          prev.map(r =>
            r.requestRef === data.request?.requestRef
              ? { ...r, status: 'Accepted', acceptedProvider: data.request.acceptedProvider }
              : r
          )
        );
        setSelectedRequestQuotes(prev =>
          prev.map(q =>
            q.quoteId === quoteId
              ? { ...q, status: 'Accepted' }
              : { ...q, status: q.status === 'Pending' ? 'Declined' : q.status }
          )
        );
      }
      return data;
    } catch (err) {
      console.warn('Accept quote notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Cancel a service request (supports customer and provider actor)
  const cancelRequest = useCallback(async (requestRef, reason, cancelledBy = 'customer') => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, cancelledBy })
      });
      const data = await res.json();
      if (data.success) {
        if (data.request?.status === 'Open') {
          setActiveRequests(prev =>
            prev.map(r => r.requestRef === requestRef ? { ...r, status: 'Open', acceptedProvider: null, isDelayed: false } : r)
          );
        } else {
          setActiveRequests(prev =>
            prev.map(r => r.requestRef === requestRef ? { ...r, status: 'Cancelled' } : r)
          );
        }
      }
      return data;
    } catch (err) {
      console.warn('Cancel request notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Timeout safeguard action: Cancel delinquent pro and re-broadcast request
  const cancelAndRebroadcast = useCallback(async (requestRef) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/rebroadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setActiveRequests(prev =>
          prev.map(r => r.requestRef === requestRef ? { ...r, status: 'Open', acceptedProvider: null, isDelayed: false } : r)
        );
      }
      return data;
    } catch (err) {
      console.warn('Cancel and rebroadcast notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Rate a completed job
  const rateCompletedJob = useCallback(async (requestRef, rating, feedback, tags = []) => {
    try {
      const res = await fetch(`${API_BASE}/dispatch/request/${requestRef}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, feedback, tags })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('Rate job notice:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // Legacy Booking Operations (Preserved for backward compatibility)
  // -----------------------------------------------------------------------

  const loadUserBookings = useCallback(async (currentUser) => {
    if (!currentUser || (!currentUser.email && !currentUser.id)) {
      setActiveBookings([]);
      return;
    }
    try {
      const emailQuery = currentUser.email ? `email=${encodeURIComponent(currentUser.email)}` : '';
      const idQuery = currentUser.id ? `userId=${currentUser.id}` : '';
      const queryString = [emailQuery, idQuery].filter(Boolean).join('&');
      
      const res = await fetch(`${API_BASE}/bookings/my-bookings?${queryString}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.bookings)) {
        setActiveBookings(data.bookings);
      } else {
        setActiveBookings([]);
      }
    } catch (err) {
      console.warn('PostgreSQL booking fetch notice:', err.message);
    }
  }, []);

  // 1. Direct Booking Drawer Controls
  const openBookingFor = (service, initialIssue = null) => {
    setActiveServiceForBooking(service);
    setInitialIssueForBooking(initialIssue);
    setIsBookingModalOpen(true);
  };

  const closeBookingModal = () => {
    setIsBookingModalOpen(false);
    setActiveServiceForBooking(null);
    setInitialIssueForBooking(null);
  };

  // 2. Service Detail Exploration Controls (Informational / Free exploration)
  const openServiceDetail = (serviceOrSlug, initialIssue = null) => {
    let serviceObj = serviceOrSlug;
    if (typeof serviceOrSlug === 'string') {
      serviceObj = servicesDirectory.find(s => s.slug === serviceOrSlug || s.categoryId === serviceOrSlug) || servicesDirectory[0];
    }
    setActiveServiceDetail(serviceObj);
    setHighlightedIssue(initialIssue);
    setIsDetailModalOpen(true);
  };

  const closeServiceDetail = () => {
    setIsDetailModalOpen(false);
    setActiveServiceDetail(null);
    setHighlightedIssue(null);
  };

  // 3. Agent Role Notice Controls
  const openAgentNotice = () => setIsAgentNoticeOpen(true);
  const closeAgentNotice = () => setIsAgentNoticeOpen(false);

  // 4. Profile Incomplete Controls
  const openProfileIncompleteModal = () => setIsProfileIncompleteModalOpen(true);
  const closeProfileIncompleteModal = () => setIsProfileIncompleteModalOpen(false);

  // 5. Booking Intent Storage & Retrieval
  const saveBookingIntent = useCallback((service, issue = null) => {
    const slug = typeof service === 'string' ? service : (service?.slug || service?.categoryId || 'electrician');
    const title = typeof service === 'string' ? (service === 'plumber' ? 'Plumber' : 'Electrician') : (service?.title || 'Service');
    const intent = {
      serviceSlug: slug,
      categoryId: slug,
      serviceTitle: title,
      issue: issue || null,
      origin: 'services',
      returnPath: '/services',
      timestamp: Date.now()
    };
    try {
      sessionStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent));
      localStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent));
    } catch (e) {
      console.warn('Booking intent storage notice:', e.message);
    }
    return intent;
  }, []);

  const getPendingBookingIntent = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(BOOKING_INTENT_KEY) || localStorage.getItem(BOOKING_INTENT_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (Date.now() - (parsed.timestamp || 0) < 2 * 60 * 60 * 1000) {
        return parsed;
      }
      clearBookingIntent();
      return null;
    } catch {
      return null;
    }
  }, []);

  const clearBookingIntent = useCallback(() => {
    try {
      sessionStorage.removeItem(BOOKING_INTENT_KEY);
      localStorage.removeItem(BOOKING_INTENT_KEY);
    } catch (e) {
      console.warn('Booking intent clear notice:', e.message);
    }
  }, []);

  // 6. Centralized Protected Booking Action (Auth & Profile Completeness Guard)
  const initiateProtectedBooking = useCallback(({
    service,
    issue = null,
    currentUser = null,
    currentAgent = null,
    onOpenAuth = null,
    onAgentBlocked = null,
    onProfileIncomplete = null
  }) => {
    const isCustomer = currentUser && currentUser.isLoggedIn && currentUser.role !== 'agent';
    const isExclusivelyAgent = !isCustomer && (currentAgent?.isLoggedIn || (currentUser && (currentUser.role === 'agent' || currentUser.partnerId)));

    if (isExclusivelyAgent) {
      if (onAgentBlocked) {
        onAgentBlocked();
      } else {
        openAgentNotice();
      }
      return { status: 'AGENT_BLOCKED' };
    }

    let targetService = service;
    if (typeof service === 'string') {
      targetService = allServicesList.find(s => s.categoryId === service || s.slug === service) || allServicesList[0];
    }
    closeServiceDetail();
    openBookingFor(targetService, issue);
    return { status: 'ALLOWED' };
  }, []);

  // 7. Resume pending booking intent after login
  const resumeBookingIntentIfPresent = useCallback((currentUser) => {
    if (!currentUser || !currentUser.isLoggedIn || currentUser.role === 'agent') return false;

    const intent = getPendingBookingIntent();
    if (intent && intent.serviceSlug) {
      const targetService = allServicesList.find(s => s.categoryId === intent.serviceSlug) || allServicesList[0];
      clearBookingIntent();
      openBookingFor(targetService, intent.issue);
      return true;
    }
    return false;
  }, [getPendingBookingIntent, clearBookingIntent]);

  // 8. Persist genuine new booking to PostgreSQL database (legacy)
  const addNewBooking = async (bookingData, currentUser = null) => {
    try {
      const payload = {
        userId: currentUser?.id || bookingData.userId || null,
        userEmail: currentUser?.email || bookingData.userEmail || null,
        userName: currentUser?.name || bookingData.userName || 'Customer',
        userPhone: currentUser?.phone || bookingData.phone || '',
        userAddress: bookingData.address || currentUser?.address || '',
        serviceId: bookingData.serviceId || activeServiceForBooking?.id || 'service',
        serviceTitle: bookingData.serviceTitle || activeServiceForBooking?.title || 'Service',
        category: bookingData.category || activeServiceForBooking?.categoryId || 'electrician',
        issueType: bookingData.issueType || 'Inspection & Repair',
        problemDescription: bookingData.problemDescription || '',
        problemTiming: bookingData.problemTiming || 'Not specified',
        problemFrequency: bookingData.problemFrequency || 'Not specified',
        photos: Array.isArray(bookingData.photos) ? bookingData.photos : [],
        timeSlot: bookingData.scheduledTime || 'Today, Express 30 Mins',
        totalAmount: bookingData.totalAmount || 0
      };

      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to create booking.');
      }

      const createdBooking = data.booking;
      setActiveBookings((prev) => [createdBooking, ...prev]);
      return { success: true, booking: createdBooking };
    } catch (err) {
      console.error('PostgreSQL booking save error:', err);
      throw err;
    }
  };

  return (
    <BookingContext.Provider
      value={{
        isBookingModalOpen,
        activeServiceForBooking,
        initialIssueForBooking,
        openBookingFor,
        closeBookingModal,
        isDetailModalOpen,
        activeServiceDetail,
        highlightedIssue,
        openServiceDetail,
        closeServiceDetail,
        isAgentNoticeOpen,
        openAgentNotice,
        closeAgentNotice,
        isProfileIncompleteModalOpen,
        openProfileIncompleteModal,
        closeProfileIncompleteModal,
        saveBookingIntent,
        getPendingBookingIntent,
        clearBookingIntent,
        initiateProtectedBooking,
        resumeBookingIntentIfPresent,
        activeBookings,
        loadUserBookings,
        addNewBooking,
        activeCustomerRequest,
        hasActiveCustomerRequest,
        lockedCustomerRequest,
        isCustomerJobLocked,
        activeRequests,
        requestsLoading,
        createServiceRequest,
        loadMyRequests,
        selectedRequestQuotes,
        quotesLoading,
        loadQuotesForRequest,
        acceptQuote,
        cancelRequest,
        cancelAndRebroadcast,
        rateCompletedJob
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (!context) {
    return {
      activeRequests: [],
      activeBookings: [],
      loadMyRequests: async () => {},
      loadUserBookings: async () => {},
      createServiceRequest: async () => ({ success: false }),
      acceptQuote: async () => ({ success: false }),
      cancelRequest: async () => ({ success: false }),
      cancelAndRebroadcast: async () => ({ success: false }),
      rateCompletedJob: async () => ({ success: false }),
      openBookingFor: () => {},
      closeBookingModal: () => {},
      isBookingModalOpen: false,
      hasActiveCustomerRequest: false,
      activeCustomerRequest: null,
      isCustomerJobLocked: false,
      lockedCustomerRequest: null
    };
  }
  return context;
}
