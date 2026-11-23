import React, { useState, useEffect, useRef, useCallback } from 'react';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

export default function AdminApprovalsQueuePage({
  adminUser,
  csrfToken,
  summary,
  onRefreshSummary,
  onNavigate
}) {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'customers' && adminUser?.role !== 'verifier') {
      return 'customers';
    }
    return 'professionals';
  });

  const [filter, setFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('filter') || 'all';
  });

  const [tradeFilter, setTradeFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('trade') || '';
  });

  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });

  const [sortOrder, setSortOrder] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('sort') || 'oldest';
  });

  const [queueGroups, setQueueGroups] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef(null);

  // Sync state to URL with replaceState
  const syncUrlParams = useCallback((newTab, newFilter, newTrade, newSearch, newSort) => {
    const params = new URLSearchParams();
    if (newTab && newTab !== 'professionals') params.set('tab', newTab);
    if (newFilter && newFilter !== 'all') params.set('filter', newFilter);
    if (newTrade) params.set('trade', newTrade);
    if (newSearch) params.set('q', newSearch);
    if (newSort && newSort !== 'oldest') params.set('sort', newSort);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const newUrl = `/admin/approvals${queryStr}`;
    window.history.replaceState({}, '', newUrl);
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    syncUrlParams(tab, filter, tradeFilter, searchQuery, sortOrder);
  };

  const handleFilterChange = (f) => {
    setFilter(f);
    syncUrlParams(activeTab, f, tradeFilter, searchQuery, sortOrder);
  };

  const handleSearchChange = (q) => {
    setSearchQuery(q);
    syncUrlParams(activeTab, filter, tradeFilter, q, sortOrder);
  };

  const handleTradeChange = (trade) => {
    setTradeFilter(trade);
    syncUrlParams(activeTab, filter, trade, searchQuery, sortOrder);
  };

  const handleSortChange = (sort) => {
    setSortOrder(sort);
    syncUrlParams(activeTab, filter, tradeFilter, searchQuery, sort);
  };

  const toggleColumnSort = (column) => {
    let nextSort = 'oldest';
    if (column === 'position' || column === 'wait') {
      nextSort = sortOrder === 'oldest' ? 'newest' : 'oldest';
    } else if (column === 'name') {
      nextSort = sortOrder === 'name' ? 'name_desc' : 'name';
    } else if (column === 'trade') {
      nextSort = sortOrder === 'trade' ? 'trade_desc' : 'trade';
    } else if (column === 'status') {
      nextSort = sortOrder === 'status' ? 'oldest' : 'status';
    }
    handleSortChange(nextSort);
  };

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

  // Fetch queue data
  const fetchQueue = useCallback(async (isLoadMore = false, cursor = null, isSilent = false) => {
    if (!isLoadMore && !isSilent && queueGroups.length === 0) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter && filter !== 'all') params.set('filter', filter);
      if (tradeFilter) params.set('trade', tradeFilter);
      if (searchQuery) params.set('q', searchQuery);
      if (sortOrder) params.set('sort', sortOrder);
      if (isLoadMore && cursor) params.set('cursor', cursor);

      const endpoint = filter === 'awaiting_submission'
        ? `/admin/approvals/queue/awaiting?${params.toString()}`
        : `/admin/approvals/queue?${params.toString()}`;

      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed to fetch queue');
      const data = await res.json();

      if (isLoadMore) {
        setQueueGroups((prev) => [...prev, ...(data.groups || [])]);
      } else {
        setQueueGroups((prev) => (fastDeepEqual(prev, data.groups) ? prev : (data.groups || [])));
        if (!isSilent) setSelectedIndex(0);
      }
      setTotalCount((prev) => (prev === data.total ? prev : (data.total || 0)));
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error('Queue load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter, tradeFilter, searchQuery, sortOrder, queueGroups.length]);

  useEffect(() => {
    if (activeTab === 'professionals') {
      fetchQueue();
    }
  }, [activeTab, fetchQueue]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: useCallback((isSilent) => {
      if (activeTab === 'professionals') {
        fetchQueue(false, null, isSilent);
      }
      if (onRefreshSummary) onRefreshSummary();
    }, [activeTab, fetchQueue, onRefreshSummary]),
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['verification.submitted', 'verification.claimed', 'verification.released', 'verification.decided', 'approvals.updated']
  });

  // Flattened list for keyboard navigation (J/K)
  const flattenedItems = (Array.isArray(queueGroups) ? queueGroups : []).flatMap(
    (group) => (group && Array.isArray(group.items) ? group.items : group && Array.isArray(group.requests) ? group.requests : [])
  );

  // Primary action: "Review next"
  const handleReviewNext = async () => {
    try {
      const res = await fetch('/admin/approvals/review-next', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.requestId) {
          onNavigate(`/admin/approvals/professionals/${data.requestId}`);
          return;
        }
      }
    } catch (_) {}
    // Fallback: open first unclaimed item in flattened list
    const firstUnclaimed = flattenedItems.find((item) => !item.claimed_by_admin_id);
    if (firstUnclaimed) {
      onNavigate(`/admin/approvals/professionals/${firstUnclaimed.id}`);
    }
  };

  // Keyboard navigation: J (down), K (up), Space / Enter (open / review next)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, flattenedItems.length - 1)));
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Space triggers review next when queue is not empty
        if (flattenedItems.length > 0) {
          e.preventDefault();
          handleReviewNext();
        }
      } else if (e.key === 'Enter') {
        if (flattenedItems[selectedIndex]) {
          e.preventDefault();
          const target = flattenedItems[selectedIndex];
          onNavigate(`/admin/approvals/professionals/${target.id}`);
        } else if (flattenedItems.length > 0) {
          e.preventDefault();
          handleReviewNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flattenedItems, selectedIndex, onNavigate]);

  // WebSocket reactive background event listener (silent refresh)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/admin`;
    let ws = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.event === 'verification.submitted' ||
            msg.event === 'verification.resubmitted' ||
            msg.event === 'verification.claimed' ||
            msg.event === 'verification.decided'
          ) {
            fetchQueue();
            if (onRefreshSummary) onRefreshSummary();
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (ws) ws.close();
    };
  }, [fetchQueue, onRefreshSummary]);

  // Compute Longest Wait & Avg Review Time formatted (show "—" when queue empty, never "0m")
  const pendingCount = summary?.pendingCount || 0;
  const longestWaitDisplay = pendingCount > 0 && summary?.oldestWaitingDuration && summary.oldestWaitingDuration !== '0m'
    ? summary.oldestWaitingDuration
    : '—';
  const avgReviewDisplay = summary?.avgReviewTime7d && summary.avgReviewTime7d !== '0m'
    ? summary.avgReviewTime7d
    : '—';

  return (
    <div className="admin-queue-view">
      {/* Page Header */}
      <div className="admin-approvals-header">
        <div>
          <h1 className="admin-page-title admin-approvals-title">Approvals</h1>
        </div>

        {/* Tabs: Underline style with counters */}
        <div className="admin-tabs-row" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'professionals'}
            className={`admin-tab-btn ${activeTab === 'professionals' ? 'active' : ''}`}
            onClick={() => handleTabChange('professionals')}
          >
            <span>Professionals</span>
            <span className="admin-tab-counter">{pendingCount}</span>
          </button>

          {adminUser?.role !== 'verifier' && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'customers'}
              className={`admin-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => handleTabChange('customers')}
            >
              <span>Customers</span>
              {summary?.newCustomerCount > 0 && (
                <span className="admin-tab-counter">{summary.newCustomerCount} new</span>
              )}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'professionals' ? (
        <>
          {/* Summary Strip (Clickable KPI Cards, no corner badges) */}
          <div className="admin-summary-strip">
            <div
              className="admin-stat-card"
              onClick={() => handleFilterChange('all')}
              role="button"
              tabIndex={0}
              title="All pending requests"
            >
              <span className="admin-stat-label">Pending</span>
              <span className="admin-stat-value">{pendingCount}</span>
              <span className="admin-stat-footer">Awaiting administrative decision</span>
            </div>

            <div
              className="admin-stat-card"
              onClick={() => handleFilterChange('waiting_2d')}
              role="button"
              tabIndex={0}
              title="Filter by oldest waiting"
            >
              <span className="admin-stat-label">Longest wait</span>
              <span className="admin-stat-value">{longestWaitDisplay}</span>
              <span className="admin-stat-footer">Queue waiting time</span>
            </div>

            <div className="admin-stat-card">
              <span className="admin-stat-label">Reviewed today</span>
              <span className="admin-stat-value">{summary?.reviewedTodayCount || 0}</span>
              <span className="admin-stat-footer">Decisions completed</span>
            </div>

            <div className="admin-stat-card">
              <span className="admin-stat-label">Avg. review time</span>
              <span className="admin-stat-value">{avgReviewDisplay}</span>
              <span className="admin-stat-footer">7-day rolling turnaround</span>
            </div>
          </div>

          {/* Controls Row (Chips, Search, 44px Action) */}
          <div className="admin-controls-row">
            <div className="admin-filter-chips">
              {[
                { id: 'all', label: 'All' },
                { id: 'waiting_1d', label: 'Over 1 day' },
                { id: 'waiting_2d', label: 'Over 2 days' },
                { id: 'resubmitted', label: 'Resubmitted' },
                { id: 'updated', label: 'Updated' },
                { id: 'warnings', label: 'Flagged' },
                { id: 'awaiting_submission', label: 'Incomplete' }
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`admin-chip ${filter === chip.id ? 'active' : ''}`}
                  onClick={() => handleFilterChange(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="admin-actions-search-cluster">
              {/* Trade Filter Dropdown */}
              <select
                className="admin-select"
                value={tradeFilter}
                onChange={(e) => handleTradeChange(e.target.value)}
                aria-label="Filter by trade"
                style={{ minWidth: 135 }}
              >
                <option value="">All Trades</option>
                <option value="electrician">Electrician</option>
                <option value="plumber">Plumber</option>
                <option value="carpenter">Carpenter</option>
                <option value="painter">Painter</option>
                <option value="ac-service">AC Service</option>
                <option value="appliance-repair">Appliance Repair</option>
              </select>

              {/* Sort Order Dropdown */}
              <select
                className="admin-select"
                value={sortOrder}
                onChange={(e) => handleSortChange(e.target.value)}
                aria-label="Sort queue"
                style={{ minWidth: 160 }}
              >
                <option value="oldest">Sort: Oldest First</option>
                <option value="newest">Sort: Newest First</option>
                <option value="trade">Sort: Trade (A–Z)</option>
                <option value="trade_desc">Sort: Trade (Z–A)</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="name_desc">Sort: Name (Z–A)</option>
                <option value="status">Sort: Status</option>
              </select>

              <div className="admin-search-wrapper" style={{ minWidth: 240 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5648" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="admin-search-icon" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  className="admin-search-input"
                  placeholder="Search name, ID, phone... (Press /)"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  aria-label="Search verification queue"
                />
              </div>

              {/* Review next: Exactly 44px, one line, small keyboard-hint chip */}
              <button
                type="button"
                className="admin-btn-primary admin-btn-review-next"
                onClick={handleReviewNext}
                disabled={!flattenedItems || flattenedItems.length === 0}
                title={!flattenedItems || flattenedItems.length === 0 ? 'Nothing pending' : 'Review next in queue (Space / Enter)'}
              >
                <span>Review next</span>
                <span className="admin-btn-keyhint">Space</span>
              </button>
            </div>
          </div>

          {/* Queue List Table */}
          <div className="admin-queue-container">
            {isLoading && (!queueGroups || queueGroups.length === 0) ? (
              <div className="admin-card" style={{ padding: 40 }}>
                <div className="admin-table-skeleton-row" />
                <div className="admin-table-skeleton-row" />
                <div className="admin-table-skeleton-row" />
              </div>
            ) : !queueGroups || queueGroups.length === 0 ? (
              <div className="admin-card" style={{ backgroundColor: '#ffffff' }}>
                <AdminEmptyState
                  icon="check-circle"
                  title="Queue clear"
                  subtitle="Every request has been reviewed."
                  style={{ minHeight: 340, backgroundColor: '#ffffff' }}
                />
              </div>
            ) : (
              (Array.isArray(queueGroups) ? queueGroups : []).map((group, gIdx) => {
                const groupItems = group && Array.isArray(group.items) ? group.items : group && Array.isArray(group.requests) ? group.requests : [];
                const headingText = group?.dayLabel || group?.dayHeading || group?.day || 'Submissions';

                return (
                  <div key={group?.dayKey || group?.day || `group_${gIdx}`} className="admin-day-group">
                    <div className="admin-day-heading">
                      {headingText} • {groupItems.length} request{groupItems.length === 1 ? '' : 's'}
                    </div>

                    <div className="admin-card admin-table-card">
                      <table className="admin-table admin-queue-table" role="presentation">
                        <thead>
                          <tr>
                            <th
                              scope="col"
                              style={{ width: 60, cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleColumnSort('position')}
                              title="Sort by arrival order"
                            >
                              # {sortOrder === 'oldest' ? '↑' : sortOrder === 'newest' ? '↓' : ''}
                            </th>
                            <th
                              scope="col"
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleColumnSort('name')}
                              title="Sort by name"
                            >
                              Professional {sortOrder === 'name' ? '↑' : sortOrder === 'name_desc' ? '↓' : ''}
                            </th>
                            <th
                              scope="col"
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleColumnSort('trade')}
                              title="Sort by trade"
                            >
                              Trade {sortOrder === 'trade' ? '↑' : sortOrder === 'trade_desc' ? '↓' : ''}
                            </th>
                            <th scope="col">Documents</th>
                            <th
                              scope="col"
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleColumnSort('wait')}
                              title="Sort by wait time"
                            >
                              Wait {sortOrder === 'oldest' ? '↑' : sortOrder === 'newest' ? '↓' : ''}
                            </th>
                            <th
                              scope="col"
                              style={{ cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleColumnSort('status')}
                              title="Sort by status"
                            >
                              Status {sortOrder === 'status' ? '↑' : ''}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupItems.map((req) => {
                            const globalIndex = flattenedItems.findIndex((it) => it.id === req.id);
                            const isSelected = globalIndex === selectedIndex;

                          return (
                            <tr
                              key={req.id}
                              className={`admin-queue-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => onNavigate(`/admin/approvals/professionals/${req.id}`)}
                              tabIndex={0}
                              role="button"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onNavigate(`/admin/approvals/professionals/${req.id}`);
                                }
                              }}
                            >
                              {/* Position */}
                              <td className="admin-queue-cell" style={{ color: 'var(--admin-muted)', fontWeight: 600 }}>
                                #{req.position || req.positionNumber || 1}
                              </td>

                              {/* Professional name with code */}
                              <td className="admin-queue-cell">
                                <div className="admin-row-user">
                                  <div className="admin-avatar-navy" style={{ width: 34, height: 34, fontSize: 13 }}>
                                    {req.initials || 'P'}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>{req.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--admin-muted)', fontVariantNumeric: 'tabular-nums', }}>
                                      {req.professionalCode}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Trade */}
                              <td className="admin-queue-cell" style={{ fontWeight: 500 }}>
                                <span className="admin-badge-trade">{req.trade}</span>
                              </td>

                              {/* Document checks summary */}
                              <td className="admin-queue-cell">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--admin-ink)' }}>
                                  <span>Selfie</span>
                                  <span style={{ color: 'var(--admin-border)' }}>·</span>
                                  <span>Aadhaar</span>
                                  {req.checks?.licence !== null && req.checks?.licence !== undefined && (
                                    <>
                                      <span style={{ color: 'var(--admin-border)' }}>·</span>
                                      <span>Licence</span>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* Waiting Duration */}
                              <td className="admin-queue-cell" style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                                {req.waitingDuration || req.waitingTime || '—'}
                              </td>

                              {/* Status tags */}
                              <td className="admin-queue-cell">
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {req.isResubmission && (
                                    <span className="admin-tag-pill admin-tag-brass">Resubmitted</span>
                                  )}
                                  {req.hasUpdatedDetails && (
                                    <span className="admin-tag-pill admin-tag-navy">Updated</span>
                                  )}
                                  {req.isClaimed && (req.claimedByAdminName || req.claimedBy) && (
                                    <span className="admin-tag-pill admin-tag-forest">
                                      Claimed by {req.claimedByAdminName || req.claimedBy}
                                    </span>
                                  )}
                                  {!req.isResubmission && !(req.isClaimed && (req.claimedByAdminName || req.claimedBy)) && (
                                    <span className="admin-tag-pill">Pending</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
            )}

            {/* Pagination Load More */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => fetchQueue(true, nextCursor)}
                >
                  Load more requests
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <AdminCustomerApprovalsSubView onNavigate={onNavigate} />
      )}
    </div>
  );
}

function AdminCustomerApprovalsSubView({ onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const searchInputRef = useRef(null);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/admin/approvals/customers?q=${encodeURIComponent(search)}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (_) {}
    finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Focus search on '/'
  useEffect(() => {
    const handleGlobalSlash = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalSlash);
    return () => window.removeEventListener('keydown', handleGlobalSlash);
  }, []);

  const handleOpenCustomer = async (cust) => {
    try {
      const res = await fetch(`/admin/approvals/customers/${cust.id}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data.customer);
      }
    } catch (_) {}
  };

  return (
    <div style={{ padding: '0 32px 40px 32px' }}>
      <div className="admin-info-banner">
        Customers do not require document verification. Registered customer accounts appear below.
      </div>

      <div style={{ marginBottom: 16, maxWidth: 360 }}>
        <div className="admin-search-wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5648" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="admin-search-icon" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            className="admin-search-input"
            placeholder="Search name, phone, code... (Press /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="admin-card" style={{ padding: 40 }}>
          <div className="admin-table-skeleton-row" />
          <div className="admin-table-skeleton-row" />
        </div>
      ) : !customers || customers.length === 0 ? (
        <div className="admin-card">
          <AdminEmptyState
            icon="users"
            title="No customers found"
            subtitle="New customer sign-ups appear here."
            actionLabel={search ? "Clear search" : null}
            onAction={search ? () => setSearch('') : null}
          />
        </div>
      ) : (
        <div className="admin-card admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Customer</th>
                <th scope="col">Contact</th>
                <th scope="col">Registered</th>
                <th scope="col">Bookings</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="admin-queue-row"
                  onClick={() => handleOpenCustomer(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {c.code}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="admin-avatar-navy" style={{ width: 32, height: 32, fontSize: 12 }}>
                        {c.initials || 'C'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>{c.name}</div>
                        {c.is_new && (
                          <span className="admin-tag-new">New</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <div>{c.masked_phone || '—'}</div>
                    <div style={{ color: 'var(--admin-muted)', fontSize: 12 }}>{c.masked_email || '—'}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                    {c.registered_at_formatted}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    {c.completed_bookings_count || 0}
                  </td>
                  <td>
                    <span className="admin-status-badge active">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Quick Drawer */}
      {selectedCustomer && (
        <div className="admin-drawer-overlay" onClick={() => setSelectedCustomer(null)}>
          <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '100vw' }}>
            <div className="admin-drawer-header">
              <div>
                <h2 className="admin-drawer-title">{selectedCustomer.name}</h2>
                <p className="admin-drawer-subtitle">Customer #{selectedCustomer.code}</p>
              </div>
              <button
                type="button"
                className="admin-drawer-close"
                onClick={() => setSelectedCustomer(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="admin-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'var(--admin-canvas)', borderRadius: 10 }}>
                <div className="admin-avatar-navy" style={{ width: 48, height: 48, fontSize: 18 }}>
                  {selectedCustomer.initials || 'C'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--admin-ink)' }}>{selectedCustomer.name}</div>
                  <div style={{ color: 'var(--admin-muted)', fontSize: 13 }}>Status: {selectedCustomer.status}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--admin-border)' }}>
                  <span style={{ color: 'var(--admin-muted)' }}>Phone</span>
                  <span>{selectedCustomer.phone || selectedCustomer.masked_phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--admin-border)' }}>
                  <span style={{ color: 'var(--admin-muted)' }}>Email</span>
                  <span>{selectedCustomer.email || selectedCustomer.masked_email || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--admin-border)' }}>
                  <span style={{ color: 'var(--admin-muted)' }}>Joined</span>
                  <span>{selectedCustomer.registered_at_formatted}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ color: 'var(--admin-muted)' }}>Completed Bookings</span>
                  <strong>{selectedCustomer.completed_bookings_count || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
