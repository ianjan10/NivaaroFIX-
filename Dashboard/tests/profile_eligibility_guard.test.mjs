/**
 * NivaaroFix Profile Evaluation & Eligibility Tests
 * Verifies that:
 * 1. Customer profile strength calculations work accurately
 * 2. Customer booking is direct and frictionless (no blocking on booking)
 * 3. Partner / Agent service dispatch & job acceptance eligibility requires complete credentials
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEligibilityGuardTests() {
  console.log('🧪 Running Profile Checklist & Frictionless Booking Tests...\n');
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
    const { evaluateCustomerChecklist, evaluateAgentChecklist } = await import('../src/utils/profileStrength.js');
    const bookingContextCode = fs.readFileSync(path.join(__dirname, '../src/context/BookingContext.jsx'), 'utf8');
    const partnerConsoleCode = fs.readFileSync(path.join(__dirname, '../src/pages/PartnerConsolePage.jsx'), 'utf8');

    // =========================================================================
    // 1. Customer Checklist Evaluation Tests
    // =========================================================================
    console.log('--- Suite 1: Customer Profile Checklist Evaluation ---');

    const incompleteUser = {
      name: 'Anjan Singh',
      email: 'anjansingh100@gmail.com',
      avatarUrl: 'https://example.com/avatar.jpg'
      // phone, dob, state, city, address missing -> 35%
    };

    const incompleteEval = evaluateCustomerChecklist(incompleteUser);
    report('Customer with name, email, avatar only evaluates to 35% completion',
      incompleteEval.completionPercentage === 35
    );
    report('Customer with missing items is flagged isFullyComplete: false',
      incompleteEval.isFullyComplete === false &&
      incompleteEval.missingCount === 4
    );

    const completeUser = {
      name: 'Anjan Singh',
      email: 'anjansingh100@gmail.com',
      phone: '+91 8884992019',
      dob: { day: '15', month: '08', year: '1996' },
      state: 'Karnataka',
      city: 'Bengaluru',
      address: '#42, 4th Cross, Indiranagar, Bengaluru',
      avatarUrl: 'https://example.com/avatar.jpg'
    };

    const completeEval = evaluateCustomerChecklist(completeUser);
    report('Customer with all 7 fields filled evaluates to 100% completion',
      completeEval.completionPercentage === 100 &&
      completeEval.isFullyComplete === true &&
      completeEval.missingCount === 0
    );

    // =========================================================================
    // 2. Partner / Agent Checklist Evaluation Tests
    // =========================================================================
    console.log('\n--- Suite 2: Partner / Agent Profile Checklist Evaluation ---');

    const incompleteAgent = {
      name: 'Suresh Kumar',
      email: 'suresh.kumar@nivaarofix.in',
      trade: 'electrician'
      // phone, experience, dob, state, city, address missing
    };

    const incompleteAgentEval = evaluateAgentChecklist(incompleteAgent);
    report('Agent with missing phone, experience, DOB, address is flagged isFullyComplete: false',
      incompleteAgentEval.isFullyComplete === false &&
      incompleteAgentEval.completionPercentage < 100
    );

    const completeAgent = {
      name: 'Suresh Kumar',
      email: 'suresh.kumar@nivaarofix.in',
      phone: '+91 8884992019',
      trade: 'electrician',
      experienceYears: 8,
      dob: { day: '10', month: '04', year: '1995' },
      state: 'Tamil Nadu',
      city: 'Chennai',
      address: 'No. 18, 1st Main Road, Anna Nagar, Chennai'
    };

    const completeAgentEval = evaluateAgentChecklist(completeAgent);
    report('Partner with all checklist fields filled evaluates to 100% completion',
      completeAgentEval.completionPercentage === 100 &&
      completeAgentEval.isFullyComplete === true &&
      completeAgentEval.missingCount === 0
    );

    // =========================================================================
    // 3. Frictionless Customer Booking in BookingContext
    // =========================================================================
    console.log('\n--- Suite 3: Frictionless Customer Booking ---');

    report('BookingContext allows direct customer booking without profile completion blocking',
      bookingContextCode.includes('initiateProtectedBooking') &&
      bookingContextCode.includes("openBookingFor(targetService, issue)") &&
      !bookingContextCode.includes("status: 'PROFILE_INCOMPLETE'")
    );

    report('BookingContext exposes openBookingFor and clearBookingIntent',
      bookingContextCode.includes('openBookingFor') &&
      bookingContextCode.includes('clearBookingIntent')
    );

    // =========================================================================
    // 4. Partner Console Eligibility Enforcement
    // =========================================================================
    console.log('\n--- Suite 4: Partner Console Eligibility Enforcement ---');

    report('PartnerConsolePage evaluates agent checklist with evaluateAgentChecklist',
      partnerConsoleCode.includes('evaluateAgentChecklist') &&
      partnerConsoleCode.includes('profileCheck.isFullyComplete')
    );

    report('PartnerConsolePage renders warning banner when partner profile is incomplete',
      partnerConsoleCode.includes('!profileCheck.isFullyComplete') &&
      partnerConsoleCode.includes('Professional Profile Incomplete — Ineligible for Live Service Jobs')
    );

    report('PartnerConsolePage guards handleToggleOnline and handleAcceptJob when profile is incomplete',
      partnerConsoleCode.includes('handleToggleOnline') &&
      partnerConsoleCode.includes('handleAcceptJob') &&
      partnerConsoleCode.includes('!profileCheck.isFullyComplete')
    );

    console.log(`\n========================================`);
    console.log(`Eligibility & Booking Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runEligibilityGuardTests();
