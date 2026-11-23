import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer';
import AdminSelect from '../../components/admin/AdminSelect';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

export default function AdminCustomerRegistryPage({ adminUser, csrfToken, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const initialCategory = new URLSearchParams(window.location.search).get('category') || 'all';
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);

  // Selected customer for slide-out drawer
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const selectedRowRef = useRef(null);

  // Suspend/Reactivate confirmation modal
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { id, name, targetStatus }
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Reveal PII Modal
  const [revealTarget, setRevealTarget] = useState(null); // { field, customerId, customerName }
  const [revealReason, setRevealReason] = useState('');
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedData, setRevealedData] = useState({});
  const [revealError, setRevealError] = useState(null);

  const searchInputRef = useRef(null);

  // Sync state to URL with replaceState
  const syncUrlParams = useCallback((q, cat, st, srt, pg) => {
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (cat && cat !== 'all') params.set('category', cat);
    if (st && st !== 'all') params.set('status', st);
    if (srt && srt !== 'newest') params.set('sort', srt);
    if (pg && pg > 1) params.set('page', pg);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/admin/customers${queryStr}`);
  }, []);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination((p) => ({ ...p, page: 1 }));
      syncUrlParams(search, categoryFilter, statusFilter, sortBy, 1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search, categoryFilter, statusFilter, sortBy, syncUrlParams]);

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

  // Fetch customers
  const fetchCustomers = useCallback(async (isSilent = false) => {
    if (!isSilent && customers.length === 0) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        category: categoryFilter,
        status: statusFilter,
        sort: sortBy,
        page: pagination.page,
        limit: pagination.limit
      });
      const res = await fetch(`/admin/registry/customers?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomers((prev) => (fastDeepEqual(prev, data.customers) ? prev : (data.customers || [])));
      if (Array.isArray(data.availableCategories) && data.availableCategories.length > 0) {
        setAvailableCategories((prev) => (fastDeepEqual(prev, data.availableCategories) ? prev : data.availableCategories));
      }
      setPagination((prev) => (fastDeepEqual(prev, data.pagination) ? prev : (data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 })));
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, categoryFilter, statusFilter, sortBy, pagination.page, pagination.limit, customers.length]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchCustomers,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['customer.registered', 'customers.updated']
  });

  // Fetch single customer profile when selected
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerProfile(null);
      return;
    }
    let isMounted = true;
    setIsLoadingProfile(true);

    fetch(`/admin/registry/customers/${selectedCustomerId}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setCustomerProfile(data.profile);
        }
      })
      .catch((err) => {
        console.error('Error loading customer profile:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingProfile(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCustomerId]);

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
          targetType: 'customer',
          targetId: revealTarget.customerId,
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
        [`${revealTarget.customerId}_${revealTarget.field}`]: data.value
      }));
      setRevealTarget(null);
      setRevealReason('');
    } catch (err) {
      setRevealError(err.message);
    } finally {
      setIsRevealing(false);
    }
  };

  // Handle Suspend/Reactivate state change
  const handleConfirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    setIsChangingStatus(true);
    try {
      const res = await fetch(`/admin/registry/customers/${pendingStatusChange.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ status: pendingStatusChange.targetStatus })
      });
      if (res.ok) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === pendingStatusChange.id ? { ...c, status: pendingStatusChange.targetStatus } : c
          )
        );
        if (customerProfile && customerProfile.id === pendingStatusChange.id) {
          setCustomerProfile((prev) => ({ ...prev, status: pendingStatusChange.targetStatus }));
        }
      }
    } catch (_) {}
    finally {
      setIsChangingStatus(false);
      setPendingStatusChange(null);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setSortBy('newest');
    setPagination((p) => ({ ...p, page: 1 }));
    syncUrlParams('', 'all', 'all', 'newest', 1);
  };

  const hasActiveFilters = Boolean(search || categoryFilter !== 'all' || statusFilter !== 'all');

  return (
    <div className="admin-registry-view">
      {/* Page Header (Fraunces H1, Quiet Muted Count) */}
      <div className="admin-registry-header">
        <div>
          <h1 className="admin-page-title admin-registry-title">Customers</h1>
        </div>
        {/* Quiet Muted Count Text (Not a green pill) */}
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
            placeholder="Search by name, code, phone, or location... (Press /)"
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
          {/* Service Category Filter */}
          <AdminSelect
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, e.target.value, statusFilter, sortBy, 1);
            }}
            aria-label="Filter by service category"
          >
            <option value="all">All services</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </AdminSelect>

          {/* Status Filter */}
          <AdminSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, categoryFilter, e.target.value, sortBy, 1);
            }}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </AdminSelect>

          {/* Sort By Filter */}
          <AdminSelect
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
              syncUrlParams(search, categoryFilter, statusFilter, e.target.value, 1);
            }}
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="bookings_high">Most bookings</option>
            <option value="name_asc">Name (A-Z)</option>
          </AdminSelect>
        </div>
      </div>

      {/* Customer Table Container */}
      <div className="admin-card admin-table-card" style={{ marginTop: 20 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Phone</th>
              <th scope="col">Area</th>
              <th scope="col">Bookings</th>
              <th scope="col">Status</th>
              <th scope="col">Last active</th>
              <th scope="col" style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && customers.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: 40 }}>
                  <div className="admin-table-skeleton-row" />
                  <div className="admin-table-skeleton-row" />
                  <div className="admin-table-skeleton-row" />
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr className="admin-empty-table-row">
                <td colSpan="7" style={{ padding: 0, backgroundColor: '#ffffff' }}>
                  {hasActiveFilters ? (
                    <AdminEmptyState
                      icon="search"
                      title="No matches"
                      subtitle="Try a different name, code or area."
                      actionLabel="Clear filters"
                      onAction={handleClearFilters}
                      style={{ minHeight: 320, backgroundColor: '#ffffff' }}
                    />
                  ) : (
                    <AdminEmptyState
                      icon="users"
                      title="No customers yet"
                      subtitle="New sign-ups appear here."
                      style={{ minHeight: 320, backgroundColor: '#ffffff' }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const unmaskedPhone = revealedData[`${c.id}_phone`];
                const isSelected = selectedCustomerId === c.id;

                return (
                  <tr
                    key={c.id}
                    className={`admin-table-row ${isSelected ? 'admin-row-selected' : ''}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        window.open(`/admin/customers/${c.id}`, '_blank');
                        return;
                      }
                      if (onNavigate) {
                        onNavigate(`/admin/customers/${c.id}`);
                      } else {
                        window.location.href = `/admin/customers/${c.id}`;
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (onNavigate) onNavigate(`/admin/customers/${c.id}`);
                        else window.location.href = `/admin/customers/${c.id}`;
                      }
                    }}
                  >
                    {/* Customer (Name with Code stacked beneath) */}
                    <td>
                      <div className="admin-row-user">
                        <div className="admin-avatar-navy" style={{ width: 34, height: 34, fontSize: 13 }}>
                          {c.initials || 'C'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>
                            <a
                              href={`/admin/customers/${c.id}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                              onClick={(e) => {
                                if (!e.metaKey && !e.ctrlKey) {
                                  e.preventDefault();
                                  if (onNavigate) onNavigate(`/admin/customers/${c.id}`);
                                  else window.location.href = `/admin/customers/${c.id}`;
                                }
                              }}
                            >
                              {c.name}
                            </a>
                            {c.isNew && <span className="admin-tag-new">New</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                            {c.customerCode}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Phone (Masked with Reveal) */}
                    <td style={{ fontSize: 13 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {unmaskedPhone || c.phoneMasked || (c.phone ? `${c.phone.slice(0, 3)} ••••• ••••` : '—')}
                        </span>
                        {!unmaskedPhone && (c.phone || c.phoneMasked) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevealTarget({ field: 'phone', customerId: c.id, customerName: c.name });
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

                    {/* Area */}
                    <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                      {c.area || (c.city && c.state ? `${c.city}, ${c.state}` : c.city) || '—'}
                    </td>

                    {/* Bookings (total, with 'X done' muted) */}
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--admin-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.totalBookings || 0}
                      </span>
                      <span style={{ color: 'var(--admin-muted)', fontSize: 12, marginLeft: 6 }}>
                        ({c.completedBookings || 0} done)
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: c.status === 'active' ? 'var(--admin-status-green)' : 'var(--admin-status-red)'
                          }}
                          aria-hidden="true"
                        />
                        {c.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Last active */}
                    <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                      {c.lastActiveFormatted || '—'}
                    </td>

                    {/* Row action */}
                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={`/admin/customers/${c.id}`}
                        className="admin-btn-secondary admin-btn-xs"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            if (onNavigate) onNavigate(`/admin/customers/${c.id}`);
                            else window.location.href = `/admin/customers/${c.id}`;
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
            Showing {customers.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}–
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
                syncUrlParams(search, categoryFilter, statusFilter, sortBy, newPg);
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
                syncUrlParams(search, categoryFilter, statusFilter, sortBy, newPg);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 480px Slide-Out Detail Drawer */}
      <AdminDetailDrawer
        isOpen={Boolean(selectedCustomerId)}
        onClose={() => setSelectedCustomerId(null)}
        title={customerProfile ? customerProfile.name : 'Customer Details'}
        subtitle={customerProfile ? `Customer ID #${customerProfile.customerCode}` : 'Loading...'}
      >
        {isLoadingProfile ? (
          <div style={{ padding: 40 }}>
            <div className="admin-table-skeleton-row" />
            <div className="admin-table-skeleton-row" />
          </div>
        ) : customerProfile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header info card */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--admin-canvas)', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="admin-avatar-navy" style={{ width: 44, height: 44, fontSize: 16 }}>
                  {customerProfile.initials || 'C'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--admin-ink)' }}>{customerProfile.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Registered {customerProfile.registeredAtFormatted}</div>
                </div>
              </div>
              <span className={`admin-status-badge ${customerProfile.status === 'active' ? 'active' : 'suspended'}`}>
                {customerProfile.status}
              </span>
            </div>

            {/* Profile fields */}
            <div className="admin-card" style={{ padding: 16 }}>
              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Phone</span>
                <span>{customerProfile.phone || customerProfile.phoneMasked || '—'}</span>
              </div>

              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Email</span>
                <span>{customerProfile.email || customerProfile.emailMasked || 'Not provided'}</span>
              </div>

              <div className="admin-drawer-row">
                <span className="admin-drawer-field">Permanent address</span>
                <span style={{ color: 'var(--admin-ink)', textAlign: 'right', maxWidth: '60%' }}>
                  {customerProfile.permanentAddress || '—'}
                </span>
              </div>
            </div>

            {/* Action: Suspend / Reactivate button */}
            <div>
              {customerProfile.status === 'active' ? (
                <button
                  type="button"
                  className="admin-btn-secondary admin-btn-danger"
                  style={{ width: '100%' }}
                  onClick={() =>
                    setPendingStatusChange({
                      id: customerProfile.id,
                      name: customerProfile.name,
                      targetStatus: 'suspended'
                    })
                  }
                >
                  Suspend customer account
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  style={{ width: '100%', borderColor: 'var(--admin-forest)', color: 'var(--admin-forest)' }}
                  onClick={() =>
                    setPendingStatusChange({
                      id: customerProfile.id,
                      name: customerProfile.name,
                      targetStatus: 'active'
                    })
                  }
                >
                  Reactivate customer account
                </button>
              )}
            </div>

            {/* Booking / Service Request History */}
            <div className="admin-card" style={{ padding: 16 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 600, color: 'var(--admin-muted)' }}>
                Booking history ({customerProfile.bookings?.length || 0})
              </h4>
              {customerProfile.bookings && customerProfile.bookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {customerProfile.bookings.map((b) => (
                    <div key={b.id} className="admin-drawer-booking-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-ink)' }}>{b.title}</span>
                        <span className={`admin-status-badge ${b.status === 'completed' ? 'active' : ''}`}>{b.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-muted)', marginTop: 4 }}>
                        <span>Ref: {b.code} • {b.category}</span>
                        <span>{b.dateFormatted}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--admin-ink)', marginTop: 4 }}>
                        Assigned: <strong>{b.assignedTo}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13 }}>
                  No booking history found for this customer.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </AdminDetailDrawer>

      {/* Suspend / Reactivate Confirmation Modal */}
      {pendingStatusChange && (
        <div className="admin-modal-overlay" onClick={() => setPendingStatusChange(null)}>
          <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 className="admin-modal-title">
              {pendingStatusChange.targetStatus === 'suspended' ? 'Suspend Customer Account?' : 'Reactivate Customer Account?'}
            </h3>
            <p className="admin-modal-desc">
              {pendingStatusChange.targetStatus === 'suspended'
                ? `Customer ${pendingStatusChange.name} will be prevented from placing new bookings.`
                : `Customer ${pendingStatusChange.name} will have booking access restored.`}
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
              Revealing sensitive information ({revealTarget.field}) for <strong>{revealTarget.customerName}</strong> will be permanently recorded in the administrator audit log with your operator ID and IP address.
            </p>

            <div style={{ marginTop: 16 }}>
              <label className="admin-label">
                Operational reason for reveal
                <textarea
                  className="admin-textarea"
                  rows={3}
                  placeholder="e.g. Inquiring on customer dispute #4019..."
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
    </div>
  );
}
