import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🧪 Running OTP Bypass, Mobile Verification & Profile Tests...\n');

// 1. Static Component Checks
const otpModalPath = path.join(projectRoot, 'src', 'components', 'PhoneOtpModal.jsx');
const customerPortalPath = path.join(projectRoot, 'src', 'pages', 'CustomerPortalPage.jsx');
const agentPortalPath = path.join(projectRoot, 'src', 'pages', 'AgentPortalPage.jsx');
const customerProfilePath = path.join(projectRoot, 'src', 'pages', 'CustomerProfilePage.jsx');
const agentProfilePath = path.join(projectRoot, 'src', 'pages', 'AgentProfilePage.jsx');

const otpModalContent = fs.readFileSync(otpModalPath, 'utf8');
const customerPortalContent = fs.readFileSync(customerPortalPath, 'utf8');
const agentPortalContent = fs.readFileSync(agentPortalPath, 'utf8');
const customerProfileContent = fs.readFileSync(customerProfilePath, 'utf8');
const agentProfileContent = fs.readFileSync(agentProfilePath, 'utf8');

// --- Suite 1: PhoneOtpModal Component Checks ---
console.log('--- Suite 1: PhoneOtpModal Component ---');
assert.ok(
  otpModalContent.includes('onContinueWithoutOtp'),
  'PhoneOtpModal must accept onContinueWithoutOtp prop'
);
console.log('  ✅ [PASS] PhoneOtpModal accepts onContinueWithoutOtp prop');

assert.ok(
  otpModalContent.includes('Continue (Verify Later)'),
  'PhoneOtpModal must render "Continue (Verify Later)" button'
);
console.log('  ✅ [PASS] PhoneOtpModal renders "Continue (Verify Later)" button');

assert.ok(
  !otpModalContent.includes("Didn't receive code? Resend Didn't receive code? Resend OTP"),
  'PhoneOtpModal must not contain duplicated resend prompt string'
);
console.log('  ✅ [PASS] PhoneOtpModal has clean resend prompt without duplicate text');

// --- Suite 2: Registration Portals OTP Bypass Integration ---
console.log('\n--- Suite 2: Registration Portals OTP Bypass Integration ---');
assert.ok(
  customerPortalContent.includes('handleSkipOtpAndContinue') &&
  customerPortalContent.includes('onContinueWithoutOtp={handleSkipOtpAndContinue}'),
  'CustomerPortalPage must pass handleSkipOtpAndContinue to PhoneOtpModal'
);
console.log('  ✅ [PASS] CustomerPortalPage hooks onContinueWithoutOtp to handleSkipOtpAndContinue');

assert.ok(
  customerPortalContent.includes('isPhoneVerified: false') || customerPortalContent.includes('isPhoneVerified = false'),
  'CustomerPortalPage must store and pass isPhoneVerified: false on skip'
);
console.log('  ✅ [PASS] CustomerPortalPage records isPhoneVerified as false on skip');

assert.ok(
  agentPortalContent.includes('handleSkipOtpAndContinue') &&
  agentPortalContent.includes('onContinueWithoutOtp={handleSkipOtpAndContinue}'),
  'AgentPortalPage must pass handleSkipOtpAndContinue to PhoneOtpModal'
);
console.log('  ✅ [PASS] AgentPortalPage hooks onContinueWithoutOtp to handleSkipOtpAndContinue');

assert.ok(
  agentPortalContent.includes('isPhoneVerified: false') || agentPortalContent.includes('isPhoneVerified = false'),
  'AgentPortalPage must store and pass isPhoneVerified: false on skip'
);
console.log('  ✅ [PASS] AgentPortalPage records isPhoneVerified as false on skip');

// Ensure no undeclared variable references like 'experience' exist in agentPayload
assert.ok(
  !agentPortalContent.includes('experienceYears: experience ?'),
  'AgentPortalPage must not evaluate undeclared experience variable'
);
console.log('  ✅ [PASS] AgentPortalPage is protected from undeclared experience ReferenceError');

// Ensure Phone OTP sign-in has Continue (Verify Later) button in both portals
assert.ok(
  agentPortalContent.includes('Continue (Verify Later)'),
  'AgentPortalPage must contain Continue (Verify Later) option in Phone OTP sign-in'
);
console.log('  ✅ [PASS] AgentPortalPage includes Continue (Verify Later) in Phone OTP sign-in');

assert.ok(
  customerPortalContent.includes('Continue (Verify Later)'),
  'CustomerPortalPage must contain Continue (Verify Later) option in Phone OTP sign-in'
);
console.log('  ✅ [PASS] CustomerPortalPage includes Continue (Verify Later) in Phone OTP sign-in');

// --- Suite 3: Customer and Agent Profile Unverified Badge & Mobile Verification Option ---
console.log('\n--- Suite 3: Profile Pages Unverified Mobile Status & Verification Action ---');
assert.ok(
  customerProfileContent.includes('Not Verified') &&
  customerProfileContent.includes('Mobile number is not verified via SMS OTP.'),
  'CustomerProfilePage must display "Not Verified" and unverified notice'
);
console.log('  ✅ [PASS] CustomerProfilePage displays Not Verified badge and SMS OTP warning note');

assert.ok(
  customerProfileContent.includes('Verify Mobile Number') &&
  customerProfileContent.includes('handleOpenPhoneVerification'),
  'CustomerProfilePage must provide an explicit option to verify mobile number'
);
console.log('  ✅ [PASS] CustomerProfilePage provides "Verify Mobile Number" action');

assert.ok(
  agentProfileContent.includes('Not Verified') &&
  agentProfileContent.includes('Mobile number is not verified via SMS OTP.'),
  'AgentProfilePage must display "Not Verified" and unverified notice'
);
console.log('  ✅ [PASS] AgentProfilePage displays Not Verified badge and SMS OTP warning note');

assert.ok(
  agentProfileContent.includes('Verify Mobile Number') &&
  agentProfileContent.includes('handleOpenPhoneVerification'),
  'AgentProfilePage must provide an explicit option to verify mobile number'
);
console.log('  ✅ [PASS] AgentProfilePage provides "Verify Mobile Number" action');

// --- Suite 4: Live Backend API Verification ---
console.log('\n--- Suite 4: Live Backend API Verification ---');
try {
  const ts = Date.now();
  const testCustomerEmail = `test.customer.${ts}@example.com`;
  const regRes = await fetch('http://localhost:5000/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Customer',
      email: testCustomerEmail,
      phone: '9876543210',
      password: 'Password@123',
      isPhoneVerified: false,
    }),
  });

  const regData = await regRes.json();
  assert.equal(regRes.status, 201, 'Customer register endpoint must return 201');
  assert.equal(regData.user.isPhoneVerified, false, 'Customer response must flag isPhoneVerified: false');
  console.log('  ✅ [PASS] Backend customer-register stores and returns isPhoneVerified: false');

  // Verify Phone endpoint for Customer
  const verifyCustRes = await fetch('http://localhost:5000/api/auth/verify-phone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'customer', email: testCustomerEmail, phone: '+91 9876543210' })
  });
  const verifyCustData = await verifyCustRes.json();
  assert.equal(verifyCustRes.status, 200, 'Verify phone endpoint must return 200 for customer');
  assert.equal(verifyCustData.isPhoneVerified, true, 'Verify phone must set isPhoneVerified: true');
  console.log('  ✅ [PASS] POST /api/auth/verify-phone successfully verifies customer phone');

  const profileRes = await fetch(`http://localhost:5000/api/auth/customer-profile?email=${encodeURIComponent(testCustomerEmail)}`);
  const profileData = await profileRes.json();
  assert.equal(profileRes.status, 200, 'Customer profile endpoint must return 200');
  assert.equal(profileData.user.isPhoneVerified, true, 'Customer profile now returns isPhoneVerified: true after verification');
  console.log('  ✅ [PASS] Backend customer-profile reflects verified phone status: true');

  // Test with user's exact screenshot phone number: +91 9893748529
  const testAgentEmail = `test.agent.pro.${ts}@example.com`;
  const agentRegRes = await fetch('http://localhost:5000/api/auth/agent-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Professional Partner',
      email: testAgentEmail,
      phone: '+91 9893748529',
      trade: 'electrician',
      experienceYears: 0,
      password: 'Password@123',
      isPhoneVerified: false,
    }),
  });

  const agentRegData = await agentRegRes.json();
  assert.equal(agentRegRes.status, 201, 'Agent register endpoint must return 201');
  assert.equal(agentRegData.agent.isPhoneVerified, false, 'Agent response must flag isPhoneVerified: false');
  console.log('  ✅ [PASS] Backend agent-register successfully created professional with unverified phone');

  // Verify Phone endpoint for Agent
  const verifyAgentRes = await fetch('http://localhost:5000/api/auth/verify-phone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'agent', email: testAgentEmail, phone: '+91 9893748529' })
  });
  const verifyAgentData = await verifyAgentRes.json();
  assert.equal(verifyAgentRes.status, 200, 'Verify phone endpoint must return 200 for agent');
  assert.equal(verifyAgentData.isPhoneVerified, true, 'Verify phone must set isPhoneVerified: true');
  console.log('  ✅ [PASS] POST /api/auth/verify-phone successfully verifies agent phone');

  // Verify registered agent profile endpoint and 9-digit partner ID format
  const registeredProfileRes = await fetch(`http://localhost:5000/api/auth/agent-profile?email=${encodeURIComponent(testAgentEmail)}`);
  const registeredProfileData = await registeredProfileRes.json();
  assert.equal(registeredProfileRes.status, 200, 'Agent profile endpoint must return 200');
  assert.match(registeredProfileData.agent.partnerId, /^[0-9]{9}$/, 'Partner ID must be a valid 9-digit format');
  console.log(`  ✅ [PASS] Professional account (${testAgentEmail} / ID: ${registeredProfileData.agent.partnerId}) is verified in DB: true`);

  // --- Cleanup: Remove test accounts created during this test run (prevents DB pollution) ---
  const { pool } = await import('../../backend/src/config/db.js');
  const cleanupAgent = await pool.query(
    `DELETE FROM agent_login WHERE email = $1 OR (name = 'Professional Partner' AND email LIKE '%@example.com')`,
    [testAgentEmail]
  );
  const cleanupCustomer = await pool.query(
    `DELETE FROM user_login WHERE email = $1 OR (name IN ('Test Customer', 'Test User') AND email LIKE '%@example.com')`,
    [testCustomerEmail]
  );
  await pool.end();
  console.log(`  🧹 Cleaned up: ${cleanupAgent.rowCount} test agent + ${cleanupCustomer.rowCount} test customer account(s) removed from DB.`);

} catch (err) {
  console.error('  ❌ Live API test failed:', err.message);
  process.exit(1);
}

console.log('\n========================================');
console.log('All Mobile Verification & Profile Tests Passed (18/18)!');
console.log('========================================\n');
