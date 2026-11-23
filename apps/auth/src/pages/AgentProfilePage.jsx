import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useToastNotification } from '../context/ToastNotificationContext';
import IndianPhoneInput from '../components/IndianPhoneInput';
import LiveCameraCaptureModal from '../components/LiveCameraCaptureModal';
import MobileVerificationSheet from '../components/MobileVerificationSheet';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import BrandLogo from '../components/BrandLogo';
import AddressField from '../components/AddressField';
import ExperienceStepper, { formatExperience } from '../components/ExperienceStepper';
import { apiClient, setStoredSessionToken } from '../services/apiClient';

function isTestGarbagePhone(p) {
  if (!p) return false;
  const digits = String(p).replace(/\D/g, '');
  return digits === '0000000000' || digits === '1111111111';
}

function cleanPhone(rawPhone) {
  if (!rawPhone || isTestGarbagePhone(rawPhone)) return '';
  const digits = String(rawPhone).replace(/\+91\s*/g, '').replace(/\D/g, '').slice(-10);
  return isTestGarbagePhone(digits) ? '' : digits;
}

function formatProperCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function AgentProfilePage({ initialAgent, onSwitchPortal, onLogout }) {
  const { activeLanguage, setIsLangModalOpen, t = {} } = useLanguage();
  const { showToast } = useToastNotification();

  const fileInputRef = useRef(null);
  const aadhaarFileInputRef = useRef(null);
  const dlFileInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const profileWrapperRef = useRef(null);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Load partner data
  const [agent, setAgent] = useState(() => {
    if (initialAgent) return initialAgent;
    try {
      const params = new URLSearchParams(window.location.search);
      const agentParam = params.get('agent');
      if (agentParam) {
        let parsed = null;
        try {
          parsed = JSON.parse(agentParam);
        } catch {
          try {
            parsed = JSON.parse(decodeURIComponent(agentParam));
          } catch { }
        }
        if (parsed) {
          if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
          return parsed;
        }
      }
      const saved = localStorage.getItem('nivaaro-agent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Form State
  const [name, setName] = useState(agent?.name || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [phone, setPhone] = useState(cleanPhone(agent?.phone));
  const [partnerId, setPartnerId] = useState(agent?.partnerId || agent?.partner_id || 'PRO-202600042');
  const [trade, setTrade] = useState(() => (agent?.trade === 'plumber' ? 'plumber' : 'electrician'));
  const [experienceYears, setExperienceYears] = useState(() => {
    const raw = agent?.yearsOfExperience ?? agent?.years_of_experience ?? agent?.experienceYears ?? agent?.experience_years;
    if (raw !== undefined && raw !== null && raw !== '') {
      return Number(raw) || 0;
    }
    return 0;
  });
  const [address, setAddress] = useState(agent?.permanent_address || agent?.permanentAddress || agent?.address_text || agent?.address || '');
  const [addressFieldError, setAddressFieldError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(agent?.avatarUrl || agent?.avatar_url || '');

  // Baseline initial form snapshot for dirty-state tracking
  const [initialSnapshot, setInitialSnapshot] = useState({
    name: agent?.name || '',
    phone: cleanPhone(agent?.phone),
    experienceYears: Number(agent?.yearsOfExperience ?? agent?.years_of_experience ?? agent?.experienceYears ?? agent?.experience_years ?? 0),
    address: agent?.permanent_address || agent?.permanentAddress || agent?.address_text || agent?.address || ''
  });

  const [isPhoneVerified, setIsPhoneVerified] = useState(Boolean(agent?.isPhoneVerified || agent?.is_phone_verified));
  const [kycStatus, setKycStatus] = useState(agent?.kycStatus || agent?.kyc_status || 'pending');
  const [rejectionReason, setRejectionReason] = useState(agent?.rejectionReason || '');
  const [accountStatus, setAccountStatus] = useState(agent?.accountStatus || 'active');
  const [suspendedUntil, setSuspendedUntil] = useState(agent?.suspendedUntil || null);
  const [suspensionAttempts, setSuspensionAttempts] = useState(agent?.suspensionAttempts || 0);
  const [chancesRemaining, setChancesRemaining] = useState(agent?.chancesRemaining ?? 3);
  const [isBanned, setIsBanned] = useState(Boolean(agent?.isBanned || agent?.accountStatus === 'banned'));
  const [isCurrentlySuspended, setIsCurrentlySuspended] = useState(Boolean(agent?.isCurrentlySuspended));
  const [isSuspensionPeriodOver, setIsSuspensionPeriodOver] = useState(Boolean(agent?.isSuspensionPeriodOver));
  const [isFullyVerified, setIsFullyVerified] = useState(Boolean(agent?.kycStatus === 'verified' || agent?.kyc_status === 'verified' || (agent?.photo_verified && agent?.aadhaar_verified)));
  const [photoStatus, setPhotoStatus] = useState(agent?.photo_status || 'not_uploaded');
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const [reverifyPrompt, setReverifyPrompt] = useState(null); // { type: 'avatar' | 'aadhaar' | 'driving_license', title: string }

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [docCameraKey, setDocCameraKey] = useState(null); // 'aadhaar' | 'driving_license' | null
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [hasDocumentConsent, setHasDocumentConsent] = useState(() => {
    return Boolean(agent?.document_consent || agent?.consent_given || agent?.kyc_status === 'verified' || agent?.kyc_status === 'under_review');
  });

  // Popover dismissal tracking refs
  const hasDismissedThisVisitRef = useRef(false);
  const popoverContainerRef = useRef(null);

  useEffect(() => {
    window.__resetLocationPromptVisit = () => {
      hasDismissedThisVisitRef.current = false;
    };
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileWrapperRef.current && !profileWrapperRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = formatProperCase(agent?.name || name || 'Rahul');
  const displayEmail = agent?.email || email || 'rahul@gmail.com';

  // Document states
  const [documents, setDocuments] = useState({
    aadhaar: {
      status: 'not_uploaded', // 'not_uploaded' | 'uploading' | 'under_review' | 'verified' | 'needs_attention'
      fileName: '',
      fileSize: 0,
      fileUrl: '',
      last4: '',
      uploadedAt: null,
      rejectionReason: ''
    },
    driving_license: {
      status: 'not_uploaded',
      fileName: '',
      fileSize: 0,
      fileUrl: '',
      uploadedAt: null,
      rejectionReason: ''
    }
  });

  // Computed state machine flags for identity verification & review locking
  const isProfileVerified = Boolean((isFullyVerified || kycStatus === 'verified') && !isBanned && !isCurrentlySuspended && accountStatus !== 'suspended');
  const isLockedInReview = (kycStatus === 'under_review' || kycStatus === 'in_review') && !isProfileVerified;
  const isActionRequired = (kycStatus === 'needs_attention' || kycStatus === 'rejected') && !isProfileVerified && !isBanned && !isCurrentlySuspended;
  const hasLivePhoto = Boolean(avatarUrl || (photoStatus && photoStatus !== 'not_uploaded'));
  const effectiveProId = partnerId || agent?.partner_id || agent?.partnerId || agent?.id || '202600001';
  const displayAvatarUrl = avatarUrl || agent?.avatarUrl || agent?.photo_url || agent?.avatar_url || ((hasLivePhoto || photoStatus === 'verified' || photoStatus === 'under_review' || isProfileVerified || effectiveProId) ? `http://localhost:5000/api/verification/photo/stream?id=${effectiveProId}` : null);
  const displayAvatar = !avatarLoadError && (displayAvatarUrl || avatarUrl || agent?.avatarUrl || agent?.photo_url || agent?.avatar_url || '/images/plumber.png');
  const hasAadhaar = Boolean(
    documents.aadhaar?.fileName ||
    (documents.aadhaar?.status && documents.aadhaar?.status !== 'not_uploaded') ||
    documents.aadhaar?.last4
  );
  const canRequestVerification = hasLivePhoto && hasAadhaar && hasDocumentConsent && !isLockedInReview && !isProfileVerified && !isBanned && !isCurrentlySuspended;

  const [uploadProgress, setUploadProgress] = useState({ aadhaar: 0, driving_license: 0 });
  const [isUploadingDoc, setIsUploadingDoc] = useState({ aadhaar: false, driving_license: false });
  const [isDragging, setIsDragging] = useState({ aadhaar: false, driving_license: false });
  const uploadAbortControllers = useRef({});

  // Document preview modal state
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    title: '',
    fileName: '',
    fileUrl: ''
  });

  // Calculate dirty state
  const isDirty =
    name.trim() !== initialSnapshot.name.trim() ||
    phone !== initialSnapshot.phone ||
    Number(experienceYears || 0) !== Number(initialSnapshot.experienceYears || 0) ||
    address.trim() !== initialSnapshot.address.trim();

  // Fetch ground-truth profile & verification status from backend on mount using shared apiClient
  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const targetLookupId = partnerId || agent?.partner_id || agent?.partnerId || agent?.id || '202600002';
      try {
        const profileUrl = targetLookupId ? `/api/auth/agent-profile?partnerId=${encodeURIComponent(targetLookupId)}` : '/api/auth/agent-profile';
        const res = await apiClient(profileUrl);
        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.agent) {
            const dbAgent = data.agent;
            setName(dbAgent.name || '');
            setEmail(dbAgent.email || '');
            const cPhone = cleanPhone(dbAgent.phone);
            setPhone(cPhone);
            if (dbAgent.partnerId) setPartnerId(dbAgent.partnerId);
            if (dbAgent.trade) setTrade(dbAgent.trade === 'plumber' ? 'plumber' : 'electrician');
            const exp = Number(dbAgent.yearsOfExperience ?? dbAgent.experienceYears ?? 0);
            setExperienceYears(exp);
            const resolvedAddr = dbAgent.permanentAddress || dbAgent.permanent_address || dbAgent.address_text || dbAgent.address || '';
            if (resolvedAddr) setAddress(resolvedAddr);
            if (dbAgent.avatarUrl) setAvatarUrl(dbAgent.avatarUrl);
            setIsPhoneVerified(Boolean(dbAgent.isPhoneVerified));
            if (dbAgent.kycStatus) setKycStatus(dbAgent.kycStatus);
            if (dbAgent.rejectionReason) setRejectionReason(dbAgent.rejectionReason);
            if (dbAgent.accountStatus) setAccountStatus(dbAgent.accountStatus);
            if (dbAgent.suspendedUntil) setSuspendedUntil(dbAgent.suspendedUntil);
            if (dbAgent.suspensionAttempts !== undefined) setSuspensionAttempts(dbAgent.suspensionAttempts);
            if (dbAgent.chancesRemaining !== undefined) setChancesRemaining(dbAgent.chancesRemaining);
            if (dbAgent.isBanned !== undefined) setIsBanned(Boolean(dbAgent.isBanned));
            if (dbAgent.isCurrentlySuspended !== undefined) setIsCurrentlySuspended(Boolean(dbAgent.isCurrentlySuspended));
            if (dbAgent.isSuspensionPeriodOver !== undefined) setIsSuspensionPeriodOver(Boolean(dbAgent.isSuspensionPeriodOver));

            setInitialSnapshot({
              name: dbAgent.name || '',
              phone: cPhone,
              experienceYears: exp,
              address: resolvedAddr
            });

            // Sync localStorage
            const updated = {
              ...(agent || {}),
              ...dbAgent,
              isLoggedIn: true
            };
            setAgent(updated);
            localStorage.setItem('nivaaro-agent', JSON.stringify(updated));
          }
        } else if (res.status === 401) {
          // If session is truly expired, check if session token exists
          console.warn('Session expired or unauthenticated.');
        }
      } catch (err) {
        console.warn('Profile fetch error:', err);
      }

      // Fetch verification checklist & documents status
      try {
        const statusUrl = targetLookupId ? `/api/verification/status?professionalId=${encodeURIComponent(targetLookupId)}` : '/api/verification/status';
        const verifRes = await apiClient(statusUrl);
        if (verifRes.ok) {
          const vData = await verifRes.json();
          if (vData?.success && vData?.status) {
            const s = vData.status;
            setIsPhoneVerified(Boolean(s.checklist?.find((c) => c.id === 'mobile')?.completed));
            const isVerifiedNow = Boolean(s.isFullyVerified || s.kycStatus === 'verified');
            setIsFullyVerified(isVerifiedNow);
            if (s.kycStatus) setKycStatus(s.kycStatus);
            if (s.photoStatus) setPhotoStatus(s.photoStatus);
            if (s.avatarUrl || s.photoUrl) setAvatarUrl(s.avatarUrl || s.photoUrl);
            if (s.accountStatus) setAccountStatus(s.accountStatus);
            if (s.suspendedUntil) setSuspendedUntil(s.suspendedUntil);
            if (s.suspensionAttempts !== undefined) setSuspensionAttempts(s.suspensionAttempts);
            if (s.chancesRemaining !== undefined) setChancesRemaining(s.chancesRemaining);
            if (s.isBanned !== undefined) setIsBanned(Boolean(s.isBanned));
            if (s.isCurrentlySuspended !== undefined) setIsCurrentlySuspended(Boolean(s.isCurrentlySuspended));
            if (s.isSuspensionPeriodOver !== undefined) setIsSuspensionPeriodOver(Boolean(s.isSuspensionPeriodOver));
            if (isVerifiedNow) {
              setRejectionReason('');
            } else if (s.rejectionReason) {
              setRejectionReason(s.rejectionReason);
            }

            if (s.kycStatus === 'under_review' || s.kycStatus === 'verified' || s.aadhaarStatus === 'under_review' || s.aadhaarStatus === 'verified') {
              setHasDocumentConsent(true);
            }

            setDocuments((prev) => ({
              ...prev,
              aadhaar: {
                ...prev.aadhaar,
                status: s.aadhaarStatus === 'verified' ? 'verified' : (s.aadhaarStatus === 'under_review' ? 'under_review' : (s.aadhaarStatus === 'rejected' ? 'needs_attention' : (s.aadhaarLast4 || s.aadhaarNumber ? 'under_review' : prev.aadhaar.status))),
                last4: s.aadhaarLast4 || prev.aadhaar.last4,
                fileUrl: s.aadhaarUrl || prev.aadhaar.fileUrl || `/api/verification/document/stream?type=aadhaar&professionalId=${s.professionalId || targetLookupId}`,
                rejectionReason: s.aadhaarRejectionReason || (s.kycStatus === 'needs_attention' || s.kycStatus === 'rejected' ? s.rejectionReason : '')
              },
              driving_license: {
                ...prev.driving_license,
                status: s.dlStatus === 'verified' ? 'verified' : (s.dlStatus === 'under_review' ? 'under_review' : (s.dlStatus === 'rejected' ? 'needs_attention' : prev.driving_license.status)),
                fileUrl: s.dlUrl || prev.driving_license.fileUrl || `/api/verification/document/stream?type=driving_licence&professionalId=${s.professionalId || targetLookupId}`,
                rejectionReason: s.dlRejectionReason || ''
              }
            }));
          }
        }
      } catch (err) {
        console.warn('Verification status fetch notice:', err);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-grow textarea height helper
  const adjustTextareaHeight = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 68)}px`;
  };

  useEffect(() => {
    if (addressInputRef.current) {
      adjustTextareaHeight(addressInputRef.current);
    }
  }, [address]);

  // Live Camera Photo Upload Handler
  const handleLiveCameraCapture = async (capturedBase64, meta = {}) => {
    if (isBanned) {
      showToast('Account is permanently banned from NivaaroFix.', 3500, 'error');
      return;
    }
    if (isCurrentlySuspended) {
      showToast('Account is suspended for 1 week. Photo upload unlocks after suspension ends.', 3500, 'error');
      return;
    }

    setAvatarUrl(capturedBase64);
    showToast('Live portrait photo captured.', 2500, 'success');

    try {
      const res = await apiClient('/api/verification/photo/upload', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: agent?.partnerId || agent?.partner_id || agent?.id,
          professionalCode: agent?.partnerId || agent?.partner_id,
          email: agent?.email || email,
          photoBase64: capturedBase64,
          isUploadFallback: Boolean(meta?.isUploadFallback),
          qualityScores: meta?.qualityScores || null
        })
      });
      if (res.ok) {
        showToast('Portrait photo uploaded.', 3000, 'success');
        setPhotoStatus('uploaded');
        if (isProfileVerified) {
          setIsFullyVerified(false);
          setKycStatus('needs_attention');
          setRejectionReason('Portrait photo was updated. Please click "Resubmit for Verification" to submit for review.');
        }
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d?.error || 'Photo upload failed. Please try again.', 4000, 'error');
      }
    } catch (err) {
      console.warn('Photo upload error:', err);
      showToast('Photo upload failed. Please try again.', 4000, 'error');
    }
  };

  // Upload file fallback for photo
  const handlePhotoUploadFallback = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a JPG or PNG image file.', 3500, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be under 5 MB.', 3500, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target.result;
      handleLiveCameraCapture(b64, { isUploadFallback: true });
    };
    reader.readAsDataURL(file);
  };

  // Document Upload Processing
  const handleProcessDocUpload = (docKey, file) => {
    if (!file) return;

    if (isBanned) {
      showToast('Account is permanently banned from NivaaroFix.', 3500, 'error');
      return;
    }
    if (isCurrentlySuspended) {
      showToast('Account is suspended for 1 week. Document upload unlocks after suspension ends.', 3500, 'error');
      return;
    }

    // Ensure document consent is granted seamlessly
    if (!hasDocumentConsent) {
      setHasDocumentConsent(true);
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop().toLowerCase();
    const isValidExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);

    if (!validTypes.includes(file.type) && !isValidExt) {
      showToast('Please upload a JPG, PNG, or PDF document.', 3500, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds 5MB limit. Please upload a smaller file.', 3500, 'error');
      return;
    }

    const docTypeNormalized = docKey === 'driving_license' ? 'driving_licence' : 'aadhaar';
    setIsUploadingDoc((prev) => ({ ...prev, [docKey]: true }));
    setUploadProgress((prev) => ({ ...prev, [docKey]: 25 }));

    const reader = new FileReader();
    reader.onload = async (event) => {
      const fileDataUrl = event.target.result;

      // Simulated smooth progress while backend encrypts & verifies
      const pInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const next = (prev[docKey] || 25) + 20;
          if (next >= 90) {
            clearInterval(pInterval);
            return { ...prev, [docKey]: 90 };
          }
          return { ...prev, [docKey]: next };
        });
      }, 100);

      try {
        const res = await apiClient('/api/verification/document/upload', {
          method: 'POST',
          body: JSON.stringify({
            professionalId: agent?.partnerId || agent?.partner_id || agent?.id,
            professionalCode: agent?.partnerId || agent?.partner_id,
            email: agent?.email || email,
            documentType: docTypeNormalized,
            fileBase64: fileDataUrl,
            consent: true,
            profileName: name || agent?.name
          })
        });

        clearInterval(pInterval);
        setUploadProgress((prev) => ({ ...prev, [docKey]: 100 }));

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || data?.message || 'Failed to upload document.');
        }

        const isRejected = data?.document?.status === 'rejected';

        setTimeout(() => {
          setIsUploadingDoc((prev) => ({ ...prev, [docKey]: false }));
          setUploadProgress((prev) => ({ ...prev, [docKey]: 0 }));

          setDocuments((prev) => ({
            ...prev,
            [docKey]: {
              status: isRejected ? 'needs_attention' : 'under_review',
              fileName: file.name,
              fileSize: file.size,
              fileUrl: fileDataUrl,
              last4: data?.document?.aadhaar_last4 || '',
              uploadedAt: new Date().toISOString(),
              rejectionReason: data?.document?.rejection_reason || ''
            }
          }));

          const docTitle = docKey === 'aadhaar' ? 'Aadhaar Card' : 'Driving Licence';
          if (isRejected) {
            showToast(`${docTitle} rejected: ${data?.document?.rejection_reason || 'Unreadable'}`, 4500, 'error');
          } else {
            showToast(`${docTitle} uploaded.`, 3000, 'success');
            if (isProfileVerified) {
              setIsFullyVerified(false);
              setKycStatus('needs_attention');
              setRejectionReason(`${docTitle} was updated. Please click "Resubmit for Verification" to submit for review.`);
            }
          }
        }, 200);
      } catch (err) {
        clearInterval(pInterval);
        setIsUploadingDoc((prev) => ({ ...prev, [docKey]: false }));
        setUploadProgress((prev) => ({ ...prev, [docKey]: 0 }));
        showToast(err.message || 'Failed to upload document. Please try again.', 4000, 'error');
      }
    };

    reader.readAsDataURL(file);
  };

  // Cancel Document Upload
  const handleCancelUpload = (docKey) => {
    setIsUploadingDoc((prev) => ({ ...prev, [docKey]: false }));
    setUploadProgress((prev) => ({ ...prev, [docKey]: 0 }));
    showToast('Upload cancelled.', 2500, 'info');
  };

  // Handle Request Verification / Resubmit Dossier
  const handleRequestVerification = async () => {
    if (isBanned) {
      showToast('Account is permanently banned from NivaaroFix.', 4000, 'error');
      return;
    }
    if (isCurrentlySuspended) {
      showToast('Account is suspended for 1 week. Re-submission unlocks after suspension ends.', 4000, 'error');
      return;
    }

    // Auto-record consent if not yet checked
    if (!hasDocumentConsent) {
      setHasDocumentConsent(true);
      apiClient('/api/verification/consent', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: agent?.partnerId || agent?.partner_id || agent?.id,
          consentText: 'I agree to NivaaroFix verifying this document.'
        })
      }).catch(() => { });
    }

    // Auto-save permanent address if entered
    if (address && address.trim()) {
      try {
        const numExp = typeof experienceYears === 'number' ? experienceYears : (parseInt(experienceYears, 10) || 0);
        await apiClient('/api/auth/agent-update-profile', {
          method: 'POST',
          body: JSON.stringify({
            name: name ? name.trim() : agent?.name,
            phone: phone ? `+91 ${phone}` : null,
            experienceYears: numExp,
            years_of_experience: numExp,
            permanent_address: address.trim(),
            address: address.trim()
          })
        });
      } catch (_) {}
    }

    if (!hasLivePhoto) {
      showToast('Please capture or upload a live portrait photo first.', 3500, 'error');
      return;
    }
    if (!hasAadhaar) {
      showToast('Please upload your Aadhaar card before requesting verification.', 3500, 'error');
      return;
    }

    setIsSubmittingVerification(true);
    try {
      const res = await apiClient('/api/verification/request-verification', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: agent?.partnerId || agent?.partner_id || agent?.id
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setKycStatus('under_review');
        setRejectionReason('');
        showToast(data.message || 'Verification submitted. Your profile is now under review.', 3500, 'success');

        const verifRes = await apiClient('/api/verification/status');
        if (verifRes.ok) {
          const vData = await verifRes.json();
          if (vData?.status) {
            if (vData.status.kycStatus) setKycStatus(vData.status.kycStatus);
            setIsFullyVerified(Boolean(vData.status.isFullyVerified));
          }
        }
      } else {
        showToast(data?.error || 'Failed to submit verification request. Please try again.', 4000, 'error');
      }
    } catch (err) {
      showToast('Network error submitting verification request.', 4000, 'error');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  // Handle Save Changes
  const handleSaveChanges = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter your full professional name.', 3500, 'error');
      return;
    }

    if (!phone || phone.length !== 10) {
      showToast('Please enter a valid 10-digit Indian mobile number.', 3500, 'error');
      return;
    }

    if (!address || !address.trim()) {
      setAddressFieldError('Please enter your permanent address.');
      showToast('Please enter your permanent address.', 3500, 'error');
      if (addressInputRef.current) addressInputRef.current.focus();
      return;
    }

    setIsSaving(true);
    setSaveSuccessMessage(false);

    try {
      const numExp = typeof experienceYears === 'number' ? experienceYears : (parseInt(experienceYears, 10) || 0);
      const res = await apiClient('/api/auth/agent-update-profile', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone ? `+91 ${phone}` : null,
          experienceYears: numExp,
          years_of_experience: numExp,
          permanent_address: address.trim(),
          address: address.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || data.error || 'Failed to save changes.', 4000, 'error');
        return;
      }

      setInitialSnapshot({
        name: name.trim(),
        phone,
        experienceYears: numExp,
        address: address.trim()
      });

      const updated = {
        ...(agent || {}),
        ...data.agent,
        isLoggedIn: true
      };
      setAgent(updated);
      localStorage.setItem('nivaaro-agent', JSON.stringify(updated));

      setSaveSuccessMessage(true);
      showToast('Changes saved successfully.', 3000, 'success');
      setTimeout(() => setSaveSuccessMessage(false), 4000);
    } catch (err) {
      showToast('Network error saving changes.', 4000, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    try {
      await apiClient('/api/auth/agent-logout', { method: 'POST' });
    } catch { }
    localStorage.removeItem('nivaaro-agent');
    localStorage.removeItem('nivaarofix_session_token');
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = `http://localhost:5500?portal=agent&lang=${activeLanguage || 'en'}`;
    }
  };

  // Render Document Status text with small SVG icon
  const renderDocStatusIndicator = (status) => {
    switch (status) {
      case 'verified':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0d824d', fontSize: '0.84rem', fontWeight: 600 }}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="#0d824d" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Verified</span>
          </div>
        );
      case 'under_review':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#d97706', fontSize: '0.84rem', fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Under review</span>
          </div>
        );
      case 'uploading':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0284c7', fontSize: '0.84rem', fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            <span>Uploading</span>
          </div>
        );
      case 'needs_attention':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#dc2626', fontSize: '0.84rem', fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Needs attention</span>
          </div>
        );
      default:
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.84rem', fontWeight: 500 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <line x1="9" y1="12" x2="15" y2="12" />
            </svg>
            <span>Not uploaded</span>
          </div>
        );
    }
  };

  // Render Minimal Document Card (Aadhaar or Driving Licence)
  const renderDocumentCard = (docKey, title, isRequired) => {
    const doc = documents[docKey];
    const isUploading = isUploadingDoc[docKey];
    const isFilled = doc.status === 'under_review' || doc.status === 'verified' || doc.status === 'needs_attention';
    const inputRef = docKey === 'aadhaar' ? aadhaarFileInputRef : dlFileInputRef;

    return (
      <div
        key={docKey}
        className="pro-document-card"
        onDragOver={(e) => {
          e.preventDefault();
          if (isLockedInReview) return;
          setIsDragging((prev) => ({ ...prev, [docKey]: true }));
        }}
        onDragLeave={() => setIsDragging((prev) => ({ ...prev, [docKey]: false }))}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging((prev) => ({ ...prev, [docKey]: false }));
          if (isLockedInReview) {
            showToast('Document modifications are locked during compliance review.', 3500, 'info');
            return;
          }
          const f = e.dataTransfer.files?.[0];
          if (f) handleProcessDocUpload(docKey, f);
        }}
        style={{
          border: isDragging[docKey]
            ? '1.5px solid #0d824d'
            : '1px solid var(--pro-card-border, rgba(16, 24, 40, 0.08))',
          borderRadius: '16px',
          padding: '18px 20px',
          background: 'var(--pro-doc-card-bg, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: isDragging[docKey]
            ? '0 0 0 2px rgba(13, 130, 77, 0.2)'
            : 'var(--pro-subcard-shadow, 0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px -2px rgba(16, 24, 40, 0.06))'
        }}
      >
        {/* Header: Title + Required/Optional left; Status Indicator right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
              {title}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>
              {isRequired ? 'Required' : 'Optional'}
            </span>
          </div>
          <div>{renderDocStatusIndicator(isUploading ? 'uploading' : doc.status)}</div>
        </div>

        {/* Uploading State: Progress line with file name and Cancel */}
        {isUploading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 500 }}>
                Uploading document...
              </span>
              <button
                type="button"
                onClick={() => handleCancelUpload(docKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Cancel
              </button>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'rgba(0, 0, 0, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${uploadProgress[docKey] || 30}%`,
                  height: '100%',
                  background: '#0d824d',
                  borderRadius: '2px',
                  transition: 'width 0.15s ease'
                }}
              />
            </div>
          </div>
        )}

        {/* Under Review or Verified State: Masked tile + details + Replace */}
        {!isUploading && isFilled && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
            {/* Masked Tile preview on tap */}
            <div
              tabIndex={0}
              role="button"
              aria-label={`Preview ${title}`}
              onClick={() => {
                const targetUrl = doc.fileUrl || `/api/verification/document/stream?type=${docKey === 'driving_license' ? 'driving_licence' : 'aadhaar'}&professionalId=${partnerId || agent?.partner_id || agent?.partnerId || agent?.id || '202600001'}`;
                setPreviewModal({
                  isOpen: true,
                  title,
                  fileName: doc.fileName || `${title} Document`,
                  fileUrl: targetUrl
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const targetUrl = doc.fileUrl || `/api/verification/document/stream?type=${docKey === 'driving_license' ? 'driving_licence' : 'aadhaar'}&professionalId=${partnerId || agent?.partner_id || agent?.partnerId || agent?.id || '202600001'}`;
                  setPreviewModal({
                    isOpen: true,
                    title,
                    fileName: doc.fileName || `${title} Document`,
                    fileUrl: targetUrl
                  });
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                minWidth: 0
              }}
            >
              {/* Masked Icon Tile */}
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(13, 130, 77, 0.08)',
                  border: '1px solid rgba(13, 130, 77, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0d824d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              {/* Document details */}
              <div style={{ minWidth: 0 }}>
                {docKey === 'aadhaar' && doc.last4 ? (
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', letterSpacing: '0.04em' }}>
                    XXXX XXXX {doc.last4}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.fileName || `${title} Document`}
                  </p>
                )}
                {doc.status === 'needs_attention' && doc.rejectionReason ? (
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#dc2626', lineHeight: 1.3 }}>
                    {doc.rejectionReason}
                  </p>
                ) : (
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                    Tap to preview proof
                  </p>
                )}
              </div>
            </div>

            {/* Replace Button or Locked Indicator */}
            {isLockedInReview ? (
              <span
                style={{
                  fontSize: '0.78rem',
                  color: '#b45309',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 600,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  background: 'rgba(217, 119, 6, 0.08)',
                  border: '1px solid rgba(217, 119, 6, 0.2)',
                  flexShrink: 0
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Locked in review</span>
              </span>
            ) : isProfileVerified ? (
              <button
                type="button"
                onClick={() => setReverifyPrompt({ type: docKey, title })}
                style={{
                  background: 'none',
                  border: '1px solid rgba(0, 0, 0, 0.15)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                Replace
              </button>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                style={{
                  background: doc.status === 'needs_attention' ? '#FEF2F2' : 'none',
                  border: doc.status === 'needs_attention' ? '1px solid #FCA5A5' : '1px solid rgba(0, 0, 0, 0.15)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: doc.status === 'needs_attention' ? '#DC2626' : 'var(--text-primary, #111827)',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                Replace
              </button>
            )}
          </div>
        )}

        {/* Empty State: Two quiet buttons + muted hint line */}
        {!isUploading && !isFilled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isLockedInReview ? (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(217, 119, 6, 0.08)',
                  border: '1px solid rgba(217, 119, 6, 0.2)',
                  color: '#b45309',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  textAlign: 'center'
                }}
              >
                Document uploads locked while application is under review
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  data-testid={`upload-doc-${docKey}`}
                  onClick={() => inputRef.current?.click()}
                  style={{
                    flex: 1,
                    height: '38px',
                    borderRadius: '10px',
                    border: '1px solid var(--pro-card-border, rgba(16, 24, 40, 0.12))',
                    background: 'var(--pro-btn-secondary-bg, #ffffff)',
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: 'var(--text-primary, #111827)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload file</span>
                </button>

                <button
                  type="button"
                  data-testid={`take-doc-photo-${docKey}`}
                  onClick={() => setDocCameraKey(docKey)}
                  style={{
                    flex: 1,
                    height: '38px',
                    borderRadius: '10px',
                    border: '1px solid var(--pro-card-border, rgba(16, 24, 40, 0.12))',
                    background: 'var(--pro-btn-secondary-bg, #ffffff)',
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: 'var(--text-primary, #111827)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Take photo</span>
                </button>
              </div>
            )}

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>
              JPG, PNG or PDF, up to 5 MB
            </p>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleProcessDocUpload(docKey, f);
            e.target.value = '';
          }}
        />
      </div>
    );
  };

  return (
    <div
      className="pro-profile-page-wrapper"
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        background: 'var(--pro-page-bg, #ffffff)',
        scrollbarGutter: 'stable'
      }}
    >
      {/* Unified Global Top Header / Navigation Bar matching Screenshot 1 */}
      <header className="nivaaro-header-bar" role="banner">
        <div className="nivaaro-nav-inner">
          {/* Left: Brand Logo + Primary Navigation Links (Home, Services, Workspace, About Us) */}
          <div className="nav-left-group">
            <a
              href="http://localhost:5173/#/"
              className="nav-logo-link"
              aria-label="NivaaroFix Home"
            >
              <BrandLogo
                size="medium"
                isPartner={true}
                onClick={() => { window.location.href = 'http://localhost:5173/#/partner'; }}
              />
            </a>

            <nav className="nav-primary-links" aria-label="Main Navigation">
              <a
                href="http://localhost:5173/#/"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navHome || 'Home'}</span>
              </a>

              <a
                href="http://localhost:5173/#/services"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navServices || 'Services'}</span>
              </a>

              <a
                href="http://localhost:5173/#/partner"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navPartnerConsole || 'Workspace'}</span>
              </a>

              <a
                href="http://localhost:5173/#/about"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
              </a>
            </nav>
          </div>

          {/* Right: Language + Helpline + User / Agent Login or Registered Profile */}
          <div className="nav-right-group">
            {/* Language Switcher */}
            <button
              type="button"
              className="nav-btn-subtle nav-lang-trigger notranslate ignore"
              onClick={() => setIsLangModalOpen && setIsLangModalOpen(true)}
              title="Select language / भाषा चुनें"
              aria-label="Select language"
              data-no-translate="true"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="notranslate ignore" data-no-translate="true">{(activeLanguage || 'en').toUpperCase()}</span>
            </button>

            {/* Help & Support Desk */}
            <div className="nav-help-wrapper">
              <a
                href="http://localhost:5173/?openSupport=true#/"
                className="nav-btn-subtle nav-help-trigger"
                aria-label="Support and ticket desk"
                title="Help and Support (24-72h resolution)"
              >
                <span>{t.navHelp || 'Help'}</span>
              </a>
            </div>

            {/* Profile Pill with Dropdown */}
            <div className="nav-profile-menu-wrapper" ref={profileWrapperRef}>
              <button
                type="button"
                className={`nav-user-profile-btn ${isProfileMenuOpen ? 'menu-active' : ''}`}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                aria-label="User Profile Menu"
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
              >
                {displayAvatar && !avatarLoadError ? (
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="nav-avatar-img"
                    onError={(e) => {
                      if (!e.currentTarget.src.includes('plumber.png')) {
                        e.currentTarget.src = '/images/plumber.png';
                      } else {
                        setAvatarLoadError(true);
                      }
                    }}
                  />
                ) : (
                  <span className="user-avatar-initial partner-avatar-initial">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="user-display-first-name">{displayName}</span>
                <svg
                  className={`nav-chevron-icon ${isProfileMenuOpen ? 'rotated' : ''}`}
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isProfileMenuOpen && (
                <div className="nav-profile-dropdown-card" role="menu">
                  <div className="profile-dropdown-header">
                    {displayAvatar && !avatarLoadError ? (
                      <img
                        src={displayAvatar}
                        alt={displayName}
                        className="dropdown-avatar-lg"
                        onError={(e) => {
                          if (!e.currentTarget.src.includes('plumber.png')) {
                            e.currentTarget.src = '/images/plumber.png';
                          }
                        }}
                      />
                    ) : (
                      <div className="dropdown-avatar-lg-initial partner-bg">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="dropdown-user-info">
                      <span className="dropdown-user-name">{displayName}</span>
                      <span className="dropdown-user-contact">{displayEmail}</span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-menu-list">
                    {/* Option 1 Naming: My Profile */}
                    <button
                      type="button"
                      className="dropdown-menu-item pro-profile-item active-dropdown-item"
                      onClick={() => setIsProfileMenuOpen(false)}
                    >
                      <div className="dropdown-item-icon-box pro-profile-icon-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="item-text-group">
                        <span className="item-title">My Profile</span>
                      </div>
                      <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>

                    {/* Workspace */}
                    <button
                      type="button"
                      className="dropdown-menu-item pro-console-item"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        window.location.href = 'http://localhost:5173/#/partner';
                      }}
                    >
                      <div className="dropdown-item-icon-box pro-console-icon-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <div className="item-text-group">
                        <span className="item-title">Workspace</span>
                      </div>
                      <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>

                    {/* Payouts & Settlements */}
                    <button
                      type="button"
                      className="dropdown-menu-item pro-settlements-item"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        window.location.href = 'http://localhost:5173/#/partner/settlements';
                      }}
                    >
                      <div className="dropdown-item-icon-box pro-settlements-icon-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                      </div>
                      <div className="item-text-group">
                        <span className="item-title">Payouts &amp; Settlements</span>
                      </div>
                      <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>

                  <div className="dropdown-divider" />

                  {/* Switch to Customer Portal */}
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      if (onSwitchPortal) onSwitchPortal('customer');
                      else window.location.href = 'http://localhost:5500?portal=customer';
                    }}
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem' }}
                  >
                    <div className="dropdown-item-icon-box" style={{ width: '28px', height: '28px', background: 'rgba(4, 120, 87, 0.08)', color: '#047857' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                    </div>
                    <div className="item-text-group">
                      <span className="item-title" style={{ fontSize: '0.82rem', color: '#047857', fontWeight: 600 }}>Switch to Customer</span>
                    </div>
                  </button>

                  <div className="dropdown-divider" />

                  {/* Logout Button */}
                  <button
                    type="button"
                    className="dropdown-logout-btn"
                    onClick={handleSignOut}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button (Visible <= 900px) */}
            <button
              type="button"
              className="nav-mobile-menu-btn"
              onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileDrawerOpen}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {isMobileDrawerOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileDrawerOpen && (
          <div className="nav-mobile-drawer">
            <div className="nav-mobile-drawer-inner">
              <div className="nav-mobile-links">
                <a href="http://localhost:5173/#/" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navHome || 'Home'}</span>
                </a>
                <a href="http://localhost:5173/#/services" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navServices || 'Services'}</span>
                </a>
                <a href="http://localhost:5173/#/partner" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navPartnerConsole || 'Workspace'}</span>
                </a>
                <a href="http://localhost:5173/#/about" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
                </a>
                <div className="nav-mobile-help-divider" />
                <a href="http://localhost:5173/#/partner/settlements" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">Payouts &amp; Settlements</span>
                </a>
                <button type="button" className="nav-link-btn" onClick={handleSignOut} style={{ color: '#ef4444' }}>
                  <span className="nav-link-text">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ position: 'relative', zIndex: 1, flex: 1, padding: '1.5rem clamp(20px, 3.2vw, 48px) 4rem clamp(20px, 3.2vw, 48px)', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

          {/* Headline & Breadcrumb */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #111827)', letterSpacing: '-0.02em' }}>
              My Profile
            </h1>
            <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--text-secondary, #4b5563)' }}>
              Manage your identity, permanent address, and document verification.
            </p>
          </div>

          {/* Desktop 2-Column Grid (Form on left, Identity & Document cards on right) */}
          <div className="pro-profile-grid">

            {/* LEFT COLUMN: Main Form Panel */}
            <div className="pro-glass-card" style={{ padding: '28px' }}>
              <form onSubmit={handleSaveChanges} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* 1. Full Name */}
                <div>
                  <label htmlFor="pro-name" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>
                    Full Name
                  </label>
                  <input
                    id="pro-name"
                    type="text"
                    className="pro-input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Suresh Verma"
                    required
                  />
                </div>

                {/* 2. Professional ID */}
                <div>
                  <label htmlFor="pro-id" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>
                    Professional ID
                  </label>
                  <input
                    id="pro-id"
                    type="text"
                    className="pro-input-field"
                    value={partnerId}
                    readOnly
                    style={{ background: 'rgba(0, 0, 0, 0.03)', cursor: 'not-allowed', color: '#6b7280' }}
                  />
                </div>

                {/* 3. Mobile Number */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label htmlFor="pro-phone" style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                      Mobile Number
                    </label>
                    {isPhoneVerified ? (
                      <span style={{ fontSize: '0.8rem', color: '#0d824d', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="#0d824d">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Verified</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsMobileSheetOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0d824d',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        Verify mobile
                      </button>
                    )}
                  </div>
                  <IndianPhoneInput
                    id="pro-phone"
                    value={phone}
                    onChange={(val) => {
                      setPhone(val);
                      if (val !== initialSnapshot.phone) {
                        setIsPhoneVerified(false);
                      }
                    }}
                    placeholder="98765 43210"
                  />
                </div>

                {/* 4. Experience Stepper (Fresher, 1 year, n years) */}
                <div>
                  <label htmlFor="pro-experience" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>
                    Experience
                  </label>
                  <ExperienceStepper
                    id="pro-experience"
                    value={experienceYears}
                    onChange={(val) => setExperienceYears(val)}
                  />
                </div>

                {/* 5. Permanent address (shared AddressField) */}
                <div>
                  <AddressField
                    id="pro-address"
                    label="Permanent address"
                    value={address}
                    onChange={(val) => {
                      setAddress(val);
                      if (addressFieldError) setAddressFieldError('');
                    }}
                    error={addressFieldError}
                  />
                </div>

                {/* Save Changes Button */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="submit"
                    disabled={!isDirty || isSaving}
                    style={{
                      width: '100%',
                      height: '48px',
                      borderRadius: '12px',
                      background: '#0d824d',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: (!isDirty || isSaving) ? 'not-allowed' : 'pointer',
                      opacity: (!isDirty || isSaving) ? 0.45 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSaving ? 'Saving changes...' : 'Save changes'}
                  </button>

                  {saveSuccessMessage && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#0d824d', textAlign: 'center', fontWeight: 500 }}>
                      Changes saved successfully.
                    </p>
                  )}
                </div>

              </form>
            </div>

            {/* RIGHT COLUMN: Identity & Document Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* 1. Identity Card */}
              <div className="pro-glass-card pro-identity-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

                {/* 96px Avatar */}
                <div
                  className="agent-avatar-circle"
                  style={{
                    width: '96px',
                    height: '96px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: isProfileVerified ? '3px solid #0d824d' : '2px solid var(--pro-card-border, rgba(16, 24, 40, 0.08))',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                    background: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '14px',
                    position: 'relative'
                  }}
                >
                  {displayAvatarUrl ? (
                    <img
                      key={displayAvatarUrl}
                      src={displayAvatarUrl}
                      alt={name || 'Professional'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      fontSize: '2rem',
                      fontWeight: 600,
                      color: '#ffffff',
                      display: displayAvatarUrl ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%'
                    }}
                  >
                    {(name || 'P').trim().charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Name */}
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                  {formatProperCase(name) || 'Professional'}
                </h2>

                {/* Professional ID | Trade (ID, thin vertical divider, trade; 14px, muted, with trade in main text color) */}
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500, marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span>{`${String(partnerId || '202600042').replace(/^PRO-/, '')} | `}</span>
                  <span style={{ color: 'var(--text-primary, #111827)' }}>{trade === 'plumber' ? 'Plumber' : 'Electrician'}</span>
                </div>

                {/* Mobile status line */}
                <div style={{ marginTop: '10px', fontSize: '0.86rem', color: 'var(--text-primary, #111827)' }}>
                  {isPhoneVerified || isProfileVerified ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0d824d', fontWeight: 500 }}>
                      <span>+91 {phone || '••••••••••'}</span>
                      <span>•</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="#0d824d">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Mobile verified</span>
                      </span>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>+91 {phone || '••••••••••'}</span>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setIsMobileSheetOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0d824d',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        Verify mobile
                      </button>
                    </span>
                  )}
                </div>

                {/* Overall Verification Status Line */}
                <div style={{ marginTop: '6px', fontSize: '0.86rem' }}>
                  {isProfileVerified ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0d824d', fontWeight: 600 }}>
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="#0d824d">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Verified professional</span>
                    </span>
                  ) : (kycStatus === 'rejected' || kycStatus === 'needs_attention') ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#dc2626', fontWeight: 600 }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{kycStatus === 'rejected' ? 'Verification Rejected' : 'Action Required / Re-upload'}</span>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontWeight: 500 }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>Identity under review</span>
                    </span>
                  )}
                </div>

                {/* Status Hero Card: Under Review, Suspension, or Changes Requested */}
                {isLockedInReview ? (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textAlign: 'left'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff'
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#92400e' }}>
                        Verification Under Review
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '2px', lineHeight: 1.4 }}>
                        Your application is being verified by compliance. Review is typically completed within 24 hours.
                      </div>
                    </div>
                  </div>
                ) : isBanned ? (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: '#450a0a',
                      border: '1px solid #991b1b',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      textAlign: 'left'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#991b1b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fee2e2' }}>
                        Account Deactivated
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#fca5a5', marginTop: '3px', lineHeight: 1.4 }}>
                        This account has reached the maximum limit of 3 suspensions and has been permanently closed.
                      </div>
                    </div>
                  </div>
                ) : isCurrentlySuspended ? (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      textAlign: 'left'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#ea580c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#9a3412' }}>
                        Account Suspended (7 Days)
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#7c2d12', marginTop: '3px', lineHeight: 1.4 }}>
                        Suspended until {suspendedUntil ? new Date(suspendedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '7 days'} (Strike {Math.min(3, suspensionAttempts || 1)} of 3). Re-submission unlocks after this period.
                      </div>
                    </div>
                  </div>
                ) : isSuspensionPeriodOver ? (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      textAlign: 'left'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#166534' }}>
                        Suspension Ended
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#15803d', marginTop: '3px', lineHeight: 1.4 }}>
                        You can now re-upload your portrait photo and Aadhaar card below for review.
                      </div>
                    </div>
                  </div>
                ) : isActionRequired ? (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: '#FEF2F2',
                      border: '1px solid #FCA5A5',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      textAlign: 'left'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#991B1B' }}>
                        Action Required: Changes Requested by Admin
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#7F1D1D', marginTop: '3px', lineHeight: 1.45 }}>
                        {rejectionReason || 'Admin requested updates to your documents or selfie photo. Please re-upload the requested items below and submit for re-review.'}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Photo Actions: Locked in review, Verified, or Upload/Take Photo */}
                {isLockedInReview ? (
                  <div
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#b45309',
                      fontSize: '0.84rem',
                      fontWeight: 600
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Photo locked during review</span>
                  </div>
                ) : isProfileVerified ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setReverifyPrompt({ type: 'avatar', title: 'Portrait Photo' })}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        textDecoration: 'underline'
                      }}
                    >
                      Replace photo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px', width: '100%' }}>
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '10px',
                        background: '#0d824d',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>{hasLivePhoto ? 'Retake photo' : 'Take photo'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary, #4b5563)',
                        fontSize: '0.86rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: '8px',
                        textDecoration: 'underline'
                      }}
                    >
                      Upload
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUploadFallback}
                />
              </div>

              {/* 2. Document Cards Section */}
              <div className="pro-glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                  Identity Documents
                </h3>

                {/* Mandatory Consent Checkbox */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: hasDocumentConsent ? 'rgba(13, 130, 77, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                    border: hasDocumentConsent ? '1px solid rgba(13, 130, 77, 0.3)' : '1px solid rgba(0, 0, 0, 0.08)'
                  }}
                >
                  <input
                    type="checkbox"
                    id="doc-consent"
                    checked={hasDocumentConsent}
                    onChange={(e) => {
                      setHasDocumentConsent(e.target.checked);
                      if (e.target.checked) {
                        apiClient('/api/verification/consent', {
                          method: 'POST',
                          body: JSON.stringify({
                            professionalId: agent?.id,
                            consentText: 'I agree to NivaaroFix verifying this document.'
                          })
                        }).catch(() => { });
                      }
                    }}
                    style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#0d824d' }}
                  />
                  <label htmlFor="doc-consent" style={{ fontSize: '0.84rem', color: 'var(--text-primary, #111827)', cursor: 'pointer', fontWeight: 500, lineHeight: 1.4 }}>
                    I agree to NivaaroFix verifying this document.
                  </label>
                </div>

                {/* Aadhaar Card */}
                {renderDocumentCard('aadhaar', 'Aadhaar Card', true)}

                {/* Driving Licence */}
                {renderDocumentCard('driving_license', 'Driving Licence', false)}

                {/* Minimalist Verification Request / Status Action */}
                <div style={{ marginTop: '8px' }}>
                  {isProfileVerified ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(13, 130, 77, 0.08)',
                        border: '1px solid rgba(13, 130, 77, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#0d824d',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="#0d824d">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>All documents verified & approved</span>
                    </div>
                  ) : isLockedInReview ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(217, 119, 6, 0.08)',
                        border: '1px solid rgba(217, 119, 6, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#b45309',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>Verification Submitted — Under Review by Compliance</span>
                    </div>
                  ) : isBanned ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: '#450a0a',
                        border: '1px solid #991b1b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#fee2e2',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    >
                      <span>Account Permanently Banned (All 3 Strikes Exhausted)</span>
                    </div>
                  ) : isCurrentlySuspended ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: '#fff7ed',
                        border: '1px solid #fed7aa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#c2410c',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}
                    >
                      <span>Submission Locked — Suspended for 1 Week</span>
                    </div>
                  ) : (isActionRequired || isSuspensionPeriodOver) ? (
                    <button
                      type="button"
                      onClick={handleRequestVerification}
                      disabled={isSubmittingVerification}
                      style={{
                        width: '100%',
                        height: '46px',
                        borderRadius: '12px',
                        background: '#0d824d',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '0.94rem',
                        fontWeight: 600,
                        cursor: isSubmittingVerification ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(13, 130, 77, 0.25)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{isSubmittingVerification ? 'Submitting to compliance...' : 'Resubmit for Verification →'}</span>
                    </button>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={handleRequestVerification}
                        disabled={!canRequestVerification || isSubmittingVerification}
                        style={{
                          width: '100%',
                          height: '46px',
                          borderRadius: '12px',
                          background: canRequestVerification ? '#0d824d' : 'rgba(0, 0, 0, 0.06)',
                          color: canRequestVerification ? '#ffffff' : '#9ca3af',
                          border: canRequestVerification ? 'none' : '1px solid rgba(0, 0, 0, 0.1)',
                          fontSize: '0.94rem',
                          fontWeight: 600,
                          cursor: (!canRequestVerification || isSubmittingVerification) ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: canRequestVerification ? '0 2px 8px rgba(13, 130, 77, 0.2)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{isSubmittingVerification ? 'Submitting to compliance...' : 'Request Profile Verification →'}</span>
                      </button>
                      {!canRequestVerification && (
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>
                          {!hasLivePhoto && !hasAadhaar
                            ? 'Capture live photo and upload Aadhaar card to request verification'
                            : !hasLivePhoto
                              ? 'Capture live portrait photo to request verification'
                              : !hasAadhaar
                                ? 'Upload Aadhaar card to request verification'
                                : !hasDocumentConsent
                                  ? 'Agree to document verification consent above'
                                  : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      </main>

      {/* Mobile Verification Sheet (glass modal / bottom sheet) */}
      <MobileVerificationSheet
        isOpen={isMobileSheetOpen}
        onClose={() => setIsMobileSheetOpen(false)}
        phone={phone}
        professionalId={agent?.id}
        onChangePhone={() => {
          setIsMobileSheetOpen(false);
          const el = document.getElementById('pro-phone');
          if (el) el.focus();
        }}
        onVerified={(verifiedNumber) => {
          setIsPhoneVerified(true);
          setPhone(verifiedNumber);
          showToast('Mobile number verified successfully!', 3000, 'success');
        }}
      />

      {/* Live Camera Modal for Avatar */}
      <LiveCameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleLiveCameraCapture}
      />

      {/* Live Camera Modal for Document Capture */}
      <LiveCameraCaptureModal
        isOpen={Boolean(docCameraKey)}
        onClose={() => setDocCameraKey(null)}
        mode="document"
        title={docCameraKey === 'aadhaar' ? 'Capture Aadhaar card' : 'Capture document'}
        onCapture={(capturedBase64) => {
          if (!docCameraKey) return;
          try {
            const arr = capturedBase64.split(',');
            const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            const bstr = atob(arr[1]);
            const u8arr = new Uint8Array(bstr.length);
            for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
            const docLabel = docCameraKey === 'aadhaar' ? 'aadhaar_card' : 'driving_licence';
            const file = new File([u8arr], `${docLabel}_camera.jpg`, { type: mime });
            handleProcessDocUpload(docCameraKey, file);
          } catch (err) {
            showToast('Failed to process camera image.', 3000, 'error');
          }
          setDocCameraKey(null);
        }}
      />

      {/* Document Decrypted Preview Modal */}
      <DocumentPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, title: '', fileName: '', fileUrl: '' })}
        title={previewModal.title}
        fileName={previewModal.fileName}
        fileUrl={previewModal.fileUrl}
      />

      {/* Re-verify Confirmation Modal for Verified Items */}
      {reverifyPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.16)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>
              Update Verified {reverifyPrompt.title}?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.86rem', color: '#4b5563', lineHeight: 1.5 }}>
              Your profile is currently verified. Changing your {reverifyPrompt.title} will require compliance re-verification before the updated item is activated. Other profile details (address, experience) do not require admin verification.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setReverifyPrompt(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#374151',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Keep Current
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = reverifyPrompt.type;
                  setReverifyPrompt(null);
                  if (target === 'avatar') {
                    setIsCameraOpen(true);
                  } else if (target === 'aadhaar') {
                    aadhaarFileInputRef.current?.click();
                  } else if (target === 'driving_license') {
                    dlFileInputRef.current?.click();
                  }
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#0d824d',
                  color: '#ffffff',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Proceed to Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
