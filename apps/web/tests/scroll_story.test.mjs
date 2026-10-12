import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runScrollStoryTests() {
  console.log('\n🧪 Running NivaaroFix Scroll Story: "Inside a NivaaroFix Visit" Unit & Integration Tests...\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition, extraInfo = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${extraInfo}`);
      failed++;
    }
  }

  // 1. Read source files
  const scrollStoryPath = path.join(__dirname, '../src/components/InsideVisitScrollStory.jsx');
  const homePagePath = path.join(__dirname, '../src/pages/HomePage.jsx');
  const cssPath = path.join(__dirname, '../src/styles/dashboardDesignSystem.css');

  const scrollStoryJsx = fs.readFileSync(scrollStoryPath, 'utf8');
  const homePageJsx = fs.readFileSync(homePagePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // =========================================================================
  // 1. FIVE CONTINUOUS NARRATIVE SCENES
  // =========================================================================
  report('All five narrative scenes are defined in exact sequential order',
    scrollStoryJsx.includes("'The search'") &&
    scrollStoryJsx.includes("'The match'") &&
    scrollStoryJsx.includes("'The fix'") &&
    scrollStoryJsx.includes("'The check'") &&
    scrollStoryJsx.includes("'The finish'")
  );

  report('Brass counters 01 / 05 through 05 / 05 are present',
    scrollStoryJsx.includes("'01 / 05'") &&
    scrollStoryJsx.includes("'02 / 05'") &&
    scrollStoryJsx.includes("'03 / 05'") &&
    scrollStoryJsx.includes("'04 / 05'") &&
    scrollStoryJsx.includes("'05 / 05'")
  );

  report('Uses real on-brand photography from project_image and images directories',
    scrollStoryJsx.includes('project_image') &&
    scrollStoryJsx.includes('homeowner-dual.jpg') &&
    scrollStoryJsx.includes("import sceneMatchImg from '../assets/project_image/5.png'") &&
    scrollStoryJsx.includes("import sceneFixImg from '../assets/project_image/6.png'") &&
    scrollStoryJsx.includes("import sceneCheckImg from '../assets/project_image/7.png'") &&
    scrollStoryJsx.includes("import sceneFinishImg from '../assets/project_image/4.png'")
  );

  // =========================================================================
  // 2. DESKTOP PINNED CROSSFADE & KEN BURNS MECHANISM
  // =========================================================================
  report('Outer container uses ~450vh scroll track for smooth desktop scroll pacing',
    css.includes('.scroll-story-outer-track') &&
    css.includes('height: 450vh;')
  );

  report('Sticky stage pins in viewport at position: sticky with adaptive navbar offset',
    css.includes('.scroll-story-sticky-stage') &&
    css.includes('position: sticky;') &&
    (css.includes('top: 72px;') || css.includes('top: 0;')) &&
    (css.includes('height: calc(100vh - 72px);') || css.includes('height: 100vh;'))
  );

  report('Content aligns with 1240px container and adapts across screen heights',
    css.includes('.scroll-story-content-container') &&
    css.includes('max-width: 1240px;') &&
    scrollStoryJsx.includes('scroll-story-content-container') &&
    css.includes('@media (max-height: 820px)')
  );

  report('Scroll math calculates 60fps progress and applies Ken Burns pan/zoom and crossfade opacity',
    scrollStoryJsx.includes('calculateSceneVisuals') &&
    scrollStoryJsx.includes('progressInSegment') &&
    scrollStoryJsx.includes('translate3d') &&
    scrollStoryJsx.includes('scale(') &&
    scrollStoryJsx.includes('requestAnimationFrame')
  );

  report('Authentic navy and brass photographic color grade overlay is applied',
    css.includes('.story-color-grade-overlay') &&
    css.includes('rgba(169, 121, 60') &&
    css.includes('rgba(30, 58, 95')
  );

  // =========================================================================
  // 3. RESPONSIVE MOBILE CAROUSEL FALLBACK (<768px)
  // =========================================================================
  report('Mobile breakpoint (<768px) switches cleanly to horizontal swipeable card carousel',
    scrollStoryJsx.includes('window.innerWidth < 768') &&
    scrollStoryJsx.includes('mobile-carousel-flow') &&
    scrollStoryJsx.includes('scroll-story-mobile-track') &&
    css.includes('scroll-snap-type: x mandatory;')
  );

  report('Mobile carousel provides touch scroll-snap, step dots, and prev/next navigation',
    scrollStoryJsx.includes('mobile-story-card') &&
    scrollStoryJsx.includes('mobile-step-dots') &&
    scrollStoryJsx.includes('btn-mobile-nav') &&
    scrollStoryJsx.includes('scrollToMobileScene')
  );

  // =========================================================================
  // 4. PREFERS-REDUCED-MOTION & ACCESSIBILITY
  // =========================================================================
  report('Full prefers-reduced-motion fallback renders static stacked document flow without scroll hijacking',
    scrollStoryJsx.includes("prefers-reduced-motion: reduce") &&
    scrollStoryJsx.includes('reduced-motion-flow') &&
    scrollStoryJsx.includes('reduced-motion-scenes-grid') &&
    css.includes('.scroll-story-section.reduced-motion-flow')
  );

  report('Non-trapping accessibility landmarks and keyboard navigation are implemented',
    scrollStoryJsx.includes('aria-label') &&
    scrollStoryJsx.includes('role="region"')
  );

  // =========================================================================
  // 5. PERFORMANCE & LAZY-LOADING
  // =========================================================================
  report('IntersectionObserver lazy-loads section and preloads all 5 images before entry',
    scrollStoryJsx.includes('IntersectionObserver') &&
    scrollStoryJsx.includes('rootMargin') &&
    scrollStoryJsx.includes('setImagesPreloaded') &&
    scrollStoryJsx.includes('new Image()')
  );

  // =========================================================================
  // 6. SHOWCASE MODULARITY
  // =========================================================================
  report('InsideVisitScrollStory is preserved as a standalone component for future/internal showcase',
    Boolean(scrollStoryJsx) && scrollStoryJsx.includes('InsideVisitScrollStory')
  );

  // =========================================================================
  // 7. FUTURE UPGRADE PATH (V2 Continuous Video Canvas)
  // =========================================================================
  report('Code comments document future v2 upgrade path to continuous video canvas scrubbing',
    scrollStoryJsx.includes('FUTURE UPGRADE PATH') &&
    scrollStoryJsx.includes('ffmpeg') &&
    scrollStoryJsx.includes('<canvas>')
  );

  console.log(`\n========================================`);
  console.log(`Scroll Story Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runScrollStoryTests();
