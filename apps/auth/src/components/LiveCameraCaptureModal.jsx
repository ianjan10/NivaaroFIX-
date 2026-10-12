import React, { useState, useRef, useEffect } from 'react';

export default function LiveCameraCaptureModal({ isOpen, onClose, onCapture }) {
  const [stream, setStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setCameraError('');
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError('');
    setCapturedPhoto(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported by your browser.');
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user'
        },
        audio: false
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera detected on your device.');
      } else {
        setCameraError('Unable to open camera. Please ensure no other application is using it.');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const startX = ((video.videoWidth || size) - size) / 2;
    const startY = ((video.videoHeight || size) - size) / 2;

    // Draw square cropped snapshot centered
    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const handleConfirmPhoto = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(16, 24, 32, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeInOverlay 0.2s ease'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--bg-card-border, #e3ddd0)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(16, 24, 32, 0.25)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.1rem 1.25rem',
          borderBottom: '1px solid var(--bg-card-border, #e3ddd0)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <h3 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--text-primary, #1e3a5f)',
              margin: 0
            }}>
              {capturedPhoto ? 'Preview Snapshot' : 'Take Live Photo'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live camera modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #5A6472)',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Viewfinder / Camera Stage */}
        <div style={{
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#151c26'
        }}>
          {cameraError ? (
            <div style={{
              padding: '1.5rem 1rem',
              textAlign: 'center',
              color: '#f7f5f1',
              fontSize: '0.88rem',
              lineHeight: 1.5
            }}>
              <div style={{ display: 'inline-flex', padding: '0.6rem', borderRadius: '50%', background: 'rgba(169, 121, 60, 0.15)', color: '#a9793c', marginBottom: '0.75rem' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#a9793c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p style={{ margin: '0 0 1rem', color: '#f7f5f1' }}>{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                aria-label="Retry opening camera"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.84rem'
                }}
              >
                Retry Camera
              </button>
            </div>
          ) : capturedPhoto ? (
            <div style={{
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #B8862F',
              boxShadow: '0 0 24px rgba(184, 134, 47, 0.4)'
            }}>
              <img
                src={capturedPhoto}
                alt="Captured Snapshot"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            <div style={{
              position: 'relative',
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #a9793c',
              boxShadow: '0 0 24px rgba(169, 121, 60, 0.35)',
              background: '#000000'
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // Mirror view
                }}
              />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{
          padding: '1.25rem',
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'center',
          background: 'var(--bg-card, #ffffff)'
        }}>
          {capturedPhoto ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                aria-label="Retake snapshot"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#faf8f4',
                  border: '1px solid #e3ddd0',
                  borderRadius: '9px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  color: '#1e3a5f',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem'
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmPhoto}
                aria-label="Confirm and use this photo"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#101820',
                  border: 'none',
                  borderRadius: '9px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem'
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Use This Photo</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cancel live photo"
                style={{
                  padding: '0.75rem 1.25rem',
                  background: '#faf8f4',
                  border: '1px solid #e3ddd0',
                  borderRadius: '9px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  color: '#5A6472',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                disabled={Boolean(cameraError)}
                aria-label="Capture snapshot from camera"
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: cameraError ? '#8C96A5' : '#1e3a5f',
                  border: 'none',
                  borderRadius: '9px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: '#ffffff',
                  cursor: cameraError ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem'
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Capture Snapshot</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
