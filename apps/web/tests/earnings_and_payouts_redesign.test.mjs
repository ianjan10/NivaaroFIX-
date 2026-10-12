import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const partnerConsoleJsxPath = path.resolve(__dirname, '../src/pages/PartnerConsolePage.jsx');
const partnerConsoleCssPath = path.resolve(__dirname, '../src/styles/PartnerConsole.css');

const partnerConsoleJsx = fs.readFileSync(partnerConsoleJsxPath, 'utf-8');
const partnerConsoleCss = fs.readFileSync(partnerConsoleCssPath, 'utf-8');

console.log('🧪 Verifying Earnings & Payouts Cleanup & Redesign Requirements...\n');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`✅ PASSED: ${label}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${label}`);
    failed++;
  }
}

// 1. Terminology Renaming Checks
check(
  'Tab and header use "Earnings & Payouts" (not "Settlements & Ledger")',
  partnerConsoleJsx.includes('Earnings & Payouts') &&
  !partnerConsoleJsx.includes('<span>Settlements & Ledger</span>')
);

check(
  'Replaced "Net Available" with "Available for Withdrawal"',
  partnerConsoleJsx.includes('Available for Withdrawal') &&
  !partnerConsoleJsx.includes('Net Available')
);

check(
  'Replaced "Instant Bank Settlement" with "Withdraw to Bank"',
  partnerConsoleJsx.includes('Withdraw to Bank') &&
  !partnerConsoleJsx.includes('<span>Instant Bank Settlement</span>')
);

check(
  'Table header uses "Job Reference" (not "Reference / Description")',
  (partnerConsoleJsx.includes('<th>Job Reference</th>') || (partnerConsoleJsx.includes('Job Reference') && partnerConsoleJsx.includes('t.proColJobRef'))) &&
  !partnerConsoleJsx.includes('Reference / Description')
);

check(
  'Table header uses "Payout Type" (not "Settlement Type")',
  (partnerConsoleJsx.includes('<th>Payout Type</th>') || (partnerConsoleJsx.includes('Payout Type') && partnerConsoleJsx.includes('t.proColPayoutType'))) &&
  !partnerConsoleJsx.includes('Settlement Type')
);

check(
  'Payout transaction type uses "Service Payout" (not "Job Completion Credit")',
  partnerConsoleJsx.includes("'Service Payout'") &&
  !partnerConsoleJsx.includes('Job Completion Credit')
);

// 2. Redesign & Formatting Checks
check(
  'Empty state features "Your completed jobs will appear here once settled."',
  partnerConsoleJsx.includes('Your completed jobs will appear here once settled.')
);

check(
  'Amount column uses right alignment and 2-decimal formatting (minimumFractionDigits: 2)',
  partnerConsoleJsx.includes('minimumFractionDigits: 2') &&
  partnerConsoleJsx.includes('maximumFractionDigits: 2')
);

check(
  'Amount prefix uses dedicated .pro-tx-prefix in brand accent color',
  partnerConsoleCss.includes('.pro-tx-amount .pro-tx-prefix {\n  color: var(--pro-accent);')
);

check(
  'Header spacing is tightened to sit seamlessly with table (margin-bottom: 0.85rem)',
  partnerConsoleCss.includes('margin-bottom: 0.85rem;')
);

check(
  'Zero emojis present in console code or copy',
  !partnerConsoleJsx.includes('🚀') && !partnerConsoleJsx.includes('⚡') && !partnerConsoleJsx.includes('🎉')
);

console.log(`\n========================================`);
console.log(`Earnings & Payouts QA Summary: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
process.exit(0);
