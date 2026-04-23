// src/utils/similarity.js
// Fuzzy product name matching — no external dependencies.
//
// Algorithm: weighted combination of:
//   1. Substring containment (fast, catches "paleta" inside "paleta especial")
//   2. Per-token Levenshtein (catches "sardo" ≈ "zardo", handles word order)
//   3. Full-string Levenshtein fallback
//
// Threshold: 0.50 for multi-word queries, stricter for short queries.
// Rationale: 50% avoids returning garbage on unrelated names while being
// permissive enough for 1-2 letter typos in medium-length words.
// Adjust THRESHOLD_DEFAULT below to tune globally.

const THRESHOLD_DEFAULT = 0.50;
const THRESHOLD_SHORT   = 0.70; // queries ≤ 4 chars need higher confidence
const THRESHOLD_TINY    = 0.95; // queries ≤ 2 chars must be near-exact

/** Strip accents, lowercase, collapse spaces, keep only alphanumeric. */
function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacritics
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Classic Levenshtein distance (pure JS, O(m*n)). */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

/**
 * Returns similarity score 0..1 between query and a product name.
 * Higher = more similar.
 */
function similarity(query, productName) {
  const q = normalizeText(query);
  const p = normalizeText(productName);
  if (!q || !p) return 0;
  if (q === p) return 1.0;

  // Fast substring checks (no Levenshtein needed)
  if (p.includes(q)) return 0.95;
  if (q.includes(p)) return 0.85;

  const qTokens = q.split(' ');
  const pTokens = p.split(' ');

  // Per-token matching: each query word is matched against the best product word.
  // Allows "queso sardo" to match "queso zardo" because:
  //   "queso" → "queso" = 1.0
  //   "sardo" → "zardo" = levenshtein("sardo","zardo")=1, maxLen=5 → 0.80
  //   avg = 0.90
  let tokenScore = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const pt of pTokens) {
      const maxLen = Math.max(qt.length, pt.length);
      if (maxLen === 0) continue;
      // Substring bonus inside individual tokens
      if (pt.includes(qt) || qt.includes(pt)) { best = Math.max(best, 0.88); continue; }
      const s = 1 - levenshtein(qt, pt) / maxLen;
      if (s > best) best = s;
    }
    tokenScore += best;
  }
  tokenScore /= qTokens.length;

  // Full-string Levenshtein as fallback (good for single-word searches)
  const maxLen = Math.max(q.length, p.length);
  const levScore = 1 - levenshtein(q, p) / maxLen;

  return Math.max(tokenScore, levScore);
}

/** Returns the minimum acceptable similarity for a given query. */
function getThreshold(query) {
  const len = normalizeText(query).length;
  if (len <= 2) return THRESHOLD_TINY;
  if (len <= 4) return THRESHOLD_SHORT;
  return THRESHOLD_DEFAULT;
}

module.exports = { normalizeText, levenshtein, similarity, getThreshold };
