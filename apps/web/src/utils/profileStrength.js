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

/**
 * Customer Profile Checklist (100% completion required for booking)
 */
export function evaluateCustomerChecklist(user) {
  if (!user) {
    return {
      checklist: [
        { id: 'name', label: 'Full Name', completed: false, weight: 20 },
        { id: 'email', label: 'Email Address', completed: false, weight: 20 },
        { id: 'phone', label: 'Mobile Number (10 digits)', completed: false, weight: 30 },
        { id: 'address', label: 'Detailed Address', completed: false, weight: 25 },
        { id: 'avatar', label: 'Profile Photo', completed: false, weight: 5 }
      ],
      completionPercentage: 0,
      isFullyComplete: false,
      missingCount: 5,
      missingItems: [
        'Full Name',
        'Email Address',
        'Mobile Number (10 digits)',
        'Detailed Address',
        'Profile Photo'
      ]
    };
  }

  const name = (user.name || '').trim();
  const email = (user.email || '').trim().toLowerCase();
  const phoneDigits = cleanPhone(user.phone);
  const address = (user.address || '').trim();
  const avatar = user.avatarUrl || user.avatar_url || '';

  const checklist = [
    {
      id: 'name',
      label: 'Full Name',
      completed: Boolean(name && name.length >= 2),
      weight: 20
    },
    {
      id: 'email',
      label: 'Email Address',
      completed: Boolean(email && email.includes('@') && email.includes('.')),
      weight: 20
    },
    {
      id: 'phone',
      label: 'Mobile Number (10 digits)',
      completed: Boolean(phoneDigits && phoneDigits.length === 10),
      weight: 30
    },
    {
      id: 'address',
      label: 'Detailed Address',
      completed: Boolean(address && address.length >= 8),
      weight: 25
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
 * Agent / Partner Profile Checklist (Recalculated without DOB, state, city)
 * Real items: verified mobile, trade, operating base address, ID document, and name/email.
 */
export function evaluateAgentChecklist(agent) {
  if (!agent) {
    return {
      checklist: [
        { id: 'name', label: 'Full Name / Business Name', completed: false, weight: 15 },
        { id: 'email', label: 'Email Address', completed: false, weight: 15 },
        { id: 'phone', label: 'Verified Mobile', completed: false, weight: 20 },
        { id: 'trade', label: 'Trade Specialization', completed: false, weight: 15 },
        { id: 'address', label: 'Permanent address', completed: false, weight: 20 },
        { id: 'idDocument', label: 'ID Document', completed: false, weight: 15 }
      ],
      completionPercentage: 0,
      isFullyComplete: false,
      missingCount: 6,
      missingItems: [
        'Full Name / Business Name',
        'Email Address',
        'Verified Mobile',
        'Trade Specialization',
        'Permanent address',
        'ID Document'
      ]
    };
  }

  const name = (agent.name || '').trim();
  const email = (agent.email || '').trim().toLowerCase();
  const phoneDigits = cleanPhone(agent.phone);
  const isPhoneVerified = Boolean(agent.isPhoneVerified || agent.is_phone_verified || (phoneDigits && phoneDigits.length === 10));
  const trade = (agent.trade || '').trim();
  const address = (agent.permanent_address || agent.permanentAddress || agent.address || '').trim();
  const kycStatus = (agent.kycStatus || agent.kyc_status || 'pending').toLowerCase();
  const isIdVerified = kycStatus === 'verified' || Boolean(agent.hasUploadedId || agent.documentsCount > 0);

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
      label: 'Verified Mobile',
      completed: Boolean(phoneDigits && phoneDigits.length === 10 && isPhoneVerified),
      weight: 20
    },
    {
      id: 'trade',
      label: 'Trade Specialization',
      completed: Boolean(trade && ['electrician', 'plumber'].includes(trade.toLowerCase())),
      weight: 15
    },
    {
      id: 'address',
      label: 'Permanent address',
      completed: Boolean(address && address.length >= 8),
      weight: 20
    },
    {
      id: 'idDocument',
      label: 'ID Document',
      completed: isIdVerified,
      weight: 15
    }
  ];

  const rawPercentage = checklist.reduce(
    (acc, item) => (item.completed ? acc + item.weight : acc),
    0
  );
  const completionPercentage = Math.min(100, rawPercentage);
  const missingItems = checklist.filter((item) => !item.completed).map((item) => item.label);
  const isFullyComplete = missingItems.length === 0 && completionPercentage === 100;

  return {
    checklist,
    completionPercentage,
    isFullyComplete,
    missingCount: missingItems.length,
    missingItems
  };
}
