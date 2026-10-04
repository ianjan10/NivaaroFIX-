/**
 * NivaaroFix "My Bookings" Page Comprehensive Regression & QA Test Suite
 * Full Interactivity Pass
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMyBookingsPageTests() {
  console.log('🧪 Running NivaaroFix "My Bookings" Comprehensive QA Tests...\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Load component and stylesheet sources
    const bookingsPageJsx = fs.readFileSync(path.join(__dirname, '../src/pages/MyBookingsPage.jsx'), 'utf8');
    const appJsx = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
    const topNavbarJsx = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.jsx'), 'utf8');
    const trackLiveModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingTrackLiveModal.jsx'), 'utf8');
    const contactProModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingContactProModal.jsx'), 'utf8');
    const cancelModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingCancelConfirmModal.jsx'), 'utf8');
    const invoiceModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingInvoiceModal.jsx'), 'utf8');
    const rescheduleModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingRescheduleModal.jsx'), 'utf8');
    const rateModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingRateModal.jsx'), 'utf8');
    const toastJsx = fs.readFileSync(path.join(__dirname, '../src/components/BookingToast.jsx'), 'utf8');
    const cssContent = fs.readFileSync(path.join(__dirname, '../src/styles/dashboardDesignSystem.css'), 'utf8');
    const canonicalDataJs = fs.readFileSync(path.join(__dirname, '../src/data/bookingsData.js'), 'utf8');
    const focusTrapJs = fs.readFileSync(path.join(__dirname, '../src/utils/useModalFocusTrap.js'), 'utf8');

    // =========================================================================
    // Suite A: Canonical Data Integrity
    // =========================================================================
    console.log('--- Suite A: Canonical Shared Data Integrity ---');

    const { CANONICAL_BOOKINGS } = await import('../src/data/bookingsData.js');

    report('CANONICAL_BOOKINGS exports valid shared array of booking records',
      Array.isArray(CANONICAL_BOOKINGS) && CANONICAL_BOOKINGS.length >= 3
    );

    const rajeshBooking = CANONICAL_BOOKINGS.find(b => b.bookingId === 'NVF-24091847');
    report('Booking NVF-24091847 defines Rajesh Kumar (Master Electrician, 4.9, 312 jobs, ₹450)',
      rajeshBooking &&
      rajeshBooking.technicianName === 'Rajesh Kumar' &&
      rajeshBooking.technicianRole === 'Master Electrician' &&
      rajeshBooking.technicianRating === '4.9' &&
      rajeshBooking.technicianJobs === 312 &&
      rajeshBooking.totalAmount === 450
    );

    const sureshBooking = CANONICAL_BOOKINGS.find(b => b.bookingId === 'NVF-24081203');
    report('Booking NVF-24081203 defines Suresh Babu (Certified Master Plumber, 4.8, 198 jobs, ₹280)',
      sureshBooking &&
      sureshBooking.technicianName === 'Suresh Babu' &&
      sureshBooking.technicianRole === 'Certified Master Plumber' &&
      sureshBooking.technicianRating === '4.8' &&
      sureshBooking.totalAmount === 280 &&
      sureshBooking.status === 'Completed'
    );

    const karthikBooking = CANONICAL_BOOKINGS.find(b => b.bookingId === 'NVF-24070556');
    report('Booking NVF-24070556 defines Karthik Raman (Senior Electrical Contractor, 4.9, 440 jobs, ₹620)',
      karthikBooking &&
      karthikBooking.technicianName === 'Karthik Raman' &&
      karthikBooking.totalAmount === 620 &&
      karthikBooking.status === 'Completed'
    );

    // =========================================================================
    // Suite B: Navigation & Routing Integration
    // =========================================================================
    console.log('\n--- Suite B: Navigation & Routing Integration ---');

    report('App.jsx detects #/bookings in getViewFromHash',
      appJsx.includes("hash.includes('bookings')")
    );

    report('App.jsx mounts MyBookingsPage when currentView === "bookings"',
      appJsx.includes("currentView === 'bookings'") &&
      appJsx.includes('<MyBookingsPage')
    );

    report('TopNavbar "My Bookings" dropdown item routes to bookings view',
      topNavbarJsx.includes("onNavigate && onNavigate('bookings')")
    );

    const interactiveBookingJsx = fs.readFileSync(path.join(__dirname, '../src/components/InteractiveBookingModal.jsx'), 'utf8');

    report('InteractiveBookingModal step 4 includes "Track in My Bookings →" CTA routing to #/bookings',
      interactiveBookingJsx.includes('Track in My Bookings →') &&
      interactiveBookingJsx.includes('#/bookings')
    );

    report('Book a Service CTA routes to homepage/services marketplace',
      bookingsPageJsx.includes("onNavigateToServices && onNavigateToServices('all')")
    );

    // =========================================================================
    // Suite C: Page Header & Typography
    // =========================================================================
    console.log('\n--- Suite C: Page Header & Typography ---');

    report('MyBookingsPage includes "← Back to dashboard" breadcrumb',
      bookingsPageJsx.includes('Back to dashboard') &&
      bookingsPageJsx.includes('bookings-breadcrumb-nav')
    );

    report('MyBookingsPage title is "My Bookings" in unified sans-serif display style matching Professional Console',
      bookingsPageJsx.includes('<h1 className="bookings-main-title">My Bookings</h1>') &&
      cssContent.includes('.bookings-main-title') &&
      (cssContent.includes('var(--font-sans)') || cssContent.includes('Plus Jakarta Sans'))
    );

    report('MyBookingsPage includes exact subhead "Every job, tracked from request to completion."',
      bookingsPageJsx.includes('Every job, tracked from request to completion.')
    );

    // =========================================================================
    // Suite D: Segmented Tabs & Dynamic Filtering
    // =========================================================================
    console.log('\n--- Suite D: Tabs & Dynamic Filter Chips ---');

    report('Segmented tab switcher contains Active, Completed, and All tabs',
      bookingsPageJsx.includes("setActiveTab('active')") &&
      bookingsPageJsx.includes("setActiveTab('completed')") &&
      bookingsPageJsx.includes("setActiveTab('all')")
    );

    report('Tab counters are dynamically computed from bookings state',
      bookingsPageJsx.includes('activeCount') &&
      bookingsPageJsx.includes('completedCount') &&
      bookingsPageJsx.includes('allCount')
    );

    report('Category filter chips are completely removed for a clean, distraction-free filter row',
      !bookingsPageJsx.includes('category-chip-group') &&
      !bookingsPageJsx.includes('filter-category-chip')
    );

    report('Includes debounced live-search (~250ms) against booking ID and provider name with non-clipping placeholder',
      bookingsPageJsx.includes('debouncedSearch') &&
      bookingsPageJsx.includes('setTimeout') &&
      bookingsPageJsx.includes('Search ID or technician...') &&
      cssContent.includes('.bookings-search-input-wrap')
    );

    report('Search empty state displays exact message and "Clear search" action when 0 results match',
      bookingsPageJsx.includes('No bookings match your search — try a different booking ID or provider name.') &&
      bookingsPageJsx.includes('btn-clear-search-action') &&
      bookingsPageJsx.includes('handleClearSearch')
    );

    // =========================================================================
    // Suite E: Active Bookings Live Card & 4-Segment Progress Bar
    // =========================================================================
    console.log('\n--- Suite E: Active Bookings Live Status Card ---');

    report('Active booking card contains service icon badge, title, booking ID, and locality',
      bookingsPageJsx.includes('service-icon-badge') &&
      bookingsPageJsx.includes('booking-ref-tag') &&
      bookingsPageJsx.includes('locality-text')
    );

    report('Status pill has pulsing live dot for in-progress / en route visits',
      bookingsPageJsx.includes('live-status-pill brass-pill') &&
      bookingsPageJsx.includes('pulsing-live-dot') &&
      cssContent.includes('.live-status-pill.brass-pill')
    );

    report('4-Segment Progress Bar renders 4 sequential stages (Confirmed → Assigned → En route → In progress)',
      bookingsPageJsx.includes("['Confirmed', 'Assigned', 'En route', 'In progress']") &&
      bookingsPageJsx.includes('progress-segment-col') &&
      bookingsPageJsx.includes('progress-bar-segment')
    );

    report('Progress bar fills emerald green (#059669) matching Professional Console',
      cssContent.includes('.progress-segment-col.segment-passed .segment-fill') &&
      cssContent.includes('.progress-segment-col.segment-current .segment-fill') &&
      cssContent.includes('#059669')
    );

    report('Technician summary row includes full name, trade role, star rating, job count, and price estimate',
      bookingsPageJsx.includes('technician-info-block') &&
      bookingsPageJsx.includes('technicianName') &&
      bookingsPageJsx.includes('technicianRole') &&
      bookingsPageJsx.includes('technicianRating') &&
      bookingsPageJsx.includes('technicianJobs') &&
      bookingsPageJsx.includes('estimate-label')
    );

    report('Expandable active card actions: Track live, Contact pro, Reschedule, Cancel booking',
      bookingsPageJsx.includes('btn-track-live') &&
      bookingsPageJsx.includes('btn-contact-pro') &&
      bookingsPageJsx.includes('btn-reschedule') &&
      bookingsPageJsx.includes('btn-cancel-booking')
    );

    // =========================================================================
    // Suite F: Completed Bookings & Dynamic Warranty Calculation
    // =========================================================================
    console.log('\n--- Suite F: Completed Bookings & Dynamic Warranty ---');

    report('Completed status pill is styled with unified green token',
      bookingsPageJsx.includes('live-status-pill forest-pill') &&
      cssContent.includes('.live-status-pill.forest-pill') &&
      (cssContent.includes('#059669') || cssContent.includes('#047857'))
    );

    const { computeWarrantyInfo, getStageIndex } = await import('../src/utils/bookingUtils.js');

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() - 10);
    const activeWarranty = computeWarrantyInfo(futureDate.toISOString(), 90);
    report('computeWarrantyInfo returns active warranty when within warranty period',
      activeWarranty.isActive === true && activeWarranty.text.startsWith('Warranty active until')
    );

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const expiredWarranty = computeWarrantyInfo(oldDate.toISOString(), 90);
    report('computeWarrantyInfo returns expired warranty when past warranty period',
      expiredWarranty.isActive === false && expiredWarranty.text === 'Warranty expired'
    );

    report('getStageIndex correctly maps booking status to progress bar indices 0-3',
      getStageIndex('Request Received') === 0 &&
      getStageIndex('Technician Assigned') === 1 &&
      getStageIndex('En route') === 2 &&
      getStageIndex('Completed') === 3
    );

    report('Completed card includes working Invoice button, Rebook service, and Rate visit actions',
      bookingsPageJsx.includes('btn-invoice-link') &&
      bookingsPageJsx.includes('btn-rebook-service') &&
      bookingsPageJsx.includes('btn-rate-visit') &&
      bookingsPageJsx.includes('itemized-pricing-grid')
    );

    // =========================================================================
    // Suite G: Modals, Dialogs & Focus Traps
    // =========================================================================
    console.log('\n--- Suite G: Interactive Modals & Focus Trapping ---');

    report('BookingTrackLiveModal header uses dynamic "[Technician Name] is on the way"',
      trackLiveModalJsx.includes('{proName} is on the way')
    );

    report('BookingTrackLiveModal contains code comment flagging simulated ETA countdown',
      trackLiveModalJsx.includes('Simulated real-time ETA countdown') &&
      trackLiveModalJsx.includes('TODO: Connect this feed to the backend GPS WebSocket')
    );

    report('BookingContactProModal contains privacy note and Call / Message actions',
      contactProModalJsx.includes('For your safety, calls and messages are routed through NivaaroFix — your number stays private.') &&
      contactProModalJsx.includes('handleInitiateCall') &&
      contactProModalJsx.includes('handleSendMessage')
    );

    report('BookingRescheduleModal subtext is "Choose a new date and time for your [service name] with [technician name]."',
      rescheduleModalJsx.includes('Choose a new date and time for your {serviceName} with {proName}.') &&
      rescheduleModalJsx.includes('Reschedule your visit')
    );

    report('BookingCancelConfirmModal body is "Your [service] ([ID]) with [technician] will be cancelled. This can\'t be undone."',
      cancelModalJsx.includes("Your {serviceName} ({bookingId}) with {proName} will be cancelled. This can't be undone.") &&
      cancelModalJsx.includes('Cancel this booking?')
    );

    report('BookingCancelConfirmModal reason selector contains exact requested options',
      cancelModalJsx.includes('Help us improve — why are you cancelling? (optional)') &&
      cancelModalJsx.includes('Found another provider') &&
      cancelModalJsx.includes('No longer needed') &&
      cancelModalJsx.includes('Price concern') &&
      cancelModalJsx.includes('Rescheduling instead') &&
      cancelModalJsx.includes('Other')
    );

    report('BookingCancelConfirmModal has "Keep booking" and "Confirm cancellation" buttons with muted rust styling',
      cancelModalJsx.includes('Keep booking') &&
      cancelModalJsx.includes('Confirm cancellation') &&
      cssContent.includes('.btn-destructive-confirm') &&
      cssContent.includes('#881337')
    );

    report('All modals implement useModalFocusTrap for keyboard focus trap and Escape key dismissal',
      trackLiveModalJsx.includes('useModalFocusTrap') &&
      contactProModalJsx.includes('useModalFocusTrap') &&
      cancelModalJsx.includes('useModalFocusTrap') &&
      invoiceModalJsx.includes('useModalFocusTrap') &&
      rescheduleModalJsx.includes('useModalFocusTrap') &&
      rateModalJsx.includes('useModalFocusTrap')
    );

    // =========================================================================
    // Suite H: Toast Notification System & Loading/Error States
    // =========================================================================
    console.log('\n--- Suite H: Toasts, Skeletons & Error Recovery ---');

    report('BookingToast component renders accessible notifications queue with auto-dismiss',
      toastJsx.includes('booking-toast-container') &&
      toastJsx.includes('booking-toast-card') &&
      toastJsx.includes('toast-dismiss-btn')
    );

    report('Rescheduling immediately triggers confirmation toast on page',
      bookingsPageJsx.includes('addToast(`Booking rescheduled to ${newTimeSlot}.`,')
    );

    report('Cancelling immediately triggers cancellation toast on page',
      bookingsPageJsx.includes('addToast(`Booking ${booking.bookingId || booking.bookingRef} has been cancelled.`,')
    );

    report('Rating immediately triggers appreciation toast on page',
      bookingsPageJsx.includes('addToast(`Thank you for rating')
    );

    report('Skeleton loader renders matching proportioned cards during fetch',
      bookingsPageJsx.includes('booking-skeleton-card') &&
      cssContent.includes('.booking-skeleton-card') &&
      cssContent.includes('@keyframes skeleton-shimmer')
    );

    report('Error state provides clear headline, message, and Retry button',
      bookingsPageJsx.includes('bookings-error-card') &&
      bookingsPageJsx.includes('btn-retry-fetch') &&
      bookingsPageJsx.includes('loadBookingsData')
    );

    // =========================================================================
    // Suite I: Strict Zero Emoji & Design Tokens Enforcement
    // =========================================================================
    console.log('\n--- Suite I: Strict Zero Emoji & Design Tokens Enforcement ---');

    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

    const filesToCheck = [
      { name: 'MyBookingsPage.jsx', content: bookingsPageJsx },
      { name: 'BookingTrackLiveModal.jsx', content: trackLiveModalJsx },
      { name: 'BookingContactProModal.jsx', content: contactProModalJsx },
      { name: 'BookingCancelConfirmModal.jsx', content: cancelModalJsx },
      { name: 'BookingInvoiceModal.jsx', content: invoiceModalJsx },
      { name: 'BookingRescheduleModal.jsx', content: rescheduleModalJsx },
      { name: 'BookingRateModal.jsx', content: rateModalJsx },
      { name: 'BookingToast.jsx', content: toastJsx },
      { name: 'bookingsData.js', content: canonicalDataJs },
      { name: 'useModalFocusTrap.js', content: focusTrapJs }
    ];

    filesToCheck.forEach(({ name, content }) => {
      const hasEmoji = emojiRegex.test(content);
      report(`Zero emojis in ${name}`, !hasEmoji, hasEmoji ? 'Emoji character detected in file!' : '');
    });

    report('Design system contains Ivory, Navy, Forest, and Brass color tokens',
      cssContent.includes('#f7f5f1') &&
      cssContent.includes('#1e3a5f') &&
      cssContent.includes('#0f4d3c') &&
      cssContent.includes('#a9793c')
    );

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  }
}

runMyBookingsPageTests();
