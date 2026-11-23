import React, { useState, useEffect, useCallback } from 'react';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

function StatusDot({ status }) {
  let color = 'var(--admin-status-gray, #64748b)';
  if (['active', 'approved', 'online', 'verified'].includes(status)) {
    color = 'var(--admin-status-green, #059669)';
  } else if (['under_review', 'needs_attention', 'incomplete', 'pending', 'held'].includes(status)) {
    color = 'var(--admin-status-amber, #d97706)';
  } else if (['suspended', 'rejected', 'banned', 'inactive'].includes(status)) {
    color = 'var(--admin-status-red, #dc2626)';
  }

  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0
      }}
      aria-hidden="true"
    />
  );
}

export default function AdminCustomerDetailPage({
  customerId,
  adminUser,
  csrfToken,
  onNavigate
}) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Masked PII reveal state: { phone: unmaskedValue, email: unmaskedValue }
  const [revealedPii, setRevealedPii] = useState({});
  const [isRevealing, setIsRevealing] = useState({});
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const fetchProfile = useCallback(async (isSilent = false) => {
    if (!isSilent && !profile) setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/admin/registry/customers/${customerId}`, {
        credentials: 'include'
      });
      if (res.status === 404) {
        setError('not_found');
        return;
      }
      if (res.status === 403) {
        setError('forbidden');
        return;
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile((prev) => (fastDeepEqual(prev, data.profile) ? prev : data.profile));
      } else {
        if (!profile) setError(data.error || 'Failed to load customer profile');
      }
    } catch (err) {
      if (!profile) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [customerId, profile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchProfile,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['customer.registered', 'customers.updated']
  });

  // Masked field reveal with audit logging
  const handleReveal = async (field) => {
    if (revealedPii[field] || isRevealing[field]) return;
    setIsRevealing((prev) => ({ ...prev, [field]: true }));
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
          targetId: String(profile.id),
          field,
          reason: 'Admin inspection on customer details page'
        })
      });
      const data = await res.json();
      if (data.success && data.value) {
        setRevealedPii((prev) => ({ ...prev, [field]: data.value }));
      } else {
        showToast(data.error || `Unable to reveal ${field}`);
      }
    } catch (err) {
      showToast(`Network error revealing ${field}`);
    } finally {
      setIsRevealing((prev) => ({ ...prev, [field]: false }));
    }
  };

  // Loading skeleton state
  if (isLoading && !profile) {
    return (
      <div className="admin-page-container" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 140, height: 16, background: 'rgba(16,32,26,.06)', borderRadius: 4 }} />
          <div style={{ width: 280, height: 32, background: 'rgba(16,32,26,.08)', borderRadius: 6 }} />
          <div style={{ width: 420, height: 20, background: 'rgba(16,32,26,.06)', borderRadius: 4 }} />
          <div style={{ height: 80, background: '#ffffff', border: '1px solid rgba(16,32,26,.10)', borderRadius: 12, marginTop: 12 }} />
          <div style={{ height: 240, background: '#ffffff', border: '1px solid rgba(16,32,26,.10)', borderRadius: 12, marginTop: 12 }} />
        </div>
      </div>
    );
  }

  // Not Found State
  if (error === 'not_found' || (!profile && !isLoading)) {
    return (
      <div className="admin-page-container" style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink)', margin: '0 0 8px 0' }}>
          Customer not found
        </h1>
        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted)', margin: '0 0 24px 0' }}>
          The requested customer record does not exist or has been removed.
        </p>
        <a
          href="/admin/customers"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) onNavigate('/admin/customers');
            else window.history.back();
          }}
          className="admin-link-green"
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          ← Back to Customers
        </a>
      </div>
    );
  }

  // Forbidden State
  if (error === 'forbidden') {
    return (
      <div className="admin-page-container" style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: '#dc2626', margin: '0 0 8px 0' }}>
          Access restricted
        </h1>
        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted)', margin: '0 0 24px 0' }}>
          Your role does not have permission to view customer details.
        </p>
        <a
          href="/admin/customers"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) onNavigate('/admin/customers');
            else window.history.back();
          }}
          className="admin-link-green"
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          ← Back to Customers
        </a>
      </div>
    );
  }

  // Generic Error State
  if (error) {
    return (
      <div className="admin-page-container" style={{ padding: '48px 32px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: '#dc2626', margin: '0 0 8px 0' }}>
          Failed to load customer profile
        </h1>
        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted)', margin: '0 0 24px 0' }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={fetchProfile}
            style={{ height: 36, padding: '0 16px', borderRadius: 10, fontSize: 14, fontWeight: 500 }}
          >
            Retry
          </button>
          <a
            href="/admin/customers"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigate) onNavigate('/admin/customers');
              else window.history.back();
            }}
            className="admin-link-green"
            style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 500, padding: '0 12px' }}
          >
            ← Back to Customers
          </a>
        </div>
      </div>
    );
  }

  const customerCode = profile.customerCode || String(profile.id);
  const initials = (profile.name || 'C')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isPhoneVerified = Boolean(profile.isPhoneVerified || profile.mobileVerified);
  const accountStatus = (profile.status || 'Active').toLowerCase();

  return (
    <div
      className="admin-page-container"
      style={{
        padding: '0 0 48px 0',
        maxWidth: 1200,
        margin: '0 auto',
        minWidth: 0,
        overflowWrap: 'anywhere'
      }}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#14181f',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: '18px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Top Breadcrumb Text Link (not an outlined button) */}
      <div style={{ marginBottom: 12 }}>
        <a
          href="/admin/customers"
          onClick={(e) => {
            e.preventDefault();
            if (onNavigate) onNavigate('/admin/customers');
            else window.history.back();
          }}
          className="admin-link-green"
          style={{
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 500,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span aria-hidden="true">←</span> Customers
        </a>
      </div>

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          marginBottom: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* 64px Circle Avatar with Initials */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 600,
              flexShrink: 0
            }}
          >
            {initials}
          </div>

          <div>
            <h1
              style={{
                fontSize: 'var(--admin-type-page-title-size, 28px)',
                lineHeight: 'var(--admin-type-page-title-line, 32px)',
                fontWeight: 'var(--admin-type-page-title-weight, 600)',
                letterSpacing: 'var(--admin-type-page-title-spacing, -0.01em)',
                color: 'var(--admin-ink)',
                margin: 0
              }}
            >
              {profile.name || 'Customer'}
            </h1>
            <div
              style={{
                fontSize: 12,
                lineHeight: '16px',
                color: 'var(--admin-meta)',
                marginTop: 4
              }}
            >
              Customer · {customerCode} · Joined {profile.registeredAtFormatted || '—'}
            </div>

            {/* Plain Status Dot Items */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 8,
                fontSize: 13,
                lineHeight: '20px',
                color: 'var(--admin-ink)'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StatusDot status={accountStatus === 'suspended' ? 'suspended' : 'active'} />
                Account {accountStatus === 'suspended' ? 'suspended' : 'active'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StatusDot status={isPhoneVerified ? 'verified' : 'incomplete'} />
                {isPhoneVerified ? 'Mobile verified' : 'Mobile not verified'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Facts Section (4 equal columns separated by vertical hairlines, not 4 boxes) */}
      <section
        aria-label="Key facts"
        style={{
          background: '#ffffff',
          border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 0
        }}
      >
        <div style={{ paddingRight: 24 }}>
          <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
            Bookings completed
          </div>
          <div
            style={{
              fontSize: 16,
              lineHeight: '24px',
              fontWeight: 600,
              color: 'var(--admin-ink)',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {profile.bookingsCount || 0}
          </div>
        </div>

        <div
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            borderLeft: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))'
          }}
        >
          <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
            Mobile verification
          </div>
          <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: isPhoneVerified ? 'var(--admin-status-green)' : 'var(--admin-muted)' }}>
            {isPhoneVerified ? 'Verified' : 'Not verified'}
          </div>
        </div>

        <div
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            borderLeft: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))'
          }}
        >
          <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
            Area
          </div>
          <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink)' }}>
            {profile.area || '—'}
          </div>
        </div>

        <div
          style={{
            paddingLeft: 24,
            borderLeft: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))'
          }}
        >
          <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
            Last seen
          </div>
          <div
            style={{
              fontSize: 16,
              lineHeight: '24px',
              fontWeight: 600,
              color: 'var(--admin-ink)',
              fontVariantNumeric: 'tabular-nums',
              overflowWrap: 'break-word'
            }}
          >
            {profile.lastSeenFormatted || '—'}
          </div>
        </div>
      </section>

      {/* Two-Column Grid (at 1100px and wider: main minmax(0, 1fr), side 360px, 24px gap) */}
      <div
        className="admin-detail-two-col"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: 24,
          alignItems: 'start'
        }}
      >
        {/* Main Column */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section 1: Customer Details Definition List */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))',
              borderRadius: 12,
              padding: '24px 28px'
            }}
          >
            <h2
              style={{
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 600,
                color: 'var(--admin-ink)',
                margin: '0 0 20px 0'
              }}
            >
              Details
            </h2>

            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Name</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink)' }}>
                  {profile.name || '—'}
                </dd>
              </div>

              {/* Mobile */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Mobile</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--admin-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {revealedPii.phone || profile.phoneMasked || '—'}
                    </span>
                    {!revealedPii.phone && (
                      <button
                        type="button"
                        onClick={() => handleReveal('phone')}
                        disabled={isRevealing.phone}
                        className="admin-link-green"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: isRevealing.phone ? 'wait' : 'pointer'
                        }}
                      >
                        {isRevealing.phone ? 'Revealing...' : 'Reveal'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--admin-meta)', marginTop: 2 }}>
                    {isPhoneVerified
                      ? `Verified, ${profile.mobileVerifiedAt || profile.registeredAtFormatted || 'recently'}`
                      : 'Not verified'}
                  </div>
                </dd>
              </div>

              {/* Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Email</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--admin-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500 }}>
                      {revealedPii.email || profile.emailMasked || (profile.email ? '••••••••' : '—')}
                    </span>
                    {!revealedPii.email && profile.email && (
                      <button
                        type="button"
                        onClick={() => handleReveal('email')}
                        disabled={isRevealing.email}
                        className="admin-link-green"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: isRevealing.email ? 'wait' : 'pointer'
                        }}
                      >
                        {isRevealing.email ? 'Revealing...' : 'Reveal'}
                      </button>
                    )}
                  </div>
                </dd>
              </div>

              {/* Area */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Area</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink)' }}>
                  {profile.area || '—'}
                </dd>
              </div>

              {/* Permanent address */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Permanent address</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--admin-ink)' }}>
                  {profile.permanentAddress || 'Not provided'}
                </dd>
              </div>

              {/* Registered */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Registered</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--admin-ink)' }}>
                  {profile.registeredAtFormatted || '—'}
                </dd>
              </div>

              {/* Last seen */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', alignItems: 'baseline' }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Last seen</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--admin-ink)' }}>
                  {profile.lastSeenFormatted || '—'}
                </dd>
              </div>
            </dl>
          </section>

          {/* Section 2: Activity (Counts from stored data only; no fake links) */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))',
              borderRadius: 12,
              padding: '24px 28px'
            }}
          >
            <h2
              style={{
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 600,
                color: 'var(--admin-ink)',
                margin: '0 0 16px 0'
              }}
            >
              Activity
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 16
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(16, 32, 26, 0.02)',
                  borderRadius: 8,
                  border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))'
                }}
              >
                <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
                  Total bookings
                </div>
                <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'var(--admin-ink)' }}>
                  {profile.bookingsCount || 0}
                </div>
              </div>

              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(16, 32, 26, 0.02)',
                  borderRadius: 8,
                  border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))'
                }}
              >
                <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)', marginBottom: 4 }}>
                  Status
                </div>
                <div style={{ fontSize: 14, lineHeight: '28px', fontWeight: 500, color: 'var(--admin-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={accountStatus === 'suspended' ? 'suspended' : 'active'} />
                  {accountStatus === 'suspended' ? 'Suspended' : 'Active'}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Side Column */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Status Section */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))',
              borderRadius: 12,
              padding: '24px 24px'
            }}
          >
            <h2
              style={{
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 600,
                color: 'var(--admin-ink)',
                margin: '0 0 16px 0'
              }}
            >
              Status
            </h2>

            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Account status</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={accountStatus === 'suspended' ? 'suspended' : 'active'} />
                  {accountStatus === 'suspended' ? 'Suspended' : 'Active'}
                </dd>
                <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--admin-meta)', marginTop: 2 }}>
                  Since {profile.registeredAtFormatted || '—'}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))', paddingTop: 12 }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Last active</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink)' }}>
                  {profile.lastSeenFormatted || '—'}
                </dd>
              </div>

              <div style={{ borderTop: '1px solid var(--admin-border-hairline, rgba(16, 32, 26, 0.10))', paddingTop: 12 }}>
                <dt style={{ fontSize: 13, lineHeight: '20px', color: 'var(--admin-muted)' }}>Assigned area</dt>
                <dd style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink)' }}>
                  {profile.area || '—'}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
