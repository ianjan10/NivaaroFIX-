import { pool } from '../src/config/db.js';

async function runOAuthBackendTests() {
  console.log('🧪 Running Backend Google OAuth & JWT Decoder Tests...\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  try {
    // 1. Customer OAuth
    const custRes = await fetch('http://localhost:5000/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'customer',
        profile: {
          name: 'Priya Patel',
          email: 'priya.patel.backendtest@gmail.com',
          picture: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
          sub: 'google-sub-priya-01'
        }
      })
    });
    const custData = await custRes.json();
    report('Customer Google OAuth endpoint returns HTTP 200', custRes.status === 200);
    report('Customer Google OAuth success is true', custData.success === true);
    report('Customer email matches Google profile', custData.user?.email === 'priya.patel.backendtest@gmail.com');

    // 2. Partner OAuth
    const partRes = await fetch('http://localhost:5000/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'agent',
        trade: 'both',
        profile: {
          name: 'Rajesh Verma',
          email: 'rajesh.verma.backendtest@gmail.com',
          picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          sub: 'google-sub-rajesh-02'
        }
      })
    });
    const partData = await partRes.json();
    report('Partner Google OAuth endpoint returns HTTP 200', partRes.status === 200);
    report('Partner Google OAuth generated partner_id', Boolean(partData.agent?.partnerId && (partData.agent.partnerId.startsWith('FIX-PRO-') || /^\d{9}$/.test(partData.agent.partnerId))));

    // 3. JWT Token Base64Url Payload Decoding
    const mockPayload = {
      sub: 'google-jwt-test-999',
      name: 'Karan Mehra',
      email: 'karan.mehra.jwt@gmail.com',
      picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      email_verified: true
    };
    const mockJwt = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(mockPayload)).toString('base64url')}.mockSignature`;
    const jwtRes = await fetch('http://localhost:5000/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'customer',
        credential: mockJwt
      })
    });
    const jwtData = await jwtRes.json();
    report('JWT Token decoding successfully extracts email and name', jwtData.user?.email === 'karan.mehra.jwt@gmail.com');

    // 4. PostgreSQL Database Row Query
    const dbQuery = await pool.query("SELECT * FROM user_login WHERE email = 'priya.patel.backendtest@gmail.com'");
    report('PostgreSQL user_login record persisted with auth_provider = google', dbQuery.rows.length === 1 && dbQuery.rows[0].auth_provider === 'google');

    console.log(`\n========================================`);
    console.log(`OAuth Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal backend test error:', err);
    process.exit(1);
  } finally {
    try {
      await pool.query("DELETE FROM user_login WHERE email IN ('priya.patel.backendtest@gmail.com', 'karan.mehra.jwt@gmail.com')");
      await pool.query("DELETE FROM agent_login WHERE email = 'rajesh.verma.backendtest@gmail.com'");
    } catch {
      // Non-blocking cleanup
    }
    await pool.end();
  }
}

runOAuthBackendTests();
