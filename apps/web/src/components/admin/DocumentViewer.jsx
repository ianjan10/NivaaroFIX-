import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * NivaaroFix DocumentViewer
 * ONE shared, unified, premium, minimalist document and photo viewer.
 * Replaces every existing viewer / lightbox across all admin pages.
 */
export default function DocumentViewer({
  documents = [],
  initialDocumentId = null,
  activeDocumentId = null,
  isOpen = false,
  onClose,
  mode = 'fullscreen', // 'fullscreen' | 'embedded'
  adminUser = null,
  csrfToken = '',
  onRefreshUrl = null,
  onDocumentChange = null,
  showToast = null,
  targetContext = {} // { professionalId, customerId }
}) {
  // Normalize document list
  const docList = Array.isArray(documents) ? documents.filter(Boolean) : [];
  const totalDocs = docList.length;

  // Determine current active document index
  const targetInitialId = activeDocumentId || initialDocumentId;
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!targetInitialId || docList.length === 0) return 0;
    const foundIdx = docList.findIndex(
      (d) => String(d.id) === String(targetInitialId) || String(d.type) === String(targetInitialId)
    );
    return foundIdx !== -1 ? foundIdx : 0;
  });

  const controlledIndex = targetInitialId ? docList.findIndex(
    (d) => String(d.id) === String(targetInitialId) || String(d.type) === String(targetInitialId)
  ) : -1;
  const effectiveIndex = controlledIndex !== -1 ? controlledIndex : currentIndex;

  const currentDoc = docList[effectiveIndex] || null;

  // Viewer Transform State
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = fit (100%), 0.25 to 4.0
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState({});
  const [currentResolvedUrl, setCurrentResolvedUrl] = useState('');

  // Animation crossfade & reduced motion
  const [isChangingFile, setIsChangingFile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Focus trap ref
  const viewerContainerRef = useRef(null);
  const triggerElementRef = useRef(null);
  const stageRef = useRef(null);

  // PDF Page indicator state (if PDF)
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(1);

  // Touch tracking
  const touchStateRef = useRef({
    touchCount: 0,
    startDist: 0,
    startZoom: 1,
    startX: 0,
    startY: 0
  });

  // Track opening element for returning focus on close
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Check reduced motion media query
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mq.matches);
      const handler = (e) => setPrefersReducedMotion(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } catch (_) {}
  }, []);

  const prevDocUrlRef = useRef('');
  const prevDocIdRef = useRef('');

  // Update current document URL when active index changes
  useEffect(() => {
    if (!currentDoc) {
      setCurrentResolvedUrl('');
      setIsLoading(false);
      return;
    }

    const isSameDoc = prevDocIdRef.current === currentDoc.id;
    const isSameUrl = prevDocUrlRef.current === currentDoc.url;

    // Silent background refresh: if the doc ID and URL haven't changed, DO NOT BLINK AND DO NOT SPINNER!
    if (isSameDoc && isSameUrl && currentResolvedUrl) {
      return;
    }

    prevDocIdRef.current = currentDoc.id;
    prevDocUrlRef.current = currentDoc.url || '';

    // Only transition if switching to a genuinely new file
    if (!isSameDoc) {
      setIsChangingFile(true);
      setIsLoading(true);
      setHasError(false);
      setZoomLevel(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    }

    if (!currentDoc.url) {
      if (onRefreshUrl) {
        onRefreshUrl(currentDoc).then((freshUrl) => {
          if (freshUrl) {
            setCurrentResolvedUrl(freshUrl);
          } else {
            setIsLoading(false);
            setHasError(true);
          }
          setIsChangingFile(false);
        }).catch(() => {
          setIsLoading(false);
          setHasError(true);
          setIsChangingFile(false);
        });
        return;
      } else {
        setIsLoading(false);
        setHasError(true);
        setIsChangingFile(false);
        return;
      }
    }

    // Direct resolution without artificial delays
    setCurrentResolvedUrl(currentDoc.url || '');
    setIsChangingFile(false);
  }, [effectiveIndex, currentDoc?.id, currentDoc?.url, onRefreshUrl]);

  // Preload neighboring images
  useEffect(() => {
    if (docList.length <= 1) return;
    const prevDoc = docList[effectiveIndex - 1];
    const nextDoc = docList[effectiveIndex + 1];

    if (prevDoc?.url && !prevDoc.url.endsWith('.pdf')) {
      const imgPrev = new Image();
      imgPrev.src = prevDoc.url;
    }
    if (nextDoc?.url && !nextDoc.url.endsWith('.pdf')) {
      const imgNext = new Image();
      imgNext.src = nextDoc.url;
    }
  }, [effectiveIndex, docList]);

  // Audit document view event on open and file change
  const auditViewEvent = useCallback(async (doc) => {
    if (!doc) return;
    try {
      await fetch('/admin/documents/audit-view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          documentId: doc.id,
          documentType: doc.type || 'document',
          professionalId: targetContext?.professionalId || doc.professionalId,
          customerId: targetContext?.customerId || doc.customerId
        })
      });
    } catch (_) {}
  }, [csrfToken, targetContext]);

  const lastAuditedDocIdRef = useRef(null);
  useEffect(() => {
    if (isOpen && currentDoc && lastAuditedDocIdRef.current !== currentDoc.id) {
      lastAuditedDocIdRef.current = currentDoc.id;
      auditViewEvent(currentDoc);
    }
  }, [isOpen, currentDoc?.id, auditViewEvent]);

  // Deep linking: synchronize URL query parameter ?viewer=<id>
  useEffect(() => {
    if (!isOpen || mode === 'embedded') return;

    if (currentDoc) {
      const url = new URL(window.location.href);
      const currentParam = url.searchParams.get('viewer');
      const targetParam = String(currentDoc.id || currentDoc.type);
      if (currentParam !== targetParam) {
        url.searchParams.set('viewer', targetParam);
        window.history.pushState({ isViewerOpen: true, docId: currentDoc.id }, '', url.toString());
      }
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('viewer')) {
        if (onClose) onClose();
      } else {
        const targetId = params.get('viewer');
        const found = docList.findIndex(
          (d) => String(d.id) === targetId || String(d.type) === targetId
        );
        if (found !== -1) {
          setCurrentIndex(found);
        } else {
          if (showToast) showToast('Document not found');
          if (onClose) onClose();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, mode, currentDoc?.id]);

  // Clean URL query param when closed
  const handleClose = useCallback(() => {
    if (mode === 'fullscreen') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('viewer')) {
          url.searchParams.delete('viewer');
          window.history.replaceState({}, '', url.toString());
        }
      } catch (_) {}
    }

    // Return focus to trigger element
    if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
      triggerElementRef.current.focus();
    }

    if (onClose) onClose();
  }, [mode, onClose]);

  // Lock background scroll when open in fullscreen mode
  useEffect(() => {
    if (isOpen && mode === 'fullscreen') {
      const originalBodyOverflow = document.body.style.overflow;
      const originalDocOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalDocOverflow;
      };
    }
  }, [isOpen, mode]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (docList.length <= 1) return;
    const newIdx = effectiveIndex > 0 ? effectiveIndex - 1 : docList.length - 1;
    setCurrentIndex(newIdx);
    if (onDocumentChange && docList[newIdx]) {
      onDocumentChange(docList[newIdx], newIdx);
    }
  }, [docList, effectiveIndex, onDocumentChange]);

  const handleNext = useCallback(() => {
    if (docList.length <= 1) return;
    const newIdx = effectiveIndex < docList.length - 1 ? effectiveIndex + 1 : 0;
    setCurrentIndex(newIdx);
    if (onDocumentChange && docList[newIdx]) {
      onDocumentChange(docList[newIdx], newIdx);
    }
  }, [docList, effectiveIndex, onDocumentChange]);

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));
  const handleResetFit = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  // Double click toggles between fit and 200%
  const handleDoubleClick = (e) => {
    e.preventDefault();
    if (zoomLevel > 1.2) {
      handleResetFit();
    } else {
      setZoomLevel(2.0);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Do not intercept keyboard shortcuts if the user is typing inside an input, textarea, or editable element
      const tag = e.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) {
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      // Arrows for Prev/Next
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
        return;
      }
      // Zoom Shortcuts: '+' or '='
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      // Zoom Shortcuts: '-' or '_'
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      // Fit: '0'
      if (e.key === '0') {
        e.preventDefault();
        handleResetFit();
        return;
      }
      // Rotate: 'R' or 'r'
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotate();
        return;
      }

      // Focus trap within viewer
      if (e.key === 'Tab' && viewerContainerRef.current) {
        const focusable = viewerContainerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusableArr = Array.from(focusable).filter(
          (el) => !el.disabled && el.offsetParent !== null
        );

        if (focusableArr.length === 0) return;

        const first = focusableArr[0];
        const last = focusableArr[focusableArr.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handlePrev, handleNext]);

  // Mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Drag & Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Primary button only
    if (zoomLevel <= 1) return; // Only pan when zoomed in

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY
    });
  };

  const handleMouseUp = () => {
    if (isDragging) setIsDragging(false);
  };

  // Touch handlers for mobile (pinch to zoom & swipe between files)
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      touchStateRef.current = {
        touchCount: 1,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
        startZoom: zoomLevel,
        startDist: 0
      };
      if (zoomLevel > 1) {
        setIsDragging(true);
      }
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStateRef.current.startDist = dist;
      touchStateRef.current.startZoom = zoomLevel;
      touchStateRef.current.touchCount = 2;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging && zoomLevel > 1) {
      const deltaX = e.touches[0].clientX - touchStateRef.current.startX;
      const deltaY = e.touches[0].clientY - touchStateRef.current.startY;
      setPan({
        x: touchStateRef.current.panX + deltaX,
        y: touchStateRef.current.panY + deltaY
      });
    } else if (e.touches.length === 2 && touchStateRef.current.startDist > 0) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / touchStateRef.current.startDist;
      const targetZoom = Math.min(4.0, Math.max(0.25, touchStateRef.current.startZoom * scale));
      setZoomLevel(Number(targetZoom.toFixed(2)));
    }
  };

  const handleTouchEnd = (e) => {
    setIsDragging(false);
    // Handle swipe gesture at fit (zoom <= 1)
    if (touchStateRef.current.touchCount === 1 && zoomLevel <= 1 && e.changedTouches.length === 1) {
      const diffX = e.changedTouches[0].clientX - touchStateRef.current.startX;
      const diffY = e.changedTouches[0].clientY - touchStateRef.current.startY;
      if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
        if (diffX < 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    }
    touchStateRef.current.touchCount = 0;
  };

  // Image failure recovery (Short-lived signed URL expiration handling)
  const handleImageError = async () => {
    if (!currentDoc) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    const docKey = String(currentDoc.id || currentDoc.type);
    if (!refreshAttempted[docKey] && onRefreshUrl) {
      setRefreshAttempted((prev) => ({ ...prev, [docKey]: true }));
      try {
        const freshUrl = await onRefreshUrl(currentDoc);
        if (freshUrl) {
          setCurrentResolvedUrl(freshUrl);
          setIsLoading(true);
          setHasError(false);
          return;
        }
      } catch (_) {}
    }

    setIsLoading(false);
    setHasError(true);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    if (onRefreshUrl && currentDoc) {
      onRefreshUrl(currentDoc)
        .then((freshUrl) => {
          if (freshUrl) setCurrentResolvedUrl(freshUrl);
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setCurrentResolvedUrl((prev) => `${prev.split('?')[0]}?retry=${Date.now()}`);
    }
  };

  if (!isOpen) return null;

  // Format Truthful Meta line
  const metaParts = [];
  if (currentDoc) {
    // 1. Capture Source (from stored truth)
    if (currentDoc.captureSource) {
      const isLive = ['live_capture', 'in_app', 'camera'].includes(currentDoc.captureSource);
      metaParts.push(isLive ? 'Live capture' : 'Uploaded file');
    } else if (currentDoc.isUploadFallback !== undefined) {
      metaParts.push(currentDoc.isUploadFallback ? 'Uploaded file' : 'Live capture');
    }

    // 2. IST Timestamp
    if (currentDoc.uploadedAt) {
      metaParts.push(currentDoc.uploadedAt);
    }

    // 3. Aadhaar masked to last 4 digits only
    if (currentDoc.last4) {
      metaParts.push(`XXXX XXXX ${currentDoc.last4}`);
    }

    // 4. Recorded automated results (only when recorded)
    if (currentDoc.automatedChecks) {
      const checks = currentDoc.automatedChecks;
      if (checks.faceFound !== undefined && checks.faceFound !== null) {
        metaParts.push(checks.faceFound ? 'Face detected' : 'Face not detected');
      }
      if (checks.quality?.pass !== undefined) {
        metaParts.push(checks.quality.pass ? 'Image quality: good' : 'Image quality: poor');
      }
      if (checks.signature?.verified !== undefined) {
        metaParts.push(checks.signature.verified ? 'QR signature verified' : 'QR signature not verified');
      }
      if (checks.checksum !== undefined) {
        metaParts.push(checks.checksum ? 'Checksum valid' : 'Checksum invalid');
      }
      if (checks.nameMatch && typeof checks.nameMatch === 'number') {
        metaParts.push(`Name match: ${Math.round(checks.nameMatch * 100)}%`);
      }
    }
  }

  const metaString = metaParts.join(' · ');
  const isPdf = currentDoc?.mimeType === 'application/pdf' || (currentDoc?.url && currentDoc.url.includes('.pdf'));

  // Watermark text
  const username = adminUser?.username || 'admin';
  const now = new Date();
  const timeFormatted = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
  const watermarkText = `NivaaroFix Audit · ${username} · ${timeFormatted}`;

  // Container styling for embedded vs fullscreen
  const containerStyle = mode === 'fullscreen' ? {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    color: '#0f172a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    opacity: 1,
    transition: prefersReducedMotion ? 'none' : 'opacity 200ms ease'
  } : {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 480,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: '#0f172a',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 12,
    border: '1px solid rgba(16, 32, 26, 0.10)',
    overflow: 'hidden'
  };

  return (
    <div
      ref={viewerContainerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Document viewer: ${currentDoc?.title || 'Preview'}`}
      style={containerStyle}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={-1}
    >
      {/* Screen Reader Announcements */}
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        Document {effectiveIndex + 1} of {totalDocs}: {currentDoc?.title || 'Document'}
      </div>

      {/* Faint Tiled Watermark (8% opacity, fixed to viewport, pointer-events none) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10,
          opacity: 0.08,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '96px 48px',
          padding: '80px 48px',
          alignContent: 'space-around',
          justifyItems: 'center',
          userSelect: 'none',
          transform: 'rotate(-12deg)'
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#0f172a',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap'
            }}
          >
            {watermarkText}
          </span>
        ))}
      </div>

      {/* Header Bar (64px) */}
      <header
        style={{
          height: 64,
          boxSizing: 'border-box',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(16, 32, 26, 0.08)',
          zIndex: 25,
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          flexShrink: 0
        }}
      >
        {/* Left: Title & Truthful Meta */}
        <div style={{ minWidth: 0, paddingRight: 16 }}>
          <h1
            style={{
              fontSize: 15,
              lineHeight: '22px',
              fontWeight: 600,
              color: '#0f172a',
              letterSpacing: '-0.01em',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {currentDoc?.title || 'Document'}
          </h1>
          {metaString && (
            <div
              style={{
                fontSize: 12,
                lineHeight: '18px',
                fontWeight: 400,
                color: '#64748b',
                margin: '2px 0 0 0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em'
              }}
            >
              {metaString}
            </div>
          )}
        </div>

        {/* Right: Close or Mode Trigger Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {mode === 'embedded' && (
            <button
              type="button"
              onClick={() => {
                // Expand embedded into full-screen mode
                const url = new URL(window.location.href);
                if (currentDoc) url.searchParams.set('viewer', String(currentDoc.id || currentDoc.type));
                window.history.pushState(null, '', url.toString());
                if (onClose) onClose('expand_fullscreen');
              }}
              title="Expand full screen"
              aria-label="Expand full screen"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid rgba(16, 32, 26, 0.10)',
                background: 'rgba(255, 255, 255, 0.90)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: '#334155',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 140ms ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#0f172a';
                e.currentTarget.style.borderColor = 'rgba(16, 32, 26, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.90)';
                e.currentTarget.style.color = '#334155';
                e.currentTarget.style.borderColor = 'rgba(16, 32, 26, 0.10)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            title="Close (Esc)"
            aria-label="Close document viewer"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid rgba(16, 32, 26, 0.10)',
              background: 'rgba(255, 255, 255, 0.90)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: '#334155',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.borderColor = 'rgba(16, 32, 26, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.90)';
              e.currentTarget.style.color = '#334155';
              e.currentTarget.style.borderColor = 'rgba(16, 32, 26, 0.10)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Stage: Fits File to Screen without Scrollbars */}
      <main
        ref={stageRef}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        {/* Loading Skeleton */}
        {isLoading && !hasError && !currentResolvedUrl && (
          <div
            role="status"
            aria-label="Loading document"
            style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              zIndex: 12
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '3px solid rgba(16, 32, 26, 0.12)',
                borderTopColor: '#059669',
                animation: prefersReducedMotion ? 'none' : 'adminSpin 0.8s linear infinite'
              }}
            />
          </div>
        )}

        {/* Centered Error State with Retry Button */}
        {hasError && (
          <div
            style={{
              zIndex: 15,
              textAlign: 'center',
              maxWidth: 380,
              padding: '24px 32px',
              background: 'rgba(255, 255, 255, 0.90)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 16,
              border: '1px solid rgba(16, 32, 26, 0.10)',
              boxShadow: '0 20px 48px -12px rgba(16, 32, 26, 0.12)'
            }}
          >
            <p style={{ fontSize: 14, lineHeight: '20px', color: '#334155', margin: '0 0 16px 0' }}>
              Unable to display document. The preview link may have expired or is unavailable.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                height: 36,
                padding: '0 16px',
                borderRadius: 10,
                border: '1px solid rgba(16, 32, 26, 0.16)',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Media Canvas Stage (Image or PDF) */}
        {currentResolvedUrl && !hasError && (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoomLevel}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: (isDragging || prefersReducedMotion) ? 'none' : 'transform 120ms ease-out, opacity 150ms ease',
              opacity: isChangingFile ? 0 : 1,
              willChange: 'transform'
            }}
          >
            {isPdf ? (
              <iframe
                src={`${currentResolvedUrl}#toolbar=0&navpanes=0`}
                title={currentDoc?.title || 'PDF Document'}
                onLoad={() => setIsLoading(false)}
                onError={handleImageError}
                style={{
                  width: '90%',
                  height: '90%',
                  border: 'none',
                  borderRadius: 8,
                  pointerEvents: isDragging ? 'none' : 'auto'
                }}
              />
            ) : (
              <img
                src={currentResolvedUrl}
                alt={currentDoc?.title || 'Preview'}
                draggable={false}
                onLoad={() => setIsLoading(false)}
                onError={handleImageError}
                ref={(img) => {
                  if (img && img.complete && img.naturalWidth > 0 && isLoading) {
                    setIsLoading(false);
                  }
                }}
                style={{
                  maxWidth: 'calc(100% - 48px)',
                  maxHeight: 'calc(100% - 48px)',
                  objectFit: 'contain',
                  borderRadius: 10,
                  boxShadow: '0 24px 64px -12px rgba(16, 32, 26, 0.18), 0 0 0 1px rgba(16, 32, 26, 0.08)',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              />
            )}
          </div>
        )}

        {/* Floating Glass Toolbar (48px high, fully rounded, blur 16px) */}
        <nav
          role="toolbar"
          aria-label="Viewer controls"
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            height: 48,
            borderRadius: 9999,
            backgroundColor: 'rgba(30, 36, 33, 0.72)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            boxShadow: '0 20px 48px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 0 rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
            gap: 2,
            zIndex: 30,
            userSelect: 'none'
          }}
        >
          {/* Previous & Next File Controls (Hidden when only 1 file) */}
          {totalDocs > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                title="Previous (Left arrow)"
                aria-label="Previous file"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.85)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 140ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <span
                style={{
                  fontSize: 13,
                  lineHeight: '20px',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.95)',
                  padding: '0 8px',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap'
                }}
              >
                {effectiveIndex + 1} / {totalDocs}
              </span>

              <button
                type="button"
                onClick={handleNext}
                title="Next (Right arrow)"
                aria-label="Next file"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.85)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 140ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <div
                style={{
                  width: 1,
                  height: 18,
                  background: 'rgba(255, 255, 255, 0.14)',
                  margin: '0 4px'
                }}
                aria-hidden="true"
              />
            </>
          )}

          {/* Zoom Out Button */}
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.25}
            title="Zoom out (-)"
            aria-label="Zoom out"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: zoomLevel <= 0.25 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.85)',
              cursor: zoomLevel <= 0.25 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease'
            }}
            onMouseEnter={(e) => {
              if (zoomLevel > 0.25) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = zoomLevel <= 0.25 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.85)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* Zoom Level Indicator */}
          <span
            style={{
              fontSize: 13,
              lineHeight: '20px',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.95)',
              minWidth: 46,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap'
            }}
          >
            {Math.round(zoomLevel * 100)}%
          </span>

          {/* Zoom In Button */}
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 4.0}
            title="Zoom in (+)"
            aria-label="Zoom in"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: zoomLevel >= 4.0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.85)',
              cursor: zoomLevel >= 4.0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease'
            }}
            onMouseEnter={(e) => {
              if (zoomLevel < 4.0) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = zoomLevel >= 4.0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.85)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* Fit to Screen Button */}
          <button
            type="button"
            onClick={handleResetFit}
            title="Fit to screen (0)"
            aria-label="Fit to screen"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.85)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>

          {/* Rotate 90° Clockwise Button */}
          <button
            type="button"
            onClick={handleRotate}
            title="Rotate 90 degrees (R)"
            aria-label="Rotate 90 degrees"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.85)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </nav>
      </main>
    </div>
  );
}
