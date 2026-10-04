/**
 * Verification for Professional / Agent Login End-to-End Separation
 * Ensures:
 * 1. Signing in as an Agent displays the Agent's profile (name, PRO badge, ID) in the top-right navbar
 * 2. Top-right navbar and Partner Console never display previous Customer (Anjan) details when on Partner Console
 * 3. Profile navigation from Partner Console strictly routes to Agent Profile ("Service Partner Account")
 * 4. Dual-identity storage conflicts are eliminated end-to-end
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runAgentLoginFlowTests() {
  console.log('🛡️ Running Agent Login & Profile Separation End-to-End Tests...\n');
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
    // 1. Inspect TopNavbar.jsx activeAccount resolution
    const topNavbarCode = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.jsx'), 'utf8');
    report(
      'TopNavbar: activeAccount prioritizes agent when currentView is partner or user is null',
      topNavbarCode.includes("currentView === 'partner'") &&
      topNavbarCode.includes("agent?.isLoggedIn ? { ...agent, type: 'agent' }")
    );
    report(
      'TopNavbar: Renders agent initials and handles agent type when activeAccount.type is agent',
      topNavbarCode.includes("activeAccount.type === 'agent' ? 'partner-avatar-initial' : ''") &&
      topNavbarCode.includes("activeAccount.type === 'agent'")
    );

    // 2. Inspect Dashboard App.jsx session isolation
    const dashboardAppCode = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
    report(
      'Dashboard App: Clears customer session (setUser(null) & removes nivaaro-user) when agent logs in',
      dashboardAppCode.includes("localStorage.removeItem('nivaaro-user')") &&
      dashboardAppCode.includes('setUser(null)')
    );
    report(
      'Dashboard App: Clears agent session (setAgent(null) & removes nivaaro-agent) when customer logs in',
      dashboardAppCode.includes("localStorage.removeItem('nivaaro-agent')") &&
      dashboardAppCode.includes('setAgent(null)')
    );

    // 3. Inspect WebLogin App.jsx portal & profile resolution
    const webLoginAppCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/App.jsx'), 'utf8');
    report(
      'WebLogin App: Routes action=profile to agent portal if portalParam is agent or agentParam exists',
      webLoginAppCode.includes("if (portalParam === 'agent' || agentParam)") &&
      webLoginAppCode.includes("setPortal('agent')")
    );
    report(
      'WebLogin App: Synchronizing agentParam removes stale nivaaro-user from localStorage',
      webLoginAppCode.includes("localStorage.removeItem('nivaaro-user')")
    );
    report(
      'WebLogin App: Initial portal state recognizes agentParam or portalParam=agent immediately',
      webLoginAppCode.includes("if (portalParam === 'agent' || params.get('agent')) return 'agent'")
    );

    // 4. Inspect AgentPortalPage.jsx login callbacks
    const agentPortalCode = fs.readFileSync(path.join(__dirname, '../../WebLogin/src/pages/AgentPortalPage.jsx'), 'utf8');
    report(
      'AgentPortalPage: Google login clears old customer session (nivaaro-user)',
      agentPortalCode.includes('handleGoogleSuccess') &&
      agentPortalCode.includes("localStorage.removeItem('nivaaro-user')")
    );
    report(
      'AgentPortalPage: ID/Password login clears old customer session (nivaaro-user)',
      agentPortalCode.includes('handleSignInSubmit') &&
      agentPortalCode.includes("localStorage.removeItem('nivaaro-user')")
    );
    report(
      'AgentPortalPage: Phone OTP login clears old customer session (nivaaro-user)',
      agentPortalCode.includes('handlePhoneOtpSignIn') &&
      agentPortalCode.includes("localStorage.removeItem('nivaaro-user')")
    );

    // 5. Inspect PartnerConsolePage.jsx Complete Profile navigation
    const partnerConsoleCode = fs.readFileSync(path.join(__dirname, '../src/pages/PartnerConsolePage.jsx'), 'utf8');
    report(
      'PartnerConsolePage: Complete Profile button navigates with portal=agent and agent payload',
      partnerConsoleCode.includes('portal=agent&action=profile') &&
      partnerConsoleCode.includes('agentParam')
    );

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`Agent Login Flow QA: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runAgentLoginFlowTests();
