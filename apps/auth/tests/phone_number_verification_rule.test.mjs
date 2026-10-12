/**
 * Test Suite: Specific Phone Number Verification Rules
 * Verifies:
 * 1. Number 8934678924 is verified across Agent and Customer profiles
 * 2. Any other number requires verification (Not Verified badge, SMS OTP warning, Verify button)
 * 3. PostgreSQL database and backend endpoints return isPhoneVerified: true for 8934678924
 * 4. Other numbers default to isPhoneVerified: false unless verified via OTP
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🧪 Running Specific Phone Number Verification Rules Tests...\n');

const agentProfilePath = path.join(projectRoot, 'src', 'pages', 'AgentProfilePage.jsx');
const customerProfilePath = path.join(projectRoot, 'src', 'pages', 'CustomerProfilePage.jsx');
const authRoutesPath = path.resolve(projectRoot, '..', 'api', 'src', 'routes', 'authRoutes.js');

const agentProfileContent = fs.readFileSync(agentProfilePath, 'utf8');
const customerProfileContent = fs.readFileSync(customerProfilePath, 'utf8');
const authRoutesContent = fs.readFileSync(authRoutesPath, 'utf8');

// --- Suite 1: Agent Profile Verification Rules ---
console.log('--- Suite 1: AgentProfilePage Verification Logic ---');

assert.ok(
  agentProfileContent.includes("cleanPhone(phone) === '8934678924'"),
  'AgentProfilePage must recognize 8934678924 as the designated verified number'
);
console.log('  ✅ [PASS] AgentProfilePage recognizes 8934678924 as verified');

assert.ok(
  agentProfileContent.includes('isPhoneVerified ? (') &&
  agentProfileContent.includes('phone-status-badge verified') &&
  agentProfileContent.includes('phone-status-badge unverified'),
  'AgentProfilePage must toggle verified vs unverified badge based on isPhoneVerified'
);
console.log('  ✅ [PASS] AgentProfilePage displays Verified badge for 8934678924, Not Verified for others');

assert.ok(
  agentProfileContent.includes('!isPhoneVerified && (') &&
  agentProfileContent.includes('Mobile number is not verified via SMS OTP.'),
  'AgentProfilePage must display SMS OTP warning only when phone is not verified'
);
console.log('  ✅ [PASS] AgentProfilePage displays warning & Verify button only when not verified');

// --- Suite 2: Customer Profile Verification Rules ---
console.log('\n--- Suite 2: CustomerProfilePage Verification Logic ---');

assert.ok(
  customerProfileContent.includes("cleanPhone(phone) === '8934678924'"),
  'CustomerProfilePage must recognize 8934678924 as verified'
);
console.log('  ✅ [PASS] CustomerProfilePage recognizes 8934678924 as verified');

assert.ok(
  customerProfileContent.includes('phone-status-badge verified') &&
  customerProfileContent.includes('phone-status-badge unverified'),
  'CustomerProfilePage must toggle status badges based on phone'
);
console.log('  ✅ [PASS] CustomerProfilePage displays Verified for 8934678924, Not Verified for others');

// --- Suite 3: Backend API Endpoints ---
console.log('\n--- Suite 3: Backend API Endpoints ---');

assert.ok(
  authRoutesContent.includes("includes('8934678924')"),
  'authRoutes must treat 8934678924 as verified'
);
console.log('  ✅ [PASS] authRoutes provides isPhoneVerified: true for 8934678924');

// --- Suite 4: Live Backend API Verification ---
console.log('\n--- Suite 4: Live Backend API Verification ---');
await fetch('http://localhost:5000/api/auth/agent-register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Rahul Kumar',
    email: 'rahulkumar@gmail.com',
    phone: '8934678924',
    trade: 'electrician'
  })
});
const response = await fetch('http://localhost:5000/api/auth/agent-profile?email=rahulkumar@gmail.com');
const data = await response.json();

assert.ok(data.success && data.agent, 'Live API must return Rahul agent record');
assert.equal(data.agent.isPhoneVerified, true, '8934678924 must be verified in live API');
console.log('  ✅ [PASS] Live API verifies 8934678924: isPhoneVerified = true');

// Verify that an unverified number returns isPhoneVerified: false
const unverifiedRes = await fetch('http://localhost:5000/api/auth/agent-profile?email=qa_agent_test@nivaarofix.test');
const unverifiedData = await unverifiedRes.json();
if (unverifiedData.success && unverifiedData.agent) {
  assert.equal(unverifiedData.agent.isPhoneVerified, false, 'Other numbers must remain isPhoneVerified: false');
  console.log('  ✅ [PASS] Live API verifies other partner: isPhoneVerified = false');
}

console.log('\n========================================');
console.log('Phone Number Verification Rules: All Tests Passed!');
console.log('========================================\n');
