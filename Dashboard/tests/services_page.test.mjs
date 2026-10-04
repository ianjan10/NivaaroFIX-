import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runServicesPageTests() {
  console.log('🧪 Running NivaaroFix Refined Editorial Services Page & Booking Auth Flow Tests...\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  const servicesJsxPath = path.resolve(__dirname, '../src/pages/ServicesPage.jsx');
  const catalogDataPath = path.resolve(__dirname, '../src/data/servicesCatalogData.js');
  const bookingCtxPath = path.resolve(__dirname, '../src/context/BookingContext.jsx');
  const serviceDetailJsxPath = path.resolve(__dirname, '../src/components/ServiceDetailModal.jsx');
  const agentNoticeJsxPath = path.resolve(__dirname, '../src/components/AgentRoleNoticeModal.jsx');
  const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
  const cssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');
  const backendBookingRoutesPath = path.resolve(__dirname, '../../backend/src/routes/bookingRoutes.js');

  const servicesJsx = fs.readFileSync(servicesJsxPath, 'utf8');
  const catalogData = fs.readFileSync(catalogDataPath, 'utf8');
  const bookingCtx = fs.readFileSync(bookingCtxPath, 'utf8');
  const serviceDetailJsx = fs.readFileSync(serviceDetailJsxPath, 'utf8');
  const agentNoticeJsx = fs.readFileSync(agentNoticeJsxPath, 'utf8');
  const appJsx = fs.readFileSync(appJsxPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const backendBookingRoutes = fs.readFileSync(backendBookingRoutesPath, 'utf8');

  // =========================================================================
  // 1. NON-NEGOTIABLE CONTENT RULES (Strictly zero commercial hype / fake claims)
  // =========================================================================
  report('Services page has zero price tags (No ₹, starting prices, discounts)',
    !servicesJsx.includes('₹') &&
    !servicesJsx.includes('Starting at') &&
    !servicesJsx.includes('Best price') &&
    !servicesJsx.includes('startingPrice')
  );

  report('Services page has zero warranty claims (No 30-day/90-day warranty, guarantees)',
    !servicesJsx.includes('warranty') &&
    !servicesJsx.includes('Warranty') &&
    !servicesJsx.includes('guarantee') &&
    !servicesJsx.includes('Guarantee')
  );

  report('Services page has zero fake statistics or social proof (No ratings, stars, job counts)',
    !servicesJsx.includes('4.9') &&
    !servicesJsx.includes('15,000+') &&
    !servicesJsx.includes('30 minutes') &&
    !servicesJsx.includes('100% certified') &&
    !servicesJsx.includes('★')
  );

  report('Redundant "Back to Home" button is removed',
    !servicesJsx.includes('Back to Home') &&
    !servicesJsx.includes('services-back-btn')
  );

  report('No future expansion or launch status messaging on Services page',
    !servicesJsx.includes('launching soon') &&
    !servicesJsx.includes('Launching soon') &&
    !servicesJsx.includes('Building now') &&
    !servicesJsx.includes('future categories')
  );

  // =========================================================================
  // 2. HERO & EDITORIAL INTRODUCTION
  // =========================================================================
  report('Hero contains uppercase gold eyebrow "OUR SERVICES"',
    servicesJsx.includes('OUR SERVICES') &&
    servicesJsx.includes('services-eyebrow')
  );

  report('Hero contains display headline "Expert help for what matters at home."',
    servicesJsx.includes('Expert help for') &&
    servicesJsx.includes('what matters at home.')
  );

  report('Hero contains supporting copy "Describe what\'s wrong or explore a service to find the right way forward."',
    servicesJsx.includes("Describe what's wrong or explore a service to find the right way forward.")
  );

  report('Redundant category list in hero is removed for cleaner vertical rhythm',
    !servicesJsx.includes('services-micro-line')
  );

  // =========================================================================
  // 3. MAIN CREATIVE INTERACTION: WHAT NEEDS FIXING? (Search & Rotating Placeholder)
  // =========================================================================
  report('Contains "WHAT NEEDS FIXING?" search label and accessible search form',
    servicesJsx.includes('WHAT NEEDS FIXING?') &&
    servicesJsx.includes('services-search-label') &&
    servicesJsx.includes('role="search"')
  );

  report('Search config defines real cycling examples and suggestions mapping to services',
    catalogData.includes('servicesSearchConfig') &&
    catalogData.includes('MCB keeps tripping') &&
    catalogData.includes('Tap is leaking') &&
    catalogData.includes('Sink is blocked') &&
    catalogData.includes('Pipe is leaking')
  );

  report('Search field renders rotating placeholder, suggestion dropdown, and unrecognized search fallback',
    servicesJsx.includes('services-search-field') &&
    servicesJsx.includes('currentPlaceholder') &&
    servicesJsx.includes('services-suggestions-dropdown') &&
    servicesJsx.includes('services-search-empty-box') &&
    catalogData.includes('emptyState')
  );

  // =========================================================================
  // 4. DISTINCT EXPLORE VS BOOK ACTIONS & ALTERNATING EDITORIAL CATALOGUE
  // =========================================================================
  report('Showcase features alternating Electrician and Plumber editorial rows with distinct explore vs book actions',
    servicesJsx.includes('services-editorial-section') &&
    servicesJsx.includes('featured-electrician') &&
    servicesJsx.includes('complementary-plumber') &&
    servicesJsx.includes('service-tile-explore-btn') &&
    servicesJsx.includes('service-tile-book-btn') &&
    servicesJsx.includes('Book an Electrician →') &&
    servicesJsx.includes('Book a Plumber →')
  );

  report('Explore service actions open ServiceDetailModal without requiring login',
    servicesJsx.includes('handleExploreService') &&
    servicesJsx.includes('openServiceDetail')
  );

  report('Booking actions trigger initiateProtectedBooking auth guard',
    servicesJsx.includes('handleBookService') &&
    servicesJsx.includes('initiateProtectedBooking')
  );

  // =========================================================================
  // 5. SERVICE DETAIL MODAL (EXPLORATION DRAWER)
  // =========================================================================
  report('ServiceDetailModal component renders service scope, coverage items, and booking action',
    serviceDetailJsx.includes('WHAT THIS SERVICE COVERS') &&
    serviceDetailJsx.includes('service-coverage-grid') &&
    serviceDetailJsx.includes('service-vetting-box') &&
    serviceDetailJsx.includes('service-detail-book-btn') &&
    serviceDetailJsx.includes('initiateProtectedBooking')
  );

  // =========================================================================
  // 6. BOOKING AUTH GUARD & INTENT PRESERVATION
  // =========================================================================
  report('BookingContext manages booking intent storage, retrieval, and auth guard',
    bookingCtx.includes('saveBookingIntent') &&
    bookingCtx.includes('getPendingBookingIntent') &&
    bookingCtx.includes('clearBookingIntent') &&
    bookingCtx.includes('initiateProtectedBooking') &&
    bookingCtx.includes('resumeBookingIntentIfPresent')
  );

  report('App.jsx mounts ServiceDetailModal and AgentRoleNoticeModal, resuming booking intent on login',
    appJsx.includes('<ServiceDetailModal') &&
    appJsx.includes('<AgentRoleNoticeModal') &&
    appJsx.includes('resumeBookingIntentIfPresent')
  );

  // =========================================================================
  // 7. AGENT ROLE PROTECTION (FRONTEND & BACKEND)
  // =========================================================================
  report('AgentRoleNoticeModal renders clear message and "Log in as User →" action',
    agentNoticeJsx.includes('Bookings are available from a customer account.') &&
    agentNoticeJsx.includes('Professional') &&
    agentNoticeJsx.includes('Log in as User →')
  );

  report('Backend booking route enforces 403 Forbidden for agent accounts (AGENT_CANNOT_BOOK)',
    backendBookingRoutes.includes('AGENT_CANNOT_BOOK') &&
    backendBookingRoutes.includes('Bookings are available from a customer account.') &&
    backendBookingRoutes.includes('403')
  );

  // =========================================================================
  // 8. UNBOXED PROBLEM-FIRST SECTION & COMPACT CLOSING LINK
  // =========================================================================
  report('Section "START WITH THE PROBLEM" contains unboxed editorial problem links',
    servicesJsx.includes('START WITH THE PROBLEM') &&
    servicesJsx.includes('Not sure which service you need? Start with what went wrong.') &&
    servicesJsx.includes('problem-editorial-grid') &&
    catalogData.includes('problemFirstLinks')
  );

  report('Closing section contains compact understated "Still not sure? Tell us what\'s wrong →" action',
    servicesJsx.includes('services-compact-closing') &&
    servicesJsx.includes("Still not sure? Tell us what's wrong")
  );

  // =========================================================================
  // 10. AUTHENTIC USER DATA & ZERO ARTIFICIAL ADDRESSES
  // =========================================================================
  const userAuthModalPath = path.join(__dirname, '../src/components/UserAuthModal.jsx');
  const userAuthModalJsx = fs.readFileSync(userAuthModalPath, 'utf8');

  report('User profile displays genuine user details with zero artificial address fallbacks',
    !userAuthModalJsx.includes("'Indiranagar, Bengaluru'") &&
    !userAuthModalJsx.includes("• 'Bengaluru'") &&
    userAuthModalJsx.includes('Not added yet (provided when booking a service)')
  );

  console.log(`\n========================================`);
  console.log(`Services Page Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runServicesPageTests();
