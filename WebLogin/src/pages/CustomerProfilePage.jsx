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

export default function CustomerProfilePage({ initialUser, onSwitchPortal, onLogout }) {
  const { t, activeLanguage } = useLanguage();
  const { showToast } = useToastNotification();
  const fileInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const saveButtonRef = useRef(null);

  // Load user data from prop, URL search param, or localStorage
  const [user, setUser] = useState(() => {
    if (initialUser) return initialUser;
    try {
      const params = new URLSearchParams(window.location.search);
      const userParam = params.get('user');
      if (userParam) {
        const parsed = JSON.parse(decodeURIComponent(userParam));
        if (isTestGarbageDob(parsed?.dob)) parsed.dob = null;
        if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
        return parsed;
      }
      const saved = localStorage.getItem('nivaaro-user');
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
  const [name, setName] = useState(user?.name ? formatProperCase(user.name) : '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(cleanPhone(user?.phone));
  const [dob, setDob] = useState(() => parseDob(user?.dob));
  const [state, setState] = useState(user?.state || '');
  const [city, setCity] = useState(user?.city || '');
  const [address, setAddress] = useState(user?.address || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || user?.avatar_url || '');
  const [avatarError, setAvatarError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showNameLockedNotice, setShowNameLockedNotice] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);
  const nameLockedTimeoutRef = useRef(null);
  const gpsNoticeTimeoutRef = useRef(null);
  const verifiedTimerRef = useRef(null);
  const [showVerifiedTransient, setShowVerifiedTransient] = useState(false);

  const [isPhoneOtpModalOpen, setIsPhoneOtpModalOpen] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);

  const isPhoneVerified = Boolean(
    (user?.isPhoneVerified ?? user?.is_phone_verified) &&
    cleanPhone(user?.phone) === phone &&
    phone &&
    phone.length === 10
  );

  const handleMobileClick = () => {
    if (isPhoneVerified) {
      setShowVerifiedTransient(true);
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
      verifiedTimerRef.current = setTimeout(() => {
        setShowVerifiedTransient(false);
      }, 5000);
    }
  };

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
          role: 'customer',
          email,
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
        ...(user || {}),
        phone: `+91 ${phone}`,
        isPhoneVerified: true
      };
      setUser(updated);
      localStorage.setItem('nivaaro-user', JSON.stringify(updated));
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

  // Synchronize with fresh backend user data and cleanse any legacy storage artifacts on mount
  useEffect(() => {
    // 1. Wipe out any stale test DOB or Phone in localStorage
    try {
      const saved = localStorage.getItem('nivaaro-user');
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
          localStorage.setItem('nivaaro-user', JSON.stringify(parsed));
        }
      }
    } catch (e) {}

    // 2. Fetch ground-truth profile from PostgreSQL database
    const activeEmail = email || user?.email;
    if (activeEmail) {
      fetch(`http://localhost:5000/api/auth/customer-profile?email=${encodeURIComponent(activeEmail)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            const dbUser = data.user;
            setName(dbUser.name ? formatProperCase(dbUser.name) : '');
            setEmail(dbUser.email || '');
            if (dbUser.phone && !isTestGarbagePhone(dbUser.phone)) {
              setPhone(cleanPhone(dbUser.phone));
            } else {
              setPhone('');
            }
            setDob(parseDob(dbUser.dob));
            if (dbUser.state) setState(dbUser.state);
            if (dbUser.city) setCity(dbUser.city);
            if (dbUser.address) setAddress(dbUser.address);
            if (dbUser.avatarUrl) setAvatarUrl(dbUser.avatarUrl);

            const synced = { 
              ...(user || {}), 
              ...dbUser, 
              phone: (dbUser.phone && !isTestGarbagePhone(dbUser.phone)) ? dbUser.phone : null,
              dob: parseDob(dbUser.dob).year ? parseDob(dbUser.dob) : null,
              isLoggedIn: true 
            };
            setUser(synced);
            localStorage.setItem('nivaaro-user', JSON.stringify(synced));

            if (!dbUser.address && !user?.address && typeof window !== 'undefined' && navigator.geolocation) {
              handleAutoDetectGps(true);
            }
          }
        })
        .catch(() => {});
    } else if (!user?.address && typeof window !== 'undefined' && navigator.geolocation) {
      handleAutoDetectGps(true);
    }
  }, []);

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
        const noticeMsg = `GPS detected your location (${loc.city ? `${loc.city}, ` : ''}${loc.state || 'India'}). Please review the details and click "Save Profile Details" below to save.`;
        if (gpsNoticeTimeoutRef.current) {
          clearTimeout(gpsNoticeTimeoutRef.current);
        }
        setGpsNotice(noticeMsg);
        gpsNoticeTimeoutRef.current = setTimeout(() => {
          setGpsNotice(null);
        }, 8500);
        showToast('Location fetched via GPS! Click "Save Profile Details" to confirm.', 4000, 'info');
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
      if (verifiedTimerRef.current) {
        clearTimeout(verifiedTimerRef.current);
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
    if (user) {
      setName(user.name ? formatProperCase(user.name) : '');
      setEmail(user.email || '');
      setPhone(cleanPhone(user.phone));
      setDob(parseDob(user.dob));
      setState(user.state || '');
      setCity(user.city || '');
      setAddress(user.address || '');
      setAvatarUrl(user.avatarUrl || user.avatar_url || '');
    }
  }, [user]);

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
      showToast('Profile photo updated successfully.', 2500, 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleLiveCameraCapture = (capturedBase64) => {
    setAvatarUrl(capturedBase64);
    showToast('Live photo captured successfully.', 2500, 'success');
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    showToast('Profile photo removed.', 2000, 'info');
  };

  const handleReturnToDashboard = () => {
    const activeData = {
      ...(user || {}),
      id: user?.id,
      name: name.trim() || user?.name || 'Customer',
      email: email.trim().toLowerCase() || user?.email || '',
      phone: (phone && !isTestGarbagePhone(phone)) ? `+91 ${phone}` : null,
      dob: dob.day && dob.month && dob.year ? dob : null,
      state: state || user?.state || null,
      city: city || user?.city || null,
      address: address.trim() || user?.address || null,
      avatarUrl: avatarUrl || user?.avatarUrl || user?.avatar_url || null,
      isLoggedIn: true
    };

    localStorage.setItem('nivaaro-user', JSON.stringify(activeData));
    setUser(activeData);

    try {
      fetch('http://localhost:5000/api/auth/customer-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeData)
      }).catch(() => {});
    } catch (e) {}

    const payload = encodeURIComponent(JSON.stringify(activeData));
    window.location.href = `http://localhost:5173?user=${payload}&lang=${activeLanguage || 'en'}&view=home#home`;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter your full name.', 4000, 'error');
      return;
    }

    if (phone && phone.length !== 10) {
      showToast('Please enter a valid 10-digit Indian mobile number (+91).', 4500, 'error');
      return;
    }

    setIsSaving(true);
    const payload = {
      id: user?.id,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: (phone && !isTestGarbagePhone(phone)) ? `+91 ${phone}` : null,
      dob: dob.day && dob.month && dob.year ? dob : null,
      state: state || null,
      city: city || null,
      address: address.trim() || null,
      avatarUrl: avatarUrl || null,
      isLoggedIn: true
    };

    try {
      const res = await fetch('http://localhost:5000/api/auth/customer-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setIsSaving(false);

      if (!res.ok || !data.success) {
        showToast(data.message || data.error || 'Failed to update profile. Please try again.', 4500, 'error');
        return;
      }

      const updatedUser = {
        ...user,
        ...data.user,
        name: data.user?.name || name.trim(),
        dob: parseDob(data.user?.dob),
        state: data.user?.state || '',
        city: data.user?.city || '',
        address: data.user?.address || '',
        isLoggedIn: true
      };

      setUser(updatedUser);
      localStorage.setItem('nivaaro-user', JSON.stringify(updatedUser));
      if (gpsNoticeTimeoutRef.current) {
        clearTimeout(gpsNoticeTimeoutRef.current);
      }
      setGpsNotice(null);
      showToast('Profile details saved successfully.', 3000, 'success');
    } catch (err) {
      setIsSaving(false);
      console.error('Error saving profile:', err);
      showToast('Network issue. Profile saved locally.', 4500, 'info');
      const localUpdated = {
        ...user,
        ...payload
      };
      setUser(localUpdated);
      localStorage.setItem('nivaaro-user', JSON.stringify(localUpdated));
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('nivaaro-user');
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = `http://localhost:5500?portal=customer&lang=${activeLanguage || 'en'}`;
    }
  };

  return (
    <div className="profile-page-wrapper">
      {/* Top Header / Navigation Bar */}
      <header className="profile-top-bar" role="banner">
        <div className="profile-container">
          <div className="profile-bar-inner">
            {/* LEFT: NivaaroFix Logo */}
            <div className="profile-bar-brand">
              <BrandLogo
                size="medium"
                isPartner={false}
                onClick={handleReturnToDashboard}
              />
            </div>

            {/* RIGHT: Subtle Secondary Action + Sign Out */}
            <div className="profile-bar-actions">
              <button
                type="button"
                className="profile-switch-action"
                onClick={() => onSwitchPortal ? onSwitchPortal('agent') : (window.location.href = 'http://localhost:5500?portal=agent')}
                aria-label="Switch to Professional Portal"
              >
                <span>Switch to Professional Portal</span>
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

      {/* Main Content Area */}
      <div className="profile-main-body">
        <div className="profile-container">
          <div className="profile-card-surface">
            
            {/* Header Title */}
            <div className="profile-header-group">
              <span className="profile-eyebrow" style={{ color: '#946E26' }}>CUSTOMER ACCOUNT</span>
              <h1 className="profile-headline" style={{ color: '#101820', fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)" }}>
                Personal Information &amp; Saved Address
              </h1>
              <p className="profile-subtitle">
                Manage your personal details, contact number, and doorstep service delivery address.
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
                      <label htmlFor="customer-profile-name" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                        Full Name
                      </label>
                      {showNameLockedNotice && (
                        <span style={{
                          fontSize: '0.78rem',
                          color: '#946E26',
                          fontWeight: 600,
                          transition: 'opacity 0.25s ease'
                        }}>
                          Verified — Locked
                        </span>
                      )}
                    </div>

                    <div
                      style={{ position: 'relative', width: '100%', cursor: 'not-allowed' }}
                      onClick={handleLockedNameClick}
                    >
                      <input
                        id="customer-profile-name"
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
                          fontWeight: 600,
                          paddingRight: '2.5rem'
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#946E26',
                          display: 'flex',
                          alignItems: 'center',
                          pointerEvents: 'none'
                        }}
                        title="Name locked to verified credentials"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
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
                        <strong style={{ color: '#101820' }}>Verified Badge Protection:</strong> Account name is locked to match verified identity records and ensure billing safety.
                      </div>
                    )}
                  </div>

                  {/* Email Address */}
                  <div className="input-group">
                    <label htmlFor="customer-profile-email" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820' }}>
                      Email Address
                    </label>
                    <input
                      id="customer-profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. name@example.com"
                      required
                    />
                  </div>

                  {/* Mobile Phone Number */}
                  <div className="input-group" onClick={handleMobileClick}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label htmlFor="customer-profile-phone" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820', margin: 0, cursor: 'pointer' }}>
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
                      id="customer-profile-phone"
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

                  {/* Service Delivery Address */}
                  <div className="input-group" onClick={handleAddressSectionClick}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label htmlFor="customer-profile-address" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#101820', margin: 0 }}>
                        Service Delivery Address
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
                      id="customer-profile-address"
                      ref={addressInputRef}
                      className="profile-textarea"
                      rows={3}
                      value={address}
                      onFocus={handleAddressSectionClick}
                      onClick={handleAddressSectionClick}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isDetectingGps ? 'Detecting your doorstep address via GPS...' : 'Flat / House No., Building Name, Street / Road, Area Landmark, PIN Code'}
                    />
                  </div>

                  {/* Save Profile Button */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      ref={saveButtonRef}
                      type="submit"
                      className="btn-primary"
                      disabled={isSaving}
                      style={{
                        width: '100%',
                        boxShadow: gpsNotice ? '0 0 0 3px rgba(34,197,94,0.45)' : undefined
                      }}
                    >
                      {isSaving ? 'Saving Updates...' : 'Save Profile Details'}
                    </button>
                    {gpsNotice && (
                      <p style={{ marginTop: '6px', fontSize: '0.8rem', color: '#166534', textAlign: 'center', fontWeight: 500 }}>
                        Click &ldquo;Save Profile Details&rdquo; above to store your detected location.
                      </p>
                    )}
                  </div>

                </form>
              </div>

              {/* RIGHT COLUMN: Avatar / Photo Preview */}
              <div className="profile-sidebar-column">
                
                {/* 1. Avatar / Photo Preview Card */}
                <div className="profile-avatar-card">
                  <div className="avatar-photo-container">
                    <div
                      className="avatar-photo-frame"
                      onClick={() => fileInputRef.current?.click()}
                      tabIndex={0}
                      role="button"
                      aria-label="Change profile photo"
                      title="Click to upload profile photo"
                    >
                      {avatarUrl && !avatarError ? (
                        <img
                          src={avatarUrl}
                          alt={`${formatProperCase(name) || 'Customer'} profile avatar`}
                          className="avatar-photo-img"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarError(true)}
                        />
                      ) : (
                        <div className="avatar-initials-placeholder" style={{ background: '#101820', color: '#f7f5f1', fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)" }}>
                          {(name || 'U').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="avatar-camera-pill"
                      title="Take live photo with camera"
                      aria-label="Take live photo with camera"
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f7f5f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                  </div>

                  {/* Tightly aligned metadata stack: Name, Email/Phone, Verified status */}
                  <div className="customer-sidebar-meta-stack" style={{
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
                      {name || 'Customer Profile'}
                    </h2>
                    <p style={{
                      margin: 0,
                      fontSize: '0.82rem',
                      color: '#5A6472',
                      fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                      lineHeight: 1.2
                    }}>
                      {email || 'Registered Customer'}
                    </p>
                    {phone && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}>
                        <span style={{
                          fontSize: '0.8rem',
                          color: '#5A6472',
                          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                          lineHeight: 1.2
                        }}>
                          +91 {phone}
                        </span>
                        {isPhoneVerified ? (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#946E26',
                            lineHeight: 1
                          }}>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#946E26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Verified</span>
                          </div>
                        ) : (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca'
                          }}>
                            Not Verified
                          </span>
                        )}
                      </div>
                    )}
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
                      aria-label="Upload photo from device"
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
                      className="btn-avatar-action btn-avatar-primary"
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
                      aria-label="Take live photo with camera"
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
                        title="Remove custom photo"
                        aria-label="Remove custom profile photo"
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

              </div>

            </div>

          </div>
        </div>
      </div>

      {/* Live Camera Modal */}
      <LiveCameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleLiveCameraCapture}
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
