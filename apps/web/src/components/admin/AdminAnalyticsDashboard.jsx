import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fastDeepEqual } from '../../hooks/useSilentRealtime';
import AdminEmptyState from './AdminEmptyState';
import AdminDateRangePicker from './AdminDateRangePicker';

/**
 * Minimalist responsive SVG Line Chart with tooltips
 */
function SvgLineChart({ data = [], lines = [], height = 220 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  // Check if all data points are 0
  const hasData = data && data.some((d) => lines.some((l) => (d[l.key] || 0) > 0));

  if (!data || data.length === 0 || !hasData) {
    return (
      <AdminEmptyState
        icon="inbox"
        title="No sign-ups in this period"
        subtitle="Activity for this date range will plot here."
        style={{ minHeight: height }}
      />
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 600;

  let maxVal = 0;
  for (const d of data) {
    for (const l of lines) {
      if (typeof d[l.key] === 'number' && d[l.key] > maxVal) {
        maxVal = d[l.key];
      }
    }
  }
  maxVal = Math.max(maxVal, 5);
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const getX = (idx) => {
    if (data.length <= 1) return padding.left + chartW / 2;
    return padding.left + (idx / (data.length - 1)) * chartW;
  };

  const getY = (val) => {
    const ratio = (val || 0) / maxVal;
    return padding.top + chartH - ratio * chartH;
  };

  return (
    <div className="admin-svg-chart-container" style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="admin-svg-chart"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e7e2d8"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#5a5648"
                
              >
                {tick}
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          if (idx === 0 || idx === Math.floor(data.length / 2) || idx === data.length - 1) {
            const x = getX(idx);
            const parts = (d.date || '').split('-');
            const label = parts.length === 3 ? `${parts[1]}/${parts[2]}` : d.date;
            return (
              <text
                key={idx}
                x={x}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#5a5648"
                
              >
                {label}
              </text>
            );
          }
          return null;
        })}

        {lines.map((l) => {
          const points = data.map((d, idx) => `${getX(idx)},${getY(d[l.key] || 0)}`).join(' ');
          return (
            <polyline
              key={l.key}
              fill="none"
              stroke={l.color}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          );
        })}

        {data.map((d, idx) => {
          const x = getX(idx);
          const isHovered = hoverIndex === idx;

          return (
            <g key={idx}>
              {isHovered && (
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="#1e3a5f"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

              {lines.map((l) => {
                const y = getY(d[l.key] || 0);
                return (
                  <circle
                    key={l.key}
                    cx={x}
                    cy={y}
                    r={isHovered ? 4.5 : 2.5}
                    fill="#ffffff"
                    stroke={l.color}
                    strokeWidth="2"
                  />
                );
              })}

              <rect
                x={x - (chartW / (data.length * 2 || 1))}
                y={0}
                width={Math.max(16, chartW / (data.length || 1))}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIndex(idx)}
              />
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="admin-chart-tooltip"
          style={{
            position: 'absolute',
            top: 10,
            left: `clamp(10%, ${(hoverIndex / (data.length - 1 || 1)) * 100}%, 85%)`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--admin-ink)' }}>
            {data[hoverIndex].date}
          </div>
          {lines.map((l) => (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
              <span style={{ color: 'var(--admin-muted)' }}>{l.label}:</span>
              <strong style={{ color: 'var(--admin-ink)' }}>{data[hoverIndex][l.key] || 0}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Minimalist Horizontal Distribution Bar
 */
function DistributionBars({ items = [], labelKey = 'label', valueKey = 'count', percentKey = 'percentage', emptyTitle = 'No data recorded yet', emptySubtitle = 'Data will display once records are logged.' }) {
  if (!items || items.length === 0) {
    return (
      <AdminEmptyState
        icon="briefcase"
        title={emptyTitle}
        subtitle={emptySubtitle}
        style={{ minHeight: 180 }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 7).map((item, i) => {
        const label = item[labelKey] || 'Unknown';
        const val = item[valueKey] || 0;
        const pct = item[percentKey] || 0;

        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 500, color: 'var(--admin-ink)' }}>{label}</span>
              <span style={{ color: 'var(--admin-muted)' }}>
                <strong style={{ color: 'var(--admin-ink)' }}>{val}</strong> ({pct}%)
              </span>
            </div>
            <div style={{ width: '100%', height: 6, background: '#f0ece3', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(pct, 2))}%`,
                  height: '100%',
                  background: 'var(--admin-forest)',
                  borderRadius: 3,
                  transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalyticsDashboard({ adminUser, onNavigate }) {
  // Read initial tab and range from URL params
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'customers' && adminUser?.role !== 'verifier') return 'customers';
    if (tab === 'professionals') return 'professionals';
    return 'overview';
  });

  const [dateRange, setDateRange] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('range') || '7d';
  });

  const [customFrom, setCustomFrom] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('from') || '';
  });

  const [customTo, setCustomTo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('to') || '';
  });

  const [showCustomRangePicker, setShowCustomRangePicker] = useState(dateRange === 'custom');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(dateRange === 'custom');

  const [overviewData, setOverviewData] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [proData, setProData] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedCustomerCategory, setSelectedCustomerCategory] = useState(null);
  const [selectedProTrade, setSelectedProTrade] = useState(null);

  const isVerifier = adminUser?.role === 'verifier';
  const isFetchingRef = useRef(false);

  // Sync tab & range to URL with replaceState
  const syncUrl = useCallback((tab, range, from, to) => {
    const params = new URLSearchParams();
    if (tab && tab !== 'overview') params.set('tab', tab);
    if (range && range !== '7d') params.set('range', range);
    if (range === 'custom') {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/admin${query}`);
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedCustomerCategory(null);
    setSelectedProTrade(null);
    syncUrl(tab, dateRange, customFrom, customTo);
  };

  const handleRangeChange = (range) => {
    setDateRange(range);
    if (range === 'custom') {
      setShowCustomRangePicker(true);
      setIsDatePickerOpen(true);
    } else {
      setShowCustomRangePicker(false);
      setIsDatePickerOpen(false);
      syncUrl(activeTab, range, '', '');
    }
  };

  const handleApplyCustomRange = () => {
    syncUrl(activeTab, 'custom', customFrom, customTo);
    fetchData();
  };

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('range', dateRange);
    if (dateRange === 'custom') {
      if (customFrom) params.set('from', customFrom);
      if (customTo) params.set('to', customTo);
    }
    return params.toString();
  }, [dateRange, customFrom, customTo]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setFetchError(null);

    try {
      if (activeTab === 'overview') {
        const res = await fetch(`/admin/analytics/overview?${queryParams}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setOverviewData(prev => (fastDeepEqual(prev, data) ? prev : data));
      } else if (activeTab === 'customers') {
        if (isVerifier) {
          isFetchingRef.current = false;
          setIsLoading(false);
          return;
        }
        const res = await fetch(`/admin/analytics/customers?${queryParams}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCustomerData(prev => (fastDeepEqual(prev, data) ? prev : data));
      } else if (activeTab === 'professionals') {
        const res = await fetch(`/admin/analytics/professionals?${queryParams}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProData(prev => (fastDeepEqual(prev, data) ? prev : data));
      }
    } catch (err) {
      console.error('Analytics load error:', err);
      setFetchError('Unable to load operations data. Please retry.');
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [activeTab, queryParams, isVerifier]);

  // Initial fetch and on query change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Silent automatic refresh: refetch on tab focus and every 60 seconds (no visible indicators)
  useEffect(() => {
    const onFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', onFocus);

    const interval = setInterval(() => {
      fetchData();
    }, 60000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [fetchData]);

  return (
    <div className="admin-analytics-view">
      {/* Page Header (Operations) */}
      <div className="admin-analytics-header">
        <div>
          <h1 className="admin-page-title admin-analytics-title">Operations</h1>
        </div>
      </div>

      {/* Tabs & Range Bar (Underline Tabs) */}
      <div className="admin-analytics-subnav">
        <div className="admin-tabs-row" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`admin-tab-btn admin-pill-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            <span>Overview</span>
          </button>

          {!isVerifier && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'customers'}
              className={`admin-tab-btn admin-pill-tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => handleTabChange('customers')}
            >
              <span>Customers</span>
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'professionals'}
            className={`admin-tab-btn admin-pill-tab ${activeTab === 'professionals' ? 'active' : ''}`}
            onClick={() => handleTabChange('professionals')}
          >
            <span>Professionals</span>
          </button>
        </div>

        {/* Date Range Selector Chips */}
        <div className="admin-range-selector">
          <div className="admin-range-chips" role="group" aria-label="Date range selection">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: '7 days' },
              { id: '30d', label: '30 days' },
              { id: 'custom', label: 'Custom' }
            ].map((rng) => (
              <button
                key={rng.id}
                type="button"
                className={`admin-chip admin-range-pill ${dateRange === rng.id ? 'active' : ''}`}
                onClick={() => handleRangeChange(rng.id)}
              >
                {rng.label}
              </button>
            ))}
          </div>

          {showCustomRangePicker && (
            <AdminDateRangePicker
              startDate={customFrom}
              endDate={customTo}
              isOpen={isDatePickerOpen}
              onToggle={() => setIsDatePickerOpen((prev) => !prev)}
              onClose={() => setIsDatePickerOpen(false)}
              onApply={(from, to) => {
                setCustomFrom(from);
                setCustomTo(to);
                syncUrl(activeTab, 'custom', from, to);
                fetchData();
              }}
            />
          )}
        </div>
      </div>

      {fetchError && (
        <div className="admin-error-card" role="alert">
          <div>{fetchError}</div>
          <button type="button" className="admin-btn-secondary" onClick={fetchData}>
            Retry
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && overviewData && (
        <div className="admin-analytics-content">
          {/* 4 Headline KPI Cards (Clean, Clickable, No Corner Badges) */}
          <div className="admin-stats-grid">
            {/* Card 1: Customers */}
            <div
              className="admin-stat-card"
              onClick={() => onNavigate('/admin/customers')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('/admin/customers'); }}
              title="View Customer Registry"
            >
              <div className="admin-stat-label">Customers</div>
              <div className="admin-stat-value">{overviewData.customers?.total || 0}</div>
              <div className="admin-stat-footer">
                +{overviewData.customers?.today || 0} today · +{overviewData.customers?.last7d || 0} this week
              </div>
            </div>

            {/* Card 2: Professionals */}
            <div
              className="admin-stat-card"
              onClick={() => onNavigate('/admin/approvals')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('/admin/approvals'); }}
              title="View Verification Queue"
            >
              <div className="admin-stat-label">Professionals</div>
              <div className="admin-stat-value">{overviewData.professionals?.total || 0}</div>
              <div className="admin-stat-footer">
                {overviewData.professionals?.verified || 0} verified · {overviewData.professionals?.pending || 0} pending
              </div>
            </div>

            {/* Card 3: Jobs */}
            <div
              className="admin-stat-card"
              onClick={() => onNavigate('/admin')}
              role="button"
              tabIndex={0}
              title="Jobs Overview"
            >
              <div className="admin-stat-label">Jobs</div>
              <div className="admin-stat-value">{overviewData.bookings?.total || 0}</div>
              <div className="admin-stat-footer">
                {overviewData.bookings?.inProgress || 0} active · {overviewData.bookings?.completed || 0} completed
              </div>
            </div>

            {/* Card 4: Online now */}
            <div
              className="admin-stat-card"
              onClick={() => onNavigate('/admin/professionals?status=active')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('/admin/professionals?status=active'); }}
              title="View Active Professionals"
            >
              <div className="admin-stat-label">Online now</div>
              <div className="admin-stat-value">{overviewData.professionals?.active || 0}</div>
              <div className="admin-stat-footer">
                {overviewData.professionals?.inactive || 0} offline · {overviewData.professionals?.suspended || 0} suspended
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="admin-charts-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Registration Trends</h3>
                </div>
                <div className="admin-chart-legend">
                  <div className="legend-item">
                    <span style={{ background: 'var(--admin-forest)' }} /> Customers
                  </div>
                  <div className="legend-item">
                    <span style={{ background: 'var(--admin-navy)' }} /> Professionals
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <SvgLineChart
                  data={overviewData.timeline || []}
                  lines={[
                    { key: 'customers', label: 'Customers', color: '#0f4d3c' },
                    { key: 'professionals', label: 'Professionals', color: '#1e3a5f' }
                  ]}
                  height={220}
                />
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Service Categories</h3>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                {overviewData.categories && overviewData.categories.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {overviewData.categories.slice(0, 6).map((cat, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderBottom: '1px solid var(--admin-border-subtle)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 500, color: 'var(--admin-ink)' }}>{cat.category}</span>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                          <span style={{ color: 'var(--admin-forest)', fontWeight: 600 }}>{cat.demandCount} requests</span>
                          <span style={{ color: 'var(--admin-muted)' }}>{cat.activePros} pros</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <AdminEmptyState
                    icon="briefcase"
                    title="No bookings yet"
                    subtitle="Categories rank here once jobs come in."
                    style={{ minHeight: 180 }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CUSTOMERS */}
      {/* ===================================================================== */}
      {activeTab === 'customers' && !isVerifier && customerData && (
        <div className="admin-analytics-content">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total registered</div>
              <div className="admin-stat-value">{customerData.summary?.total || 0}</div>
              <div className="admin-stat-footer">
                +{customerData.summary?.today || 0} today · +{customerData.summary?.last_7d || 0} this week
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Active accounts</div>
              <div className="admin-stat-value">{customerData.summary?.active || 0}</div>
              <div className="admin-stat-footer">
                {customerData.summary?.inactive || 0} suspended or deactivated
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Unique customers</div>
              <div className="admin-stat-value">{customerData.totalUniqueCustomers || 0}</div>
              <div className="admin-stat-footer">
                With at least one booking
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Service categories</div>
              <div className="admin-stat-value">{customerData.categoryDistribution?.length || 0}</div>
              <div className="admin-stat-footer">
                Active service trades
              </div>
            </div>
          </div>

          <div className="admin-charts-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Customer Registrations</h3>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <SvgLineChart
                  data={customerData.registrationTrend || []}
                  lines={[{ key: 'count', label: 'Registrations', color: '#0f4d3c' }]}
                  height={220}
                />
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Customers by Service Category</h3>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <DistributionBars
                  items={customerData.categoryDistribution || []}
                  labelKey="category"
                  valueKey="customerCount"
                  percentKey="percentage"
                  emptyTitle="No bookings yet"
                  emptySubtitle="Categories rank here once jobs come in."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PROFESSIONALS */}
      {/* ===================================================================== */}
      {activeTab === 'professionals' && proData && (
        <div className="admin-analytics-content">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total registered</div>
              <div className="admin-stat-value">{proData.summary?.total || 0}</div>
              <div className="admin-stat-footer">
                +{proData.summary?.today || 0} today · +{proData.summary?.last_7d || 0} this week
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Verified & active</div>
              <div className="admin-stat-value">{proData.summary?.verified || 0}</div>
              <div className="admin-stat-footer">
                {proData.summary?.online_now || 0} currently online
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Pending verification</div>
              <div className="admin-stat-value">{proData.summary?.pending || 0}</div>
              <div className="admin-stat-footer">
                {proData.summary?.rejected || 0} rejected · {proData.summary?.suspended || 0} suspended
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-label">Service trades</div>
              <div className="admin-stat-value">{proData.tradeDistribution?.length || 0}</div>
              <div className="admin-stat-footer">
                Active skill specializations
              </div>
            </div>
          </div>

          <div className="admin-charts-grid">
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Professional Registrations & Approvals</h3>
                </div>
                <div className="admin-chart-legend">
                  <div className="legend-item">
                    <span style={{ background: 'var(--admin-forest)' }} /> Submissions
                  </div>
                  <div className="legend-item">
                    <span style={{ background: 'var(--admin-navy)' }} /> Approved
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <SvgLineChart
                  data={proData.trend || []}
                  lines={[
                    { key: 'registered', label: 'Registered', color: '#0f4d3c' },
                    { key: 'approved', label: 'Approved', color: '#1e3a5f' }
                  ]}
                  height={220}
                />
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Professionals by Trade</h3>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <DistributionBars
                  items={proData.tradeDistribution || []}
                  labelKey="trade"
                  valueKey="proCount"
                  percentKey="percentage"
                  emptyTitle="No registered pros in this period"
                  emptySubtitle="Trades populate as professionals register."
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
