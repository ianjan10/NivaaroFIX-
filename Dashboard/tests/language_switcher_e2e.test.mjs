import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import translations from both Dashboard and WebLogin
const dashboardLangPath = path.resolve(__dirname, '../src/data/languageData.js');
const webLoginLangPath = path.resolve(__dirname, '../../WebLogin/src/data/languageData.js');
const topNavbarPath = path.resolve(__dirname, '../src/components/TopNavbar.jsx');
const partnerConsolePath = path.resolve(__dirname, '../src/pages/PartnerConsolePage.jsx');
const appHeaderPath = path.resolve(__dirname, '../../WebLogin/src/components/AppHeader.jsx');
const dashboardContextPath = path.resolve(__dirname, '../src/context/LanguageContext.jsx');
const webLoginContextPath = path.resolve(__dirname, '../../WebLogin/src/context/LanguageContext.jsx');

const { supportedLanguages, translations: dashboardTranslations } = await import(pathToFileURL(dashboardLangPath).href);
const { translations: webLoginTranslations } = await import(pathToFileURL(webLoginLangPath).href);

const topNavbarJsx = fs.readFileSync(topNavbarPath, 'utf-8');
const partnerConsoleJsx = fs.readFileSync(partnerConsolePath, 'utf-8');
const appHeaderJsx = fs.readFileSync(appHeaderPath, 'utf-8');
const dashboardContextJsx = fs.readFileSync(dashboardContextPath, 'utf-8');
const webLoginContextJsx = fs.readFileSync(webLoginContextPath, 'utf-8');

console.log('🌐 Running Comprehensive End-to-End Language Switcher & Localization Tests...\n');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${label}`);
    failed++;
  }
}

// 1. Language Data Completeness Checks
const EXPECTED_LANG_CODES = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'kn', 'ur', 'gu', 'pa'];

check(
  `Supported languages array contains all 10 target Indian languages (${EXPECTED_LANG_CODES.join(', ')})`,
  EXPECTED_LANG_CODES.every(code => supportedLanguages.some(l => l.code === code))
);

EXPECTED_LANG_CODES.forEach(code => {
  check(
    `Dashboard dictionary includes translations for '${code}'`,
    Boolean(dashboardTranslations[code] && Object.keys(dashboardTranslations[code]).length > 50)
  );
  check(
    `WebLogin dictionary includes translations for '${code}'`,
    Boolean(webLoginTranslations[code] && Object.keys(webLoginTranslations[code]).length > 50)
  );
});

// 2. Navigation & Console Translation Key Coverage across all 10 languages
const REQUIRED_TRANSLATION_KEYS = [
  'navHome',
  'navServices',
  'navBookings',
  'navPartnerConsole',
  'navAbout',
  'navHelp',
  'navSignOut',
  'proTradeElectrician',
  'proTradePlumber',
  'proVerifiedStatus',
  'proAvailable',
  'proOffline',
  'proStatAvailableBalance',
  'proJobsSettled',
  'proEarningsTitle',
  'proNetAvailable',
  'proWithdrawBtn',
  'proColJobRef',
  'proColPayoutType'
];

REQUIRED_TRANSLATION_KEYS.forEach(key => {
  const missingInDashboard = EXPECTED_LANG_CODES.filter(code => !dashboardTranslations[code]?.[key]);
  check(
    `Key '${key}' is translated across all 10 languages in Dashboard`,
    missingInDashboard.length === 0
  );
});

// 3. ISO Standard 2-Letter Code Formatting in Navbar & AppHeader
check(
  'TopNavbar uses ISO uppercase language code ((activeLanguage || "en").toUpperCase()) rather than name.slice(0, 2)',
  topNavbarJsx.includes('(activeLanguage || \'en\').toUpperCase()') &&
  !topNavbarJsx.includes('activeLanguageObj.name.slice(0, 2)')
);

check(
  'WebLogin AppHeader uses ISO uppercase language code ((activeLanguage || "en").toUpperCase()) rather than name.slice(0, 2)',
  appHeaderJsx.includes('(activeLanguage || \'en\').toUpperCase()') &&
  !appHeaderJsx.includes('activeLanguageObj.name.slice(0, 2)')
);

// 4. End-to-End Context Synchronization Checks
check(
  'Dashboard LanguageContext prioritizes URL ?lang= parameter during initialization',
  dashboardContextJsx.includes('params.get(\'lang\')') &&
  dashboardContextJsx.indexOf('params.get(\'lang\')') < dashboardContextJsx.indexOf('localStorage.getItem')
);

check(
  'Dashboard LanguageContext synchronizes document.documentElement.lang',
  dashboardContextJsx.includes('document.documentElement.lang = activeLanguage')
);

check(
  'Dashboard LanguageContext synchronizes URL replaceState with ?lang=',
  dashboardContextJsx.includes('currentUrl.searchParams.set(\'lang\', activeLanguage)')
);

check(
  'WebLogin LanguageContext synchronizes document.documentElement.lang',
  webLoginContextJsx.includes('document.documentElement.lang = activeLanguage')
);

// 5. PartnerConsolePage dynamic translation binding
check(
  'PartnerConsolePage binds partnerTrade to t.proTradePlumber / t.proTradeElectrician',
  partnerConsoleJsx.includes('t.proTradePlumber') && partnerConsoleJsx.includes('t.proTradeElectrician')
);

check(
  'PartnerConsolePage binds Verified status to t.proVerifiedStatus',
  partnerConsoleJsx.includes('t.proVerifiedStatus')
);

check(
  'PartnerConsolePage binds Available Balance to t.proStatAvailableBalance',
  partnerConsoleJsx.includes('t.proStatAvailableBalance')
);

check(
  'PartnerConsolePage binds Earnings & Payouts tab and header to t.proEarningsTitle',
  partnerConsoleJsx.includes('t.proEarningsTitle')
);

console.log('\n========================================');
console.log(`Language Switcher QA: ${passed} Passed, ${failed} Failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL LANGUAGE SWITCHER & LOCALIZATION CHECKS PASSED PERFECTLY!\n');
  process.exit(0);
}
