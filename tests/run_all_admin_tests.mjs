import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const testSuites = [
  'tests/admin_seed.test.mjs',
  'tests/admin_auth.test.mjs',
  'tests/admin_redirects_and_security.test.mjs',
  'tests/admin_secret_hygiene.test.mjs',
  'tests/admin_visual_and_a11y.test.mjs',
  'tests/admin_approvals.test.mjs',
  'tests/admin_analytics_and_registry.test.mjs',
  'tests/admin_dashboard_and_registry_e2e.test.mjs',
  'tests/admin_document_viewer.test.mjs'
];

console.log('================================================================');
console.log('🛡️  NIVAAROFIX ADMIN SYSTEM FULL VERIFICATION SUITE');
console.log('================================================================\n');

for (const suite of testSuites) {
  const fullPath = path.resolve(rootDir, suite);
  console.log(`▶ Executing ${suite}...`);
  try {
    execSync(`node "${fullPath}"`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log(`✓ ${suite} PASSED\n`);
  } catch (err) {
    console.error(`\n❌ FAILED: ${suite}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('🎉 ALL 6 ADMIN SYSTEM TEST SUITES PASSED FLAWLESSLY!');
console.log('================================================================');

