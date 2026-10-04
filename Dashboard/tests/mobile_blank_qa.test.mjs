/**
 * Automated Verification for Mobile and DOB Blank State & User Functionality
 * Ensures:
 * 1. Mobile & DOB remain completely blank until user explicitly inputs/selects their own values
 * 2. Database stores NULL when unselected, without falling back to garbage numbers (like 9876543210)
 * 3. Both Customer and Professional (Agent) portals behave identically
 * 4. User can enter their own real phone number, save, clear it, or update profile smoothly
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMobileAndDobBlankTests() {
  console.log('📱 Running Mobile & DOB Blank State & Save Functionality Tests...\n');
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
    // 1. Verify IndianPhoneInput default props
    const phoneInputCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/components/IndianPhoneInput.jsx'), 'utf8');
    report(
      'IndianPhoneInput: Does not default to fake mock phone number placeholder',
      !phoneInputCode.includes('placeholder = "98765 43210"') && phoneInputCode.includes('Enter 10-digit mobile number')
    );
    report(
      'IndianPhoneInput: Default required is false (allows blank submission)',
      phoneInputCode.includes('required = false')
    );

    // 2. Verify CustomerProfilePage.jsx
    const customerCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx'), 'utf8');
    report(
      'CustomerProfilePage: Contains isTestGarbagePhone sanitizer',
      customerCode.includes('function isTestGarbagePhone') && customerCode.includes('9876543210')
    );
    report(
      'CustomerProfilePage: Placeholder is clean without fake phone numbers',
      !customerCode.includes('placeholder="98765 43210"') && customerCode.includes('placeholder="Enter 10-digit mobile number"')
    );
    report(
      'CustomerProfilePage: Mobile field has required={false}',
      customerCode.includes('required={false}')
    );
    report(
      'CustomerProfilePage: Sanitizes phone from URL params and localStorage on mount',
      customerCode.includes('isTestGarbagePhone(parsed?.phone)') && customerCode.includes("setPhone('')")
    );

    // 3. Verify AgentProfilePage.jsx (SAME FOR PROFESSIONAL)
    const agentCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx'), 'utf8');
    report(
      'AgentProfilePage: Contains isTestGarbagePhone sanitizer',
      agentCode.includes('function isTestGarbagePhone') && agentCode.includes('9876543210')
    );
    report(
      'AgentProfilePage: Placeholder is clean without fake phone numbers',
      !agentCode.includes('placeholder="98401 23456"') && agentCode.includes('placeholder="Enter 10-digit mobile number"')
    );
    report(
      'AgentProfilePage: Mobile field has required={false}',
      agentCode.includes('required={false}')
    );
    report(
      'AgentProfilePage: Sanitizes phone from URL params and localStorage on mount',
      agentCode.includes('isTestGarbagePhone(parsed?.phone)') && agentCode.includes("setPhone('')")
    );

    // 4. Verify Backend Auth Routes
    const authRoutesCode = fs.readFileSync(path.join(__dirname, '../../backend/src/routes/authRoutes.js'), 'utf8');
    report(
      'authRoutes: Contains isTestGarbagePhone helper',
      authRoutesCode.includes('function isTestGarbagePhone')
    );
    report(
      'authRoutes: Direct assignment for phone in customer update query (allows nulling out)',
      authRoutesCode.includes('phone = $2')
    );

    // 5. Test Live Backend Customer Profile GET (Database Ground-Truth)
    const getCustomerRes = await fetch('http://localhost:5000/api/auth/customer-profile?email=anjansingh100@gmail.com');
    const customerData = await getCustomerRes.json();
    report(
      'Backend Live DB: Customer phone is NULL (blank on initial load)',
      getCustomerRes.status === 200 && customerData.user.phone === null
    );
    report(
      'Backend Live DB: Customer DOB is NULL (blank on initial load)',
      getCustomerRes.status === 200 && customerData.user.dob === null
    );

    // 6. Test Live Backend Agent Profile GET (Database Ground-Truth)
    const getAgentRes = await fetch('http://localhost:5000/api/auth/agent-profile?email=suresh.electric@nivaarofix.in');
    const agentData = await getAgentRes.json();
    report(
      'Backend Live DB: Professional partner phone is NULL (blank on initial load)',
      getAgentRes.status === 200 && agentData.agent.phone === null
    );
    report(
      'Backend Live DB: Professional partner DOB is NULL (blank on initial load)',
      getAgentRes.status === 200 && agentData.agent.dob === null
    );

    // 7. Test Customer Profile Update with User-Selected Phone & DOB
    const userSelectedPhone = '9123456789';
    const userSelectedDob = { day: '25', month: '12', year: '1995' };
    const updateCustomerRes = await fetch('http://localhost:5000/api/auth/customer-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_profile_test_customer@nivaarofix.test',
        name: 'QA Test Customer',
        phone: `+91 ${userSelectedPhone}`,
        dob: userSelectedDob
      })
    });
    const updateCustomerData = await updateCustomerRes.json();
    report(
      'Backend: Customer successfully updates with genuine user-entered mobile & DOB',
      updateCustomerRes.status === 200 &&
      updateCustomerData.success === true &&
      updateCustomerData.user.phone === `+91 ${userSelectedPhone}` &&
      updateCustomerData.user.dob === '25/12/1995'
    );

    // 8. Test Clearing Phone & DOB back to blank
    const clearCustomerRes = await fetch('http://localhost:5000/api/auth/customer-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_profile_test_customer@nivaarofix.test',
        name: 'QA Test Customer',
        phone: null,
        dob: null
      })
    });
    const clearCustomerData = await clearCustomerRes.json();
    report(
      'Backend: Customer phone and DOB can be cleared back to NULL without error',
      clearCustomerRes.status === 200 &&
      clearCustomerData.success === true &&
      clearCustomerData.user.phone === null &&
      clearCustomerData.user.dob === null
    );

    // 9. Test Agent Profile Update with User-Selected Phone & DOB (SAME FOR PROFESSIONAL)
    const agentSelectedPhone = '9812345678';
    const agentSelectedDob = { day: '14', month: '04', year: '1990' };
    const updateAgentRes = await fetch('http://localhost:5000/api/auth/agent-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_agent_test@nivaarofix.test',
        partnerId: 'FIX-PRO-8894',
        name: 'QA Partner',
        phone: `+91 ${agentSelectedPhone}`,
        dob: agentSelectedDob
      })
    });
    const updateAgentData = await updateAgentRes.json();
    report(
      'Backend: Professional partner successfully updates with genuine user-entered mobile & DOB',
      updateAgentRes.status === 200 &&
      updateAgentData.success === true &&
      updateAgentData.agent.phone === `+91 ${agentSelectedPhone}` &&
      updateAgentData.agent.dob === '14/04/1990'
    );

    // 10. Test Clearing Agent Phone & DOB back to blank
    const clearAgentRes = await fetch('http://localhost:5000/api/auth/agent-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_agent_test@nivaarofix.test',
        partnerId: 'FIX-PRO-8894',
        name: 'QA Partner',
        phone: null,
        dob: null
      })
    });
    const clearAgentData = await clearAgentRes.json();
    report(
      'Backend: Professional partner phone and DOB can be cleared back to NULL without error',
      clearAgentRes.status === 200 &&
      clearAgentData.success === true &&
      clearAgentData.agent.phone === null &&
      clearAgentData.agent.dob === null
    );

  } catch (err) {
    console.error('Fatal test execution error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`Mobile & DOB QA Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runMobileAndDobBlankTests();
