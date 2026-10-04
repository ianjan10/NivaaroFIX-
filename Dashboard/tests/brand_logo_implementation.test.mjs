import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function report(description, condition, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

console.log('🏛️ Running Comprehensive Brand Logo Verification Tests...\n');

const dashboardDir = path.resolve('d:/My Project/Dashboard');
const webloginDir = path.resolve('d:/My Project/WebLogin');

// 1. Verify Brand Assets
const brandAssets = [
  'logo-horizontal.png',
  'logo-stacked.png',
  'logo-emblem.png',
  'logo-wordmark.png',
  'nivaarofix-brand-original.jpg'
];

for (const asset of brandAssets) {
  const dashPath = path.join(dashboardDir, 'public/brand', asset);
  const webPath = path.join(webloginDir, 'public/brand', asset);

  report(
    `Dashboard brand asset exists: ${asset}`,
    fs.existsSync(dashPath) && fs.statSync(dashPath).size > 1000
  );
  report(
    `WebLogin brand asset exists: ${asset}`,
    fs.existsSync(webPath) && fs.statSync(webPath).size > 1000
  );
}

// 2. Verify BrandLogo.jsx components
const dashLogoCode = fs.readFileSync(path.join(dashboardDir, 'src/components/BrandLogo.jsx'), 'utf8');
const webLogoCode = fs.readFileSync(path.join(webloginDir, 'src/components/BrandLogo.jsx'), 'utf8');

report(
  'Dashboard BrandLogo renders /brand/logo-horizontal.png by default',
  dashLogoCode.includes("'/brand/logo-horizontal.png'")
);
report(
  'Dashboard BrandLogo supports stacked & emblem variants',
  dashLogoCode.includes("'/brand/logo-stacked.png'") && dashLogoCode.includes("'/brand/logo-emblem.png'")
);
report(
  'WebLogin BrandLogo renders /brand/logo-horizontal.png by default',
  webLogoCode.includes("'/brand/logo-horizontal.png'")
);
report(
  'WebLogin BrandLogo supports stacked & emblem variants',
  webLogoCode.includes("'/brand/logo-stacked.png'") && webLogoCode.includes("'/brand/logo-emblem.png'")
);
report(
  'Dashboard BrandLogo includes official tagline Beyond The Fix',
  dashLogoCode.includes('Beyond The Fix')
);
report(
  'WebLogin BrandLogo includes official tagline Beyond The Fix',
  webLogoCode.includes('Beyond The Fix')
);

// 3. Verify HTML Favicons
const dashHtml = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf8');
const webHtml = fs.readFileSync(path.join(webloginDir, 'index.html'), 'utf8');

report(
  'Dashboard index.html uses official golden emblem favicon',
  dashHtml.includes('<link rel="icon" type="image/png" href="/brand/logo-emblem.png" />') &&
  !dashHtml.includes('stroke-width')
);
report(
  'WebLogin index.html uses official golden emblem favicon',
  webHtml.includes('<link rel="icon" type="image/png" href="/brand/logo-emblem.png" />') &&
  !webHtml.includes('stroke-width')
);

// 4. Verify Invoice Modal Logo
const invoiceModalCode = fs.readFileSync(path.join(dashboardDir, 'src/components/BookingInvoiceModal.jsx'), 'utf8');
report(
  'BookingInvoiceModal renders official brand logo image',
  invoiceModalCode.includes('/brand/logo-horizontal.png')
);

// 5. Verify no old SVG isometric stack exists in BrandLogo components
const oldSvgPath = 'M12 2L2 7l10 5 10-5-10-5z';
report(
  'Dashboard BrandLogo removed old isometric SVG path',
  !dashLogoCode.includes(oldSvgPath)
);
report(
  'WebLogin BrandLogo removed old isometric SVG path',
  !webLogoCode.includes(oldSvgPath)
);

// 6. Verify PRO badge sign is removed completely from BrandLogo
report(
  'Dashboard BrandLogo removed pro sign badge',
  !dashLogoCode.includes('brand-partner-badge') && !dashLogoCode.includes('>Pro<') && !dashLogoCode.includes('>PRO<')
);
report(
  'WebLogin BrandLogo removed pro sign badge',
  !webLogoCode.includes('brand-partner-badge') && !webLogoCode.includes('>Pro<') && !webLogoCode.includes('>PRO<')
);

console.log('\n========================================');
console.log(`Brand Logo Implementation Summary: ${passed} Passed, ${failed} Failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
