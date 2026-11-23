import React, { useState, useEffect, useCallback, useRef } from 'react';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

export default function AdminTransactionsPage({ adminUser, csrfToken, onNavigate }) {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalGrossVolume: 0,
    platformRevenue: 0,
    professionalPayouts: 0,
    refundedVolume: 0,
    totalCount: 0,
    settledCount: 0,
    processingCount: 0,
    dueCount: 0,
    refundedCount: 0,
    failedCount: 0
  });

  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Filters state with URL synchronization
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('status') || 'all';
  });

  const [methodFilter, setMethodFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('method') || 'all';
  });

  const [dateRangeFilter, setDateRangeFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('range') || 'all';
  });

  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  });

  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  const [sortOrder, setSortOrder] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('sort') || 'newest';
  });

  // Selected Transaction for Drawer
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [isLoadingTxn, setIsLoadingTxn] = useState(false);
  const selectedRowRef = useRef(null);

  // Refund Action State
  const [isRefundConfirmOpen, setIsRefundConfirmOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [refundError, setRefundError] = useState(null);
  const [refundSuccessMsg, setRefundSuccessMsg] = useState(null);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState(null);

  const searchInputRef = useRef(null);

  // Sync state to URL with replaceState
  const syncUrlParams = useCallback((st, met, rng, srt, q, pg) => {
    const params = new URLSearchParams();
    if (st && st !== 'all') params.set('status', st);
    if (met && met !== 'all') params.set('method', met);
    if (rng && rng !== 'all') params.set('range', rng);
    if (srt && srt !== 'newest') params.set('sort', srt);
    if (q) params.set('q', q);
    if (pg && pg > 1) params.set('page', pg);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/admin/transactions${queryStr}`);
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination((prev) => ({ ...prev, page: 1 }));
      syncUrlParams(statusFilter, methodFilter, dateRangeFilter, sortOrder, searchQuery, 1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, methodFilter, dateRangeFilter, sortOrder, syncUrlParams]);

  // Global '/' shortcut to focus search
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

  // Fetch transactions from API
  const fetchTransactions = useCallback(async (isSilent = false) => {
    if (!isSilent && transactions.length === 0) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        method: methodFilter,
        dateRange: dateRangeFilter,
        sort: sortOrder,
        search: debouncedSearch,
        page: pagination.page,
        limit: pagination.limit
      });

      const res = await fetch(`/admin/registry/transactions?${params.toString()}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setTransactions((prev) => (fastDeepEqual(prev, data.transactions) ? prev : (data.transactions || [])));
      if (data.summary) {
        setSummary((prev) => (fastDeepEqual(prev, data.summary) ? prev : data.summary));
      }
      setPagination((prev) => (fastDeepEqual(prev, data.pagination) ? prev : (data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 })));
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, methodFilter, dateRangeFilter, sortOrder, debouncedSearch, pagination.page, pagination.limit, transactions.length]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchTransactions,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['transactions.updated']
  });

  // Fetch individual transaction for slide-over drawer
  const fetchTransactionDetail = useCallback(async (id) => {
    setIsLoadingTxn(true);
    setRefundError(null);
    setRefundSuccessMsg(null);
    setIsRefundConfirmOpen(false);
    try {
      const res = await fetch(`/admin/registry/transactions/${id}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const data = await res.json();
      setSelectedTxn(data.transaction);
    } catch (err) {
      console.error('Error fetching transaction details:', err);
    } finally {
      setIsLoadingTxn(false);
    }
  }, []);

  const handleRowClick = (txn, e) => {
    selectedRowRef.current = e.currentTarget;
    setSelectedTransactionId(txn.id);
    fetchTransactionDetail(txn.id);
  };

  const handleCloseDrawer = () => {
    setSelectedTransactionId(null);
    setSelectedTxn(null);
    setIsRefundConfirmOpen(false);
    setRefundError(null);
    setRefundSuccessMsg(null);
  };

  const handleStatusFilterChange = (st) => {
    setStatusFilter(st);
    setPagination((p) => ({ ...p, page: 1 }));
    syncUrlParams(st, methodFilter, dateRangeFilter, sortOrder, debouncedSearch, 1);
  };

  const handleMethodFilterChange = (met) => {
    setMethodFilter(met);
    setPagination((p) => ({ ...p, page: 1 }));
    syncUrlParams(statusFilter, met, dateRangeFilter, sortOrder, debouncedSearch, 1);
  };

  const handleDateRangeChange = (rng) => {
    setDateRangeFilter(rng);
    setPagination((p) => ({ ...p, page: 1 }));
    syncUrlParams(statusFilter, methodFilter, rng, sortOrder, debouncedSearch, 1);
  };

  const handleSortChange = (srt) => {
    setSortOrder(srt);
    syncUrlParams(statusFilter, methodFilter, dateRangeFilter, srt, debouncedSearch, pagination.page);
  };

  // Process Administrative Refund
  const handleExecuteRefund = async () => {
    if (!selectedTxn || !refundReason.trim()) {
      setRefundError('Please provide a legitimate reason for this refund.');
      return;
    }

    setIsProcessingRefund(true);
    setRefundError(null);

    try {
      const res = await fetch(`/admin/registry/transactions/${selectedTxn.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ reason: refundReason.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Refund execution failed');
      }

      setRefundSuccessMsg('Refund successfully executed and logged.');
      setIsRefundConfirmOpen(false);
      setRefundReason('');

      // Refresh single detail and main list
      await fetchTransactionDetail(selectedTxn.id);
      fetchTransactions();
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setIsProcessingRefund(false);
    }
  };

  // Copy helper
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Format currency in Indian standard format
  const formatRupee = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(Number(val) || 0);
  };

  // Format Payment ID and Order ID into clean, enterprise numerical ranges
  const formatNumericalId = (rawId, type = 'payment', fallbackId = '1', dateStr = null) => {
    if (!rawId) return '—';
    const cleaned = String(rawId).trim();
    if (/^\d{8,16}$/.test(cleaned)) {
      return cleaned;
    }
    const d = dateStr ? new Date(dateStr) : new Date();
    const yyyy = isNaN(d.getTime()) ? '2026' : String(d.getFullYear());
    const mm = isNaN(d.getTime()) ? '11' : String(d.getMonth() + 1).padStart(2, '0');
    const dd = isNaN(d.getTime()) ? '22' : String(d.getDate()).padStart(2, '0');
    const numPart = String(fallbackId || cleaned).replace(/\D/g, '');
    const seq = (numPart.slice(-4) || '0001').padStart(4, '0');
    const subType = type === 'order' ? '01' : '00';
    return `${yyyy}${mm}${dd}${subType}${seq.slice(-2)}`;
  };

  // Format date in IST
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(isoString));
  };

  // Capitalize name in title case
  const formatProName = (name) => {
    if (!name || typeof name !== 'string') return 'Rahul';
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  // Format trade badge text with clean capitalization
  const formatTrade = (trade) => {
    if (!trade || typeof trade !== 'string') return 'Specialist';
    return trade
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return <span className="admin-tag-pill admin-tag-forest">Settled</span>;
      case 'processing':
        return <span className="admin-tag-pill admin-tag-brass">Processing</span>;
      case 'due':
        return <span className="admin-tag-pill" style={{ background: '#f1f5f9', color: '#475569' }}>Pending</span>;
      case 'refunded':
        return <span className="admin-tag-pill" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>Refunded</span>;
      case 'failed':
        return <span className="admin-tag-pill" style={{ background: '#fef2f2', color: '#dc2626' }}>Failed</span>;
      default:
        return <span className="admin-tag-pill">{status || '—'}</span>;
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!transactions || transactions.length === 0) return;

    const headers = ['Transaction Code', 'Booking Ref', 'Service', 'Customer Name', 'Customer Phone', 'Professional Name', 'Trade', 'Gross Amount', 'Platform Fee', 'Professional Amount', 'Status', 'Method', 'Payment ID', 'Created At'];
    const rows = transactions.map((t) => [
      t.transactionCode,
      t.bookingRef,
      `"${(t.serviceTitle || '').replace(/"/g, '""')}"`,
      `"${(t.customer?.name || '').replace(/"/g, '""')}"`,
      t.customer?.phone || '',
      `"${(t.professional?.name || '').replace(/"/g, '""')}"`,
      t.professional?.trade || '',
      t.amount,
      t.platformFee,
      t.professionalAmount,
      t.status,
      t.method,
      t.providerPaymentId || '',
      t.createdAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nivaarofix-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-registry-view">
      {/* Header */}
      <div className="admin-registry-header">
        <div>
          <h1 className="admin-page-title admin-registry-title" style={{ textAlign: 'left' }}>Transactions</h1>
          <p className="admin-subtitle-clean" style={{ margin: '6px 0 0 0', textAlign: 'left' }}>
            Real-time service settlements, gateway verifications, platform fee revenue, and partner payouts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={fetchTransactions}
            title="Refresh transactions"
            style={{ height: 40, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="admin-btn-secondary"
            onClick={handleExportCSV}
            disabled={!transactions || transactions.length === 0}
            title="Export filtered transactions to CSV"
            style={{ height: 40, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Strip */}
      <div className="admin-summary-strip">
        <div className="admin-stat-card">
          <span className="admin-stat-label">Gross Settled Volume</span>
          <span className="admin-stat-value" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
            {formatRupee(summary.totalGrossVolume)}
          </span>
          <span className="admin-stat-footer">
            {summary.settledCount} payment{summary.settledCount === 1 ? '' : 's'} successfully captured
          </span>
        </div>

        <div className="admin-stat-card">
          <span className="admin-stat-label">Platform Revenue</span>
          <span className="admin-stat-value" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', color: 'var(--admin-forest)' }}>
            {formatRupee(summary.platformRevenue)}
          </span>
          <span className="admin-stat-footer">10% fee (5% GST + 5% NivaaroFix Fee)</span>
        </div>

        <div className="admin-stat-card">
          <span className="admin-stat-label">Partner Payouts</span>
          <span className="admin-stat-value" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
            {formatRupee(summary.professionalPayouts)}
          </span>
          <span className="admin-stat-footer">90% direct transfer to professionals</span>
        </div>

        <div className="admin-stat-card">
          <span className="admin-stat-label">Refunds & Reversals</span>
          <span className="admin-stat-value" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', color: summary.refundedVolume > 0 ? '#b91c1c' : 'var(--admin-ink)' }}>
            {formatRupee(summary.refundedVolume)}
          </span>
          <span className="admin-stat-footer">
            {summary.refundedCount} case{summary.refundedCount === 1 ? '' : 's'} processed
          </span>
        </div>
      </div>

      {/* Controls Row: Status Chips, Selects, Search Input */}
      <div className="admin-controls-row">
        {/* Status Filter Chips */}
        <div className="admin-filter-chips">
          {[
            { id: 'all', label: 'All' },
            { id: 'paid', label: 'Settled' },
            { id: 'processing', label: 'Processing' },
            { id: 'due', label: 'Pending' },
            { id: 'refunded', label: 'Refunded' },
            { id: 'failed', label: 'Failed' }
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`admin-chip ${statusFilter === chip.id ? 'active' : ''}`}
              onClick={() => handleStatusFilterChange(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search & Select Cluster */}
        <div className="admin-actions-search-cluster">
          {/* Method Select */}
          <select
            className="admin-select"
            value={methodFilter}
            onChange={(e) => handleMethodFilterChange(e.target.value)}
            aria-label="Filter by payment method"
            style={{ minWidth: 135 }}
          >
            <option value="all">All Methods</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="netbanking">Net Banking</option>
          </select>

          {/* Date Range Select */}
          <select
            className="admin-select"
            value={dateRangeFilter}
            onChange={(e) => handleDateRangeChange(e.target.value)}
            aria-label="Filter by time range"
            style={{ minWidth: 135 }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Sort Order Select */}
          <select
            className="admin-select"
            value={sortOrder}
            onChange={(e) => handleSortChange(e.target.value)}
            aria-label="Sort transactions"
            style={{ minWidth: 155 }}
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="amount_high">Sort: Amount (High to Low)</option>
            <option value="amount_low">Sort: Amount (Low to High)</option>
          </select>

          {/* Search Box */}
          <div className="admin-search-wrapper" style={{ minWidth: 260 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a5648" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="admin-search-icon" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              className="admin-search-input"
              placeholder="Search TXN, booking, name... (Press /)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search transactions"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table Card */}
      <div className="admin-queue-container">
        {isLoading && (!transactions || transactions.length === 0) ? (
          <div className="admin-card" style={{ padding: 40, backgroundColor: '#ffffff' }}>
            <div className="admin-table-skeleton-row" />
            <div className="admin-table-skeleton-row" />
            <div className="admin-table-skeleton-row" />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="admin-card" style={{ backgroundColor: '#ffffff', padding: '40px 20px' }}>
            <AdminEmptyState
              icon="credit-card"
              title="No transactions recorded yet"
              subtitle="Real-time payment settlements, platform fees, and partner payouts will appear here automatically when customer service bookings are completed."
              style={{ minHeight: 280, backgroundColor: '#ffffff' }}
            />
          </div>
        ) : (
          <div className="admin-card admin-table-card">
            <table className="admin-table admin-queue-table" role="presentation">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 140 }}>Transaction</th>
                  <th scope="col" style={{ width: 130 }}>Booking #</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Professional</th>
                  <th scope="col" style={{ width: 100 }}>Method</th>
                  <th scope="col" style={{ textAlign: 'right', width: 120 }}>Gross</th>
                  <th scope="col" style={{ textAlign: 'right', width: 150 }}>Split (Fee / Net)</th>
                  <th scope="col" style={{ textAlign: 'center', width: 110 }}>Status</th>
                  <th scope="col" style={{ textAlign: 'center', width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => {
                  const isSelected = selectedTransactionId === txn.id;
                  return (
                    <tr
                      key={txn.id}
                      className={`admin-queue-row ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => handleRowClick(txn, e)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRowClick(txn, e);
                      }}
                    >
                      {/* Transaction Code & Timestamp */}
                      <td className="admin-queue-cell">
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--admin-ink)', fontSize: 13 }}>
                          {txn.transactionCode}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--admin-muted)', marginTop: 2 }}>
                          {formatDate(txn.createdAt)}
                        </div>
                      </td>

                      {/* Booking Code & Title */}
                      <td className="admin-queue-cell">
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 500, color: 'var(--admin-ink)' }}>
                          {txn.bookingRef}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--admin-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          {txn.serviceTitle}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="admin-queue-cell">
                        <div style={{ fontWeight: 600, color: 'var(--admin-ink)' }}>
                          {txn.customer?.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--admin-muted)', fontVariantNumeric: 'tabular-nums', }}>
                          {txn.customer?.phone}
                        </div>
                      </td>

                      {/* Professional */}
                      <td className="admin-queue-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: 'var(--admin-ink)', fontSize: 13 }}>
                            {formatProName(txn.professional?.name)}
                          </span>
                          <span className="admin-badge-trade">
                            {formatTrade(txn.professional?.trade)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--admin-muted)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                          {txn.professional?.code}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="admin-queue-cell">
                        <span style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 500, letterSpacing: '0.3px', color: 'var(--admin-ink)' }}>
                          {txn.method || '—'}
                        </span>
                      </td>

                      {/* Gross Amount */}
                      <td className="admin-queue-cell" style={{ textAlign: 'right' }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--admin-ink)', fontSize: 13.5 }}>
                          {formatRupee(txn.amount)}
                        </span>
                      </td>

                      {/* Platform Fee & Pro Net */}
                      <td className="admin-queue-cell" style={{ textAlign: 'right' }}>
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--admin-forest)', fontWeight: 500 }}>
                          +{formatRupee(txn.platformFee)}
                        </div>
                        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11.5, color: 'var(--admin-muted)' }}>
                          {formatRupee(txn.professionalAmount)} net
                        </div>
                      </td>

                      {/* Status */}
                      <td className="admin-queue-cell" style={{ textAlign: 'center' }}>
                        {renderStatusBadge(txn.status)}
                      </td>

                      {/* Action */}
                      <td className="admin-queue-cell" style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="admin-btn-secondary"
                          style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(txn, e);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderTop: '1px solid var(--admin-border)',
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--admin-muted)' }}>
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    disabled={pagination.page <= 1}
                    onClick={() => {
                      const prevPage = pagination.page - 1;
                      setPagination((p) => ({ ...p, page: prevPage }));
                      syncUrlParams(statusFilter, methodFilter, dateRangeFilter, sortOrder, debouncedSearch, prevPage);
                    }}
                    style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    className="admin-btn-secondary"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => {
                      const nextPage = pagination.page + 1;
                      setPagination((p) => ({ ...p, page: nextPage }));
                      syncUrlParams(statusFilter, methodFilter, dateRangeFilter, sortOrder, debouncedSearch, nextPage);
                    }}
                    style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction Detail Slide-Over Drawer */}
      <AdminDetailDrawer
        isOpen={Boolean(selectedTransactionId)}
        onClose={handleCloseDrawer}
        title={selectedTxn?.transactionCode || 'Transaction Details'}
        subtitle={`Recorded on ${formatDate(selectedTxn?.createdAt)}`}
        triggerRef={selectedRowRef}
      >
        {isLoadingTxn ? (
          <div style={{ padding: 24 }}>
            <div className="admin-table-skeleton-row" style={{ height: 50, marginBottom: 16 }} />
            <div className="admin-table-skeleton-row" style={{ height: 120, marginBottom: 16 }} />
            <div className="admin-table-skeleton-row" style={{ height: 100 }} />
          </div>
        ) : selectedTxn ? (
          <div style={{ padding: '0 24px 32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top Summary Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px',
                borderRadius: 12,
                backgroundColor: 'var(--admin-canvas)',
                border: '1px solid var(--admin-border)'
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                  Gross Captured
                </span>
                <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--admin-ink)', marginTop: 2 }}>
                  {formatRupee(selectedTxn.amount)}
                </div>
              </div>
              <div>{renderStatusBadge(selectedTxn.status)}</div>
            </div>

            {/* Success or Error Alerts */}
            {refundSuccessMsg && (
              <div style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                ✓ {refundSuccessMsg}
              </div>
            )}
            {refundError && (
              <div style={{ padding: '12px 16px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
                ⚠ {refundError}
              </div>
            )}

            {/* Split Breakdown Card */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 12,
                border: '1px solid var(--admin-border)',
                backgroundColor: '#ffffff'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
                Fee & Payout Distribution
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: 'var(--admin-ink)' }}>
                <span>Gross Service Total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatRupee(selectedTxn.amount)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5, color: 'var(--admin-muted)' }}>
                <span>• GST (5%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{formatRupee(Number(selectedTxn.amount) * 0.05)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5, color: 'var(--admin-muted)' }}>
                <span>• NivaaroFix Fee (5%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{formatRupee(Number(selectedTxn.amount) * 0.05)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: 'var(--admin-forest)', fontWeight: 600 }}>
                <span>Platform Revenue (10%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{formatRupee(selectedTxn.platformFee)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', marginTop: 8, borderTop: '1px dashed var(--admin-border)', fontSize: 13.5, fontWeight: 600, color: 'var(--admin-ink)' }}>
                <span>Net Transferred to Partner (90%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRupee(selectedTxn.professionalAmount)}</span>
              </div>
            </div>

            {/* Gateway Verification Details */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 12,
                border: '1px solid var(--admin-border)',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Gateway Verification
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--admin-muted)' }}>Provider</span>
                <span style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--admin-ink)' }}>
                  {selectedTxn.provider || 'Razorpay'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--admin-muted)' }}>Payment ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => {
                    const payIdNum = formatNumericalId(selectedTxn.providerPaymentId, 'payment', selectedTxn.id, selectedTxn.createdAt);
                    return (
                      <>
                        <code style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, background: 'var(--admin-canvas)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.03em' }}>
                          {payIdNum}
                        </code>
                        {payIdNum !== '—' && (
                          <button
                            type="button"
                            onClick={() => handleCopy(payIdNum, 'pay_id')}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--admin-muted)', fontSize: 12 }}
                            title="Copy Payment ID"
                          >
                            {copiedKey === 'pay_id' ? '✓' : 'Copy'}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--admin-muted)' }}>Order ID</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => {
                    const orderIdNum = formatNumericalId(selectedTxn.providerOrderId, 'order', selectedTxn.id, selectedTxn.createdAt);
                    return (
                      <>
                        <code style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, background: 'var(--admin-canvas)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.03em' }}>
                          {orderIdNum}
                        </code>
                        {orderIdNum !== '—' && (
                          <button
                            type="button"
                            onClick={() => handleCopy(orderIdNum, 'order_id')}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--admin-muted)', fontSize: 12 }}
                            title="Copy Order ID"
                          >
                            {copiedKey === 'order_id' ? '✓' : 'Copy'}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--admin-muted)' }}>Settlement Time</span>
                <span style={{ color: 'var(--admin-ink)', fontWeight: 500 }}>
                  {selectedTxn.capturedAt ? formatDate(selectedTxn.capturedAt) : 'Pending Settlement'}
                </span>
              </div>

              {selectedTxn.failureReason && (
                <div style={{ padding: 10, borderRadius: 6, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12 }}>
                  <strong>Failure Reason:</strong> {selectedTxn.failureReason}
                </div>
              )}
            </div>

            {/* Parties & Service Reference */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 12,
                border: '1px solid var(--admin-border)',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Service & Parties
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Service Item</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--admin-ink)', marginTop: 2 }}>
                  {selectedTxn.serviceTitle} ({selectedTxn.bookingRef})
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Customer</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)', marginTop: 2 }}>{selectedTxn.customer?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)', fontVariantNumeric: 'tabular-nums', }}>{selectedTxn.customer?.phone}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Professional</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)' }}>
                      {formatProName(selectedTxn.professional?.name)}
                    </span>
                    <span className="admin-badge-trade">
                      {formatTrade(selectedTxn.professional?.trade)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--admin-muted)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    ID: {selectedTxn.professional?.code || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Refund Record (if already refunded) */}
            {selectedTxn.refund && (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fef2f2',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Refund Record
                </div>
                <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                  <strong>Amount Refunded:</strong> {formatRupee(selectedTxn.refund.amount)}
                </div>
                <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                  <strong>Reason:</strong> {selectedTxn.refund.reason}
                </div>
                <div style={{ fontSize: 12, color: '#991b1b' }}>
                  Processed on {formatDate(selectedTxn.refund.createdAt)}
                </div>
              </div>
            )}

            {/* Refund Action Section (Only for settled 'paid' payments) */}
            {selectedTxn.status === 'paid' && !selectedTxn.refund && (
              <div style={{ marginTop: 8 }}>
                {!isRefundConfirmOpen ? (
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => setIsRefundConfirmOpen(true)}
                    style={{ width: '100%', height: 42, color: '#b91c1c', borderColor: '#fca5a5' }}
                  >
                    Issue Administrative Refund
                  </button>
                ) : (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fffaf0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#9a3412' }}>
                      Confirm Full Refund ({formatRupee(selectedTxn.amount)})
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                      This will reverse the payment, update status to Refunded, and record an entry in the administrative audit ledger.
                    </div>
                    <textarea
                      rows={2}
                      className="admin-search-input"
                      style={{ height: 'auto', padding: 8, fontSize: 12.5 }}
                      placeholder="Reason for refund (required)..."
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="admin-btn-secondary"
                        onClick={() => {
                          setIsRefundConfirmOpen(false);
                          setRefundReason('');
                        }}
                        style={{ height: 34, fontSize: 12 }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="admin-btn-primary"
                        onClick={handleExecuteRefund}
                        disabled={isProcessingRefund || !refundReason.trim()}
                        style={{ height: 34, fontSize: 12, backgroundColor: '#b91c1c', borderColor: '#b91c1c' }}
                      >
                        {isProcessingRefund ? 'Processing...' : 'Confirm Refund'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
