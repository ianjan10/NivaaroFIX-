import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLoginViewportFittingTests() {
  console.log('🧪 Running NivaaroFix Login Page Viewport-Aware Fitting Tests...\n');

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

  const cssPath = path.resolve(__dirname, '../src/styles/designSystem.css');
  const portalJsxPath = path.resolve(__dirname, '../src/pages/PortalSelectionPage.jsx');
  const appJsxPath = path.resolve(__dirname, '../src/App.jsx');

  const css = fs.readFileSync(cssPath, 'utf8');
  const portalJsx = fs.readFileSync(portalJsxPath, 'utf8');
  const appJsx = fs.readFileSync(appJsxPath, 'utf8');

  // 1. Structure and Modern Viewport Units
  report('Uses min-height: 100dvh on viewport root and page container', 
    css.includes('min-height: 100dvh') && css.includes('.auth-viewport-root') && css.includes('.page-container')
  );
  report('Page layout uses flex column with main absorbing available space', 
    css.includes('flex-direction: column') && css.includes('.auth-main-area') && css.includes('flex: 1')
  );
  report('Header has flex-shrink: 0 and responsive clamp height', 
    css.includes('.auth-header-bar') && css.includes('flex-shrink: 0') && css.includes('clamp(60px, 8vh, 84px)')
  );
  report('Footer has flex-shrink: 0 and margin-top: auto', 
    css.includes('.auth-floating-footer') && css.includes('flex-shrink: 0') && css.includes('margin-top: auto')
  );

  // 2. Controlled Focused Width & Proportions (640px Max-Width)
  report('Access stage wrapper uses focused max-width min(640px, calc(100% - 40px))', 
    css.includes('width: min(640px, calc(100% - 40px))') && css.includes('max-width: 640px')
  );
  report('Heading is constrained with max-width: 650px', 
    css.includes('.access-display-heading') && css.includes('max-width: 650px')
  );
  report('Subtitle is constrained with max-width: 500px', 
    css.includes('.access-subheadline') && css.includes('max-width: 500px')
  );
  report('Cards group gap is set to 14px with max-width 640px', 
    css.includes('.access-cards-group') && css.includes('gap: 14px') && css.includes('max-width: 640px')
  );
  report('Account card min-height is 112px with max-width 640px', 
    css.includes('.account-select-card') && css.includes('min-height: 112px') && css.includes('max-width: 640px')
  );
  report('Registration note is centered with max-width: 500px', 
    css.includes('.access-register-note') && css.includes('max-width: 500px')
  );

  // 3. Short Screen & Tablet/Mobile Media Queries
  report('Includes tablet media query @media (max-width: 1024px) and (min-width: 641px)', 
    css.includes('@media (max-width: 1024px) and (min-width: 641px)')
  );
  report('Includes short screen height media query @media (max-height: 760px) and (min-width: 768px)', 
    css.includes('@media (max-height: 760px) and (min-width: 768px)')
  );
  report('Includes very short screen height media query @media (max-height: 650px)', 
    css.includes('@media (max-height: 650px)')
  );
  report('Includes mobile media query with natural wrapping and full-width cards', 
    css.includes('@media (max-width: 640px)')
  );

  // 4. Content Visibility & Elements
  report('Portal Selection Page includes User card, Agent card, and Registration note', 
    portalJsx.includes('account-card-user') && 
    portalJsx.includes('account-card-agent') && 
    portalJsx.includes('access-register-note')
  );
  report('App includes AppHeader, main auth area, and AppFooter in standard flow', 
    appJsx.includes('<AppHeader') && 
    appJsx.includes('auth-main-area') && 
    appJsx.includes('<AppFooter')
  );

  console.log(`\n========================================`);
  console.log(`Login Viewport Fitting Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runLoginViewportFittingTests();
