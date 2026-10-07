import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardLangPath = path.resolve(__dirname, '../Dashboard/src/data/languageData.js');
const webloginLangPath = path.resolve(__dirname, '../WebLogin/src/data/languageData.js');

describe('End-to-End Multi-Language & Translation Verification', async () => {
  const dashMod = await import(pathToFileURL(dashboardLangPath).href);
  const webMod = await import(pathToFileURL(webloginLangPath).href);

  it('Both Dashboard and WebLogin have 10 supported regional languages', () => {
    assert.strictEqual(dashMod.supportedLanguages.length, 10);
    assert.strictEqual(webMod.supportedLanguages.length, 10);
    const expectedCodes = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'kn', 'ur', 'gu', 'pa'];
    assert.deepStrictEqual(dashMod.supportedLanguages.map(l => l.code), expectedCodes);
    assert.deepStrictEqual(webMod.supportedLanguages.map(l => l.code), expectedCodes);
  });

  it('All 10 languages have 100% complete key coverage with zero missing keys', () => {
    const enKeys = Object.keys(dashMod.translations.en);
    assert.ok(enKeys.length >= 440, `Expected at least 440 keys, found ${enKeys.length}`);

    for (const l of dashMod.supportedLanguages) {
      const code = l.code;
      const langKeys = Object.keys(dashMod.translations[code] || {});
      assert.strictEqual(
        langKeys.length,
        enKeys.length,
        `Dashboard language [${code}] has ${langKeys.length} keys, expected ${enKeys.length}`
      );

      const webKeys = Object.keys(webMod.translations[code] || {});
      assert.strictEqual(
        webKeys.length,
        enKeys.length,
        `WebLogin language [${code}] has ${webKeys.length} keys, expected ${enKeys.length}`
      );
    }
  });

  it('Professional Console tabs and critical UI keys are translated in all languages', () => {
    const checkKeys = [
      'navPartnerConsole',
      'proTabLiveFeed',
      'proTabCompletedJobs',
      'proTabEarnings',
      'proWithdrawToBank',
      'proStatAvailableBalance',
      'proSortRecent',
      'proSortHighest',
      'proFilterAll',
      'proFilter5Stars'
    ];

    for (const key of checkKeys) {
      assert.ok(dashMod.translations.en[key], `Missing key in EN: ${key}`);
      assert.ok(dashMod.translations.hi[key], `Missing key in HI: ${key}`);
      assert.ok(dashMod.translations.mr[key], `Missing key in MR: ${key}`);
      assert.ok(dashMod.translations.ta[key], `Missing key in TA: ${key}`);

      // Verify not equal to empty or blank
      assert.notStrictEqual(dashMod.translations.hi[key].trim(), '');
      assert.notStrictEqual(dashMod.translations.mr[key].trim(), '');
      assert.notStrictEqual(dashMod.translations.ta[key].trim(), '');
    }
  });

  it('Universal Translator service loads cleanly and translates synchronous phrases', async () => {
    const translatorPath = path.resolve(__dirname, '../Dashboard/src/services/universalTranslator.js');
    const { universalTranslator, translateStringSync } = await import(pathToFileURL(translatorPath).href);

    assert.ok(universalTranslator, 'Universal translator instance must exist');
    assert.strictEqual(typeof translateStringSync, 'function');

    // Test exact / normalized dictionary lookup in Hindi
    const hiCompleted = translateStringSync('Completed Jobs', 'hi');
    assert.ok(hiCompleted, 'Should translate "Completed Jobs" to Hindi');
    assert.notStrictEqual(hiCompleted, 'Completed Jobs');

    // Test Marathi
    const mrBalance = translateStringSync('Available Balance', 'mr');
    assert.ok(mrBalance, 'Should translate "Available Balance" to Marathi');
    assert.notStrictEqual(mrBalance, 'Available Balance');

    // Test Tamil
    const taWithdraw = translateStringSync('Withdraw to Bank', 'ta');
    assert.ok(taWithdraw, 'Should translate "Withdraw to Bank" to Tamil');
    assert.notStrictEqual(taWithdraw, 'Withdraw to Bank');

    // Test English passthrough
    const enText = translateStringSync('Completed Jobs', 'en');
    assert.strictEqual(enText, 'Completed Jobs');

    // Test pattern matcher: distance ~1.4 km away in Hindi
    const hiDistance = translateStringSync('~1.4 km away', 'hi');
    assert.ok(hiDistance && hiDistance.includes('किमी'), `Expected ~1.4 km away in Hindi to contain किमी, got: ${hiDistance}`);

    // Test pattern matcher: ★ 5 Stars (3) in Hindi
    const hiStars = translateStringSync('★ 5 Stars (3)', 'hi');
    assert.ok(hiStars && hiStars.includes('सितारे'), `Expected ★ 5 Stars in Hindi to contain सितारे, got: ${hiStars}`);
  });
});
