import React, { useState, useEffect, useRef, useCallback } from 'react';
import AdminSelect from '../../components/admin/AdminSelect';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer';
import AdminPublishFeedbackModal from '../../components/admin/AdminPublishFeedbackModal';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

/**
 * AdminFeedbackPage - Minimalist, Premium Feedback Management Console
 *
 * Conforms 100% to NivaaroFix Design System:
 * - Pure white (#ffffff) canvas & cards, 1px #e7e2d8 borders, Fraunces / Plus Jakarta Sans.
 * - Forest (#0f4d3c) and Brass (#a9793c) accents, calm ease-out transitions, zero emojis.
 * - Only Appreciations with comments can be published to the website.
 * - Suggestions and Issues never show Publish.
 * - 8-second Undo toast on Publish and Unpublish.
 */

const CATEGORY_TABS = [
  { id: 'all', label: 'All Feedback' },
  { id: 'positive', label: 'Appreciations' },
  { id: 'suggestion', label: 'Suggestions' },
  { id: 'issue', label: 'Issues & Bugs' },
  { id: 'published', label: 'Published on Website' }
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' }
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating_high', label: 'Highest rating' },
  { value: 'rating_low', label: 'Lowest rating' }
];

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return isoStr;
  }
}

export default function AdminFeedbackPage({
  adminUser,
  csrfToken,
  onNavigate = () => {}
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  const [feedbacks, setFeedbacks] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    positiveCount: 0,
    suggestionCount: 0,
    issueCount: 0,
    publishedCount: 0,
    openIssuesCount: 0
  });

  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Publish Dialog State
  const [publishModalItem, setPublishModalItem] = useState(null);
  const [isPublishSubmitting, setIsPublishSubmitting] = useState(false);

  // Toast Notification State with 8-second Undo
  const [toast, setToast] = useState(null); // { id, message, onUndo }
  const toastTimeoutRef = useRef(null);

  // Inspection Drawer State
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const searchInputRef = useRef(null);

  // Global '/' keyboard shortcut for search input focus
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

  // Show toast helper with 8s timer
  const triggerToast = (message, onUndo) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    const toastId = Date.now();
    setToast({ id: toastId, message, onUndo });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((cur) => (cur?.id === toastId ? null : cur));
    }, 8000);
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(null);
  };

  // Fetch feedback records
  const fetchFeedbacks = useCallback(async (isSilent = false) => {
    if (!isSilent && feedbacks.length === 0) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab && activeTab !== 'all') params.set('filter', activeTab);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (sortOrder) params.set('sort', sortOrder);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await fetch(`/admin/feedbacks?${params.toString()}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setFeedbacks((prev) => (fastDeepEqual(prev, data.feedbacks) ? prev : (data.feedbacks || [])));
        if (data.summary) setSummary((prev) => (fastDeepEqual(prev, data.summary) ? prev : data.summary));
        if (data.pagination) setPagination((prev) => (fastDeepEqual(prev, data.pagination) ? prev : data.pagination));
      }
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, statusFilter, searchQuery, sortOrder, pagination.page, pagination.limit, feedbacks.length]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchFeedbacks,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['feedback.updated']
  });

  // Open Publish Modal for an appreciation item
  const handleOpenPublishModal = (item, e) => {
    e?.stopPropagation?.();
    setPublishModalItem(item);
  };

  // Execute Publish from modal
  const handleConfirmPublish = async ({ publicText, publicName }) => {
    if (!publishModalItem) return;
    const targetItem = publishModalItem;
    setIsPublishSubmitting(true);

    try {
      const res = await fetch(`/admin/feedbacks/${targetItem.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ publicText, publicName })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to publish feedback.');

      const publishedRecord = data.feedback || {
        ...targetItem,
        is_published: true,
        published_at: new Date().toISOString(),
        public_text: publicText,
        public_name: publicName || 'Customer',
        published_by: adminUser?.username || 'Admin'
      };

      // Optimistic update
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === targetItem.id ? { ...f, ...publishedRecord, is_published: true } : f))
      );
      if (selectedFeedback && selectedFeedback.id === targetItem.id) {
        setSelectedFeedback((prev) => ({ ...prev, ...publishedRecord, is_published: true }));
      }
      setSummary((prev) => ({ ...prev, publishedCount: prev.publishedCount + 1 }));

      setPublishModalItem(null);

      // Toast with 8-second Undo
      triggerToast('Published to homepage.', () => handleExecuteUnpublish(targetItem.id, true));
    } catch (err) {
      alert(err.message);
    } finally {
      setIsPublishSubmitting(false);
    }
  };

  // Execute 1-click Unpublish
  const handleExecuteUnpublish = async (feedbackId, isUndoAction = false) => {
    setActionLoadingId(feedbackId);
    const itemToUnpublish = feedbacks.find((f) => f.id === feedbackId) || (selectedFeedback?.id === feedbackId ? selectedFeedback : null);

    try {
      const res = await fetch(`/admin/feedbacks/${feedbackId}/unpublish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to unpublish feedback.');

      // Optimistic update
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === feedbackId ? { ...f, is_published: false, unpublished_at: new Date().toISOString() } : f))
      );
      if (selectedFeedback && selectedFeedback.id === feedbackId) {
        setSelectedFeedback((prev) => ({ ...prev, is_published: false }));
      }
      setSummary((prev) => ({ ...prev, publishedCount: Math.max(0, prev.publishedCount - 1) }));

      if (!isUndoAction && itemToUnpublish) {
        // Show Toast with 8-second Undo
        triggerToast('Removed from homepage.', () => {
          handleConfirmPublish({
            publicText: itemToUnpublish.public_text || itemToUnpublish.comment,
            publicName: itemToUnpublish.public_name || 'Customer'
          });
        });
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Status Update (e.g. resolve issue, mark work needed)
  const handleUpdateStatus = async (feedbackId, targetStatus, notes = null, e = null) => {
    e?.stopPropagation?.();
    setActionLoadingId(feedbackId);
    try {
      const res = await fetch(`/admin/feedbacks/${feedbackId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          status: targetStatus,
          notes: notes !== null ? notes : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update status.');

      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === feedbackId
            ? {
                ...f,
                resolution_status: targetStatus,
                admin_notes: notes !== null ? notes : f.admin_notes
              }
            : f
        )
      );

      if (selectedFeedback && selectedFeedback.id === feedbackId) {
        setSelectedFeedback((prev) => ({
          ...prev,
          resolution_status: targetStatus,
          admin_notes: notes !== null ? notes : prev.admin_notes
        }));
      }

      // Re-fetch summary counts
      fetchFeedbacks();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Save admin notes inside drawer
  const handleSaveNotes = async () => {
    if (!selectedFeedback) return;
    setIsSavingNotes(true);
    try {
      await handleUpdateStatus(selectedFeedback.id, selectedFeedback.resolution_status || 'new', editingNotes);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Open inspection drawer
  const handleOpenDrawer = (item) => {
    setSelectedFeedback(item);
    setEditingNotes(item.admin_notes || '');
  };

  return (
    <div className="admin-page-container">
      {/* Page Header (Minimalist, Fraunces H1, Quiet Muted Count) */}
      <div className="admin-registry-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="admin-page-title admin-registry-title">Feedback</h1>
        </div>
        <div className="admin-registry-count-muted">
          {pagination.total} received
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="admin-filter-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div className="admin-filter-chips" role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            let count = null;
            if (tab.id === 'positive') count = summary.positiveCount;
            else if (tab.id === 'suggestion') count = summary.suggestionCount;
            else if (tab.id === 'issue') count = summary.openIssuesCount;
            else if (tab.id === 'published') count = summary.publishedCount;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-filter-chip ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  border: '1px solid var(--admin-border)',
                  background: isActive ? '#14181f' : '#ffffff',
                  color: isActive ? '#ffffff' : 'var(--admin-ink)',
                  cursor: 'pointer',
                  transition: 'all 120ms ease'
                }}
              >
                <span>{tab.label}</span>
                {count !== null && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(20, 24, 31, 0.06)',
                      color: isActive ? '#ffffff' : 'var(--admin-muted)'
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and Toolbar Controls */}
      <div
        className="admin-table-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20
        }}
      >
        {/* Search Field */}
        <div className="admin-search-field-container" style={{ position: 'relative', flex: '1 1 300px', maxWidth: 460 }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-muted)' }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            placeholder="Search by comment, name, phone, or issue... (Press /)"
            className="admin-search-input"
            style={{
              width: '100%',
              height: 40,
              padding: '0 14px 0 38px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid var(--admin-border)',
              background: '#ffffff',
              color: 'var(--admin-ink)',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Filters and Sort Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <AdminSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            options={STATUS_OPTIONS}
            aria-label="Filter by status"
          />

          <AdminSelect
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            options={SORT_OPTIONS}
            aria-label="Sort feedback list"
          />
        </div>
      </div>

      {/* Feedback Items Feed / Cards */}
      {isLoading && feedbacks.length === 0 ? (
        <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="admin-skeleton-row" style={{ height: 110, borderRadius: 12 }} />
          ))}
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="admin-table-card" style={{ background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 12, padding: '48px 24px' }}>
          <AdminEmptyState
            title={activeTab === 'published' ? 'Nothing published yet' : 'No feedback records found'}
            subtitle={
              activeTab === 'published'
                ? 'Published feedback appears on the homepage.'
                : searchQuery || statusFilter !== 'all' || activeTab !== 'all'
                ? 'Try broadening your search or switching to another category.'
                : 'Customer and professional feedback will appear here once submitted.'
            }
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {feedbacks.map((item) => {
            const isPositive = item.isAppreciation !== undefined 
              ? item.isAppreciation 
              : (item.rating >= 4 || ['experience', 'service', 'appreciation', 'positive'].includes(item.category)) && !['suggestion', 'problem', 'issue'].includes(item.category);
            const isSuggestion = item.category === 'suggestion';
            const isIssue = item.category === 'problem' || item.category === 'issue' || (item.rating && item.rating <= 2);
            const isPublished = Boolean(item.is_published);
            const isResolved = item.resolution_status === 'resolved';
            const isInProgress = item.resolution_status === 'in_progress';
            const hasComment = Boolean(item.comment && item.comment.trim());

            return (
              <div
                key={item.id}
                onClick={() => handleOpenDrawer(item)}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 12,
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  cursor: 'pointer',
                  transition: 'border-color 140ms ease, background 140ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9c4b8';
                  e.currentTarget.style.background = '#faf9f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--admin-border)';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                {/* Item Top Metadata Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Star Rating Display */}
                    {item.rating ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          background: 'rgba(169, 121, 60, 0.08)',
                          color: '#a9793c',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600
                        }}
                      >
                        <span>{item.rating}.0</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>No rating</span>
                    )}

                    {/* Category Pill */}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 12,
                        border: '1px solid transparent',
                        background: isPositive
                          ? 'rgba(15, 77, 60, 0.08)'
                          : isSuggestion
                          ? 'rgba(169, 121, 60, 0.08)'
                          : 'rgba(138, 59, 47, 0.08)',
                        color: isPositive ? '#0f4d3c' : isSuggestion ? '#a9793c' : '#8a3b2f',
                        borderColor: isPositive ? 'rgba(15, 77, 60, 0.18)' : isSuggestion ? 'rgba(169, 121, 60, 0.18)' : 'rgba(138, 59, 47, 0.18)'
                      }}
                    >
                      {item.problem_definition || (isPositive ? 'Appreciation' : isSuggestion ? 'Suggestion' : 'Issue / Bug')}
                    </span>

                    {/* Submitter Role & Contact */}
                    <span style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                      by <strong style={{ color: 'var(--admin-ink)' }}>{item.contact_info || (item.user_role === 'guest' ? 'Visitor (Guest)' : item.user_role)}</strong>
                    </span>

                    {/* Time */}
                    <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                      • {formatDate(item.created_at)}
                    </span>
                  </div>

                  {/* Status & Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isPublished && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'rgba(15, 77, 60, 0.08)',
                          color: '#0f4d3c',
                          border: '1px solid rgba(15, 77, 60, 0.2)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        Published
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--admin-border)',
                        background: isResolved ? 'rgba(15, 77, 60, 0.06)' : isInProgress ? 'rgba(169, 121, 60, 0.06)' : '#ffffff',
                        color: isResolved ? '#0f4d3c' : isInProgress ? '#a9793c' : 'var(--admin-muted)'
                      }}
                    >
                      {isResolved ? 'Resolved' : isInProgress ? 'Work Needed' : 'New'}
                    </span>
                  </div>
                </div>

                {/* Comment Text */}
                <div style={{ fontSize: 14, color: 'var(--admin-ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {item.comment}
                </div>

                {/* Internal Admin Note if present */}
                {item.admin_notes && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--admin-muted)',
                      background: 'rgba(20, 24, 31, 0.03)',
                      borderLeft: '2px solid #0f4d3c',
                      padding: '6px 12px',
                      borderRadius: '0 6px 6px 0'
                    }}
                  >
                    <strong>Team Note:</strong> {item.admin_notes}
                  </div>
                )}

                {/* Action Strip */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTop: '1px solid #f0ece2',
                    marginTop: 4
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* For Positive / Appreciation: Publish to Website or Unpublish */}
                    {isPositive ? (
                      isPublished ? (
                        <button
                          type="button"
                          onClick={() => handleExecuteUnpublish(item.id)}
                          disabled={actionLoadingId === item.id}
                          style={{
                            background: '#ffffff',
                            color: '#0f4d3c',
                            border: '1px solid rgba(15, 77, 60, 0.3)',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 120ms ease'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>{actionLoadingId === item.id ? 'Removing...' : 'Unpublish'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleOpenPublishModal(item, e)}
                          disabled={!hasComment || actionLoadingId === item.id}
                          title={!hasComment ? 'Add a comment to publish' : 'Curate and publish on homepage'}
                          style={{
                            background: hasComment ? '#0f4d3c' : '#f5f4ef',
                            color: hasComment ? '#ffffff' : '#9ca3af',
                            border: hasComment ? 'none' : '1px solid #e7e2d8',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: hasComment ? 'pointer' : 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 120ms ease'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                          <span>Publish on Website</span>
                        </button>
                      )
                    ) : null}

                    {/* For Suggestions: Mark Implemented / Plan Action */}
                    {isSuggestion ? (
                      <button
                        type="button"
                        onClick={(e) => handleUpdateStatus(item.id, isInProgress ? 'resolved' : 'in_progress', null, e)}
                        disabled={actionLoadingId === item.id}
                        style={{
                          background: '#ffffff',
                          color: isInProgress ? '#0f4d3c' : '#a9793c',
                          border: '1px solid var(--admin-border)',
                          borderRadius: 6,
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <span>{isInProgress ? 'Mark Implemented' : 'Plan Action (Work Needed)'}</span>
                      </button>
                    ) : null}

                    {/* For Issues: Mark Resolved / Re-open */}
                    {isIssue ? (
                      <button
                        type="button"
                        onClick={(e) => handleUpdateStatus(item.id, isResolved ? 'in_progress' : 'resolved', null, e)}
                        disabled={actionLoadingId === item.id}
                        style={{
                          background: isResolved ? '#ffffff' : '#14181f',
                          color: isResolved ? '#0f4d3c' : '#ffffff',
                          border: isResolved ? '1px solid rgba(15, 77, 60, 0.3)' : 'none',
                          borderRadius: 6,
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <span>{isResolved ? 'Re-open Issue' : 'Mark Resolved'}</span>
                      </button>
                    ) : null}
                  </div>

                  {/* View Details link */}
                  <button
                    type="button"
                    onClick={() => handleOpenDrawer(item)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--admin-muted)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>Inspect details</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection Side Drawer */}
      <AdminDetailDrawer
        isOpen={Boolean(selectedFeedback)}
        onClose={() => setSelectedFeedback(null)}
        title={selectedFeedback ? `Feedback #${selectedFeedback.id}` : ''}
        subtitle={selectedFeedback ? `Submitted by ${selectedFeedback.contact_info || selectedFeedback.user_role} on ${formatDate(selectedFeedback.created_at)}` : ''}
      >
        {selectedFeedback && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Rating & Topic Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid #f0ece2' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginBottom: 4 }}>Rating</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#a9793c', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selectedFeedback.rating ? `${selectedFeedback.rating}.0 / 5.0` : 'No rating given'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginBottom: 4 }}>Category</div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: 'rgba(20, 24, 31, 0.06)',
                    color: 'var(--admin-ink)'
                  }}
                >
                  {selectedFeedback.problem_definition || selectedFeedback.category}
                </span>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginBottom: 4 }}>Status</div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: selectedFeedback.resolution_status === 'resolved' ? 'rgba(15, 77, 60, 0.08)' : 'rgba(169, 121, 60, 0.08)',
                    color: selectedFeedback.resolution_status === 'resolved' ? '#0f4d3c' : '#a9793c'
                  }}
                >
                  {selectedFeedback.resolution_status || 'new'}
                </span>
              </div>
            </div>

            {/* Comment Section */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)', marginBottom: 8 }}>
                User Feedback
              </div>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--admin-ink)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {selectedFeedback.comment}
              </div>
            </div>

            {/* Submitter Details */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)', marginBottom: 8 }}>
                Submitter Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div style={{ padding: 12, background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginBottom: 4 }}>Role</div>
                  <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>{selectedFeedback.user_role}</div>
                </div>
                <div style={{ padding: 12, background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginBottom: 4 }}>Contact Info</div>
                  <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>{selectedFeedback.contact_info || 'Not provided'}</div>
                </div>
              </div>
            </div>

            {/* Public Publishing Action & Details */}
            {(selectedFeedback.isAppreciation !== false && !['suggestion', 'problem', 'issue'].includes(selectedFeedback.category)) && (
              <div style={{ padding: 16, background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)' }}>Homepage Testimonial</div>
                    <div style={{ fontSize: 12, color: 'var(--admin-muted)', marginTop: 2 }}>
                      {selectedFeedback.is_published
                        ? `Published on ${formatDate(selectedFeedback.published_at)} by ${selectedFeedback.published_by || 'Admin'}`
                        : 'Curate and showcase on public homepage'}
                    </div>
                    {selectedFeedback.is_published && selectedFeedback.public_text && (
                      <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic', color: '#14181f' }}>
                        “{selectedFeedback.public_text}”
                      </div>
                    )}
                  </div>

                  {selectedFeedback.is_published ? (
                    <button
                      type="button"
                      onClick={() => handleExecuteUnpublish(selectedFeedback.id)}
                      disabled={actionLoadingId === selectedFeedback.id}
                      style={{
                        background: '#ffffff',
                        color: '#0f4d3c',
                        border: '1px solid rgba(15, 77, 60, 0.3)',
                        borderRadius: 6,
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleOpenPublishModal(selectedFeedback, e)}
                      disabled={!selectedFeedback.comment?.trim()}
                      title={!selectedFeedback.comment?.trim() ? 'Add a comment to publish' : ''}
                      style={{
                        background: selectedFeedback.comment?.trim() ? '#0f4d3c' : '#f5f4ef',
                        color: selectedFeedback.comment?.trim() ? '#ffffff' : '#9ca3af',
                        border: selectedFeedback.comment?.trim() ? 'none' : '1px solid #e7e2d8',
                        borderRadius: 6,
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: selectedFeedback.comment?.trim() ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Publish on Website
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Internal Team Notes & Status Resolution */}
            <div style={{ padding: 16, background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)' }}>
                Resolution & Internal Notes
              </div>

              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="Add team notes on how this problem was handled or planned..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 13,
                  
                  borderRadius: 6,
                  border: '1px solid var(--admin-border)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedFeedback.id, 'in_progress', editingNotes)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--admin-border)',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Mark Work Needed
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedFeedback.id, 'resolved', editingNotes)}
                    style={{
                      background: selectedFeedback.resolution_status === 'resolved' ? '#ffffff' : '#14181f',
                      color: selectedFeedback.resolution_status === 'resolved' ? '#0f4d3c' : '#ffffff',
                      border: selectedFeedback.resolution_status === 'resolved' ? '1px solid rgba(15, 77, 60, 0.3)' : 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Mark Resolved
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  style={{
                    background: '#0f4d3c',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isSavingNotes ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminDetailDrawer>

      {/* Publish to Homepage Modal Dialog */}
      <AdminPublishFeedbackModal
        isOpen={Boolean(publishModalItem)}
        feedback={publishModalItem}
        onClose={() => setPublishModalItem(null)}
        onPublish={handleConfirmPublish}
        isSubmitting={isPublishSubmitting}
      />

      {/* Floating 8-Second Undo Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            background: '#14181f',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px -4px rgba(20, 24, 31, 0.24)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            animation: 'fadeIn 160ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => {
                toast.onUndo();
                dismissToast();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6ee7b7',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss toast"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: 15,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
              marginLeft: -4
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
