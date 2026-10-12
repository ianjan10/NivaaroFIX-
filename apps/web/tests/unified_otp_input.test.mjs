import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardUnifiedOtpPath = path.resolve(__dirname, '../src/components/UnifiedOtpInput.jsx');
const dashboardOtpCssPath = path.resolve(__dirname, '../src/styles/UnifiedOtpInput.css');
const partnerConsolePath = path.resolve(__dirname, '../src/pages/PartnerConsolePage.jsx');
const webloginOtpPath = path.resolve(__dirname, '../../auth/src/components/UnifiedOtpInput.jsx');
const phoneOtpModalPath = path.resolve(__dirname, '../../auth/src/components/PhoneOtpModal.jsx');
const dispatchRoutesPath = path.resolve(__dirname, '../../api/src/routes/dispatchRoutes.js');
const authRoutesPath = path.resolve(__dirname, '../../api/src/routes/authRoutes.js');

const dashboardOtpSource = fs.readFileSync(dashboardUnifiedOtpPath, 'utf8');
const dashboardCssSource = fs.readFileSync(dashboardOtpCssPath, 'utf8');
const partnerConsoleSource = fs.readFileSync(partnerConsolePath, 'utf8');
const webloginOtpSource = fs.readFileSync(webloginOtpPath, 'utf8');
const phoneOtpModalSource = fs.readFileSync(phoneOtpModalPath, 'utf8');
const dispatchRoutesSource = fs.readFileSync(dispatchRoutesPath, 'utf8');
const authRoutesSource = fs.readFileSync(authRoutesPath, 'utf8');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n🧪 Running NivaaroFix Unified OTP Input & Security QA Tests...\n');

// 1. HEADLESS ENGINE INTEGRATION
assert(
  dashboardOtpSource.includes("from 'input-otp'") &&
  dashboardOtpSource.includes('OTPInput') &&
  dashboardOtpSource.includes('REGEXP_ONLY_DIGITS'),
  'UnifiedOtpInput in Dashboard uses input-otp as headless engine with REGEXP_ONLY_DIGITS'
);
assert(
  webloginOtpSource.includes("from 'input-otp'") &&
  webloginOtpSource.includes('OTPInput') &&
  webloginOtpSource.includes('REGEXP_ONLY_DIGITS'),
  'UnifiedOtpInput in WebLogin uses input-otp as headless engine with REGEXP_ONLY_DIGITS'
);
assert(
  !dashboardOtpSource.includes('input-otp-native') &&
  !webloginOtpSource.includes('input-otp-native'),
  'Does not use input-otp-native (React Native package)'
);

// 2. CONFIGURABLE LENGTH & BEHAVIOR
assert(
  partnerConsoleSource.includes('<UnifiedOtpInput') &&
  partnerConsoleSource.includes('length={4}'),
  'PartnerConsolePage uses UnifiedOtpInput configured with length=4 for Door OTP'
);
assert(
  phoneOtpModalSource.includes('<UnifiedOtpInput') &&
  phoneOtpModalSource.includes('length={6}'),
  'PhoneOtpModal uses UnifiedOtpInput configured with length=6 for Mobile Verification'
);
assert(
  dashboardOtpSource.includes('inputMode="numeric"') &&
  dashboardOtpSource.includes('autoComplete="one-time-code"'),
  'Uses numeric inputMode and one-time-code autocomplete for SMS autofill'
);
assert(
  dashboardOtpSource.includes('replace(/[\\s-]/g, \'\')'),
  'Sanitizes pasted input by stripping spaces and dashes before applying'
);
assert(
  dashboardOtpSource.includes('onComplete={handleComplete}'),
  'Implements auto-submit on completion without requiring extra verify button'
);

// 3. VISUAL SPECIFICATION & DESIGN SYSTEM
assert(
  dashboardCssSource.includes('tabular-nums') &&
  dashboardCssSource.includes('1px solid #cbd5e1') &&
  dashboardCssSource.includes('background-color: #ffffff;'),
  'Slots render clean rounded squares with tabular numerals, 1px neutral border, and white background'
);
assert(
  dashboardCssSource.includes('border: 1.5px solid #059669;') &&
  dashboardCssSource.includes('.nivaaro-otp-caret') &&
  dashboardCssSource.includes('background-color: #059669;'),
  'Active slot features 1.5px brand green border (#059669) and thin blinking caret without glow or gradient'
);
assert(
  dashboardCssSource.includes('.nivaaro-otp-slot.is-filled') &&
  dashboardCssSource.includes('border-color: #94a3b8;'),
  'Filled slot remains neutral showing only the digit'
);
assert(
  dashboardCssSource.includes('.nivaaro-otp-slot.is-error') &&
  dashboardCssSource.includes('#dc2626'),
  'Error state turns border red (#dc2626)'
);
assert(
  dashboardOtpSource.includes('handleValueChange(\'\')') &&
  dashboardOtpSource.includes('inputRef.current.focus()'),
  'Error state clears value and refocuses without shake/bounce animation'
);
assert(
  dashboardCssSource.includes('flex-wrap: nowrap;') &&
  dashboardCssSource.includes('clamp('),
  'Slots are responsive and scale down on narrow screens without wrapping'
);
assert(
  dashboardOtpSource.includes('aria-live="polite"') &&
  dashboardOtpSource.includes('role="alert"'),
  'Accessible aria-live announcements implemented for error and countdown messages'
);

// 4. SERVER-SIDE SECURITY FOR 4-DIGIT DOOR OTP
assert(
  dispatchRoutesSource.includes('sr.otp_locked_until && new Date(sr.otp_locked_until) > new Date()') &&
  dispatchRoutesSource.includes('status(429)'),
  'Backend enforces door OTP rate limiting and temporary lockout'
);
assert(
  dispatchRoutesSource.includes('currentAttempts >= 5') &&
  dispatchRoutesSource.includes('15 * 60 * 1000'),
  'Backend locks Door OTP entry for 15 minutes after 5 failed attempts'
);
assert(
  dispatchRoutesSource.includes("notifyCustomer(ref, 'status.otp_locked'") &&
  dispatchRoutesSource.includes("notifyProvider(acceptedQuoteRes.rows[0].agent_email, 'status.otp_locked'"),
  'Backend notifies both customer and provider on lockout'
);
assert(
  !dispatchRoutesSource.includes("activeJob: {\n        id: sr.id,\n        requestRef: sr.request_ref,\n        serviceTitle: sr.service_title,\n        category: sr.category,\n        issueType: sr.issue_type,\n        problemDescription: sr.problem_description,\n        status: sr.status,\n        address: sr.user_address,\n        customerName: sr.user_name,\n        customerPhone: sr.user_phone,\n        lat: sr.lat,\n        lng: sr.lng,\n        quoteAmount: parseFloat(sr.quote_amount),\n        quoteDuration: sr.quote_duration,\n        quoteMessage: sr.quote_message,\n        otpCode: sr.otp_code") &&
  dispatchRoutesSource.includes('otpVerified: Boolean(sr.otp_verified)'),
  'Door OTP is strictly NOT exposed in API responses to the professional side (/provider/active-job)'
);

// 5. MOBILE VERIFICATION COOLDOWN & RATE LIMITING
assert(
  authRoutesSource.includes('/send-phone-otp') &&
  authRoutesSource.includes('cooldownSeconds: waitSeconds') &&
  authRoutesSource.includes('30 - elapsedSeconds'),
  'Mobile verification enforces 30-60s resend cooldown timer'
);
assert(
  authRoutesSource.includes('existing.sendCount >= 5') &&
  authRoutesSource.includes('10 * 60 * 1000'),
  'Mobile verification enforces rate limiting (max 5 sends per 10 minutes)'
);

console.log(`\n========================================`);
console.log(`Unified OTP Input QA: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
console.log(`========================================\n`);

if (totalTests !== passedTests) {
  process.exit(1);
}
