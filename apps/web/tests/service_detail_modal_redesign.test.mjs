import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { servicesDirectory } from '../src/data/servicesCatalogData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceDetailModalPath = path.resolve(__dirname, '../src/components/ServiceDetailModal.jsx');
const cssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');

const modalSource = fs.readFileSync(serviceDetailModalPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n🧪 Running NivaaroFix Service Detail Panel Redesign Tests...\n');

// 1. DATA-DRIVEN ARCHITECTURE & CATALOG SOURCE OF TRUTH
const electricianCatalog = servicesDirectory.find(s => s.slug === 'electrician');
const plumberCatalog = servicesDirectory.find(s => s.slug === 'plumber');

assert(!!electricianCatalog && !!plumberCatalog, 'Both Electrician and Plumber are defined in servicesDirectory catalog');

// 2. ELECTRICIAN COPY INTEGRITY
assert(
  electricianCatalog.description === 'Faults, repairs, and new installations for your home.',
  'Electrician description matches exact plain-language copy'
);
assert(
  electricianCatalog.trustLine === 'Every electrician is ID-verified and background-checked.',
  'Electrician trust line matches exact plain-language copy'
);
assert(
  electricianCatalog.defaultCta === 'Book an Electrician' && !electricianCatalog.defaultCta.includes('→'),
  'Electrician default CTA is "Book an Electrician" without arrow glyph'
);

const elecItems = electricianCatalog.items || [];
assert(
  elecItems.some(i => i.title === 'Switches & Sockets' && i.desc === 'Fix or replace burnt switches and loose sockets, or add new power points.'),
  'Electrician item: Switches & Sockets copy verified'
);
assert(
  elecItems.some(i => i.title === 'Tripping & Short Circuits' && i.desc === 'Find why your MCB or fuse keeps tripping and fix electric leakage.'),
  'Electrician item: Tripping & Short Circuits copy verified'
);
assert(
  elecItems.some(i => i.title === 'Fans & Fittings' && i.desc === 'Install or repair ceiling fans, regulators, exhaust fans, and light fixtures.'),
  'Electrician item: Fans & Fittings copy verified'
);
assert(
  elecItems.some(i => i.title === 'Inverter & Backup Wiring' && i.desc === 'Safe wiring and setup for inverters, batteries, and UPS.'),
  'Electrician item: Inverter & Backup Wiring copy verified'
);
assert(
  elecItems.some(i => i.title === 'Hidden Wiring & Earthing' && i.desc === 'Check concealed wiring and earthing to keep your home shock-safe.'),
  'Electrician item: Hidden Wiring & Earthing copy verified'
);

// 3. PLUMBER COPY INTEGRITY
assert(
  plumberCatalog.description === 'Leaks, blockages, and fittings fixed for your home.',
  'Plumber description matches exact plain-language copy'
);
assert(
  plumberCatalog.trustLine === 'Every plumber is ID-verified and background-checked.',
  'Plumber trust line matches exact plain-language copy'
);
assert(
  plumberCatalog.defaultCta === 'Book a Plumber' && !plumberCatalog.defaultCta.includes('→'),
  'Plumber default CTA is "Book a Plumber" without arrow glyph'
);

const plumbItems = plumberCatalog.items || [];
assert(
  plumbItems.some(i => i.title === 'Taps, Mixers & Showers' && i.desc === 'Repair or replace leaking taps, mixers, and shower fittings.'),
  'Plumber item: Taps, Mixers & Showers copy verified'
);
assert(
  plumbItems.some(i => i.title === 'Drains & Blocked Sinks' && i.desc === 'Clear blocked drains and sinks.'),
  'Plumber item: Drains & Blocked Sinks copy verified'
);
assert(
  plumbItems.some(i => i.title === 'Hidden Pipe Leaks' && i.desc === 'Trace and fix leaks inside walls and floors with minimal damage to tiles.'),
  'Plumber item: Hidden Pipe Leaks copy verified'
);
assert(
  plumbItems.some(i => i.title === 'Toilet & Flush Tank' && i.desc === 'Repair weak or running flushes and leaks around the toilet base.'),
  'Plumber item: Toilet & Flush Tank copy verified'
);
assert(
  plumbItems.some(i => i.title === 'Water Tank & Pump' && i.desc === 'Fix overflow, float valve, and pump problems for steady water supply.'),
  'Plumber item: Water Tank & Pump copy verified'
);

// 4. COMMON FOOTER COPY
assert(
  electricianCatalog.footerNote === 'Compare quotes from nearby professionals, then accept the one you prefer.' &&
  plumberCatalog.footerNote === 'Compare quotes from nearby professionals, then accept the one you prefer.',
  'Footer note matches exact copy for both trades'
);

// 5. REMOVAL OF PROHIBITED ELEMENTS
assert(
  !modalSource.includes('⚡') && !modalSource.includes('💧'),
  'Emoji-style icons (lightning bolt, water drop) are completely removed'
);
assert(
  !modalSource.includes('coverage-card') && !modalSource.includes('coverage-icon'),
  'Bordered beige per-service cards are removed in favor of single list'
);
assert(
  !modalSource.includes('service-detail-category') && !modalSource.includes('ELECTRICAL SERVICES'),
  'Redundant uppercase eyebrow category label is removed'
);
assert(
  !modalSource.includes('service-detail-subtext') && !modalSource.includes('service-detail-lead'),
  'Stacked duplicate intro blocks are removed; single clean description line used'
);
assert(
  !modalSource.includes('Close exploration'),
  'Duplicate "Close exploration" text button is removed'
);

// 6. INTERACTION & LOGIC
assert(
  modalSource.includes("ctaLabel = selectedItemId ? 'Continue' : defaultCta"),
  'Selecting an item changes CTA button label to "Continue"'
);
assert(
  modalSource.includes('issueToPreFill = selectedItem ? selectedItem.title : null') &&
  modalSource.includes('initiateProtectedBooking({') &&
  modalSource.includes('issue: issueToPreFill'),
  'Selection pre-fills service type in booking form to prevent downstream mismatches'
);
assert(
  modalSource.includes("e.key === 'Escape'") &&
  modalSource.includes('closeServiceDetail()'),
  'Escape key support is implemented'
);
assert(
  modalSource.includes("e.key === 'Tab'") &&
  modalSource.includes('focusableElements'),
  'Accessible focus trap is implemented'
);

// 7. LAYOUT & CSS INTEGRITY
assert(
  cssSource.includes('max-width: 560px;') &&
  cssSource.includes('.service-detail-modal-card'),
  'Desktop modal is centered with max-width ~560px'
);
assert(
  cssSource.includes('@media (max-width: 640px)') &&
  cssSource.includes('.service-detail-sheet-handle') &&
  cssSource.includes('transform: translateY(100%);'),
  'Mobile layout transforms to full-height bottom sheet with drag handle'
);
assert(
  cssSource.includes('background: #059669;') &&
  cssSource.includes('.service-detail-primary-btn'),
  'CTA button uses unified brand green (#059669)'
);
assert(
  !cssSource.includes('#B8862F') || !modalSource.includes('#B8862F'),
  'Gold/amber accent removed from the service detail panel'
);
assert(
  cssSource.includes('transition: opacity 200ms ease, transform 200ms ease;') ||
  cssSource.includes('transition: opacity 200ms ease;'),
  'Smooth 200ms non-bouncing transition implemented'
);

console.log(`\n========================================`);
console.log(`Service Detail Redesign QA: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
console.log(`========================================\n`);

if (totalTests !== passedTests) {
  process.exit(1);
}
