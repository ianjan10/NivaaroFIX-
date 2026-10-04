/**
 * Logo Home Navigation Verification Tests
 * Verifies that clicking the brand logo directly routes to the home page
 * for both users and professionals across Dashboard and WebLogin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(__dirname, '..');
const webloginDir = path.resolve(__dirname, '../../WebLogin');

async function runLogoHomeNavTests() {
  console.log('🧭 Running Brand Logo Direct Home Navigation Verification Tests...\n');
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
    // 1. WebLogin AppHeader: Clicking logo directs both agents and users to home page
    const appHeaderCode = fs.readFileSync(path.join(webloginDir, 'src/components/AppHeader.jsx'), 'utf8');
    report('WebLogin AppHeader: Agent session returns with view=home#home',
      appHeaderCode.includes('agent=${payload}&lang=${activeLanguage || \'en\'}&view=home#home')
    );
    report('WebLogin AppHeader: User session returns with view=home#home',
      appHeaderCode.includes('user=${payload}&lang=${activeLanguage || \'en\'}&view=home#home')
    );
    report('WebLogin AppHeader: Default fallback returns with view=home#home',
      appHeaderCode.includes('lang=${activeLanguage || \'en\'}&view=home#home')
    );

    // 2. WebLogin AgentProfilePage: Clicking logo routes professional directly to home page
    const agentProfileCode = fs.readFileSync(path.join(webloginDir, 'src/pages/AgentProfilePage.jsx'), 'utf8');
    report('WebLogin AgentProfilePage: Logo click handler redirects professional to home page with view=home#home',
      agentProfileCode.includes('agent=${payload}&lang=${activeLanguage || \'en\'}&view=home#home') &&
      !agentProfileCode.includes('#partner-console')
    );

    // 3. WebLogin CustomerProfilePage: Clicking logo routes customer to home page
    const customerProfileCode = fs.readFileSync(path.join(webloginDir, 'src/pages/CustomerProfilePage.jsx'), 'utf8');
    report('WebLogin CustomerProfilePage: Logo click handler redirects user to home page with view=home#home',
      customerProfileCode.includes('user=${payload}&lang=${activeLanguage || \'en\'}&view=home#home')
    );

    // 4. Dashboard App.jsx: Receives view=home and routes agent session directly to home view
    const dashboardAppCode = fs.readFileSync(path.join(dashboardDir, 'src/App.jsx'), 'utf8');
    report('Dashboard App.jsx: getViewFromHash gives home view top priority on hash match',
      dashboardAppCode.includes("if (hash.includes('home') || hash === '#/' || hash === '') return 'home';")
    );
    report('Dashboard App.jsx: Cross-origin receiver routes agent to home view when view=home or hash includes home',
      dashboardAppCode.includes("if (viewParam === 'home' || returnToParam === 'home' || targetHash.includes('home'))") &&
      dashboardAppCode.includes("setCurrentView('home');") &&
      dashboardAppCode.includes("window.location.hash = '#/';")
    );

    // 5. Dashboard TopNavbar: Logo click always navigates to home view
    const topNavbarCode = fs.readFileSync(path.join(dashboardDir, 'src/components/TopNavbar.jsx'), 'utf8');
    report('Dashboard TopNavbar: BrandLogo triggers onNavigate(\'home\') on click',
      topNavbarCode.includes("onClick={() => onNavigate && onNavigate('home')}")
    );

    // 6. BrandLogo default onClick fallback routes to home page
    const dashLogoCode = fs.readFileSync(path.join(dashboardDir, 'src/components/BrandLogo.jsx'), 'utf8');
    const webLogoCode = fs.readFileSync(path.join(webloginDir, 'src/components/BrandLogo.jsx'), 'utf8');
    report('Dashboard BrandLogo: Includes fallback home navigation when onClick is omitted',
      dashLogoCode.includes("window.location.hash = '#/';") &&
      dashLogoCode.includes("cursor: 'pointer'")
    );
    report('WebLogin BrandLogo: Includes fallback home navigation with view=home#home when onClick is omitted',
      webLogoCode.includes("&view=home#home") &&
      webLogoCode.includes("cursor: 'pointer'")
    );

    console.log('\n========================================');
    console.log(`Logo Home Navigation Summary: ${passed} Passed, ${failed} Failed`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runLogoHomeNavTests();
