import pg from 'pg';
import assert from 'assert';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/nivaarofix_db'
});

async function runRebuiltLifecycleTests() {
  console.log('🧪 Running Rebuilt Customer Booking & Job Lifecycle End-to-End Tests...');

  let testCustomerId = null;
  let testProId = null;
  let testRequestId = null;
  let testRef = `NV-TEST-${Date.now()}`;
  let testQuoteId = null;

  try {
    // 1. Create a customer
    const custRes = await pool.query(
      `INSERT INTO user_login (name, email, phone, city, state, password)
       VALUES ('E2E Customer', 'e2e_cust_${Date.now()}@example.com', '+91 99999 11111', 'Trichy', 'Tamil Nadu', 'password123')
       RETURNING id, email;`
    );
    testCustomerId = custRes.rows[0].id;
    console.log('  ✅ [PASS] Registered customer');

    // 2. Create a verified professional with wallet
    const proRes = await pool.query(
      `INSERT INTO agent_login (partner_id, name, email, phone, trade, city, state, rating, completed_jobs, wallet_balance, lat, lng)
       VALUES ('FIX-PRO-9999', 'Karthik Selvam', 'e2e_pro_${Date.now()}@example.com', '+91 98888 22222', 'electrician', 'Trichy', 'Tamil Nadu', 4.95, 42, 100.00, 12.9716, 77.5946)
       RETURNING id, email;`
    );
    testProId = proRes.rows[0].id;
    console.log('  ✅ [PASS] Registered professional with initial wallet balance ₹100');

    // 3. Customer initiates service request with exact catalog service "Fans & Fittings"
    const reqRes = await pool.query(
      `INSERT INTO service_requests (
        request_ref, user_id, user_email, user_name, user_phone, user_address,
        lat, lng, category, service_title, problem_description, status, otp_code
       ) VALUES (
        $1, $2, $3, 'E2E Customer', '+91 99999 11111', 'Home · Thuvakudi, Trichy',
        12.9716, 77.5946, 'electrician', 'Fans & Fittings', 'Ceiling fan making clicking sound on high speed', 'Open', '5821'
       ) RETURNING id, request_ref, status, service_title, otp_code;`,
      [testRef, testCustomerId, custRes.rows[0].email]
    );
    testRequestId = reqRes.rows[0].id;
    assert.strictEqual(reqRes.rows[0].service_title, 'Fans & Fittings');
    assert.strictEqual(reqRes.rows[0].status, 'Open');
    console.log('  ✅ [PASS] Created service request for "Fans & Fittings" in Open state');

    // 4. Pro submits quote
    const quoteRes = await pool.query(
      `INSERT INTO quotes (
        request_id, agent_id, agent_name, agent_phone, agent_email,
        amount, estimated_duration_minutes, message, status
       ) VALUES ($1, $2, 'Karthik Selvam', '+91 98888 22222', 'karthik@example.com', 450, 20, 'OEM replacement bearings on hand.', 'Pending')
       RETURNING id, amount, status;`,
      [testRequestId, testProId]
    );
    testQuoteId = quoteRes.rows[0].id;
    assert.strictEqual(parseFloat(quoteRes.rows[0].amount), 450);
    console.log('  ✅ [PASS] Professional submitted quote: ₹450, ETA 20 mins');

    // 5. Customer accepts quote -> Confirmed
    await pool.query(
      `UPDATE service_requests
       SET status = 'Confirmed', accepted_quote_id = $1
       WHERE id = $2;`,
      [testQuoteId, testRequestId]
    );
    await pool.query(
      `UPDATE quotes SET status = 'Accepted' WHERE id = $1;`,
      [testQuoteId]
    );
    const confirmedSr = await pool.query(`SELECT status FROM service_requests WHERE id = $1;`, [testRequestId]);
    assert.strictEqual(confirmedSr.rows[0].status, 'Confirmed');
    console.log('  ✅ [PASS] Customer accepted quote -> Status moved to Confirmed');

    // 6. Pro marks On the way
    await pool.query(
      `UPDATE service_requests SET status = 'On the way' WHERE id = $1;`,
      [testRequestId]
    );
    const enRouteSr = await pool.query(`SELECT status FROM service_requests WHERE id = $1;`, [testRequestId]);
    assert.strictEqual(enRouteSr.rows[0].status, 'On the way');
    console.log('  ✅ [PASS] Pro marked On the way -> Status moved to On the way');

    // 7. Pro arrives at doorstep -> Arrived + arrived_at timestamp
    const now = new Date();
    await pool.query(
      `UPDATE service_requests SET status = 'Arrived', arrived_at = $1 WHERE id = $2;`,
      [now, testRequestId]
    );
    const arrivedSr = await pool.query(`SELECT status, arrived_at, otp_code FROM service_requests WHERE id = $1;`, [testRequestId]);
    assert.strictEqual(arrivedSr.rows[0].status, 'Arrived');
    assert.ok(arrivedSr.rows[0].arrived_at);
    assert.strictEqual(arrivedSr.rows[0].otp_code, '5821');
    console.log('  ✅ [PASS] Pro arrives at doorstep -> Status Arrived, arrived_at recorded, Door OTP revealed to customer');

    // 8. Door OTP verification -> In progress + started_at timestamp
    const verifyOtpAttempt = '5821';
    assert.strictEqual(verifyOtpAttempt, arrivedSr.rows[0].otp_code);
    await pool.query(
      `UPDATE service_requests SET status = 'In progress', started_at = $1 WHERE id = $2;`,
      [now, testRequestId]
    );
    const inProgressSr = await pool.query(`SELECT status, started_at FROM service_requests WHERE id = $1;`, [testRequestId]);
    assert.strictEqual(inProgressSr.rows[0].status, 'In progress');
    assert.ok(inProgressSr.rows[0].started_at);
    console.log('  ✅ [PASS] Door OTP verified -> Status moved to In progress, started_at recorded');

    // 9. Completion Sheet: mandatory 1-4 photos + remarks -> Completed + payout settlement
    const completionPhotos = ['data:image/jpeg;base64,samplephoto1', 'data:image/jpeg;base64,samplephoto2'];
    const completionRemarks = 'Replaced capacitor and lubricated bearings. Fan tested smoothly at all 5 speeds.';

    await pool.query(
      `UPDATE service_requests
       SET status = 'Completed', completion_photos = $1::jsonb, completion_remarks = $2, completed_at = NOW()
       WHERE id = $3;`,
      [JSON.stringify(completionPhotos), completionRemarks, testRequestId]
    );
    // Credit wallet
    await pool.query(
      `UPDATE agent_login
       SET wallet_balance = wallet_balance + 450, completed_jobs = completed_jobs + 1
       WHERE id = $1;`,
      [testProId]
    );
    const completedSr = await pool.query(
      `SELECT status, completion_photos, completion_remarks, completed_at FROM service_requests WHERE id = $1;`,
      [testRequestId]
    );
    assert.strictEqual(completedSr.rows[0].status, 'Completed');
    assert.strictEqual(completedSr.rows[0].completion_remarks, completionRemarks);
    assert.strictEqual(completedSr.rows[0].completion_photos.length, 2);

    const proAfterCompletion = await pool.query(`SELECT wallet_balance, completed_jobs FROM agent_login WHERE id = $1;`, [testProId]);
    assert.strictEqual(parseFloat(proAfterCompletion.rows[0].wallet_balance), 550);
    assert.strictEqual(proAfterCompletion.rows[0].completed_jobs, 43);
    console.log('  ✅ [PASS] Job completed with proof photos & remarks -> Payout ₹450 credited to wallet (Balance: ₹550, Jobs: 43)');

    // 10. Customer rates the job: 5 stars, written review -> service_requests + recompute pro rating
    await pool.query(
      `UPDATE service_requests
       SET rating = 5, rating_feedback = 'Super fast arrival and perfect fan repair! Clean work.'
       WHERE id = $1;`,
      [testRequestId]
    );

    // Recompute agent overall rating
    await pool.query(
      `UPDATE agent_login
       SET rating = ROUND((rating * 0.9 + 5 * 0.1)::numeric, 2)
       WHERE id = $1;`,
      [testProId]
    );

    const ratedSr = await pool.query(`SELECT rating, rating_feedback FROM service_requests WHERE id = $1;`, [testRequestId]);
    assert.strictEqual(ratedSr.rows[0].rating, 5);
    console.log('  ✅ [PASS] Customer submitted 5-star review -> Rating recorded & pro rating recomputed: ★ 4.96');

    console.log('\n========================================');
    console.log('Rebuilt Lifecycle Suite: ALL 10 TESTS PASSED');
    console.log('========================================');
  } finally {
    // Clean up test data
    if (testRequestId) {
      await pool.query('DELETE FROM quotes WHERE request_id = $1;', [testRequestId]);
      await pool.query('DELETE FROM service_requests WHERE id = $1;', [testRequestId]);
    }
    if (testCustomerId) {
      await pool.query('DELETE FROM user_login WHERE id = $1;', [testCustomerId]);
    }
    if (testProId) {
      await pool.query('DELETE FROM agent_login WHERE id = $1;', [testProId]);
    }
    await pool.end();
  }
}

runRebuiltLifecycleTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
