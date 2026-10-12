import React, { useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

const MONTHS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

export default function DateOfBirthSelector({ day, month, year, value, onChange, onComplete, required = false }) {
  const { t } = useLanguage();
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  // Normalize selected day, month, year from either value object or direct props
  const currentDay = value?.day !== undefined ? (value.day || '') : (day || '');
  const currentMonth = value?.month !== undefined ? (value.month || '') : (month || '');
  const currentYear = value?.year !== undefined ? (value.year || '') : (year || '');

  // Generate days 1-31
  const days = Array.from({ length: 31 }, (_, i) => {
    return String(i + 1).padStart(2, '0');
  });

  // Generate years from current year down to 1920 (no future years)
  const currentYearNum = new Date().getFullYear();
  const years = Array.from({ length: currentYearNum - 1920 + 1 }, (_, i) => {
    return String(currentYearNum - i);
  });

  const handleDayChange = (e) => {
    const newDay = e.target.value;
    const updated = { day: newDay, month: currentMonth, year: currentYear };
    if (onChange) onChange(updated);
    if (newDay && monthRef.current) {
      monthRef.current.focus();
    }
  };

  const handleMonthChange = (e) => {
    const newMonth = e.target.value;
    const updated = { day: currentDay, month: newMonth, year: currentYear };
    if (onChange) onChange(updated);
    if (newMonth && yearRef.current) {
      yearRef.current.focus();
    }
  };

  const handleYearChange = (e) => {
    const newYear = e.target.value;
    const updated = { day: currentDay, month: currentMonth, year: newYear };
    if (onChange) onChange(updated);
    if (currentDay && currentMonth && newYear && onComplete) {
      onComplete(updated);
    }
  };

  return (
    <div className="dob-unified-card">
      {/* Day Select */}
      <div className="dob-select-segment">
        <select
          className="dob-select-pill"
          value={currentDay}
          onChange={handleDayChange}
          required={required}
        >
          <option value="">{t.dobDay || 'Day'}</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <svg className="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </div>

      <div className="dob-segment-divider" />

      {/* Month Select */}
      <div className="dob-select-segment">
        <select
          ref={monthRef}
          className="dob-select-pill"
          value={currentMonth}
          onChange={handleMonthChange}
          required={required}
        >
          <option value="">{t.dobMonth || 'Month'}</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <svg className="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </div>

      <div className="dob-segment-divider" />

      {/* Year Select */}
      <div className="dob-select-segment">
        <select
          ref={yearRef}
          className="dob-select-pill"
          value={currentYear}
          onChange={handleYearChange}
          required={required}
        >
          <option value="">{t.dobYear || 'Year'}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <svg className="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </div>
    </div>
  );
}
