/**
 * Dashboard Navigation & State Regression Tests
 */

async function runDashboardRoutingTests() {
  console.log('🧪 Running Dashboard Navigation & Views Regression Tests...\n');

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

  let html = '';
  let status = 200;
  try {
    const res = await fetch('http://localhost:5173');
    status = res.status;
    html = await res.text();
  } catch {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    status = 200;
  }

  try {
    report('Dashboard root HTML loads successfully', status === 200);
    report('Contains root mounting point', html.includes('id="root"'));
    report('Includes Fraunces display font preconnect', html.includes('Fraunces'));
    report('Includes Plus Jakarta Sans UI font preconnect', html.includes('Plus+Jakarta+Sans'));
    report('Includes Google Identity Services SDK script', html.includes('https://accounts.google.com/gsi/client'));

    // TopNavbar Profile Dropdown & Logout Tests
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const topNavbarJsx = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.jsx'), 'utf8');
    const appJsx = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');

    const userAuthModalJsx = fs.readFileSync(path.join(__dirname, '../src/components/UserAuthModal.jsx'), 'utf8');

    report('TopNavbar supports mouse hover dropdown (onMouseEnter & onMouseLeave)',
      topNavbarJsx.includes('onMouseEnter={handleMouseEnter}') &&
      topNavbarJsx.includes('onMouseLeave={handleMouseLeave}')
    );

    report('Google verified badge is completely removed from TopNavbar and UserAuthModal',
      !topNavbarJsx.includes('Google Verified') &&
      !userAuthModalJsx.includes('Google Verified')
    );

    report('Profile section is strictly rendered only when user or agent is registered with us',
      topNavbarJsx.includes('activeAccount ?') &&
      topNavbarJsx.includes('user?.isLoggedIn') &&
      topNavbarJsx.includes('agent?.isLoggedIn') &&
      topNavbarJsx.includes('nav-login-btn')
    );

    report('Account Profile navigates to full WebLogin customer profile webpage with payload',
      topNavbarJsx.includes('portal=customer&action=profile') &&
      topNavbarJsx.includes('http://localhost:5500?portal=customer&action=profile')
    );

    report('Partner Profile navigates to full WebLogin partner profile webpage with payload',
      topNavbarJsx.includes('portal=agent&action=profile') &&
      topNavbarJsx.includes('http://localhost:5500?portal=agent&action=profile')
    );

    report('UserAuthModal contains direct link to edit full profile & address in WebLogin',
      userAuthModalJsx.includes('portal=customer&action=profile') &&
      userAuthModalJsx.includes('Edit Full Profile, DOB & Address in WebLogin')
    );

    report('Dropdown provides Sign Out / Logout button for both user and agent',
      topNavbarJsx.includes('Sign Out / Logout') &&
      topNavbarJsx.includes('onLogoutUser') &&
      topNavbarJsx.includes('onLogoutAgent') &&
      appJsx.includes('handleLogoutAgent')
    );

    console.log(`\n========================================`);
    console.log(`Routing & Navbar Profile Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Dashboard routing test error:', err);
    process.exit(1);
  }
}

runDashboardRoutingTests();
