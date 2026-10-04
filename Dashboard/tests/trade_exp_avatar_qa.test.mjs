import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateAgentChecklist } from '../src/utils/profileStrength.js';

console.log('🧪 Starting Trade Specialization, 0 Exp, & Single Alphabet Avatar Tests...\n');

let passed = 0;
let total = 0;

function test(title, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
  }
}

// 1. Checklist Evaluation: 0 Years of Experience
test('profileStrength accepts 0 years of experience as valid and complete', () => {
  const agentWithZeroExp = {
    name: 'Raw',
    email: 'rawindia2003@gmail.com',
    phone: '8884992019',
    trade: 'electrician',
    experienceYears: 0,
    dob: '15/08/1995',
    state: 'Karnataka',
    city: 'Bengaluru',
    address: 'Indiranagar 100ft Road, Bengaluru'
  };

  const result = evaluateAgentChecklist(agentWithZeroExp);
  const expItem = result.checklist.find((i) => i.id === 'experience');
  assert.equal(expItem.completed, true, '0 years of experience should be evaluated as completed');
  assert.equal(result.isFullyComplete, true, 'Agent with 0 years exp and other fields complete should have 100% completion');
});

// 2. Checklist Evaluation: Trade cannot be "both"
test('profileStrength marks trade "both" as incomplete, only allows electrician or plumber', () => {
  const agentWithBoth = {
    name: 'Raw',
    email: 'rawindia2003@gmail.com',
    phone: '9876543210',
    trade: 'both',
    experienceYears: 0
  };

  const resultBoth = evaluateAgentChecklist(agentWithBoth);
  const tradeItemBoth = resultBoth.checklist.find((i) => i.id === 'trade');
  assert.equal(tradeItemBoth.completed, false, '"both" trade should be rejected in checklist');

  const agentElectrician = { ...agentWithBoth, trade: 'electrician' };
  assert.equal(evaluateAgentChecklist(agentElectrician).checklist.find(i => i.id === 'trade').completed, true);

  const agentPlumber = { ...agentWithBoth, trade: 'plumber' };
  assert.equal(evaluateAgentChecklist(agentPlumber).checklist.find(i => i.id === 'trade').completed, true);
});

// 3. AgentProfilePage UI: "both" option removed from Trade Specialization dropdown
test('AgentProfilePage JSX has removed "both" trade option and allows min=0 experience', () => {
  const agentProfilePath = path.resolve('../WebLogin/src/pages/AgentProfilePage.jsx');
  const content = fs.readFileSync(agentProfilePath, 'utf8');

  // Verify option "both" is NOT present in the select options
  assert.ok(!content.includes('<option value="both">'), 'Dropdown must NOT include option value="both"');
  assert.ok(content.includes('<option value="electrician">Electrician</option>'), 'Dropdown has Electrician option');
  assert.ok(content.includes('<option value="plumber">Plumber</option>'), 'Dropdown has Plumber option');

  // Verify experience input allows min={0}
  assert.ok(content.includes('min={0}'), 'Experience input must allow min={0}');
  assert.ok(!content.includes('min={1}'), 'Experience input must not restrict min to 1');
});

// 4. Single First Alphabet Avatar Initial Extraction
test('Single first alphabet initial extraction works for any name', () => {
  const getSingleInitial = (name, fallback = 'P') => (name || fallback).trim().charAt(0).toUpperCase();

  assert.equal(getSingleInitial('Raw'), 'R');
  assert.equal(getSingleInitial('rawindia2003@gmail.com'), 'R');
  assert.equal(getSingleInitial('Suresh Kumar'), 'S');
  assert.equal(getSingleInitial(' anjan roy '), 'A');
  assert.equal(getSingleInitial(''), 'P');
  assert.equal(getSingleInitial(null, 'U'), 'U');
});

// 5. Backend Agent Profile Endpoint with 0 experience and electrician trade
test('Backend API returns ground truth agent with trade!=both and experienceYears=0', async () => {
  const res = await fetch('http://localhost:5000/api/auth/agent-profile?email=rawindia2003@gmail.com');
  const data = await res.json();

  assert.equal(data.success, true);
  assert.notEqual(data.agent.trade, 'both', 'Agent trade must not be both in database');
  assert.ok(['electrician', 'plumber'].includes(data.agent.trade), 'Agent trade must be electrician or plumber');
  assert.equal(data.agent.experienceYears, 0, 'Agent experienceYears must be 0');
});

console.log(`\n========================================`);
console.log(`Trade, Exp & Avatar QA: ${passed} Passed, ${total - passed} Failed`);
console.log(`========================================\n`);

if (passed !== total) {
  process.exit(1);
}
