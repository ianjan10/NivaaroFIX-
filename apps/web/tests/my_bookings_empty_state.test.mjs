/**
 * QA & Regression Test Suite: Empty State on My Bookings Page in NivaaroFix
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEmptyStateTests() {
  console.log('🧪 Running NivaaroFix My Bookings Empty State QA Tests...\n');

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

  const bookingsPageJsx = fs.readFileSync(path.join(__dirname, '../src/pages/MyBookingsPage.jsx'), 'utf8');
  const buttonJsx = fs.readFileSync(path.join(__dirname, '../src/components/Button.jsx'), 'utf8');
  const cssContent = fs.readFileSync(path.join(__dirname, '../src/styles/dashboardDesignSystem.css'), 'utf8');

  // 1. COPY (per tab) Verification
  console.log('--- 1. Per-Tab Copy Specifications ---');

  report('Active tab copy: "No active bookings" and "Book a service and track it here from request to completion."',
    bookingsPageJsx.includes("emptyTitle = 'No active bookings'") &&
    bookingsPageJsx.includes("emptySubtext = 'Book a service and track it here from request to completion.'")
  );

  report('Completed tab copy: "No completed jobs yet" and "Finished jobs and your ratings will appear here."',
    bookingsPageJsx.includes("emptyTitle = 'No completed jobs yet'") &&
    bookingsPageJsx.includes("emptySubtext = 'Finished jobs and your ratings will appear here.'")
  );

  report('All tab copy: "No bookings yet" and "Your service history will appear here."',
    bookingsPageJsx.includes("emptyTitle = 'No bookings yet'") &&
    bookingsPageJsx.includes("emptySubtext = 'Your service history will appear here.'")
  );

  report('Search with no match copy: "No results" and "Try a different service or professional name."',
    bookingsPageJsx.includes("emptyTitle = 'No results'") &&
    bookingsPageJsx.includes("emptySubtext = 'Try a different service or professional name.'")
  );

  report('Button visibility: shown for Active and All, omitted for Completed and Search with no match',
    bookingsPageJsx.includes('showButton && (') &&
    bookingsPageJsx.includes("activeTab === 'completed'") &&
    bookingsPageJsx.includes('showButton = false') &&
    bookingsPageJsx.includes("isSearchNoMatch")
  );

  // 2. SPACING AND TYPE Verification
  console.log('\n--- 2. Spacing, Hierarchy & Typography ---');

  report('Container has dashed border and generous 64px vertical padding',
    cssContent.includes('.bookings-empty-state-card') &&
    cssContent.includes('padding: 64px') &&
    cssContent.includes('dashed')
  );

  report('Icon is wrapped in a soft neutral circle with 16px bottom gap',
    bookingsPageJsx.includes('empty-state-circle-icon') &&
    cssContent.includes('.empty-state-circle-icon') &&
    cssContent.includes('border-radius: 50%') &&
    (cssContent.includes('#f1f5f9') || cssContent.includes('rgba(255, 255, 255, 0.06)')) &&
    cssContent.includes('margin-bottom: 16px')
  );

  report('Title is semibold, one step smaller than page title with 8px bottom gap',
    cssContent.includes('.empty-state-title') &&
    cssContent.includes('font-weight: 600') &&
    cssContent.includes('font-size: 1.25rem') &&
    cssContent.includes('margin: 0 0 8px 0')
  );

  report('Subtext is regular weight, muted gray, max-width ~420px, centered with comfortable line-height and 24px gap',
    cssContent.includes('.empty-state-desc') &&
    cssContent.includes('font-weight: 400') &&
    cssContent.includes('max-width: 420px') &&
    cssContent.includes('line-height: 1.55') &&
    cssContent.includes('margin: 0 0 24px 0')
  );

  // 3. BUTTON Verification
  console.log('\n--- 3. Shared Button Component & Brand Green Outline Styling ---');

  report('Shared Button component is created and imported into MyBookingsPage',
    bookingsPageJsx.includes("import Button from '../components/Button'") &&
    buttonJsx.includes('export default function Button')
  );

  report('Empty state "Book a Service" button uses shared Button with outline variant',
    bookingsPageJsx.includes('<Button') &&
    bookingsPageJsx.includes('variant="outline"') &&
    bookingsPageJsx.includes('Book a Service')
  );

  report('Brand green outline button has transparent bg, green border and text, same 8px radius and font-weight',
    cssContent.includes('.btn-outline-brand') &&
    cssContent.includes('background: transparent') &&
    cssContent.includes('color: #059669') &&
    cssContent.includes('border: 1.5px solid #059669') &&
    cssContent.includes('border-radius: 8px') &&
    cssContent.includes('font-weight: 600')
  );

  report('Brand green outline button defines hover, focus-visible, and pressed (active) states',
    cssContent.includes('.btn-outline-brand:hover') &&
    cssContent.includes('rgba(5, 150, 105, 0.08)') &&
    cssContent.includes('.btn-outline-brand:focus-visible') &&
    cssContent.includes('outline: 2px solid #059669') &&
    cssContent.includes('.btn-outline-brand:active') &&
    cssContent.includes('transform: scale(0.98)')
  );

  // 4. Audit & Zero Emoji Enforcement
  console.log('\n--- 4. App Audit & Zero Emoji Enforcement ---');

  report('Cancel modal buttons in MyBookingsPage use shared Button component',
    bookingsPageJsx.includes('<Button\n                variant="secondary"') ||
    bookingsPageJsx.includes('<Button variant="secondary"') ||
    bookingsPageJsx.includes('variant="destructive"')
  );

  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const hasEmoji = emojiRegex.test(bookingsPageJsx);
  report('Strict zero emoji enforcement: MyBookingsPage.jsx has zero emojis', !hasEmoji);

  console.log(`\n========================================`);
  console.log(`Empty State Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEmptyStateTests();
