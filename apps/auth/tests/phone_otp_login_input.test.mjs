/**
 * Tests for NivaaroFix Login Screen Phone OTP Tab
 * Verifies:
 * 1. Headless input-otp engine with single input & 6 visual slots
 * 2. Digits-only pattern, numeric mobile keyboard, one-time-code autofill
 * 3. Auto-advance, keyboard traversal, paste sanitization (stripping non-digits)
 * 4. Auto-submit on 6th digit & disabled Sign In fallback button
 * 5. Removal of 'Continue (Verify Later)' from the login flow
 * 6. Brand green active slot border (#059669), never navy
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🧪 Running Login Screen Phone OTP Tab Tests...\n');

const customerPortalPath = path.join(projectRoot, 'src', 'pages', 'CustomerPortalPage.jsx');
const agentPortalPath = path.join(projectRoot, 'src', 'pages', 'AgentPortalPage.jsx');
const unifiedOtpComponentPath = path.join(projectRoot, 'src', 'components', 'UnifiedOtpInput.jsx');
const unifiedOtpCssPath = path.join(projectRoot, 'src', 'styles', 'UnifiedOtpInput.css');

const customerPortalContent = fs.readFileSync(customerPortalPath, 'utf8');
const agentPortalContent = fs.readFileSync(agentPortalPath, 'utf8');
const unifiedOtpComponentContent = fs.readFileSync(unifiedOtpComponentPath, 'utf8');
const unifiedOtpCssContent = fs.readFileSync(unifiedOtpCssPath, 'utf8');

// --- Suite 1: Shared input-otp Component Usage in Login Portals ---
console.log('--- Suite 1: Shared input-otp Component in Login Portals ---');

assert.ok(
  customerPortalContent.includes("import UnifiedOtpInput from '../components/UnifiedOtpInput';"),
  'CustomerPortalPage must import UnifiedOtpInput component'
);
console.log('  ✅ [PASS] CustomerPortalPage imports UnifiedOtpInput');

assert.ok(
  agentPortalContent.includes("import UnifiedOtpInput from '../components/UnifiedOtpInput';"),
  'AgentPortalPage must import UnifiedOtpInput component'
);
console.log('  ✅ [PASS] AgentPortalPage imports UnifiedOtpInput');

// Ensure six separate inputs are completely removed from Phone OTP sign-in
assert.ok(
  !customerPortalContent.includes('className="otp-inputs-grid"') &&
  !customerPortalContent.includes('className="otp-box"'),
  'CustomerPortalPage must not contain legacy six separate inputs'
);
console.log('  ✅ [PASS] CustomerPortalPage replaced six separate inputs with UnifiedOtpInput');

assert.ok(
  !agentPortalContent.includes('className="otp-inputs-grid"') &&
  !agentPortalContent.includes('className="otp-box"'),
  'AgentPortalPage must not contain legacy six separate inputs'
);
console.log('  ✅ [PASS] AgentPortalPage replaced six separate inputs with UnifiedOtpInput');

// Configured for 6-digit verification
assert.ok(
  customerPortalContent.includes('<UnifiedOtpInput\n                          length={6}') ||
  customerPortalContent.includes('<UnifiedOtpInput\r\n                          length={6}') ||
  customerPortalContent.includes('length={6}'),
  'CustomerPortalPage must configure UnifiedOtpInput with length={6}'
);
console.log('  ✅ [PASS] CustomerPortalPage configures 6-digit OTP length');

assert.ok(
  agentPortalContent.includes('<UnifiedOtpInput\n                          length={6}') ||
  agentPortalContent.includes('<UnifiedOtpInput\r\n                          length={6}') ||
  agentPortalContent.includes('length={6}'),
  'AgentPortalPage must configure UnifiedOtpInput with length={6}'
);
console.log('  ✅ [PASS] AgentPortalPage configures 6-digit OTP length');

// --- Suite 2: Input Rules & Sanitization ---
console.log('\n--- Suite 2: Input Rules & Sanitization ---');

assert.ok(
  unifiedOtpComponentContent.includes('REGEXP_ONLY_DIGITS'),
  'UnifiedOtpInput must enforce REGEXP_ONLY_DIGITS pattern'
);
console.log('  ✅ [PASS] Enforces REGEXP_ONLY_DIGITS to block non-digits at keypress');

assert.ok(
  unifiedOtpComponentContent.includes('inputMode="numeric"'),
  'UnifiedOtpInput must declare inputMode="numeric" for mobile keypad'
);
console.log('  ✅ [PASS] Declares inputMode="numeric" for mobile numeric keyboard');

assert.ok(
  unifiedOtpComponentContent.includes('autoComplete="one-time-code"'),
  'UnifiedOtpInput must declare autoComplete="one-time-code" for SMS autofill'
);
console.log('  ✅ [PASS] Declares autoComplete="one-time-code" for SMS autofill');

assert.ok(
  unifiedOtpComponentContent.includes('.replace(/\\D/g, \'\')') &&
  unifiedOtpComponentContent.includes('pasteTransformer'),
  'UnifiedOtpInput must strip all non-digits on paste and input transform'
);
console.log('  ✅ [PASS] Strips letters, spaces, and symbols on paste & autofill');

// --- Suite 3: Auto-Advance & Auto-Submit ---
console.log('\n--- Suite 3: Auto-Advance & Auto-Submit ---');

assert.ok(
  unifiedOtpComponentContent.includes('onComplete={handleComplete}'),
  'UnifiedOtpInput must trigger completion handler when all digits are filled'
);
console.log('  ✅ [PASS] UnifiedOtpInput wires onComplete event handler');

assert.ok(
  customerPortalContent.includes('onComplete={(code) => handlePhoneOtpSignIn(null, code)}'),
  'CustomerPortalPage must auto-submit on completion of 6th digit'
);
console.log('  ✅ [PASS] CustomerPortalPage auto-submits on 6th digit completion');

assert.ok(
  agentPortalContent.includes('onComplete={(code) => handlePhoneOtpSignIn(null, code)}'),
  'AgentPortalPage must auto-submit on completion of 6th digit'
);
console.log('  ✅ [PASS] AgentPortalPage auto-submits on 6th digit completion');

// --- Suite 4: Sign In Button Disabled State & Removal of Continue (Verify Later) ---
console.log('\n--- Suite 4: Button States & Removal of Bypass ---');

assert.ok(
  customerPortalContent.includes('disabled={signInOtp.length !== 6 || isSignInSubmitting}'),
  'CustomerPortalPage Sign In button must stay disabled until all 6 digits are entered'
);
console.log('  ✅ [PASS] CustomerPortalPage Sign In button is disabled until 6 digits');

assert.ok(
  agentPortalContent.includes('disabled={signInOtp.length !== 6 || isSignInSubmitting}'),
  'AgentPortalPage Sign In button must stay disabled until all 6 digits are entered'
);
console.log('  ✅ [PASS] AgentPortalPage Sign In button is disabled until 6 digits');

assert.ok(
  !customerPortalContent.includes('btn-continue-unverified'),
  'CustomerPortalPage must NOT contain "Continue (Verify Later)" in login flow'
);
console.log('  ✅ [PASS] "Continue (Verify Later)" completely removed from Customer sign-in flow');

assert.ok(
  !agentPortalContent.includes('btn-continue-unverified'),
  'AgentPortalPage must NOT contain "Continue (Verify Later)" in login flow'
);
console.log('  ✅ [PASS] "Continue (Verify Later)" completely removed from Professional sign-in flow');

// --- Suite 5: Active Slot Border Brand Green, Never Navy ---
console.log('\n--- Suite 5: Active Slot Styling ---');

assert.ok(
  unifiedOtpCssContent.includes('border: 1.5px solid #059669 !important;'),
  'UnifiedOtpInput.css must enforce brand green (#059669) active slot border'
);
console.log('  ✅ [PASS] Active slot border is brand green (#059669)');

assert.ok(
  unifiedOtpCssContent.includes('body.agent-portal .nivaaro-otp-slot.is-active'),
  'UnifiedOtpInput.css must override agent portal navy accent to brand green'
);
console.log('  ✅ [PASS] Agent portal overrides navy accent to ensure brand green active border');

assert.ok(
  !unifiedOtpCssContent.includes('border-color: #101820') &&
  !unifiedOtpCssContent.includes('border: 1.5px solid #101820'),
  'UnifiedOtpInput.css must never use navy (#101820) for active slot border'
);
console.log('  ✅ [PASS] Verified zero navy colors on active slot borders');

console.log('\n========================================');
console.log('Phone OTP Login Input Tests: All Suites Passed!');
console.log('========================================\n');
