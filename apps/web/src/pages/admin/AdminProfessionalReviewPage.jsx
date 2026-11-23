import React, { useState, useEffect, useRef, useCallback } from 'react';
import DocumentViewer from '../../components/admin/DocumentViewer';

function formatAadhaar(val) {
  if (val === undefined || val === null || val === '') return '';
  const digits = String(val).replace(/\D/g, '').slice(0, 12);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(' ');
}

export default function AdminProfessionalReviewPage({
  requestId,
  adminUser,
  csrfToken,
  onNavigate
}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Claim countdown timer (10 mins in seconds)
  const [claimSecondsLeft, setClaimSecondsLeft] = useState(600);
  const [isClaimExpired, setIsClaimExpired] = useState(false);

  // Document viewer state
  const [activeDocTab, setActiveDocTab] = useState('live_photo'); // live_photo | aadhaar_front | licence
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const viewerRef = useRef(null);

  // Signed document URLs cache: { [`${type}-${id}`]: url }
  const [signedUrls, setSignedUrls] = useState({});
  const signedUrlsRef = useRef({});
  signedUrlsRef.current = signedUrls;

  // PII reveal state: { phone: unmaskedValue }
  const [revealedPii, setRevealedPii] = useState({});

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Manual 12-digit Aadhaar number entered/verified by admin from inspecting the photo
  const [manualAadhaarNumber, setManualAadhaarNumber] = useState('');
  const [aadhaarInputError, setAadhaarInputError] = useState(false);

  // Per-item review state
  const [itemReviews, setItemReviews] = useState({
    personal_details: { status: 'pending', reason_code: '', reason_note: '' },
    aadhaar: { status: 'pending', reason_code: '', reason_note: '' },
    live_photo: { status: 'pending', reason_code: '', reason_note: '' },
    driving_licence: { status: 'pending', reason_code: '', reason_note: '' }
  });

  const [internalDecisionNote, setInternalDecisionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);

  // Fetch signed view URL for documents or live photo
  const getSignedUrl = useCallback(async (docId, type = 'document') => {
    if (!docId) return null;
    const cacheKey = `${type}-${docId}`;
    if (signedUrlsRef.current[cacheKey]) return signedUrlsRef.current[cacheKey];

    try {
      const res = await fetch(`/admin/documents/${docId}/view-url?type=${type}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const result = await res.json();
        setSignedUrls((prev) => {
          if (prev[cacheKey] === result.url) return prev;
          return { ...prev, [cacheKey]: result.url };
        });
        return result.url;
      }
    } catch (err) {
      console.error('Error fetching signed document view URL:', err);
    }
    return null;
  }, []);

  // Fetch request details and initiate claim
  const loadRequest = useCallback(async (isSilent = false) => {
    if (!isSilent && !data) setIsLoading(true);
    setError(null);
    try {
      // 1. Claim or inspect
      const claimRes = await fetch(`/admin/approvals/requests/${requestId}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include'
      });
      const claimData = await claimRes.json();

      // 2. Load full details
      const detailsRes = await fetch(`/admin/approvals/requests/${requestId}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });

      if (!detailsRes.ok) throw new Error('Failed to load request details');
      const detailsData = await detailsRes.json();

      setData((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(detailsData)) return prev;
        return detailsData;
      });

      // Pre-fill item review states from existing database items
      if (detailsData.items && detailsData.items.length > 0) {
        const nextReviews = {};
        detailsData.items.forEach((it) => {
          const typeKey = it.item_type || it.itemType;
          if (typeKey) {
            nextReviews[typeKey] = {
              status: it.status || 'pending',
              reason_code: it.reason_code || it.reasonCode || '',
              reason_note: it.reason_note || it.reasonNote || ''
            };
          }
        });
        setItemReviews((prev) => ({ ...prev, ...nextReviews }));
      }

      // Pre-fill manual Aadhaar if exists
      const existingNum = detailsData.documents?.aadhaar?.aadhaarNumber || detailsData.documents?.aadhaar?.aadhaar_number;
      const existingLast4 = detailsData.documents?.aadhaar?.aadhaar_last4 || detailsData.documents?.aadhaar?.aadhaarLast4;
      if (existingNum && existingNum !== 'null') {
        setManualAadhaarNumber(formatAadhaar(existingNum));
      } else if (existingLast4 && existingLast4 !== 'null') {
        setManualAadhaarNumber(String(existingLast4));
      }

      // Initialize claim countdown
      if (claimData.claimedUntil) {
        const remaining = Math.max(0, Math.floor((new Date(claimData.claimedUntil) - new Date()) / 1000));
        setClaimSecondsLeft(remaining > 0 ? remaining : 600);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error loading request');
    } finally {
      setIsLoading(false);
    }
  }, [requestId, csrfToken]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  // Pre-fetch document view URLs as soon as data arrives
  useEffect(() => {
    if (!data) return;
    if (data.photo?.id) {
      getSignedUrl(data.photo.id, 'photo');
    }
    if (data.documents?.aadhaar?.id) {
      getSignedUrl(data.documents.aadhaar.id, 'document');
    }
    if (data.documents?.drivingLicence?.id) {
      getSignedUrl(data.documents.drivingLicence.id, 'document');
    }
  }, [data, getSignedUrl]);

  // Heartbeat & Countdown timer
  useEffect(() => {
    if (!data?.isClaimedByMe) return;

    const timer = setInterval(() => {
      setClaimSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsClaimExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const heartbeat = setInterval(async () => {
      try {
        const res = await fetch(`/admin/approvals/requests/${requestId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          credentials: 'include'
        });
        if (res.ok) {
          const hbData = await res.json();
          if (hbData.claimedUntil) {
            const rem = Math.max(0, Math.floor((new Date(hbData.claimedUntil) - new Date()) / 1000));
            setClaimSecondsLeft(rem);
            setIsClaimExpired(false);
          }
        }
      } catch (_) {}
    }, 180000);

    return () => {
      clearInterval(timer);
      clearInterval(heartbeat);
    };
  }, [data?.isClaimedByMe, requestId, csrfToken]);

  // PII Reveal action
  const handleRevealPhone = async () => {
    if (revealedPii.phone || !data?.professional?.id) return;
    try {
      const res = await fetch('/admin/pii/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          entityType: 'professional',
          entityId: data.professional.id,
          field: 'phone'
        }),
        credentials: 'include'
      });
      if (res.ok) {
        const resData = await res.json();
        setRevealedPii((prev) => ({ ...prev, phone: resData.value }));
      }
    } catch (err) {
      console.error('PII reveal error:', err);
    }
  };

  // Skip back to queue
  const handleSkip = async () => {
    try {
      await fetch(`/admin/approvals/requests/${requestId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
    } catch (_) {}
    onNavigate('/admin/approvals');
  };

  // Owner takeover
  const handleTakeover = async () => {
    try {
      const res = await fetch(`/admin/approvals/requests/${requestId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ forceTakeover: true }),
        credentials: 'include'
      });
      if (res.ok) {
        loadRequest();
      }
    } catch (_) {}
  };

  // Update item review status
  const handleItemStatusChange = (itemType, status) => {
    // If admin is trying to mark Aadhaar as approved without entering 12 digits
    if (itemType === 'aadhaar' && status === 'approved') {
      const cleanDigits = manualAadhaarNumber.replace(/\D/g, '');
      if (cleanDigits.length !== 12) {
        setAadhaarInputError(true);
        setToastMessage('⚠ Mandatory: Please enter the 12-digit Aadhaar number from the document before marking Looks Good.');
        setTimeout(() => setToastMessage(''), 4500);
        const input = document.querySelector('.admin-aadhaar-input');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      setAadhaarInputError(false);
    }

    setItemReviews((prev) => ({
      ...prev,
      [itemType]: {
        ...prev[itemType],
        status,
        reason_code: status === 'approved' ? '' : prev[itemType]?.reason_code,
        reason_note: status === 'approved' ? '' : prev[itemType]?.reason_note
      }
    }));

    const itemTitles = {
      personal_details: 'Applicant Details & Address',
      aadhaar: 'Aadhaar Card Document',
      live_photo: 'Live Selfie Face',
      driving_licence: 'Driving Licence'
    };

    const statusLabels = {
      approved: 'marked as Looks Good',
      needs_attention: 'marked for Re-upload',
      rejected: 'marked as Rejected'
    };

    setToastMessage(`✓ ${itemTitles[itemType] || itemType} ${statusLabels[status] || status}.`);
    setTimeout(() => setToastMessage(''), 3000);

    // Persist individual item status to backend in background
    try {
      fetch(`/admin/approvals/requests/${requestId}/items/${itemType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ status }),
        credentials: 'include'
      }).catch(() => {});
    } catch (_) {}
  };

  const handleItemReasonChange = (itemType, code, note) => {
    setItemReviews((prev) => ({
      ...prev,
      [itemType]: {
        ...prev[itemType],
        reason_code: code,
        reason_note: note
      }
    }));

    if (note && !internalDecisionNote.includes(note)) {
      setInternalDecisionNote((prev) => (prev ? `${prev}; ${note}` : note));
    }
  };

  // Submit Final Decision
  const handleSubmitDecision = async (decision) => {
    if (isSubmitting) return;

    if (decision === 'approved') {
      const cleanDigits = manualAadhaarNumber.replace(/\D/g, '');
      if (cleanDigits.length !== 12) {
        setAadhaarInputError(true);
        setToastMessage('⚠ Mandatory: A verified 12-digit Aadhaar number is required to approve.');
        setTimeout(() => setToastMessage(''), 4500);
        const input = document.querySelector('.admin-aadhaar-input');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const pendingCheck = ['personal_details', 'aadhaar', 'live_photo'].find((k) => itemReviews[k]?.status !== 'approved');
      if (pendingCheck) {
        alert('Please inspect and mark each section (Address, Aadhaar, and Live Selfie) as "Looks Good" before approving.');
        return;
      }
    }

    if (decision === 'rejected' && !internalDecisionNote.trim()) {
      alert('A decision note explaining the reason for rejection is required.');
      return;
    }

    if (decision === 'needs_attention') {
      const hasProblem = Object.values(itemReviews).some((v) => v.status === 'needs_attention');
      if (!hasProblem && !internalDecisionNote.trim()) {
        alert('Please indicate which document requires re-upload or provide details in the decision note.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        decision,
        version: data.request.version,
        items: Object.entries(itemReviews).map(([itemType, rev]) => ({
          itemType,
          status: rev.status,
          reasonCode: rev.reason_code || null,
          reasonNote: rev.reason_note || null
        })),
        decisionNote: internalDecisionNote,
        aadhaarNumber: manualAadhaarNumber.replace(/\D/g, '') || undefined,
        aadhaarLast4: manualAadhaarNumber.replace(/\D/g, '').slice(-4) || undefined
      };

      const res = await fetch(`/admin/approvals/requests/${requestId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (res.status === 409) {
        alert('This request was updated by another administrator. Refreshing...');
        loadRequest();
        return;
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Decision submission failed');
      }

      const resData = await res.json();
      setToastMessage(
        `Professional ${decision === 'approved' ? 'approved and activated' : decision === 'rejected' ? 'rejected' : 'sent for re-upload'}.`
      );

      if (resData.nextRequestId) {
        setTimeout(() => {
          onNavigate(`/admin/approvals/professionals/${resData.nextRequestId}`);
        }, 350);
      } else {
        setTimeout(() => {
          onNavigate('/admin/approvals');
        }, 500);
      }
    } catch (err) {
      alert(err.message || 'Error saving decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcuts (A, U, R, J, K, Esc, ?)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleSubmitDecision('approved');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleSubmitDecision('needs_attention');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleSubmitDecision('rejected');
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const tabs = ['live_photo', 'aadhaar_front'];
        if (data?.documents?.drivingLicence) tabs.push('licence');
        const currentIdx = tabs.indexOf(activeDocTab);
        const nextIdx = (currentIdx + 1) % tabs.length;
        setActiveDocTab(tabs[nextIdx]);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const tabs = ['live_photo', 'aadhaar_front'];
        if (data?.documents?.drivingLicence) tabs.push('licence');
        const currentIdx = tabs.indexOf(activeDocTab);
        const nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        setActiveDocTab(tabs[nextIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      } else if (e.key === '?') {
        e.preventDefault();
        setIsCheatsheetOpen((o) => !o);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (isLoading && !data) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--admin-muted, #5a5648)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Loading Professional Verification Dossier...</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Decrypted document streams are being initialized securely.</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: '#8a3b2f', marginBottom: 8 }}>Unable to Load Verification Request</h2>
        <p style={{ color: '#64748b', marginBottom: 20 }}>{error || 'Request record not found in database'}</p>
        <button
          type="button"
          className="admin-btn-decision-approve"
          onClick={() => onNavigate('/admin/approvals')}
        >
          Return to Approvals Queue
        </button>
      </div>
    );
  }

  const { request = {}, professional = {}, documents = {}, photo, history = [], claimConflict, isClaimedByMe } = data;

  // Construct documents list for shared DocumentViewer
  const reviewDocuments = [
    photo && {
      id: 'live_photo',
      type: 'live_photo',
      title: 'Live photo',
      url: signedUrls[`photo-${photo?.id}`] || (photo?.id ? `/api/verification/photo/stream?id=${professional?.id}` : null),
      captureSource: photo.isUploadFallback ? 'Uploaded file' : 'Live capture',
      capturedAt: photo.capturedAt || photo.uploadedAt,
      uploadedAt: photo.uploadedAt || photo.capturedAt,
      automatedChecks: {
        faceDetected: photo.checks?.face_detected ?? photo.checks?.faceDetected,
        imageQuality: photo.checks?.image_quality ?? photo.checks?.imageQuality
      }
    },
    documents.aadhaar && {
      id: 'aadhaar_front',
      type: 'aadhaar',
      title: 'Aadhaar identity card',
      url: signedUrls[`document-${documents.aadhaar?.id}`] || (documents.aadhaar?.id ? `/admin/documents/${documents.aadhaar?.id}/stream?type=document` : null),
      captureSource: 'Uploaded file',
      uploadedAt: documents.aadhaar.uploadedAt,
      aadhaarLast4: documents.aadhaar.aadhaarLast4 || documents.aadhaar.aadhaar_last4 || professional?.aadhaarLast4 || professional?.aadhaar_last4,
      automatedChecks: {
        documentQuality: documents.aadhaar.checks?.document_quality ?? documents.aadhaar.checks?.documentQuality,
        tamperDetected: documents.aadhaar.checks?.tamper_detected ?? documents.aadhaar.checks?.tamperDetected
      }
    },
    documents.drivingLicence && {
      id: 'licence',
      type: 'driving_licence',
      title: 'Driving licence',
      url: signedUrls[`document-${documents.drivingLicence?.id}`] || (documents.drivingLicence?.id ? `/admin/documents/${documents.drivingLicence?.id}/stream?type=document` : null),
      captureSource: 'Uploaded file',
      uploadedAt: documents.drivingLicence.uploadedAt,
      automatedChecks: documents.drivingLicence.checks
    }
  ].filter(Boolean);

  const handleRefreshReviewUrl = async (doc) => {
    try {
      const isPhoto = doc.id === 'live_photo' || doc.type === 'live_photo';
      const docId = isPhoto ? photo?.id : (doc.id === 'licence' ? documents.drivingLicence?.id : documents.aadhaar?.id);
      const fileType = isPhoto ? 'photo' : 'document';
      const res = await fetch(`/admin/documents/${docId}/view-url?type=${fileType}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const result = await res.json();
        setSignedUrls((prev) => ({ ...prev, [`${fileType}-${docId}`]: result.url }));
        return result.url;
      }
    } catch (_) {}
    return null;
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Verification items count
  const cleanAadhaarDigits = manualAadhaarNumber.replace(/\D/g, '');
  const isAadhaarEntered = cleanAadhaarDigits.length === 12;
  const allMandatoryApproved =
    itemReviews.live_photo?.status === 'approved' &&
    itemReviews.aadhaar?.status === 'approved' &&
    itemReviews.personal_details?.status === 'approved' &&
    isAadhaarEntered;

  const approvedCount = [
    itemReviews.live_photo?.status,
    itemReviews.aadhaar?.status,
    itemReviews.personal_details?.status,
    documents.drivingLicence ? itemReviews.driving_licence?.status : null
  ].filter((s) => s === 'approved').length;

  const totalItemsCount = documents.drivingLicence ? 4 : 3;

  return (
    <div className="admin-review-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 24,
            zIndex: 100,
            background: '#0f4d3c',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Claim Conflict Banner */}
      {claimConflict && !isClaimedByMe && (
        <div
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#b45309',
            fontSize: 13.5
          }}
        >
          <span>
            Being reviewed by <strong>{claimConflict.claimedByName}</strong> since {claimConflict.claimedSinceFormatted}. Read only.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {adminUser?.role === 'owner' && (
              <button
                type="button"
                className="admin-review-nav-btn"
                onClick={handleTakeover}
                style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fcd34d' }}
              >
                Take over review (Owner)
              </button>
            )}
            <button
              type="button"
              className="admin-btn-decision-approve"
              style={{ height: 32, padding: '0 12px', fontSize: 13 }}
              onClick={() => onNavigate('/admin/approvals')}
            >
              Open Next Available
            </button>
          </div>
        </div>
      )}

      {/* 60/40 Split Review Layout */}
      <div className="admin-review-split">
        {/* Left Column: Document Inspection Suite */}
        <div className="admin-review-left" ref={viewerRef} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Document Tabs */}
          <div className="admin-doc-tabstrip">
            <button
              type="button"
              className="admin-doc-tab-back"
              onClick={() => onNavigate('/admin/approvals')}
              title="Return to Approvals (Esc)"
              aria-label="Return to Approvals"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 12L6 8L10 4" />
              </svg>
            </button>

            <button
              type="button"
              className={`admin-doc-tab ${activeDocTab === 'live_photo' ? 'active' : ''}`}
              onClick={() => setActiveDocTab('live_photo')}
            >
              <span>Live Selfie</span>
            </button>

            <button
              type="button"
              className={`admin-doc-tab ${activeDocTab === 'aadhaar_front' ? 'active' : ''}`}
              onClick={() => {
                setActiveDocTab('aadhaar_front');
                if (documents.aadhaar?.id && !signedUrls[`document-${documents.aadhaar.id}`]) {
                  getSignedUrl(documents.aadhaar.id, 'document');
                }
              }}
            >
              <span>Aadhaar Card</span>
            </button>

            <button
              type="button"
              disabled={!documents.drivingLicence}
              className={`admin-doc-tab ${activeDocTab === 'licence' ? 'active' : ''}`}
              onClick={() => {
                if (documents.drivingLicence) {
                  setActiveDocTab('licence');
                  if (!signedUrls[`document-${documents.drivingLicence.id}`]) {
                    getSignedUrl(documents.drivingLicence.id, 'document');
                  }
                }
              }}
            >
              <span>Driving Licence</span>
              {!documents.drivingLicence && (
                <span className="admin-doc-tab-badge">Optional</span>
              )}
            </button>
          </div>

          {/* Embedded Minimalist DocumentViewer with Expand button */}
          <div style={{ flex: 1, minHeight: 480, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <DocumentViewer
              documents={reviewDocuments}
              initialDocumentId={activeDocTab}
              activeDocumentId={activeDocTab}
              isOpen={true}
              mode={isViewerFullscreen ? 'fullscreen' : 'embedded'}
              onClose={(action) => {
                if (action === 'expand_fullscreen') {
                  setIsViewerFullscreen(true);
                } else {
                  setIsViewerFullscreen(false);
                }
              }}
              adminUser={adminUser}
              csrfToken={csrfToken}
              onRefreshUrl={handleRefreshReviewUrl}
              onDocumentChange={(doc) => {
                if (doc?.id && doc.id !== activeDocTab) {
                  setActiveDocTab(doc.id);
                }
              }}
              showToast={showToast}
              targetContext={{ professionalId: professional?.id }}
            />
          </div>
        </div>

        {/* Right Column: Review Dossier & Manual Decision */}
        <div className="admin-review-right">
          {/* Card 1: Professional Details */}
          <section className="admin-dossier-card">
            <div className="admin-profile-header-grid">
              <div className="admin-profile-avatar">
                {(professional.name || 'P').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="admin-profile-name">{professional.name}</h3>
                <div className="admin-profile-subcode">
                  Pro Code: #{professional.professionalCode || professional.id} • {professional.trade}
                </div>
              </div>
            </div>

            {/* Quick Verification Status & Direct Action Banner */}
            {(() => {
              const cleanDigits = manualAadhaarNumber.replace(/\D/g, '');
              const isAadhaarEntered = cleanDigits.length === 12;
              const hasNeedsAttention = Object.values(itemReviews).some((v) => v.status === 'needs_attention');
              const hasRejected = Object.values(itemReviews).some((v) => v.status === 'rejected');
              const approvedChecksCount = ['personal_details', 'aadhaar', 'live_photo'].filter((k) => itemReviews[k]?.status === 'approved').length;
              const allReady = approvedChecksCount === 3 && isAadhaarEntered;

              let bannerBg = '#f8fafc';
              let bannerBorder = '1px solid #e2e8f0';
              let dotColor = approvedChecksCount > 0 ? '#b45309' : '#94a3b8';
              let titleText = `${approvedChecksCount} of 3 checks marked "Looks Good"`;
              let actionBtn = (
                <button
                  type="button"
                  style={{
                    height: '34px',
                    padding: '0 14px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    borderRadius: '8px',
                    background: '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'not-allowed',
                    opacity: 0.6
                  }}
                  disabled
                >
                  Review in Progress
                </button>
              );

              if (hasNeedsAttention) {
                bannerBg = '#fffbeb';
                bannerBorder = '1px solid #fcd34d';
                dotColor = '#d97706';
                titleText = 'Changes requested — Send note to professional';
                actionBtn = (
                  <button
                    type="button"
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    disabled={isSubmitting}
                    onClick={() => handleSubmitDecision('needs_attention')}
                  >
                    <span>Request Re-upload (U)</span>
                  </button>
                );
              } else if (hasRejected) {
                bannerBg = '#fef2f2';
                bannerBorder = '1px solid #fca5a5';
                dotColor = '#dc2626';
                titleText = 'Application marked for Rejection';
                actionBtn = (
                  <button
                    type="button"
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer'
                    }}
                    disabled={isSubmitting}
                    onClick={() => handleSubmitDecision('rejected')}
                  >
                    <span>Reject Application (R)</span>
                  </button>
                );
              } else if (allReady) {
                bannerBg = 'rgba(4, 120, 87, 0.08)';
                bannerBorder = '1px solid rgba(4, 120, 87, 0.3)';
                dotColor = '#047857';
                titleText = 'All 3 checks verified & 12-digit Aadhaar recorded';
                actionBtn = (
                  <button
                    type="button"
                    className="admin-btn-decision-approve"
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      background: '#047857',
                      color: '#ffffff',
                      border: 'none',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    disabled={isSubmitting}
                    onClick={() => handleSubmitDecision('approved')}
                  >
                    <span>✔ Approve & Verify</span>
                  </button>
                );
              } else if (approvedChecksCount === 3 && !isAadhaarEntered) {
                bannerBg = '#fffbeb';
                bannerBorder = '1px solid #fcd34d';
                dotColor = '#d97706';
                titleText = 'Enter 12-digit Aadhaar number to enable approval';
                actionBtn = (
                  <button
                    type="button"
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setAadhaarInputError(true);
                      const input = document.querySelector('.admin-aadhaar-input');
                      if (input) {
                        input.focus();
                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                  >
                    <span>Enter Aadhaar (12 Digits)</span>
                  </button>
                );
              }

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: bannerBg,
                    border: bannerBorder,
                    borderRadius: '10px',
                    margin: '14px 0 16px 0',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        background: dotColor,
                        display: 'inline-block'
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: dotColor === '#047857' ? '#047857' : '#334155' }}>
                      {titleText}
                    </span>
                  </div>
                  {actionBtn}
                </div>
              );
            })()}

            <div className="admin-dossier-grid">
              <div className="admin-dossier-row">
                <span className="admin-dossier-label">Mobile Number</span>
                <span className="admin-dossier-value">
                  {professional.phone || professional.phoneMasked || '—'}
                </span>
              </div>

              <div className="admin-dossier-row">
                <span className="admin-dossier-label">Email Address</span>
                <span className="admin-dossier-value">
                  {professional.email || professional.emailMasked || '—'}
                </span>
              </div>

              <div className="admin-dossier-row">
                <span className="admin-dossier-label">Trade Experience</span>
                <span className="admin-dossier-value">{professional.experienceFormatted}</span>
              </div>

              <div className="admin-dossier-row">
                <span className="admin-dossier-label">Permanent Address</span>
                <span className="admin-dossier-value" style={{ maxWidth: '65%' }}>
                  {professional.permanentAddress || '—'}
                </span>
              </div>

              <div className="admin-dossier-row">
                <span className="admin-dossier-label">Submitted On</span>
                <span className="admin-dossier-value">{professional.submittedAtFormatted || '—'}</span>
              </div>
            </div>

            {/* Manual Review for Personal Details */}
            <ItemReviewControl
              itemType="personal_details"
              label="Applicant Details & Address"
              reviewState={itemReviews.personal_details}
              onChangeStatus={(st) => handleItemStatusChange('personal_details', st)}
              onChangeReason={(code, note) => handleItemReasonChange('personal_details', code, note)}
            />
          </section>

          {/* Card 2: Manual Aadhaar Inspection */}
          <section className="admin-dossier-card">
            <div className="admin-dossier-header">
              <h4 className="admin-dossier-title">Aadhaar Card Inspection</h4>
              <span className="admin-review-tag status">Manual Check</span>
            </div>

            {/* Manual 12-Digit Aadhaar number entry */}
            <div
              className="admin-aadhaar-input-box"
              style={{
                background: aadhaarInputError ? '#fff5f5' : manualAadhaarNumber.replace(/\D/g, '').length === 12 ? '#f0fdf4' : '#f8fafc',
                border: aadhaarInputError ? '1.5px solid #ef4444' : manualAadhaarNumber.replace(/\D/g, '').length === 12 ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px 14px',
                margin: '0 0 14px 0',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b' }}>
                  Aadhaar Number (12 Digits): <span style={{ color: '#dc2626' }}>*</span>
                </span>
                <span style={{ fontSize: '11.5px', color: manualAadhaarNumber.replace(/\D/g, '').length === 12 ? '#047857' : aadhaarInputError ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                  {manualAadhaarNumber.replace(/\D/g, '').length === 12 ? '✓ 12 digits recorded' : `${manualAadhaarNumber.replace(/\D/g, '').length}/12 digits`}
                </span>
              </div>
              <input
                type="text"
                maxLength={19}
                placeholder="XXXX XXXX XXXX"
                className="admin-aadhaar-input"
                style={{
                  width: '100%',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  letterSpacing: '2px',
                  fontSize: '15px',
                  height: '38px',
                  padding: '0 12px',
                  border: aadhaarInputError ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  borderRadius: '6px'
                }}
                value={manualAadhaarNumber}
                onChange={(e) => {
                  const formatted = formatAadhaar(e.target.value);
                  setManualAadhaarNumber(formatted);
                  if (formatted.replace(/\D/g, '').length === 12) {
                    setAadhaarInputError(false);
                  }
                }}
              />
              {aadhaarInputError && manualAadhaarNumber.replace(/\D/g, '').length !== 12 && (
                <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#dc2626', fontWeight: 600 }}>
                  ⚠ Mandatory: Enter the 12-digit Aadhaar number from the photo before marking "Looks Good".
                </div>
              )}
            </div>

            {/* Manual Review for Aadhaar Document */}
            <ItemReviewControl
              itemType="aadhaar"
              label="Aadhaar Card Document"
              reviewState={itemReviews.aadhaar}
              onChangeStatus={(st) => handleItemStatusChange('aadhaar', st)}
              onChangeReason={(code, note) => handleItemReasonChange('aadhaar', code, note)}
            />
          </section>

          {/* Card 3: Live Selfie Photo Inspection */}
          <section className="admin-dossier-card">
            <div className="admin-dossier-header">
              <h4 className="admin-dossier-title">Live Selfie Inspection</h4>
              <span className="admin-review-tag status">Face Match</span>
            </div>

            <ItemReviewControl
              itemType="live_photo"
              label="Live Selfie Face"
              reviewState={itemReviews.live_photo}
              onChangeStatus={(st) => handleItemStatusChange('live_photo', st)}
              onChangeReason={(code, note) => handleItemReasonChange('live_photo', code, note)}
            />
          </section>

          {/* Card 4: Driving Licence (if provided) */}
          {documents.drivingLicence && (
            <section className="admin-dossier-card">
              <div className="admin-dossier-header">
                <h4 className="admin-dossier-title">Driving Licence</h4>
                <span className="admin-review-tag trade">Optional Proof</span>
              </div>
              <ItemReviewControl
                itemType="driving_licence"
                label="Driving Licence"
                reviewState={itemReviews.driving_licence}
                onChangeStatus={(st) => handleItemStatusChange('driving_licence', st)}
                onChangeReason={(code, note) => handleItemReasonChange('driving_licence', code, note)}
              />
            </section>
          )}

          {/* Card 5: Internal Decision Note */}
          <section className="admin-dossier-card">
            <div className="admin-dossier-header">
              <h4 className="admin-dossier-title">Decision Note</h4>
              <span style={{ fontSize: 11.5, color: 'var(--admin-muted, #5a5648)' }}>
                Required for Re-upload / Reject
              </span>
            </div>
            <textarea
              className="admin-aadhaar-input"
              rows={2}
              style={{
                height: 'auto',
                padding: '10px 12px',
                
                letterSpacing: 'normal',
                resize: 'vertical'
              }}
              placeholder="Reason note for applicant or internal record..."
              value={internalDecisionNote}
              onChange={(e) => setInternalDecisionNote(e.target.value)}
            />
          </section>

            {/* History Timeline */}
            {history && history.length > 0 && (
              <section className="admin-dossier-card">
                <div className="admin-dossier-header">
                  <h4 className="admin-dossier-title">Audit Trail History</h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {history.map((ev, i) => (
                    <div key={i} style={{ borderLeft: '2px solid #e7e2d8', paddingLeft: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--admin-ink, #14181f)' }}>
                        {ev.eventType} — {ev.actorName || ev.actorType}
                      </div>
                      <div style={{ color: 'var(--admin-muted, #5a5648)', fontSize: 11.5 }}>
                        {ev.timestampFormatted}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Final Administrative Decision Panel (Integrated cleanly in Dossier, no footer bar) */}
            <section className="admin-dossier-card" style={{ marginTop: 8, background: '#faf9f5', border: '1px solid #e2ded5' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: allMandatoryApproved ? 'var(--admin-forest, #0f4d3c)' : 'var(--admin-brass, #b45309)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: allMandatoryApproved ? '#0f4d3c' : '#b45309', display: 'inline-block' }} />
                  <span>
                    {allMandatoryApproved
                      ? `All ${totalItemsCount} checks verified & Aadhaar recorded`
                      : !isAadhaarEntered && approvedCount === totalItemsCount
                      ? `12-digit Aadhaar number required before approval`
                      : `${approvedCount} of ${totalItemsCount} marked "Looks good"`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  className="admin-btn-decision-approve"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    height: 42,
                    fontSize: 13.5,
                    opacity: allMandatoryApproved ? 1 : 0.5,
                    cursor: allMandatoryApproved ? 'pointer' : 'not-allowed'
                  }}
                  disabled={isSubmitting || !allMandatoryApproved}
                  onClick={() => handleSubmitDecision('approved')}
                  title={
                    allMandatoryApproved
                      ? "Approve professional registration (A)"
                      : "Mark all 3 items Looks Good and enter 12-digit Aadhaar number to approve"
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 8 7 12 13 4" />
                  </svg>
                  <span>Approve & Verify {professional.name}</span>
                  <kbd className="admin-review-kbd light">A</kbd>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className="admin-btn-decision-reupload"
                    style={{ width: '100%', justifyContent: 'center', height: 38, fontSize: 12.5 }}
                    disabled={isSubmitting || (!isClaimedByMe && adminUser?.role !== 'owner')}
                    onClick={() => handleSubmitDecision('needs_attention')}
                    title="Request re-upload of photos (U)"
                  >
                    <span>Request Re-upload</span>
                    <kbd className="admin-review-kbd">U</kbd>
                  </button>
                  <button
                    type="button"
                    className="admin-btn-decision-reject"
                    style={{ width: '100%', justifyContent: 'center', height: 38, fontSize: 12.5 }}
                    disabled={isSubmitting || (!isClaimedByMe && adminUser?.role !== 'owner')}
                    onClick={() => handleSubmitDecision('rejected')}
                    title="Reject application (R)"
                  >
                    <span>Reject</span>
                    <kbd className="admin-review-kbd">R</kbd>
                  </button>
                </div>
              </div>
            </section>
        </div>
      </div>

      {/* Keyboard Cheatsheet Modal */}
      {isCheatsheetOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(20,24,31,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setIsCheatsheetOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 12px 36px rgba(0,0,0,0.2)',
              border: '1px solid #e7e2d8'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600,  }}>
              Keyboard Shortcuts
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>A</kbd> Approve professional
              </div>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>U</kbd> Request photo re-upload
              </div>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>R</kbd> Reject application
              </div>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>J / K</kbd> Cycle document tabs
              </div>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>Esc</kbd> Skip / return to queue
              </div>
              <div>
                <kbd style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 4, fontWeight: 600, border: '1px solid #cbd5e1' }}>?</kbd> Open shortcuts cheatsheet
              </div>
            </div>
            <button
              type="button"
              className="admin-btn-decision-approve"
              style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
              onClick={() => setIsCheatsheetOpen(false)}
            >
              Close Cheatsheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemReviewControl({ itemType, label, reviewState, onChangeStatus, onChangeReason }) {
  const isApproved = reviewState?.status === 'approved';
  const isAttention = reviewState?.status === 'needs_attention';
  const isRejected = reviewState?.status === 'rejected';

  const reasonChips = [
    { code: 'image_blurry', label: 'Blurry / Unreadable' },
    { code: 'face_mismatch', label: 'Face Does Not Match' },
    { code: 'name_mismatch', label: 'Name Mismatch' },
    { code: 'document_cropped', label: 'Corners Cropped' },
    { code: 'invalid_or_expired', label: 'Invalid / Expired' }
  ];

  return (
    <div className="admin-item-review-box">
      <div className="admin-item-review-header">
        <span className="admin-item-review-title">{label}</span>
        <div className="admin-item-pills">
          <button
            type="button"
            className={`admin-item-pill ${isApproved ? 'active-approved' : ''}`}
            onClick={() => onChangeStatus('approved')}
          >
            ✔ Looks Good
          </button>
          <button
            type="button"
            className={`admin-item-pill ${isAttention ? 'active-attention' : ''}`}
            onClick={() => onChangeStatus('needs_attention')}
          >
            ⚠ Re-upload
          </button>
          <button
            type="button"
            className={`admin-item-pill ${isRejected ? 'active-rejected' : ''}`}
            onClick={() => onChangeStatus('rejected')}
          >
            ✖ Reject
          </button>
        </div>
      </div>

      {(isAttention || isRejected) && (
        <div className="admin-reason-select-row">
          <div style={{ fontSize: 11.5, color: 'var(--admin-muted, #5a5648)', fontWeight: 500 }}>
            Quick reason templates:
          </div>
          <div className="admin-reason-chips">
            {reasonChips.map((chip) => (
              <button
                key={chip.code}
                type="button"
                className="admin-reason-chip"
                onClick={() => onChangeReason(chip.code, chip.label)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="admin-aadhaar-input"
            style={{ height: 32, fontSize: 12.5, letterSpacing: 'normal' }}
            placeholder="Specific note to applicant on what to correct..."
            value={reviewState?.reason_note || ''}
            onChange={(e) => onChangeReason(reviewState?.reason_code || 'custom', e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
