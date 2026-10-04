/**
 * Professional Profile & Credentials QA & 9-Digit ID Verification Tests
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(__dirname, '..');
const webloginDir = path.resolve(__dirname, '../../WebLogin');
const backendDir = path.resolve(__dirname, '../../backend');

async function runProCredentialsTests() {
  console.log('🛡️ Running Professional Profile & Credentials & 9-Digit ID Verification Tests...\n');
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
    const agentProfileCode = fs.readFileSync(path.join(webloginDir, 'src/pages/AgentProfilePage.jsx'), 'utf8');
    const cssCode = fs.readFileSync(path.join(webloginDir, 'src/styles/designSystem.css'), 'utf8');
    const partnerConsoleCode = fs.readFileSync(path.join(dashboardDir, 'src/pages/PartnerConsolePage.jsx'), 'utf8');
    const idGeneratorCode = fs.readFileSync(path.join(backendDir, 'src/utils/idGenerator.js'), 'utf8');
    const authRoutesCode = fs.readFileSync(path.join(backendDir, 'src/routes/authRoutes.js'), 'utf8');

    // --- 1. HEADING TYPOGRAPHY & EXACT COPY ---
    report(
      'Heading Title: Exact copy "Professional Profile & Credentials" with no font-fallback bug',
      (agentProfileCode.includes('Professional Profile &amp; Credentials') || agentProfileCode.includes('Professional Profile & Credentials')) &&
      agentProfileCode.includes('fontFamily: "var(--font-sans') &&
      cssCode.includes('body.agent-portal .profile-headline') &&
      cssCode.includes('var(--font-sans')
    );

    report(
      'Subtitle: Exact copy "Update your identity, contact details, and service base location."',
      agentProfileCode.includes('Update your identity, contact details, and service base location.')
    );

    report(
      'Field Labels: Clean "Full Name", "ID", and "Email Address" labels',
      /Full Name\s*<\/label>/.test(agentProfileCode) &&
      /ID\s*<\/label>/.test(agentProfileCode) &&
      /Email Address\s*<\/label>/.test(agentProfileCode) &&
      !agentProfileCode.includes('Professional Full Name') &&
      !agentProfileCode.includes('Work Email Address')
    );

    report(
      'Identity Badges: Removed "Verified — Locked" and padlock icon from name/id fields',
      !agentProfileCode.includes('Verified — Locked') &&
      !agentProfileCode.includes('Name locked to background verification certificate')
    );

    report(
      'Mobile Field: Transient click verification (5 sec) and removal of bottom verified helper line',
      agentProfileCode.includes('handleMobileClick') &&
      agentProfileCode.includes('showVerifiedTransient') &&
      agentProfileCode.includes('setTimeout') &&
      !agentProfileCode.includes('Mobile number is verified via SMS OTP.')
    );

    // --- 2. 9-DIGIT PROFESSIONAL ID FORMAT ---
    report(
      'ID Input: Placeholder is "202500001"',
      agentProfileCode.includes('placeholder="202500001"')
    );

    report(
      'Backend Generator: Generates 9-digit format (4-digit year + 5-digit zero-padded sequence)',
      idGeneratorCode.includes("const year = registrationYear || new Date().getFullYear()") &&
      idGeneratorCode.includes("partner_id ~ '^[0-9]{9}$'") &&
      idGeneratorCode.includes("String(nextSeq).padStart(5, '0')")
    );

    report(
      'Backend Auth Routes: Uses generateProfessionalId for registration and Google OAuth',
      authRoutesCode.includes('generateProfessionalId') &&
      !authRoutesCode.includes('FIX-PRO-')
    );

    report(
      'Partner Console: Uses 9-digit format fallback instead of FIX-PRO',
      partnerConsoleCode.includes("'202500001'") &&
      !partnerConsoleCode.includes("'FIX-PRO'")
    );

    // Live Database Check for 9-digit ID migration
    const profileRes = await fetch('http://localhost:5000/api/auth/agent-profile?email=kumar%40gmail.com');
    const profileData = await profileRes.json();
    report(
      'Live Database: Existing accounts migrated to 9-digit ID format (e.g. kumar k has 9-digit ID)',
      profileRes.status === 200 &&
      profileData.success === true &&
      /^[0-9]{9}$/.test(profileData.agent.partnerId)
    );

    // --- 3. NAME/PHOTO SECTION (BELOW AVATAR) ---
    report(
      'Sidebar Name: Formats proper case via formatProperCase (e.g. "kumar k" -> "Kumar K")',
      agentProfileCode.includes('formatProperCase(name)') &&
      agentProfileCode.includes('function formatProperCase')
    );

    report(
      'Sidebar Metadata: Tightly aligned vertical stack with consistent spacing',
      agentProfileCode.includes('pro-sidebar-meta-stack') &&
      agentProfileCode.includes("gap: '0.3rem'")
    );

    report(
      'Verified Badge: Restrained check icon + accent text (#946E26), no background fill',
      agentProfileCode.includes('stroke="#946E26"') &&
      agentProfileCode.includes('<span>Verified</span>'),
      `stroke: ${agentProfileCode.includes('stroke="#946E26"')}, span: ${agentProfileCode.includes('<span>Verified</span>')}`
    );

    report(
      'Photo Action Buttons: Aligned equal widths (flex: 1) and balanced vertical spacing',
      agentProfileCode.includes('flex: 1') &&
      agentProfileCode.includes("height: '38px'") &&
      agentProfileCode.includes('Live Photo') &&
      agentProfileCode.includes('Upload')
    );

    console.log('\n========================================');
    console.log(`Professional Credentials Summary: ${passed} Passed, ${failed} Failed`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runProCredentialsTests();
