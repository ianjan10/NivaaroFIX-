/**
 * NivaaroFix Profile & Account Settings Page Design & QA Validation Tests
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runDesignQATests() {
  console.log('🎨 Running Profile Design & System Tokens QA Tests...\n');
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

  const customerProfilePath = path.join(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx');
  const agentProfilePath = path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx');
  const liveCameraModalPath = path.join(__dirname, '../../WebLogin/src/components/LiveCameraCaptureModal.jsx');
  const appPath = path.join(__dirname, '../../WebLogin/src/App.jsx');
  const cssPath = path.join(__dirname, '../../WebLogin/src/styles/designSystem.css');

  const customerProfile = fs.readFileSync(customerProfilePath, 'utf8');
  const agentProfile = fs.readFileSync(agentProfilePath, 'utf8');
  const liveCameraModal = fs.readFileSync(liveCameraModalPath, 'utf8');
  const appCode = fs.readFileSync(appPath, 'utf8');
  const cssCode = fs.readFileSync(cssPath, 'utf8');

  // Emoji regex matching Unicode emoji ranges (excluding basic ASCII)
  const emojiRegex = /(\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[\u2600-\u27bf])/g;

  // 1. Zero Emoji Check across all files
  const customerEmojis = customerProfile.match(emojiRegex) || [];
  const agentEmojis = agentProfile.match(emojiRegex) || [];
  const cameraEmojis = liveCameraModal.match(emojiRegex) || [];

  report('CustomerProfilePage: 0 emoji characters in code and templates', customerEmojis.length === 0, `found: ${customerEmojis.join(',')}`);
  report('AgentProfilePage: 0 emoji characters in code and templates', agentEmojis.length === 0, `found: ${agentEmojis.join(',')}`);
  report('LiveCameraCaptureModal: 0 emoji characters in code and templates', cameraEmojis.length === 0, `found: ${cameraEmojis.join(',')}`);

  // 2. Titles & Fraunces Serif Typography
  report('CustomerProfilePage: Page title is Personal Information & Saved Address with Fraunces serif styling',
    customerProfile.includes('Personal Information &amp; Saved Address') &&
    cssCode.includes("font-family: 'Fraunces', Georgia, serif")
  );

  report('AgentProfilePage: Page title is Professional Profile & Credentials with clean typography',
    (agentProfile.includes('Professional Profile &amp; Credentials') || agentProfile.includes('Professional Profile & Credentials')) &&
    cssCode.includes("body.agent-portal .profile-headline")
  );

  // 3. Line Icons in Brand Palette (No Emojis)
  report('CustomerProfilePage: Uses outline upload, camera, and muted rust delete line icons',
    customerProfile.includes('btn-avatar-action') &&
    customerProfile.includes('btn-avatar-primary') &&
    customerProfile.includes('btn-avatar-delete') &&
    customerProfile.includes('#8a3b34') &&
    customerProfile.includes('aria-label="Upload photo from device"') &&
    customerProfile.includes('aria-label="Take live photo with camera"') &&
    customerProfile.includes('aria-label="Remove custom profile photo"')
  );

  report('AgentProfilePage: Uses outline upload, camera, and muted rust delete line icons',
    agentProfile.includes('btn-avatar-action') &&
    agentProfile.includes('btn-avatar-delete') &&
    agentProfile.includes('aria-label="Upload professional photo from device"') &&
    agentProfile.includes('aria-label="Take live professional photo with camera"')
  );

  // 4. Cards Removed from Sidebar
  report('CustomerProfilePage: Profile Strength card is removed from sidebar',
    !customerProfile.includes('profile-strength-card') &&
    !customerProfile.includes('PROFILE STRENGTH')
  );

  report('AgentProfilePage: Profile Strength card is removed from sidebar',
    !agentProfile.includes('profile-strength-card') &&
    !agentProfile.includes('PROFESSIONAL VERIFICATION')
  );

  report('CustomerProfilePage: Quick Links card is removed from sidebar',
    !customerProfile.includes('profile-sidebar-card') &&
    !customerProfile.includes('Quick Links')
  );

  report('AgentProfilePage: Quick Links card is removed from sidebar',
    !agentProfile.includes('profile-sidebar-card') &&
    !agentProfile.includes('Quick Links')
  );

  // 5. Sign Out Button Styling (Quiet Navy / Slate, No Red)
  report('CustomerProfilePage & AgentProfilePage: Sign Out uses quiet slate/navy styling instead of stock red',
    cssCode.includes('.profile-signout-btn') &&
    cssCode.includes('color: #5A6472')
  );

  // 6. Background: Plain Ivory Canvas with Dot-Grid Mesh (No Marketing Photography)
  report('CSS: Profile background uses ivory #f7f5f1 with dot-grid pattern without hero photography',
    cssCode.includes('background-color: #f7f5f1') &&
    cssCode.includes('radial-gradient(rgba(16, 24, 32, 0.035) 1px, transparent 1px)')
  );

  // 7. Responsive 2-column stacking
  report('CSS: Contains responsive 2-column stacking rules',
    cssCode.includes('.profile-content-grid') &&
    cssCode.includes('@media (max-width: 820px)')
  );

  console.log(`\n========================================`);
  console.log(`Design QA Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runDesignQATests();
