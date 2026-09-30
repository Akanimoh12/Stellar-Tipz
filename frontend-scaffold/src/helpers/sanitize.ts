// \p{Cc} = Unicode General Category "Control" (C0 + DEL + C1 control chars)
const CONTROL_CHAR_RE = /\p{Cc}/gu;

// Tags allowed through sanitizeHTML (no script, iframe, object, etc.)
const ALLOWED_TAGS = new Set([
  'strong', 'em', 'b', 'i', 'code', 'br', 'p',
  'ul', 'ol', 'li', 'span', 'a',
]);
// Attributes allowed on whitelisted tags
const ALLOWED_ATTRS = new Set(['class', 'href', 'target', 'rel']);
// href protocols that are safe
const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

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

/**
 * Sanitizes an HTML string by walking the parsed DOM and removing any
 * elements or attributes not on the allowlist. Safe for use with
 * dangerouslySetInnerHTML. Falls back to stripping all tags in SSR contexts.
 */
export function sanitizeHTML(html: string): string {
  if (typeof document === 'undefined') {
    // codeql[js/incomplete-multi-character-sanitization]
    // False positive. Callers run `sanitize()` first, which escapes all five
    // HTML metacharacters (& < > " '), so user text cannot introduce a tag
    // here. renderMarkdown only adds <strong>/<em>/<code>/<br> afterwards,
    // which this regex removes. The DOM branch below is the real sanitizer and
    // runs in the browser, which is the only place this output is rendered
    // (the app is a Vite SPA with no SSR or prerender step).
    return html.replace(/<[^>]*>/g, '');
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  _sanitizeNode(wrapper);
  return wrapper.innerHTML;
}

function _sanitizeNode(node: Element): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      const text = document.createTextNode(el.textContent ?? '');
      node.replaceChild(text, el);
      continue;
    }

    // Strip disallowed attributes
    for (const attr of Array.from(el.attributes)) {
      if (!ALLOWED_ATTRS.has(attr.name)) {
        el.removeAttribute(attr.name);
      } else if (attr.name === 'href') {
        // Block javascript: / data: in href
        try {
          const parsed = new URL(attr.value, window.location.href);
          if (!SAFE_HREF_PROTOCOLS.has(parsed.protocol)) {
            el.removeAttribute('href');
          }
        } catch {
          el.removeAttribute('href');
        }
      }
    }

    // Force external links to open safely
    if (tag === 'a') {
      el.setAttribute('rel', 'noopener noreferrer');
    }

    _sanitizeNode(el);
  }
}
