import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const rootDir = process.cwd();
const scratchFontsDir = path.join(rootDir, 'scratch', 'fonts');

// Load Montserrat Medium & Regular for clean, minimalist, mathematical vector outlines
const montMediumBuf = fs.readFileSync(path.join(scratchFontsDir, 'Montserrat-Medium.ttf'));
const montMedium = opentype.parse(montMediumBuf.buffer.slice(montMediumBuf.byteOffset, montMediumBuf.byteOffset + montMediumBuf.byteLength));

const montRegBuf = fs.readFileSync(path.join(scratchFontsDir, 'Montserrat-Regular.ttf'));
const montReg = opentype.parse(montRegBuf.buffer.slice(montRegBuf.byteOffset, montRegBuf.byteOffset + montRegBuf.byteLength));

const COLOR_INK = '#1C1C1E'; // Charcoal defined as --logo-ink
const COLOR_LIGHT = '#FFFFFF';
const COLOR_BG_WARM = '#F7F5F1';
const COLOR_BG_GREEN = '#047857';
const COLOR_BG_DARK = '#121214';

/**
 * 1. Mark Geometry (viewBox: 0 0 240 240)
 * Center at X=120. Stroke W=14.
 * Symmetrical gable roof with rounded peak & plumb cut eaves.
 * Unambiguous N + F monogram.
 */
export function getMarkSvgInner(color = COLOR_INK, strokeWidth = 14) {
  return `
  <!-- Roof: clean gable angle, rounded apex, plumb cut eaves -->
  <path d="
    M 28 100 
    L 28 85 
    L 116 33 
    Q 120 30.5 124 33 
    L 212 85 
    L 212 100 
    L 124 48 
    Q 120 46 116 48 
    Z
  " fill="${color}"/>
  
  <!-- Monogram N + F -->
  <!-- Left stem -->
  <rect x="66" y="92" width="${strokeWidth}" height="92" fill="${color}"/>
  
  <!-- Diagonal of N (miters flush at top-left and bottom-right) -->
  <polygon points="66,92 ${66 + strokeWidth},92 138,184 ${138 - strokeWidth},184" fill="${color}"/>
  
  <!-- Right stem of N / Spine of F -->
  <rect x="124" y="92" width="${strokeWidth}" height="92" fill="${color}"/>
  
  <!-- F Top Arm -->
  <rect x="138" y="92" width="36" height="${strokeWidth}" fill="${color}"/>
  
  <!-- F Middle Bar -->
  <rect x="138" y="134" width="28" height="${strokeWidth - 0.5}" fill="${color}"/>
  `;
}

/**
 * Helper to render word outlines via opentype
 */
function renderWordOutlines(font, text, fontSize, tracking = 0) {
  const glyphs = font.stringToGlyphs(text);
  let x = 0;
  const paths = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (i > 0) {
      x += (font.getKerningValue(glyphs[i - 1], g) / font.unitsPerEm) * fontSize;
    }
    paths.push(g.getPath(x, 0, fontSize).toPathData(2));
    x += (g.advanceWidth / font.unitsPerEm) * fontSize + tracking;
  }
  return { pathData: paths.join(' '), width: x };
}

/**
 * Helper to render word outlines with exact optical start and end alignment
 */
function renderWordOutlinesExact(font, text, fontSize, targetStartX, targetEndX) {
  const glyphs = font.stringToGlyphs(text);
  const targetWidth = targetEndX - targetStartX;
  
  const g0 = glyphs[0];
  const g0Bbox = g0.getBoundingBox();
  const g0LeftBearing = (g0Bbox.x1 / font.unitsPerEm) * fontSize;
  
  const gLast = glyphs[glyphs.length - 1];
  const gLastBbox = gLast.getBoundingBox();
  const gLastRightEdgeOffset = (gLastBbox.x2 / font.unitsPerEm) * fontSize;
  
  let sumAdvances = 0;
  for (let i = 0; i < glyphs.length - 1; i++) {
    const kern = (font.getKerningValue(glyphs[i], glyphs[i + 1]) / font.unitsPerEm) * fontSize;
    sumAdvances += (glyphs[i].advanceWidth / font.unitsPerEm) * fontSize + kern;
  }
  
  const untrackedSpan = -g0LeftBearing + sumAdvances + gLastRightEdgeOffset;
  const tracking = (targetWidth - untrackedSpan) / (glyphs.length - 1);
  
  let x = targetStartX - g0LeftBearing;
  const paths = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (i > 0) {
      x += (font.getKerningValue(glyphs[i - 1], g) / font.unitsPerEm) * fontSize;
    }
    if (g.unicode !== 32) {
      paths.push(g.getPath(x, 0, fontSize).toPathData(2));
    }
    if (i < glyphs.length - 1) {
      x += (g.advanceWidth / font.unitsPerEm) * fontSize + tracking;
    }
  }
  
  return { pathData: paths.join(' '), tracking };
}

// 2. Minimalist Wordmark: "NivaaroFix"
const wmHoriz = renderWordOutlines(montMedium, 'NivaaroFix', 24, 0.3);
const wmFull = renderWordOutlines(montMedium, 'NivaaroFix', 42, 0.5);

// 3. Tagline: "ELEVATING THE EVERYDAY"
const tagText = 'ELEVATING THE EVERYDAY';
const tagGlyphs = montReg.stringToGlyphs(tagText);
let rawW = 0;
for (const g of tagGlyphs) rawW += (g.advanceWidth / montReg.unitsPerEm) * 11;
const tagTracking = (wmFull.width - rawW) / (tagGlyphs.length - 1);
const tagFull = renderWordOutlines(montReg, tagText, 11, tagTracking);

// 4. Horizontal Tagline: "ELEVATING THE EVERYDAY" exactly flush with wordmark left (2.52) & right (130.932)
const tagHoriz = renderWordOutlinesExact(montReg, tagText, 6.5, 2.52, 130.932);

/**
 * SVG Generators
 */
export function generateMarkSvg(color = COLOR_INK) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" fill="none">
  ${getMarkSvgInner(color, 14)}
</svg>`;
}

/**
 * Favicon SVG with White Circle Badge
 * Guarantees 100% visibility on ANY browser tab (Dark mode, Light mode, etc.)
 */
export function generateFaviconWithWhiteCircleSvg(size = 240) {
  // Center: X=120, Y=120. Mark center: X=120, Y=107.25.
  // Scale 1.08 makes the mark look BIG, bold, and clear on any browser tab.
  const scale = 1.08;
  const tx = (120 - 120 * scale).toFixed(2);
  const ty = (120 - 107.25 * scale).toFixed(2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="${size}" height="${size}">
  <!-- Solid White Circle Background filling the favicon canvas -->
  <circle cx="120" cy="120" r="119" fill="#FFFFFF"/>
  
  <!-- Big Charcoal Shelter Mark centered with bold optical weight -->
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    ${getMarkSvgInner(COLOR_INK, 16)}
  </g>
</svg>`;
}

export function generateHorizontalSvg(color = COLOR_INK) {
  // viewBox: 0 0 190 48
  // Mark on left (scale 0.1667 -> 40px), Wordmark "NivaaroFix" on right
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 48" width="190" height="48" fill="none">
  <g transform="translate(4, 4) scale(0.1667)">
    ${getMarkSvgInner(color, 14)}
  </g>
  <g transform="translate(50, 31)">
    <path d="${wmHoriz.pathData}" fill="${color}"/>
  </g>
</svg>`;
}

/**
 * Integrated Horizontal Lockup with Tagline: ONE single SVG
 * Mark on left vertically centered with wordmark + tagline stack
 * Tagline left edge flush with "N" (2.52), right edge flush with "x" (130.932)
 * Gap below wordmark is 5.6px (~1/3 cap height)
 */
export function generateHorizontalTaglineSvg(color = COLOR_INK) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 48" width="190" height="48" fill="none">
  <g transform="translate(4, 4) scale(0.1667)">
    ${getMarkSvgInner(color, 14)}
  </g>
  <g transform="translate(50, 25.2)">
    <path d="${wmHoriz.pathData}" fill="${color}"/>
  </g>
  <g transform="translate(50, 35.35)">
    <path d="${tagHoriz.pathData}" fill="${color}"/>
  </g>
</svg>`;
}

export function generateFullSvg(color = COLOR_INK) {
  // viewBox: 0 0 420 300
  const fullBoxW = 420;
  const fullBoxH = 300;
  const markScale = 0.58;
  const markW = 240 * markScale;
  const markX = (fullBoxW - markW) / 2;
  const wmX = (fullBoxW - wmFull.width) / 2;
  const tagX = (fullBoxW - tagFull.width) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullBoxW} ${fullBoxH}" width="${fullBoxW}" height="${fullBoxH}" fill="none">
  <g transform="translate(${markX}, 28) scale(${markScale})">
    ${getMarkSvgInner(color, 14)}
  </g>
  <g transform="translate(${wmX}, 205)">
    <path d="${wmFull.pathData}" fill="${color}"/>
  </g>
  <g transform="translate(${tagX}, 242)">
    <path d="${tagFull.pathData}" fill="${color}"/>
  </g>
</svg>`;
}

/**
 * Open Graph / Twitter Card Image SVG (1200x630)
 */
export function generateOgImageSvg() {
  const markScale = 0.85;
  const markSize = 240 * markScale;
  const markX = (1200 - markSize) / 2;
  const wmX = (1200 - wmFull.width * 1.5) / 2;
  const tagX = (1200 - tagFull.width * 1.5) / 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${COLOR_BG_WARM}"/>
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="rgba(28,28,30,0.08)" stroke-width="2"/>
  
  <!-- Centered White Circular Badge for Logo Display -->
  <g transform="translate(${markX}, 90) scale(${markScale})">
    ${getMarkSvgInner(COLOR_INK, 14)}
  </g>
  <g transform="translate(${wmX}, 380) scale(1.5)">
    <path d="${wmFull.pathData}" fill="${COLOR_INK}"/>
  </g>
  <g transform="translate(${tagX}, 440) scale(1.5)">
    <path d="${tagFull.pathData}" fill="${COLOR_INK}"/>
  </g>
  
  <text x="600" y="550" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif" font-size="16" font-weight="500" fill="#64748B" text-anchor="middle" letter-spacing="1">
    HOME REPAIRS, HANDLED WITH CLARITY.
  </text>
</svg>`;
}

/**
 * Review Sheet SVG (docs/brand/logo-review.png)
 */
export function generateReviewSheetSvg() {
  const width = 1600;
  const height = 1200;
  
  const fullBoxW = 420;
  const markScale = 0.58;
  const markW = 240 * markScale;
  const markX = (fullBoxW - markW) / 2;
  const wmX = (fullBoxW - wmFull.width) / 2;
  const tagX = (fullBoxW - tagFull.width) / 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0F1115"/>
  
  <text x="60" y="60" font-family="'Plus Jakarta Sans', -apple-system, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF" letter-spacing="-0.5">
    NivaaroFix — Minimalist Vector Brand Identity System
  </text>
  <text x="60" y="90" font-family="'Plus Jakarta Sans', -apple-system, sans-serif" font-size="14" font-weight="400" fill="#94A3B8">
    Precision Architectural Monogram (N+F), Minimalist Geometric Wordmark &amp; White Circle Browser Favicon
  </text>
  
  <!-- Panel 1: Pure White Background -->
  <g transform="translate(60, 120)">
    <rect width="700" height="490" rx="16" fill="#FFFFFF"/>
    <text x="24" y="36" font-family="sans-serif" font-size="12" font-weight="600" fill="#64748B" letter-spacing="1">1. PURE WHITE BACKGROUND (#FFFFFF)</text>
    
    <!-- Full Lockup Display -->
    <g transform="translate(50, 60) scale(0.7)">
      <g transform="translate(${markX}, 28) scale(${markScale})">
        ${getMarkSvgInner(COLOR_INK, 14)}
      </g>
      <g transform="translate(${wmX}, 205)">
        <path d="${wmFull.pathData}" fill="${COLOR_INK}"/>
      </g>
      <g transform="translate(${tagX}, 242)">
        <path d="${tagFull.pathData}" fill="${COLOR_INK}"/>
      </g>
    </g>
    
    <!-- Horizontal Header Lockup -->
    <g transform="translate(380, 80)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#94A3B8">Minimalist Header Lockup (36px):</text>
      <g transform="translate(0, 0)">
        <g transform="translate(0, 0) scale(0.1667)">
          ${getMarkSvgInner(COLOR_INK, 14)}
        </g>
        <g transform="translate(48, 28)">
          <path d="${wmHoriz.pathData}" fill="${COLOR_INK}"/>
        </g>
      </g>
    </g>
    
    <!-- Browser Favicon with White Circle Preview -->
    <g transform="translate(380, 200)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#94A3B8">Browser Favicon in White Circle (64px, 32px, 16px):</text>
      <!-- 64px -->
      <g transform="translate(0, 0) scale(0.2667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="4"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <!-- 32px -->
      <g transform="translate(85, 16) scale(0.1333)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="6"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <!-- 16px -->
      <g transform="translate(140, 24) scale(0.0667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="8"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
    </g>
    
    <text x="24" y="465" font-family="monospace" font-size="11" fill="#64748B">
      --logo-ink: #1C1C1E | Modern Minimalist Geometric Typography | Pure Vector Curves
    </text>
  </g>
  
  <!-- Panel 2: Warm Off-White Canvas -->
  <g transform="translate(840, 120)">
    <rect width="700" height="490" rx="16" fill="${COLOR_BG_WARM}"/>
    <text x="24" y="36" font-family="sans-serif" font-size="12" font-weight="600" fill="#78716C" letter-spacing="1">2. WARM OFF-WHITE CANVAS (#F7F5F1)</text>
    
    <g transform="translate(50, 60) scale(0.7)">
      <g transform="translate(${markX}, 28) scale(${markScale})">
        ${getMarkSvgInner(COLOR_INK, 14)}
      </g>
      <g transform="translate(${wmX}, 205)">
        <path d="${wmFull.pathData}" fill="${COLOR_INK}"/>
      </g>
      <g transform="translate(${tagX}, 242)">
        <path d="${tagFull.pathData}" fill="${COLOR_INK}"/>
      </g>
    </g>
    
    <g transform="translate(380, 80)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#78716C">Minimalist Header Lockup (36px):</text>
      <g transform="translate(0, 0)">
        <g transform="translate(0, 0) scale(0.1667)">
          ${getMarkSvgInner(COLOR_INK, 14)}
        </g>
        <g transform="translate(48, 28)">
          <path d="${wmHoriz.pathData}" fill="${COLOR_INK}"/>
        </g>
      </g>
    </g>
    
    <g transform="translate(380, 200)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#78716C">Browser Favicon in White Circle:</text>
      <g transform="translate(0, 0) scale(0.2667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="rgba(0,0,0,0.06)" stroke-width="4"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <g transform="translate(85, 16) scale(0.1333)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="rgba(0,0,0,0.06)" stroke-width="6"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <g transform="translate(140, 24) scale(0.0667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF" stroke="rgba(0,0,0,0.06)" stroke-width="8"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
    </g>
    
    <text x="24" y="465" font-family="monospace" font-size="11" fill="#78716C">
      Zero texture, zero drop shadow, zero AI watermark. Pure mathematical vector.
    </text>
  </g>
  
  <!-- Panel 3: Dark Charcoal Mode Simulation (Browser Dark Tab) -->
  <g transform="translate(60, 640)">
    <rect width="700" height="490" rx="16" fill="${COLOR_BG_DARK}"/>
    <rect width="700" height="490" rx="16" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="24" y="36" font-family="sans-serif" font-size="12" font-weight="600" fill="#94A3B8" letter-spacing="1">3. DARK BROWSER MODE SIMULATION (SHOWING WHITE CIRCLE TAB)</text>
    
    <!-- Browser Tab Simulation -->
    <g transform="translate(30, 70)">
      <rect width="320" height="50" rx="10" fill="#2D2F31" stroke="rgba(255,255,255,0.08)"/>
      <!-- White Circle Favicon inside Dark Browser Tab -->
      <g transform="translate(14, 11) scale(0.1167)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <text x="52" y="31" font-family="-apple-system, sans-serif" font-size="14" font-weight="500" fill="#FFFFFF">NivaaroFix</text>
      <text x="290" y="31" font-family="sans-serif" font-size="15" fill="#9AA0A6">×</text>
    </g>
    
    <!-- Full Lockup Light Tone -->
    <g transform="translate(360, 60) scale(0.68)">
      <g transform="translate(${markX}, 28) scale(${markScale})">
        ${getMarkSvgInner(COLOR_LIGHT, 14)}
      </g>
      <g transform="translate(${wmX}, 205)">
        <path d="${wmFull.pathData}" fill="${COLOR_LIGHT}"/>
      </g>
      <g transform="translate(${tagX}, 242)">
        <path d="${tagFull.pathData}" fill="${COLOR_LIGHT}"/>
      </g>
    </g>
    
    <!-- Header Lockup Light Tone -->
    <g transform="translate(30, 160)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#94A3B8">Header Lockup on Dark Surface:</text>
      <g transform="translate(0, 0)">
        <g transform="translate(0, 0) scale(0.1667)">
          ${getMarkSvgInner(COLOR_LIGHT, 14)}
        </g>
        <g transform="translate(48, 28)">
          <path d="${wmHoriz.pathData}" fill="${COLOR_LIGHT}"/>
        </g>
      </g>
    </g>
    
    <text x="24" y="465" font-family="monospace" font-size="11" fill="#94A3B8">
      In any browser (dark/light), the white circle badge guarantees instant, vibrant clarity.
    </text>
  </g>
  
  <!-- Panel 4: Brand Emerald Green Canvas -->
  <g transform="translate(840, 640)">
    <rect width="700" height="490" rx="16" fill="${COLOR_BG_GREEN}"/>
    <text x="24" y="36" font-family="sans-serif" font-size="12" font-weight="600" fill="#A7F3D0" letter-spacing="1">4. BRAND EMERALD GREEN CANVAS (#047857)</text>
    
    <g transform="translate(50, 60) scale(0.7)">
      <g transform="translate(${markX}, 28) scale(${markScale})">
        ${getMarkSvgInner(COLOR_LIGHT, 14)}
      </g>
      <g transform="translate(${wmX}, 205)">
        <path d="${wmFull.pathData}" fill="${COLOR_LIGHT}"/>
      </g>
      <g transform="translate(${tagX}, 242)">
        <path d="${tagFull.pathData}" fill="${COLOR_LIGHT}"/>
      </g>
    </g>
    
    <g transform="translate(380, 80)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#A7F3D0">Minimalist Header Lockup (36px):</text>
      <g transform="translate(0, 0)">
        <g transform="translate(0, 0) scale(0.1667)">
          ${getMarkSvgInner(COLOR_LIGHT, 14)}
        </g>
        <g transform="translate(48, 28)">
          <path d="${wmHoriz.pathData}" fill="${COLOR_LIGHT}"/>
        </g>
      </g>
    </g>
    
    <!-- White Circle Favicon on Green -->
    <g transform="translate(380, 200)">
      <text x="0" y="-12" font-family="sans-serif" font-size="11" font-weight="600" fill="#A7F3D0">Favicon in White Circle Badge:</text>
      <g transform="translate(0, 0) scale(0.2667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <g transform="translate(85, 16) scale(0.1333)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
      <g transform="translate(140, 24) scale(0.0667)">
        <circle cx="120" cy="120" r="119" fill="#FFFFFF"/>
        <g transform="translate(-9.60, 4.17) scale(1.08)">${getMarkSvgInner(COLOR_INK, 16)}</g>
      </g>
    </g>
    
    <text x="24" y="465" font-family="monospace" font-size="11" fill="#A7F3D0">
      Logo stays charcoal on light surfaces, reverses to clean white on brand emerald.
    </text>
  </g>
</svg>`;
}

async function run() {
  console.log('Regenerating minimalist brand assets with white circle favicons...');
  
  const docsBrandDir = path.join(rootDir, 'docs', 'brand');
  const docsSourceDir = path.join(docsBrandDir, 'source');
  fs.mkdirSync(docsSourceDir, { recursive: true });
  
  // 1. Export source SVGs to docs/brand/source/
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-mark-dark.svg'), generateMarkSvg(COLOR_INK));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-mark-light.svg'), generateMarkSvg(COLOR_LIGHT));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-horizontal-dark.svg'), generateHorizontalSvg(COLOR_INK));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-horizontal-light.svg'), generateHorizontalSvg(COLOR_LIGHT));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-horizontal-tagline-dark.svg'), generateHorizontalTaglineSvg(COLOR_INK));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-horizontal-tagline-light.svg'), generateHorizontalTaglineSvg(COLOR_LIGHT));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-full-dark.svg'), generateFullSvg(COLOR_INK));
  fs.writeFileSync(path.join(docsSourceDir, 'nivaarofix-full-light.svg'), generateFullSvg(COLOR_LIGHT));
  fs.writeFileSync(path.join(docsSourceDir, 'favicon.svg'), generateFaviconWithWhiteCircleSvg(240));
  
  // 2. Render Review Sheet docs/brand/logo-review.png (1600x1200)
  const reviewSvg = generateReviewSheetSvg();
  const reviewResvg = new Resvg(reviewSvg, { fitTo: { mode: 'width', value: 1600 } });
  fs.writeFileSync(path.join(docsBrandDir, 'logo-review.png'), reviewResvg.render().asPng());
  console.log('Rendered docs/brand/logo-review.png');
  
  // 3. Render Open Graph image (1200x630)
  const ogSvg = generateOgImageSvg();
  const ogResvg = new Resvg(ogSvg, { fitTo: { mode: 'width', value: 1200 } });
  const ogPng = ogResvg.render().asPng();
  
  // 4. Render App Icons & Favicons with White Circle Badge
  const faviconWhiteCircleSvg = generateFaviconWithWhiteCircleSvg(240);
  
  const iconSizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 }
  ];
  
  const iconBuffers = {};
  for (const icon of iconSizes) {
    const r = new Resvg(faviconWhiteCircleSvg, { fitTo: { mode: 'width', value: icon.size } });
    iconBuffers[icon.name] = r.render().asPng();
  }
  
  // Maskable PWA icon with safe padding (20% padding)
  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="${COLOR_BG_WARM}"/>
    <circle cx="256" cy="256" r="180" fill="#FFFFFF"/>
    <g transform="translate(136, 150) scale(1.0)">
      ${getMarkSvgInner(COLOR_INK, 14)}
    </g>
  </svg>`;
  const maskableResvg = new Resvg(maskableSvg, { fitTo: { mode: 'width', value: 512 } });
  const maskablePng = maskableResvg.render().asPng();
  
  // Pre-render Retina PNGs of the brand variants
  const horizSvg = generateHorizontalSvg(COLOR_INK);
  const horizResvg = new Resvg(horizSvg, { fitTo: { mode: 'width', value: 600 } });
  const horizPng = horizResvg.render().asPng();

  const horizTaglineSvg = generateHorizontalTaglineSvg(COLOR_INK);
  const horizTaglineResvg = new Resvg(horizTaglineSvg, { fitTo: { mode: 'width', value: 760 } });
  const horizTaglinePng = horizTaglineResvg.render().asPng();
  
  const fullSvg = generateFullSvg(COLOR_INK);
  const fullResvg = new Resvg(fullSvg, { fitTo: { mode: 'width', value: 840 } });
  const fullPng = fullResvg.render().asPng();
  
  const emblemResvg = new Resvg(faviconWhiteCircleSvg, { fitTo: { mode: 'width', value: 480 } });
  const emblemPng = emblemResvg.render().asPng();
  
  const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wmFull.width + 40} 60" width="${wmFull.width + 40}" height="60" fill="none">
    <g transform="translate(20, 44)">
      <path d="${wmFull.pathData}" fill="${COLOR_INK}"/>
    </g>
  </svg>`;
  const wmResvg = new Resvg(wordmarkSvg, { fitTo: { mode: 'width', value: 500 } });
  const wmPng = wmResvg.render().asPng();
  
  // Deploy assets to apps/web/public and apps/auth/public
  const publicDirs = [
    path.join(rootDir, 'apps', 'web', 'public'),
    path.join(rootDir, 'apps', 'auth', 'public')
  ];
  
  for (const pubDir of publicDirs) {
    fs.mkdirSync(pubDir, { recursive: true });
    const brandDir = path.join(pubDir, 'brand');
    fs.mkdirSync(brandDir, { recursive: true });
    
    // Favicons in root of public with White Circle
    fs.writeFileSync(path.join(pubDir, 'favicon.svg'), generateFaviconWithWhiteCircleSvg(240));
    fs.writeFileSync(path.join(pubDir, 'og-image.png'), ogPng);
    fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), maskablePng);
    
    for (const [name, buf] of Object.entries(iconBuffers)) {
      fs.writeFileSync(path.join(pubDir, name), buf);
    }
    fs.writeFileSync(path.join(pubDir, 'favicon.ico'), iconBuffers['favicon-32x32.png']);
    
    // SVGs in brand/
    fs.writeFileSync(path.join(brandDir, 'logo-mark-dark.svg'), generateMarkSvg(COLOR_INK));
    fs.writeFileSync(path.join(brandDir, 'logo-mark-light.svg'), generateMarkSvg(COLOR_LIGHT));
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal-dark.svg'), generateHorizontalSvg(COLOR_INK));
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal-light.svg'), generateHorizontalSvg(COLOR_LIGHT));
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal-tagline-dark.svg'), generateHorizontalTaglineSvg(COLOR_INK));
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal-tagline-light.svg'), generateHorizontalTaglineSvg(COLOR_LIGHT));
    fs.writeFileSync(path.join(brandDir, 'logo-full-dark.svg'), generateFullSvg(COLOR_INK));
    fs.writeFileSync(path.join(brandDir, 'logo-full-light.svg'), generateFullSvg(COLOR_LIGHT));
    
    // Standard PNGs in brand/
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal.png'), horizPng);
    fs.writeFileSync(path.join(brandDir, 'logo-horizontal-tagline.png'), horizTaglinePng);
    fs.writeFileSync(path.join(brandDir, 'logo-stacked.png'), fullPng);
    fs.writeFileSync(path.join(brandDir, 'logo-emblem.png'), emblemPng);
    fs.writeFileSync(path.join(brandDir, 'logo-wordmark.png'), wmPng);
  }
  
  console.log('Successfully regenerated all brand assets with white circle favicons & minimalist wordmark & horizontal tagline!');
}

run().catch(console.error);
