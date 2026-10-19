import fs from 'fs';
import path from 'path';

console.log('🌱 Starting NivaaroFix Brand Green Transformation...\n');

// 1. Update apps/web/src/styles/dashboardDesignSystem.css
const dashCssPath = 'c:/NivaaroFIX-/apps/web/src/styles/dashboardDesignSystem.css';
let dashCss = fs.readFileSync(dashCssPath, 'utf8');

// Insert root tokens at the top of :root
const rootTokenDef = `  /* Brand Green Design Tokens (Single Source of Truth) */
  --brand-primary: #047857;
  --brand-primary-hover: #065F46;
  --brand-primary-pressed: #064E3B;
  --brand-tint: #ECFDF5;
  --brand-tint-strong: #D1FAE5;
  --brand-tint-border: #A7F3D0;
  --focus-ring: #10B981;
  --focus-ring-offset: 2px;

  --accent-primary: var(--brand-primary);
  --accent-primary-hover: var(--brand-primary-hover);
  --accent-primary-pressed: var(--brand-primary-pressed);
  --accent-primary-subtle: var(--brand-tint);
  --accent-focus-ring: rgba(16, 185, 129, 0.22);
  --accent-luxe: var(--brand-primary);
  --accent-gold: var(--brand-primary);
  --accent-gold-hover: var(--brand-primary-hover);`;

dashCss = dashCss.replace(
  /--accent-primary:\s*#B8862F;[\s\S]*?--accent-focus-ring:\s*rgba\(184,\s*134,\s*47,\s*0\.18\);/,
  rootTokenDef
);

// Update dark-theme tokens in dashboardDesignSystem.css
const darkTokenDef = `  --brand-primary: #047857;
  --brand-primary-hover: #065F46;
  --brand-primary-pressed: #064E3B;
  --brand-tint: rgba(16, 185, 129, 0.12);
  --brand-tint-strong: rgba(16, 185, 129, 0.2);
  --brand-tint-border: rgba(16, 185, 129, 0.3);
  --focus-ring: #10B981;
  --focus-ring-offset: 2px;

  --accent-primary: var(--brand-primary);
  --accent-primary-hover: var(--brand-primary-hover);
  --accent-primary-pressed: var(--brand-primary-pressed);
  --accent-primary-subtle: var(--brand-tint);
  --accent-focus-ring: rgba(16, 185, 129, 0.3);
  --accent-luxe: var(--brand-primary);
  --accent-gold: var(--brand-primary);
  --accent-gold-hover: var(--brand-primary-hover);`;

dashCss = dashCss.replace(
  /--accent-primary:\s*#c9983e;[\s\S]*?--accent-focus-ring:\s*rgba\(201,\s*152,\s*62,\s*0\.25\);/,
  darkTokenDef
);

// Replace card hover shadow
dashCss = dashCss.replace(
  /rgba\(184,\s*134,\s*47,\s*0\.25\)/g,
  'rgba(4, 120, 87, 0.25)'
);
dashCss = dashCss.replace(
  /rgba\(201,\s*152,\s*62,\s*0\.4\)/g,
  'rgba(16, 185, 129, 0.4)'
);

// Replace remaining hardcoded gold/brass in dashboardDesignSystem.css
dashCss = dashCss.replace(/#B8862F/gi, '#047857');
dashCss = dashCss.replace(/#A37525/gi, '#065F46');
dashCss = dashCss.replace(/#A37526/gi, '#065F46');
dashCss = dashCss.replace(/#946E26/gi, '#047857');
dashCss = dashCss.replace(/#a9793c/gi, '#047857');
dashCss = dashCss.replace(/#c79752/gi, '#047857');
dashCss = dashCss.replace(/#c9983e/gi, '#047857');
dashCss = dashCss.replace(/#dbaa4d/gi, '#047857');
dashCss = dashCss.replace(/#B8860B/gi, '#047857');
dashCss = dashCss.replace(/#9A6F24/gi, '#047857');
dashCss = dashCss.replace(/rgba\(184,\s*134,\s*47,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');
dashCss = dashCss.replace(/rgba\(201,\s*152,\s*62,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');
dashCss = dashCss.replace(/rgba\(169,\s*121,\s*60,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');

// Warm tints
dashCss = dashCss.replace(/#fdf8f0/gi, '#ECFDF5');
dashCss = dashCss.replace(/#fbf3e6/gi, '#ECFDF5');
dashCss = dashCss.replace(/#f8ede0/gi, '#ECFDF5');
dashCss = dashCss.replace(/#f3ead9/gi, '#ECFDF5');
dashCss = dashCss.replace(/#faf8f5/gi, '#ECFDF5');
dashCss = dashCss.replace(/#fbf9f4/gi, '#ECFDF5');
dashCss = dashCss.replace(/#f5eedf/gi, '#ECFDF5');
dashCss = dashCss.replace(/#f2e6cf/gi, '#D1FAE5');
dashCss = dashCss.replace(/#ded7c8/gi, '#A7F3D0');
dashCss = dashCss.replace(/#e8e2d5/gi, '#A7F3D0');
dashCss = dashCss.replace(/#e3ddd0/gi, '#A7F3D0');

// Linear gradient strip under scroll scrub fill
dashCss = dashCss.replace(
  /background:\s*linear-gradient\(90deg,\s*#a9793c,\s*#dbaa4d\);/,
  'background: var(--brand-primary, #047857);'
);

// Focus rings
dashCss = dashCss.replace(
  /outline:\s*2px solid rgba\(16,\s*24,\s*32,\s*0\.4\);/g,
  'outline: 2px solid var(--focus-ring, #10B981);'
);

fs.writeFileSync(dashCssPath, dashCss, 'utf8');
console.log('✅ Updated dashboardDesignSystem.css with Brand Green tokens');

// 2. Update apps/auth/src/styles/designSystem.css
const authCssPath = 'c:/NivaaroFIX-/apps/auth/src/styles/designSystem.css';
let authCss = fs.readFileSync(authCssPath, 'utf8');

authCss = authCss.replace(
  /--footer-link-hover:\s*#B8862F;/,
  '--footer-link-hover: #047857;'
);

const authRootTokenDef = `  /* Brand Green Design Tokens */
  --brand-primary: #047857;
  --brand-primary-hover: #065F46;
  --brand-primary-pressed: #064E3B;
  --brand-tint: #ECFDF5;
  --brand-tint-strong: #D1FAE5;
  --brand-tint-border: #A7F3D0;
  --focus-ring: #10B981;
  --focus-ring-offset: 2px;

  --accent-gold: var(--brand-primary);
  --accent-gold-hover: var(--brand-primary-hover);
  --accent-luxe: var(--brand-primary);
  --accent-luxe-ring: rgba(16, 185, 129, 0.2);`;

authCss = authCss.replace(
  /--accent-gold:\s*#B8862F;[\s\S]*?--accent-luxe-ring:\s*rgba\(184,\s*134,\s*47,\s*0\.18\);/,
  authRootTokenDef
);

const authDarkTokenDef = `  --brand-primary: #047857;
  --brand-primary-hover: #065F46;
  --brand-primary-pressed: #064E3B;
  --brand-tint: rgba(16, 185, 129, 0.12);
  --brand-tint-strong: rgba(16, 185, 129, 0.2);
  --brand-tint-border: rgba(16, 185, 129, 0.3);
  --focus-ring: #10B981;

  --accent-gold: var(--brand-primary);
  --accent-gold-hover: var(--brand-primary-hover);
  --accent-luxe: var(--brand-primary);
  --accent-luxe-ring: rgba(16, 185, 129, 0.25);`;

authCss = authCss.replace(
  /--accent-gold:\s*#c9983e;[\s\S]*?--accent-luxe-ring:\s*rgba\(201,\s*152,\s*62,\s*0\.2\);/,
  authDarkTokenDef
);

authCss = authCss.replace(/#B8862F/gi, '#047857');
authCss = authCss.replace(/#A37525/gi, '#065F46');
authCss = authCss.replace(/#a9793c/gi, '#047857');
authCss = authCss.replace(/#c79752/gi, '#047857');
authCss = authCss.replace(/#c9983e/gi, '#047857');
authCss = authCss.replace(/#dbaa4d/gi, '#047857');
authCss = authCss.replace(/rgba\(184,\s*134,\s*47,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');
authCss = authCss.replace(/rgba\(201,\s*152,\s*62,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');
authCss = authCss.replace(/rgba\(169,\s*121,\s*60,\s*([0-9.]+)\)/gi, 'rgba(4, 120, 87, $1)');

fs.writeFileSync(authCssPath, authCss, 'utf8');
console.log('✅ Updated designSystem.css with Brand Green tokens');

// 3. Update apps/web/src/styles/PartnerConsole.css
const proCssPath = 'c:/NivaaroFIX-/apps/web/src/styles/PartnerConsole.css';
let proCss = fs.readFileSync(proCssPath, 'utf8');

const proTokenDef = `  --pro-font: var(--font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  --brand-primary: #047857;
  --brand-primary-hover: #065F46;
  --brand-primary-pressed: #064E3B;
  --brand-tint: #ECFDF5;
  --brand-tint-strong: #D1FAE5;
  --brand-tint-border: #A7F3D0;
  --focus-ring: #10B981;

  --pro-accent: var(--brand-primary);
  --pro-accent-hover: var(--brand-primary-hover);
  --pro-accent-pressed: var(--brand-primary-pressed);
  --pro-accent-subtle: var(--brand-tint);
  --pro-accent-border: var(--brand-tint-border);
  --pro-accent-ring: rgba(16, 185, 129, 0.2);`;

proCss = proCss.replace(
  /--pro-font:\s*var\(--font-sans[\s\S]*?--pro-accent-ring:\s*rgba\(5,\s*150,\s*105,\s*0\.12\);/,
  proTokenDef
);

fs.writeFileSync(proCssPath, proCss, 'utf8');
console.log('✅ Updated PartnerConsole.css with Brand Green tokens');

// 4. Update ProjectVisualTourSection.css
const tourCssPath = 'c:/NivaaroFIX-/apps/web/src/styles/ProjectVisualTourSection.css';
let tourCss = fs.readFileSync(tourCssPath, 'utf8');
tourCss = tourCss.replace(/#a9793c/gi, '#047857');
tourCss = tourCss.replace(/#c79752/gi, '#047857');
tourCss = tourCss.replace(/rgba\(169,\s*121,\s*60,\s*0\.12\)/g, '#D1FAE5');
tourCss = tourCss.replace(/rgba\(169,\s*121,\s*60,\s*0\.3\)/g, '#A7F3D0');
tourCss = tourCss.replace(/#e3ddd0/gi, '#A7F3D0');
fs.writeFileSync(tourCssPath, tourCss, 'utf8');
console.log('✅ Updated ProjectVisualTourSection.css');

// 5. Update InteractiveBackgroundShowcase.css in both apps
for (const p of [
  'c:/NivaaroFIX-/apps/web/src/styles/InteractiveBackgroundShowcase.css',
  'c:/NivaaroFIX-/apps/auth/src/styles/InteractiveBackgroundShowcase.css'
]) {
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/#b8862f/gi, '#047857');
  fs.writeFileSync(p, content, 'utf8');
  console.log(`✅ Updated ${p}`);
}

// 6. Update HTML theme-color in both apps
for (const htmlPath of [
  'c:/NivaaroFIX-/apps/web/index.html',
  'c:/NivaaroFIX-/apps/auth/index.html'
]) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/<meta name="theme-color" content="[^"]+" \/>/i, '<meta name="theme-color" content="#047857" />');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`✅ Updated theme-color in ${htmlPath}`);
}

// 7. Update JSX components with hardcoded brown/gold
const componentReplacements = [
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/AccountNotFoundModal.jsx',
    replace: [
      [/var\(--accent-luxe,\s*#a9793c\)/g, 'var(--brand-primary, #047857)'],
      [/'#a9793c'/g, "'var(--brand-primary, #047857)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/auth/src/components/AccountNotFoundModal.jsx',
    replace: [
      [/var\(--accent-luxe,\s*#a9793c\)/g, 'var(--brand-primary, #047857)'],
      [/'#a9793c'/g, "'var(--brand-primary, #047857)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/ActiveBookingBlockedModal.jsx',
    replace: [
      [/var\(--pro-accent,\s*#B8862F\)/g, 'var(--brand-primary, #047857)'],
      [/"#B8862F"/g, '"var(--brand-primary, #047857)"']
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/AgentRoleNoticeModal.jsx',
    replace: [
      [/"#B8862F"/g, '"var(--brand-primary, #047857)"']
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/BookingInvoiceModal.jsx',
    replace: [
      [/color:\s*#a9793c/g, 'color: #047857'],
      [/#e3ddd0/g, '#A7F3D0']
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/BrandStatementAndCtaSection.jsx',
    replace: [
      [/color:\s*'#a9793c'/g, "color: 'var(--brand-primary, #047857)'"],
      [/borderBottom:\s*'1px solid #ded7c8'/g, "borderBottom: '1px solid var(--brand-tint-border, #A7F3D0)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/CustomerProfileIncompleteModal.jsx',
    replace: [
      [/'#a9793c'/g, "'var(--brand-primary, #047857)'"],
      [/"#a9793c"/g, '"var(--brand-primary, #047857)"']
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/HeroSearchSection.jsx',
    replace: [
      [/color:\s*'#a9793c'/g, "color: 'var(--brand-primary, #047857)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/HowItWorksSection.jsx',
    replace: [
      [/color:\s*'#a9793c'/g, "color: 'var(--brand-primary, #047857)'"],
      [/border:\s*'1px solid #ded7c8'/g, "border: '1px solid var(--brand-tint-border, #A7F3D0)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/ServicesPreviewSection.jsx',
    replace: [
      [/color:\s*'#a9793c'/g, "color: 'var(--brand-primary, #047857)'"],
      [/border:\s*'1px solid #ded7c8'/g, "border: '1px solid var(--brand-tint-border, #A7F3D0)'"],
      [/background:\s*'#faf8f4'/g, "background: 'var(--brand-tint, #ECFDF5)'"],
      [/border:\s*'1px solid #e8e2d5'/g, "border: '1px solid var(--brand-tint-border, #A7F3D0)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/TrustGuaranteeSection.jsx',
    replace: [
      [/"#B8862F"/g, '"var(--brand-primary, #047857)"']
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/components/WhyNivaaroSection.jsx',
    replace: [
      [/color:\s*'#a9793c'/g, "color: 'var(--brand-primary, #047857)'"],
      [/borderTop:\s*'1.5px solid #ded7c8'/g, "borderTop: '1.5px solid var(--brand-tint-border, #A7F3D0)'"]
    ]
  },
  {
    file: 'c:/NivaaroFIX-/apps/web/src/data/testimonialsData.js',
    replace: [
      [/avatarBg:\s*'#d97706'/g, "avatarBg: '#047857'"]
    ]
  }
];

for (const item of componentReplacements) {
  if (fs.existsSync(item.file)) {
    let content = fs.readFileSync(item.file, 'utf8');
    for (const [find, rep] of item.replace) {
      content = content.replace(find, rep);
    }
    fs.writeFileSync(item.file, content, 'utf8');
    console.log(`✅ Updated ${path.basename(item.file)}`);
  }
}

console.log('\n🌿 Brand Green Token Replacement Completed Successfully!');
