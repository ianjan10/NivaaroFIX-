import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAboutPageTests() {
  console.log('🧪 Running NivaaroFix Editorial Brand About Page Tests...\n');

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

  const aboutJsxPath = path.resolve(__dirname, '../src/pages/AboutPage.jsx');
  const closingJsxPath = path.resolve(__dirname, '../src/components/AboutClosingStatement.jsx');
  const cssPath = path.resolve(__dirname, '../src/styles/dashboardDesignSystem.css');

  const aboutJsx = fs.readFileSync(aboutJsxPath, 'utf8');
  const closingJsx = fs.readFileSync(closingJsxPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Unverified Metrics & Emoji Icons Removed
  report('Removed all fabricated stats (15,000+, 4.96, 30 Mins, 100%)', 
    !aboutJsx.includes('15000') && !aboutJsx.includes('4.96') && 
    !aboutJsx.includes('15,000+') && !aboutJsx.includes('AnimatedStatNumber')
  );
  report('Zero emoji icons in About page (⚡, 💧, ✦ removed)', 
    !aboutJsx.includes('⚡') && !aboutJsx.includes('💧') && !aboutJsx.includes('✦')
  );

  // 2. Confident Hero
  report('Redundant "Back to Home" button and bar removed for clean top vertical flow',
    !aboutJsx.includes('Back to Home') &&
    !aboutJsx.includes('about-back-btn') &&
    !aboutJsx.includes('about-nav-bar') &&
    !css.includes('.about-back-btn')
  );
  report('Hero contains headline "Better home repairs start with better trust."', 
    aboutJsx.includes('Better home repairs') && aboutJsx.includes('start with better trust.')
  );
  report('No startup status badges (Building now / Launching soon removed)', 
    !aboutJsx.includes('Building now • Launching soon') && !aboutJsx.includes('about-status-badge')
  );

  // 3. Four Core Principles
  report('Contains four numbered principles: Verification, Clarity, Responsiveness, Accountability', 
    aboutJsx.includes("'01'") && aboutJsx.includes('Verification') &&
    aboutJsx.includes("'02'") && aboutJsx.includes('Clarity') &&
    aboutJsx.includes("'03'") && aboutJsx.includes('Responsiveness') &&
    aboutJsx.includes("'04'") && aboutJsx.includes('Accountability')
  );
  report('CSS supports principle card hover lift and expanding gold line', 
    css.includes('.principle-card:hover') && css.includes('.principle-line')
  );

  // 4. Motivation Section (Clean Editorial 2-Column with Electrician Photo)
  report('Motivation section contains "Home repairs shouldn\'t require guesswork."',
    aboutJsx.includes("Home repairs shouldn't require guesswork.")
  );
  report('Electrician photo is rendered cleanly without captions or questions panel',
    aboutJsx.includes('/project_image/5.png') &&
    !aboutJsx.includes('Real craftsmanship, transparent standards.') &&
    !aboutJsx.includes('THE QUESTIONS WE\'RE SOLVING') &&
    !aboutJsx.includes('HomeownerRealityPanel') &&
    !css.includes('.story-image-caption') &&
    !css.includes('.homeowner-reality-panel')
  );
  report('Motivation section uses vertically centered grid layout',
    css.includes('.about-story-grid') &&
    css.includes('align-items: center;')
  );

  // 5. Four Journey Steps
  report('Contains four journey steps from "Tell us what\'s wrong" to "Book with confidence"', 
    aboutJsx.includes("Tell us what's wrong") &&
    aboutJsx.includes("Find the right professional") &&
    aboutJsx.includes("Understand the service") &&
    aboutJsx.includes("Book with confidence")
  );

  // 6. Refined "Where We Start" Section (No Roadmap, No Expansion Jargon)
  report('Section eyebrow is "WHERE WE START" and headline is "Trusted help for the work your home needs."',
    aboutJsx.includes('WHERE WE START') &&
    aboutJsx.includes('Trusted help for the work your home needs.')
  );
  report('Lead text is concise factual sentence: "NivaaroFix connects customers with skilled professionals for essential home repairs."',
    aboutJsx.includes('NivaaroFix connects customers with skilled professionals for essential home repairs.')
  );
  report('Zero roadmap language (INITIAL DOMAIN, FUTURE EXPANSION, Additional Trade Domains removed)',
    !aboutJsx.includes('ROADMAP & FOCUS') &&
    !aboutJsx.includes('INITIAL DOMAIN') &&
    !aboutJsx.includes('FUTURE EXPANSION') &&
    !aboutJsx.includes('Additional Trade Domains') &&
    !aboutJsx.includes('Starting focused. Building for more.')
  );
  report('Renders two refined service panels (Electrician & Plumber) with clean problem lines',
    aboutJsx.includes('01') &&
    aboutJsx.includes('ELECTRICAL SERVICES') &&
    aboutJsx.includes('Electrician') &&
    aboutJsx.includes('MCB & Fuse') &&
    aboutJsx.includes('02') &&
    aboutJsx.includes('PLUMBING SERVICES') &&
    aboutJsx.includes('Plumber') &&
    aboutJsx.includes('Tap & Mixer')
  );

  // 7. Editorial Closing Manifesto Component (AboutClosingStatement)
  report('AboutClosingStatement is imported and rendered in AboutPage', 
    aboutJsx.includes('AboutClosingStatement') &&
    aboutJsx.includes('<AboutClosingStatement')
  );
  report('Closing section contains "THE NIVAAROFIX WAY" label', 
    closingJsx.includes('THE NIVAAROFIX WAY')
  );
  report('Closing section contains headline "Home repairs, handled differently."', 
    closingJsx.includes('Home repairs,') && closingJsx.includes('handled differently.')
  );
  report('Closing section contains supporting statement and brand signature', 
    closingJsx.includes('Less uncertainty. Better professionals. Clearer service.') &&
    closingJsx.includes('Find the right help. Know what to expect.') &&
    closingJsx.includes('Feel confident choosing.')
  );
  report('Closing section includes typographic statement "TRUST BEFORE THE FIX."', 
    closingJsx.includes('TRUST') && closingJsx.includes('BEFORE') && closingJsx.includes('THE FIX.')
  );
  report('Closing section features text-based "Explore NivaaroFix →" link with animated underline', 
    closingJsx.includes('Explore NivaaroFix') &&
    css.includes('.closing-explore-link') &&
    css.includes('.closing-explore-link::after')
  );
  report('Secondary professional link "Join NivaaroFix" is cleanly positioned below CTA', 
    closingJsx.includes('For skilled professionals →') &&
    closingJsx.includes('Join NivaaroFix') &&
    closingJsx.includes('http://localhost:5500?portal=agent')
  );
  report('No generic dark box CTA container (.about-cta-banner removed)', 
    !aboutJsx.includes('about-cta-banner') && !css.includes('.about-cta-banner')
  );

  console.log(`\n========================================`);
  console.log(`About Page Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runAboutPageTests();
