import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Verifying NivaaroFix Professional Console Redesign Requirements...');

const partnerConsolePath = path.resolve(__dirname, '../src/pages/PartnerConsolePage.jsx');
const partnerConsoleCssPath = path.resolve(__dirname, '../src/styles/PartnerConsole.css');
const dashboardCssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');

const partnerConsoleJsx = fs.readFileSync(partnerConsolePath, 'utf8');
const partnerConsoleCss = fs.readFileSync(partnerConsoleCssPath, 'utf8');
const dashboardCss = fs.readFileSync(dashboardCssPath, 'utf8');

let errors = [];

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    errors.push(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// 1. Badge Overuse Check
assert(
  !partnerConsoleJsx.includes('pro-tag-verified'),
  'Removed .pro-tag-verified capsule from partner trade/certification'
);
assert(
  partnerConsoleJsx.includes('pro-trade-verified'),
  'Uses clean inline text with icon (.pro-trade-verified) for trade'
);
assert(
  !partnerConsoleJsx.includes('pro-stat-action-btn'),
  'Removed pill buttons (.pro-stat-action-btn) from stats and settlements'
);
assert(
  partnerConsoleJsx.includes('pro-stat-action-link'),
  'Uses understated action link for balance withdrawal'
);
assert(
  partnerConsoleJsx.includes('pro-btn-settlement'),
  'Uses proper primary action button (.pro-btn-settlement) for Instant Bank Settlement'
);
assert(
  partnerConsoleJsx.includes('pro-live-status-pill'),
  'Reserves pill badge treatment strictly for live status'
);

// 2. GPS Coordinates Check
assert(
  !partnerConsoleJsx.includes('GPS Active ('),
  'Removed raw lat/long coordinates from user-facing badge text'
);
assert(
  partnerConsoleJsx.includes('Location Active'),
  'Replaced with clean "Location Active" indicator'
);
assert(
  partnerConsoleJsx.includes('title={providerLocation?.lat'),
  'Coordinates preserved cleanly in hover tooltip'
);

// 3. Accent Color Discipline Check
assert(
  !dashboardCss.includes('rgba(184, 134, 47, 0.09)'),
  'Removed amber nav highlight from active nav links'
);
assert(
  dashboardCss.includes('.nav-link-btn.active-nav-link') &&
  dashboardCss.includes('color: #946E26;') &&
  dashboardCss.includes('.nav-link-btn.active-nav-link::after') &&
  !dashboardCss.includes('.nav-link-btn.active-nav-link {\n  color: #059669;\n  font-weight: 600;\n  background: rgba(5, 150, 105, 0.08);') &&
  !dashboardCss.includes('.nav-link-btn.active-nav-link {\r\n  color: #059669;\r\n  font-weight: 600;\r\n  background: rgba(5, 150, 105, 0.08);'),
  'Unified nav active link to use luxury gold accent without filled pill background'
);
assert(
  partnerConsoleCss.includes('.pro-tab-item.active::after {\n  content: \'\';\n  position: absolute;\n  bottom: -1px;\n  left: 0;\n  right: 0;\n  height: 2px;\n  background: var(--pro-accent);'),
  'Active tab underline uses brand green accent instead of black'
);
assert(
  !partnerConsoleJsx.includes('rgba(212, 175, 55'),
  'Removed gold/amber gradient banner from busy job state'
);

// 4. Stats Bar Flattening & Baseline Alignment Check
assert(
  !partnerConsoleJsx.includes('hero-metric'),
  'Removed hero-metric box-within-a-box disparity from stats bar'
);
assert(
  partnerConsoleJsx.includes('pro-stat-label-row') &&
  partnerConsoleJsx.includes('pro-stat-value-row') &&
  partnerConsoleJsx.includes('pro-stat-caption'),
  'Stats bar structured with consistent 3-tier label -> value -> caption row hierarchy'
);

// 5. Ledger Table Empty State Check
assert(
  partnerConsoleJsx.includes('pro-ledger-empty-state'),
  'Implements bespoke .pro-ledger-empty-state container'
);
assert(
  partnerConsoleJsx.includes('No Transactions Recorded'),
  'Empty state features clear heading "No Transactions Recorded"'
);
assert(
  partnerConsoleJsx.includes('pro-ledger-empty-icon'),
  'Empty state features clean SVG receipt/document icon'
);
assert(
  partnerConsoleJsx.includes('pro-ledger-empty-desc') && partnerConsoleJsx.includes('pro-ledger-empty-meta'),
  'Empty state provides explanatory copy describing future settlement credits'
);

// 6. Typography & Rhythm Check
assert(
  partnerConsoleCss.includes('--pro-font') || partnerConsoleCss.includes('font-size: 1.35rem'),
  'Applies consistent type scale across headers and content'
);
assert(
  !partnerConsoleJsx.includes('🚀') && !partnerConsoleJsx.includes('⚡') && !partnerConsoleJsx.includes('🎉') && !partnerConsoleJsx.includes('🔒'),
  'Zero emojis present in partner console code or copy'
);

if (errors.length > 0) {
  console.error(`\n❌ Total Failures: ${errors.length}`);
  process.exit(1);
} else {
  console.log('\n🎉 ALL PROFESSIONAL CONSOLE REDESIGN CHECKS PASSED PERFECTLY! 🚀');
}
