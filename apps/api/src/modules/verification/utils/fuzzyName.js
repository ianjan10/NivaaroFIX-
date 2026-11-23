/**
 * Fuzzy Name Matching Utility
 * Compares official document name against professional registration name.
 * Returns match score from 0 to 100.
 */

function normalizeName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/^(mr|mrs|ms|shri|smt|dr|er)\.?\s+/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates similarity score (0 to 100) between two names.
 * Accounts for word reordering (e.g. "Rajesh Kumar" vs "Kumar Rajesh")
 * and initials (e.g. "Rajesh K" vs "Rajesh Kumar").
 * @param {string} name1 
 * @param {string} name2 
 * @returns {{ score: number, isStrongMatch: boolean, isPartialMatch: boolean }}
 */
export function compareNames(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (!n1 || !n2) {
    return { score: 0, isStrongMatch: false, isPartialMatch: false };
  }

  if (n1 === n2) {
    return { score: 100, isStrongMatch: true, isPartialMatch: true };
  }

  // Token matching (handles reordering)
  const tokens1 = n1.split(' ').filter(Boolean);
  const tokens2 = n2.split(' ').filter(Boolean);

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let commonTokens = 0;
  for (const t of set1) {
    if (set2.has(t)) commonTokens++;
  }

  const tokenJaccard = commonTokens / Math.max(set1.size, set2.size);

  // Initial check (e.g., "Rajesh K" vs "Rajesh Kumar")
  let initialMatch = false;
  if (tokens1.length >= 2 && tokens2.length >= 2) {
    const firstNameMatch = tokens1[0] === tokens2[0];
    const initialOrLastNameMatch =
      tokens1[1][0] === tokens2[1][0] ||
      tokens1[tokens1.length - 1][0] === tokens2[tokens2.length - 1][0];
    if (firstNameMatch && initialOrLastNameMatch) {
      initialMatch = true;
    }
  }

  // Levenshtein ratio
  const maxLen = Math.max(n1.length, n2.length);
  const dist = levenshteinDistance(n1, n2);
  const levRatio = Math.max(0, (maxLen - dist) / maxLen);

  // Combined score weighting
  let score = Math.round((levRatio * 0.4 + tokenJaccard * 0.6) * 100);
  if (initialMatch && score < 75) {
    score = Math.max(score, 75);
  }

  score = Math.min(100, Math.max(0, score));

  return {
    score,
    isStrongMatch: score >= 80,
    isPartialMatch: score >= 60
  };
}

