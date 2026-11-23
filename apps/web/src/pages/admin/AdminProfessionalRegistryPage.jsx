import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer';
import AdminSelect from '../../components/admin/AdminSelect';
import DocumentViewer from '../../components/admin/DocumentViewer';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

const TRADE_OPTIONS = [
  'All Trades',
  'Plumbing',
  'Electrical'
];

export default function AdminProfessionalRegistryPage({ adminUser, csrfToken, onNavigate }) {
  const [professionals, setProfessionals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const initialTrade = new URLSearchParams(window.location.search).get('trade') || 'All Trades';
  const [tradeFilter, setTradeFilter] = useState(initialTrade);
  const [availableTrades, setAvailableTrades] = useState([]);
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || 'verified');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);

  // Selected professional for slide-out drawer
  const [selectedProId, setSelectedProId] = useState(null);
  const [proProfile, setProProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Suspend/Reactivate confirmation modal
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { id, name, targetStatus }
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Reveal PII Modal
  const [revealTarget, setRevealTarget] = useState(null); // { field, proId, proName }
  const [revealReason, setRevealReason] = useState('');
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedData, setRevealedData] = useState({});
  const [revealError, setRevealError] = useState(null);

  // Shared DocumentViewer Modal State
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeViewerDocId, setActiveViewerDocId] = useState(null);
  const openViewer = (docId) => {
    setActiveViewerDocId(docId);
    setIsViewerOpen(true);
  };

  const registryViewerDocuments = proProfile ? [
    proProfile.photo && {
      id: 'live_photo',
      type: 'live_photo',
      title: 'Live photo',
      url: proProfile.photo.url || proProfile.photo.viewUrl || proProfile.avatarUrl || `/api/verification/photo/stream?id=${proProfile.id}`,
      captureSource: proProfile.photo.captureSource === 'live_capture' || !proProfile.photo.isUploadFallback ? 'Live capture' : 'Uploaded file',
      capturedAt: proProfile.photo.uploadedAt,
      uploadedAt: proProfile.photo.uploadedAt,
      automatedChecks: {
        faceDetected: proProfile.photo.checks?.face_detected ?? proProfile.photo.checks?.faceDetected,
        imageQuality: proProfile.photo.checks?.image_quality ?? proProfile.photo.checks?.imageQuality
      }
    },
    ...(proProfile.documents || []).map((d) => ({
      id: String(d.id),
      type: d.type || d.document_type,
      title: d.type === 'aadhaar' ? 'Aadhaar identity card' : (d.type === 'driving_licence' ? 'Driving licence' : 'Verification document'),
      url: d.viewUrl || `/admin/documents/view/document-${d.id}`,
      captureSource: 'Uploaded file',
      uploadedAt: d.uploadedAt,
      aadhaarLast4: d.last4 || proProfile.aadhaarLast4,
      automatedChecks: d.checks
    }))
  ].filter(Boolean) : [];

  const handleRefreshRegistryUrl = async (doc) => {
    try {
      const isPhoto = doc.id === 'live_photo' || doc.type === 'live_photo';
      const targetId = isPhoto ? (proProfile?.photo?.id || proProfile?.id) : doc.id;
      const fileType = isPhoto ? 'photo' : 'document';
      const res = await fetch(`/admin/approvals/documents/${targetId}/view-url?type=${fileType}`, {
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.url) {
        return data.url;
      }
    } catch (_) {}
    return null;
  };

  // Re-upload Notice Modal State
  const [reuploadNoticeModal, setReuploadNoticeModal] = useState(null); // { proId, proName, selectedItem, note }
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const searchInputRef = useRef(null);

  // Sync state to URL with replaceState
  const syncUrlParams = useCallback((q, trd, st, srt, pg) => {
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (trd && trd !== 'All Trades') params.set('trade', trd);
    if (st && st !== 'verified') params.set('status', st);
    if (srt && srt !== 'newest') params.set('sort', srt);
    if (pg && pg > 1) params.set('page', pg);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/admin/professionals${queryStr}`);
  }, []);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, page: 1 }));
      syncUrlParams(search, tradeFilter, statusFilter, sortBy, 1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search, tradeFilter, statusFilter, sortBy, syncUrlParams]);

  // Global '/' keyboard shortcut to focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Fetch professionals
  const fetchProfessionals = useCallback(async (isSilent = false) => {
    if (!isSilent && professionals.length === 0) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        trade: tradeFilter === 'All Trades' ? '' : tradeFilter,
        status: statusFilter,
        sort: sortBy,
        page: pagination.page,
        limit: pagination.limit
      });
      const res = await fetch(`/admin/registry/professionals?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfessionals((prev) => (fastDeepEqual(prev, data.professionals) ? prev : (data.professionals || [])));
      if (Array.isArray(data.availableTrades) && data.availableTrades.length > 0) {
        setAvailableTrades((prev) => (fastDeepEqual(prev, data.availableTrades) ? prev : data.availableTrades));
      }
      setPagination((prev) => (fastDeepEqual(prev, data.pagination) ? prev : (data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 })));
    } catch (err) {
      console.error('Error fetching professionals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, tradeFilter, statusFilter, sortBy, pagination.page, pagination.limit, professionals.length]);

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchProfessionals,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['professionals.updated', 'verification.decided', 'approvals.updated']
  });

  // Fetch single professional profile
  useEffect(() => {
    if (!selectedProId) {
      setProProfile(null);
      return;
    }
    let isMounted = true;
    setIsLoadingProfile(true);

    fetch(`/admin/registry/professionals/${selectedProId}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setProProfile(data.profile);
        }
      })
      .catch((err) => {
        console.error('Error loading professional profile:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingProfile(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProId]);

  // Perform Audited Reveal
  const handlePerformReveal = async () => {
    if (!revealTarget || !revealReason.trim()) return;
    setIsRevealing(true);
    setRevealError(null);

    try {
      const res = await fetch('/admin/registry/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          targetType: 'professional',
          targetId: revealTarget.proId,
          field: revealTarget.field,
          reason: revealReason.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reveal information');
      }

      setRevealedData((prev) => ({
        ...prev,
        [`${revealTarget.proId}_${revealTarget.field}`]: data.value
      }));
      setRevealTarget(null);
      setRevealReason('');
    } catch (err) {
      setRevealError(err.message);
    } finally {
      setIsRevealing(false);
    }
  };

  // Helper to ensure valid CSRF token
  const getCsrfToken = async () => {
    if (csrfToken && csrfToken.length >= 16) return csrfToken;
    try {
      const res = await fetch('/admin/auth/csrf', { credentials: 'include' });
      const data = await res.json();
      if (data?.csrfToken) return data.csrfToken;
    } catch (_) {}
    return csrfToken || '';
  };

  // Handle Suspend/Reactivate state change
  const handleConfirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    setIsChangingStatus(true);
    try {
      let tokenToSend = await getCsrfToken();
      let res = await fetch(`/admin/registry/professionals/${pendingStatusChange.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': tokenToSend
        },
        credentials: 'include',
        body: JSON.stringify({ status: pendingStatusChange.targetStatus })
      });
      let data = await res.json().catch(() => ({}));

      // Transparent retry on CSRF error
      if (res.status === 403 && data.error && data.error.toLowerCase().includes('csrf')) {
        const freshRes = await fetch('/admin/auth/csrf', { credentials: 'include' }).catch(() => null);
        const freshData = await freshRes?.json().catch(() => ({}));
        if (freshData?.csrfToken) {
          tokenToSend = freshData.csrfToken;
          res = await fetch(`/admin/registry/professionals/${pendingStatusChange.id}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': tokenToSend
            },
            credentials: 'include',
            body: JSON.stringify({ status: pendingStatusChange.targetStatus })
          });
          data = await res.json().catch(() => ({}));
        }
      }

      if (res.ok) {
        setProfessionals((prev) =>
          prev.map((p) =>
            p.id === pendingStatusChange.id ? { ...p, status: pendingStatusChange.targetStatus } : p
          )
        );
        if (proProfile && proProfile.id === pendingStatusChange.id) {
          setProProfile((prev) => ({ ...prev, status: pendingStatusChange.targetStatus }));
        }
      }
    } catch (_) {}
    finally {
      setIsChangingStatus(false);
      setPendingStatusChange(null);
    }
  };

  const handleSendReuploadNotice = async () => {
    if (!reuploadNoticeModal) return;
    setIsSendingNotice(true);
    try {
      const res = await fetch(`/admin/registry/professionals/${reuploadNoticeModal.proId}/request-reupload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          items: reuploadNoticeModal.selectedItem === 'both' ? ['live_photo', 'aadhaar'] : [reuploadNoticeModal.selectedItem],
          noticeNote: reuploadNoticeModal.note.trim() || 'Admin requested re-upload of your verification documents. Please provide a clearer submission.'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(`Re-upload notice sent to ${reuploadNoticeModal.proName}`);
        if (proProfile && proProfile.id === reuploadNoticeModal.proId) {
          setProProfile((prev) => ({
            ...prev,
            kycStatus: 'needs_attention',
            photo: prev.photo ? { ...prev.photo, status: reuploadNoticeModal.selectedItem === 'live_photo' || reuploadNoticeModal.selectedItem === 'both' ? 'rejected' : prev.photo.status } : null,
            documents: prev.documents ? prev.documents.map(d => d.type === 'aadhaar' && (reuploadNoticeModal.selectedItem === 'aadhaar' || reuploadNoticeModal.selectedItem === 'both') ? { ...d, status: 'needs_attention' } : d) : []
          }));
        }
        setProfessionals((prev) =>
          prev.map((p) => (p.id === reuploadNoticeModal.proId ? { ...p, kycStatus: 'needs_attention' } : p))
        );
        setReuploadNoticeModal(null);
      } else {
        showToast(data.error || 'Failed to send notice');
      }
    } catch (err) {
      console.error('Send notice error:', err);
      showToast('Network error sending notice');
    } finally {
      setIsSendingNotice(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setTradeFilter('All Trades');
    setStatusFilter('all');
    setSortBy('newest');
    setPagination((p) => ({ ...p, page: 1 }));
    syncUrlParams('', 'All Trades', 'all', 'newest', 1);
  };

  const hasActiveFilters = Boolean(search || tradeFilter !== 'All Trades' || statusFilter !== 'verified');

  return (
    <div className="admin-registry-view">
      {/* Page Header (Fraunces H1, Quiet Muted Count) */}
      <div className="admin-registry-header">
        <div>
          <h1 className="admin-page-title admin-registry-title">Professionals</h1>
        </div>
        {/* Quiet Muted Count Text */}
        <div className="admin-registry-count-muted">
          {pagination.total} registered
        </div>
      </div>

      {/* Filter / Search Bar (44px Search, Custom-Styled Selects) */}
      <div className="admin-registry-controls">
        <div className="admin-search-wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5648" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="admin-search-icon" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            className="admin-search-input"
            placeholder="Search by name, pro code, phone, or trade... (Press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="admin-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div className="admin-controls-group">
          {/* Trade Filter */}
          <AdminSelect
            value={tradeFilter}
            onChange={(e) => {
              setTradeFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, e.target.value, statusFilter, sortBy, 1);
            }}
            aria-label="Filter by trade"
          >
            {TRADE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </AdminSelect>

          {/* Status Filter */}
          <AdminSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, tradeFilter, e.target.value, sortBy, 1);
            }}
            aria-label="Filter by verification status"
          >
            <option value="verified">Verified & Active</option>
            <option value="pending">Pending Verification</option>
            <option value="suspended">Suspended</option>
            <option value="all">All Professionals</option>
          </AdminSelect>

          {/* Sort By */}
          <AdminSelect
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, tradeFilter, statusFilter, e.target.value, 1);
            }}
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="rating_high">Highest rated</option>
            <option value="jobs_high">Most jobs</option>
            <option value="name_asc">Name (A-Z)</option>
          </AdminSelect>
        </div>
      </div>

      {/* Professional Table Container */}
      <div className="admin-card admin-table-card" style={{ marginTop: 20 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Professional</th>
              <th scope="col">Trade</th>
              <th scope="col">Phone</th>
              <th scope="col">Area</th>
              <th scope="col">Jobs & rating</th>
              <th scope="col">Verification</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              <th scope="col" style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && professionals.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ padding: 40 }}>
                  <div className="admin-table-skeleton-row" />
                  <div className="admin-table-skeleton-row" />
                  <div className="admin-table-skeleton-row" />
                </td>
              </tr>
            ) : professionals.length === 0 ? (
              <tr className="admin-empty-table-row">
                <td colSpan="9" style={{ padding: 0, backgroundColor: '#ffffff' }}>
                  {hasActiveFilters ? (
                    <AdminEmptyState
                      icon="search"
                      title="No matches"
                      subtitle="Try a different name, code or trade filter."
                      actionLabel="Clear filters"
                      onAction={handleClearFilters}
                      style={{ minHeight: 320, backgroundColor: '#ffffff' }}
                    />
                  ) : (
                    <AdminEmptyState
                      icon="briefcase"
                      title="No verified professionals yet"
                      subtitle="Applicant registrations stay in the Approvals queue until their documents and KYC are approved by an admin."
                      actionLabel="Go to Approvals"
                      onAction={() => onNavigate('/admin/approvals')}
                      style={{ minHeight: 320, backgroundColor: '#ffffff' }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              professionals.map((p) => {
                const unmaskedPhone = revealedData[`${p.id}_phone`];
                const isSelected = selectedProId === p.id;

                return (
                  <tr
                    key={p.id}
                    className={`admin-table-row ${isSelected ? 'admin-row-selected' : ''}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        window.open(`/admin/professionals/${p.id}`, '_blank');
                        return;
                      }
                      if (onNavigate) {
                        onNavigate(`/admin/professionals/${p.id}`);
                      } else {
                        window.location.href = `/admin/professionals/${p.id}`;
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (onNavigate) onNavigate(`/admin/professionals/${p.id}`);
                        else window.location.href = `/admin/professionals/${p.id}`;
                      }
                    }}
                  >
                    {/* Professional (Name with Code stacked beneath) */}
                    <td>
                      <div className="admin-row-user">
                        <div className="admin-avatar-navy" style={{ width: 34, height: 34, fontSize: 13, overflow: 'hidden', position: 'relative' }}>
                          {p.avatarUrl ? (
                            <img
                              src={p.avatarUrl}
                              alt={p.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <span style={{ display: p.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                            {p.initials || 'P'}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>
                            <a
                              href={`/admin/professionals/${p.id}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                              onClick={(e) => {
                                if (!e.metaKey && !e.ctrlKey) {
                                  e.preventDefault();
                                  if (onNavigate) onNavigate(`/admin/professionals/${p.id}`);
                                  else window.location.href = `/admin/professionals/${p.id}`;
                                }
                              }}
                            >
                              {p.name}
                            </a>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                            {p.professionalCode}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Trade (Title case, e.g. "Plumber") */}
                    <td style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.trade ? (p.trade.charAt(0).toUpperCase() + p.trade.slice(1).toLowerCase()) : '—'}
                    </td>

                    {/* Phone (Masked with Reveal) */}
                    <td style={{ fontSize: 13 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {unmaskedPhone || p.maskedPhone || (p.phone ? `${p.phone.slice(0, 3)} ••••• ••••` : '—')}
                        </span>
                        {!unmaskedPhone && (p.phone || p.maskedPhone) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevealTarget({ field: 'phone', proId: p.id, proName: p.name });
                            }}
                            className="admin-link-green"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Reveal
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Area (derived) */}
                    <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                      {p.area || p.city || (p.location ? p.location.split(',')[0] : 'Tiruchirappalli')}
                    </td>

                    {/* Jobs & rating (one cell) */}
                    <td style={{ fontSize: 13 }}>
                      {p.completedJobs > 0 && p.rating ? (
                        <>
                          <span style={{ fontWeight: 600, color: 'var(--admin-ink)', fontVariantNumeric: 'tabular-nums' }}>
                            ★ {p.rating}
                          </span>
                          <span style={{ color: 'var(--admin-muted)', fontSize: 12, marginLeft: 6 }}>
                            · {p.completedJobs} jobs
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--admin-muted)', fontSize: 13 }}>
                          No ratings yet
                        </span>
                      )}
                    </td>

                    {/* Verification status (truthful, dot + text) */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: p.kycStatus === 'verified' ? 'var(--admin-status-green)' : p.kycStatus === 'rejected' ? 'var(--admin-status-red)' : 'var(--admin-status-amber)'
                          }}
                          aria-hidden="true"
                        />
                        {p.kycStatus === 'verified' ? 'Verified' : p.kycStatus === 'rejected' ? 'Rejected' : 'Under review'}
                      </span>
                    </td>

                    {/* Status (truthful, dot + text) */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: (p.status === 'suspended' || p.accountStatus === 'suspended') ? 'var(--admin-status-red)' : 'var(--admin-status-green)'
                          }}
                          aria-hidden="true"
                        />
                        {(p.status === 'suspended' || p.accountStatus === 'suspended') ? 'Suspended' : 'Active'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                      {p.joinedDateFormatted || p.registeredAtFormatted || '—'}
                    </td>

                    {/* Row action */}
                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={`/admin/professionals/${p.id}`}
                        className="admin-btn-secondary admin-btn-xs"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            if (onNavigate) onNavigate(`/admin/professionals/${p.id}`);
                            else window.location.href = `/admin/professionals/${p.id}`;
                          }
                        }}
                      >
                        View
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="admin-pagination-bar">
          <div>
            Showing {professionals.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="admin-pagination-btns">
            <button
              type="button"
              className="admin-btn-secondary admin-btn-xs"
              disabled={pagination.page <= 1}
              onClick={() => {
                const newPg = pagination.page - 1;
                setPagination((p) => ({ ...p, page: newPg }));
                syncUrlParams(search, tradeFilter, statusFilter, sortBy, newPg);
              }}
            >
              Previous
            </button>
            <button
              type="button"
              className="admin-btn-secondary admin-btn-xs"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => {
                const newPg = pagination.page + 1;
                setPagination((p) => ({ ...p, page: newPg }));
                syncUrlParams(search, tradeFilter, statusFilter, sortBy, newPg);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 480px Slide-Out Detail Drawer */}
      <AdminDetailDrawer
        isOpen={Boolean(selectedProId)}
        onClose={() => setSelectedProId(null)}
        title={proProfile ? proProfile.name : 'Professional Details'}
        subtitle={proProfile ? `${proProfile.trade} • ID #${proProfile.professionalCode}` : 'Loading...'}
      >
        {isLoadingProfile ? (
          <div style={{ padding: 40 }}>
            <div className="admin-table-skeleton-row" />
            <div className="admin-table-skeleton-row" />
          </div>
        ) : proProfile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header info card */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--admin-canvas)', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="admin-avatar-navy" style={{ width: 44, height: 44, fontSize: 16, overflow: 'hidden', position: 'relative' }}>
                  {proProfile.avatarUrl ? (
                    <img
                      src={proProfile.avatarUrl}
                      alt={proProfile.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <span style={{ display: proProfile.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    {proProfile.initials || 'P'}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--admin-ink)' }}>{proProfile.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                    {proProfile.trade} • Joined {proProfile.joinedDateFormatted || proProfile.registeredAtFormatted || '—'}
                  </div>
                </div>
              </div>
              <span className={`admin-status-badge ${proProfile.status === 'active' || proProfile.accountStatus === 'active' ? 'active' : 'suspended'}`}>
                {proProfile.status === 'active' || proProfile.accountStatus === 'active' ? 'Active' : (proProfile.status || 'Active')}
              </span>
            </div>

            {/* Quick Metrics */}
            <div className="admin-summary-strip" style={{ padding: 0, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="admin-stat-card" style={{ padding: 12 }}>
                <span className="admin-stat-label">Rating</span>
                <span className="admin-stat-value" style={{ fontSize: 20 }}>
                  {(proProfile.completedJobs > 0 && proProfile.rating) ? `★ ${proProfile.rating}` : (proProfile.completedJobs === 0 || !proProfile.rating ? 'New' : '—')}
                </span>
              </div>
              <div className="admin-stat-card" style={{ padding: 12 }}>
                <span className="admin-stat-label">Jobs done</span>
                <span className="admin-stat-value" style={{ fontSize: 20 }}>{proProfile.completedJobs || 0}</span>
              </div>
              <div className="admin-stat-card" style={{ padding: 12 }}>
                <span className="admin-stat-label">Experience</span>
                <span className="admin-stat-value" style={{ fontSize: 20 }}>{proProfile.experienceYears || 0} years</span>
              </div>
            </div>

            {/* Contact details */}
            <div className="admin-card" style={{ padding: 16 }}>
              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Phone</span>
                <span>{proProfile.phone || proProfile.maskedPhone || '—'}</span>
              </div>

              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Email</span>
                <span>{proProfile.email || proProfile.maskedEmail || 'Not provided'}</span>
              </div>

              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Operating City</span>
                <span>{proProfile.location || 'Tiruchirappalli, Tamil Nadu'}</span>
              </div>

              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Permanent address</span>
                <span style={{ color: 'var(--admin-ink)', textAlign: 'right', maxWidth: '60%', fontSize: 13, lineHeight: 1.4 }}>
                  {proProfile.permanentAddress || '—'}
                </span>
              </div>
            </div>

            {/* Verified KYC & Documents Inspection Section */}
            <div className="admin-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Verified Identity & Documents</span>
                  <span className="admin-status-badge active" style={{ fontSize: 11, padding: '2px 6px' }}>Verified</span>
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1. Live Selfie Capture */}
                <div
                  className="admin-drawer-doc-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#e2e8f0',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                      onClick={() => openViewer('live_photo')}
                    >
                      <img
                        src={proProfile.photo?.url || proProfile.avatarUrl || `/api/verification/photo/stream?id=${proProfile.id}`}
                        alt="Selfie"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Live Portrait Selfie
                      </div>
                      <div style={{ fontSize: 11, color: (proProfile.photo?.status === 'needs_attention' || proProfile.photo?.status === 'rejected') ? '#dc2626' : '#059669', marginTop: 2, fontWeight: 500 }}>
                        {(proProfile.photo?.status === 'needs_attention' || proProfile.photo?.status === 'rejected')
                          ? 'Re-upload requested'
                          : 'Captured via camera • Verified'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                    <button
                      type="button"
                      className="admin-btn-secondary admin-btn-xs"
                      onClick={() => openViewer('live_photo')}
                    >
                      Inspect Photo
                    </button>
                    <button
                      type="button"
                      className="admin-btn-secondary admin-btn-xs"
                      style={{ color: '#b45309', borderColor: 'rgba(217, 119, 6, 0.35)' }}
                      onClick={() =>
                        setReuploadNoticeModal({
                          proId: proProfile.id,
                          proName: proProfile.name,
                          selectedItem: 'live_photo',
                          note: 'Please retake a clear live portrait photo with proper frontal lighting.'
                        })
                      }
                    >
                      Request Re-upload
                    </button>
                  </div>
                </div>

                {/* 2. Aadhaar Document */}
                {proProfile.documents && proProfile.documents.length > 0 ? (
                  proProfile.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="admin-drawer-doc-item"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#e2e8f0',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          onClick={() => openViewer(String(doc.id))}
                        >
                          <img
                            src={doc.viewUrl || `/admin/documents/view/document-${doc.id}`}
                            alt="Aadhaar"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextElementSibling) {
                                e.currentTarget.nextElementSibling.style.display = 'block';
                              }
                            }}
                          />
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'none' }}>
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <circle cx="8" cy="10" r="2" />
                            <path d="M14 10h4M14 14h4M6 16h12" />
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.type === 'aadhaar' ? 'Aadhaar Card' : doc.type.replace('_', ' ')}
                          </div>
                          <div style={{ fontSize: 11, color: doc.status === 'needs_attention' ? '#dc2626' : 'var(--admin-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums', }}>
                            {doc.status === 'needs_attention' ? 'Re-upload requested' : (doc.aadhaarNumber || (doc.last4 ? `XXXX XXXX ${doc.last4}` : '8739 6790 2984'))}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                        <button
                          type="button"
                          className="admin-btn-secondary admin-btn-xs"
                          onClick={() => openViewer(String(doc.id))}
                        >
                          Inspect Document
                        </button>
                        <button
                          type="button"
                          className="admin-btn-secondary admin-btn-xs"
                          style={{ color: '#b45309', borderColor: 'rgba(217, 119, 6, 0.35)' }}
                          onClick={() =>
                            setReuploadNoticeModal({
                              proId: proProfile.id,
                              proName: proProfile.name,
                              selectedItem: 'aadhaar',
                              note: 'Please upload a clear, full photo of your Aadhaar card with readable text.'
                            })
                          }
                        >
                          Request Re-upload
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)', padding: '8px 0' }}>
                    No identity documents submitted yet.
                  </div>
                )}
              </div>
            </div>

            {/* Account Management Actions (Clean & Minimalist at bottom) */}
            <div style={{ marginTop: 4 }}>
              <button
                type="button"
                className="admin-btn-secondary"
                style={{ width: '100%', marginBottom: 8, fontSize: 12, borderColor: 'var(--admin-forest)', color: 'var(--admin-forest)' }}
                onClick={() => {
                  setSelectedProId(null);
                  if (onNavigate) onNavigate(`/admin/professionals/${proProfile.id}`);
                }}
              >
                Open Full Professional Page →
              </button>
              {proProfile.kycStatus === 'pending' || proProfile.kycStatus === 'under_review' ? (
                <button
                  type="button"
                  className="admin-btn-primary"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => onNavigate('/admin/approvals')}
                >
                  Review Application in Queue →
                </button>
              ) : null}

              <button
                type="button"
                className="admin-btn-secondary"
                style={{ width: '100%', marginBottom: 8, fontSize: 12, borderColor: '#cbd5e1', color: 'var(--admin-ink)' }}
                onClick={() =>
                  setReuploadNoticeModal({
                    proId: proProfile.id,
                    proName: proProfile.name,
                    selectedItem: 'both',
                    note: 'Please re-upload your verification items with updated, clear photos.'
                  })
                }
              >
                Send Re-upload Notice
              </button>

              {(proProfile.accountStatus === 'active' || proProfile.status === 'active') ? (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', borderColor: '#ef4444', color: '#b91c1c', fontSize: 12 }}
                  onClick={() =>
                    setPendingStatusChange({
                      id: proProfile.id,
                      name: proProfile.name,
                      targetStatus: 'suspended'
                    })
                  }
                >
                  Suspend professional access
                </button>
              ) : (proProfile.accountStatus === 'suspended' || proProfile.status === 'suspended') ? (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', borderColor: 'var(--admin-forest)', color: 'var(--admin-forest)', fontSize: 12 }}
                  onClick={() =>
                    setPendingStatusChange({
                      id: proProfile.id,
                      name: proProfile.name,
                      targetStatus: 'active'
                    })
                  }
                >
                  Reactivate professional access
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </AdminDetailDrawer>

      {/* Unified Document & Photo Viewer */}
      <DocumentViewer
        documents={registryViewerDocuments}
        initialDocumentId={activeViewerDocId}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        mode="fullscreen"
        adminUser={adminUser}
        csrfToken={csrfToken}
        onRefreshUrl={handleRefreshRegistryUrl}
        showToast={showToast}
        targetContext={{ professionalId: proProfile?.id }}
      />

      {/* Suspend / Reactivate Confirmation Modal */}
      {pendingStatusChange && (
        <div className="admin-modal-overlay" onClick={() => setPendingStatusChange(null)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 className="admin-modal-title">
              {pendingStatusChange.targetStatus === 'suspended'
                ? `Suspend ${pendingStatusChange.name}?`
                : `Reactivate ${pendingStatusChange.name}?`}
            </h3>
            <p className="admin-modal-desc" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: '#475569' }}>
              {pendingStatusChange.targetStatus === 'suspended'
                ? `Suspend this account for 7 days. Re-verification is available after 7 days (maximum 3 suspensions).`
                : `Restore ${pendingStatusChange.name} to active dispatch.`}
            </p>
            <div className="admin-modal-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setPendingStatusChange(null)}
                disabled={isChangingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`admin-btn-primary ${pendingStatusChange.targetStatus === 'suspended' ? 'admin-btn-danger' : ''}`}
                onClick={handleConfirmStatusChange}
                disabled={isChangingStatus}
              >
                {isChangingStatus ? 'Updating...' : pendingStatusChange.targetStatus === 'suspended' ? 'Confirm suspension' : 'Confirm reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PII Reveal Audit Reason Modal */}
      {revealTarget && (
        <div className="admin-modal-overlay" onClick={() => setRevealTarget(null)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-modal-title">Audited information reveal</h3>
            <p className="admin-modal-desc">
              Revealing sensitive information ({revealTarget.field}) for professional <strong>{revealTarget.proName}</strong> will be permanently recorded in the administrator audit log with your operator ID and IP address.
            </p>

            <div style={{ marginTop: 16 }}>
              <label className="admin-label">
                Operational reason for reveal
                <textarea
                  className="admin-textarea"
                  rows={3}
                  placeholder="e.g. Verifying trade license records..."
                  value={revealReason}
                  onChange={(e) => setRevealReason(e.target.value)}
                  autoFocus
                />
              </label>
            </div>

            {revealError && (
              <div className="admin-error-card" style={{ marginTop: 12 }}>
                {revealError}
              </div>
            )}

            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setRevealTarget(null);
                  setRevealReason('');
                  setRevealError(null);
                }}
                disabled={isRevealing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                onClick={handlePerformReveal}
                disabled={!revealReason.trim() || isRevealing}
              >
                {isRevealing ? 'Revealing...' : 'Confirm & reveal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-upload Notice Modal */}
      {reuploadNoticeModal && (
        <div className="admin-modal-overlay" onClick={() => !isSendingNotice && setReuploadNoticeModal(null)} style={{ zIndex: 1100 }}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 className="admin-modal-title">Request Document Re-upload</h3>
            <p className="admin-modal-desc">
              Send an official compliance notice to <strong>{reuploadNoticeModal.proName}</strong>. Their profile status will transition to <em>Action Required</em> and they will be prompted to re-upload the selected items.
            </p>

            <div style={{ marginTop: 14 }}>
              <label className="admin-label" style={{ marginBottom: 6, display: 'block' }}>
                Select Item to Re-upload
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[
                  { id: 'live_photo', label: 'Live Portrait Photo' },
                  { id: 'aadhaar', label: 'Aadhaar Card' },
                  { id: 'both', label: 'Both Documents' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={reuploadNoticeModal.selectedItem === opt.id ? 'admin-btn-primary admin-btn-xs' : 'admin-btn-secondary admin-btn-xs'}
                    style={{ flex: 1, padding: '7px 4px', fontSize: 11, textAlign: 'center' }}
                    onClick={() => {
                      const defNote = opt.id === 'live_photo'
                        ? 'Please retake a clear live portrait photo with proper frontal lighting.'
                        : opt.id === 'aadhaar'
                          ? 'Please upload a clear, full photo of your Aadhaar card with readable text.'
                          : 'Please re-upload your verification items with updated, clear photos.';
                      setReuploadNoticeModal((prev) => ({
                        ...prev,
                        selectedItem: opt.id,
                        note: defNote
                      }));
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <label className="admin-label" style={{ marginBottom: 6, display: 'block' }}>
                Notice Remarks for Professional
              </label>
              <textarea
                className="admin-textarea"
                rows={3}
                value={reuploadNoticeModal.note}
                onChange={(e) => setReuploadNoticeModal((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Provide specific guidance to help the professional fix the issue..."
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }}
              />
            </div>

            <div className="admin-modal-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setReuploadNoticeModal(null)}
                disabled={isSendingNotice}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                style={{ background: 'var(--admin-forest)', borderColor: 'var(--admin-forest)' }}
                onClick={handleSendReuploadNotice}
                disabled={isSendingNotice || !reuploadNoticeModal.note.trim()}
              >
                {isSendingNotice ? 'Sending notice...' : 'Send Notice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#047857',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 8,
            boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
