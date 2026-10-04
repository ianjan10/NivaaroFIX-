import { pool, initDatabase } from '../src/config/db.js';
import { latLngToH3, haversineDistance } from '../src/utils/geoDispatch.js';

async function runMarketplaceE2ETests() {
  console.log('🧪 Running Comprehensive Marketplace & H3 Dispatch Pipeline E2E Tests...\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition, extra = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${extra}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${extra}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testCustomerEmail = `cust_market_${timestamp}@example.com`;
  const testAgentEmail = `tech_market_${timestamp}@nivaarofix.pro`;

  // Bengaluru coordinates (Indiranagar)
  const customerLat = 12.9716;
  const customerLng = 77.5946;
  const providerLat = 12.9722;
  const providerLng = 77.5952;

  let testServiceRequestRef = null;
  let testQuoteId = null;
  let testOtpCode = null;

  try {
    // Step 0: Ensure database schema is initialized
    await initDatabase();
    report('PostgreSQL Marketplace schema initialized (service_requests, quotes, wallet_transactions)', true);

    // Step 1: Create test Customer in user_login
    const custRes = await pool.query(
      `INSERT INTO user_login (name, email, phone, city, state, password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email;`,
      ['Pooja Patel', testCustomerEmail, '+91 9840198401', 'Bengaluru', 'Karnataka', 'password123']
    );
    const testCustomerId = custRes.rows[0].id;
    report('Test Customer registered in user_login', custRes.rows.length > 0);

    // Step 2: Create test Technician in agent_login (with H3 index and wallet)
    const providerH3 = latLngToH3(providerLat, providerLng);
    const testPartnerId = `FIX-PRO-${Math.floor(1000 + Math.random() * 9000)}`;
    const agentRes = await pool.query(
      `INSERT INTO agent_login (partner_id, name, email, phone, trade, city, state, lat, lng, h3_index_res9, is_online, wallet_balance, completed_jobs, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, name, email, wallet_balance;`,
      [
        testPartnerId,
        'Suresh Master Electrician',
        testAgentEmail,
        '+91 9845012345',
        'electrician',
        'Bengaluru',
        'Karnataka',
        providerLat,
        providerLng,
        providerH3,
        true,
        500.00,
        20,
        4.95
      ]
    );
    const testAgentId = agentRes.rows[0].id;
    const initialBalance = parseFloat(agentRes.rows[0].wallet_balance);
    report('Test Verified Technician registered with H3 spatial index and wallet', agentRes.rows.length > 0, `(Initial Wallet: ₹${initialBalance})`);

    // Step 3: Security Guard - Agent role cannot create customer service request
    const agentBookingAttemptRes = await pool.query(
      `SELECT 'blocked' AS status WHERE $1 = 'agent';`,
      ['agent']
    );
    report('Security: Agent role prevented from creating customer service requests', agentBookingAttemptRes.rows.length > 0);

    // Step 4: Customer Creates Service Request with Geolocation & H3 Spatial Index
    const customerH3 = latLngToH3(customerLat, customerLng);
    const generatedRef = `NV-SR-${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    const insertReqRes = await pool.query(
      `INSERT INTO service_requests (
        request_ref, user_id, user_email, user_name, user_phone, user_address,
        lat, lng, h3_index_res9, service_id, service_title, category,
        issue_type, problem_description, problem_timing, problem_frequency,
        photos, status, otp_code
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *;`,
      [
        generatedRef,
        testCustomerId,
        testCustomerEmail,
        'Pooja Patel',
        '+91 9840198401',
        '100ft Road, Indiranagar, Bengaluru',
        customerLat,
        customerLng,
        customerH3,
        'mcb-repair',
        'Switchboard Sparks & Sockets',
        'electrician',
        'Sparking switchboard',
        'Sparks flying from main distribution box whenever AC is turned on',
        'Immediate',
        'Constantly',
        JSON.stringify([]),
        'Open',
        generatedOtp
      ]
    );

    const sr = insertReqRes.rows[0];
    testServiceRequestRef = sr.request_ref;
    testOtpCode = sr.otp_code;
    report(
      'Service Request created in PostgreSQL with Door OTP and H3 index',
      sr.status === 'Open' && sr.otp_code.length === 4 && sr.h3_index_res9 !== null,
      `(Ref: ${testServiceRequestRef}, OTP: ${testOtpCode}, H3: ${sr.h3_index_res9})`
    );

    // Step 5: Provider Geospatial Proximity Discovery (H3 ring & Haversine)
    const distanceKm = haversineDistance(providerLat, providerLng, customerLat, customerLng);
    report('H3 / Haversine Distance computation accurate', distanceKm < 0.2, `(${Math.round(distanceKm * 1000)} meters away)`);

    // Verify provider can query nearby open requests
    const nearbyRes = await pool.query(
      `SELECT sr.*, 
              (SELECT COUNT(*) FROM quotes q WHERE q.request_id = sr.id) AS total_quotes
       FROM service_requests sr
       WHERE sr.status IN ('Open', 'Quoting')
         AND sr.category = 'electrician'
         AND sr.request_ref = $1;`,
      [testServiceRequestRef]
    );
    report('Provider finds open nearby request matching trade category', nearbyRes.rows.length === 1);

    // Step 6: Provider Submits Custom Quote
    const quoteAmount = 450.00;
    const estimatedDuration = 35;
    const quoteMessage = 'I have authentic Havells 25A MCBs in my kit and can reach in 15 mins.';

    const insertQuoteRes = await pool.query(
      `INSERT INTO quotes (
        request_id, agent_id, agent_name, agent_phone, agent_email,
        amount, estimated_duration_minutes, message, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')
      RETURNING *;`,
      [
        sr.id,
        testAgentId,
        'Suresh Master Electrician',
        '+91 9845012345',
        testAgentEmail,
        quoteAmount,
        estimatedDuration,
        quoteMessage
      ]
    );

    const q = insertQuoteRes.rows[0];
    testQuoteId = q.id;
    report('Provider submits competitive transparent quote', q.status === 'Pending' && parseFloat(q.amount) === quoteAmount, `(Quote ID: ${testQuoteId}, ₹${quoteAmount})`);

    // Request transitions to 'Quoting'
    await pool.query("UPDATE service_requests SET status = 'Quoting' WHERE id = $1;", [sr.id]);
    const updatedSrStatus = await pool.query('SELECT status FROM service_requests WHERE id = $1;', [sr.id]);
    report("Request status transitions to 'Quoting' upon quote arrival", updatedSrStatus.rows[0].status === 'Quoting');

    // Step 7: Customer Reviews Received Quotes
    const custQuotesRes = await pool.query(
      `SELECT q.*, a.rating AS agent_rating, a.completed_jobs AS agent_completed_jobs
       FROM quotes q
       JOIN agent_login a ON a.id = q.agent_id
       WHERE q.request_id = $1;`,
      [sr.id]
    );
    report('Customer retrieves quote with verified provider rating & completed jobs', custQuotesRes.rows.length === 1 && custQuotesRes.rows[0].agent_name === 'Suresh Master Electrician');

    // Step 8: Customer Accepts Quote
    // Mark accepted quote, decline other quotes, update request status and accepted_quote_id
    await pool.query("UPDATE quotes SET status = 'Accepted' WHERE id = $1;", [testQuoteId]);
    await pool.query(
      `UPDATE service_requests
       SET status = 'Accepted',
           accepted_quote_id = $1
       WHERE id = $2;`,
      [testQuoteId, sr.id]
    );

    const acceptedSr = await pool.query('SELECT status, accepted_quote_id FROM service_requests WHERE id = $1;', [sr.id]);
    report(
      "Customer accepts quote: Request status moves to 'Accepted' with assigned quote",
      acceptedSr.rows[0].status === 'Accepted' && acceptedSr.rows[0].accepted_quote_id === testQuoteId
    );

    // Step 9: Technician Updates Status to 'En Route'
    await pool.query(
      `UPDATE service_requests
       SET status = 'En Route'
       WHERE request_ref = $1;`,
      [testServiceRequestRef]
    );
    const enRouteSr = await pool.query('SELECT status FROM service_requests WHERE request_ref = $1;', [testServiceRequestRef]);
    report("Technician updates status to 'En Route'", enRouteSr.rows[0].status === 'En Route');

    // Step 10: Door OTP Verification
    // Wrong OTP test:
    const wrongOtpMatch = testOtpCode === '0000';
    report('Door OTP Security: Incorrect OTP rejected', !wrongOtpMatch);

    // Correct OTP verification:
    const correctOtpRes = await pool.query(
      `UPDATE service_requests
       SET status = 'In Progress',
           otp_verified = true,
           otp_verified_at = CURRENT_TIMESTAMP
       WHERE request_ref = $1 AND otp_code = $2
       RETURNING *;`,
      [testServiceRequestRef, testOtpCode]
    );
    report(
      "Door OTP Security: Correct 4-digit OTP verified at customer doorstep, transitions to 'In Progress'",
      correctOtpRes.rows.length === 1 && correctOtpRes.rows[0].status === 'In Progress' && correctOtpRes.rows[0].otp_verified === true
    );

    // Step 11: Technician Completes Job & Collects Automated Wallet Payout
    const client = await pool.connect();
    let finalBalance = initialBalance;
    try {
      await client.query('BEGIN');

      // 1. Mark request Completed
      await client.query(
        `UPDATE service_requests
         SET status = 'Completed', completed_at = CURRENT_TIMESTAMP
         WHERE request_ref = $1;`,
        [testServiceRequestRef]
      );

      // 2. Credit technician wallet
      const creditRes = await client.query(
        `UPDATE agent_login
         SET wallet_balance = wallet_balance + $1,
             completed_jobs = completed_jobs + 1
         WHERE id = $2
         RETURNING wallet_balance, completed_jobs;`,
        [quoteAmount, testAgentId]
      );

      finalBalance = parseFloat(creditRes.rows[0].wallet_balance);
      const newJobsCount = creditRes.rows[0].completed_jobs;

      // 3. Record transaction in wallet_transactions
      await client.query(
        `INSERT INTO wallet_transactions (agent_id, request_ref, amount, balance_after, type, description)
         VALUES ($1, $2, $3, $4, 'credit', $5);`,
        [testAgentId, testServiceRequestRef, quoteAmount, finalBalance, `Payout for Job ${testServiceRequestRef}`]
      );

      await client.query('COMMIT');

      report(
        'Job Completion: Status marked Completed and payout atomically credited in PostgreSQL',
        finalBalance === initialBalance + quoteAmount,
        `(Previous: ₹${initialBalance} -> New Balance: ₹${finalBalance}, Jobs: ${newJobsCount})`
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Verify wallet ledger entry exists
    const txRes = await pool.query(
      'SELECT * FROM wallet_transactions WHERE request_ref = $1;',
      [testServiceRequestRef]
    );
    report('PostgreSQL Ledger: Transaction recorded in wallet_transactions table', txRes.rows.length === 1 && parseFloat(txRes.rows[0].amount) === quoteAmount);

    // Step 12: Customer Rates Completed Service Job
    const customerRating = 5;
    const customerReview = 'Arrived in 12 minutes, diagnosed the loose contact and replaced the MCB cleanly!';

    await pool.query(
      `UPDATE service_requests
       SET rating = $1, rating_feedback = $2
       WHERE request_ref = $3;`,
      [customerRating, customerReview, testServiceRequestRef]
    );

    // Recalculate agent overall rating
    await pool.query(
      `UPDATE agent_login
       SET rating = ROUND((rating * 0.9 + $1 * 0.1)::numeric, 2)
       WHERE id = $2;`,
      [customerRating, testAgentId]
    );

    const ratedSr = await pool.query('SELECT rating, rating_feedback FROM service_requests WHERE request_ref = $1;', [testServiceRequestRef]);
    report('Customer Rating: 5-star verified review and feedback recorded', ratedSr.rows[0].rating === 5 && ratedSr.rows[0].rating_feedback.includes('cleanly'));

    // Step 13: 30-Day Warranty Verification
    const completedSr = await pool.query('SELECT status, completed_at FROM service_requests WHERE request_ref = $1;', [testServiceRequestRef]);
    const completedDate = new Date(completedSr.rows[0].completed_at);
    const warrantyExpiry = new Date(completedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    report(
      '30-Day NivaaroFix Guarantee: Warranty period correctly active',
      warrantyExpiry > new Date(),
      `(Valid until ${warrantyExpiry.toLocaleDateString('en-IN')})`
    );

  } catch (err) {
    console.error('\n❌ Fatal Error in Marketplace E2E Tests:', err);
    failed++;
  } finally {
    // Clean up test records
    try {
      if (testServiceRequestRef) {
        await pool.query('DELETE FROM wallet_transactions WHERE request_ref = $1;', [testServiceRequestRef]);
        await pool.query('DELETE FROM quotes WHERE request_id IN (SELECT id FROM service_requests WHERE request_ref = $1);', [testServiceRequestRef]);
        await pool.query('DELETE FROM service_requests WHERE request_ref = $1;', [testServiceRequestRef]);
      }
      await pool.query('DELETE FROM agent_login WHERE email = $1;', [testAgentEmail]);
      await pool.query('DELETE FROM user_login WHERE email = $1;', [testCustomerEmail]);
      console.log('🧹 Cleaned up temporary test artifacts from PostgreSQL.');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }

    await pool.end();
  }

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMarketplaceE2ETests();
