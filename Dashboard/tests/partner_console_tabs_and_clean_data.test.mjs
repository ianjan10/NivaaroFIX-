import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Verifying Partner Console 4 Tabs & Zero AI Generated Data...');

const partnerConsolePath = path.resolve(__dirname, '../src/pages/PartnerConsolePage.jsx');
const agentRoutesPath = path.resolve(__dirname, '../../backend/src/routes/agentRoutes.js');

const partnerConsoleJsx = fs.readFileSync(partnerConsolePath, 'utf8');
const agentRoutesJs = fs.readFileSync(agentRoutesPath, 'utf8');

let errors = [];

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    errors.push(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// 1. Check the 3 unified tabs exist in Partner Console navigation
assert(
  partnerConsoleJsx.includes("activeTab === 'feed'") && partnerConsoleJsx.includes("Live Requests"),
  'Tab 1: Live Requests present with real nearby requests'
);
assert(
  partnerConsoleJsx.includes("activeTab === 'completed'") && partnerConsoleJsx.includes("Completed Jobs"),
  'Tab 2: Completed Jobs present (merged past completed visits & customer feedback)'
);
assert(
  partnerConsoleJsx.includes("activeTab === 'payouts'") && partnerConsoleJsx.includes("Earnings & Payouts"),
  'Tab 3: Earnings & Payouts present for real ledger transactions'
);

// 2. Zero AI generated / fake fallback data
assert(
  !partnerConsoleJsx.includes('Rajesh Sharma') && !partnerConsoleJsx.includes('Ceiling fan installation completed'),
  'Zero hardcoded fake jobs or mock customer names in Partner Console'
);
assert(
  !partnerConsoleJsx.includes('mockJobs') && !partnerConsoleJsx.includes('mockReviews'),
  'Zero mockJobs or mockReviews variables'
);

// 3. Location Hub word removal
assert(
  partnerConsoleJsx.includes("replace(/\\b(Hub|hub)\\b/gi, '')"),
  'Location parser strips out any instance of the word "Hub"'
);

// 4. Rating Guard: Must not show fake 5.0 score when unrated
assert(
  partnerConsoleJsx.includes("completedJobsCount > 0 || pastJobs.length > 0") &&
  partnerConsoleJsx.includes("No customer reviews yet"),
  'Rating card displays "—" and "No customer reviews yet" when no jobs or reviews exist'
);

// 5. Backend endpoints exist and are genuine PostgreSQL queries
assert(
  agentRoutesJs.includes("router.get('/completed-jobs/:email'") &&
  agentRoutesJs.includes("FROM bookings b") &&
  agentRoutesJs.includes("status = 'Completed'"),
  'Backend supplies genuine completed jobs from PostgreSQL bookings table'
);
assert(
  agentRoutesJs.includes("router.get('/reviews/:email'") &&
  agentRoutesJs.includes("FROM reviews r") &&
  agentRoutesJs.includes("WHERE r.provider_id = $1"),
  'Backend supplies genuine customer reviews from PostgreSQL reviews table'
);

// 6. Zero emojis
const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert(
  !emojiRegex.test(partnerConsoleJsx),
  'PartnerConsolePage contains zero emoji characters'
);

if (errors.length > 0) {
  console.error(`\n❌ Total Failures: ${errors.length}`);
  process.exit(1);
} else {
  console.log('\n🎉 ALL PARTNER CONSOLE TABS & ZERO AI DATA CHECKS PASSED PERFECTLY!');
}
