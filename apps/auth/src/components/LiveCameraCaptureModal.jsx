import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import {
  ANALYSIS_CONFIG,
  GUIDANCE_MESSAGES,
  createFaceDetector,
  analyzeFrameQuality,
  GuidanceHysteresis,
  analyzeStillQuality
} from '../utils/faceAnalysis';

/**
 * LiveCameraCaptureModal
 *
 * Refined, minimalist, calm, and accessible live camera photo capture
 * for professional verification.
 */
export default function LiveCameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  mode = 'avatar', // 'avatar' | 'document'
  title = null
}) {
  // Flow States: 'pre_permission' | 'starting' | 'live' | 'review' | 'uploading' | 'error'
  const [flowState, setFlowState] = useState('pre_permission');
  const [cameraErrorType, setCameraErrorType] = useState(null); // 'denied' | 'not_found' | 'busy' | 'unsupported'

  const [stream, setStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedMeta, setCapturedMeta] = useState(null);
  const [isUploadFallback, setIsUploadFallback] = useState(false);

  // Guidance & Ring state
  const [guidanceMessage, setGuidanceMessage] = useState(GUIDANCE_MESSAGES.camera_starting);
  const [guidanceState, setGuidanceState] = useState('camera_starting');
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [isConditionsGood, setIsConditionsGood] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 1

  // Shutter flash & pulse
  const [isShutterActive, setIsShutterActive] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);

  // Still photo review state
  const [stillQuality, setStillQuality] = useState({ isBlurry: false, guidanceText: 'Looks good?' });

  // Refs
  const titleId = useId();
  const videoRef = useRef(null);
  const analysisCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const captureBtnRef = useRef(null);

  // Auto-capture & detector tracking
  const hysteresisRef = useRef(new GuidanceHysteresis(ANALYSIS_CONFIG.stateHysteresisMs));
  const faceDetectorRef = useRef(null);
  const historyRef = useRef({ laplacianBuffer: [], consecutiveBlurCount: 0 });
  const readyStartTimeRef = useRef(null);
  const lastAnalyzedTimeRef = useRef(0);

  // Helper: Stop all media tracks immediately
  const stopAllMediaTracks = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    readyStartTimeRef.current = null;
    setHoldProgress(0);
  }, [stream]);

  // Request camera and initialize stream
  const startCamera = async () => {
    setCameraErrorType(null);
    setCapturedPhoto(null);
    setCapturedMeta(null);
    setIsUploadFallback(false);
    setHoldProgress(0);
    readyStartTimeRef.current = null;
    historyRef.current = { laplacianBuffer: [], consecutiveBlurCount: 0 };
    hysteresisRef.current.reset('camera_starting');
    setGuidanceMessage(GUIDANCE_MESSAGES.camera_starting);
    setGuidanceState('camera_starting');
    setFlowState('starting');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraErrorType('unsupported');
        setFlowState('error');
        return;
      }

      // Constraints: facingMode user or environment, ideal 1280x720, ideal 30fps
      let mediaStream;
      const primaryConstraints = {
        video: {
          facingMode: mode === 'document' ? { ideal: 'environment' } : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      };

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (camErr) {
        // Fallback for devices without back camera or strict facingMode constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      // Where supported, apply continuous exposure & focus modes
      try {
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack?.getCapabilities) {
          const caps = videoTrack.getCapabilities();
          const advanced = [];
          if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
          if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
          if (caps.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
          if (advanced.length > 0) {
            await videoTrack.applyConstraints({ advanced });
          }
        }
      } catch (e) {
        // Continuous mode non-critical
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      setFlowState('live');
    } catch (err) {
      console.warn('Camera request error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraErrorType('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraErrorType('not_found');
      } else {
        setCameraErrorType('busy');
      }
      setFlowState('error');
    }
  };

  // Safe visibility change & tab switch listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAllMediaTracks();
      } else if (isOpen && flowState === 'live') {
        startCamera();
      }
    };

    const handleBeforeUnload = () => {
      stopAllMediaTracks();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOpen, flowState, stopAllMediaTracks]);

  // Open / Close lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopAllMediaTracks();
      setCapturedPhoto(null);
      setCapturedMeta(null);
      setFlowState('pre_permission');
      setCameraErrorType(null);
      setIsUploadFallback(false);
      return;
    }

    // Default to pre-permission state calm flow
    setFlowState('pre_permission');
    setCameraErrorType(null);

    return () => {
      stopAllMediaTracks();
    };
  }, [isOpen]);

  // Focus trap and keyboard listeners (Esc to close, Space/Enter to capture when ready)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && flowState === 'live') {
        // Prevent default space scroll
        e.preventDefault();
        triggerCaptureSnapshot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flowState, isConditionsGood]);

  // Expose trigger for automated test suites / accessibility runners
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__triggerLiveCapture = (scores = null) => triggerCaptureSnapshot(scores);
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__triggerLiveCapture;
      }
    };
  }, [flowState]);

  // Frame Analysis Loop (~15 fps)
  useEffect(() => {
    if (!stream || flowState !== 'live') return;

    let isActive = true;

    const loop = async (timestamp) => {
      if (!isActive) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        // Throttle to ~15 fps (every ~66ms)
        const now = Date.now();
        if (now - lastAnalyzedTimeRef.current >= 66) {
          lastAnalyzedTimeRef.current = now;

          const dw = ANALYSIS_CONFIG.downscaleWidth;
          const dh = ANALYSIS_CONFIG.downscaleHeight;

          if (!analysisCanvasRef.current) {
            analysisCanvasRef.current = document.createElement('canvas');
            analysisCanvasRef.current.width = dw;
            analysisCanvasRef.current.height = dh;
          }

          const canvas = analysisCanvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            if (mode === 'document') {
              // Document Mode: Card-shaped analysis without face detection
              ctx.drawImage(video, 0, 0, dw, dh);
              const imgData = ctx.getImageData(0, 0, dw, dh);
              const data = imgData.data;
              let sum = 0;
              for (let i = 0; i < data.length; i += 4) {
                sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              }
              const meanLum = sum / (data.length / 4);

              let targetMsg = 'Hold document steady in frame';
              let targetState = 'ready';
              if (meanLum < 30) {
                targetMsg = 'Find more light';
                targetState = 'too_dark';
              } else if (meanLum > 240) {
                targetMsg = 'Too bright. Face a softer light';
                targetState = 'too_bright';
              }

              if (targetMsg !== guidanceMessage) {
                setIsCrossfading(true);
                setTimeout(() => {
                  setGuidanceMessage(targetMsg);
                  setGuidanceState(targetState);
                  setIsCrossfading(false);
                }, ANALYSIS_CONFIG.crossfadeDurationMs);
              }

              setIsConditionsGood(true);
            } else {
              // Avatar Mode: Centered square crop with face detection
              const vw = video.videoWidth || dw;
              const vh = video.videoHeight || dh;
              const size = Math.min(vw, vh);
              const sx = (vw - size) / 2;
              const sy = (vh - size) / 2;

              ctx.drawImage(video, sx, sy, size, size, 0, 0, dw, dh);
              const imgData = ctx.getImageData(0, 0, dw, dh);

              // Detect faces
              let detectedFaces = [];
              try {
                if (!faceDetectorRef.current) {
                  faceDetectorRef.current = createFaceDetector();
                }
                detectedFaces = await faceDetectorRef.current.detect(canvas, ctx, dw, dh);
              } catch (err) {
                detectedFaces = [];
              }

              // Analyze frame quality with configured priority
              const qualityRes = analyzeFrameQuality(imgData, detectedFaces, historyRef.current);

              // Pass through state hysteresis (600ms hold time prevents flicker)
              const stableState = hysteresisRef.current.update(qualityRes.state, now);
              const newGuidanceMsg = GUIDANCE_MESSAGES[stableState] || GUIDANCE_MESSAGES.no_face;

              if (newGuidanceMsg !== guidanceMessage) {
                setIsCrossfading(true);
                setTimeout(() => {
                  setGuidanceMessage(newGuidanceMsg);
                  setGuidanceState(stableState);
                  setIsCrossfading(false);
                }, ANALYSIS_CONFIG.crossfadeDurationMs);
              }

              const ready = qualityRes.isReady && stableState === 'ready';
              setIsConditionsGood(ready);

              // Auto-capture countdown (~1.5s hold time)
              if (ready) {
                if (!readyStartTimeRef.current) {
                  readyStartTimeRef.current = now;
                }
                const elapsed = now - readyStartTimeRef.current;
                const progress = Math.min(1, elapsed / ANALYSIS_CONFIG.autoCaptureHoldMs);
                setHoldProgress(progress);

                if (elapsed >= ANALYSIS_CONFIG.autoCaptureHoldMs) {
                  readyStartTimeRef.current = null;
                  triggerCaptureSnapshot(qualityRes.scores);
                  return;
                }
              } else {
                readyStartTimeRef.current = null;
                setHoldProgress(0);
              }
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isActive = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [stream, flowState, guidanceMessage]);

  // Capture Still Snapshot
  const triggerCaptureSnapshot = (capturedScores = null) => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Soft shutter flash & scale pulse
    setIsShutterActive(true);
    setIsPulsing(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}

    setTimeout(() => {
      setIsShutterActive(false);
      setIsPulsing(false);
    }, 120);

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;

    let photoDataUrl;
    let stillEval;

    if (mode === 'document') {
      const canvas = document.createElement('canvas');
      const targetWidth = Math.min(1280, vWidth);
      const targetHeight = Math.min(vHeight, Math.round(targetWidth / 1.586));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      const startX = Math.max(0, (vWidth - targetWidth) / 2);
      const startY = Math.max(0, (vHeight - targetHeight) / 2);

      ctx.drawImage(video, startX, startY, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);
      photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      stillEval = { isBlurry: false, guidanceText: 'Looks clear and readable?' };
    } else {
      // Capture full-frame un-mirrored JPEG portrait crop
      const size = Math.min(vWidth, vHeight);
      const startX = (vWidth - size) / 2;
      const startY = Math.max(0, (vHeight - size) / 2);

      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      // Note: NOT mirrored!
      ctx.drawImage(video, startX, startY, size, size, 0, 0, 720, 720);
      photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Evaluate still quality for review screen
      const stillImgData = ctx.getImageData(0, 0, 720, 720);
      stillEval = analyzeStillQuality(stillImgData);
    }
    setStillQuality(stillEval);

    setCapturedPhoto(photoDataUrl);
    setCapturedMeta({
      qualityScores: capturedScores || stillEval.qualityScores || { mode },
      isUploadFallback: false
    });

    stopAllMediaTracks();
    setFlowState('review');
  };

  // Retake
  const handleRetake = () => {
    setCapturedPhoto(null);
    setCapturedMeta(null);
    startCamera();
  };

  // Confirm and upload photo
  const handleUsePhoto = async (overrideFlag = false) => {
    if (!capturedPhoto) return;
    setFlowState('uploading');

    // Display upload progress ring and animated check mark (~400ms)
    setTimeout(() => {
      onCapture(capturedPhoto, {
        isUploadFallback: isUploadFallback || overrideFlag,
        qualityScores: capturedMeta?.qualityScores || null
      });
      onClose();
    }, 450);
  };

  // Fallback Upload from File
  const handleFallbackFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG or PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedPhoto(event.target.result);
      setIsUploadFallback(true);
      setStillQuality({ isBlurry: false, guidanceText: 'Looks good?' });
      setCapturedMeta({
        qualityScores: { status: 'manual_upload_fallback' },
        isUploadFallback: true
      });
      setFlowState('review');
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  // Viewport & Circle Dimensions
  const circleSize = 290;
  const radius = circleSize / 2;
  const strokeWidth = 4;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - holdProgress * circumference;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="nivaaro-live-camera-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 20, 16, 0.32)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
        animation: 'cameraFadeIn 220ms ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && flowState !== 'uploading') onClose();
      }}
    >
      <style>{`
        @keyframes cameraFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathingNeutral {
          0% { opacity: 0.35; }
          50% { opacity: 0.8; }
          100% { opacity: 0.35; }
        }
        @keyframes checkmarkPop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes uploadSpin {
          to { transform: rotate(360deg); }
        }
        .breathing-ring {
          animation: breathingNeutral 2s infinite ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .nivaaro-live-camera-backdrop {
            animation: none !important;
          }
          .breathing-ring {
            animation: none !important;
            opacity: 0.6 !important;
          }
          .nivaaro-camera-circle {
            transition: none !important;
            transform: none !important;
          }
        }
        @media (max-width: 480px) {
          .nivaaro-camera-sheet {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            border: none !important;
            justify-content: space-between !important;
            padding: calc(16px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px)) 20px !important;
          }
        }
      `}</style>

      {/* Floating Glass Sheet */}
      <div
        ref={dialogRef}
        className="nivaaro-camera-sheet"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          borderRadius: '24px',
          boxShadow: '0 24px 48px -12px rgba(10, 20, 16, 0.22), 0 8px 16px -4px rgba(10, 20, 16, 0.12)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title and Close Button */}
        <div style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#0f172a',
              letterSpacing: '-0.015em'
            }}
          >
            {title || (mode === 'document' ? 'Capture document' : 'Take your photo')}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo capture"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0, 0, 0, 0.05)',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease'
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 1. PRE-PERMISSION SCREEN */}
        {/* ------------------------------------------------------------- */}
        {flowState === 'pre_permission' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '24px 8px 12px 8px',
            width: '100%'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(4, 120, 87, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#047857',
              marginBottom: '16px'
            }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>

            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
              Allow camera access
            </div>
            <div style={{ fontSize: '0.92rem', color: '#64748b', marginBottom: '28px', maxWidth: '300px' }}>
              {mode === 'document' ? 'Used only to capture your document for verification.' : 'Used only to take your verification photo.'}
            </div>

            <button
              type="button"
              onClick={startCamera}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: '#047857',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              Allow camera
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginTop: '14px',
                padding: '6px 12px'
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 2. ERROR / BLOCKED / BUSY / NO CAMERA SCREEN */}
        {/* ------------------------------------------------------------- */}
        {flowState === 'error' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '24px 8px 12px 8px',
            width: '100%'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(100, 116, 139, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              marginBottom: '16px'
            }}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <p style={{
              fontSize: '0.95rem',
              color: '#334155',
              lineHeight: 1.5,
              margin: '0 0 24px 0',
              maxWidth: '340px'
            }}>
              {cameraErrorType === 'denied' &&
                "Camera is blocked. Turn it on in your browser's site settings, then try again."}
              {cameraErrorType === 'not_found' &&
                'No camera found.'}
              {cameraErrorType === 'busy' &&
                'Camera is busy. Close other apps using it and try again.'}
              {cameraErrorType === 'unsupported' &&
                'Camera access is not supported by your browser.'}
            </p>

            {cameraErrorType === 'not_found' ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#047857',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                  }}
                >
                  Upload a photo instead
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: 'none' }}
                  onChange={handleFallbackFileSelect}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#047857',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer'
                }}
              >
                Try again
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginTop: '14px',
                padding: '6px 12px'
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 3. LIVE CAPTURE & REVIEW STAGE */}
        {/* ------------------------------------------------------------- */}
        {(flowState === 'starting' || flowState === 'live' || flowState === 'review' || flowState === 'uploading') && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%'
          }}>
            {/* Viewfinder: Card Rounded-Rect for Documents OR 4px Ring Circle for Avatar */}
            {mode === 'document' ? (
              <div
                className="nivaaro-camera-card"
                style={{
                  position: 'relative',
                  width: '320px',
                  height: '202px',
                  maxWidth: '85vw',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  background: '#f8fafc',
                  border: isConditionsGood ? '3px solid #047857' : '3px solid #cbd5e1',
                  boxShadow: '0 12px 28px -6px rgba(10, 20, 16, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: isPulsing ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform 120ms ease-out, border-color 200ms ease'
                }}
              >
                {/* Shutter White Flash Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255, 255, 255, 0.85)',
                    opacity: isShutterActive ? 1 : 0,
                    pointerEvents: 'none',
                    zIndex: 20,
                    transition: 'opacity 120ms ease-out'
                  }}
                />

                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Captured document"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                )}

                {/* Upload Success Checkmark */}
                {flowState === 'uploading' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(255, 255, 255, 0.88)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 30,
                      animation: 'checkmarkPop 380ms ease-out forwards'
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="nivaaro-camera-circle"
                style={{
                  position: 'relative',
                  width: `${circleSize}px`,
                  height: `${circleSize}px`,
                  maxWidth: '80vw',
                  maxHeight: '80vw',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: isPulsing ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform 120ms ease-out'
                }}
              >
                {/* SVG 4px Ring: Neutral Breathing or Green Progress */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    transform: 'rotate(-90deg)',
                    pointerEvents: 'none'
                  }}
                >
                  {/* Background Ring Track */}
                  <circle
                    cx={radius}
                    cy={radius}
                    r={normalizedRadius}
                    fill="none"
                    stroke={isConditionsGood ? 'rgba(4, 120, 87, 0.2)' : '#cbd5e1'}
                    strokeWidth={strokeWidth}
                    className={!isConditionsGood && flowState === 'live' ? 'breathing-ring' : ''}
                  />

                  {/* Progress Ring Clockwise Fill */}
                  {isConditionsGood && flowState === 'live' && (
                    <circle
                      cx={radius}
                      cy={radius}
                      r={normalizedRadius}
                      fill="none"
                      stroke="#047857"
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 60ms linear' }}
                    />
                  )}

                  {/* Uploading progress spinner */}
                  {flowState === 'uploading' && (
                    <circle
                      cx={radius}
                      cy={radius}
                      r={normalizedRadius}
                      fill="none"
                      stroke="#047857"
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${circumference * 0.3} ${circumference * 0.7}`}
                      style={{
                        transformOrigin: 'center',
                        animation: 'uploadSpin 0.9s linear infinite'
                      }}
                    />
                  )}
                </svg>

                {/* Shutter White Flash Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.85)',
                    opacity: isShutterActive ? 1 : 0,
                    pointerEvents: 'none',
                    zIndex: 20,
                    transition: 'opacity 120ms ease-out'
                  }}
                />

                {/* Video Preview or Captured Photo Inside Circle */}
                <div
                  style={{
                    position: 'absolute',
                    inset: `${strokeWidth + 2}px`,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {capturedPhoto ? (
                    <img
                      src={capturedPhoto}
                      alt="Captured portrait"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                        // NOT mirrored!
                      }}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)' // Preview mirrored only
                      }}
                    />
                  )}

                  {/* Upload Success Checkmark */}
                  {flowState === 'uploading' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(255, 255, 255, 0.88)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 30,
                        animation: 'checkmarkPop 380ms ease-out forwards'
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Single Line Guidance Text (15px, medium weight, crossfading) */}
            <div
              aria-live="polite"
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: '#1e293b',
                marginTop: '18px',
                marginBottom: '22px',
                textAlign: 'center',
                minHeight: '22px',
                opacity: isCrossfading ? 0 : 1,
                transition: `opacity ${ANALYSIS_CONFIG.crossfadeDurationMs}ms ease-out`
              }}
            >
              {flowState === 'review' || flowState === 'uploading'
                ? stillQuality.guidanceText
                : guidanceMessage}
            </div>

            {/* Actions Area */}
            {flowState === 'review' || flowState === 'uploading' ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {stillQuality.isBlurry ? (
                  <>
                    <button
                      type="button"
                      onClick={handleRetake}
                      disabled={flowState === 'uploading'}
                      style={{
                        width: '100%',
                        height: '48px',
                        borderRadius: '12px',
                        border: 'none',
                        background: '#047857',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        cursor: 'pointer'
                      }}
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUsePhoto(true)}
                      disabled={flowState === 'uploading'}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        marginTop: '12px',
                        padding: '6px 12px'
                      }}
                    >
                      Use anyway
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUsePhoto(false)}
                      disabled={flowState === 'uploading'}
                      style={{
                        width: '100%',
                        height: '48px',
                        borderRadius: '12px',
                        border: 'none',
                        background: '#047857',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        cursor: 'pointer'
                      }}
                    >
                      {mode === 'document' ? 'Use document' : 'Use photo'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRetake}
                      disabled={flowState === 'uploading'}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        marginTop: '12px',
                        padding: '6px 12px'
                      }}
                    >
                      Retake
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* 48px Brand Green Capture Button */}
                <button
                  ref={captureBtnRef}
                  type="button"
                  onClick={() => triggerCaptureSnapshot()}
                  disabled={flowState === 'starting'}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#047857',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    cursor: flowState === 'starting' ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(4, 120, 87, 0.22)',
                    transition: 'background 200ms ease, transform 100ms ease'
                  }}
                >
                  Capture
                </button>

                {/* Quiet Cancel Link */}
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    marginTop: '12px',
                    padding: '6px 12px'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
