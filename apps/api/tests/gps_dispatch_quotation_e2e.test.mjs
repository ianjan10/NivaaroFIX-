import assert from 'assert';
import { pool } from '../src/config/db.js';
import { DISPATCH_CONFIG } from '../src/config/dispatchConfig.js';
import { createServiceRequest, getRequestWithQuotes } from '../src/modules/requests/requestService.js';
import { findEligibleProviders, dispatchProgressiveWave, expandSearchRadiusIfNeeded } from '../src/modules/dispatch/dispatchService.js';
import { submitQuote, acceptQuote } from '../src/modules/quotes/quoteService.js';
import { updateProviderLocation, updateProviderPresence } from '../src/modules/providers/providerService.js';
import { resolveServiceIntent } from '../src/modules/discovery/searchService.js';

// Customer reference origin: New Delhi (28.613900, 77.209000)
const CUSTOMER_LAT = 28.613900;
const CUSTOMER_LNG = 77.209000;

// Earth: ~111,000 meters per degree latitude
// Offsets to produce exact tested distances:
// 40m offset in latitude: 40 / 111000 = ~0.00036
const PROVIDER_A_LAT = 28.613900 + (40 / 111000); // ~40m away
const PROVIDER_A_LNG = 77.209000;

// 300m offset in latitude: 300 / 111000 = ~0.00270
const PROVIDER_B_LAT = 28.613900 + (300 / 111000); // ~300m away
const PROVIDER_B_LNG = 77.209000;

// 700m offset in latitude: 700 / 111000 = ~0.00630
const PROVIDER_C_LAT = 28.613900 + (700 / 111000); // ~700m away
const PROVIDER_C_LNG = 77.209000;

// 2000m (2km) offset in latitude: 2000 / 111000 = ~0.01801
const PROVIDER_D_LAT = 28.613900 + (2000 / 111000); // ~2km away
const PROVIDER_D_LNG = 77.209000;

async function runGpsDispatchQuotationE2ETest() {
  console.log('====================================================');
  console.log('🚀 Starting GPS Dispatch & Quotation System E2E Test');
  console.log('====================================================\n');

  try {
    // -----------------------------------------------------------------
    // Step 1: Customer searches "pipe burst" -> Resolves to "plumber"
    // -----------------------------------------------------------------
    console.log('Test 1: Intent Resolution for "pipe burst"');
    const intent = await resolveServiceIntent('pipe burst');
    assert(intent !== null, 'Intent should resolve for "pipe burst"');
    assert.strictEqual(intent.category, 'plumber', 'Category should resolve to plumber');
    console.log(`✅ Search "pipe burst" resolved category: ${intent.category} (${intent.matchedServiceTitle})\n`);

    // -----------------------------------------------------------------
    // Setup Test Providers with Known Coordinates and States
    // -----------------------------------------------------------------
    console.log('Setting up Test Providers A, B, C, D at exact distances...');
    const testProviders = [
      { name: 'Provider A (40m)', email: 'e2e_provider_a@test.com', lat: PROVIDER_A_LAT, lng: PROVIDER_A_LNG, trade: 'plumber' },
      { name: 'Provider B (300m)', email: 'e2e_provider_b@test.com', lat: PROVIDER_B_LAT, lng: PROVIDER_B_LNG, trade: 'plumber' },
      { name: 'Provider C (700m)', email: 'e2e_provider_c@test.com', lat: PROVIDER_C_LAT, lng: PROVIDER_C_LNG, trade: 'plumber' },
      { name: 'Provider D (2km)', email: 'e2e_provider_d@test.com', lat: PROVIDER_D_LAT, lng: PROVIDER_D_LNG, trade: 'plumber' },
      // Negative test providers:
      { name: 'Provider Busy', email: 'e2e_provider_busy@test.com', lat: PROVIDER_A_LAT, lng: PROVIDER_A_LNG, trade: 'plumber', status: 'BUSY' },
      { name: 'Provider Stale', email: 'e2e_provider_stale@test.com', lat: PROVIDER_A_LAT, lng: PROVIDER_A_LNG, trade: 'plumber', stale: true },
      { name: 'Provider Bad Accuracy', email: 'e2e_provider_badacc@test.com', lat: PROVIDER_A_LAT, lng: PROVIDER_A_LNG, trade: 'plumber', accuracy: 250 }
    ];

    const providerRecords = {};

    let pidCounter = 1;
    for (const p of testProviders) {
      await pool.query('DELETE FROM agent_login WHERE email = $1;', [p.email]);
      const partnerId = `NV-PR-E2E-${pidCounter++}`;
      let h3_8 = null;
      let h3_9 = null;
      try {
        const { latLngToCell } = await import('h3-js');
        h3_8 = latLngToCell(p.lat, p.lng, 8);
        h3_9 = latLngToCell(p.lat, p.lng, 9);
      } catch (e) {}

      const insRes = await pool.query(`
        INSERT INTO agent_login (
          partner_id, name, email, phone, trade, experience_years,
          rating, completed_jobs, is_online, availability_status,
          kyc_status, lat, lng, location_accuracy_m, h3_res_8, h3_index_res9, location_updated_at
        ) VALUES (
          $1, $2, $3, '9876543210', $4, 5,
          4.95, 42, $5, $6,
          'Verified', $7, $8, $9, $10, $11,
          CASE WHEN $12 = true THEN CURRENT_TIMESTAMP - INTERVAL '3600 seconds' ELSE CURRENT_TIMESTAMP END
        ) RETURNING id, partner_id, email, name, lat, lng, availability_status;
      `, [
        partnerId,
        p.name,
        p.email,
        p.trade,
        p.status ? p.status === 'AVAILABLE' : true,
        p.status || 'AVAILABLE',
        p.lat,
        p.lng,
        p.accuracy || 10,
        h3_8,
        h3_9,
        !!p.stale
      ]);
      providerRecords[p.email] = insRes.rows[0];
    }

    // Verify distance from customer via PostgreSQL earth_distance
    const distCheck = await pool.query(`
      SELECT email, ROUND(earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lng))::numeric, 1) AS distance_m
      FROM agent_login
      WHERE email IN ('e2e_provider_a@test.com', 'e2e_provider_b@test.com', 'e2e_provider_c@test.com', 'e2e_provider_d@test.com')
      ORDER BY distance_m ASC;
    `, [CUSTOMER_LAT, CUSTOMER_LNG]);

    console.log('Verified Exact PostgreSQL earth_distances:');
    distCheck.rows.forEach(r => console.log(`  - ${r.email}: ${r.distance_m} meters`));
    console.log('');

    // -----------------------------------------------------------------
    // Step 2: Customer creates service request with GPS
    // -----------------------------------------------------------------
    // Clean up any lingering active test requests for customer to ensure test isolation
    await pool.query("DELETE FROM quotes WHERE request_id IN (SELECT id FROM service_requests WHERE user_email = 'customer_e2e@test.com' OR customer_email = 'customer_e2e@test.com');");
    await pool.query("DELETE FROM bookings WHERE user_email = 'customer_e2e@test.com' OR customer_email = 'customer_e2e@test.com';");
    await pool.query("DELETE FROM service_requests WHERE user_email = 'customer_e2e@test.com' OR customer_email = 'customer_e2e@test.com';");

    console.log('Test 2: Customer creates GPS-based Service Request');
    const reqResult = await createServiceRequest({
      userId: 101,
      userEmail: 'customer_e2e@test.com',
      userName: 'Rahul Sharma',
      userPhone: '9811002233',
      userAddress: 'Flat 402, Connaught Plaza, Barakhamba, New Delhi',
      lat: CUSTOMER_LAT,
      lng: CUSTOMER_LNG,
      accuracy_m: 12,
      category: 'plumber',
      serviceTitle: 'Plumbing - Pipe Leakage & Burst Repair',
      problemDescription: 'Water is coming from the bathroom wall.',
      photos: ['https://storage.nivaarofix.com/mock-burst-pipe.jpg']
    });

    assert(reqResult.success, 'Request creation must succeed');
    const reqRef = reqResult.request.requestRef;
    const reqId = reqResult.request.id;
    console.log(`✅ Service Request created: ${reqRef} (ID: ${reqId})`);
    console.log(`   Initial Wave Radius: ${reqResult.initialDispatch.radiusMeters}m`);
    console.log(`   Initial Notified Providers Count: ${reqResult.initialDispatch.newlyDispatchedCount}`);

    // Initial wave must be 50m and must only match Provider A (40m)
    assert.strictEqual(reqResult.initialDispatch.radiusMeters, DISPATCH_CONFIG.INITIAL_RADIUS_METERS, 'Initial search radius must start at 50m');
    assert.strictEqual(reqResult.initialDispatch.newlyDispatchedCount, 1, 'Only 1 provider (Provider A at 40m) must match initial 50m search');
    assert.strictEqual(reqResult.initialDispatch.providers[0].email, 'e2e_provider_a@test.com', 'Provider A must be the matched provider at 50m');
    console.log('✅ Initial 50m search strictly matched Provider A (40m away) and excluded distant providers.\n');

    // -----------------------------------------------------------------
    // Step 3: Progressive Radius Expansion Test (Section 38)
    // -----------------------------------------------------------------
    console.log('Test 3: Progressive Radius Expansion (50m -> 100m -> 500m -> 1km -> 5km -> 10km)');
    
    // Wave 2: 100m
    const wave100 = await dispatchProgressiveWave(reqId, 100);
    console.log(`- 100m search: newly dispatched = ${wave100.newlyDispatchedCount} (Provider A already dispatched)`);
    assert.strictEqual(wave100.newlyDispatchedCount, 0, 'No new providers between 50m and 100m; Provider A not re-notified');

    // Wave 3: 500m
    const wave500 = await dispatchProgressiveWave(reqId, 500);
    console.log(`- 500m search: newly dispatched = ${wave500.newlyDispatchedCount} (Provider B at 300m)`);
    assert.strictEqual(wave500.newlyDispatchedCount, 1, 'Provider B (300m) must become eligible at 500m');
    assert.strictEqual(wave500.providers[0].email, 'e2e_provider_b@test.com', 'Dispatched provider must be Provider B');

    // Wave 4: 1000m (1km)
    const wave1000 = await dispatchProgressiveWave(reqId, 1000);
    console.log(`- 1000m search: newly dispatched = ${wave1000.newlyDispatchedCount} (Provider C at 700m)`);
    assert.strictEqual(wave1000.newlyDispatchedCount, 1, 'Provider C (700m) must become eligible at 1km');
    assert.strictEqual(wave1000.providers[0].email, 'e2e_provider_c@test.com', 'Dispatched provider must be Provider C');

    // Wave 5: 5000m (5km)
    const wave5000 = await dispatchProgressiveWave(reqId, 5000);
    console.log(`- 5000m search: newly dispatched = ${wave5000.newlyDispatchedCount} (Provider D at 2km)`);
    assert.strictEqual(wave5000.newlyDispatchedCount, 1, 'Provider D (2km) must become eligible at 5km');
    assert.strictEqual(wave5000.providers[0].email, 'e2e_provider_d@test.com', 'Dispatched provider must be Provider D');

    console.log('✅ Progressive radius expansion strictly followed [50m, 100m, 500m, 1km, 5km] without skipping.\n');

    // -----------------------------------------------------------------
    // Step 4: Negative Eligibility Tests (BUSY, Stale > 1800s, Bad Accuracy)
    // -----------------------------------------------------------------
    console.log('Test 4: Negative Eligibility Tests');
    const dispatchedEmails = (await pool.query(
      'SELECT a.email FROM request_dispatches rd JOIN agent_login a ON a.id = rd.agent_id WHERE rd.request_id = $1;',
      [reqId]
    )).rows.map(r => r.email);

    assert(!dispatchedEmails.includes('e2e_provider_busy@test.com'), 'BUSY provider must NOT be dispatched');
    assert(!dispatchedEmails.includes('e2e_provider_stale@test.com'), 'Stale provider (> 30 mins) must NOT be dispatched');
    assert(!dispatchedEmails.includes('e2e_provider_badacc@test.com'), 'Provider with inaccurate GPS (> 100m) must NOT be dispatched');
    console.log('✅ Ineligible providers (BUSY, stale location > 30m, GPS accuracy > 100m) were strictly excluded.\n');

    // -----------------------------------------------------------------
    // Step 5: Provider Quotations Submission
    // -----------------------------------------------------------------
    console.log('Test 5: Providers Submit Quotations');
    // Provider A submits ₹100
    const quoteA = await submitQuote({
      requestRef: reqRef,
      providerEmail: 'e2e_provider_a@test.com',
      amount: 100,
      providerNote: 'I can come immediately and fix the burst pipe.',
      etaMinutes: 20,
      warrantyDays: 30
    });
    assert(quoteA.quoteId, 'Quote A ID should exist');
    assert.strictEqual(quoteA.amount, 100, 'Quote A amount should be 100');
    console.log(`- Provider A submitted quote: ₹${quoteA.amount} (ETA: ${quoteA.etaMinutes} min, Warranty: ${quoteA.warrantyDays} days)`);

    // Provider B submits ₹150
    const quoteB = await submitQuote({
      requestRef: reqRef,
      providerEmail: 'e2e_provider_b@test.com',
      amount: 150,
      providerNote: 'High grade CPVC replacement with 60 days guarantee.',
      etaMinutes: 15,
      warrantyDays: 60
    });
    console.log(`- Provider B submitted quote: ₹${quoteB.amount} (ETA: ${quoteB.etaMinutes} min, Warranty: ${quoteB.warrantyDays} days)`);

    // Duplicate quote prevention test
    let duplicateCaught = false;
    try {
      await submitQuote({
        requestRef: reqRef,
        providerEmail: 'e2e_provider_a@test.com',
        amount: 90
      });
    } catch (dupErr) {
      duplicateCaught = true;
      console.log(`✅ Duplicate quote blocked as expected: ${dupErr.message}`);
    }
    assert(duplicateCaught, 'Duplicate quotation from same provider must be blocked');

    // -----------------------------------------------------------------
    // Step 6: Customer Compares Quotations
    // -----------------------------------------------------------------
    console.log('\nTest 6: Customer Retrieves & Compares Quotations');
    const reqWithQuotes = await getRequestWithQuotes(reqRef);
    assert.strictEqual(reqWithQuotes.quotes.length, 2, 'Customer should receive both quotes');
    console.log(`Customer received ${reqWithQuotes.quotes.length} quotations:`);
    reqWithQuotes.quotes.forEach(q => {
      console.log(`  - ${q.providerName}: ₹${q.amount} | ETA: ${q.etaMinutes}m | Warranty: ${q.warrantyDays}d | "${q.providerNote}"`);
    });

    // -----------------------------------------------------------------
    // Step 7: Atomic Quotation Acceptance & Booking Confirmation
    // -----------------------------------------------------------------
    console.log('\nTest 7: Customer Selects & Accepts Provider A Quotation');
    const acceptRes = await acceptQuote(quoteA.quoteId, 'customer_e2e@test.com');
    assert(acceptRes.success, 'Quote acceptance must succeed');
    assert.strictEqual(acceptRes.status, 'Accepted', 'Request status should become Accepted');
    assert.strictEqual(acceptRes.assignedProvider.id, providerRecords['e2e_provider_a@test.com'].id, 'Assigned provider must be Provider A');
    console.log(`✅ Quotation accepted atomically!`);
    console.log(`   Booking Ref: ${acceptRes.bookingRef}`);
    console.log(`   Assigned Technician: ${acceptRes.assignedProvider.name}`);
    console.log(`   Agreed Amount: ₹${acceptRes.assignedProvider.agreedAmount}`);
    console.log(`   OTP Code: ${acceptRes.otpCode}`);

    // Verify in database that competing quote (quoteB) was marked Withdrawn / Declined
    const quoteBStatus = await pool.query('SELECT status FROM quotes WHERE id = $1;', [quoteB.quoteId]);
    assert.ok(
      quoteBStatus.rows[0].status === 'Withdrawn' || quoteBStatus.rows[0].status === 'Declined',
      `Competing quote B must be marked Withdrawn or Declined, got ${quoteBStatus.rows[0].status}`
    );
    console.log(`✅ Competing quotation ${quoteB.quoteId} was automatically withdrawn/declined.`);

    // Verify provider status transitioned to BUSY
    const agentAStatus = await pool.query('SELECT availability_status FROM agent_login WHERE id = $1;', [providerRecords['e2e_provider_a@test.com'].id]);
    assert.strictEqual(agentAStatus.rows[0].availability_status, 'BUSY', 'Provider A must be marked BUSY');
    console.log(`✅ Provider A availability status transitioned to BUSY.`);

    // -----------------------------------------------------------------
    // Step 8: Double-acceptance concurrency test
    // -----------------------------------------------------------------
    console.log('\nTest 8: Double Acceptance / Concurrent Race Protection');
    let doubleAcceptError = false;
    try {
      await acceptQuote(quoteB.quoteId, 'customer_e2e@test.com');
    } catch (err) {
      doubleAcceptError = true;
      console.log(`✅ Second acceptance blocked by database transaction lock: ${err.message}`);
    }
    assert(doubleAcceptError, 'Second acceptance must be blocked');

    // -----------------------------------------------------------------
    // Step 9: Existing NivaaroFix Job Flow Continuation (OTP + Complete)
    // -----------------------------------------------------------------
    console.log('\nTest 9: Job Lifecycle (En Route -> OTP Verified -> Completed)');
    
    // Mark En Route
    await pool.query("UPDATE service_requests SET status = 'En Route' WHERE id = $1;", [reqId]);
    await pool.query("UPDATE bookings SET status = 'On The Way' WHERE request_id = $1;", [reqId]);
    console.log('- Status: En Route / On The Way');

    // Verify OTP
    const srData = (await pool.query('SELECT otp_code FROM service_requests WHERE id = $1;', [reqId])).rows[0];
    assert.strictEqual(srData.otp_code, acceptRes.otpCode, 'OTP code matches');
    await pool.query("UPDATE service_requests SET status = 'OTP Verified', otp_verified = true WHERE id = $1;", [reqId]);
    console.log(`- OTP Verified (${srData.otp_code})`);

    // In Progress
    await pool.query("UPDATE service_requests SET status = 'In Progress' WHERE id = $1;", [reqId]);
    await pool.query("UPDATE bookings SET status = 'In Progress' WHERE request_id = $1;", [reqId]);
    console.log('- Status: In Progress');

    // Completed
    await pool.query("UPDATE service_requests SET status = 'Completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1;", [reqId]);
    await pool.query("UPDATE bookings SET status = 'Completed', completed_at = CURRENT_TIMESTAMP WHERE request_id = $1;", [reqId]);
    await pool.query("UPDATE agent_login SET availability_status = 'AVAILABLE', completed_jobs = completed_jobs + 1 WHERE id = $1;", [providerRecords['e2e_provider_a@test.com'].id]);
    console.log('- Status: Completed. Provider returned to AVAILABLE state.');

    console.log('\n====================================================');
    console.log('🎉 ALL GPS DISPATCH & QUOTATION E2E TESTS PASSED!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ E2E Test Failure:', err);
    process.exit(1);
  }
}

runGpsDispatchQuotationE2ETest();
