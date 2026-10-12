/**
 * NivaaroFix Booking Utilities
 * Dynamic warranty calculation & 4-stage index mapping
 */

// Dynamic warranty calculation utility (30-day or 30-day doorstep warranty)
export function computeWarrantyInfo(completedDateStr, warrantyDays = 30) {
  if (!completedDateStr) {
    return { isActive: false, text: 'Warranty expired', daysRemaining: 0 };
  }

  const completedDate = new Date(completedDateStr);
  if (isNaN(completedDate.getTime())) {
    return { isActive: false, text: 'Warranty expired', daysRemaining: 0 };
  }

  const expiryDate = new Date(completedDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  if (now <= expiryDate) {
    const formattedExpiry = expiryDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const daysRemaining = Math.max(1, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
    return {
      isActive: true,
      text: `Warranty active until ${formattedExpiry}`,
      formattedExpiry,
      daysRemaining
    };
  }

  return {
    isActive: false,
    text: 'Warranty expired',
    daysRemaining: 0
  };
}

// Map booking status to 4-stage index:
// 0: Confirmed, 1: Assigned, 2: En route, 3: In progress / Completed
export function getStageIndex(status) {
  const norm = (status || '').toLowerCase().trim();
  if (norm.includes('received') || norm.includes('pending') || norm === 'confirmed') return 0;
  if (norm.includes('assigned') || norm.includes('accepted')) return 1;
  if (norm.includes('on the way') || norm.includes('en route') || norm.includes('way')) return 2;
  if (norm.includes('progress') || norm.includes('work') || norm.includes('completed')) return 3;
  return 0;
}
