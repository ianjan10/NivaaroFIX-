import assert from 'assert';

const BASE_URL = 'http://localhost:5000';

async function runTest() {
  console.log('🧪 Starting End-to-End Test: Busy States & Real-Time Interaction Lifecycle...');

  const timestamp = Date.now();
  const testCustomerEmail = `e2e.customer.${timestamp}@example.com`;
  const testProEmail = `kumar@gmail.com`; // verified pro partner with valid account

  // Clean up any stale active job for pro if previously interrupted
  const initialJobCheck = await fetch(`${BASE_URL}/api/dispatch/provider/active-job?email=${encodeURIComponent(testProEmail)}`);
  const initialJobData = await initialJobCheck.json();
  if (initialJobData?.activeJob) {
    const staleRef = initialJobData.activeJob.requestRef || initialJobData.activeJob.id;
    const staleOtp = initialJobData.activeJob.otpCode;
    console.log(`🧹 Completing previous test job for pro: ${staleRef}`);
    await fetch(`${BASE_URL}/api/dispatch/request/${staleRef}/en-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentEmail: testProEmail })
    });
    if (staleOtp) {
      await fetch(`${BASE_URL}/api/dispatch/request/${staleRef}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: staleOtp })
      });
    }
    await fetch(`${BASE_URL}/api/dispatch/request/${staleRef}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentEmail: testProEmail })
    });
  }

  console.log('1. Customer creates initial service request...');
  const createReqRes = await fetch(`${BASE_URL}/api/dispatch/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: testCustomerEmail,
      userName: 'E2E Test User',
      userPhone: '+91 9876543210',
      userAddress: '123 MG Road, Indiranagar, Bengaluru',
      lat: 12.9716,
      lng: 77.5946,
      serviceTitle: 'Ceiling Fan Repair',
      category: 'electrician',
      issueType: 'Fan Making Noise',
      problemDescription: 'High vibration noise when operating on speed 3'
    })
  });

  const createReqData = await createReqRes.json();
  assert.strictEqual(createReqRes.status, 201, `Failed to create request: ${JSON.stringify(createReqData)}`);
  assert.strictEqual(createReqData.success, true);
  const requestRef = createReqData.request.requestRef;
  const otpCode = createReqData.request.otpCode;
  console.log(`✅ Request created: ${requestRef}, OTP: ${otpCode}`);

  // Test 1: Provider submits quotation
  console.log('2. Provider submits quotation for the request...');
  const quoteRes = await fetch(`${BASE_URL}/api/dispatch/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestRef,
      agentEmail: testProEmail,
      amount: 450,
      estimatedDuration: 30,
      message: 'Genuine parts in toolkit. Can reach in 15 mins.'
    })
  });
  const quoteData = await quoteRes.json();
  assert.strictEqual(quoteRes.status, 201, `Quote submission failed: ${JSON.stringify(quoteData)}`);
  assert.strictEqual(quoteData.success, true);
  const quoteId = quoteData.quote.quoteId;
  console.log(`✅ Quotation submitted: Quote ID #${quoteId} for ₹450`);

  // Test 2: Customer accepts quotation -> Triggers Job Lock
  console.log('3. Customer accepts quotation (Triggers Exclusive Job Lock)...');
  const acceptRes = await fetch(`${BASE_URL}/api/dispatch/quote/${quoteId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const acceptData = await acceptRes.json();
  assert.strictEqual(acceptRes.status, 200, `Quote accept failed: ${JSON.stringify(acceptData)}`);
  assert.strictEqual(acceptData.success, true);
  console.log(`✅ Quote accepted. Provider assigned to work order.`);

  // Test 3: Customer Job Lock enforced (Customer cannot create another request while in Accepted state)
  console.log('4. Testing Customer Exclusive Job Lock (Single-request mutual exclusivity)...');
  const duplicateReqRes = await fetch(`${BASE_URL}/api/dispatch/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: testCustomerEmail,
      userName: 'E2E Test User',
      userPhone: '+91 9876543210',
      userAddress: '123 MG Road, Indiranagar, Bengaluru',
      lat: 12.9716,
      lng: 77.5946,
      serviceTitle: 'Switchboard Replacement',
      category: 'electrician',
      issueType: 'Sparks from socket',
      problemDescription: 'Another simultaneous booking attempt'
    })
  });

  const duplicateReqData = await duplicateReqRes.json();
  assert.strictEqual(duplicateReqRes.status, 403, 'Customer should be blocked with 403 CUSTOMER_LOCKED');
  assert.strictEqual(duplicateReqData.code, 'CUSTOMER_LOCKED');
  assert.ok(duplicateReqData.error.includes(requestRef));
  console.log('✅ Customer job lock enforced: concurrent booking blocked with 403 CUSTOMER_LOCKED.');

  // Test 4: Provider is now busy on this job
  console.log('5. Testing Provider Busy State (Single-job mutual exclusivity)...');
  const nearbyRes = await fetch(`${BASE_URL}/api/dispatch/nearby-requests?email=${encodeURIComponent(testProEmail)}&lat=12.9716&lng=77.5946`);
  const nearbyData = await nearbyRes.json();
  assert.strictEqual(nearbyData.success, true);
  assert.strictEqual(nearbyData.isBusy, true, 'Provider should have isBusy: true');
  assert.strictEqual(nearbyData.activeJobRef, requestRef);
  assert.strictEqual(nearbyData.requests.length, 0, 'Nearby requests should be empty while busy');
  console.log(`✅ Provider busy state enforced in dispatch feed: isBusy=true, feed paused.`);

  // Test 5: Provider cannot submit quotes while busy on another job
  console.log('6. Testing Provider quote submission block while busy...');
  const cust2Req = await fetch(`${BASE_URL}/api/dispatch/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: `other.cust.${Date.now()}@example.com`,
      userName: 'Other Customer',
      userAddress: 'Koramangala 4th Block, Bengaluru',
      lat: 12.9352,
      lng: 77.6245,
      serviceTitle: 'Exhaust Fan Repair',
      category: 'electrician',
      problemDescription: 'Motor stuck'
    })
  });
  const cust2Data = await cust2Req.json();
  const validOpenRef = cust2Data.request.requestRef;

  const busyQuoteRes = await fetch(`${BASE_URL}/api/dispatch/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestRef: validOpenRef,
      agentEmail: testProEmail,
      amount: 500,
      estimatedDuration: 30
    })
  });
  const busyQuoteData = await busyQuoteRes.json();
  assert.strictEqual(busyQuoteRes.status, 409, 'Provider should be blocked with 409');
  assert.strictEqual(busyQuoteData.code, 'PROVIDER_BUSY');
  console.log(`✅ Provider busy state enforced: new quotes blocked with 409 PROVIDER_BUSY.`);

  // Test 6: Provider marks En Route
  console.log('7. Provider marks En Route...');
  const enRouteRes = await fetch(`${BASE_URL}/api/dispatch/request/${requestRef}/en-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentEmail: testProEmail })
  });
  const enRouteData = await enRouteRes.json();
  assert.strictEqual(enRouteRes.status, 200);
  assert.strictEqual(enRouteData.request.status, 'En Route');
  console.log(`✅ Status updated to En Route.`);

  // Test 7: Provider verifies Door OTP
  console.log('8. Provider verifies Customer Door OTP...');
  // Wrong OTP test
  const wrongOtpRes = await fetch(`${BASE_URL}/api/dispatch/request/${requestRef}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp: '0000' })
  });
  assert.strictEqual(wrongOtpRes.status, 400, 'Invalid OTP should return 400');

  // Correct OTP
  const correctOtpRes = await fetch(`${BASE_URL}/api/dispatch/request/${requestRef}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp: otpCode })
  });
  const correctOtpData = await correctOtpRes.json();
  assert.strictEqual(correctOtpRes.status, 200);
  assert.strictEqual(correctOtpData.request.status, 'In Progress');
  console.log(`✅ Door OTP verified successfully. Job in progress.`);

  // Test 8: Provider completes job
  console.log('9. Provider completes job & triggers payout...');
  const completeRes = await fetch(`${BASE_URL}/api/dispatch/request/${requestRef}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentEmail: testProEmail })
  });
  const completeData = await completeRes.json();
  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeData.request.status, 'Completed');
  assert.ok(completeData.wallet.payout > 0, 'Payout credited');
  console.log(`✅ Job completed. Payout ₹${completeData.wallet.payout} credited.`);

  // Test 9: Customer can now book their next service
  console.log('10. Verifying Customer can now create a new service request after completion...');
  const nextReqRes = await fetch(`${BASE_URL}/api/dispatch/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: testCustomerEmail,
      userName: 'E2E Test User',
      userPhone: '+91 9876543210',
      userAddress: '123 MG Road, Indiranagar, Bengaluru',
      lat: 12.9716,
      lng: 77.5946,
      serviceTitle: 'Next Home Service',
      category: 'electrician',
      issueType: 'Subsequent service after completion',
      problemDescription: 'Everything verified end-to-end'
    })
  });
  const nextReqData = await nextReqRes.json();
  assert.strictEqual(nextReqRes.status, 201, `Next request should succeed: ${JSON.stringify(nextReqData)}`);
  assert.strictEqual(nextReqData.success, true);
  console.log(`✅ Next request created successfully: ${nextReqData.request.requestRef}`);

  // Test 10: Provider is no longer busy
  console.log('11. Verifying Provider is no longer busy on completed job...');
  const proJobRes = await fetch(`${BASE_URL}/api/dispatch/provider/active-job?email=${encodeURIComponent(testProEmail)}`);
  const proJobData = await proJobRes.json();
  assert.strictEqual(proJobData.activeJob, null, 'Active job should be cleared');
  console.log(`✅ Provider active job cleared. Provider is ready for new dispatches.`);

  console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY! 🚀');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
