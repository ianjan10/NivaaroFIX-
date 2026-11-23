import React, { useState } from 'react';

const CATEGORIES = [
  { id: 'no_show', label: 'No show' },
  { id: 'late_arrival', label: 'Late arrival' },
  { id: 'poor_workmanship', label: 'Poor workmanship' },
  { id: 'overcharge', label: 'Overcharge' },
  { id: 'behavior', label: 'Unprofessional behavior' },
  { id: 'payment_issue', label: 'Payment issue' },
  { id: 'safety', label: 'Safety concern' },
  { id: 'other', label: 'Other issue' }
];

export default function ReportProblemModal({
  isOpen,
  onClose,
  booking,
  complainantRole = 'customer',
  onSubmitted
}) {
  const [category, setCategory] = useState('poor_workmanship');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successCode, setSuccessCode] = useState(null);

  if (!isOpen) return null;

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) {
      setError('You can attach a maximum of 3 photos.');
      return;
    }
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotos(prev => [...prev.slice(0, 2), event.target.result]);
      };
      reader.readAsDataURL(f);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please provide a description of the issue.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('http://localhost:5000/api/complaints/intake/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking?.id || booking?.requestId,
          bookingRef: booking?.numericBookingCode || booking?.booking_ref || booking?.service_request_code,
          complainantRole,
          complainantName: booking?.customer_name || booking?.userName || booking?.technician_name,
          complainantPhone: booking?.customer_phone || booking?.userPhone,
          category,
          description: description.trim(),
          photos
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit report.');
      }

      setSuccessCode(data.complaintCode);
      if (onSubmitted) {
        onSubmitted({
          complaintCode: data.complaintCode,
          complaintId: data.complaintId,
          status: 'under_review',
          category
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setDescription('');
    setPhotos([]);
    setError('');
    setSuccessCode(null);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={handleResetAndClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#111827' }}>
              Report a problem
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
              Service: {booking?.service_title || booking?.serviceTitle || 'Home Service'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Success View */}
        {successCode ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', color: '#047857', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>
              Report received
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: '#4b5563', lineHeight: 1.5 }}>
              Ticket <strong>#{successCode}</strong> has been logged. Our operations team reviews all issues within 24 hours.
            </p>
            <span style={{ display: 'inline-block', padding: '6px 12px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, marginBottom: '24px' }}>
              Status: Under review
            </span>
            <div>
              <button
                type="button"
                onClick={handleResetAndClose}
                style={{
                  width: '100%',
                  height: '44px',
                  background: '#047857',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
            {error && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#b91c1c', fontSize: '0.84rem', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            {/* Category */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.88rem',
                  color: '#111827',
                  backgroundColor: '#ffffff'
                }}
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Description of the issue
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened with as much detail as possible..."
                maxLength={1000}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.88rem',
                  color: '#111827',
                  fontFamily: 'inherit',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>
                {description.length} / 1000
              </div>
            </div>

            {/* Attachments (up to 3 photos) */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Attach photos (up to 3)
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {photos.map((src, i) => (
                  <div key={i} style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', position: 'relative', border: '1px solid #e5e7eb' }}>
                    <img src={src} alt="proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '8px',
                    border: '1px dashed #d1d5db',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    color: '#6b7280'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={handleResetAndClose}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: '10px',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: '10px',
                  background: '#047857',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

