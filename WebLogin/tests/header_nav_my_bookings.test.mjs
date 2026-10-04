import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const topNavbarPath = path.resolve(__dirname, '../../Dashboard/src/components/TopNavbar.jsx');
const content = fs.readFileSync(topNavbarPath, 'utf8');

console.log('🧪 Testing Header Navigation: "My Bookings" placement after Services & before About Us...');

// 1. Check that My Bookings is conditionally rendered on user login
assert.ok(
  content.includes("user?.isLoggedIn || activeAccount?.type === 'user'"),
  'TopNavbar should check user login state before displaying My Bookings'
);
console.log('✅ Check 1 passed: Conditional check for user login state is present.');

// 2. Check that My Bookings button invokes onNavigate("bookings")
assert.ok(
  content.includes("onNavigate && onNavigate('bookings')"),
  'My Bookings button in header should navigate to bookings view'
);
console.log('✅ Check 2 passed: onNavigate("bookings") hook is present.');

// 3. Check order: Services -> My Bookings -> About Us
const servicesIndex = content.indexOf("onNavigate && onNavigate('services')");
const bookingsIndex = content.indexOf("onNavigate && onNavigate('bookings')");
const aboutIndex = content.indexOf("onNavigate && onNavigate('about')");

assert.ok(servicesIndex !== -1, 'Services link must exist');
assert.ok(bookingsIndex !== -1, 'My Bookings link must exist');
assert.ok(aboutIndex !== -1, 'About Us link must exist');

assert.ok(
  servicesIndex < bookingsIndex,
  `Services (${servicesIndex}) must appear before My Bookings (${bookingsIndex})`
);
assert.ok(
  bookingsIndex < aboutIndex,
  `My Bookings (${bookingsIndex}) must appear before About Us (${aboutIndex})`
);

console.log(`✅ Check 3 passed: Correct ordering verified:`);
console.log(`   Services (idx: ${servicesIndex}) -> My Bookings (idx: ${bookingsIndex}) -> About Us (idx: ${aboutIndex})`);

// 4. Check Professional Console order: Services -> Professional Console -> About Us
const partnerIndex = content.indexOf("onNavigate && onNavigate('partner')");
assert.ok(partnerIndex !== -1, 'Professional Console link must exist');
assert.ok(
  servicesIndex < partnerIndex,
  `Services (${servicesIndex}) must appear before Professional Console (${partnerIndex})`
);
assert.ok(
  partnerIndex < aboutIndex,
  `Professional Console (${partnerIndex}) must appear before About Us (${aboutIndex})`
);

console.log(`✅ Check 4 passed: Professional Console ordering verified:`);
console.log(`   Services (idx: ${servicesIndex}) -> Professional Console (idx: ${partnerIndex}) -> About Us (idx: ${aboutIndex})`);

console.log('🎉 ALL HEADER NAVIGATION CHECKS PASSED SUCCESSFULLY! 🚀');
