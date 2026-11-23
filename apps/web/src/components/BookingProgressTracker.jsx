import React, { useState, useEffect, useMemo } from 'react';
import './BookingProgressTracker.css';

/**
 * Format timestamp in Asia/Kolkata (IST).
 * Returns empty string if missing/null (missing times show nothing).
 */
export function formatStepTimestamp(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';

    const timeStr = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const dateOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' };
    const stepDateStr = d.toLocaleDateString('en-IN', dateOptions);
    const nowDateStr = new Date().toLocaleDateString('en-IN', dateOptions);

    if (stepDateStr === nowDateStr) {
      return timeStr;
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yestDateStr = yesterday.toLocaleDateString('en-IN', dateOptions);
    if (stepDateStr === yestDateStr) {
      return `Y'day, ${timeStr}`;
    }

    const shortDay = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
    return `${shortDay}, ${timeStr}`;
  } catch {
    return '';
  }
}

/**
 * Map status string to sequential step index:
 * 0: Confirmed
 * 1: On the way
 * 2: Arrived
 * 3: In progress
 * 4: Completed
 */
export function getStepIndex(rawStatus) {
  if (!rawStatus) return -1;
  const s = String(rawStatus).toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'completed') return 4;
  if (['in progress', 'otp verified', 'started'].includes(s)) return 3;
  if (s === 'arrived') return 2;
  if (['on the way', 'en route'].includes(s)) return 1;
  if (['confirmed', 'accepted'].includes(s)) return 0;
  return -1;
}

const STEP_DEFINITIONS = [
  { key: 'confirmed', label: 'Confirmed', tsKey: 'confirmed_at', tsAltKey: 'confirmedAt' },
  { key: 'on_the_way', label: 'On the way', tsKey: 'on_the_way_at', tsAltKey: 'onTheWayAt' },
  { key: 'arrived', label: 'Arrived', tsKey: 'arrived_at', tsAltKey: 'arrivedAt' },
  { key: 'in_progress', label: 'In progress', tsKey: 'in_progress_at', tsAltKey: 'inProgressAt' },
  { key: 'completed', label: 'Completed', tsKey: 'completed_at', tsAltKey: 'completedAt' }
];

/**
 * BookingProgressTracker
 * Single shared, real-time booking progress tracker with exact server timestamps.
 * Minimalist design: neutral gray track, single accent brand green (#047857), no gradients, no emojis.
 * Responsive: container query >= 520px horizontal, < 520px vertical.
 * Accessible: WCAG contrast >= 4.5:1, aria-current="step", semantic list, prefers-reduced-motion.
 */
export default function BookingProgressTracker({
  job,
  status: statusProp,
  confirmed_at: confirmedAtProp,
  on_the_way_at: onTheWayAtProp,
  arrived_at: arrivedAtProp,
  in_progress_at: inProgressAtProp,
  completed_at: completedAtProp,
  className = ''
}) {
  // Resolve data either from job object or individual props
  const currentStatus = statusProp || job?.status || '';
  const currentStepIdx = useMemo(() => getStepIndex(currentStatus), [currentStatus]);

  // Extract timestamps
  const timestamps = useMemo(() => {
    return {
      confirmed: confirmedAtProp || job?.confirmed_at || job?.confirmedAt || (currentStepIdx >= 0 ? (job?.createdAt || job?.created_at || null) : null),
      on_the_way: onTheWayAtProp || job?.on_the_way_at || job?.onTheWayAt || null,
      arrived: arrivedAtProp || job?.arrived_at || job?.arrivedAt || null,
      in_progress: inProgressAtProp || job?.in_progress_at || job?.inProgressAt || job?.otp_verified_at || job?.otpVerifiedAt || job?.started_at || null,
      completed: completedAtProp || job?.completed_at || job?.completedAt || null
    };
  }, [
    confirmedAtProp, onTheWayAtProp, arrivedAtProp, inProgressAtProp, completedAtProp,
    currentStepIdx, job?.createdAt, job?.created_at,
    job?.confirmed_at, job?.confirmedAt, job?.on_the_way_at, job?.onTheWayAt,
    job?.arrived_at, job?.arrivedAt, job?.in_progress_at, job?.inProgressAt,
    job?.otp_verified_at, job?.otpVerifiedAt, job?.started_at, job?.completed_at, job?.completedAt
  ]);

  // Calculate track fill percentage (0% to 100%)
  const fillPercent = useMemo(() => {
    if (currentStepIdx <= 0) return 0;
    if (currentStepIdx >= 4) return 100;
    return (currentStepIdx / 4) * 100;
  }, [currentStepIdx]);

  return (
    <div
      className={`booking-progress-tracker-container ${className}`}
      data-testid="booking-progress-tracker"
    >
      <nav aria-label="Service delivery progress">
        <ol className="bpt-track-list" role="list">
          {/* Progress line background */}
          <div className="bpt-line-track" aria-hidden="true">
            <div
              className="bpt-line-fill"
              style={{ width: `${fillPercent}%`, height: `${fillPercent}%` }}
            />
          </div>

          {STEP_DEFINITIONS.map((step, idx) => {
            const isCompleted = currentStepIdx > idx;
            const isCurrent = currentStepIdx === idx;
            const isUpcoming = currentStepIdx < idx;
            const rawTime = timestamps[step.key];
            const formattedTime = formatStepTimestamp(rawTime);

            let stateClass = 'bpt-step-upcoming';
            if (isCompleted) stateClass = 'bpt-step-completed';
            else if (isCurrent) stateClass = 'bpt-step-current';

            return (
              <li
                key={step.key}
                className={`bpt-step-item ${stateClass}`}
                aria-current={isCurrent ? 'step' : undefined}
                tabIndex={0}
              >
                {/* Node Indicator Dot */}
                <div className="bpt-node-indicator" aria-hidden="true">
                  {isCompleted ? (
                    <svg
                      viewBox="0 0 16 16"
                      className="bpt-check-icon"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3.5 8.5 6.5 11.5 12.5 5" />
                    </svg>
                  ) : isCurrent ? (
                    <span className="bpt-current-dot" />
                  ) : (
                    <span className="bpt-upcoming-dot" />
                  )}
                </div>

                {/* Step Metadata (Label + Timestamp) */}
                <div className="bpt-step-content">
                  <span className="bpt-step-label">
                    {step.label}
                    {isCurrent && <span className="sr-only"> (Current Step)</span>}
                    {isCompleted && <span className="sr-only"> (Completed)</span>}
                  </span>
                  {formattedTime ? (
                    <time
                      className="bpt-step-time"
                      dateTime={rawTime ? new Date(rawTime).toISOString() : undefined}
                      title={rawTime ? new Date(rawTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : undefined}
                    >
                      {formattedTime}
                    </time>
                  ) : (
                    <span className="bpt-step-time bpt-empty-time" aria-hidden="true">
                      &nbsp;
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
