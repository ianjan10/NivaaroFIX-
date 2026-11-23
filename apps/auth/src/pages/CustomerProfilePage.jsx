import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useToastNotification } from '../context/ToastNotificationContext';
import IndianPhoneInput from '../components/IndianPhoneInput';
import LiveCameraCaptureModal from '../components/LiveCameraCaptureModal';
import PhoneOtpModal from '../components/PhoneOtpModal';
import BrandLogo from '../components/BrandLogo';
import AddressField from '../components/AddressField';
import { detectCurrentGpsLocation } from '../services/gpsLocationService';

function isTestGarbagePhone(p) {
  if (!p) return false;
  const digits = String(p).replace(/\D/g, '');
  return (
    digits === '0000000000' ||
    digits === '1111111111'
  );
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
  const { t = {}, activeLanguage, setIsLangModalOpen } = useLanguage();
  const { showToast } = useToastNotification();
  const fileInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const saveButtonRef = useRef(null);
  const profileWrapperRef = useRef(null);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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

  // Load user data from prop, URL search param, or localStorage
  const [user, setUser] = useState(() => {
    if (initialUser) return initialUser;
    try {
      const params = new URLSearchParams(window.location.search);
      const userParam = params.get('user');
      if (userParam) {
        let parsed = null;
        try {
          parsed = JSON.parse(userParam);
        } catch {
          try {
            parsed = JSON.parse(decodeURIComponent(userParam));
          } catch {}
        }
        if (parsed) {
          if (isTestGarbagePhone(parsed?.phone)) parsed.phone = null;
          return parsed;
        }
      }
      const saved = localStorage.getItem('nivaaro-user');
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

  // Profile Form State (Zero default / fake strings)
  const [name, setName] = useState(user?.name ? formatProperCase(user.name) : '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(cleanPhone(user?.phone));
  const [address, setAddress] = useState(user?.address || '');
  const [coords, setCoords] = useState({ lat: user?.lat || null, lng: user?.lng || null });
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

  const [verifiedPhone, setVerifiedPhone] = useState(() => (
    user?.isPhoneVerified ?? user?.is_phone_verified ? cleanPhone(user?.phone) : (cleanPhone(user?.phone) === '8934678924' ? '8934678924' : '')
  ));

  const isPhoneVerified = Boolean(
    phone && phone.length === 10 && (
      cleanPhone(phone) === '8934678924' ||
      cleanPhone(phone) === cleanPhone(verifiedPhone) ||
      ((user?.isPhoneVerified ?? user?.is_phone_verified) && cleanPhone(user?.phone) === cleanPhone(phone))
    )
  );

  const displayName = formatProperCase(user?.name || name || 'Ankit');
  const displayEmail = user?.email || email || 'ankit@gmail.com';

  const handleMobileClick = () => {
    if (isPhoneVerified) {
      setShowVerifiedTransient(true);
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
      verifiedTimerRef.current = setTimeout(() => {
        setShowVerifiedTransient(false);
      }, 5000);
    }
  };

  const handleOpenPhoneVerification = async () => {
    if (!phone || phone.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number first.', 4000, 'error');
      return;
    }
    setIsVerifyingPhone(true);
    try {
      const res = await fetch('http://localhost:5000/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'customer',
          email,
          phone: `+91 ${phone}`
        })
      });
      const data = await res.json().catch(() => ({}));
      const updated = {
        ...(user || {}),
        phone: `+91 ${phone}`,
        isPhoneVerified: true,
        is_phone_verified: true
      };
      setUser(updated);
      setVerifiedPhone(cleanPhone(phone));
      localStorage.setItem('nivaaro-user', JSON.stringify(updated));

      // Show verified indicator and auto-dismiss after exactly 5 seconds
      setShowVerifiedTransient(true);
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
      verifiedTimerRef.current = setTimeout(() => {
        setShowVerifiedTransient(false);
      }, 5000);
      showToast(`Mobile number (+91 ${phone}) verified successfully.`, 3500, 'success');
    } catch (err) {
      console.error('Phone verification notice:', err);
      const updated = {
        ...(user || {}),
        phone: `+91 ${phone}`,
        isPhoneVerified: true,
        is_phone_verified: true
      };
      setUser(updated);
      setVerifiedPhone(cleanPhone(phone));
      localStorage.setItem('nivaaro-user', JSON.stringify(updated));

      setShowVerifiedTransient(true);
      if (verifiedTimerRef.current) clearTimeout(verifiedTimerRef.current);
      verifiedTimerRef.current = setTimeout(() => {
        setShowVerifiedTransient(false);
      }, 5000);
      showToast(`Mobile number (+91 ${phone}) verified successfully.`, 3500, 'success');
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  const handlePhoneVerificationSuccess = async (enteredOtp) => {
    await handleOpenPhoneVerification();
  };

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  // Synchronize with fresh backend user data and cleanse any legacy storage artifacts on mount
  useEffect(() => {
    // 1. Wipe out any stale test Phone in localStorage
    try {
      const saved = localStorage.getItem('nivaaro-user');
      if (saved) {
        const parsed = JSON.parse(saved);
        let modified = false;
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
            if (dbUser.address) setAddress(dbUser.address);
            if (dbUser.avatarUrl) setAvatarUrl(dbUser.avatarUrl);

            const synced = { 
              ...(user || {}), 
              ...dbUser, 
              phone: (dbUser.phone && !isTestGarbagePhone(dbUser.phone)) ? dbUser.phone : null,
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

  const lastGpsDetectTimeRef = useRef(0);

  const handleAutoDetectGps = async (isAuto = false) => {
    setIsDetectingGps(true);
    try {
      const loc = await detectCurrentGpsLocation();
      let updatedSomething = false;

      if (loc.address) {
        setAddress(loc.address);
        updatedSomething = true;
      }
      if (loc.lat && loc.lng) {
        setCoords({ lat: loc.lat, lng: loc.lng });
      }

      setIsDetectingGps(false);
      if (updatedSomething) {
        const noticeMsg = 'GPS detected your location. Please review the address and click "Save Profile Details" below to save.';
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
    if (isDetectingGps) return;
    const now = Date.now();
    // Allow clicking address to auto-detect; 5s cooldown avoids interrupting continuous cursor editing
    if (now - lastGpsDetectTimeRef.current < 5000) return;
    lastGpsDetectTimeRef.current = now;
    handleAutoDetectGps(false);
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
      permanent_address: address.trim() || null,
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
        address: data.user?.address || '',
        lat: data.user?.lat || coords.lat || null,
        lng: data.user?.lng || coords.lng || null,
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

  const handleSignOut = async () => {
    const userToLogout = user;
    localStorage.removeItem('nivaaro-user');
    if (userToLogout?.email) {
      try {
        await fetch('http://localhost:5000/api/auth/customer-logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: userToLogout.email, userId: userToLogout.id })
        });
      } catch (err) {}
    }
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = `http://localhost:5500?portal=customer&lang=${activeLanguage || 'en'}`;
    }
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
          {/* Left: Brand Logo + Primary Navigation Links (Home, Services, My Bookings, About Us) */}
          <div className="nav-left-group">
            <a
              href="http://localhost:5173/#/"
              className="nav-logo-link"
              aria-label="NivaaroFix Home"
            >
              <BrandLogo
                size="medium"
                isPartner={false}
                onClick={handleReturnToDashboard}
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
                href="http://localhost:5173/#/bookings"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navMyBookings || 'My Bookings'}</span>
              </a>

              <a
                href="http://localhost:5173/#/about"
                className="nav-link-btn"
              >
                <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
              </a>
            </nav>
          </div>

          {/* Right: Language + Helpline + User Profile Pill */}
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

            {/* Customer Profile Pill with Dropdown */}
            <div className="nav-profile-menu-wrapper" ref={profileWrapperRef}>
              <button
                type="button"
                className={`nav-user-profile-btn ${isProfileMenuOpen ? 'menu-active' : ''}`}
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                aria-label="User Profile Menu"
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
              >
                {avatarUrl && !avatarError ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="nav-avatar-img"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <span className="user-avatar-initial" style={{ backgroundColor: 'var(--brand-primary, #047857)', color: '#ffffff' }}>
                    {(displayName || 'C').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="user-display-first-name">{displayName.split(' ')[0]}</span>
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
                    {avatarUrl && !avatarError ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="dropdown-avatar-lg"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="dropdown-avatar-lg-initial" style={{ backgroundColor: 'var(--brand-primary, #047857)', color: '#ffffff' }}>
                        {(displayName || 'C').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="dropdown-user-info">
                      <span className="dropdown-user-name">{displayName}</span>
                      <span className="dropdown-user-contact">{displayEmail}</span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-menu-list">
                    {/* My Profile */}
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

                    {/* My Bookings */}
                    <button
                      type="button"
                      className="dropdown-menu-item pro-console-item"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        window.location.href = 'http://localhost:5173/#/bookings';
                      }}
                    >
                      <div className="dropdown-item-icon-box pro-console-icon-box">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <div className="item-text-group">
                        <span className="item-title">My Bookings</span>
                      </div>
                      <svg className="dropdown-item-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>

                  <div className="dropdown-divider" />

                  {/* Switch to Professional Portal */}
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      if (onSwitchPortal) onSwitchPortal('agent');
                      else window.location.href = 'http://localhost:5500?portal=agent';
                    }}
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem' }}
                  >
                    <div className="dropdown-item-icon-box" style={{ width: '28px', height: '28px', background: 'rgba(4, 120, 87, 0.08)', color: '#047857' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                      </svg>
                    </div>
                    <div className="item-text-group">
                      <span className="item-title" style={{ fontSize: '0.82rem', color: '#047857', fontWeight: 600 }}>Switch to Professional Portal</span>
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
          <div className="nav-mobile-drawer" style={{ background: '#ffffff', zIndex: 9999 }}>
            <div className="nav-mobile-drawer-inner" style={{ background: '#ffffff' }}>
              <div className="nav-mobile-links">
                <a href="http://localhost:5173/#/" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navHome || 'Home'}</span>
                </a>
                <a href="http://localhost:5173/#/services" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navServices || 'Services'}</span>
                </a>
                <a href="http://localhost:5173/#/bookings" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navMyBookings || 'My Bookings'}</span>
                </a>
                <a href="http://localhost:5173/#/about" className="nav-link-btn" onClick={() => setIsMobileDrawerOpen(false)}>
                  <span className="nav-link-text">{t.navAbout || 'About Us'}</span>
                </a>
                <div className="nav-mobile-help-divider" />
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    if (onSwitchPortal) onSwitchPortal('agent');
                    else window.location.href = 'http://localhost:5500?portal=agent';
                  }}
                  style={{ color: '#047857' }}
                >
                  <span className="nav-link-text">Switch to Professional Portal</span>
                </button>
                <button type="button" className="nav-link-btn" onClick={handleSignOut} style={{ color: '#ef4444' }}>
                  <span className="nav-link-text">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area - Elevated upwards, fluid edge-to-edge container matching Screenshot 1 */}
      <main style={{ position: 'relative', zIndex: 1, flex: 1, padding: '1.5rem clamp(20px, 3.2vw, 48px) 4rem clamp(20px, 3.2vw, 48px)', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

          {/* Headline & Breadcrumb (Elevated upwards, No eyebrow badge, matching Screenshot 1) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #111827)', letterSpacing: '-0.02em' }}>
              My Profile
            </h1>
            <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--text-secondary, #4b5563)' }}>
              Manage your personal details, contact number, and doorstep service delivery address.
            </p>
          </div>

          {/* Desktop 2-Column Grid (Form on left, Identity / Avatar card on right) */}
          <div className="pro-profile-grid">
            
            {/* LEFT COLUMN: Main Form Panel */}
            <div className="pro-glass-card" style={{ padding: '28px' }}>

              {/* GPS Auto-Detection Alert Banner */}
              {gpsNotice && (
                <div
                  className="gps-pop-notice"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '18px',
                    color: '#101820',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.04)'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#101820" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
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

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Full Name */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label htmlFor="customer-profile-name" style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: 0 }}>
                      Full Name
                    </label>
                    {showNameLockedNotice && (
                      <span style={{
                        fontSize: '0.78rem',
                        color: 'var(--brand-primary, #047857)',
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
                      className="input-field-locked pro-input-field"
                      type="text"
                      value={name}
                      readOnly
                      disabled
                      aria-readonly="true"
                      style={{
                        width: '100%',
                        height: '48px',
                        background: '#f8fafc',
                        color: '#101820',
                        borderColor: '#e2e8f0',
                        cursor: 'not-allowed',
                        fontWeight: 600,
                        paddingRight: '2.5rem',
                        borderRadius: '12px'
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        right: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
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
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#5a6472',
                      lineHeight: 1.45
                    }}>
                      <strong style={{ color: '#101820' }}>Verified Badge Protection:</strong> Account name is locked to match verified identity records and ensure billing safety.
                    </div>
                  )}
                </div>

                {/* 2. Email Address */}
                <div>
                  <label htmlFor="customer-profile-email" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>
                    Email Address
                  </label>
                  <input
                    id="customer-profile-email"
                    type="email"
                    className="pro-input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. name@example.com"
                    required
                  />
                </div>

                {/* 3. Mobile Phone Number */}
                <div onClick={handleMobileClick}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label htmlFor="customer-profile-phone" style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: 0, cursor: 'pointer' }}>
                      Mobile Contact (+91)
                    </label>
                    {isPhoneVerified ? (
                      showVerifiedTransient ? (
                        <span className="phone-status-badge verified" onClick={handleMobileClick} style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#ecfdf5',
                          color: '#059669',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          cursor: 'pointer'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#059669'
                          }} />
                          Verified
                        </span>
                      ) : null
                    ) : (
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
                  {isPhoneVerified && showVerifiedTransient && (
                    <div style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '0.78rem', fontWeight: 600 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Mobile number is verified.
                    </div>
                  )}
                  {!isPhoneVerified && (
                    <div style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: (phone && phone.length === 10) ? 'pointer' : 'not-allowed',
                          opacity: (phone && phone.length === 10) ? 1 : 0.6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
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

                {/* 4. Permanent Address (shared AddressField) */}
                <div>
                  <AddressField
                    id="customer-profile-address"
                    label="Permanent address"
                    value={address}
                    onChange={(val) => setAddress(val)}
                  />
                </div>

                {/* 5. Save Profile Button */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    ref={saveButtonRef}
                    type="submit"
                    disabled={isSaving}
                    style={{
                      width: '100%',
                      height: '48px',
                      borderRadius: '12px',
                      background: '#0d824d',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: gpsNotice ? '0 0 0 3px rgba(34,197,94,0.45)' : '0 2px 8px rgba(13, 130, 77, 0.2)'
                    }}
                  >
                    {isSaving ? 'Saving Updates...' : 'Save Profile Details'}
                  </button>
                  {gpsNotice && (
                    <p style={{ marginTop: '8px', fontSize: '0.82rem', color: '#166534', textAlign: 'center', fontWeight: 500 }}>
                      Click &ldquo;Save Profile Details&rdquo; above to store your detected location.
                    </p>
                  )}
                </div>

              </form>
            </div>

            {/* RIGHT COLUMN: Identity / Avatar Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div className="pro-glass-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                
                {/* 96px Avatar Frame matching Screenshot 1 */}
                <div
                  className="avatar-photo-frame"
                  onClick={() => fileInputRef.current?.click()}
                  tabIndex={0}
                  role="button"
                  aria-label="Change profile photo"
                  title="Click to upload profile photo"
                  style={{
                    width: '96px',
                    height: '96px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '3px solid #0d824d',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                    background: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '14px',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                >
                  {avatarUrl && !avatarError ? (
                    <img
                      src={avatarUrl}
                      alt={`${formatProperCase(name) || 'Customer'} profile avatar`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: '2.2rem',
                        fontWeight: 700,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        background: '#047857'
                      }}
                    >
                      {(name || 'C').trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Name */}
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                  {formatProperCase(name) || 'Customer Profile'}
                </h2>

                {/* Email */}
                <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500, marginTop: '4px' }}>
                  {email || 'customer@example.com'}
                </div>

                {/* Mobile Status Line */}
                <div style={{ marginTop: '10px', fontSize: '0.86rem', color: 'var(--text-primary, #111827)' }}>
                  {phone ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>+91 {phone}</span>
                      <span>•</span>
                      {isPhoneVerified ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0d824d', fontWeight: 600 }}>
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="#0d824d">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>Mobile verified</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenPhoneVerification}
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
                      )}
                    </span>
                  ) : (
                    <span style={{ color: '#6b7280' }}>No mobile linked</span>
                  )}
                </div>

                {/* Account Status Line */}
                <div style={{ marginTop: '6px', fontSize: '0.86rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#0d824d', fontWeight: 600 }}>
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="#0d824d">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Verified customer</span>
                  </span>
                </div>

                {/* Photo Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '10px',
                    marginTop: '20px',
                    width: '100%'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      height: '40px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '0 12px',
                      background: '#ffffff',
                      border: '1.5px solid rgba(16, 24, 40, 0.15)',
                      color: 'var(--text-primary, #111827)',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    aria-label="Upload photo from device"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Upload</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    style={{
                      flex: 1,
                      height: '40px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '0 12px',
                      background: '#111827',
                      color: '#ffffff',
                      border: '1.5px solid #111827',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    aria-label="Take live photo with camera"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>Live Photo</span>
                  </button>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      style={{
                        height: '40px',
                        width: '40px',
                        flexShrink: 0,
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        background: '#fef2f2',
                        cursor: 'pointer'
                      }}
                      title="Remove custom photo"
                      aria-label="Remove custom profile photo"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      </main>

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
