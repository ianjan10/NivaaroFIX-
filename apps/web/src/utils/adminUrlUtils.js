/**
 * Validates and sanitizes relative destination path strictly under /admin
 */
export function sanitizeAdminNextPath(next) {
  if (!next || typeof next !== 'string') return '/admin';
  const trimmed = next.trim();
  // Strictly enforce single leading slash and must start with /admin (no //, no schemes)
  if (/^\/admin(\/.*|\?.*)?$/.test(trimmed) && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return '/admin';
}

