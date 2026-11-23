import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSilentRealtime, fastDeepEqual } from '../../hooks/useSilentRealtime';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return isoStr;
  }
}

function cleanPersonName(name = '') {
  if (!name) return '—';
  return name.replace(/\s*\((?:professional|customer)\)\s*/gi, '').trim() || name;
}

export default function AdminSupportPage({
  adminUser,
  csrfToken,
  onNavigate = () => {}
}) {
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'open' | 'in_progress' | 'resolved'
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'customer' | 'professional'
  const [searchQuery, setSearchQuery] = useState('');

  // Inspection Drawer / Modal State
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [adminNotesText, setAdminNotesText] = useState('');
  const [resolveStatus, setResolveStatus] = useState('resolved');
  const [resolveError, setResolveError] = useState('');
  const [resolveSuccess, setResolveSuccess] = useState('');

  // Request Information State
  const [isRequestingInfo, setIsRequestingInfo] = useState(false);
  const [requestInfoText, setRequestInfoText] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Fetch Tickets
  const fetchTickets = useCallback(async (isSilent = false) => {
    if (!isSilent && tickets.length === 0) {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (roleFilter !== 'all') params.set('sender_role', roleFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/admin/support/tickets?${params.toString()}`, {
        headers: {
          'Accept': 'application/json'
        },
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed to fetch support tickets');
      const data = await res.json();
      if (data.success) {
        setTickets((prev) => {
          if (fastDeepEqual(prev, data.tickets)) return prev;
          return data.tickets || [];
        });
        if (data.summary) {
          const newSum = {
            total: data.summary.total || 0,
            open: data.summary.open || 0,
            inProgress: data.summary.inProgress || 0,
            resolved: data.summary.resolved || 0
          };
          setSummary((prev) => (fastDeepEqual(prev, newSum) ? prev : newSum));
        }

        // In-place refresh of selected ticket if open
        if (selectedTicket) {
          const match = (data.tickets || []).find((t) => t.id === selectedTicket.id);
          if (match && !fastDeepEqual(selectedTicket, match)) {
            setSelectedTicket((prev) => ({ ...prev, ...match }));
          }
        }
      }
    } catch (err) {
      console.error('Error loading support tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, roleFilter, searchQuery, tickets.length, selectedTicket]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Real-time WebSocket + SSE + Silent Polling Synchronization
  useSilentRealtime({
    fetchFn: fetchTickets,
    pollInterval: 6000,
    wsEndpoint: '/ws/admin',
    sseEndpoint: '/admin/realtime/events',
    eventTypes: ['support.ticket_created', 'support.ticket_updated']
  });

  const handleOpenTicket = async (t) => {
    setSelectedTicket(t);
    setSolutionText(t.solution || '');
    setAdminNotesText(t.admin_notes || '');
    setResolveStatus('resolved');
    setResolveError('');
    setResolveSuccess('');
    setIsRequestingInfo(false);
    setRequestInfoText('');

    try {
      const res = await fetch(`/admin/support/tickets/${t.id}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.ticket) {
        setSelectedTicket(data.ticket);
        setSolutionText(data.ticket.solution || '');
        setAdminNotesText(data.ticket.admin_notes || '');
      }
    } catch (err) {
      console.warn('Could not load ticket detail timeline:', err);
    }
  };

  const handleCloseTicket = () => {
    setSelectedTicket(null);
    setResolveError('');
    setResolveSuccess('');
    setIsRequestingInfo(false);
    setRequestInfoText('');
  };

  const handleSendInfoRequest = async (e) => {
    e?.preventDefault();
    if (!selectedTicket || !requestInfoText.trim()) return;

    setIsSendingRequest(true);
    setResolveError('');
    setResolveSuccess('');

    try {
      const res = await fetch(`/admin/support/tickets/${selectedTicket.id}/request-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          message: requestInfoText.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send information request.');
      }

      setResolveSuccess('Information request successfully sent to complainant.');
      setRequestInfoText('');
      setIsRequestingInfo(false);
      setSelectedTicket(data.ticket);
      fetchTickets();
    } catch (err) {
      setResolveError(err.message || 'Failed to send request.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleSaveResolution = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (resolveStatus === 'resolved' && !solutionText.trim()) {
      setResolveError('Please provide a clear resolution solution description.');
      return;
    }

    setIsResolving(true);
    setResolveError('');
    setResolveSuccess('');

    try {
      const res = await fetch(`/admin/support/tickets/${selectedTicket.id}/resolve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          status: resolveStatus,
          solution: solutionText.trim(),
          admin_notes: adminNotesText.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update ticket.');
      }

      setResolveSuccess(data.message || 'Ticket updated successfully.');
      setSelectedTicket(data.ticket);
      // Refresh list
      fetchTickets();
    } catch (err) {
      setResolveError(err.message || 'Failed to update resolution.');
    } finally {
      setIsResolving(false);
    }
  };

  // Export to Excel (CSV with UTF-8 BOM for Microsoft Excel)
  const handleExportExcel = () => {
    if (!tickets || tickets.length === 0) return;
    const headers = [
      'Ticket ID',
      'Name',
      'Role',
      'Email',
      'Phone',
      'Category',
      'Subject',
      'Description',
      'Status',
      'Created Date & Time',
      'Resolved Date & Time',
      'Resolution Solution'
    ];

    const rows = tickets.map((t) => {
      const name = cleanPersonName(t.sender_name);
      return [
        `"${(t.ticket_code || '').replace(/"/g, '""')}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${t.sender_role === 'professional' ? 'Professional' : 'Customer'}"`,
        `"${(t.sender_email || '').replace(/"/g, '""')}"`,
        `"${(t.sender_phone || '').replace(/"/g, '""')}"`,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        `"${(t.subject || '').replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
        `"${(t.status || 'open')}"`,
        `"${formatDate(t.created_at)}"`,
        `"${t.resolved_at ? formatDate(t.resolved_at) : ''}"`,
        `"${(t.solution || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nivaarofix-support-tickets-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF (Print-Friendly Report)
  const handleExportPDF = () => {
    if (!tickets || tickets.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = tickets
      .map((t) => {
        const name = cleanPersonName(t.sender_name);
        return `
        <tr>
          <td style="padding: 10px 12px; font-family: monospace; font-weight: bold; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${t.ticket_code}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
            <div style="font-weight: 600; color: #0f172a;">${name}</div>
            <div style="font-size: 11px; color: #64748b; text-transform: capitalize;">${t.sender_role === 'professional' ? 'Professional' : 'Customer'}</div>
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
            <div style="font-weight: 500; color: #0f172a;">${t.subject}</div>
            <div style="font-size: 11px; color: #64748b;">${t.category} · ${t.sender_email}</div>
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; white-space: nowrap; color: #475569;">${formatDate(t.created_at)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: ${t.status === 'resolved' ? '#047857' : (t.status === 'in_progress' ? '#1d4ed8' : '#b45309')};">
            ${t.status === 'resolved' ? 'Resolved' : (t.status === 'in_progress' ? 'In Progress' : 'Under Review')}
          </td>
        </tr>
      `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>NivaaroFix — Support Tickets Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #0f172a; margin: 0; }
            h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
            p { margin: 0; font-size: 13px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; margin-top: 16px; }
            th { background: #f8fafc; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #334155; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
            @media print {
              body { padding: 0; }
              @page { margin: 12mm; }
            }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;">
            <div>
              <h1>NivaaroFix — Support Tickets Ledger</h1>
              <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
            </div>
            <div style="text-align: right; font-size: 13px; color: #0f172a; font-weight: 600;">
              Total Records: ${tickets.length}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Name</th>
                <th>Complainant Details</th>
                <th>Date & Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="admin-page-container" style={{ padding: '0 0 48px 0', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* 1. Header (No breadcrumbs, shifted cleanly to top) */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Support Tickets & Resolution Desk
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Review and resolve customer and service professional support requests.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchTickets}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '8px',
              border: '1px solid rgba(16, 32, 26, 0.12)',
              background: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh Feed
          </button>
        </div>
      </div>

      {/* 2. Key Facts / Summary Strip (4 Equal Clean Metric Cards) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid rgba(16, 32, 26, 0.10)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          marginBottom: '20px',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(16, 32, 26, 0.08)' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Tickets
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
            {summary.total}
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(16, 32, 26, 0.08)' }}>
          <div style={{ fontSize: '12px', color: '#b45309', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Open / Needs Review
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>
            {summary.open}
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(16, 32, 26, 0.08)' }}>
          <div style={{ fontSize: '12px', color: '#1d4ed8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            In Progress
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>
            {summary.inProgress}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#047857', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Resolved
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: '#047857', fontVariantNumeric: 'tabular-nums' }}>
            {summary.resolved}
          </div>
        </div>
      </div>

      {/* 3. Search, Filters, and Export Toolbar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid rgba(16, 32, 26, 0.10)',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px'
        }}
      >
        {/* Left: Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'open', label: `Open (${summary.open})` },
            { id: 'in_progress', label: `In Progress (${summary.inProgress})` },
            { id: 'resolved', label: `Resolved (${summary.resolved})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: statusFilter === tab.id ? 600 : 500,
                borderRadius: '8px',
                border: '1px solid',
                borderColor: statusFilter === tab.id ? '#0f172a' : 'rgba(16, 32, 26, 0.10)',
                background: statusFilter === tab.id ? '#0f172a' : '#ffffff',
                color: statusFilter === tab.id ? '#ffffff' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Role Filter, Search, and Export Options */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              height: '36px',
              padding: '0 12px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid rgba(16, 32, 26, 0.12)',
              background: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="professional">Professionals</option>
          </select>

          <div style={{ position: 'relative', width: '240px' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search code, name, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: '36px',
                paddingLeft: '32px',
                paddingRight: '12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid rgba(16, 32, 26, 0.12)',
                outline: 'none'
              }}
            />
          </div>

          {/* Export to Excel Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            title="Export filtered tickets to Microsoft Excel / CSV"
            style={{
              height: '36px',
              padding: '0 12px',
              fontSize: '12.5px',
              fontWeight: 500,
              borderRadius: '8px',
              border: '1px solid rgba(16, 32, 26, 0.14)',
              background: '#ffffff',
              color: '#047857',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Excel
          </button>

          {/* Export to PDF Button */}
          <button
            type="button"
            onClick={handleExportPDF}
            title="Generate print-ready PDF report of support tickets"
            style={{
              height: '36px',
              padding: '0 12px',
              fontSize: '12.5px',
              fontWeight: 500,
              borderRadius: '8px',
              border: '1px solid rgba(16, 32, 26, 0.14)',
              background: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* 4. Tickets Table (First-Come, First-Served Layout) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid rgba(16, 32, 26, 0.10)',
          overflow: 'hidden'
        }}
      >
        {isLoading && tickets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            Loading support tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
              No support tickets found
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              There are no tickets matching your current filter criteria.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid rgba(16, 32, 26, 0.08)' }}>
                  <th style={{ padding: '12px 16px 12px 20px', fontWeight: 600, color: '#475569', width: '120px', whiteSpace: 'nowrap' }}>Ticket ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', width: '140px', whiteSpace: 'nowrap' }}>Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Complainant</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', width: '150px', whiteSpace: 'nowrap' }}>Date & Time</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', width: '120px', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'center', width: '160px', whiteSpace: 'nowrap' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const isResolved = t.status === 'resolved';
                  const isInProgress = t.status === 'in_progress';
                  const cleanName = cleanPersonName(t.sender_name);

                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid rgba(16, 32, 26, 0.06)',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {/* 1. Ticket ID ONLY (No date underneath) */}
                      <td style={{ padding: '14px 16px 14px 20px', width: '120px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>
                          {t.ticket_code}
                        </span>
                      </td>

                      {/* 2. Name: Clean Name of Professional / User, with Role in small below */}
                      <td style={{ padding: '14px 16px', width: '140px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{cleanName}</div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            marginTop: '2px',
                            color: '#2563eb'
                          }}
                        >
                          {t.sender_role === 'professional' ? 'Professional' : 'Customer'}
                        </div>
                      </td>

                      {/* 3. Complainant Section: Problem details + contact info */}
                      <td style={{ padding: '14px 16px', minWidth: '220px', maxWidth: '320px' }}>
                        <div
                          style={{
                            fontWeight: 500,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '320px'
                          }}
                          title={t.subject}
                        >
                          {t.subject}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#64748b',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '320px'
                          }}
                          title={`${t.category} · ${t.sender_email}${t.sender_phone ? ` · ${t.sender_phone}` : ''}`}
                        >
                          {t.category} · {t.sender_email} {t.sender_phone ? `· ${t.sender_phone}` : ''}
                          {t.attachment_path && (
                            <span style={{ marginLeft: '6px', color: '#047857', fontWeight: 500 }}>
                              📎 Proof
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Dedicated Date & Time Column (IST) */}
                      <td style={{ padding: '14px 16px', width: '150px', whiteSpace: 'nowrap', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDate(t.created_at)}
                      </td>

                      {/* 5. Status Badge */}
                      <td style={{ padding: '14px 16px', width: '120px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: isResolved ? '#047857' : (isInProgress ? '#1d4ed8' : '#b45309')
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isResolved ? '#10b981' : (isInProgress ? '#3b82f6' : '#f59e0b')
                            }}
                          />
                          {isResolved ? 'Resolved' : (isInProgress ? 'In Progress' : 'Under Review')}
                        </span>
                      </td>

                      {/* 6. Action Button (Centered) */}
                      <td style={{ padding: '14px 16px', width: '160px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenTicket(t)}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 32, 26, 0.12)',
                            background: '#ffffff',
                            color: '#0f172a',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                        >
                          {isResolved ? 'View Record' : 'Inspect & Resolve'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Inspection & Resolution Drawer */}
      {selectedTicket && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseTicket();
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid rgba(0, 0, 0, 0.10)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(16, 32, 26, 0.08)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    {selectedTicket.ticket_code}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 600,
                      background: selectedTicket.status === 'resolved' ? '#ecfdf5' : '#fffbeb',
                      color: selectedTicket.status === 'resolved' ? '#047857' : '#b45309'
                    }}
                  >
                    {selectedTicket.status === 'resolved' ? 'Resolved' : 'Needs Resolution'}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>
                  {selectedTicket.subject}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleCloseTicket}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Complainant Metadata Grid */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  fontSize: '13px'
                }}
              >
                <div>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Complainant Name:</span>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {cleanPersonName(selectedTicket.sender_name)}
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400, marginLeft: '6px' }}>
                      ({selectedTicket.sender_role === 'professional' ? 'Professional' : 'Customer'})
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Contact Information:</span>
                  <div style={{ fontWeight: 500, color: '#0f172a' }}>
                    {selectedTicket.sender_email} {selectedTicket.sender_phone ? `· ${selectedTicket.sender_phone}` : ''}
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Category:</span>
                  <div style={{ fontWeight: 500, color: '#0f172a' }}>{selectedTicket.category}</div>
                </div>

                <div>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Submitted On:</span>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {formatDate(selectedTicket.created_at)}
                  </div>
                </div>
              </div>

              {/* Problem Description Statement */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Reported Problem Description
                </label>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    fontSize: '13px',
                    lineHeight: '20px',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {selectedTicket.description}
                </div>
              </div>

              {/* Attachment if present */}
              {selectedTicket.attachment_path && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                    Attached Proof / Photo
                  </label>
                  <div
                    style={{
                      padding: '12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px'
                    }}
                  >
                    {selectedTicket.attachment_mime?.includes('image') ? (
                      <a
                        href={selectedTicket.attachment_path}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'block' }}
                      >
                        <img
                          src={selectedTicket.attachment_path}
                          alt="Proof preview"
                          style={{
                            width: '100px',
                            height: '100px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1'
                          }}
                        />
                      </a>
                    ) : (
                      <div style={{ padding: '16px', background: '#e2e8f0', borderRadius: '6px', fontWeight: 600 }}>
                        PDF DOCUMENT
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px', color: '#0f172a' }}>
                        {selectedTicket.attachment_name || 'Proof Attachment'}
                      </div>
                      <a
                        href={selectedTicket.attachment_path}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-block',
                          marginTop: '6px',
                          fontSize: '12px',
                          color: '#047857',
                          fontWeight: 600,
                          textDecoration: 'none'
                        }}
                      >
                        View Full Attachment ↗
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline & Updates History */}
              {selectedTicket.timeline && selectedTicket.timeline.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                    Investigation Timeline & Updates ({selectedTicket.timeline.length})
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedTicket.timeline.map((item, idx) => {
                      const isReply = item.update_type === 'user_reply';
                      const isInfoReq = item.update_type === 'info_request';
                      const isResolution = item.update_type === 'resolution';

                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: isReply ? '#f0fdf4' : (isInfoReq ? '#fffbeb' : (isResolution ? '#ecfdf5' : '#f8fafc')),
                            border: `1px solid ${isReply ? '#bbf7d0' : (isInfoReq ? '#fde68a' : (isResolution ? '#a7f3d0' : '#e2e8f0'))}`,
                            fontSize: '13px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: '12px',
                              color: isReply ? '#15803d' : (isInfoReq ? '#b45309' : (isResolution ? '#047857' : '#0f172a'))
                            }}>
                              {isInfoReq ? `Admin Requested Information (${item.sender_name || 'Support'})` : (
                                isReply ? `Complainant Provided Details (${item.sender_name || 'User'})` : (
                                  isResolution ? 'Official Resolution' : 'Update'
                                )
                              )}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              {formatDate(item.created_at)}
                            </span>
                          </div>

                          <div style={{ color: '#1e293b', lineHeight: '19px', whiteSpace: 'pre-wrap' }}>
                            {item.message}
                          </div>

                          {/* Complainant Attached Photo Preview */}
                          {item.attachment_path && (
                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              {item.attachment_mime?.includes('image') ? (
                                <a href={item.attachment_path} target="_blank" rel="noreferrer">
                                  <img
                                    src={item.attachment_path}
                                    alt="Attached proof"
                                    style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                  />
                                </a>
                              ) : (
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>📄 Document</div>
                              )}
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 500, color: '#0f172a' }}>
                                  {item.attachment_name || 'Complainant Proof'}
                                </div>
                                <a
                                  href={item.attachment_path}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontSize: '12px', color: '#047857', fontWeight: 600, textDecoration: 'none' }}
                                >
                                  View Full File ↗
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Request More Information / Photo Button & Form */}
              {selectedTicket.status !== 'resolved' && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isRequestingInfo ? '10px' : 0 }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        Need More Information or Photos?
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Ask complainant for specific photo evidence or additional details.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRequestingInfo(!isRequestingInfo)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        borderRadius: '6px',
                        border: '1px solid rgba(16, 32, 26, 0.15)',
                        background: '#ffffff',
                        color: isRequestingInfo ? '#b91c1c' : '#0f172a',
                        cursor: 'pointer'
                      }}
                    >
                      {isRequestingInfo ? 'Cancel' : 'Request Info / Photo'}
                    </button>
                  </div>

                  {isRequestingInfo && (
                    <form onSubmit={handleSendInfoRequest} style={{ marginTop: '10px' }}>
                      <textarea
                        rows={3}
                        required
                        value={requestInfoText}
                        onChange={(e) => setRequestInfoText(e.target.value)}
                        placeholder="e.g. Please upload a clear photo of the water pipe joint or explain what time the technician arrived..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          lineHeight: '19px',
                          outline: 'none',
                          fontFamily: 'inherit',
                          background: '#ffffff',
                          marginBottom: '10px'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setIsRequestingInfo(false)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSendingRequest || !requestInfoText.trim()}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            background: '#0f172a',
                            color: '#ffffff',
                            cursor: isSendingRequest ? 'not-allowed' : 'pointer',
                            opacity: isSendingRequest ? 0.75 : 1
                          }}
                        >
                          {isSendingRequest ? 'Sending...' : 'Send Request to Complainant'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Already Resolved Record Banner */}
              {selectedTicket.status === 'resolved' && (
                <div
                  style={{
                    padding: '16px',
                    background: '#ecfdf5',
                    borderRadius: '10px',
                    border: '1px solid rgba(4, 120, 87, 0.25)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <strong style={{ fontSize: '13px', color: '#047857' }}>
                      Problem Resolved by {selectedTicket.resolved_by || 'Admin'} on {formatDate(selectedTicket.resolved_at)}
                    </strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#064e3b', lineHeight: '20px', whiteSpace: 'pre-wrap' }}>
                    {selectedTicket.solution}
                  </div>
                </div>
              )}

              {/* Resolution Form */}
              <form onSubmit={handleSaveResolution} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                  {selectedTicket.status === 'resolved' ? 'Update Official Solution' : 'Record Problem Resolution & Solution'}
                </h4>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
                    Solution & Action Plan (Visible to Complainant) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={solutionText}
                    onChange={(e) => setSolutionText(e.target.value)}
                    placeholder="Specify the exact investigation outcome, refund issued, technician reassigned, or technical fix applied..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      lineHeight: '19px',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#334155', marginBottom: '6px' }}>
                    Internal Admin Investigation Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={adminNotesText}
                    onChange={(e) => setAdminNotesText(e.target.value)}
                    placeholder="Internal reference notes, verified logs, or compliance checks..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="resolveStatus"
                      value="resolved"
                      checked={resolveStatus === 'resolved'}
                      onChange={() => setResolveStatus('resolved')}
                    />
                    <span style={{ fontWeight: 500 }}>Mark as Resolved</span>
                  </label>

                  <label style={{ fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="resolveStatus"
                      value="in_progress"
                      checked={resolveStatus === 'in_progress'}
                      onChange={() => setResolveStatus('in_progress')}
                    />
                    <span style={{ fontWeight: 500 }}>Mark as In Progress</span>
                  </label>
                </div>

                {resolveError && (
                  <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#b91c1c', fontSize: '12px', marginBottom: '16px' }}>
                    {resolveError}
                  </div>
                )}

                {resolveSuccess && (
                  <div style={{ padding: '10px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', fontSize: '12px', marginBottom: '16px' }}>
                    {resolveSuccess}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isResolving}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#047857',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isResolving ? 'not-allowed' : 'pointer',
                      opacity: isResolving ? 0.75 : 1
                    }}
                  >
                    {isResolving ? 'Saving Resolution...' : 'Confirm & Save Solution'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
