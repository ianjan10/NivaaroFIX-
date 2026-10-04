import { pool } from '../src/config/db.js';

async function runPostgresCrudTests() {
  console.log('🧪 Running PostgreSQL Customer & Agent Auth Strict CRUD & Verification Tests...\n');

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

  const timestamp = Date.now();
  const testCustomerEmail = `customer_${timestamp}@example.com`;
  const testAgentEmail = `agent_${timestamp}@nivaarofix.pro`;
  const nonExistentEmail = `unknown_${timestamp}@notfound.com`;

  try {
    // 1. Strict check: Non-existent customer should return 404 USER_NOT_FOUND
    const notFoundCustRes = await fetch('http://localhost:5000/api/auth/customer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nonExistentEmail })
    });
    const notFoundCustData = await notFoundCustRes.json();
    report('Non-existent Customer returns 404 & USER_NOT_FOUND code', notFoundCustRes.status === 404 && notFoundCustData.code === 'USER_NOT_FOUND');

    // 2. Strict check: Non-existent agent should return 404 AGENT_NOT_FOUND
    const notFoundAgentRes = await fetch('http://localhost:5000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIdOrEmail: nonExistentEmail })
    });
    const notFoundAgentData = await notFoundAgentRes.json();
    report('Non-existent Partner returns 404 & AGENT_NOT_FOUND code', notFoundAgentRes.status === 404 && notFoundAgentData.code === 'AGENT_NOT_FOUND');

    // 3. Register Customer (Real registration)
    const custRegRes = await fetch('http://localhost:5000/api/auth/customer-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Vikas Sharma',
        email: testCustomerEmail,
        phone: '9876543210',
        dob: '15/08/1995',
        state: 'Maharashtra',
        city: 'Mumbai',
        password: 'Password123'
      })
    });
    const custRegData = await custRegRes.json();
    report('Customer registered in PostgreSQL user_login table', custRegData.success === true && custRegData.user?.email === testCustomerEmail);

    // 4. Login Verified Customer
    const custLoginRes = await fetch('http://localhost:5000/api/auth/customer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testCustomerEmail,
        password: 'Password123'
      })
    });
    const custLoginData = await custLoginRes.json();
    report('Verified Customer authenticated from PostgreSQL user_login table', custLoginData.success === true && custLoginData.user?.name === 'Vikas Sharma');

    // 5. Register Agent (Real registration)
    const agentRegRes = await fetch('http://localhost:5000/api/auth/agent-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ramesh Patel',
        email: testAgentEmail,
        phone: '9876543211',
        trade: 'both',
        experienceYears: 7,
        state: 'Gujarat',
        city: 'Ahmedabad',
        password: 'PartnerPass123'
      })
    });
    const agentRegData = await agentRegRes.json();
    report('Agent registered in PostgreSQL agent_login table with partnerId', agentRegData.success === true && agentRegData.agent?.partnerId);

    // 6. Login Verified Agent
    const agentLoginRes = await fetch('http://localhost:5000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testAgentEmail,
        password: 'PartnerPass123'
      })
    });
    const agentLoginData = await agentLoginRes.json();
    report('Verified Agent authenticated from PostgreSQL agent_login table', agentLoginData.success === true && agentLoginData.agent?.name === 'Ramesh Patel');

    console.log(`\n========================================`);
    console.log(`CRUD Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('CRUD test error:', err);
    process.exit(1);
  } finally {
    try {
      await pool.query("DELETE FROM user_login WHERE email = $1", [testCustomerEmail]);
      await pool.query("DELETE FROM agent_login WHERE email = $1", [testAgentEmail]);
    } catch {
      // Non-blocking cleanup
    }
    await pool.end();
  }
}

runPostgresCrudTests();
