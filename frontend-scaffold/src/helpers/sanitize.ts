// \p{Cc} = Unicode General Category "Control" (C0 + DEL + C1 control chars)
const CONTROL_CHAR_RE = /\p{Cc}/gu;

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ENTITY_RE = /[&<>"']/g;

const DANGEROUS_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:']);

const LATIN_RE = /\p{Script=Latin}/u;

// Cyrillic, Greek, and Armenian are the most common scripts used in
// homograph attacks against ASCII usernames.
const CONFUSABLE_SCRIPTS_RE = /\p{Script=Cyrillic}|\p{Script=Greek}|\p{Script=Armenian}/u;

/**
 * Sanitizes input for HTML contexts: strips control characters, normalizes to
 * NFC, trims whitespace, and escapes HTML entities.
 */
export function sanitize(input: string): string {
  return input
    .replace(CONTROL_CHAR_RE, '')
    .normalize('NFC')
    .trim()
    .replace(HTML_ENTITY_RE, (ch) => HTML_ENTITIES[ch]);
}

/**
 * Sanitizes plain-text input (bio, tip message): strips control characters,
 * normalizes to NFC, and trims whitespace. Does NOT escape HTML entities so
 * the raw text can still be measured against length limits accurately.
 */
export function sanitizePlainText(input: string): string {
  return input
    .replace(CONTROL_CHAR_RE, '')
    .normalize('NFC')
    .trim();
}

/**
 * Sanitizes a username candidate: strips control characters, normalizes to
 * NFC, trims whitespace, and lowercases. The caller is still responsible for
 * running validateUsername on the result.
 */
export function sanitizeUsername(username: string): string {
  return username
    .replace(CONTROL_CHAR_RE, '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
}

/**
 * Validates and normalizes a URL. Returns the normalized URL string for safe
 * http/https URLs, or null for dangerous protocols, empty input, or
 * unparseable values.
 */
export function sanitizeURL(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (DANGEROUS_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  return parsed.href;
}

/**
 * Returns true if the string mixes Latin characters with characters from
 * Cyrillic, Greek, or Armenian — the scripts most commonly used in homograph
 * attacks against ASCII usernames.
 */
export function hasHomoglyphs(str: string): boolean {
  return LATIN_RE.test(str) && CONFUSABLE_SCRIPTS_RE.test(str);
}
