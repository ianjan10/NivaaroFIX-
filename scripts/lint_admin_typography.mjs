import fs from 'fs';
import path from 'path';

/**
 * Linter Rule: Forbid font-family declarations in admin code outside adminTokens.css
 * Ensures typography remains strictly unified across all admin interfaces.
 */

const ADMIN_SCAN_DIRS = [
  'apps/web/src/pages/admin',
  'apps/web/src/components/admin'
];

const ADMIN_CSS_FILES = [
  'apps/web/src/styles/admin.css'
];

let violations = 0;

console.log('=== Checking for unauthorized font-family declarations in admin code ===\n');

for (const dir of ADMIN_SCAN_DIRS) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (/font-family|fontFamily/i.test(line)) {
        console.error(`[ADMIN TYPOGRAPHY VIOLATION] ${full}:${idx + 1}`);
        console.error(`   ${line.trim()}`);
        violations++;
      }
    });
  }
}

for (const cssFile of ADMIN_CSS_FILES) {
  if (!fs.existsSync(cssFile)) continue;
  const content = fs.readFileSync(cssFile, 'utf8');
  content.split('\n').forEach((line, idx) => {
    if (/^\s*font-family\s*:/i.test(line)) {
      console.error(`[ADMIN CSS TYPOGRAPHY VIOLATION] ${cssFile}:${idx + 1}`);
      console.error(`   ${line.trim()}`);
      violations++;
    }
  });
}

if (violations > 0) {
  console.error(`\nFAILED: Found ${violations} unauthorized font-family declaration(s). All admin typography must inherit from adminTokens.css.`);
  process.exit(1);
} else {
  console.log('SUCCESS: Zero unauthorized font-family declarations found. All admin typography inherits strictly from adminTokens.css.\n');
  process.exit(0);
}
