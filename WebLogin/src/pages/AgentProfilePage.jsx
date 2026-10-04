import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useToastNotification } from '../context/ToastNotificationContext';
import IndianPhoneInput from '../components/IndianPhoneInput';
import DateOfBirthSelector from '../components/DateOfBirthSelector';
import LocationCascadingSelect from '../components/LocationCascadingSelect';
import LiveCameraCaptureModal from '../components/LiveCameraCaptureModal';
import PhoneOtpModal from '../components/PhoneOtpModal';
import BrandLogo from '../components/BrandLogo';
import { detectCurrentGpsLocation } from '../services/gpsLocationService';

function isTestGarbageDob(d) {
  if (!d) return false;
  const str = typeof d === 'object' ? `${d?.day || ''}/${d?.month || ''}/${d?.year || ''}` : String(d);
  return str.includes('1992') || str.includes('1988') || str.includes('2050') || str === '//' || str === '--';
}

function isTestGarbagePhone(p) {
  if (!p) return false;
  const digits = String(p).replace(/\D/g, '');
  return (
    digits === '0000000000' ||
    digits === '1111111111'
  );
}

function parseDob(rawDob) {
  if (!rawDob || isTestGarbageDob(rawDob)) return { day: '', month: '', year: '' };
  if (typeof rawDob === 'object') {
    const day = rawDob.day ? String(rawDob.day).padStart(2, '0') : '';
    const month = rawDob.month ? String(rawDob.month).padStart(2, '0') : '';
    const year = rawDob.year ? String(rawDob.year) : '';
    if (year === '1992' || year === '1988' || year === '2050' || !year) return { day: '', month: '', year: '' };
    return { day, month, year };
  }
  if (typeof rawDob === 'string') {
    const trimmed = rawDob.trim();
    if (!trimmed || trimmed === '//' || trimmed === '--' || isTestGarbageDob(trimmed)) {
      return { day: '', month: '', year: '' };
    }
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        if (parts[2] === '1992' || parts[2] === '1988' || parts[2] === '2050') return { day: '', month: '', year: '' };
        return { day: parts[0].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[2] };
      }
    } else if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        if (parts[0] === '1992' || parts[0] === '1988' || parts[0] === '2050') return { day: '', month: '', year: '' };
        return { day: parts[2].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[0] };
      }
    }
  }
  return { day: '', month: '', year: '' };
}

function cleanPhone(rawPhone) {
  if (!rawPhone || isTestGarbagePhone(rawPhone)) return '';
  const digits = rawPhone.replace(/\+91\s*/g, '').replace(/\D/g, '').slice(0, 10);
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
  const { t, activeLanguage } = useLanguage();
  const { showToast } = useToastNotification();
  const fileInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const saveButtonRef = useRef(null);
  const verifiedTimerRef = useRef(null);
  const [showVerifiedTransient, setShowVerifiedTransient] = useState(false);

  const handleMobileClick = () => {
    if (isPhoneVerified) {
      setShowVerifiedTransient(true);
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
      verifiedTimerRef.current = setTimeout(() => {
        setShowVerifiedTransient(false);
      }, 5000);
    }
  };

  useEffect(() => {
    return () => {
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
    };
  }, []);

  // Load partner data
  const [agent, setAgent] = useState(() => {
    if (initialAgent) return initialAgent;
    try {
      const params = new URLSearchParams(window.location.search);
      const agentParam = params.get('agent');
      if (agentParam) {
        const parsed = JSON.parse(decodeURIComponent(agentParam));
        if (isTestGarbageDob(parsed?.dob)) parsed.dob = null;
        if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
        return parsed;
      }
      const saved = localStorage.getItem('nivaaro-agent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isTestGarbageDob(parsed?.dob)) parsed.dob = null;
        if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Profile Form State (Zero default / fake strings)
  const [name, setName] = useState(agent?.name || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [phone, setPhone] = useState(cleanPhone(agent?.phone));
  const [partnerId, setPartnerId] = useState(agent?.partnerId || agent?.partner_id || '202500001');
  const [trade, setTrade] = useState(() => (agent?.trade === 'plumber' ? 'plumber' : 'electrician'));
  const [experienceYears, setExperienceYears] = useState(() => {
    if (agent?.experienceYears !== undefined && agent?.experienceYears !== null) return Number(agent.experienceYears);
    if (agent?.experience_years !== undefined && agent?.experience_years !== null) return Number(agent.experience_years);
    return 0;
  });
  const [dob, setDob] = useState(() => parseDob(agent?.dob));
  const [state, setState] = useState(agent?.state || '');
  const [city, setCity] = useState(agent?.city || '');
  const [address, setAddress] = useState(agent?.address || '');
  const [avatarUrl, setAvatarUrl] = useState(agent?.avatarUrl || agent?.avatar_url || '');
  const [avatarError, setAvatarError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [docCameraKey, setDocCameraKey] = useState(null); // 'aadhaar' | 'driving_license' | null
  const [showNameLockedNotice, setShowNameLockedNotice] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);
  const nameLockedTimeoutRef = useRef(null);
  const gpsNoticeTimeoutRef = useRef(null);

  const [isPhoneOtpModalOpen, setIsPhoneOtpModalOpen] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);

  // Document Verification State
  const aadhaarInputRef = useRef(null);
  const drivingLicenseInputRef = useRef(null);

  const [documents, setDocuments] = useState({
    aadhaar: {
      status: 'Not Uploaded',
      fileName: '',
      fileSize: 0,
      fileUrl: '',
      uploadedAt: null,
      rejectionReason: ''
    },
    driving_license: {
      status: 'Not Uploaded',
      fileName: '',
      fileSize: 0,
      fileUrl: '',
      uploadedAt: null,
      rejectionReason: ''
    }
  });

  const [uploadProgress, setUploadProgress] = useState({
    aadhaar: 0,
    driving_license: 0
  });

  const [isUploadingDoc, setIsUploadingDoc] = useState({
    aadhaar: false,
    driving_license: false
  });

  const [isDragging, setIsDragging] = useState({
    aadhaar: false,
    driving_license: false
  });

  const isPhoneVerified = Boolean(
    (agent?.isPhoneVerified ?? agent?.is_phone_verified) &&
    cleanPhone(agent?.phone) === phone &&
    phone &&
    phone.length === 10
  );

  const handleOpenPhoneVerification = () => {
    if (!phone || phone.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number first.', 4000, 'error');
      return;
    }
    setIsPhoneOtpModalOpen(true);
  };

  const handlePhoneVerificationSuccess = async (enteredOtp) => {
    setIsPhoneOtpModalOpen(false);
    setIsVerifyingPhone(true);
    try {
      const res = await fetch('http://localhost:5000/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'agent',
          email,
          partnerId,
          phone: `+91 ${phone}`,
          otp: enteredOtp
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.message || 'Mobile verification failed.', 4000, 'error');
        return;
      }

      const updated = {
        ...(agent || {}),
        phone: `+91 ${phone}`,
        isPhoneVerified: true
      };
      setAgent(updated);
      localStorage.setItem('nivaaro-agent', JSON.stringify(updated));
      showToast(`Mobile number (+91 ${phone}) verified successfully!`, 3500, 'success');
    } catch (err) {
      console.error('Phone verification error:', err);
      showToast('Network error while verifying mobile number.', 4000, 'error');
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  // Synchronize with fresh backend agent data and cleanse any legacy storage artifacts on mount
  useEffect(() => {
    // 1. Wipe out any stale test DOB or Phone in localStorage
    try {
      const saved = localStorage.getItem('nivaaro-agent');
      if (saved) {
        const parsed = JSON.parse(saved);
        let modified = false;
        if (isTestGarbageDob(parsed.dob)) {
          parsed.dob = null;
          setDob({ day: '', month: '', year: '' });
          modified = true;
        }
        if (isTestGarbagePhone(parsed.phone)) {
          parsed.phone = null;
          setPhone('');
          modified = true;
        }
        if (modified) {
          localStorage.setItem('nivaaro-agent', JSON.stringify(parsed));
        }
      }
    } catch (e) {}

    // 2. Fetch ground-truth profile from PostgreSQL database
    const activeEmail = email || agent?.email;
    const activePartnerId = partnerId || agent?.partnerId || agent?.partner_id;
    if (activeEmail || activePartnerId) {
      const queryParams = activeEmail
        ? `email=${encodeURIComponent(activeEmail)}`
        : `partnerId=${encodeURIComponent(activePartnerId)}`;
      fetch(`http://localhost:5000/api/auth/agent-profile?${queryParams}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.agent) {
            const dbAgent = data.agent;
            setName(dbAgent.name || '');
            setEmail(dbAgent.email || '');
            if (dbAgent.phone && !isTestGarbagePhone(dbAgent.phone)) {
              setPhone(cleanPhone(dbAgent.phone));
            } else {
              setPhone('');
            }
            if (dbAgent.partnerId) setPartnerId(dbAgent.partnerId);
            if (dbAgent.trade) setTrade(dbAgent.trade === 'plumber' ? 'plumber' : 'electrician');
            if (dbAgent.experienceYears !== undefined && dbAgent.experienceYears !== null) setExperienceYears(Number(dbAgent.experienceYears));
            setDob(parseDob(dbAgent.dob));
            if (dbAgent.state) setState(dbAgent.state);
            if (dbAgent.city) setCity(dbAgent.city);
            if (dbAgent.address) setAddress(dbAgent.address);
            if (dbAgent.avatarUrl) setAvatarUrl(dbAgent.avatarUrl);

            const synced = { 
              ...(agent || {}), 
              ...dbAgent, 
              phone: (dbAgent.phone && !isTestGarbagePhone(dbAgent.phone)) ? dbAgent.phone : null,
              dob: parseDob(dbAgent.dob).year ? parseDob(dbAgent.dob) : null,
              isLoggedIn: true 
            };
            setAgent(synced);
            localStorage.setItem('nivaaro-agent', JSON.stringify(synced));

            if (!dbAgent.address && !agent?.address && typeof window !== 'undefined' && navigator.geolocation) {
              handleAutoDetectGps(true);
            }
          }
        })
        .catch(() => {});
    } else if (!agent?.address && typeof window !== 'undefined' && navigator.geolocation) {
      handleAutoDetectGps(true);
    }
  }, []);

  // Fetch Agent Verification Documents from backend & synchronize with storage
  useEffect(() => {
    const activeEmail = email || agent?.email;
    const activePartnerId = partnerId || agent?.partnerId || agent?.partner_id;
    const identifier = activeEmail || activePartnerId;
    if (identifier) {
      fetch(`http://localhost:5000/api/agents/documents/${encodeURIComponent(identifier)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.documents) {
            setDocuments((prev) => ({
              ...prev,
              ...data.documents
            }));
            localStorage.setItem(`nivaaro-agent-docs-${identifier}`, JSON.stringify(data.documents));
          }
        })
        .catch(() => {
          try {
            const saved = localStorage.getItem(`nivaaro-agent-docs-${identifier}`);
            if (saved) setDocuments(JSON.parse(saved));
          } catch (e) {}
        });
    }
  }, [email, partnerId, agent?.email, agent?.partnerId]);

  const handleAutoDetectGps = async (isAuto = false) => {
    setIsDetectingGps(true);
    try {
      const loc = await detectCurrentGpsLocation();
      let updatedSomething = false;

      if (loc.state) {
        setState(loc.state);
        updatedSomething = true;
      }
      if (loc.city) {
        setCity(loc.city);
        updatedSomething = true;
      }
      if (loc.address && (!address || loc.address !== address)) {
        setAddress(loc.address);
        updatedSomething = true;
      }

      setIsDetectingGps(false);
      if (updatedSomething) {
        const noticeMsg = `GPS detected your operating base location (${loc.city ? `${loc.city}, ` : ''}${loc.state || 'India'}). Please review the details and click "Save Professional Profile" below to save.`;
        if (gpsNoticeTimeoutRef.current) {
          clearTimeout(gpsNoticeTimeoutRef.current);
        }
        setGpsNotice(noticeMsg);
        gpsNoticeTimeoutRef.current = setTimeout(() => {
          setGpsNotice(null);
        }, 8500);
        showToast('Base location fetched via GPS! Click "Save Professional Profile" to confirm.', 4000, 'info');
        if (addressInputRef.current) {
          addressInputRef.current.focus();
        }
      } else if (!isAuto) {
        showToast('GPS coordinates fetched successfully.', 3000, 'info');
      }
    } catch (err) {
      setIsDetectingGps(false);
      if (!isAuto) {
        showToast(err.message || 'Could not fetch GPS location. Please enter manually.', 4000, 'error');
      }
    }
  };

  const handleAddressSectionClick = () => {
    if (!isDetectingGps && (!address || address.trim().length < 10 || address.startsWith('Lat:'))) {
      handleAutoDetectGps(false);
    }
  };

  useEffect(() => {
    return () => {
      if (nameLockedTimeoutRef.current) {
        clearTimeout(nameLockedTimeoutRef.current);
      }
      if (gpsNoticeTimeoutRef.current) {
        clearTimeout(gpsNoticeTimeoutRef.current);
      }
    };
  }, []);

  const handleLockedNameClick = () => {
    if (nameLockedTimeoutRef.current) {
      clearTimeout(nameLockedTimeoutRef.current);
    }
    setShowNameLockedNotice(true);
    nameLockedTimeoutRef.current = setTimeout(() => {
      setShowNameLockedNotice(false);
    }, 5000);
  };

  useEffect(() => {
    if (agent) {
      setName(agent.name || '');
      setEmail(agent.email || '');
      setPhone(cleanPhone(agent.phone));
      setPartnerId(agent.partnerId || agent.partner_id || '202500001');
      setTrade(agent.trade === 'plumber' ? 'plumber' : 'electrician');
      const exp = agent.experienceYears !== undefined && agent.experienceYears !== null
        ? Number(agent.experienceYears)
        : (agent.experience_years !== undefined && agent.experience_years !== null ? Number(agent.experience_years) : 0);
      setExperienceYears(exp);
      setDob(parseDob(agent.dob));
      setState(agent.state || '');
      setCity(agent.city || '');
      setAddress(agent.address || '');
      setAvatarUrl(agent.avatarUrl || agent.avatar_url || '');
    }
  }, [agent]);

  // File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WEBP).', 4000, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size should be under 5MB.', 4000, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarUrl(event.target.result);
      showToast('Partner photo updated successfully.', 2500, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleLiveCameraCapture = (capturedBase64) => {
    setAvatarUrl(capturedBase64);
    showToast('Live professional photo captured successfully.', 2500, 'success');
  };

  // Handle camera capture for document upload slots
  const handleDocCameraCapture = (capturedBase64) => {
    if (!docCameraKey) return;
    try {
      // Convert base64 data URL to a File object for the existing upload pipeline
      const arr = capturedBase64.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      const docLabel = docCameraKey === 'aadhaar' ? 'aadhaar_card' : 'driving_license';
      const file = new File([u8arr], `${docLabel}_camera.jpg`, { type: mime });
      handleProcessDocUpload(docCameraKey, file);
    } catch (err) {
      showToast('Failed to process camera image. Please try again.', 3000, 'error');
    }
    setDocCameraKey(null);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    showToast('Professional photo removed.', 2000, 'info');
  };

  // Document Helpers & Upload Logic
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatUploadTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Uploaded recently';
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }) + ', ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return 'Uploaded recently';
    }
  };

  const renderDocStatus = (status) => {
    if (status === 'Verified') {
      return (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.76rem',
          fontWeight: 600,
          color: '#15803d',
          lineHeight: 1
        }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Verified</span>
        </div>
      );
    }
    if (status === 'Under Review') {
      return (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.76rem',
          fontWeight: 600,
          color: '#946E26',
          lineHeight: 1
        }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#946E26" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Under Review</span>
        </div>
      );
    }
    if (status === 'Rejected') {
      return (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.76rem',
          fontWeight: 600,
          color: '#b91c1c',
          lineHeight: 1
        }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>Rejected</span>
        </div>
      );
    }
    // Default: Not Uploaded
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.76rem',
        fontWeight: 600,
        color: '#8C96A5',
        lineHeight: 1
      }}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#8C96A5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="9" y1="12" x2="15" y2="12" />
        </svg>
        <span>Not Uploaded</span>
      </div>
    );
  };

  const handleProcessDocUpload = (docKey, file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const ext = file.name.split('.').pop().toLowerCase();
    const isValidExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);

    if (!validTypes.includes(file.type) && !isValidExt) {
      showToast('Please upload a JPG, PNG, or PDF document.', 4000, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds 5MB limit. Please upload a smaller file.', 4000, 'error');
      return;
    }

    setIsUploadingDoc((prev) => ({ ...prev, [docKey]: true }));
    setUploadProgress((prev) => ({ ...prev, [docKey]: 18 }));

    const reader = new FileReader();
    reader.onload = async (event) => {
      const fileDataUrl = event.target.result;
      
      const pInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const next = (prev[docKey] || 18) + 24;
          if (next >= 92) {
            clearInterval(pInterval);
            return { ...prev, [docKey]: 92 };
          }
          return { ...prev, [docKey]: next };
        });
      }, 100);

      const activeEmail = email || agent?.email;
      const activePartnerId = partnerId || agent?.partnerId || agent?.partner_id;

      try {
        const res = await fetch('http://localhost:5000/api/agents/upload-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: activeEmail,
            partnerId: activePartnerId,
            documentType: docKey,
            fileName: file.name,
            fileType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
            fileSize: file.size,
            fileData: fileDataUrl,
            status: 'Under Review'
          })
        });

        const data = await res.json();
        clearInterval(pInterval);
        setUploadProgress((prev) => ({ ...prev, [docKey]: 100 }));

        setTimeout(() => {
          setIsUploadingDoc((prev) => ({ ...prev, [docKey]: false }));
          setUploadProgress((prev) => ({ ...prev, [docKey]: 0 }));

          const updatedDoc = {
            status: 'Under Review',
            fileName: file.name,
            fileSize: file.size,
            fileUrl: fileDataUrl,
            uploadedAt: new Date().toISOString(),
            rejectionReason: ''
          };

          setDocuments((prev) => {
            const next = { ...prev, [docKey]: updatedDoc };
            const identifier = activeEmail || activePartnerId || 'default';
            localStorage.setItem(`nivaaro-agent-docs-${identifier}`, JSON.stringify(next));
            return next;
          });

          const docLabel = docKey === 'aadhaar' ? 'Aadhaar Card' : 'Driving License';
          showToast(`${docLabel} uploaded successfully and submitted for review.`, 3000, 'success');
        }, 250);

      } catch (err) {
        clearInterval(pInterval);
        setIsUploadingDoc((prev) => ({ ...prev, [docKey]: false }));
        setUploadProgress((prev) => ({ ...prev, [docKey]: 0 }));

        const updatedDoc = {
          status: 'Under Review',
          fileName: file.name,
          fileSize: file.size,
          fileUrl: fileDataUrl,
          uploadedAt: new Date().toISOString(),
          rejectionReason: ''
        };

        setDocuments((prev) => {
          const next = { ...prev, [docKey]: updatedDoc };
          const identifier = activeEmail || activePartnerId || 'default';
          localStorage.setItem(`nivaaro-agent-docs-${identifier}`, JSON.stringify(next));
          return next;
        });

        const docLabel = docKey === 'aadhaar' ? 'Aadhaar Card' : 'Driving License';
        showToast(`${docLabel} uploaded and queued for verification.`, 3000, 'success');
      }
    };

    reader.readAsDataURL(file);
  };

  const renderDocumentCard = (docKey, title, isRequired) => {
    const doc = documents[docKey] || { status: 'Not Uploaded' };
    const inputRef = docKey === 'aadhaar' ? aadhaarInputRef : drivingLicenseInputRef;
    const isFilled = doc.status !== 'Not Uploaded' && Boolean(doc.fileName);

    return (
      <div
        key={docKey}
        className="pro-document-card"
        style={{
          background: '#faf8f4',
          border: '1px solid #e8e2d5',
          borderRadius: '16px',
          padding: '1.2rem 1.35rem',
          boxShadow: '0 2px 8px rgba(16, 24, 32, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Top Row: Label + Tag on left, Status Indicator on right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span style={{
              fontSize: '0.88rem',
              fontWeight: 700,
              color: '#101820',
              fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)"
            }}>
              {title}
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#8C96A5'
            }}>
              {isRequired ? '(Required)' : '(Optional)'}
            </span>
          </div>

          {/* Status Indicator (Text + Small Icon, Not Filled Pill Badge) */}
          <div style={{ flexShrink: 0 }}>
            {renderDocStatus(doc.status)}
          </div>
        </div>

        {/* Card Body: Either Empty State or Filled State */}
        {!isFilled ? (
          /* Empty State: Drop zone + Two action buttons — Upload File + Take Picture */
          <div
            className="doc-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging((prev) => ({ ...prev, [docKey]: true }));
            }}
            onDragLeave={() => setIsDragging((prev) => ({ ...prev, [docKey]: false }))}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging((prev) => ({ ...prev, [docKey]: false }));
              const file = e.dataTransfer.files?.[0];
              if (file) handleProcessDocUpload(docKey, file);
            }}
            style={{
              border: isDragging[docKey] ? '1.5px dashed #946E26' : '1.5px dashed #ded7cb',
              backgroundColor: isDragging[docKey] ? '#faf8f5' : '#ffffff',
              borderRadius: '10px',
              padding: '14px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.18s ease'
            }}
          >
            {/* Drag & Drop Prompt and Hint text */}
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#101820', textAlign: 'center' }}>
              Drag &amp; drop or click to upload
            </span>
            <span style={{ fontSize: '0.75rem', color: '#8C96A5', textAlign: 'center' }}>
              JPG, PNG, PDF — max 5MB
            </span>

            {/* Two-button row */}
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              {/* Upload File Button */}
              <button
                type="button"
                className="doc-action-btn"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
                }}
                aria-label={`Upload ${title} from file`}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: '#f3f0ea', border: '1px solid #ded7cb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#101820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#101820' }}>Upload File</span>
              </button>

              {/* Take Picture Button */}
              <button
                type="button"
                className="doc-action-btn"
                onClick={() => setDocCameraKey(docKey)}
                aria-label={`Take picture of ${title} using camera`}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: '#f3f0ea', border: '1px solid #ded7cb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#101820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#101820' }}>Take Picture</span>
              </button>
            </div>
          </div>
        ) : (
          /* Filled State: thumbnail/icon, filename, timestamp, replace action */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              backgroundColor: '#ffffff',
              border: '1px solid #ded7cb',
              borderRadius: '10px',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                {doc.fileUrl && doc.fileUrl.startsWith('data:image/') ? (
                  <img
                    src={doc.fileUrl}
                    alt={doc.fileName}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      objectFit: 'cover',
                      border: '1px solid #ded7cb',
                      flexShrink: 0
                    }}
                  />
                ) : (
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    backgroundColor: '#faf8f5',
                    border: '1px solid #ded7cb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#101820'
                  }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#101820',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={doc.fileName}
                  >
                    {doc.fileName || 'document.pdf'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#5A6472', marginTop: '2px' }}>
                    {doc.uploadedAt ? formatUploadTime(doc.uploadedAt) : 'Uploaded recently'}
                    {doc.fileSize ? ` • ${formatFileSize(doc.fileSize)}` : ''}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn-replace-doc"
                style={{
                  background: '#faf8f5',
                  border: '1px solid #ded7cb',
                  borderRadius: '6px',
                  padding: '5px 9px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: '#101820',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  transition: 'all 0.15s ease'
                }}
                aria-label={`Replace ${title}`}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Replace</span>
              </button>
            </div>

            {/* Specific Rejection Reason Inline (if rejected) */}
            {doc.status === 'Rejected' && (
              <div style={{
                padding: '8px 10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#b91c1c', lineHeight: 1.45 }}>
                    <strong>Rejection reason:</strong> {doc.rejectionReason || 'Image unclear — please re-upload.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    style={{
                      margin: '4px 0 0',
                      padding: 0,
                      background: 'none',
                      border: 'none',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#b91c1c',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    Re-upload document
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Thin Upload Progress Bar Inline (No spinner overlay) */}
        {isUploadingDoc[docKey] && (
          <div style={{ width: '100%', marginTop: '2px' }}>
            <div style={{
              width: '100%',
              height: '3px',
              backgroundColor: '#ded7cb',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${uploadProgress[docKey]}%`,
                backgroundColor: '#946E26',
                transition: 'width 0.15s ease'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
              <span style={{ fontSize: '0.7rem', color: '#5A6472' }}>Uploading document...</span>
              <span style={{ fontSize: '0.7rem', color: '#946E26', fontWeight: 600 }}>{uploadProgress[docKey]}%</span>
            </div>
          </div>
        )}

        {/* Hidden File Input for this slot */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleProcessDocUpload(docKey, file);
            e.target.value = '';
          }}
        />
      </div>
    );
  };

  const handleReturnToConsole = () => {
    const activeData = {
      ...(agent || {}),
      id: agent?.id,
      partnerId,
      name: name.trim() || agent?.name || 'Professional',
      email: email.trim().toLowerCase() || agent?.email || '',
      phone: (phone && !isTestGarbagePhone(phone)) ? `+91 ${phone}` : null,
      trade: trade === 'plumber' ? 'plumber' : 'electrician',
      experienceYears: (experienceYears !== '' && !isNaN(Number(experienceYears))) ? Number(experienceYears) : 0,
      dob: dob.day && dob.month && dob.year ? dob : null,
      state: state || agent?.state || null,
      city: city || agent?.city || null,
      address: address.trim() || agent?.address || null,
      avatarUrl: avatarUrl || agent?.avatarUrl || agent?.avatar_url || null,
      isLoggedIn: true
    };

    localStorage.setItem('nivaaro-agent', JSON.stringify(activeData));
    setAgent(activeData);

    try {
      fetch('http://localhost:5000/api/auth/agent-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeData)
      }).catch(() => {});
    } catch (e) {}

    const payload = encodeURIComponent(JSON.stringify(activeData));
    window.location.href = `http://localhost:5173?agent=${payload}&lang=${activeLanguage || 'en'}&view=home#home`;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter your full professional name.', 4000, 'error');
      return;
    }

    if (phone && phone.length !== 10) {
      showToast('Please enter a valid 10-digit Indian mobile number (+91).', 4500, 'error');
      return;
    }

    setIsSaving(true);
    const payload = {
      id: agent?.id,
      partnerId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: (phone && !isTestGarbagePhone(phone)) ? `+91 ${phone}` : null,
      trade: trade === 'plumber' ? 'plumber' : 'electrician',
      experienceYears: (experienceYears !== '' && !isNaN(Number(experienceYears))) ? Number(experienceYears) : 0,
      dob: dob.day && dob.month && dob.year ? dob : null,
      state: state || null,
      city: city || null,
      address: address.trim() || null,
      avatarUrl: avatarUrl || null,
      isLoggedIn: true
    };

    try {
      const res = await fetch('http://localhost:5000/api/auth/agent-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setIsSaving(false);

      if (!res.ok || !data.success) {
        showToast(data.message || data.error || 'Failed to update partner profile. Please try again.', 4500, 'error');
        return;
      }

      const updatedAgent = {
        ...agent,
        ...data.agent,
        name: data.agent?.name || name.trim(),
        dob: parseDob(data.agent?.dob),
        state: data.agent?.state || '',
        city: data.agent?.city || '',
        address: data.agent?.address || '',
        isLoggedIn: true
      };

      setAgent(updatedAgent);
      localStorage.setItem('nivaaro-agent', JSON.stringify(updatedAgent));
      if (gpsNoticeTimeoutRef.current) {
        clearTimeout(gpsNoticeTimeoutRef.current);
      }
      setGpsNotice(null);
      showToast('Partner operations profile updated successfully.', 3000, 'success');
    } catch (err) {
      setIsSaving(false);
      console.error('Error saving agent profile:', err);
      showToast('Network issue. Partner profile saved locally.', 4500, 'info');
      const localUpdated = {
        ...agent,
        ...payload
      };
      setAgent(localUpdated);
      localStorage.setItem('nivaaro-agent', JSON.stringify(localUpdated));
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('nivaaro-agent');
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = `http://localhost:5500?portal=agent&lang=${activeLanguage || 'en'}`;
    }
  };

  return (
    <div className="profile-page-wrapper">
      {/* Top Header / Navigation Bar */}
      <header className="profile-top-bar" role="banner">
        <div className="profile-container">
          <div className="profile-bar-inner">
            {/* LEFT: NivaaroFix Pro Logo */}
            <div className="profile-bar-brand">
              <BrandLogo
                size="medium"
                isPartner={true}
                onClick={handleReturnToConsole}
              />
            </div>

            {/* RIGHT: Subtle Secondary Action + Sign Out */}
            <div className="profile-bar-actions">
              <button
                type="button"
                className="profile-switch-action"
                onClick={() => onSwitchPortal ? onSwitchPortal('customer') : (window.location.href = 'http://localhost:5500?portal=customer')}
                aria-label="Switch to Customer Portal"
              >
                <span>Switch to Customer Portal</span>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginTop: '1px' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <button
                type="button"
                className="profile-signout-btn"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="profile-main-body">
        <div className="profile-container">
          <div className="profile-card-surface">
            
            {/* Header Title */}
            <div className="profile-header-group">
              <span className="profile-eyebrow" style={{ color: '#946E26' }}>
                PROFESSIONAL OPERATIONS
              </span>
              <h1 className="profile-headline" style={{ color: '#101820', fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)" }}>
                Professional Profile &amp; Credentials
              </h1>
              <p className="profile-subtitle">
                Update your identity, contact details, and service base location.
              </p>
            </div>

            {/* Two-Column Grid: Form Left, Sidebar Right */}
            <div className="profile-content-grid">
              
              {/* LEFT COLUMN: Main Form */}
              <div className="profile-form-column">

                {/* GPS Auto-Detection Alert Banner */}
                {gpsNotice && (
                  <div
                    className="gps-pop-notice"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      backgroundColor: '#faf8f5',
                      border: '1.5px solid rgba(184, 134, 47, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '18px',
                      color: '#101820',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      boxShadow: '0 4px 14px rgba(184, 134, 47, 0.12), 0 2px 4px rgba(16, 24, 32, 0.04)'
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#B8862F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                      <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', marginBottom: '2px', color: '#101820' }}>
                        Live Location Detected via GPS
                      </strong>
                      {gpsNotice}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (gpsNoticeTimeoutRef.current) clearTimeout(gpsNoticeTimeoutRef.current);
                        setGpsNotice(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#8C96A5',
                        fontSize: '1.2rem',
                        lineHeight: 1,
                        padding: '0 4px',
                        transition: 'color 0.15s ease'
                      }}
                      aria-label="Close notice"
                    >
                      ×
                    </button>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="profile-form">
                  
                  {/* Full Name */}
                  <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor="agent-profile-name" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                        Full Name
                      </label>
                      {/* Clean label without badge per pro-credentials requirements */}
                    </div>

                    <div
                      style={{ position: 'relative', width: '100%', cursor: 'not-allowed' }}
                      onClick={handleLockedNameClick}
                    >
                      <input
                        id="agent-profile-name"
                        className="input-field-locked"
                        type="text"
                        value={name}
                        readOnly
                        disabled
                        aria-readonly="true"
                        style={{
                          width: '100%',
                          background: '#faf8f5',
                          color: '#101820',
                          borderColor: '#ded7cb',
                          cursor: 'not-allowed',
                          fontWeight: 600
                        }}
                      />
                    </div>

                    {showNameLockedNotice && (
                      <div style={{
                        marginTop: '0.45rem',
                        padding: '0.55rem 0.75rem',
                        background: '#faf8f5',
                        border: '1px solid rgba(184, 134, 47, 0.25)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: '#5a6472',
                        lineHeight: 1.45
                      }}>
                        <strong style={{ color: '#101820' }}>Verified Badge Protection:</strong> Technician name is locked to match government KYC credentials and background check certificates.
                      </div>
                    )}
                  </div>

                  {/* ID */}
                  <div className="input-group">
                    <label htmlFor="agent-profile-badge-id" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                      ID
                    </label>
                    <input
                      id="agent-profile-badge-id"
                      type="text"
                      value={partnerId}
                      placeholder="202500001"
                      readOnly
                      disabled
                      style={{ background: '#f3efe8', fontWeight: 700, fontFamily: "'Space Grotesk', monospace" }}
                    />
                  </div>

                  {/* Email Address */}
                  <div className="input-group">
                    <label htmlFor="agent-profile-email" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                      Email Address
                    </label>
                    <input
                      id="agent-profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. partner@nivaarofix.in"
                      required
                    />
                  </div>

                  {/* Mobile Number */}
                  <div className="input-group" onClick={handleMobileClick}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label htmlFor="agent-profile-phone" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820', margin: 0, cursor: 'pointer' }}>
                        Mobile Contact (+91)
                      </label>
                      {showVerifiedTransient && isPhoneVerified && (
                        <span className="phone-status-badge verified" style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(184, 134, 47, 0.12)',
                          color: '#946E26',
                          border: '1px solid rgba(184, 134, 47, 0.25)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'opacity 0.3s ease'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#B8862F'
                          }} />
                          Verified
                        </span>
                      )}
                      {!isPhoneVerified && (
                        <span className="phone-status-badge unverified" style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#dc2626'
                          }} />
                          Not Verified
                        </span>
                      )}
                    </div>
                    <IndianPhoneInput
                      id="agent-profile-phone"
                      value={phone}
                      onChange={(cleanDigits) => setPhone(cleanDigits)}
                      placeholder="Enter 10-digit mobile number"
                      required={false}
                    />
                    {!isPhoneVerified && (
                      <div style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          Mobile number is not verified via SMS OTP.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenPhoneVerification}
                          disabled={isVerifyingPhone || !phone || phone.length !== 10}
                          style={{
                            border: '1px solid #101820',
                            background: '#101820',
                            color: '#ffffff',
                            borderRadius: '5px',
                            padding: '4px 10px',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: (phone && phone.length === 10) ? 'pointer' : 'not-allowed',
                            opacity: (phone && phone.length === 10) ? 1 : 0.6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 1px 3px rgba(16, 24, 32, 0.2)'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          {isVerifyingPhone ? 'Verifying...' : 'Verify Mobile Number'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Trade Specialization & Experience */}
                  <div className="input-row-grid">
                    <div className="input-group">
                      <label htmlFor="agent-profile-trade" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                        Trade Specialization
                      </label>
                      <select
                        id="agent-profile-trade"
                        className="input-select"
                        value={trade === 'plumber' ? 'plumber' : 'electrician'}
                        onChange={(e) => setTrade(e.target.value)}
                      >
                        <option value="electrician">Electrician</option>
                        <option value="plumber">Plumber</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label htmlFor="agent-profile-exp" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                        Years of Experience
                      </label>
                      <input
                        id="agent-profile-exp"
                        type="number"
                        min={0}
                        max={45}
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div className="input-group">
                    <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                      Date of Birth
                    </label>
                    <DateOfBirthSelector
                      value={dob}
                      onChange={setDob}
                    />
                  </div>

                  {/* State and City Cascading Dropdowns */}
                  <LocationCascadingSelect
                    selectedState={state}
                    selectedCity={city}
                    onStateChange={(newState) => {
                      setState(newState);
                      setCity('');
                    }}
                    onCityChange={(newCity) => setCity(newCity)}
                  />

                  {/* Service Hub Base Address */}
                  <div className="input-group" onClick={handleAddressSectionClick}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label htmlFor="agent-profile-address" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820', margin: 0 }}>
                        Workshop &amp; Service Base Address
                      </label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAutoDetectGps(false);
                        }}
                        disabled={isDetectingGps}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: '#101820',
                          backgroundColor: '#faf8f5',
                          border: '1.5px solid rgba(16, 24, 32, 0.15)',
                          borderRadius: '6px',
                          cursor: isDetectingGps ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#946E26" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="22" y1="12" x2="18" y2="12" />
                          <line x1="6" y1="12" x2="2" y2="12" />
                          <line x1="12" y1="6" x2="12" y2="2" />
                          <line x1="12" y1="22" x2="12" y2="18" />
                        </svg>
                        <span>{isDetectingGps ? 'Detecting Location...' : 'Auto-Detect Address'}</span>
                      </button>
                    </div>
                    <textarea
                      id="agent-profile-address"
                      ref={addressInputRef}
                      className="profile-textarea"
                      rows={3}
                      value={address}
                      onFocus={handleAddressSectionClick}
                      onClick={handleAddressSectionClick}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isDetectingGps ? 'Detecting workshop base address via GPS...' : 'Workshop / Facility address, Street, Locality, PIN Code'}
                    />
                  </div>

                  {/* Save Button */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      ref={saveButtonRef}
                      type="submit"
                      className="btn-primary"
                      disabled={isSaving}
                      style={{
                        width: '100%',
                        background: '#101820',
                        boxShadow: gpsNotice ? '0 0 0 3px rgba(184,134,47,0.35)' : undefined
                      }}
                    >
                      {isSaving ? 'Saving Operations Profile...' : 'Save Professional Profile'}
                    </button>
                    {gpsNotice && (
                      <p style={{ marginTop: '6px', fontSize: '0.8rem', color: '#5A6472', textAlign: 'center', fontWeight: 500 }}>
                        Click &ldquo;Save Professional Profile&rdquo; above to store your detected location.
                      </p>
                    )}
                  </div>

                </form>
              </div>

              {/* RIGHT COLUMN: Avatar / Photo Preview */}
              <div className="profile-sidebar-column">
                
                {/* 1. Photo Upload / Live Camera Card */}
                <div className="profile-avatar-card">
                  <div className="avatar-photo-container">
                    <div
                      className="avatar-photo-frame"
                      style={{ borderColor: 'rgba(16, 24, 32, 0.15)' }}
                      onClick={() => fileInputRef.current?.click()}
                      title="Click to choose professional photo"
                      tabIndex={0}
                      role="button"
                      aria-label="Change professional profile photo"
                    >
                      {avatarUrl && !avatarError ? (
                        <img
                          src={avatarUrl}
                          alt={name || 'Professional'}
                          className="avatar-photo-img"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarError(true)}
                        />
                      ) : (
                        <div className="avatar-initials-placeholder" style={{ background: '#101820', color: '#f7f5f1' }}>
                          {(name || 'P').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="avatar-camera-pill"
                      style={{ background: '#101820' }}
                      onClick={() => setIsCameraOpen(true)}
                      title="Take live professional photo with camera"
                      aria-label="Take live professional photo with camera"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                  </div>

                  {/* Tightly aligned metadata stack: Name, ID, Phone, Verified Badge */}
                  <div className="pro-sidebar-meta-stack" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.3rem',
                    marginTop: '0.85rem',
                    marginBottom: '0.85rem',
                    width: '100%',
                    textAlign: 'center'
                  }}>
                    <h2 style={{
                      margin: 0,
                      fontSize: '1.08rem',
                      fontWeight: 700,
                      color: '#101820',
                      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                      lineHeight: 1.25
                    }}>
                      {formatProperCase(name) || 'Professional'}
                    </h2>

                    <p style={{
                      margin: 0,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#5A6472',
                      fontFamily: "'Space Grotesk', monospace",
                      letterSpacing: '0.02em',
                      lineHeight: 1.2
                    }}>
                      ID: {partnerId}
                    </p>

                    {phone && (
                      <p style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: '#5A6472',
                        fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                        lineHeight: 1.2
                      }}>
                        +91 {phone}
                      </p>
                    )}

                    {/* Restrained Verified badge: small check icon + text in accent color (#946E26), no fill */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#946E26',
                      marginTop: '0.1rem',
                      lineHeight: 1
                    }}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#946E26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Verified</span>
                    </div>
                  </div>

                  {/* Photo Action Buttons: balanced equal widths and precise vertical spacing */}
                  <div className="avatar-action-row" style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '0.5rem',
                    marginTop: '0.5rem',
                    width: '100%'
                  }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-avatar-action"
                      style={{
                        flex: 1,
                        height: '38px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        padding: '0.45rem 0.75rem',
                        background: '#ffffff',
                        border: '1.5px solid rgba(16, 24, 32, 0.18)',
                        color: '#101820',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                      aria-label="Upload professional photo from device"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#101820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Upload</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="btn-avatar-action"
                      style={{
                        flex: 1,
                        height: '38px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        padding: '0.45rem 0.75rem',
                        background: '#101820',
                        color: '#ffffff',
                        border: '1.5px solid #101820',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                      aria-label="Take live professional photo with camera"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f7f5f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Live Photo</span>
                    </button>

                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="btn-avatar-action btn-avatar-delete"
                        style={{
                          height: '38px',
                          width: '38px',
                          flexShrink: 0,
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '8px'
                        }}
                        title="Remove professional photo"
                        aria-label="Remove professional profile photo"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8a3b34" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </div>

                {/* 2. Document Verification Section */}
                <div className="pro-documents-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                  {renderDocumentCard('aadhaar', 'Aadhaar Card', true)}
                  {renderDocumentCard('driving_license', 'Driving License', false)}
                </div>

              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Live Camera Modal — Avatar Photo */}
      <LiveCameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleLiveCameraCapture}
      />

      {/* Live Camera Modal — Document Capture (Aadhaar / Driving License) */}
      <LiveCameraCaptureModal
        isOpen={Boolean(docCameraKey)}
        onClose={() => setDocCameraKey(null)}
        onCapture={handleDocCameraCapture}
      />

      {/* Phone OTP Verification Modal */}
      <PhoneOtpModal
        isOpen={isPhoneOtpModalOpen}
        phoneDigits={phone}
        onClose={() => setIsPhoneOtpModalOpen(false)}
        onVerifySuccess={handlePhoneVerificationSuccess}
        onContinueWithoutOtp={handlePhoneVerificationSuccess}
      />
    </div>
  );
}
