/**
 * Profile Strength & Completion Calculation Utility
 * Evaluates whether customer/agent profiles have completed all required checklist items.
 */

export function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(-10);
  if (
    digits === '9876543210' ||
    digits === '9876543220' ||
    digits === '9876543211' ||
    digits === '9840123456' ||
    digits === '1234567890' ||
    digits === '0000000000' ||
    digits === '1111111111'
  ) {
    return '';
  }
  return digits;
}

export function parseDob(raw) {
  if (!raw) return null;
  const str = typeof raw === 'object' ? `${raw.day}/${raw.month}/${raw.year}` : String(raw);
  if (str.includes('1992') || str.includes('1988') || str.includes('2050') || str === '//' || str === '--') {
    return null;
  }
  if (typeof raw === 'object' && raw.day && raw.month && raw.year) return raw;
  if (typeof raw === 'string' && raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      return { day: parts[0], month: parts[1], year: parts[2] };
    }
  }
  return null;
}

/**
 * Customer Profile Checklist (100% completion required for booking)
 */
export function evaluateCustomerChecklist(user) {
  if (!user) {
    return {
      checklist: [
        { id: 'name', label: 'Full Name', completed: false, weight: 15 },
        { id: 'email', label: 'Email Address', completed: false, weight: 15 },
        { id: 'phone', label: 'Mobile Number (10 digits)', completed: false, weight: 20 },
        { id: 'dob', label: 'Date of Birth', completed: false, weight: 15 },
        { id: 'stateCity', label: 'State & City', completed: false, weight: 15 },
        { id: 'address', label: 'Detailed Address', completed: false, weight: 15 },
        { id: 'avatar', label: 'Profile Photo', completed: false, weight: 5 }
      ],
      completionPercentage: 0,
      isFullyComplete: false,
      missingCount: 7,
      missingItems: [
        'Full Name',
        'Email Address',
        'Mobile Number (10 digits)',
        'Date of Birth',
        'State & City',
        'Detailed Address',
        'Profile Photo'
      ]
    };
  }

  const name = (user.name || '').trim();
  const email = (user.email || '').trim().toLowerCase();
  const phoneDigits = cleanPhone(user.phone);
  const dobObj = parseDob(user.dob);
  const state = (user.state || '').trim();
  const city = (user.city || '').trim();
  const address = (user.address || '').trim();
  const avatar = user.avatarUrl || user.avatar_url || '';

  const checklist = [
    {
      id: 'name',
      label: 'Full Name',
      completed: Boolean(name && name.length >= 2),
      weight: 15
    },
    {
      id: 'email',
      label: 'Email Address',
      completed: Boolean(email && email.includes('@') && email.includes('.')),
      weight: 15
    },
    {
      id: 'phone',
      label: 'Mobile Number (10 digits)',
      completed: Boolean(phoneDigits && phoneDigits.length === 10),
      weight: 20
    },
    {
      id: 'dob',
      label: 'Date of Birth',
      completed: Boolean(dobObj && dobObj.day && dobObj.month && dobObj.year),
      weight: 15
    },
    {
      id: 'stateCity',
      label: 'State & City',
      completed: Boolean(state && city),
      weight: 15
    },
    {
      id: 'address',
      label: 'Detailed Address',
      completed: Boolean(address && address.length >= 8),
      weight: 15
    },
    {
      id: 'avatar',
      label: 'Profile Photo',
      completed: Boolean(avatar && avatar.length > 5),
      weight: 5
    }
  ];

  const completionPercentage = checklist.reduce(
    (acc, item) => (item.completed ? acc + item.weight : acc),
    0
  );
  const isFullyComplete = completionPercentage === 100;
  const missingItems = checklist.filter((item) => !item.completed).map((item) => item.label);

  return {
    checklist,
    completionPercentage,
    isFullyComplete,
    missingCount: missingItems.length,
    missingItems
  };
}

/**
 * Agent / Partner Profile Checklist (100% completion required for giving service)
 */
export function evaluateAgentChecklist(agent) {
  if (!agent) {
    return {
      checklist: [
        { id: 'name', label: 'Full Name / Business Name', completed: false, weight: 15 },
        { id: 'email', label: 'Email Address', completed: false, weight: 15 },
        { id: 'phone', label: 'Mobile Number (10 digits)', completed: false, weight: 20 },
        { id: 'trade', label: 'Trade Specialization', completed: false, weight: 10 },
        { id: 'experience', label: 'Experience Years', completed: false, weight: 10 },
        { id: 'dob', label: 'Date of Birth', completed: false, weight: 10 },
        { id: 'stateCity', label: 'State & City', completed: false, weight: 10 },
        { id: 'address', label: 'Operating Base Address', completed: false, weight: 10 }
      ],
      completionPercentage: 0,
      isFullyComplete: false,
      missingCount: 8,
      missingItems: [
        'Full Name / Business Name',
        'Email Address',
        'Mobile Number (10 digits)',
        'Trade Specialization',
        'Experience Years',
        'Date of Birth',
        'State & City',
        'Operating Base Address'
      ]
    };
  }

  const name = (agent.name || '').trim();
  const email = (agent.email || '').trim().toLowerCase();
  const phoneDigits = cleanPhone(agent.phone);
  const trade = (agent.trade || '').trim();
  const experience = agent.experienceYears !== undefined && agent.experienceYears !== null
    ? Number(agent.experienceYears)
    : (agent.experience_years !== undefined && agent.experience_years !== null ? Number(agent.experience_years) : -1);
  const dobObj = parseDob(agent.dob);
  const state = (agent.state || '').trim();
  const city = (agent.city || '').trim();
  const address = (agent.address || '').trim();

  const checklist = [
    {
      id: 'name',
      label: 'Full Name / Business Name',
      completed: Boolean(name && name.length >= 2),
      weight: 15
    },
    {
      id: 'email',
      label: 'Email Address',
      completed: Boolean(email && email.includes('@') && email.includes('.')),
      weight: 15
    },
    {
      id: 'phone',
      label: 'Mobile Number (10 digits)',
      completed: Boolean(phoneDigits && phoneDigits.length === 10),
      weight: 20
    },
    {
      id: 'trade',
      label: 'Trade Specialization',
      completed: Boolean(trade && ['electrician', 'plumber'].includes(trade.toLowerCase())),
      weight: 10
    },
    {
      id: 'experience',
      label: 'Experience Years',
      completed: Boolean(experience >= 0 && !isNaN(experience)),
      weight: 10
    },
    {
      id: 'dob',
      label: 'Date of Birth',
      completed: Boolean(dobObj && dobObj.day && dobObj.month && dobObj.year),
      weight: 10
    },
    {
      id: 'stateCity',
      label: 'State & City',
      completed: Boolean(state && city),
      weight: 10
    },
    {
      id: 'address',
      label: 'Operating Base Address',
      completed: Boolean(address && address.length >= 8),
      weight: 10
    }
  ];

  const completionPercentage = checklist.reduce(
    (acc, item) => (item.completed ? acc + item.weight : acc),
    0
  );
  const isFullyComplete = completionPercentage === 100;
  const missingItems = checklist.filter((item) => !item.completed).map((item) => item.label);

  return {
    checklist,
    completionPercentage,
    isFullyComplete,
    missingCount: missingItems.length,
    missingItems
  };
}
