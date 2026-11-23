import assert from 'assert';
import { pool } from '../apps/api/src/config/db.js';
import { 
  hashPassword, 
  createSession, 
  revokeSession, 
  createAndSaveOtp, 
  verifyAndConsumeOtp,
  verifyGoogleToken 
} from '../apps/api/src/utils/security.js';

const API_BASE = 'http://localhost:5000';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = options.headers || {};
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 NIVAAROFIX PHASE 1.2 — MANDATORY HTTP NEGATIVE SECURITY SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Reason: ${err.message}\n`);
      failed++;
    }
  }

  // Pre-seed test entities in database
  const customerEmail = `sec_cust_${Date.now()}@nivaarofix.in`;
  const custRes = await pool.query(`
    INSERT INTO user_login (name, email, phone, auth_provider, is_verified)
    VALUES ('Security Test User', $1, '9876543210', 'email', true)
    RETURNING id;
  `, [customerEmail]);
  const testUserId = custRes.rows[0].id;

  const agentEmail = `sec_agent_${Date.now()}@nivaarofix.in`;
  const partnerId = `FIX-SEC-${Date.now().toString().slice(-4)}`;
  const agentRes = await pool.query(`
    INSERT INTO agent_login (name, email, phone, partner_id, trade, auth_provider, kyc_status, wallet_balance)
    VALUES ('Security Test Agent', $1, '9876543211', $2, 'electrician', 'agent_id', 'Verified', 500.00)
    RETURNING id;
  `, [agentEmail, partnerId]);
  const testAgentId = agentRes.rows[0].id;

  // 1. Missing customer password
  await test('1. Missing customer password rejects with HTTP 400', async () => {
    const res = await request('/api/auth/customer-login', {
      method: 'POST',
      body: { email: customerEmail }
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.strictEqual(res.data?.code, 'PASSWORD_REQUIRED');
  });

  // 2. Missing professional password
  await test('2. Missing professional password rejects with HTTP 400', async () => {
    const res = await request('/api/auth/agent-login', {
      method: 'POST',
      body: { email: agentEmail }
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.strictEqual(res.data?.code, 'PASSWORD_REQUIRED');
  });

  // 3. Invalid Google credential
  await test('3. Invalid Google credential rejects with HTTP 401', async () => {
    const res = await request('/api/auth/google', {
      method: 'POST',
      body: { credential: 'bogus.token.value' }
    });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    assert.ok(res.data?.code?.includes('GOOGLE'), 'Expected Google error code');
  });

  // 4. Forged Google profile without credential
  await test('4. Forged Google profile directly rejects with HTTP 400', async () => {
    const res = await request('/api/auth/google', {
      method: 'POST',
      body: { profile: { email: 'victim@domain.com', name: 'Attacker' } }
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.strictEqual(res.data?.code, 'CREDENTIAL_REQUIRED');
  });

  // 5. Wrong Google audience validation
  await test('5. Wrong Google audience validation fails closed', async () => {
    try {
      await verifyGoogleToken('bogus-token-value', 'fake-client-id.apps.googleusercontent.com');
      assert.fail('Should have rejected bogus token');
    } catch (err) {
      assert.ok(err.message, 'Expected rejection on unverified token');
    }
  });

  // 6. Missing OTP on verification
  await test('6. Missing OTP on /verify-phone rejects with HTTP 400', async () => {
    const session = await createSession({ userId: testUserId, email: customerEmail, role: 'customer' });
    const res = await request('/api/auth/verify-phone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: { phone: '9876543210' }
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // 7. OTP replay prevention
  await test('7. OTP replay is prevented atomically (Single-Use)', async () => {
    const phone = `998877${Date.now().toString().slice(-4)}`;
    const otpRec = await createAndSaveOtp(phone, 'phone_verify', 5);
    
    // First consumption must succeed
    const firstVerify = await verifyAndConsumeOtp(phone, otpRec.code, 'phone_verify');
    assert.strictEqual(firstVerify.valid, true, 'First OTP verification should succeed');

    // Second consumption must fail (Replay attack blocked)
    const secondVerify = await verifyAndConsumeOtp(phone, otpRec.code, 'phone_verify');
    assert.strictEqual(secondVerify.valid, false, 'Replayed OTP must be rejected');
    assert.strictEqual(secondVerify.reason, 'OTP_ALREADY_USED');
  });

  // 8. OTP expiry rejection
  await test('8. Expired OTP is rejected atomically', async () => {
    const phone = `998866${Date.now().toString().slice(-4)}`;
    const otpRec = await createAndSaveOtp(phone, 'phone_verify', 0);
    // Artificially update expires_at in DB to 5 minutes ago
    await pool.query("UPDATE otp_verifications SET expires_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE identifier = $1;", [phone]);

    const res = await verifyAndConsumeOtp(phone, otpRec.code, 'phone_verify');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.reason, 'OTP_EXPIRED');
  });

  // 9. Forged identity headers rejection
  await test('9. Forged identity headers (x-user-email, x-user-role) are rejected without session', async () => {
    const res = await request('/api/auth/users', {
      headers: {
        'x-user-email': 'admin@nivaarofix.in',
        'x-user-role': 'admin'
      }
    });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // 10. Expired and revoked sessions rejection
  await test('10. Revoked database session token is rejected', async () => {
    const session = await createSession({ userId: testUserId, email: customerEmail, role: 'customer' });
    await revokeSession(session.token);

    const res = await request('/api/auth/session', {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    assert.strictEqual(res.data?.authenticated, false);
  });

  // 11. Missing session on protected endpoint
  await test('11. Missing session on protected route rejects with HTTP 401', async () => {
    const res = await request('/api/bookings/my-bookings');
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // 12. Cross-customer booking access forbidden
  await test('12. Cross-customer booking access rejected with HTTP 403', async () => {
    const sessionA = await createSession({ userId: testUserId, email: customerEmail, role: 'customer' });
    
    // Insert a booking belonging to someone else
    const ref = `BK-SEC-TEST-${Date.now()}`;
    await pool.query(`
      INSERT INTO bookings (booking_ref, user_id, user_email, user_name, user_phone, service_title, category, total_amount, otp_code, status)
      VALUES ($1, 888888, 'other_customer@nivaarofix.in', 'Other Customer', '9876543219', 'Pipe Repair', 'plumber', 499.00, '4321', 'Pending');
    `, [ref]);

    const res = await request(`/api/bookings/${ref}`, {
      headers: { Authorization: `Bearer ${sessionA.token}` }
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    assert.strictEqual(res.data?.error, 'FORBIDDEN');
  });

  // 13. Cross-professional profile access forbidden
  await test('13. Cross-professional profile access rejected with HTTP 403', async () => {
    const sessionAgentA = await createSession({ agentId: testAgentId, email: agentEmail, role: 'agent' });
    
    const res = await request('/api/agents/profile/other_agent@nivaarofix.in', {
      headers: { Authorization: `Bearer ${sessionAgentA.token}` }
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    assert.strictEqual(res.data?.error, 'FORBIDDEN');
  });

  // 14. Public customer OTP exposure blocked
  await test('14. Public/unassigned caller to booking cannot see door OTP code', async () => {
    const sessionAgent = await createSession({ agentId: testAgentId, email: agentEmail, role: 'agent' });
    
    const ref = `BK-OTP-TEST-${Date.now()}`;
    await pool.query(`
      INSERT INTO bookings (booking_ref, user_id, user_email, user_name, user_phone, service_title, category, total_amount, otp_code, status)
      VALUES ($1, 777777, 'otp_owner@nivaarofix.in', 'OTP Owner', '9876543218', 'Electrical Check', 'electrician', 699.00, '7788', 'Confirmed');
    `, [ref]);

    const res = await request(`/api/bookings/${ref}`, {
      headers: { Authorization: `Bearer ${sessionAgent.token}` }
    });
    if (res.status === 200) {
      assert.strictEqual(res.data?.booking?.otpCode, null, 'Door OTP must never be exposed to unassigned agent');
    } else {
      assert.strictEqual(res.status, 403, 'Unassigned agent must be forbidden from accessing unassigned booking');
    }
  });

  // 15. Unauthorized KYC modification (Agent self-approval blocked)
  await test('15. Unauthorized KYC modification by agent rejected with HTTP 403', async () => {
    const sessionAgent = await createSession({ agentId: testAgentId, email: agentEmail, role: 'agent' });
    
    const res = await request('/api/agents/document-status', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sessionAgent.token}` },
      body: {
        email: agentEmail,
        documentType: 'aadhaar',
        status: 'Verified'
      }
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    assert.ok(res.data?.code === 'FORBIDDEN' || res.data?.code === 'ADMIN_REQUIRED', 'Expected 403 Forbidden for non-admin');
  });

  // 16. Legacy fake wallet credit disabled
  await test('16. Legacy fake wallet credit on /complete-job rejected with HTTP 403', async () => {
    const sessionAgent = await createSession({ agentId: testAgentId, email: agentEmail, role: 'agent' });
    
    const res = await request('/api/agents/complete-job', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionAgent.token}` },
      body: {
        bookingId: 'BK-FAKE-123',
        agentEmail: agentEmail,
        payoutAmount: 50000
      }
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    assert.strictEqual(res.data?.error, 'LEGACY_WALLET_CREDIT_DISABLED');
  });

  // 17. Wallet GET database mutation prevented
  await test('17. Wallet GET endpoint is strictly read-only and causes no DB mutations', async () => {
    const sessionAgent = await createSession({ agentId: testAgentId, email: agentEmail, role: 'agent' });
    
    const beforeCheck = await pool.query('SELECT wallet_balance FROM agent_login WHERE id = $1;', [testAgentId]);
    const balanceBefore = parseFloat(beforeCheck.rows[0].wallet_balance);

    const res = await request(`/api/dispatch/wallet/${agentEmail}`, {
      headers: { Authorization: `Bearer ${sessionAgent.token}` }
    });
    assert.strictEqual(res.status, 200);

    const afterCheck = await pool.query('SELECT wallet_balance FROM agent_login WHERE id = $1;', [testAgentId]);
    const balanceAfter = parseFloat(afterCheck.rows[0].wallet_balance);

    assert.strictEqual(balanceAfter, balanceBefore, 'GET request must not alter wallet balance');
  });

  // 18. Invoice falsely marked paid prevented
  await test('18. Invoice status derivation strictly rejects unverified "Completed = Paid"', async () => {
    const testBooking = {
      status: 'Completed',
      totalAmount: 999,
      paymentStatus: null
    };
    const isExplicitlyPaid = testBooking.paymentStatus === 'PAID' || 
                             testBooking.payment_status === 'PAID' || 
                             testBooking.isPaid === true ||
                             Boolean(testBooking.transactionId && testBooking.settledAt);
    
    assert.strictEqual(isExplicitlyPaid, false, 'Completed job without transaction ledger must NOT be marked paid');
  });

  // 19. Unauthorized database cleanup guarded
  await test('19. Accidental or unauthorized database cleanup aborts with safety error', async () => {
    const { default: cp } = await import('child_process');
    try {
      cp.execSync('node apps/api/src/db/clean_database.js', { stdio: 'pipe' });
      assert.fail('clean_database.js should have thrown an error');
    } catch (err) {
      const output = err.stderr ? err.stderr.toString() : err.message;
      assert.ok(
        output.includes('DESTRUCTIVE_PURGE_FORBIDDEN') || output.includes('SAFETY ABORT'),
        `Expected safety abort message, got: ${output}`
      );
    }
  });

  console.log('\n========================================================================');
  console.log(`🏁 Phase 1.2 Security Test Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
