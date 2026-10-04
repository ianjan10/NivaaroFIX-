/**
 * NivaaroFix Profile Zero-Garbage-Data & GPS Auto-Detection QA Validation
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runProfileGpsQATests() {
  console.log('🌍 Running Zero-Garbage-Data & GPS Auto-Detection QA Tests...\n');
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

  const dobSelectorPath = path.join(__dirname, '../../WebLogin/src/components/DateOfBirthSelector.jsx');
  const locSelectPath = path.join(__dirname, '../../WebLogin/src/components/LocationCascadingSelect.jsx');
  const customerProfilePath = path.join(__dirname, '../../WebLogin/src/pages/CustomerProfilePage.jsx');
  const agentProfilePath = path.join(__dirname, '../../WebLogin/src/pages/AgentProfilePage.jsx');
  const gpsServicePath = path.join(__dirname, '../../WebLogin/src/services/gpsLocationService.js');

  const dobCode = fs.readFileSync(dobSelectorPath, 'utf8');
  const locCode = fs.readFileSync(locSelectPath, 'utf8');
  const custCode = fs.readFileSync(customerProfilePath, 'utf8');
  const agentCode = fs.readFileSync(agentProfilePath, 'utf8');
  const gpsCode = fs.readFileSync(gpsServicePath, 'utf8');

  // 1. DateOfBirthSelector Tests
  report('DateOfBirthSelector: Accepts value object with day/month/year',
    dobCode.includes('currentDay = value?.day') &&
    dobCode.includes('currentMonth = value?.month') &&
    dobCode.includes('currentYear = value?.year')
  );

  report('DateOfBirthSelector: Does not default to future year 2050',
    !dobCode.includes('2050 - 1920') &&
    dobCode.includes('new Date().getFullYear()')
  );

  report('DateOfBirthSelector: Empty option does not have disabled attribute (prevents auto-selecting 01/Jan/Year)',
    dobCode.includes('<option value="">{t.dobDay || \'Day\'}</option>') &&
    dobCode.includes('<option value="">{t.dobMonth || \'Month\'}</option>') &&
    dobCode.includes('<option value="">{t.dobYear || \'Year\'}</option>')
  );

  // 2. LocationCascadingSelect Tests
  report('LocationCascadingSelect: Supports selectedState and selectedCity props',
    locCode.includes('selectedState') &&
    locCode.includes('selectedCity') &&
    locCode.includes('activeState') &&
    locCode.includes('activeCity')
  );

  report('LocationCascadingSelect: State empty option does not have disabled attribute (prevents auto-selecting Andhra Pradesh)',
    locCode.includes('<option value="">{t.selectStatePlaceholder || \'Select State\'}</option>')
  );

  report('LocationCascadingSelect: Supports dynamically appending GPS-detected cities/districts',
    locCode.includes('citiesList = [activeCity, ...citiesList]')
  );

  // 3. CustomerProfilePage GPS Integration
  report('CustomerProfilePage: Imports and utilizes detectCurrentGpsLocation',
    custCode.includes('detectCurrentGpsLocation') &&
    custCode.includes('handleAutoDetectGps')
  );

  report('CustomerProfilePage: Leaves address blank on load until user clicks GPS button',
    !custCode.includes('handleAutoDetectGps(true)') &&
    custCode.includes('Auto-Detect Address (GPS)')
  );

  report('CustomerProfilePage: Renders prominent GPS detected alert banner with prompt to save',
    custCode.includes('gpsNotice') &&
    custCode.includes('Live Location Detected via GPS') &&
    custCode.includes('Save Profile Details')
  );

  report('CustomerProfilePage: Renders dedicated Auto-Detect Address (GPS) button',
    custCode.includes('Auto-Detect Address (GPS)') ||
    custCode.includes('Auto-Detect via GPS')
  );

  // 4. AgentProfilePage GPS Integration
  report('AgentProfilePage: Imports and utilizes detectCurrentGpsLocation',
    agentCode.includes('detectCurrentGpsLocation') &&
    agentCode.includes('handleAutoDetectGps')
  );

  report('AgentProfilePage: Leaves address blank on load until agent clicks GPS button',
    !agentCode.includes('handleAutoDetectGps(true)') &&
    agentCode.includes('Auto-Detect Address (GPS)')
  );

  report('AgentProfilePage: Renders prominent GPS detected alert banner with prompt to save',
    agentCode.includes('gpsNotice') &&
    agentCode.includes('Live Location Detected via GPS') &&
    agentCode.includes('Save Professional Profile')
  );

  report('AgentProfilePage: Renders dedicated Auto-Detect Address (GPS) button',
    agentCode.includes('Auto-Detect Address (GPS)') ||
    agentCode.includes('Auto-Detect via GPS')
  );

  // 5. GPS Geocoding Service Capabilities
  report('gpsLocationService: Provides high-accuracy geolocation with reverse-geocoding fallbacks',
    gpsCode.includes('navigator.geolocation.getCurrentPosition') &&
    gpsCode.includes('api.bigdatacloud.net') &&
    gpsCode.includes('nominatim.openstreetmap.org') &&
    gpsCode.includes('normalizeStateName') &&
    gpsCode.includes('normalizeCityName')
  );

  console.log(`\n========================================`);
  console.log(`Profile & GPS QA Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runProfileGpsQATests();
