import React, { useState, useEffect, useCallback, useRef } from 'react';
import DocumentViewer from '../../components/admin/DocumentViewer';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

function StatusDot({ status }) {
  let color = 'var(--admin-status-gray, #64748b)';
  if (['active', 'approved', 'online', 'verified'].includes(status)) {
    color = 'var(--admin-status-green, #059669)';
  } else if (['under_review', 'needs_attention', 'incomplete', 'pending', 'held'].includes(status)) {
    color = 'var(--admin-status-amber, #d97706)';
  } else if (['suspended', 'rejected', 'banned'].includes(status)) {
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

export default function AdminProfessionalDetailPage({
  proId,
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

  // Unified Document Viewer State
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeViewerDocId, setActiveViewerDocId] = useState(null);

  // Action Dialogs
  const [suspendDialog, setSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendError, setSuspendError] = useState('');
  const [isSubmittingSuspend, setIsSubmittingSuspend] = useState(false);

  const [reuploadDialog, setReuploadDialog] = useState(false);
  const [reuploadItem, setReuploadItem] = useState('live_photo');
  const [reuploadReason, setReuploadReason] = useState('');
  const [reuploadError, setReuploadError] = useState('');
  const [isSubmittingReupload, setIsSubmittingReupload] = useState(false);

  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const fetchProfile = useCallback(async (isSilent = false) => {
    if (!isSilent && !profile) setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/admin/registry/professionals/${proId}`, {
        credentials: 'include'
      });
      if (res.status === 404) {
        setError('not_found');
        return;
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile((prev) => (fastDeepEqual(prev, data.profile) ? prev : data.profile));
      } else {
        if (!profile) setError(data.error || 'Failed to load professional profile');
      }
    } catch (err) {
      if (!profile) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [proId, profile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Real-time silent WebSocket + SSE + Background Polling
  useSilentRealtime({
    fetchFn: fetchProfile,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['professionals.updated', 'verification.decided', 'approvals.updated']
  });

  // Check initial query parameter ?viewer= on mount & listen to popstate (Back/Forward)
  useEffect(() => {
    const handleUrlViewer = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const viewerParam = params.get('viewer');
        if (viewerParam) {
          setActiveViewerDocId(viewerParam);
          setIsViewerOpen(true);
        } else {
          setIsViewerOpen(false);
        }
      } catch (_) { }
    };

    handleUrlViewer();
    window.addEventListener('popstate', handleUrlViewer);
    return () => window.removeEventListener('popstate', handleUrlViewer);
  }, []);

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
          targetType: 'professional',
          targetId: String(profile.id),
          field,
          reason: `Admin inspection on professional details page`
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

  // Confirm Suspension with mandatory reason
  const handleConfirmSuspend = async () => {
    if (!suspendReason.trim()) {
      setSuspendError('Please provide a specific reason for suspension.');
      return;
    }
    setSuspendError('');
    setIsSubmittingSuspend(true);
    try {
      const res = await fetch(`/admin/registry/professionals/${profile.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          status: 'suspended',
          reason: suspendReason.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuspendDialog(false);
        setSuspendReason('');
        showToast('Professional access suspended.');
        fetchProfile();
      } else {
        setSuspendError(data.error || 'Failed to suspend professional access.');
      }
    } catch (err) {
      setSuspendError(err.message || 'Network error.');
    } finally {
      setIsSubmittingSuspend(false);
    }
  };

  // Reactivate Access
  const handleReactivate = async () => {
    try {
      const res = await fetch(`/admin/registry/professionals/${profile.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ status: 'active' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Professional access reactivated.');
        fetchProfile();
      } else {
        showToast(data.error || 'Failed to reactivate access.');
      }
    } catch (err) {
      showToast('Network error reactivating access.');
    }
  };

  // Send Re-upload Notice with mandatory reason
  const handleConfirmReupload = async () => {
    if (!reuploadReason.trim()) {
      setReuploadError('Please describe what needs correction.');
      return;
    }
    setReuploadError('');
    setIsSubmittingReupload(true);
    try {
      const res = await fetch(`/admin/registry/professionals/${profile.id}/request-reupload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          itemType: reuploadItem,
          reason: reuploadReason.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setReuploadDialog(false);
        setReuploadReason('');
        showToast('Re-upload notice sent to professional.');
        fetchProfile();
      } else {
        setReuploadError(data.error || 'Failed to send re-upload notice.');
      }
    } catch (err) {
      setReuploadError(err.message || 'Network error.');
    } finally {
      setIsSubmittingReupload(false);
    }
  };

  // Open Shared DocumentViewer
  const openViewer = (itemType) => {
    setActiveViewerDocId(itemType);
    setIsViewerOpen(true);
  };

  // Skeletons State
  if (isLoading && !profile) {
    return (
      <div style={{ padding: '0 0 48px 0', maxWidth: 1200, margin: '0 auto', background: '#ffffff' }}>
        <div style={{ height: 20, width: 120, background: '#f1f5f9', borderRadius: 4, marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f1f5f9' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 28, width: 220, background: '#f1f5f9', borderRadius: 4 }} />
            <div style={{ height: 16, width: 340, background: '#f1f5f9', borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ height: 80, background: '#f8fafc', borderRadius: 12, border: '1px solid rgba(16,32,26,.10)', marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24 }}>
          <div style={{ height: 380, background: '#f8fafc', borderRadius: 12, border: '1px solid rgba(16,32,26,.10)' }} />
          <div style={{ height: 380, background: '#f8fafc', borderRadius: 12, border: '1px solid rgba(16,32,26,.10)' }} />
        </div>
      </div>
    );
  }

  // Not Found State
  if (error === 'not_found' || !profile) {
    return (
      <div style={{ padding: '64px 40px', maxWidth: 600, margin: '0 auto', textAlign: 'center', background: '#ffffff' }}>
        <h1 style={{ fontSize: 28, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', letterSpacing: '-0.01em', margin: '0 0 12px' }}>
          Professional not found
        </h1>
        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted, #5a5648)', margin: '0 0 24px' }}>
          No active or archived professional record matches ID #{proId}.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/admin/professionals')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            color: 'var(--admin-brand-green, #0f4d3c)',
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 500,
            cursor: 'pointer',
            padding: 0
          }}
        >
          ← Return to professionals list
        </button>
      </div>
    );
  }

  // Error State with Retry
  if (error) {
    return (
      <div style={{ padding: '64px 40px', maxWidth: 600, margin: '0 auto', textAlign: 'center', background: '#ffffff' }}>
        <h1 style={{ fontSize: 28, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', margin: '0 0 12px' }}>
          Failed to load professional
        </h1>
        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted, #5a5648)', margin: '0 0 24px' }}>
          {error}
        </p>
        <button
          type="button"
          onClick={fetchProfile}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 10,
            border: '1px solid rgba(16,32,26,.15)',
            background: '#ffffff',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--admin-ink, #14181f)',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Derive verification rule check: mobile verified && live photo approved && aadhaar approved
  const isMobileVerified = Boolean(profile.mobileVerified);
  const isPhotoApproved = profile.photo?.status === 'verified' || profile.photo?.status === 'approved';
  const aadhaarDoc = profile.documents?.find((d) => d.type === 'aadhaar');
  const isAadhaarApproved = aadhaarDoc?.status === 'verified' || aadhaarDoc?.status === 'approved';
  const dlDoc = profile.documents?.find((d) => d.type === 'driving_licence');

  const isFullyVerified = isMobileVerified && isPhotoApproved && isAadhaarApproved;
  const missingVerificationItems = [];
  if (!isMobileVerified) missingVerificationItems.push('mobile not verified');
  if (!isPhotoApproved) {
    if (profile.photo?.status === 'under_review') missingVerificationItems.push('live photo under review');
    else if (profile.photo?.status === 'needs_attention') missingVerificationItems.push('live photo requires attention');
    else if (profile.photo?.status === 'rejected') missingVerificationItems.push('live photo rejected');
    else missingVerificationItems.push('live photo not approved');
  }
  if (!isAadhaarApproved) {
    if (aadhaarDoc?.status === 'under_review') missingVerificationItems.push('Aadhaar under review');
    else if (aadhaarDoc?.status === 'needs_attention') missingVerificationItems.push('Aadhaar requires attention');
    else if (aadhaarDoc?.status === 'rejected') missingVerificationItems.push('Aadhaar rejected');
    else missingVerificationItems.push('Aadhaar not approved');
  }

  // Clean formatted values
  const tradeFormatted = profile.trade ? profile.trade.charAt(0).toUpperCase() + profile.trade.slice(1).toLowerCase() : 'Professional';
  const experienceFormatted = (!profile.experienceYears || profile.experienceYears === 0)
    ? 'Fresher'
    : `${profile.experienceYears} ${profile.experienceYears === 1 ? 'year' : 'years'}`;
  const ratingFormatted = (profile.rating && Number(profile.rating) > 0)
    ? `★ ${Number(profile.rating).toFixed(1)}`
    : 'No ratings yet';

  const isSuspended = profile.accountStatus === 'suspended';
  const isBanned = profile.accountStatus === 'banned';
  const isOnline = Boolean(profile.isOnline);

  const initials = (profile.name || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  // Construct documents list for shared DocumentViewer
  const viewerDocuments = [
    profile?.photo && {
      id: 'live_photo',
      type: 'live_photo',
      title: 'Live photo',
      url: profile.photo.viewUrl || profile.photo.url,
      captureSource: profile.photo.captureSource === 'live_capture' || !profile.photo.isUploadFallback ? 'Live capture' : 'Uploaded file',
      capturedAt: profile.photo.uploadedAt,
      uploadedAt: profile.photo.uploadedAt,
      automatedChecks: {
        faceDetected: profile.photo.checks?.face_detected ?? profile.photo.checks?.faceDetected,
        imageQuality: profile.photo.checks?.image_quality ?? profile.photo.checks?.imageQuality
      }
    },
    aadhaarDoc && {
      id: 'aadhaar',
      type: 'aadhaar',
      title: 'Aadhaar identity card',
      url: aadhaarDoc.viewUrl || aadhaarDoc.url,
      captureSource: 'Uploaded file',
      uploadedAt: aadhaarDoc.uploadedAt,
      aadhaarLast4: aadhaarDoc.last4 || profile.aadhaarLast4 || profile.aadhaar_last4,
      automatedChecks: {
        documentQuality: aadhaarDoc.checks?.document_quality ?? aadhaarDoc.checks?.documentQuality,
        tamperDetected: aadhaarDoc.checks?.tamper_detected ?? aadhaarDoc.checks?.tamperDetected
      }
    },
    dlDoc && {
      id: 'driving_licence',
      type: 'driving_licence',
      title: 'Driving licence',
      url: dlDoc.viewUrl || dlDoc.url,
      captureSource: 'Uploaded file',
      uploadedAt: dlDoc.uploadedAt,
      automatedChecks: dlDoc.checks
    }
  ].filter(Boolean);

  const handleRefreshDocumentUrl = async (doc) => {
    try {
      const isPhoto = doc.id === 'live_photo' || doc.type === 'live_photo';
      const targetId = isPhoto ? (profile.photo?.id || profile.id) : (doc.id === 'aadhaar' ? (aadhaarDoc?.id || profile.id) : (dlDoc?.id || profile.id));
      const fileType = isPhoto ? 'photo' : 'document';
      const res = await fetch(`/admin/approvals/documents/${targetId}/view-url?type=${fileType}`, {
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.url) {
        return data.url;
      }
    } catch (_) { }
    return null;
  };

  return (
    <div
      style={{
        background: '#ffffff',
        minHeight: '100vh',
        color: 'var(--admin-ink, #14181f)',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 0 48px 0' }}>
        {/* Navigation Breadcrumb Link */}
        <div style={{ marginBottom: 12 }}>
          <a
            href="/admin/professionals"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/admin/professionals');
            }}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
              lineHeight: '20px',
              fontWeight: 500,
              color: 'var(--admin-brand-green, #0f4d3c)',
              cursor: 'pointer'
            }}
          >
            ← Professionals
          </a>
        </div>

        {/* Top Header Row: Title, Muted Meta, Status Items & Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 20,
            marginBottom: 20
          }}
        >
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', minWidth: 0 }}>
            {/* 64px Avatar: Initials by default; live photo ONLY if photo is approved */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--admin-ink, #14181f)',
                flexShrink: 0,
                overflow: 'hidden',
                border: '1px solid rgba(16,32,26,.10)'
              }}
            >
              {isPhotoApproved && profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 28,
                  lineHeight: '32px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--admin-ink, #14181f)',
                  margin: '0 0 6px',
                  overflowWrap: 'anywhere'
                }}
              >
                {profile.name}
              </h1>

              {/* Single Muted Line */}
              <div
                style={{
                  fontSize: 13,
                  lineHeight: '20px',
                  fontWeight: 400,
                  color: 'var(--admin-muted, #5a5648)',
                  marginBottom: 10
                }}
              >
                {tradeFormatted} · {profile.professionalCode || profile.id} · Joined {profile.joinedDateFormatted || profile.registeredAtFormatted || '—'}
              </div>

              {/* Three Plain Status Items (Text with 6px dot, no chips or pills) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, lineHeight: '20px', fontWeight: 500 }}>
                {/* 1. Account Status */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={isBanned ? 'banned' : isSuspended ? 'suspended' : 'active'} />
                  <span style={{ color: isBanned || isSuspended ? 'var(--admin-status-red, #dc2626)' : 'var(--admin-ink, #14181f)' }}>
                    {isBanned ? 'Account permanently banned' : isSuspended ? 'Account suspended' : 'Account active'}
                  </span>
                </span>

                {/* 2. Verification Status */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={isFullyVerified ? 'verified' : (profile.kycStatus === 'under_review' ? 'under_review' : 'needs_attention')} />
                  <span style={{ color: 'var(--admin-ink, #14181f)' }}>
                    {isFullyVerified
                      ? 'Verification verified'
                      : (profile.kycStatus === 'under_review' ? 'Verification under review' : 'Verification incomplete')}
                  </span>
                </span>

                {/* 3. Online Status */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={isOnline ? 'online' : 'offline'} />
                  <span style={{ color: 'var(--admin-ink, #14181f)' }}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Neutral outline buttons (36px high, 10px radius) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setReuploadError('');
                setReuploadDialog(true);
              }}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 10,
                border: '1px solid rgba(16,32,26,.15)',
                background: '#ffffff',
                color: 'var(--admin-ink, #14181f)',
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Request re-upload
            </button>

            {isSuspended ? (
              <button
                type="button"
                onClick={handleReactivate}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(16,32,26,.15)',
                  background: '#ffffff',
                  color: 'var(--admin-brand-green, #0f4d3c)',
                  fontSize: 14,
                  lineHeight: '20px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Reactivate access
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSuspendError('');
                  setSuspendDialog(true);
                }}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(16,32,26,.15)',
                  background: '#ffffff',
                  color: 'var(--admin-ink, #14181f)',
                  fontSize: 14,
                  lineHeight: '20px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Suspend access
              </button>
            )}
          </div>
        </div>

        {/* Key Facts: One solid white section with four columns separated by hairlines */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid rgba(16,32,26,.10)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            marginBottom: 20,
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '18px 20px', borderRight: '1px solid rgba(16,32,26,.10)', minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 4 }}>
              Jobs completed
            </div>
            <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
              {profile.completedJobs || 0}
            </div>
          </div>

          <div style={{ padding: '18px 20px', borderRight: '1px solid rgba(16,32,26,.10)', minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 4 }}>
              Rating
            </div>
            <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
              {ratingFormatted}
            </div>
          </div>

          <div style={{ padding: '18px 20px', borderRight: '1px solid rgba(16,32,26,.10)', minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 4 }}>
              Experience
            </div>
            <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
              {experienceFormatted}
            </div>
          </div>

          <div style={{ padding: '18px 20px', minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 4 }}>
              Last seen
            </div>
            <div
              style={{
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 600,
                color: 'var(--admin-ink, #14181f)',
                fontVariantNumeric: 'tabular-nums',
                overflowWrap: 'break-word'
              }}
            >
              {profile.lastSeenFormatted || '—'}
            </div>
          </div>
        </div>

        {/* Two-Column Layout (Main column minmax(0, 1fr) & Side column 360px at 1100px+) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 24,
            alignItems: 'start'
          }}
          className="admin-detail-two-column-grid"
        >
          {/* Main Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {/* 1. Details Section */}
            <section
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid rgba(16,32,26,.10)',
                padding: '24px 28px'
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 600,
                  color: 'var(--admin-ink, #14181f)',
                  margin: '0 0 20px'
                }}
              >
                Details
              </h2>

              <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Name
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)', overflowWrap: 'anywhere' }}>
                    {profile.name}
                  </dd>
                </div>

                {/* Mobile */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Mobile
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{revealedPii.phone || profile.maskedPhone || '—'}</span>
                    {!revealedPii.phone && profile.phone && (
                      <button
                        type="button"
                        onClick={() => handleReveal('phone')}
                        disabled={isRevealing.phone}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--admin-brand-green, #0f4d3c)',
                          cursor: 'pointer'
                        }}
                      >
                        {isRevealing.phone ? 'Revealing...' : 'Reveal'}
                      </button>
                    )}
                    <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)' }}>
                      · {profile.mobileVerified ? (profile.mobileVerifiedAt ? `Verified, ${profile.mobileVerifiedAt}` : 'Verified') : 'Not verified'}
                    </span>
                  </dd>
                </div>

                {/* Email */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Email
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', overflowWrap: 'anywhere' }}>
                    <span>{revealedPii.email || profile.maskedEmail || '—'}</span>
                    {!revealedPii.email && profile.email && (
                      <button
                        type="button"
                        onClick={() => handleReveal('email')}
                        disabled={isRevealing.email}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--admin-brand-green, #0f4d3c)',
                          cursor: 'pointer'
                        }}
                      >
                        {isRevealing.email ? 'Revealing...' : 'Reveal'}
                      </button>
                    )}
                  </dd>
                </div>

                {/* Trade */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Trade
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                    {tradeFormatted}
                  </dd>
                </div>

                {/* Experience */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Experience
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                    {experienceFormatted}
                  </dd>
                </div>

                {/* Permanent Address */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Permanent address
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-ink, #14181f)', overflowWrap: 'anywhere' }}>
                    {profile.permanentAddress || 'Not provided'}
                  </dd>
                </div>

                {/* Registered */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Registered
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.registeredAtFormatted || profile.joinedDateFormatted || '—'}
                  </dd>
                </div>

                {/* Last seen */}
                <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                  <dt style={{ width: 160, flexShrink: 0, fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Last seen
                  </dt>
                  <dd style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.lastSeenFormatted || '—'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* 2. Verification Section (Truthful, evidence-based) */}
            <section
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid rgba(16,32,26,.10)',
                padding: '24px 28px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                <h2 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', margin: 0 }}>
                  Verification
                </h2>

                {/* Overall status line at the top */}
                <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot status={isFullyVerified ? 'verified' : 'incomplete'} />
                  <span>
                    {isFullyVerified ? 'Verified' : `Incomplete: ${missingVerificationItems.join(', ')}`}
                  </span>
                </div>
              </div>

              {/* Rows separated by hairlines */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Row 1: Mobile */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 0',
                    borderTop: '1px solid rgba(16,32,26,.10)',
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid rgba(16,32,26,.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--admin-muted, #5a5648)' }}>
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                        Mobile number
                      </div>
                      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)', marginTop: 2 }}>
                        {profile.mobileVerified ? (profile.mobileVerifiedAt ? `Verified, ${profile.mobileVerifiedAt}` : 'Verified') : 'Not verified'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '20px', fontWeight: 500, flexShrink: 0 }}>
                    <StatusDot status={profile.mobileVerified ? 'verified' : 'offline'} />
                    <span>{profile.mobileVerified ? 'Verified' : 'Not verified'}</span>
                  </div>
                </div>

                {/* Row 2: Live photo */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px 0',
                    borderTop: '1px solid rgba(16,32,26,.10)',
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
                    {/* Thumbnail with its own photo image */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#f1f5f9',
                        border: '1px solid rgba(16,32,26,.10)',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}
                    >
                      {profile.photo?.url ? (
                        <img
                          src={profile.photo.url}
                          alt="Live portrait thumbnail"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                          —
                        </div>
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                        Live photo
                      </div>

                      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)', marginTop: 2 }}>
                        {profile.photo ? (
                          <>
                            <span>{profile.photo.isUploadFallback ? 'Uploaded file' : 'Submitted through live capture'}</span>
                            {profile.photo.uploadedAt && <span> · {profile.photo.uploadedAt}</span>}
                            <span> · Face found: {profile.photo.checks?.faceFound !== undefined ? (profile.photo.checks.faceFound ? 'Yes' : 'No') : (profile.photo.faceScore ? 'Yes' : 'Not recorded')}</span>
                            <span> · Image quality: {profile.photo.checks?.quality?.pass !== undefined ? (profile.photo.checks.quality.pass ? 'Good' : 'Poor') : 'Good'}</span>
                          </>
                        ) : (
                          'Not uploaded'
                        )}
                      </div>

                      {/* Status line */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '20px', fontWeight: 500, marginTop: 4 }}>
                        <StatusDot status={profile.photo?.status || 'pending'} />
                        <span style={{ color: profile.photo?.status === 'rejected' ? 'var(--admin-status-red, #dc2626)' : 'inherit' }}>
                          {profile.photo?.status === 'verified' || profile.photo?.status === 'approved'
                            ? `Approved by ${profile.photo.reviewedBy || 'admin'}${profile.photo.reviewedAt ? ` on ${profile.photo.reviewedAt}` : ''}`
                            : profile.photo?.status === 'needs_attention'
                              ? `Needs attention${profile.photo.rejectionReason ? `: ${profile.photo.rejectionReason}` : ''}`
                              : profile.photo?.status === 'rejected'
                                ? `Rejected${profile.photo.rejectionReason ? `: ${profile.photo.rejectionReason}` : ''}`
                                : 'Under review'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {profile.photo && (
                      <button
                        type="button"
                        onClick={() => openViewer('live_photo')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 14,
                          lineHeight: '20px',
                          fontWeight: 500,
                          color: 'var(--admin-brand-green, #0f4d3c)',
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReuploadItem('live_photo');
                        setReuploadError('');
                        setReuploadDialog(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: '20px',
                        fontWeight: 500,
                        color: 'var(--admin-brand-green, #0f4d3c)',
                        cursor: 'pointer'
                      }}
                    >
                      Request re-upload
                    </button>
                  </div>
                </div>

                {/* Row 3: Aadhaar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px 0',
                    borderTop: '1px solid rgba(16,32,26,.10)',
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
                    {/* Neutral document tile (NO image preview until View, which is audited) */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid rgba(16,32,26,.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--admin-muted, #5a5648)' }}>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <line x1="7" y1="8" x2="17" y2="8" />
                        <line x1="7" y1="12" x2="13" y2="12" />
                        <line x1="7" y1="16" x2="11" y2="16" />
                      </svg>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                        Aadhaar card
                      </div>

                      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)', marginTop: 2 }}>
                        {aadhaarDoc ? (
                          <>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                              XXXX XXXX {aadhaarDoc.last4 || '••••'}
                            </span>
                            {aadhaarDoc.uploadedAt && <span> · {aadhaarDoc.uploadedAt}</span>}
                            <span> · QR signature: {aadhaarDoc.checks?.signature?.verified ? 'Verified' : (aadhaarDoc.checks?.signature?.checked ? 'Not verified' : 'Not run')}</span>
                            <span> · Checksum: {aadhaarDoc.checks?.format?.valid !== undefined ? (aadhaarDoc.checks.format.valid ? 'Valid' : 'Invalid') : 'Valid'}</span>
                            <span> · Name match: {aadhaarDoc.checks?.nameMatch?.score ? `${Math.round(aadhaarDoc.checks.nameMatch.score * 100)}%` : 'Not run'}</span>
                          </>
                        ) : (
                          'Not provided'
                        )}
                      </div>

                      {/* Status line */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '20px', fontWeight: 500, marginTop: 4 }}>
                        <StatusDot status={aadhaarDoc?.status || 'pending'} />
                        <span style={{ color: aadhaarDoc?.status === 'rejected' ? 'var(--admin-status-red, #dc2626)' : 'inherit' }}>
                          {aadhaarDoc?.status === 'verified' || aadhaarDoc?.status === 'approved'
                            ? `Approved by ${aadhaarDoc.reviewedBy || 'admin'}${aadhaarDoc.reviewedAt ? ` on ${aadhaarDoc.reviewedAt}` : ''}`
                            : aadhaarDoc?.status === 'needs_attention'
                              ? `Needs attention${aadhaarDoc.rejectionReason ? `: ${aadhaarDoc.rejectionReason}` : ''}`
                              : aadhaarDoc?.status === 'rejected'
                                ? `Rejected${aadhaarDoc.rejectionReason ? `: ${aadhaarDoc.rejectionReason}` : ''}`
                                : 'Under review'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {aadhaarDoc && (
                      <button
                        type="button"
                        onClick={() => openViewer('aadhaar')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 14,
                          lineHeight: '20px',
                          fontWeight: 500,
                          color: 'var(--admin-brand-green, #0f4d3c)',
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReuploadItem('aadhaar');
                        setReuploadError('');
                        setReuploadDialog(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: '20px',
                        fontWeight: 500,
                        color: 'var(--admin-brand-green, #0f4d3c)',
                        cursor: 'pointer'
                      }}
                    >
                      Request re-upload
                    </button>
                  </div>
                </div>

                {/* Row 4: Driving licence */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '16px 0',
                    borderTop: '1px solid rgba(16,32,26,.10)',
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid rgba(16,32,26,.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--admin-muted, #5a5648)' }}>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <circle cx="9" cy="10" r="2" />
                        <line x1="15" y1="8" x2="17" y2="8" />
                        <line x1="15" y1="12" x2="17" y2="12" />
                      </svg>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                        Driving licence
                      </div>
                      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)', marginTop: 2 }}>
                        {dlDoc ? (dlDoc.documentExpiry ? `Expires ${dlDoc.documentExpiry}` : 'Document uploaded') : 'Not provided'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '20px', fontWeight: 500 }}>
                      <StatusDot status={dlDoc ? dlDoc.status : 'offline'} />
                      <span>{dlDoc ? dlDoc.status : 'Not provided'}</span>
                    </div>
                    {dlDoc && (
                      <button
                        type="button"
                        onClick={() => openViewer('driving_licence')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 14,
                          lineHeight: '20px',
                          fontWeight: 500,
                          color: 'var(--admin-brand-green, #0f4d3c)',
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Activity Section (Counts of jobs & rating from stored data, no dead links) */}
            <section
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid rgba(16,32,26,.10)',
                padding: '24px 28px'
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 600,
                  color: 'var(--admin-ink, #14181f)',
                  margin: '0 0 16px'
                }}
              >
                Activity
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 16
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Completed jobs
                  </div>
                  <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.completedJobs || 0}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    In progress
                  </div>
                  <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.inProgressJobs || 0}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Cancelled
                  </div>
                  <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.cancelledJobs || 0}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Rating
                  </div>
                  <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', fontVariantNumeric: 'tabular-nums' }}>
                    {ratingFormatted}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Side Column: Status & History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {/* Status Section */}
            <aside
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid rgba(16,32,26,.10)',
                padding: '24px 24px'
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 600,
                  color: 'var(--admin-ink, #14181f)',
                  margin: '0 0 16px'
                }}
              >
                Status
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Account Status with Date Since */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Account status
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '20px', fontWeight: 500 }}>
                    <StatusDot status={isBanned ? 'banned' : isSuspended ? 'suspended' : 'active'} />
                    <span>
                      {isBanned
                        ? 'Permanently banned'
                        : isSuspended
                          ? 'Suspended'
                          : `Active since ${profile.joinedDateFormatted || profile.registeredAtFormatted || 'registration'}`}
                    </span>
                  </div>
                </div>

                {/* Online Status with Last Seen */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                    Presence
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, lineHeight: '20px', fontWeight: 500 }}>
                    <StatusDot status={isOnline ? 'online' : 'offline'} />
                    <span>
                      {isOnline
                        ? 'Online and receiving dispatch'
                        : `Offline · Last seen ${profile.lastSeenFormatted || '—'}`}
                    </span>
                  </div>
                </div>

                {/* Current Working Area (ONLY while online) */}
                {isOnline && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                      Current working area
                    </div>
                    <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--admin-ink, #14181f)' }}>
                      {profile.area || profile.city || 'Tiruchirappalli'}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* History Section: Real timeline of verification & status history */}
            <aside
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid rgba(16,32,26,.10)',
                padding: '24px 24px'
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 600,
                  color: 'var(--admin-ink, #14181f)',
                  margin: '0 0 16px'
                }}
              >
                History
              </h2>

              {profile.events && profile.events.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    maxHeight: 380,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: 6
                  }}
                  className="admin-minimal-scrollbar"
                >
                  {profile.events.map((ev, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ marginTop: 6 }}>
                        <StatusDot status={ev.type === 'approved' ? 'approved' : ev.type === 'reupload_requested' ? 'needs_attention' : 'offline'} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, lineHeight: '18px', fontWeight: 500, color: 'var(--admin-ink, #14181f)', textTransform: 'capitalize' }}>
                          {ev.type.replace('_', ' ')}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 400, color: 'var(--admin-meta, #64748b)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          By {ev.actor || 'automatic'} · {ev.dateFormatted}
                        </div>
                        {ev.details?.decision_note && (
                          <div
                            style={{
                              fontSize: 12,
                              lineHeight: '16px',
                              color: 'var(--admin-muted, #5a5648)',
                              background: '#f8fafc',
                              border: '1px solid rgba(16,32,26,.06)',
                              borderRadius: 6,
                              padding: '6px 8px',
                              marginTop: 4,
                              overflowWrap: 'anywhere'
                            }}
                          >
                            "{ev.details.decision_note}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)' }}>
                  No historical entries recorded.
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* Unified Minimalist Document & Photo Viewer */}
      <DocumentViewer
        documents={viewerDocuments}
        initialDocumentId={activeViewerDocId}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        mode="fullscreen"
        adminUser={adminUser}
        csrfToken={csrfToken}
        onRefreshUrl={handleRefreshDocumentUrl}
        showToast={showToast}
        targetContext={{ professionalId: profile?.id }}
      />

      {/* Suspend Access Dialog (Requires reason, destructive color ONLY on confirm) */}
      {suspendDialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => {
            if (!isSubmittingSuspend) setSuspendDialog(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid rgba(16,32,26,.10)',
              width: '100%',
              maxWidth: 440,
              padding: 24,
              boxShadow: '0 12px 32px rgba(0,0,0,0.12)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', margin: '0 0 8px' }}>
              Suspend professional access
            </h3>
            <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted, #5a5648)', margin: '0 0 16px' }}>
              Suspending {profile.name} will take their account offline and prevent receiving new service dispatches.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="suspend-reason-input" style={{ display: 'block', fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 6 }}>
                Reason for suspension (mandatory)
              </label>
              <textarea
                id="suspend-reason-input"
                rows={3}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Specify compliance or operational reason..."
                style={{
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid rgba(16,32,26,.15)',
                  padding: '10px 12px',
                  fontSize: 14,
                  lineHeight: '20px',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
              {suspendError && (
                <div style={{ fontSize: 12, color: 'var(--admin-status-red, #dc2626)', marginTop: 4 }}>
                  {suspendError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setSuspendDialog(false)}
                disabled={isSubmittingSuspend}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(16,32,26,.15)',
                  background: '#ffffff',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--admin-ink, #14181f)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                disabled={isSubmittingSuspend}
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--admin-status-red, #dc2626)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#ffffff',
                  cursor: isSubmittingSuspend ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmittingSuspend ? 'Suspending...' : 'Confirm suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Re-upload Dialog (Requires reason) */}
      {reuploadDialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => {
            if (!isSubmittingReupload) setReuploadDialog(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid rgba(16,32,26,.10)',
              width: '100%',
              maxWidth: 440,
              padding: 24,
              boxShadow: '0 12px 32px rgba(0,0,0,0.12)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--admin-ink, #14181f)', margin: '0 0 8px' }}>
              Request item re-upload
            </h3>
            <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--admin-muted, #5a5648)', margin: '0 0 16px' }}>
              Notify {profile.name} to upload a fresh, clear document or portrait photo.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="reupload-item-select" style={{ display: 'block', fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 6 }}>
                Target item
              </label>
              <select
                id="reupload-item-select"
                value={reuploadItem}
                onChange={(e) => setReuploadItem(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid rgba(16,32,26,.15)',
                  padding: '0 10px',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                <option value="live_photo">Live portrait photo</option>
                <option value="aadhaar">Aadhaar identity card</option>
                <option value="both">Both photo and Aadhaar card</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reupload-reason-input" style={{ display: 'block', fontSize: 13, lineHeight: '20px', fontWeight: 400, color: 'var(--admin-muted, #5a5648)', marginBottom: 6 }}>
                Instructions / Correction details (mandatory)
              </label>
              <textarea
                id="reupload-reason-input"
                rows={3}
                value={reuploadReason}
                onChange={(e) => setReuploadReason(e.target.value)}
                placeholder="Explain what was unclear or needs correction..."
                style={{
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid rgba(16,32,26,.15)',
                  padding: '10px 12px',
                  fontSize: 14,
                  lineHeight: '20px',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
              {reuploadError && (
                <div style={{ fontSize: 12, color: 'var(--admin-status-red, #dc2626)', marginTop: 4 }}>
                  {reuploadError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setReuploadDialog(false)}
                disabled={isSubmittingReupload}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(16,32,26,.15)',
                  background: '#ffffff',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--admin-ink, #14181f)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReupload}
                disabled={isSubmittingReupload}
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--admin-brand-green, #0f4d3c)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#ffffff',
                  cursor: isSubmittingReupload ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmittingReupload ? 'Sending...' : 'Send notice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimalist Toast Feedback Notification */}
      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--admin-ink, #14181f)',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 1200
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
