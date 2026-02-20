const PUNCTUATION = /[.,;:!?()[\]{}"'/\\|@#$%^&*_+=<>~`]/g
const WHITESPACE = /\s+/g

/**
 * Single shared normalization for search terms and phrases.
 * Used everywhere: campaign terms, deduplication, topic matching.
 */
export function normalize(term: string): string | null {
  if (typeof term !== 'string') return null
  let s = term.trim()
  if (s === '') return null
  s = s.toLowerCase()
  s = s.replace(/-/g, ' ')
  s = s.replace(PUNCTUATION, '')
  s = s.replace(WHITESPACE, ' ')
  s = s.trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim()
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).trim()
  s = s.replace(WHITESPACE, ' ').trim()
  return s === '' ? null : s
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * For matching only: stem common word variants so "testing"/"testers" match "test"/"tester".
 * Does not change stored or displayed text.
 */
export function normalizeForMatch(text: string): string {
  if (!text) return text
  let s = text
  const variants: [RegExp, string][] = [
    [/\btesting\b/gi, 'test'],
    [/\btested\b/gi, 'test'],
    [/\btesters\b/gi, 'tester'],
  ]
  for (const [re, replacement] of variants) {
    s = s.replace(re, replacement)
  }
  return s
}

/** Word-boundary match: phrase must appear as whole word(s) in normalized text. */
export function phraseMatchesWordBoundary(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false
  const escaped = escapeRegex(normalizedPhrase)
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  return re.test(normalizedText)
}

/**
 * Smarter match: try exact phrase first, then try against stemmed text
 * so "water testing kit" matches phrase "water test kit".
 */
export function phraseMatchesSmart(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false
  if (phraseMatchesWordBoundary(normalizedText, normalizedPhrase)) return true
  const stemmedText = normalizeForMatch(normalizedText)
  const stemmedPhrase = normalizeForMatch(normalizedPhrase)
  return phraseMatchesWordBoundary(stemmedText, stemmedPhrase)
}
