/**
 * NivaaroFix — Services Catalog Dataset
 * Strictly focused on two master domains: Electrician & Plumber
 */

export const serviceCategories = [
  { id: 'all', label: 'All Services', icon: 'sparkles' },
  { id: 'electrician', label: '⚡ Electrician', icon: 'zap' },
  { id: 'plumber', label: '💧 Plumber', icon: 'droplet' }
];

export const allServicesList = [
  /* ==========================================================================
     DOMAIN 1: ELECTRICIAN (Electrical & Power Systems)
     ========================================================================== */
  {
    id: 'switchboard-socket-repair',
    categoryId: 'electrician',
    title: 'Switchboard, Socket & Power Point Repair',
    shortDesc: 'Burnt switch replacement, loose contact fix, 16A heavy power points for AC/Geysers.',
    rating: 4.92,
    reviewsCount: 18450,
    startingPrice: 149,
    originalPrice: 249,
    durationMinutes: 30,
    expressArrivalMinutes: 30,
    warrantyDays: 30,
    badge: 'Express 30 Mins',
    popular: true,
    commonIssues: [
      { id: 'single-switch', name: 'Replace 1–3 damaged switches / sockets', priceAdd: 50 },
      { id: 'heavy-point', name: 'Install 16A/20A heavy appliance power point', priceAdd: 180 },
      { id: 'modular-board', name: 'Complete 6/8-module switchboard upgrade', priceAdd: 299 },
      { id: 'sparking-socket', name: 'Sparking / burnt internal wire fixing', priceAdd: 120 }
    ]
  },
  {
    id: 'mcb-fuse-short-circuit',
    categoryId: 'electrician',
    title: 'MCB Tripping, Short-Circuit & Fuse Diagnostics',
    shortDesc: 'High-precision multimeter short-circuit detection, faulty MCB/RCCB replacement & load balancing.',
    rating: 4.89,
    reviewsCount: 14200,
    startingPrice: 199,
    originalPrice: 350,
    durationMinutes: 40,
    expressArrivalMinutes: 30,
    warrantyDays: 30,
    badge: 'Emergency Safe',
    popular: true,
    commonIssues: [
      { id: 'mcb-replace', name: 'Single/Double Pole MCB replacement', priceAdd: 150 },
      { id: 'rccb-tripping', name: 'RCCB earth leakage trip diagnostics', priceAdd: 280 },
      { id: 'short-circuit-fix', name: 'Concealed line short-circuit isolation', priceAdd: 350 },
      { id: 'main-db-upgrade', name: 'Main distribution box rewiring', priceAdd: 450 }
    ]
  },
  {
    id: 'fan-chandelier-install',
    categoryId: 'electrician',
    title: 'Ceiling Fan, Exhaust & Chandelier Installation',
    shortDesc: 'Down-rod mounting, blade dynamic balancing, electronic regulator fix & heavy chandelier anchor.',
    rating: 4.88,
    reviewsCount: 12600,
    startingPrice: 129,
    originalPrice: 220,
    durationMinutes: 35,
    expressArrivalMinutes: 45,
    warrantyDays: 60,
    badge: 'Most Booked',
    popular: true,
    commonIssues: [
      { id: 'ceiling-fan-mount', name: 'Standard ceiling fan assembly & hang', priceAdd: 60 },
      { id: 'fan-regulator', name: 'Speed regulator replacement (modular)', priceAdd: 70 },
      { id: 'exhaust-fan-fit', name: 'Kitchen/Bathroom exhaust fan installation', priceAdd: 140 },
      { id: 'chandelier-mount', name: 'Heavy luxury chandelier anchor mounting', priceAdd: 399 }
    ]
  },
  {
    id: 'inverter-battery-setup',
    categoryId: 'electrician',
    title: 'Home Inverter, Battery & UPS Setup Wiring',
    shortDesc: 'Bypass switch installation, battery terminal anti-corrosion grease, pure sine-wave load distribution.',
    rating: 4.93,
    reviewsCount: 9800,
    startingPrice: 349,
    originalPrice: 550,
    durationMinutes: 50,
    expressArrivalMinutes: 45,
    warrantyDays: 30,
    badge: 'Power Backup Pro',
    popular: true,
    commonIssues: [
      { id: 'new-inverter-install', name: 'New Inverter + Battery setup with cabling', priceAdd: 250 },
      { id: 'battery-water-service', name: 'Acid level & distilled water top-up service', priceAdd: 120 },
      { id: 'inverter-tripping', name: 'Inverter overload / continuous beeping fix', priceAdd: 200 },
      { id: 'bypass-switch', name: 'Manual bypass switch connection', priceAdd: 180 }
    ]
  },
  {
    id: 'house-wiring-earthing',
    categoryId: 'electrician',
    title: 'Concealed House Wiring & Earthing Check',
    shortDesc: 'Copper wire conduit pull, earth resistance testing, neutral fault rectification & phase balancing.',
    rating: 4.87,
    reviewsCount: 7100,
    startingPrice: 399,
    originalPrice: 650,
    durationMinutes: 60,
    expressArrivalMinutes: 60,
    warrantyDays: 30,
    badge: 'Comprehensive',
    popular: false,
    commonIssues: [
      { id: 'earthing-check', name: 'Earthing pit & appliance body current test', priceAdd: 199 },
      { id: 'room-rewiring', name: 'Single room concealed copper wire pull', priceAdd: 450 },
      { id: 'phase-shift', name: '3-Phase load balancing across MCBs', priceAdd: 350 }
    ]
  },
  {
    id: 'smart-led-lighting',
    categoryId: 'electrician',
    title: 'Smart Lighting, Profile Light & LED Setup',
    shortDesc: 'False ceiling COB spot lights, magnetic track lights, smart dimmer switches & profile strip installation.',
    rating: 4.91,
    reviewsCount: 8400,
    startingPrice: 199,
    originalPrice: 320,
    durationMinutes: 40,
    expressArrivalMinutes: 45,
    warrantyDays: 60,
    badge: 'Modern Home',
    popular: false,
    commonIssues: [
      { id: 'cob-lights', name: 'False ceiling COB / panel light install (1–4 units)', priceAdd: 120 },
      { id: 'profile-led-strip', name: 'Concealed profile aluminum track & LED strip', priceAdd: 299 },
      { id: 'smart-switch-wifi', name: 'Wi-Fi smart switch pairing with Alexa/Google', priceAdd: 180 }
    ]
  },

  /* ==========================================================================
     DOMAIN 2: PLUMBER (Plumbing & Water Systems)
     ========================================================================== */
  {
    id: 'tap-mixer-leakage',
    categoryId: 'plumber',
    title: 'Tap, Mixer & Shower Dripping Repair',
    shortDesc: 'Washer & spindle replacement, cartridge fix, wall mixer alignment, angle valve & jet spray replacement.',
    rating: 4.91,
    reviewsCount: 22100,
    startingPrice: 149,
    originalPrice: 249,
    durationMinutes: 30,
    expressArrivalMinutes: 30,
    warrantyDays: 30,
    badge: 'Express 30 Mins',
    popular: true,
    commonIssues: [
      { id: 'tap-spindle', name: 'Tap dripping / cartridge replacement', priceAdd: 60 },
      { id: 'wall-mixer-repair', name: 'Hot & cold wall mixer repair / install', priceAdd: 200 },
      { id: 'health-faucet', name: 'Jet spray / angle cock replacement', priceAdd: 80 },
      { id: 'overhead-shower', name: 'Shower head cleaning & arm replacement', priceAdd: 100 }
    ]
  },
  {
    id: 'drain-sink-blockage',
    categoryId: 'plumber',
    title: 'Blocked Drain, Kitchen Sink & Pipe Clog Clearance',
    shortDesc: 'Mechanical drain snake cleaning, food sludge removal, non-corrosive chemical flush & trap cleaning.',
    rating: 4.88,
    reviewsCount: 17600,
    startingPrice: 199,
    originalPrice: 320,
    durationMinutes: 35,
    expressArrivalMinutes: 30,
    warrantyDays: 60,
    badge: 'Zero Chemical Smell',
    popular: true,
    commonIssues: [
      { id: 'sink-trap-clean', name: 'Kitchen sink pipe blockage & waste coupling', priceAdd: 90 },
      { id: 'bathroom-floor-drain', name: 'Bathroom floor drain / nahani trap blockage', priceAdd: 150 },
      { id: 'main-sewer-line', name: 'Heavy vertical drain pipe snake clearance', priceAdd: 350 }
    ]
  },
  {
    id: 'concealed-pipe-leakage',
    categoryId: 'plumber',
    title: 'Concealed Pipe Joint Leakage Detection & Repair',
    shortDesc: 'Acoustic moisture inspection, CPVC/UPVC solvent weld joint fix & tile-safe minor aperture repair.',
    rating: 4.86,
    reviewsCount: 11400,
    startingPrice: 299,
    originalPrice: 499,
    durationMinutes: 45,
    expressArrivalMinutes: 45,
    warrantyDays: 30,
    badge: 'Tile-Safe Inspection',
    popular: true,
    commonIssues: [
      { id: 'cpvc-joint-leak', name: 'CPVC pipe joint leak repair & coupling', priceAdd: 220 },
      { id: 'concealed-valve', name: 'Concealed gate valve / stop cock replacement', priceAdd: 280 },
      { id: 'wall-dampness-trace', name: 'Full bathroom wall dampness leak tracing', priceAdd: 350 }
    ]
  },
  {
    id: 'toilet-flush-repair',
    categoryId: 'plumber',
    title: 'Toilet Commode, Flush Tank & Jet Spray Fix',
    shortDesc: 'Internal siphon kit replacement, flush button fix, wax seal leak stop & commode re-grouting.',
    rating: 4.90,
    reviewsCount: 13800,
    startingPrice: 229,
    originalPrice: 380,
    durationMinutes: 40,
    expressArrivalMinutes: 45,
    warrantyDays: 30,
    badge: 'Hygiene Certified',
    popular: true,
    commonIssues: [
      { id: 'flush-tank-kit', name: 'Flush tank continuous water leak / siphon kit', priceAdd: 160 },
      { id: 'commode-seat-cover', name: 'Soft-close commode seat cover installation', priceAdd: 99 },
      { id: 'toilet-base-leak', name: 'Floor joint water seepage / wax seal change', priceAdd: 250 },
      { id: 'dual-flush-button', name: 'Concealed dual flush push button repair', priceAdd: 180 }
    ]
  },
  {
    id: 'water-tank-valve-service',
    categoryId: 'plumber',
    title: 'Overhead Water Tank Cleaning & Auto Float Valve',
    shortDesc: 'High-pressure silt evacuation, anti-bacterial tank scrub & brass auto-cut float valve installation.',
    rating: 4.92,
    reviewsCount: 8900,
    startingPrice: 399,
    originalPrice: 650,
    durationMinutes: 60,
    expressArrivalMinutes: 60,
    warrantyDays: 60,
    badge: 'Clean Water Guarantee',
    popular: false,
    commonIssues: [
      { id: 'float-valve-brass', name: 'Auto-cut brass float ball valve install', priceAdd: 199 },
      { id: 'tank-deep-scrub', name: '500L–1000L Overhead tank deep sanitization', priceAdd: 350 },
      { id: 'air-lock-release', name: 'Water pipeline air-lock release & pressure fix', priceAdd: 150 }
    ]
  },
  {
    id: 'water-motor-pump-repair',
    categoryId: 'plumber',
    title: 'Water Motor, Submersible & Pressure Pump Fix',
    shortDesc: 'Capacitor testing, impeller jam release, automatic pressure controller setup & mechanical seal fix.',
    rating: 4.87,
    reviewsCount: 7600,
    startingPrice: 349,
    originalPrice: 550,
    durationMinutes: 50,
    expressArrivalMinutes: 45,
    warrantyDays: 30,
    badge: 'High Pressure Tech',
    popular: false,
    commonIssues: [
      { id: 'pump-capacitor', name: 'Starting capacitor replacement & motor test', priceAdd: 140 },
      { id: 'impeller-jam', name: 'Impeller de-scaling & bearing greasing', priceAdd: 220 },
      { id: 'pressure-switch', name: 'Auto pressure booster switch wiring', priceAdd: 320 },
      { id: 'pump-leak', name: 'Mechanical carbon-ceramic seal replacement', priceAdd: 280 }
    ]
  }
];

export const heroSearchConfig = {
  defaultPlaceholder: "What's wrong at home?",
  cyclingExamples: [
    "Try: MCB keeps tripping",
    "Try: Tap is leaking",
    "Try: Switchboard not working",
    "Try: Pipe is blocked"
  ],
  popularSearches: [
    { label: 'MCB trip', query: 'mcb', category: 'electrician' },
    { label: 'Switchboard', query: 'switchboard', category: 'electrician' },
    { label: 'Tap leak', query: 'tap', category: 'plumber' },
    { label: 'Pipe blockage', query: 'pipe', category: 'plumber' }
  ]
};

export const servicesSearchConfig = {
  defaultPlaceholder: "What's wrong at home?",
  cyclingExamples: [
    "MCB keeps tripping",
    "Switchboard isn't working",
    "Tap is leaking",
    "Sink is blocked",
    "Pipe is leaking"
  ],
  emptyState: {
    message: "Tell us a little more about what's wrong.",
    actionText: "Describe your issue →"
  },
  suggestions: [
    { query: 'mcb', category: 'Electrical', label: 'MCB & Fuse', serviceSlug: 'electrician', icon: '⚡' },
    { query: 'switchboard', category: 'Electrical', label: 'Switchboard & Socket', serviceSlug: 'electrician', icon: '⚡' },
    { query: 'wiring', category: 'Electrical', label: 'House Wiring & Earthing', serviceSlug: 'electrician', icon: '⚡' },
    { query: 'fan', category: 'Electrical', label: 'Ceiling Fan & Exhaust', serviceSlug: 'electrician', icon: '⚡' },
    { query: 'inverter', category: 'Electrical', label: 'Inverter & Battery Wiring', serviceSlug: 'electrician', icon: '⚡' },
    { query: 'tap', category: 'Plumbing', label: 'Tap & Mixer Dripping', serviceSlug: 'plumber', icon: '💧' },
    { query: 'drain', category: 'Plumbing', label: 'Blocked Drain & Sink', serviceSlug: 'plumber', icon: '💧' },
    { query: 'sink', category: 'Plumbing', label: 'Kitchen Sink Clog', serviceSlug: 'plumber', icon: '💧' },
    { query: 'pipe', category: 'Plumbing', label: 'Concealed Pipe Leakage', serviceSlug: 'plumber', icon: '💧' },
    { query: 'toilet', category: 'Plumbing', label: 'Commode & Flush Tank', serviceSlug: 'plumber', icon: '💧' },
    { query: 'pump', category: 'Plumbing', label: 'Water Motor & Pump', serviceSlug: 'plumber', icon: '💧' }
  ]
};

export const servicesDirectory = [
  {
    slug: 'electrician',
    categoryId: 'electrician',
    category: 'ELECTRICAL SERVICES',
    title: 'Electrician',
    headline: 'Certified Residential Electrical Services',
    description: 'Electrical faults, installations, diagnostics and everyday residential repairs.',
    longDescription: 'Comprehensive residential electrical troubleshooting, fixture mounting, switchgear maintenance, and safe power point installations handled by government-verified master electricians.',
    imageName: 'electrician.jpg',
    alt: 'Professional licensed electrician methodically inspecting residential electrical installation',
    issues: ['MCB & Fuse', 'Switchboard', 'Wiring', 'Fan Installation', 'Inverter / UPS'],
    coverageItems: [
      {
        title: 'Switchboard & Socket Repair',
        desc: 'Replacement of burnt modular switches, loose contacts, and dedicated 16A/20A power points.'
      },
      {
        title: 'MCB & Fuse Diagnostics',
        desc: 'Multimeter short-circuit isolation, RCCB earth leakage detection, and distribution board rewiring.'
      },
      {
        title: 'Ceiling Fan & Appliance Mounting',
        desc: 'Dynamic blade balancing, down-rod anchoring, electronic regulator fixes, and exhaust fans.'
      },
      {
        title: 'Inverter, Battery & UPS Wiring',
        desc: 'Safe backup power load balancing, manual bypass switch setup, and battery terminal care.'
      },
      {
        title: 'Concealed Wiring & Earthing Check',
        desc: 'Conduit copper wire pull, neutral-earth voltage testing, and shock hazard remediation.'
      }
    ],
    vettingStandard: 'Every electrician completes government ID verification, background vetting, and trade-skill evaluation prior to onboarding.',
    bookCta: 'Book an Electrician →',
    exploreCta: 'Explore service →'
  },
  {
    slug: 'plumber',
    categoryId: 'plumber',
    category: 'PLUMBING SERVICES',
    title: 'Plumber',
    headline: 'Precision Residential Plumbing & Water Systems',
    description: 'Plumbing repairs and maintenance for everyday problems around the home.',
    longDescription: 'Expert water pipeline diagnostics, fixture repairs, drain clearance, and sanitary installations performed with clean residential craftsmanship.',
    imageName: 'plumber.png',
    alt: 'Certified professional plumber performing precision residential pipe and fixture repair',
    issues: ['Tap & Mixer', 'Drain Blockage', 'Pipe Leaks', 'Flush Systems', 'Water Connections'],
    coverageItems: [
      {
        title: 'Tap, Mixer & Shower Repair',
        desc: 'Ceramic cartridge replacement, wall mixer alignment, angle valves, and jet spray installations.'
      },
      {
        title: 'Drain & Sink Blockage Clearance',
        desc: 'Mechanical snake drain unclogging, food sludge clearance, and sink waste coupling servicing.'
      },
      {
        title: 'Concealed Pipe Joint Leak Tracing',
        desc: 'Acoustic moisture tracing, CPVC/UPVC solvent weld joints, and tile-safe localized repairs.'
      },
      {
        title: 'Toilet Commode & Flush Tank Maintenance',
        desc: 'Internal siphon kit replacements, dual flush push buttons, and floor seal leak arrest.'
      },
      {
        title: 'Overhead Tank & Water Pump Services',
        desc: 'Auto-cut brass float valves, pipeline air-lock evacuation, and booster pump capacitor checks.'
      }
    ],
    vettingStandard: 'Every plumbing technician is background verified with proven trade experience in modern residential piping and fixtures.',
    bookCta: 'Book a Plumber →',
    exploreCta: 'Explore service →'
  }
];

export const problemFirstLinks = [
  { label: 'MCB trip', serviceSlug: 'electrician', query: 'mcb', icon: '⚡' },
  { label: 'Switchboard issue', serviceSlug: 'electrician', query: 'switchboard', icon: '⚡' },
  { label: 'Wiring problem', serviceSlug: 'electrician', query: 'wiring', icon: '⚡' },
  { label: 'Tap leak', serviceSlug: 'plumber', query: 'tap', icon: '💧' },
  { label: 'Drain blockage', serviceSlug: 'plumber', query: 'drain', icon: '💧' },
  { label: 'Pipe leak', serviceSlug: 'plumber', query: 'pipe', icon: '💧' }
];



