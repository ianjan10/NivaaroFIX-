import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runFooterRefinementTests() {
  console.log('🧪 Running NivaaroFix Complete Premium Footer Refinement Tests...\n');

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

  const footerJsxPath = path.resolve(__dirname, '../src/components/AppFooter.jsx');
  const homeJsxPath = path.resolve(__dirname, '../src/pages/HomePage.jsx');
  const cssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');

  const footerJsx = fs.readFileSync(footerJsxPath, 'utf8');
  const homeJsx = fs.readFileSync(homeJsxPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Structure & Multi-Column Grid
  report('Footer implements balanced multi-column grid (.footer-columns-grid)',
    footerJsx.includes('footer-columns-grid') &&
    css.includes('.footer-columns-grid') &&
    css.includes('grid-template-columns: 2.2fr 1fr 1fr 1fr;')
  );

  report('Footer uses centered 1240px max-width container without empty whitespace',
    footerJsx.includes('footer-max-container') &&
    css.includes('.footer-max-container') &&
    css.includes('max-width: 1240px;') &&
    css.includes('margin: 0 auto;')
  );

  // 2. Removal of Fabricated Support / Helpline Box
  report('Fake emergency support box is completely removed (No 24/7, No 1800-890-FIX, No fake support box)',
    !footerJsx.includes('24/7') &&
    !footerJsx.includes('1800-890-FIX') &&
    !footerJsx.includes('VERIFIED SUPPORT') &&
    !footerJsx.includes('Emergency Care') &&
    !footerJsx.includes('support@nivaarofix.com')
  );

  // 3. Removal of Fake Certifications & Warranties
  report('No fabricated ISO or warranty badges in footer',
    !footerJsx.includes('ISO 9001') &&
    !footerJsx.includes('90-Day') &&
    !footerJsx.includes('Unconditional Warranty')
  );

  // 4. Clean Services Column
  report('Services column is clean and focused (Electrician, Plumber, View all services)',
    footerJsx.includes('SERVICES') &&
    footerJsx.includes('Electrician') &&
    footerJsx.includes('Plumber') &&
    footerJsx.includes('View all services') &&
    !footerJsx.includes('Certified Master Plumbers') &&
    !footerJsx.includes('MCB Tripping & Short-Circuit') &&
    !footerJsx.includes('Blocked Drain & Sink Snake Clean')
  );

  // 5. Company & Account Columns
  report('Company column provides real About Us and Professional routes',
    footerJsx.includes('COMPANY') &&
    footerJsx.includes('About Us') &&
    footerJsx.includes('Professional')
  );

  report('Account column dynamically respects authenticated user/agent vs guest state',
    footerJsx.includes('ACCOUNT') &&
    footerJsx.includes('user?.isLoggedIn') &&
    footerJsx.includes('My Bookings') &&
    footerJsx.includes('Log in')
  );

  // 6. Brand Column & Tagline
  report('Brand column renders BrandLogo and exact clean tagline "Home repairs, handled with clarity."',
    footerJsx.includes('<BrandLogo') &&
    footerJsx.includes('Home repairs, handled with clarity.') &&
    css.includes('.footer-brand-tagline')
  );

  // 7. Divider & Minimal Legal Bottom Bar
  report('Includes subtle 1px divider and clean legal bar with registered copyright',
    footerJsx.includes('footer-divider-line') &&
    footerJsx.includes('footer-legal-bottom-bar') &&
    footerJsx.includes('©') &&
    footerJsx.includes('NivaaroFix. All rights reserved.') &&
    footerJsx.includes('Privacy Policy') &&
    footerJsx.includes('Terms of Service') &&
    !footerJsx.includes('NivaaroFix India Pvt. Ltd.')
  );

  // 8. Responsive Stacking & Media Queries
  report('CSS contains tablet (992px) and mobile (640px) responsive stacking rules',
    css.includes('@media (max-width: 992px)') &&
    css.includes('@media (max-width: 640px)') &&
    css.includes('.footer-columns-grid')
  );

  console.log(`\n========================================`);
  console.log(`Footer Refinement Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runFooterRefinementTests();
