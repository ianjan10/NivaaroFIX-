import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runHeroExperienceTests() {
  console.log('🧪 Running NivaaroFix Hero & Master Homepage Integrity Unit Tests...\n');

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

  const heroJsxPath = path.resolve(__dirname, '../src/components/HeroSearchSection.jsx');
  const homeJsxPath = path.resolve(__dirname, '../src/pages/HomePage.jsx');
  const whyJsxPath = path.resolve(__dirname, '../src/components/WhyNivaaroSection.jsx');
  const servicesPreviewJsxPath = path.resolve(__dirname, '../src/components/ServicesPreviewSection.jsx');
  const howItWorksJsxPath = path.resolve(__dirname, '../src/components/HowItWorksSection.jsx');
  const brandCtaJsxPath = path.resolve(__dirname, '../src/components/BrandStatementAndCtaSection.jsx');
  const footerJsxPath = path.resolve(__dirname, '../src/components/AppFooter.jsx');
  const cssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');

  const heroJsx = fs.readFileSync(heroJsxPath, 'utf8');
  const homeJsx = fs.readFileSync(homeJsxPath, 'utf8');
  const whyJsx = fs.readFileSync(whyJsxPath, 'utf8');
  const servicesPreviewJsx = fs.readFileSync(servicesPreviewJsxPath, 'utf8');
  const howItWorksJsx = fs.readFileSync(howItWorksJsxPath, 'utf8');
  const brandCtaJsx = fs.readFileSync(brandCtaJsxPath, 'utf8');
  const footerJsx = fs.readFileSync(footerJsxPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Clean Hero Copy & Visual Structure
  report('Hero headline matches "Fixes, handled with [word]"', 
    heroJsx.includes('Fixes, handled') && heroJsx.includes('with')
  );
  report('Hero rotating words include only restrained set [confidence, care, precision]', 
    heroJsx.includes("'confidence'") && heroJsx.includes("'care'") && heroJsx.includes("'precision'")
  );
  report('Hero supporting sentence is "Tell us what\'s wrong and find the right professional for the job."', 
    heroJsx.includes("Tell us what's wrong and find the right professional for the job.")
  );
  report('Hero label is "WHAT NEEDS FIXING?" and placeholder is "What\'s wrong at home?"', 
    heroJsx.includes('WHAT NEEDS FIXING?') && 
    (heroJsx.includes('placeholder="What\'s wrong at home?"') || (heroJsx.includes("What's wrong at home?") && heroJsx.includes('t.searchPlaceholder')))
  );
  report('Hero CTA button reads "Find a Pro" with arrow', 
    heroJsx.includes('Find a Pro') && heroJsx.includes('id="hero-find-pro-btn"')
  );
  report('Hero popular searches are restrained strictly to [MCB trip, Switchboard, Tap leak, Pipe leak]', 
    heroJsx.includes('MCB trip') && heroJsx.includes('Switchboard') && 
    heroJsx.includes('Tap leak') && heroJsx.includes('Pipe leak')
  );

  // 2. Elimination of Fabricated Claims
  report('Hero has zero fake warranty claims or repetitive trust micro-copy',
    !heroJsx.includes('30-day warranty') && !heroJsx.includes('90-day') &&
    !heroJsx.includes('Clear pricing') && !heroJsx.includes('Verified professionals')
  );

  report('Footer has zero fake certifications (No ISO 9001:2015, No 90-Day Warranty)',
    !footerJsx.includes('ISO 9001') && !footerJsx.includes('90-Day') &&
    footerJsx.includes('Home repairs, handled with clarity.')
  );

  // 3. Exact 6-Part Homepage Structure
  report('HomePage includes exact 6-part editorial sequence without demo/traction clutter',
    homeJsx.includes('HeroSearchSection') &&
    homeJsx.includes('WhyNivaaroSection') &&
    homeJsx.includes('ServicesPreviewSection') &&
    homeJsx.includes('HowItWorksSection') &&
    homeJsx.includes('BrandStatementAndCtaSection') &&
    homeJsx.includes('AppFooter') &&
    !homeJsx.includes('ProjectVisualTourSection') &&
    !homeJsx.includes('TrustStrip') &&
    !homeJsx.includes('LiveEtaTeaserSection') &&
    !homeJsx.includes('VerifiedReviewsCarousel') &&
    !homeJsx.includes('PartnerJoinBanner')
  );

  // 4. Why Nivaaro Section Principles
  report('WhyNivaaroSection contains 3 numbered principles (Verification, Clarity, Accountability)',
    whyJsx.includes('Good service starts with clear expectations.') &&
    whyJsx.includes('VERIFICATION') && whyJsx.includes("Know who you're inviting into your home.") &&
    whyJsx.includes('CLARITY') && whyJsx.includes('Understand the service before you commit.') &&
    whyJsx.includes('ACCOUNTABILITY') && whyJsx.includes('Keep a clear record from request to resolution.')
  );

  // 5. Services Preview (Restrained)
  report('ServicesPreviewSection contains Electrician & Plumber without prices or fake pro counts',
    servicesPreviewJsx.includes('Start with what needs fixing.') &&
    servicesPreviewJsx.includes('Electrician') &&
    servicesPreviewJsx.includes('Plumber') &&
    !servicesPreviewJsx.includes('₹') &&
    !servicesPreviewJsx.includes('pros nearby')
  );

  // 6. How It Works (3 Steps)
  report('HowItWorksSection contains 3 consumer steps (Tell us, Find service, Book)',
    howItWorksJsx.includes('From problem to professional.') &&
    howItWorksJsx.includes("Tell us what's wrong.") &&
    howItWorksJsx.includes('Find the right service.') &&
    howItWorksJsx.includes("Book when you're ready.")
  );

  // 7. Quiet Brand Statement & Final Editorial CTA
  report('BrandStatementAndCtaSection renders quiet italic statement and editorial CTA',
    brandCtaJsx.includes('"Home repairs, handled with confidence."') &&
    brandCtaJsx.includes("Tell us what's wrong.") &&
    brandCtaJsx.includes("NOT SURE WHERE TO START?")
  );

  console.log(`\n========================================`);
  console.log(`Hero & Master Homepage Integrity Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runHeroExperienceTests();
