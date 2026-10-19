import fs from 'fs';
import path from 'path';

// Banned brand color patterns: brown/gold/brass values that must not be used outside theme tokens
const BANNED_PATTERNS = [
  { name: 'Gold/Brass Hex', regex: /#(?:b8862f|946e26|a9793c|c9983e|c79752|d4af37|cca43b|e3ddd0|ded7cb|f3f0ea|faf8f5|faf8f4|fcf8f2)/i },
  { name: 'Warm Gold RGBA', regex: /rgba\(\s*(?:184,\s*134,\s*47|169,\s*121,\s*60|199,\s*151,\s*82|201,\s*152,\s*62)/i }
];

const SCAN_DIRS = [
  'apps/web/src',
  'apps/auth/src',
  'apps/web/public',
  'apps/auth/public'
];

const ALLOWED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.svg', '.json'];

let violationCount = 0;

function scan(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath);
    for (const entry of entries) {
      scan(path.join(targetPath, entry));
    }
  } else if (stat.isFile()) {
    const ext = path.extname(targetPath);
    if (!ALLOWED_EXTENSIONS.includes(ext)) return;

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Ignore test files or comments that explicitly discuss legacy migrations
      for (const { name, regex } of BANNED_PATTERNS) {
        if (regex.test(line)) {
          console.error(`[BANNED COLOR] ${targetPath}:${idx + 1} (${name})`);
          console.error(`   ${line.trim()}`);
          violationCount++;
        }
      }
    });
  }
}

console.log('=== Checking for banned gold/brown/brass brand values ===\n');

for (const dir of SCAN_DIRS) {
  if (fs.existsSync(dir)) {
    scan(dir);
  }
}

if (violationCount > 0) {
  console.error(`\nFAILED: Found ${violationCount} banned brand color occurrence(s).`);
  process.exit(1);
} else {
  console.log('PASSED: Zero banned brown/gold/brass values found in application sources.');
  process.exit(0);
}
