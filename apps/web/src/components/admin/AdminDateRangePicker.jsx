import React, { useState, useEffect, useRef } from 'react';

/**
 * Custom Minimalist Interactive Date Range Picker for NivaaroFix Admin
 * - Beautiful, bespoke custom calendar replacing raw OS native date inputs
 * - Two-click range selection with smooth hover wash
 * - Quick presets, month switcher, keyboard Escape & click-outside dismissal
 * - 100% compliant with NivaaroFix design system (Fraunces/Plus Jakarta Sans, Ink #14181f, Forest #0f4d3c)
 */

function formatDateStr(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminDateRangePicker({
  startDate = '',
  endDate = '',
  onApply = () => {},
  isOpen = false,
  onToggle = () => {},
  onClose = () => {}
}) {
  const [rangeStart, setRangeStart] = useState(startDate);
  const [rangeEnd, setRangeEnd] = useState(endDate);
  const [hoverDate, setHoverDate] = useState(null);

  // Active month in calendar view
  const [viewDate, setViewDate] = useState(() => {
    if (startDate) {
      const [y, m] = startDate.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // Sync props when opened
  useEffect(() => {
    if (isOpen) {
      setRangeStart(startDate);
      setRangeEnd(endDate);
      if (startDate) {
        const [y, m] = startDate.split('-').map(Number);
        setViewDate(new Date(y, m - 1, 1));
      }
    }
  }, [isOpen, startDate, endDate]);

  // Handle click outside & Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !triggerRef.current?.contains(e.target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleDateClick = (dateStr) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      // Start fresh selection
      setRangeStart(dateStr);
      setRangeEnd('');
    } else {
      // Complete selection
      if (dateStr < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(dateStr);
      } else {
        setRangeEnd(dateStr);
      }
    }
  };

  const handleApply = (e) => {
    e.stopPropagation();
    if (rangeStart && rangeEnd) {
      onApply(rangeStart, rangeEnd);
    } else if (rangeStart) {
      onApply(rangeStart, rangeStart);
    }
    onClose();
  };

  const handleReset = (e) => {
    e.stopPropagation();
    setRangeStart('');
    setRangeEnd('');
    setHoverDate(null);
  };

  const setPreset = (days) => {
    const today = new Date();
    const endStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    const past = new Date(today);
    past.setDate(past.getDate() - (days - 1));
    const startStr = formatDateStr(past.getFullYear(), past.getMonth(), past.getDate());
    setRangeStart(startStr);
    setRangeEnd(endStr);
    setViewDate(new Date(past.getFullYear(), past.getMonth(), 1));
  };

  // Calendar matrix calculations (Monday as 0)
  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Compute active preview range
  const activeEffectiveEnd = rangeEnd || (rangeStart && hoverDate && hoverDate >= rangeStart ? hoverDate : '');

  const triggerLabel = rangeStart && rangeEnd
    ? `${formatDisplayDate(rangeStart)} → ${formatDisplayDate(rangeEnd)}`
    : rangeStart
    ? `${formatDisplayDate(rangeStart)} → Select end`
    : 'Select custom range';

  return (
    <div className="admin-datepicker-wrapper">
      {/* Sleek Minimalist Capsule Trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={`admin-minimal-date-capsule ${isOpen ? 'open' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label="Custom date range picker"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="admin-minimal-date-icon"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>

        <span className="admin-minimal-date-text">{triggerLabel}</span>

        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 140ms ease',
            color: 'var(--admin-muted)'
          }}
          aria-hidden="true"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" />
        </svg>
      </button>

      {/* Custom Interactive Minimalist Popover */}
      {isOpen && (
        <div ref={popoverRef} className="admin-calendar-popover" role="dialog" aria-label="Interactive calendar">
          {/* Quick presets pill bar */}
          <div className="admin-calendar-presets">
            <button type="button" onClick={() => setPreset(7)} className="admin-calendar-preset-btn">
              Last 7d
            </button>
            <button type="button" onClick={() => setPreset(14)} className="admin-calendar-preset-btn">
              Last 14d
            </button>
            <button type="button" onClick={() => setPreset(30)} className="admin-calendar-preset-btn">
              Last 30d
            </button>
            <button type="button" onClick={() => setPreset(90)} className="admin-calendar-preset-btn">
              Last 90d
            </button>
          </div>

          {/* Month Header with navigation */}
          <div className="admin-calendar-header">
            <button
              type="button"
              className="admin-cal-nav-btn"
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="admin-cal-month-title">{monthName}</span>
            <button
              type="button"
              className="admin-cal-nav-btn"
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Day Names Row */}
          <div className="admin-cal-weekdays">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} className="admin-cal-weekday">
                {d}
              </span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="admin-cal-grid" onMouseLeave={() => setHoverDate(null)}>
            {/* Previous month padding days */}
            {Array.from({ length: firstDayIndex }).map((_, i) => {
              const dayNum = daysInPrevMonth - firstDayIndex + i + 1;
              return (
                <div key={`prev-${i}`} className="admin-cal-cell outside-month">
                  <span>{dayNum}</span>
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = formatDateStr(viewYear, viewMonth, dayNum);

              const isStart = rangeStart === dateStr;
              const isEnd = activeEffectiveEnd === dateStr;
              const isInRange =
                rangeStart && activeEffectiveEnd && dateStr > rangeStart && dateStr < activeEffectiveEnd;

              const cellClasses = [
                'admin-cal-cell',
                isStart ? 'is-start' : '',
                isEnd ? 'is-end' : '',
                isInRange ? 'in-range' : ''
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={dateStr}
                  className={cellClasses}
                  onClick={() => handleDateClick(dateStr)}
                  onMouseEnter={() => {
                    if (rangeStart && !rangeEnd) {
                      setHoverDate(dateStr);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleDateClick(dateStr);
                    }
                  }}
                >
                  <span className="admin-cal-day-num">{dayNum}</span>
                </div>
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="admin-cal-footer">
            <button
              type="button"
              className="admin-cal-reset-btn"
              onClick={handleReset}
            >
              Reset
            </button>

            <div className="admin-cal-actions-right">
              <button
                type="button"
                className="admin-cal-apply-btn"
                disabled={!rangeStart}
                onClick={handleApply}
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

