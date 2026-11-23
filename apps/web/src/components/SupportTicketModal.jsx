import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const CATEGORIES_CUSTOMER = [
  'Payment, Billing & Refund Dispute',
  'Technician No-Show or Late Arrival',
  'Workmanship Warranty & Damage Dispute',
  'Technician Misconduct or Safety Incident',
  'Account, Login & OTP Technical Issue',
  'General Platform Support'
];

const CATEGORIES_PRO = [
  'Payout, Bank & Wallet Settlement',
  'Dispatch, Acceptance & Lead Feed',
  'KYC, Documents & Identity Verification',
  'Customer Misconduct or Fare Dispute',
  'App Technical Bug & Crash',
  'Partner Support & Account Assistance'
];

export default function SupportTicketModal({
  isOpen,
  onClose,
  currentUser = null,
  currentAgent = null,
  initialCategory = '',
  initialSubject = '',
  initialDescription = '',
  booking = null
}) {
  const [activeTab, setActiveTab] = useState('raise'); // 'raise' | 'track'
  
  // Form State
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderPhone, setSenderPhone] = useState('');

  const getDetectedRole = () => {
    if (currentAgent?.isLoggedIn) return 'professional';
    try {
      const savedAgent = localStorage.getItem('nivaaro-agent');
      if (savedAgent) {
        const parsed = JSON.parse(savedAgent);
        if (parsed?.name || parsed?.email) return 'professional';
      }
    } catch (_) {}
    if (currentUser?.role === 'agent' || currentUser?.role === 'professional') return 'professional';
    if ((senderName || '').toLowerCase().includes('professional') || (senderName || '').toLowerCase().includes('mahesh')) return 'professional';
    return 'customer';
  };

  const role = getDetectedRole();
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState(null); // { base64Data, filename, mimeType, size }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdTicket, setCreatedTicket] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Active / Under Process Ticket State
  const [activeTicket, setActiveTicket] = useState(null);
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  // Track Ticket State
  const [trackCode, setTrackCode] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState('');

  // Complainant Reply / Info Response State
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [replySuccess, setReplySuccess] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);
  const replyFileInputRef = useRef(null);

  const fileInputRef = useRef(null);
  const modalContentRef = useRef(null);

  // Check if sender currently has a ticket under process
  const fetchActiveTicket = async (email, phone, roleName, id) => {
    const qEmail = (email || '').trim();
    const qPhone = (phone || '').replace(/\D/g, '');
    if (!qEmail && !qPhone && !id) return;

    setIsLoadingActive(true);
    try {
      const params = new URLSearchParams();
      if (qEmail) params.set('email', qEmail);
      if (qPhone) params.set('phone', qPhone);
      if (roleName) params.set('role', roleName);
      if (id) params.set('sender_id', id);

      const res = await fetch(`/api/support/active-ticket?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.hasActiveTicket) {
        setActiveTicket(data.ticket);
      } else {
        setActiveTicket(null);
      }
    } catch (err) {
      console.error('Failed to check active ticket:', err);
    } finally {
      setIsLoadingActive(false);
    }
  };

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

  // Initialize or prefill logged-in credentials
  useEffect(() => {
    if (isOpen) {
      // Set initial values from props if provided
      if (initialCategory) {
        setCategory(initialCategory);
      }
      if (initialSubject) {
        setSubject(initialSubject);
      }
      if (initialDescription) {
        setDescription(initialDescription);
      }

      let detectedAgent = currentAgent?.isLoggedIn ? currentAgent : null;
      if (!detectedAgent) {
        try {
          const saved = localStorage.getItem('nivaaro-agent');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.name || parsed?.email) detectedAgent = parsed;
          }
        } catch (_) {}
      }

      // Check for user details from booking, currentUser, or stored customer
      let effectiveName = booking?.userName || booking?.user_name || currentUser?.name || currentUser?.userName || '';
      let effectiveEmail = booking?.userEmail || booking?.user_email || currentUser?.email || currentUser?.userEmail || '';
      let effectivePhone = booking?.userPhone || booking?.user_phone || currentUser?.phone || currentUser?.userPhone || '';

      if (!effectiveEmail) {
        try {
          const uStr = localStorage.getItem('nivaarofix_user') || localStorage.getItem('nivaaro-user');
          if (uStr) {
            const parsedU = JSON.parse(uStr);
            if (parsedU?.name && !effectiveName) effectiveName = parsedU.name;
            if (parsedU?.email) effectiveEmail = parsedU.email;
            if (parsedU?.phone && !effectivePhone) effectivePhone = parsedU.phone;
          }
        } catch (_) {}
      }

      if (detectedAgent) {
        setSenderName(detectedAgent.name || '');
        setSenderEmail(detectedAgent.email || '');
        setSenderPhone(detectedAgent.phone || '');
        if (!initialCategory) setCategory(CATEGORIES_PRO[0]);
        fetchActiveTicket(detectedAgent.email, detectedAgent.phone, 'professional', detectedAgent.id);
      } else if (currentUser?.isLoggedIn || effectiveEmail) {
        setSenderName(effectiveName || currentUser?.name || '');
        setSenderEmail(effectiveEmail || currentUser?.email || '');
        setSenderPhone(effectivePhone || currentUser?.phone || '');
        if (!initialCategory) setCategory(CATEGORIES_CUSTOMER[0]);
        fetchActiveTicket(effectiveEmail || currentUser?.email, effectivePhone || currentUser?.phone, 'customer', currentUser?.id);
      } else {
        if (!initialCategory) setCategory(CATEGORIES_CUSTOMER[0]);
        try {
          const guestEmail = localStorage.getItem('nivaaro-guest-support-email');
          const guestName = localStorage.getItem('nivaaro-guest-support-name');
          if (guestEmail) {
            setSenderEmail(guestEmail);
            if (guestName) setSenderName(guestName);
            fetchActiveTicket(guestEmail, '', 'customer');
          } else {
            setActiveTicket(null);
          }
        } catch (_) {
          setActiveTicket(null);
        }
      }
      setErrorMsg('');
      setCreatedTicket(null);
      setCopiedCode(false);
      setTrackError('');
      setTrackResult(null);
    }
  }, [isOpen, currentUser, currentAgent]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File size must not exceed 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const base64Data = loadEvt.target.result;
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setAttachment({
        base64Data,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: sizeMb
      });
      setErrorMsg('');
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read the selected file. Please try another.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!senderName.trim()) {
      setErrorMsg('Please provide your name.');
      return;
    }

    if (!senderEmail.trim()) {
      setErrorMsg('Please provide your email address.');
      return;
    }

    if (!category) {
      setErrorMsg('Please select a problem category.');
      return;
    }

    if (!subject.trim()) {
      setErrorMsg('Please enter a brief title for your problem.');
      return;
    }

    if (!description.trim() || description.trim().length < 15) {
      setErrorMsg('Please describe the problem in at least 15 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        sender_role: role,
        sender_id: currentAgent?.isLoggedIn ? (currentAgent.id || null) : (currentUser?.id || null),
        sender_name: senderName.trim(),
        sender_email: senderEmail.trim(),
        sender_phone: senderPhone.trim() || null,
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachment: attachment ? {
          base64Data: attachment.base64Data,
          filename: attachment.filename,
          mimeType: attachment.mimeType
        } : null
      };

      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.activeTicket) {
          setActiveTicket(data.activeTicket);
        }
        throw new Error(data.error || 'Failed to submit support ticket.');
      }

      setCreatedTicket(data.ticket);
      setActiveTicket(data.ticket);
      try {
        localStorage.setItem('nivaaro-guest-support-email', senderEmail.trim());
        localStorage.setItem('nivaaro-guest-support-name', senderName.trim());
      } catch (_) {}
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong while submitting the ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTicketCode = () => {
    if (createdTicket?.ticket_code) {
      navigator.clipboard.writeText(createdTicket.ticket_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleTrackTicket = async (e, overrideCode = null) => {
    if (e) e.preventDefault();
    setTrackError('');
    setTrackResult(null);

    const code = (overrideCode || trackCode).trim();
    if (!code) {
      setTrackError('Please enter your Ticket ID (e.g. 2026000001).');
      return;
    }

    setIsTracking(true);
    try {
      const res = await fetch(`/api/support/tickets/track/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ticket not found.');
      }
      setTrackResult(data.ticket);
      setReplyError('');
      setReplySuccess('');
      if (data.ticket?.info_requested_message && !data.ticket?.info_responded_at) {
        setShowReplyForm(true);
      }

      // If the tracked ticket is resolved, clear any active ticket lock
      if (data.ticket?.status === 'resolved') {
        setActiveTicket(null);
      } else {
        setActiveTicket(data.ticket);
      }
    } catch (err) {
      setTrackError(err.message || 'Could not find ticket with this ID.');
    } finally {
      setIsTracking(false);
    }
  };

  const handleReplyFileChange = (e) => {
    setReplyError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setReplyError('Please upload an image (JPEG, PNG, WEBP) or PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setReplyError('File size exceeds the 10 MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReplyAttachment({
        base64Data: reader.result,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size
      });
    };
    reader.onerror = () => {
      setReplyError('Failed to read file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveReplyAttachment = () => {
    setReplyAttachment(null);
    if (replyFileInputRef.current) {
      replyFileInputRef.current.value = '';
    }
  };

  const handleSubmitReply = async (ticketCode) => {
    if (!replyMessage.trim() && !replyAttachment) {
      setReplyError('Please enter an explanation or attach a photo / document.');
      return;
    }

    setIsSubmittingReply(true);
    setReplyError('');
    setReplySuccess('');

    try {
      const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketCode)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: senderName || (role === 'professional' ? 'Professional' : 'Customer'),
          message: replyMessage.trim(),
          attachment: replyAttachment ? {
            base64Data: replyAttachment.base64Data,
            filename: replyAttachment.filename,
            mimeType: replyAttachment.mimeType
          } : null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit response.');
      }

      setReplySuccess('Additional details and photo sent to operations.');
      setReplyMessage('');
      setReplyAttachment(null);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
      setShowReplyForm(false);

      if (data.ticket) {
        setTrackResult(data.ticket);
        setActiveTicket(data.ticket);
      }
    } catch (err) {
      setReplyError(err.message || 'Failed to submit response.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const categories = role === 'professional' ? CATEGORIES_PRO : CATEGORIES_CUSTOMER;

  const modalJSX = (
    <div
      className="support-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.62)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        boxSizing: 'border-box',
        animation: 'fadeInModal 0.18s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div
        ref={modalContentRef}
        className="support-modal-card"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: 'calc(100vh - 40px)',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0
          }}
        >
          <div>
            <h2
              id="support-modal-title"
              style={{
                margin: 0,
                fontSize: '18px',
                lineHeight: '24px',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.01em'
              }}
            >
              Help & Support
            </h2>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '13px',
                lineHeight: '18px',
                color: '#64748b'
              }}
            >
              Report an issue or track an existing support ticket.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close support dialog"
            style={{
              width: '32px',
              height: '32px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              color: '#64748b',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.backgroundColor = '#f8fafc'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid #f1f5f9',
            background: '#ffffff',
            flexShrink: 0
          }}
        >
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '10px',
              gap: '4px'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('raise')}
              style={{
                flex: 1,
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: activeTab === 'raise' ? 600 : 500,
                color: activeTab === 'raise' ? '#0f172a' : '#64748b',
                background: activeTab === 'raise' ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                boxShadow: activeTab === 'raise' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {activeTicket ? 'Active Ticket' : 'Submit a Ticket'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('track')}
              style={{
                flex: 1,
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: activeTab === 'track' ? 600 : 500,
                color: activeTab === 'track' ? '#0f172a' : '#64748b',
                background: activeTab === 'track' ? '#ffffff' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                boxShadow: activeTab === 'track' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Track Existing Ticket
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {activeTab === 'raise' && (
            <>
              {createdTicket ? (
                /* Success View */
                <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      background: '#ecfdf5',
                      color: '#047857',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      border: '1px solid rgba(4, 120, 87, 0.2)'
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>

                  <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                    Ticket Generated Successfully
                  </h3>
                  <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '20px' }}>
                    Your ticket has been forwarded to NivaaroFix operations. Our team investigates every issue and delivers a resolution within 24 to 72 hours.
                  </p>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '20px',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Ticket Reference</span>
                      <span style={{ fontSize: '11px', color: '#047857', fontWeight: 600, background: '#ecfdf5', padding: '2px 8px', borderRadius: '10px' }}>
                        Under Review
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>
                        {createdTicket.ticket_code}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyTicketCode}
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedCode ? 'Copied' : 'Copy Code'}
                      </button>
                    </div>

                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                      <div><strong>Subject:</strong> {createdTicket.subject}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackCode(createdTicket.ticket_code);
                        setActiveTab('track');
                        handleTrackTicket(null, createdTicket.ticket_code);
                      }}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '8px',
                        border: '1px solid #047857',
                        background: '#ffffff',
                        color: '#047857',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Track This Ticket
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : activeTicket ? (
                /* Ticket Under Process View */
                <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
                  <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                    Support Ticket Under Review
                  </h3>
                  <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '20px' }}>
                    Your ticket is currently being investigated by operations.
                  </p>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '20px',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Ticket Reference</span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: activeTicket.status === 'in_progress' ? '#1d4ed8' : '#b45309',
                          fontWeight: 600,
                          background: activeTicket.status === 'in_progress' ? '#eff6ff' : '#fffbeb',
                          padding: '2px 8px',
                          borderRadius: '10px'
                        }}
                      >
                        {activeTicket.status === 'in_progress' ? 'In Progress' : 'Under Review'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                        {activeTicket.ticket_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeTicket.ticket_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedCode ? 'Copied' : 'Copy ID'}
                      </button>
                    </div>

                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '12.5px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>{activeTicket.subject}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {activeTicket.category} · Submitted {new Date(activeTicket.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {activeTicket.info_requested_message && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px 12px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '8px'
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>
                          Action Requested by Operations:
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#1e3a8a', lineHeight: '18px' }}>
                          "{activeTicket.info_requested_message}"
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#2563eb', fontWeight: 600 }}>
                          Click Track Live Status below to reply and upload requested photos.
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackCode(activeTicket.ticket_code);
                        setActiveTab('track');
                        handleTrackTicket(null, activeTicket.ticket_code);
                      }}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '8px',
                        border: '1px solid #2563eb',
                        background: '#ffffff',
                        color: '#2563eb',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Track Live Status
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Ticket Generation Form */
                <form onSubmit={handleSubmitTicket} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Role Guidance / Service Navigation */}
                  {role === 'customer' ? (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        fontSize: '12.5px',
                        color: '#475569'
                      }}
                    >
                      <span>Need a home repair, plumbing, or electrical service?</span>
                      <a
                        href="#/services"
                        onClick={onClose}
                        style={{
                          fontWeight: 600,
                          color: '#047857',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Book a Service →
                      </a>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#64748b'
                      }}
                    >
                      Partner Support Desk · Payouts, wallet settlement, dispatch issues, and app technical bugs.
                    </div>
                  )}

                  {/* If not logged in, prompt for contact info */}
                  {(!currentUser?.isLoggedIn && !currentAgent?.isLoggedIn) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                          Your Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="e.g. Ramesh Kumar"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '40px',
                            padding: '0 12px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={senderEmail}
                          onChange={(e) => setSenderEmail(e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value && e.target.value.includes('@')) {
                              fetchActiveTicket(e.target.value.trim(), senderPhone, role);
                            }
                          }}
                          placeholder="name@example.com"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '40px',
                            padding: '0 12px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Problem Category */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Problem Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '40px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        color: '#0f172a',
                        outline: 'none',
                        background: '#ffffff',
                        fontFamily: 'inherit'
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Problem Subject */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Problem Subject / Brief Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={
                        role === 'professional'
                          ? 'e.g. Bank payout delayed for Booking #BK-9124 / App crash during acceptance'
                          : 'e.g. Payment deducted twice for Booking #BK-4012 / Professional did not arrive'
                      }
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '40px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  {/* Problem Description */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                        Describe the Problem *
                      </label>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {description.length} characters
                      </span>
                    </div>
                    <textarea
                      required
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        role === 'professional'
                          ? 'Provide booking ID, bank payout reference, or specific steps to reproduce the app issue...'
                          : 'Provide your booking reference, payment transaction details, or what went wrong with your appointment...'
                      }
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        lineHeight: '19px',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  {/* Attach Photo or Document */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Attach Photo or Document (Optional)
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      style={{ display: 'none' }}
                      id="ticket-file-input"
                    />

                    {attachment ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          {attachment.mimeType?.includes('image') ? (
                            <img
                              src={attachment.base64Data}
                              alt="Attachment preview"
                              style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                background: '#e2e8f0',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#475569',
                                fontWeight: 700,
                                fontSize: '11px'
                              }}
                            >
                              PDF
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {attachment.filename}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {attachment.size} MB
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleRemoveAttachment}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          aria-label="Remove attachment"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: '1px dashed #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Upload Photo or Proof (JPG, PNG, PDF up to 10MB)
                      </button>
                    )}
                  </div>

                  {errorMsg && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fee2e2',
                        borderRadius: '8px',
                        color: '#b91c1c',
                        fontSize: '12px'
                      }}
                    >
                      {errorMsg}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        flex: 1,
                        height: '42px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#334155',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={{
                        flex: 2,
                        height: '42px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#047857',
                        color: '#ffffff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        opacity: isSubmitting ? 0.75 : 1,
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {activeTab === 'track' && (
            /* Ticket Tracking View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <form onSubmit={handleTrackTicket} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  required
                  placeholder="Enter Ticket ID (e.g. 2026000001)"
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value.toUpperCase())}
                  style={{
                    flex: 1,
                    height: '40px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={isTracking}
                  style={{
                    padding: '0 18px',
                    height: '40px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#047857',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isTracking ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isTracking ? 'Searching...' : 'Track'}
                </button>
              </form>

              {trackError && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: '8px',
                    color: '#b91c1c',
                    fontSize: '12px'
                  }}
                >
                  {trackError}
                </div>
              )}

              {trackResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* 1. Ticket Overview Card */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      background: '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            {trackResult.category}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>•</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                            {trackResult.ticket_code}
                          </span>
                        </div>
                        <h4 style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 600, color: '#0f172a', lineHeight: '20px' }}>
                          {trackResult.subject}
                        </h4>
                      </div>

                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: trackResult.status === 'resolved' ? '#ecfdf5' : (trackResult.status === 'in_progress' ? '#eff6ff' : '#fef3c7'),
                          color: trackResult.status === 'resolved' ? '#047857' : (trackResult.status === 'in_progress' ? '#1d4ed8' : '#b45309'),
                          border: `1px solid ${trackResult.status === 'resolved' ? 'rgba(4,120,87,0.2)' : (trackResult.status === 'in_progress' ? 'rgba(37,99,235,0.2)' : 'rgba(217,119,6,0.2)')}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {trackResult.status === 'resolved' ? 'Resolved' : (trackResult.status === 'in_progress' ? 'In Progress' : 'Under Review')}
                      </span>
                    </div>

                    <p style={{ margin: '0 0 12px', fontSize: '13px', lineHeight: '19px', color: '#475569' }}>
                      {trackResult.description}
                    </p>

                    {/* Initial Proof / Attachment */}
                    {trackResult.attachment_path && (
                      <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                          ATTACHED EVIDENCE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/\.(jpg|jpeg|png|webp)$/i.test(trackResult.attachment_path) && (
                            <a href={trackResult.attachment_path} target="_blank" rel="noopener noreferrer">
                              <img
                                src={trackResult.attachment_path}
                                alt="Attachment"
                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                              />
                            </a>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {trackResult.attachment_name || 'Proof Attachment'}
                            </div>
                            <a
                              href={trackResult.attachment_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11.5px', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                            >
                              View Full File ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      Submitted: {new Date(trackResult.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {trackResult.resolved_at && ` · Resolved: ${new Date(trackResult.resolved_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>

                  {/* 2. Full Minimalist Timeline */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      background: '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Investigation Timeline
                      </h5>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Live Operations Audit
                      </span>
                    </div>

                    <div style={{ position: 'relative', paddingLeft: '22px', borderLeft: '2px solid #e2e8f0', marginLeft: '6px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      
                      {/* Step 1: Ticket Submitted */}
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: '-28px',
                            top: '2px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#0f172a',
                            border: '2px solid #ffffff',
                            boxShadow: '0 0 0 2px #e2e8f0'
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>
                            Ticket Submitted
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(trackResult.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Logged by {trackResult.sender_name} ({trackResult.sender_role === 'professional' ? 'Professional' : 'Customer'})
                        </div>
                      </div>

                      {/* Step 2: Under Operations Review */}
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: '-28px',
                            top: '2px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#2563eb',
                            border: '2px solid #ffffff',
                            boxShadow: '0 0 0 2px #bfdbfe'
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1d4ed8' }}>
                            Under Operations Review
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(trackResult.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Ticket dispatched to operations team. Priority evaluation and technical audit started.
                        </div>
                      </div>

                      {/* Dynamic Updates (Admin info requests, complainant responses, etc.) */}
                      {(trackResult.timeline || []).map((step, idx) => {
                        const isInfoReq = step.update_type === 'info_request';
                        const isUserReply = step.update_type === 'user_reply';
                        const isResolved = step.update_type === 'resolved' || step.update_type === 'resolution';

                        let dotColor = '#64748b';
                        let dotRing = '#e2e8f0';
                        let title = 'Ticket Update';
                        let titleColor = '#0f172a';

                        if (isInfoReq) {
                          dotColor = '#d97706';
                          dotRing = '#fde68a';
                          title = 'Operations Requested Information / Photos';
                          titleColor = '#b45309';
                        } else if (isUserReply) {
                          dotColor = '#2563eb';
                          dotRing = '#bfdbfe';
                          title = 'Complainant Provided Response';
                          titleColor = '#1d4ed8';
                        } else if (isResolved) {
                          dotColor = '#047857';
                          dotRing = '#a7f3d0';
                          title = 'Official Solution Provided';
                          titleColor = '#047857';
                        }

                        return (
                          <div key={step.id || idx} style={{ position: 'relative' }}>
                            <div
                              style={{
                                position: 'absolute',
                                left: '-28px',
                                top: '2px',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: dotColor,
                                border: '2px solid #ffffff',
                                boxShadow: `0 0 0 2px ${dotRing}`
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: titleColor }}>
                                {title}
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {new Date(step.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop: '6px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: isInfoReq ? '#fffbeb' : (isResolved ? '#ecfdf5' : '#f8fafc'),
                                border: `1px solid ${isInfoReq ? '#fde68a' : (isResolved ? 'rgba(4,120,87,0.2)' : '#e2e8f0')}`,
                                borderLeft: `3px solid ${dotColor}`
                              }}
                            >
                              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>
                                {step.sender_name || (isInfoReq ? 'Operations Support' : 'Complainant')}
                              </div>
                              <div style={{ fontSize: '12.5px', color: isInfoReq ? '#78350f' : (isResolved ? '#064e3b' : '#334155'), lineHeight: '18px' }}>
                                {step.message}
                              </div>

                              {/* If update has attached photo/doc */}
                              {step.attachment_path && (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/\.(jpg|jpeg|png|webp)$/i.test(step.attachment_path) && (
                                      <a href={step.attachment_path} target="_blank" rel="noopener noreferrer">
                                        <img
                                          src={step.attachment_path}
                                          alt="Evidence preview"
                                          style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        />
                                      </a>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '11.5px', color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {step.attachment_name || 'Attached Evidence'}
                                      </div>
                                      <a
                                        href={step.attachment_path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                                      >
                                        View Full File ↗
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Final Resolution Card if resolved and not already in timeline */}
                      {trackResult.status === 'resolved' && trackResult.solution && !(trackResult.timeline || []).some(s => s.update_type === 'resolved' || s.update_type === 'resolution') && (
                        <div style={{ position: 'relative' }}>
                          <div
                            style={{
                              position: 'absolute',
                              left: '-28px',
                              top: '2px',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: '#047857',
                              border: '2px solid #ffffff',
                              boxShadow: '0 0 0 2px #a7f3d0'
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#047857' }}>
                              Official Solution & Resolution
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {trackResult.resolved_at ? new Date(trackResult.resolved_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: '#ecfdf5',
                              border: '1px solid rgba(4,120,87,0.25)',
                              borderLeft: '3px solid #047857'
                            }}
                          >
                            <div style={{ fontSize: '12.5px', color: '#064e3b', lineHeight: '18px' }}>
                              {trackResult.solution}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Complainant Reply / Upload Box (When Active) */}
                  {trackResult.status !== 'resolved' && (
                    <div
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '16px',
                        background: '#ffffff'
                      }}
                    >
                      {/* Alert banner if admin requested info */}
                      {trackResult.info_requested_message && (
                        <div
                          style={{
                            padding: '10px 12px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            marginBottom: '14px'
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>
                            Action Required · Operations Requested Info
                          </div>
                          <div style={{ fontSize: '12.5px', color: '#1e3a8a', lineHeight: '18px' }}>
                            "{trackResult.info_requested_message}"
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showReplyForm ? '12px' : 0 }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                            {trackResult.info_requested_message ? 'Provide Requested Explanation / Photo' : 'Need to add more details or photos?'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                            Directly reaches the operations team handling your ticket.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowReplyForm(!showReplyForm)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            cursor: 'pointer'
                          }}
                        >
                          {showReplyForm ? 'Cancel' : '+ Add Details / Photo'}
                        </button>
                      </div>

                      {showReplyForm && (
                        <div style={{ marginTop: '12px' }}>
                          <textarea
                            rows={3}
                            placeholder="Provide your explanation, clarify details, or answer operations questions..."
                            value={replyMessage}
                            onChange={(e) => setReplyMessage(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              fontSize: '13px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              outline: 'none',
                              fontFamily: 'inherit',
                              resize: 'vertical',
                              boxSizing: 'border-box',
                              marginBottom: '10px'
                            }}
                          />

                          {/* File Attachment Controls */}
                          <input
                            type="file"
                            ref={replyFileInputRef}
                            onChange={handleReplyFileChange}
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            style={{ display: 'none' }}
                          />

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                            <button
                              type="button"
                              onClick={() => replyFileInputRef.current?.click()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#334155',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                              {replyAttachment ? 'Change File' : 'Attach Photo or Document'}
                            </button>

                            {replyAttachment && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '4px 10px',
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  color: '#0f172a'
                                }}
                              >
                                <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {replyAttachment.filename} ({(replyAttachment.size / (1024 * 1024)).toFixed(2)} MB)
                                </span>
                                <button
                                  type="button"
                                  onClick={handleRemoveReplyAttachment}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#b91c1c',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '0 2px'
                                  }}
                                  title="Remove attachment"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>

                          {replyError && (
                            <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', color: '#b91c1c', fontSize: '12px', marginBottom: '10px' }}>
                              {replyError}
                            </div>
                          )}

                          {replySuccess && (
                            <div style={{ padding: '8px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', color: '#047857', fontSize: '12px', marginBottom: '10px' }}>
                              {replySuccess}
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={isSubmittingReply}
                            onClick={() => handleSubmitReply(trackResult.ticket_code)}
                            style={{
                              width: '100%',
                              height: '38px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#0f172a',
                              color: '#ffffff',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: isSubmittingReply ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            {isSubmittingReply ? 'Submitting Response...' : 'Send Response to Operations'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Resolved Action Button */}
                  {trackResult.status === 'resolved' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTicket(null);
                        setCreatedTicket(null);
                        setActiveTab('raise');
                        fetchActiveTicket(senderEmail, senderPhone, role, currentAgent?.id || currentUser?.id);
                      }}
                      style={{
                        width: '100%',
                        height: '42px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#047857',
                        color: '#ffffff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#065f46'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#047857'; }}
                    >
                      Issue Resolved · Generate New Ticket →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info: 24/7 Helpline */}
        <div
          style={{
            padding: '12px 24px',
            background: '#fafafa',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
            flexShrink: 0
          }}
        >
          <span>Need immediate telephone assistance?</span>
          <span style={{ fontWeight: 600, color: '#047857' }}>
            1800-890-FIX (Toll-Free, 24/7)
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
