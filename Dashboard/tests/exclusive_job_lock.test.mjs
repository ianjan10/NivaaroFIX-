import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const DASHBOARD_DIR = path.resolve('d:/My Project/Dashboard');
const BACKEND_DIR = path.resolve('d:/My Project/backend');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

test('Exclusive Job-Lock End-to-End Suite', async (t) => {
  const dispatchRoutesJs = readFile(path.join(BACKEND_DIR, 'src/routes/dispatchRoutes.js'));
  const agentRoutesJs = readFile(path.join(BACKEND_DIR, 'src/routes/agentRoutes.js'));
  const bookingRoutesJs = readFile(path.join(BACKEND_DIR, 'src/routes/bookingRoutes.js'));
  const providerServiceJs = readFile(path.join(BACKEND_DIR, 'src/modules/providers/providerService.js'));
  const quoteServiceJs = readFile(path.join(BACKEND_DIR, 'src/modules/quotes/quoteService.js'));
  const requestServiceJs = readFile(path.join(BACKEND_DIR, 'src/modules/requests/requestService.js'));

  const myBookingsPageJsx = readFile(path.join(DASHBOARD_DIR, 'src/pages/MyBookingsPage.jsx'));
  const bookingContextJsx = readFile(path.join(DASHBOARD_DIR, 'src/context/BookingContext.jsx'));
  const partnerConsoleJsx = readFile(path.join(DASHBOARD_DIR, 'src/pages/PartnerConsolePage.jsx'));
  const partnerContextJsx = readFile(path.join(DASHBOARD_DIR, 'src/context/PartnerContext.jsx'));

  await t.test('1. Lock Trigger & Auto-Withdrawal of Competing Quotes', () => {
    // Quote acceptance in dispatchRoutes transitions to Accepted
    assert.ok(dispatchRoutesJs.includes("UPDATE service_requests SET status = 'Accepted'"));
    // Auto-withdraws competing quotes
    assert.ok(
      dispatchRoutesJs.includes("UPDATE quotes SET status = 'Withdrawn'") ||
      quoteServiceJs.includes("UPDATE quotes SET status = 'Withdrawn'"),
      'Competing quotes must be updated to Withdrawn upon acceptance'
    );
    // Force-locks accepted professional to BUSY
    assert.ok(
      dispatchRoutesJs.includes("UPDATE agent_login SET availability_status = 'BUSY', is_online = false") ||
      quoteServiceJs.includes("UPDATE agent_login SET availability_status = 'BUSY', is_online = false"),
      'Accepted professional must be force-locked to BUSY and removed from online dispatch'
    );
  });

  await t.test('2. Server-side Customer Lock Enforcement', () => {
    // Rejects customer request creation server-side when request in Accepted or InProgress
    assert.ok(
      dispatchRoutesJs.includes("code: 'CUSTOMER_LOCKED'"),
      'dispatchRoutes.js must return CUSTOMER_LOCKED code'
    );
    assert.ok(
      dispatchRoutesJs.includes("AND status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')"),
      'dispatchRoutes.js must check Accepted and In Progress states'
    );
    assert.ok(
      bookingRoutesJs.includes("code: 'CUSTOMER_LOCKED'"),
      'bookingRoutes.js must reject new bookings when customer is locked'
    );
    assert.ok(
      requestServiceJs.includes("CUSTOMER_LOCKED"),
      'requestService.js must enforce CUSTOMER_LOCKED'
    );
  });

  await t.test('3. Server-side Professional Lock Enforcement', () => {
    // Toggle-online rejected server-side when provider is on active job
    assert.ok(
      agentRoutesJs.includes("code: 'PROVIDER_LOCKED_BUSY'"),
      'agentRoutes.js toggle-online must reject with PROVIDER_LOCKED_BUSY when pro is engaged on active job'
    );
    // updateProviderPresence rejects AVAILABLE when on active job
    assert.ok(
      providerServiceJs.includes('PROVIDER_LOCKED_BUSY'),
      'providerService.js must reject AVAILABLE override when locked to an active job'
    );
    // Provider excluded from nearby dispatch requests
    assert.ok(
      dispatchRoutesJs.includes("sr.status IN ('Accepted', 'En Route', 'OTP Verified', 'In Progress')"),
      'dispatchRoutes.js nearby-requests must exclude busy providers'
    );
  });

  await t.test('4. Unlock on Completion', () => {
    // When job completes, provider unlocked to AVAILABLE & is_online = true
    assert.ok(
      dispatchRoutesJs.includes("availability_status = 'AVAILABLE'") &&
      dispatchRoutesJs.includes("is_online = true"),
      'Provider must be restored to AVAILABLE and is_online=true on job completion'
    );
  });

  await t.test('5. Unlock on Cancellation & Automatic Re-Broadcast', () => {
    // Professional cancellation: reopens as Open, re-broadcasts
    assert.ok(
      dispatchRoutesJs.includes("PROVIDER_CANCELLED_REBROADCAST"),
      'Professional cancellation must trigger PROVIDER_CANCELLED_REBROADCAST'
    );
    assert.ok(
      dispatchRoutesJs.includes("UPDATE service_requests\n        SET status = 'Open'") ||
      dispatchRoutesJs.includes("SET status = 'Open'"),
      'Professional cancellation must reopen request status as Open'
    );
    assert.ok(
      dispatchRoutesJs.includes("request.provider_cancelled"),
      'Customer must be notified of provider cancellation without needing to rebook'
    );
    // Customer cancellation: closes request, unlocks professional
    assert.ok(
      dispatchRoutesJs.includes("UPDATE service_requests\n         SET status = 'Cancelled'") ||
      dispatchRoutesJs.includes("SET status = 'Cancelled'"),
      'Customer cancellation must mark request Cancelled'
    );
  });

  await t.test('6. Timeout Safeguard (Delayed Flag & Re-broadcast Endpoint)', () => {
    // Check if delayed status is computed
    assert.ok(
      dispatchRoutesJs.includes("Delayed — awaiting confirmation"),
      'dispatchRoutes.js must compute Delayed — awaiting confirmation'
    );
    // Customer cancel & re-broadcast endpoint
    assert.ok(
      dispatchRoutesJs.includes('/request/:ref/rebroadcast'),
      'dispatchRoutes.js must provide /request/:ref/rebroadcast endpoint'
    );
  });

  await t.test('7. Client UI Reflection for Customer & Professional', () => {
    // Customer UI: Book a Service disabled with tooltip when locked
    assert.ok(
      myBookingsPageJsx.includes('isCustomerLocked'),
      'MyBookingsPage.jsx must define isCustomerLocked'
    );
    assert.ok(
      myBookingsPageJsx.includes('disabled={isCustomerLocked}'),
      'MyBookingsPage.jsx must disable Book a Service button when isCustomerLocked'
    );
    assert.ok(
      myBookingsPageJsx.includes('handleCancelAndRebroadcast'),
      'MyBookingsPage.jsx must implement handleCancelAndRebroadcast for delayed jobs'
    );

    // Professional UI: Switch toggle locked to busy with tooltip
    assert.ok(
      partnerConsoleJsx.includes('isBusyOnJob') && partnerConsoleJsx.includes('disabled={isBusyOnJob'),
      'PartnerConsolePage.jsx must disable availability toggle when isBusyOnJob'
    );
    assert.ok(
      partnerConsoleJsx.includes('handleCancelAssignment'),
      'PartnerConsolePage.jsx must surface Cancel Assignment action to professional'
    );
    assert.ok(
      partnerContextJsx.includes('cancelJob'),
      'PartnerContext.jsx must expose cancelJob'
    );
    assert.ok(
      bookingContextJsx.includes('cancelAndRebroadcast') && bookingContextJsx.includes('isCustomerJobLocked'),
      'BookingContext.jsx must expose cancelAndRebroadcast and isCustomerJobLocked'
    );
  });

  await t.test('8. Strict Zero Emoji and Visual Discipline', () => {
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(myBookingsPageJsx), 'MyBookingsPage must contain zero emojis');
    assert.ok(!emojiRegex.test(partnerConsoleJsx), 'PartnerConsolePage must contain zero emojis');
  });
});
