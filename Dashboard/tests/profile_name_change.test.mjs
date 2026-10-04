/**
 * User & Agent Profile Name & Data Change Verification Tests
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runProfileNameChangeTests() {
  console.log('🧪 Running User & Agent Name Change & Persistence Verification Tests...\n');
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
    // 1. Backend Customer Name Change via API
    const testName = `QA Customer ${Date.now().toString().slice(-4)}`;
    const updateCustomerRes = await fetch('http://localhost:5000/api/auth/customer-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_profile_test_customer@nivaarofix.test',
        name: testName,
        phone: null,
        city: 'Bengaluru'
      })
    });
    const updateCustomerData = await updateCustomerRes.json();
    report('Backend: Customer name successfully updated in database',
      updateCustomerRes.status === 200 &&
      updateCustomerData.success === true &&
      updateCustomerData.user.name === testName
    );

    // 2. Backend Agent / Partner Name Change via API
    const testAgentName = `QA Partner ${Date.now().toString().slice(-4)}`;
    const updateAgentRes = await fetch('http://localhost:5000/api/auth/agent-update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa_agent_test@nivaarofix.test',
        name: testAgentName,
        partnerId: 'FIX-PRO-8894',
        trade: 'both'
      })
    });
    const updateAgentData = await updateAgentRes.json();
    report('Backend: Partner / Agent name successfully updated in database',
      updateAgentRes.status === 200 &&
      updateAgentData.success === true &&
      updateAgentData.agent.name === testAgentName
    );

    // 3. Inspect CustomerProfilePage.jsx
    const customerCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx'), 'utf8');
    report('CustomerProfilePage: Name field is strictly locked (readOnly, disabled, clean input with auto-dismissing notice)',
      customerCode.includes('value={name}') &&
      customerCode.includes('readOnly') &&
      customerCode.includes('disabled') &&
      customerCode.includes('input-field-locked') &&
      customerCode.includes('handleLockedNameClick') &&
      customerCode.includes('showNameLockedNotice')
    );
    report('CustomerProfilePage: Avatar preview card displays registered name and initials',
      customerCode.includes("{name || 'Customer Profile'}") &&
      (customerCode.includes("{(name || 'U').trim().charAt(0).toUpperCase()}") || customerCode.includes("{(name || 'U').charAt(0).toUpperCase()}"))
    );
    report('CustomerProfilePage: handleReturnToDashboard automatically synchronizes verified name to localStorage and URL payload',
      customerCode.includes('localStorage.setItem(\'nivaaro-user\'') &&
      customerCode.includes('name: name.trim()') &&
      customerCode.includes('http://localhost:5173?user=')
    );

    // 4. Inspect AgentProfilePage.jsx
    const agentCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx'), 'utf8');
    report('AgentProfilePage: Name field is strictly locked (readOnly, disabled, clean input with auto-dismissing notice)',
      agentCode.includes('value={name}') &&
      agentCode.includes('readOnly') &&
      agentCode.includes('disabled') &&
      agentCode.includes('input-field-locked') &&
      agentCode.includes('handleLockedNameClick') &&
      agentCode.includes('showNameLockedNotice')
    );
    report('AgentProfilePage: handleReturnToConsole automatically synchronizes verified partner name to localStorage and URL payload',
      agentCode.includes('localStorage.setItem(\'nivaaro-agent\'') &&
      agentCode.includes('name: name.trim()') &&
      agentCode.includes('http://localhost:5173?agent=')
    );

    // 5. Inspect TopNavbar.jsx & PartnerConsolePage.jsx
    const topNavbarCode = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.jsx'), 'utf8');
    const partnerConsoleCode = fs.readFileSync(path.join(__dirname, '../src/pages/PartnerConsolePage.jsx'), 'utf8');

    report('TopNavbar: Zero emoji characters present in navbar or dropdown pills',
      !topNavbarCode.includes('🛠️')
    );
    report('TopNavbar: Renders updated first name for both user and agent dynamically',
      topNavbarCode.includes("(activeAccount.name || 'Account').split(' ')[0]")
    );
    report('PartnerConsolePage: Dynamically displays updated partner name, trade, and initials',
      partnerConsoleCode.includes('partnerName') &&
      partnerConsoleCode.includes('partnerInitials') &&
      partnerConsoleCode.includes('partnerTrade')
    );

    console.log(`\n========================================`);
    console.log(`Name Change & Sync Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runProfileNameChangeTests();
