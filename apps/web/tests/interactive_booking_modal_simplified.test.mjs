import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modalFilePath = path.resolve(__dirname, '../src/components/InteractiveBookingModal.jsx');
const modalCode = fs.readFileSync(modalFilePath, 'utf8');

console.log('🧪 Running Interactive Booking Modal Verification Tests...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

// 1. Wizard Steps
assert(
  modalCode.includes('01') && modalCode.includes('Describe & Photos') &&
  modalCode.includes('02') && modalCode.includes('Review') &&
  modalCode.includes('03') && modalCode.includes('Confirm'),
  'Implements 3-step wizard flow: 01 Describe & Photos -> 02 Review -> 03 Confirm'
);

// 2. Optional description & no required asterisk on "What needs fixing?"
assert(
  modalCode.includes('What needs fixing?') &&
  !modalCode.includes('What needs fixing?<span className="required-indicator">') &&
  !modalCode.includes('What needs fixing? <span className="required-indicator">*</span>'),
  '"What needs fixing?" is optional and has no red asterisk indicator'
);

// 3. Validation rule: canContinueStep1 requires at least one of description or photos
assert(
  modalCode.includes('hasDescription = problemDescription.trim().length > 0') &&
  modalCode.includes('hasPhotos = photos.length > 0') &&
  modalCode.includes('canContinueStep1 = hasDescription || hasPhotos'),
  'Step 1 validation enforces: enabled if AT LEAST ONE of {description, photos} is present'
);

// 4. Step 1 validation helper text when disabled
assert(
  modalCode.includes('Add a short description or a photo to continue'),
  'Renders clear inline validation helper when Continue is disabled'
);

// 5. Collapsed optional diagnostic details
assert(
  modalCode.includes('Add more details (optional)') &&
  modalCode.includes('isDetailsExpanded') &&
  modalCode.includes('problemTiming') &&
  modalCode.includes('problemFrequency'),
  'Diagnostic questions are collapsed behind "Add more details (optional)" toggle'
);

// 6. No default pre-selected diagnostic options
assert(
  modalCode.includes("const [problemTiming, setProblemTiming] = useState('');") &&
  modalCode.includes("const [problemFrequency, setProblemFrequency] = useState('');"),
  'Diagnostic options have no default pre-selections (empty string defaults)'
);

// 7. Photo upload & device camera capture buttons
assert(
  modalCode.includes('Upload a photo') &&
  modalCode.includes('Take a photo') &&
  modalCode.includes('handleFileUpload') &&
  modalCode.includes('handleStartCamera'),
  'Provides dual photo actions: Upload a photo and Take a photo'
);

// 8. Server-side proximity matching and radius expansion messaging
assert(
  modalCode.includes('1 km → 3 km → 5 km → 10 km') ||
  modalCode.includes('1km -> 3km -> 5km -> 10km') ||
  modalCode.includes('findNearbyProvidersExpandingRadius') ||
  modalCode.includes('Searching expanding radius'),
  'Displays server-side expanding-radius proximity matching status and messaging'
);

// 9. Zero emojis in code
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
const containsEmoji = emojiRegex.test(modalCode);
assert(!containsEmoji, 'InteractiveBookingModal.jsx contains 0 emoji characters');

console.log(`\n========================================`);
console.log(`Modal QA Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log(`========================================\n`);

if (failCount > 0) {
  process.exit(1);
}
