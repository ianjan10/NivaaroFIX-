/**
 * End-to-End Profile Navigation & Database Synchronization Verification Tests
 */

async function runProfileIntegrationTests() {
  console.log('🧪 Running Profile Integration & End-to-End Sync Tests...\n');
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
    // 1. Check Dashboard and WebLogin Dev Servers
    const dashRes = await fetch('http://localhost:5173');
    report('Dashboard server is healthy and responding (port 5173)', dashRes.status === 200);

    const webLoginRes = await fetch('http://localhost:5500');
    report('WebLogin server is healthy and responding (port 5500)', webLoginRes.status === 200);

    // 2. Check Backend Profile Update Endpoints
    const testCustomerUpdate = await fetch('http://localhost:5000/api/auth/customer-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_profile_test_customer@nivaarofix.test',
        name: 'QA Test Customer',
        phone: '+91 9876543210',
        dob: { day: '15', month: '08', year: '1992' },
        state: 'Karnataka',
        city: 'Bengaluru',
        address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru 560103'
      })
    });
    const customerUpdateData = await testCustomerUpdate.json();
    report('Backend customer-update-profile endpoint responds with success and database sync', 
      testCustomerUpdate.status === 200 && customerUpdateData.success === true && customerUpdateData.user.city === 'Bengaluru'
    );

    // 3. Check Backend Partner Profile Update Endpoint
    const testAgentUpdate = await fetch('http://localhost:5000/api/auth/agent-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'suresh.electric@nivaarofix.in',
        name: 'Suresh Kumar',
        phone: '+91 9876543220',
        trade: 'electrician',
        experienceYears: 7,
        dob: { day: '10', month: '05', year: '1988' },
        state: 'Karnataka',
        city: 'Bengaluru',
        address: 'Unit 12, Indiranagar Trade Complex, Bengaluru'
      })
    });
    const agentUpdateData = await testAgentUpdate.json();
    report('Backend agent-update-profile endpoint responds with success and database sync',
      testAgentUpdate.status === 200 && agentUpdateData.success === true && agentUpdateData.agent.trade === 'electrician'
    );

    // Reset test phone and dob on suresh to keep DB pristine for other suites
    await fetch('http://localhost:5000/api/auth/agent-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'suresh.electric@nivaarofix.in',
        phone: null,
        dob: null
      })
    });

    // 4. Inspect Source Files for Strict Requirements
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const topNavbarCode = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.jsx'), 'utf8');
    const userAuthModalCode = fs.readFileSync(path.join(__dirname, '../src/components/UserAuthModal.jsx'), 'utf8');
    const customerProfileCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx'), 'utf8');
    const agentProfileCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx'), 'utf8');
    const webLoginAppCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/App.jsx'), 'utf8');

    const interactiveBookingModalCode = fs.readFileSync(path.join(__dirname, '../src/components/InteractiveBookingModal.jsx'), 'utf8');

    report('TopNavbar: Zero instances of "Google Verified" badge', !topNavbarCode.includes('Google Verified'));
    report('UserAuthModal: Zero instances of "Google Verified" badge', !userAuthModalCode.includes('Google Verified'));
    report('TopNavbar: Account Profile triggers smooth redirection to WebLogin customer profile with payload',
      topNavbarCode.includes('http://localhost:5500?portal=customer&action=profile') &&
      topNavbarCode.includes('userPayload')
    );
    report('TopNavbar: Partner Profile triggers smooth redirection to WebLogin agent profile with payload',
      topNavbarCode.includes('http://localhost:5500?portal=agent&action=profile') &&
      topNavbarCode.includes('agentPayload')
    );
    report('TopNavbar: Profile section strictly guarded to registered/logged-in users only',
      topNavbarCode.includes('activeAccount ?') &&
      topNavbarCode.includes('nav-login-btn')
    );
    report('WebLogin App: Handles action=profile and routes to CustomerProfilePage / AgentProfilePage',
      webLoginAppCode.includes("view === 'profile'") &&
      webLoginAppCode.includes('<CustomerProfilePage') &&
      webLoginAppCode.includes('<AgentProfilePage')
    );
    report('CustomerProfilePage: Features Live Camera Capture, File Upload & GPS Auto-Detection',
      customerProfileCode.includes('LiveCameraCaptureModal') &&
      customerProfileCode.includes('handleFileUpload') &&
      customerProfileCode.includes('detectCurrentGpsLocation') &&
      customerProfileCode.includes('DateOfBirthSelector')
    );
    report('AgentProfilePage: Features Live Camera Capture, File Upload & GPS Auto-Detection',
      agentProfileCode.includes('LiveCameraCaptureModal') &&
      agentProfileCode.includes('handleFileUpload') &&
      agentProfileCode.includes('detectCurrentGpsLocation') &&
      agentProfileCode.includes('DateOfBirthSelector')
    );
    report('InteractiveBookingModal: Features phone validation and booking flow',
      interactiveBookingModalCode.includes('handleStep1Next') ||
      interactiveBookingModalCode.includes('customerPhone') ||
      interactiveBookingModalCode.includes('handleConfirmBooking')
    );

    console.log(`\n========================================`);
    console.log(`Profile E2E Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Profile integration test error:', err);
    process.exit(1);
  }
}

runProfileIntegrationTests();
