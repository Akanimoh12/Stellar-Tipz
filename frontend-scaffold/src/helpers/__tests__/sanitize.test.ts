import { describe, it, expect } from 'vitest';
import {
  sanitize,
  sanitizePlainText,
  sanitizeUsername,
  sanitizeURL,
  hasHomoglyphs,
} from '../sanitize';
import { validateUsername } from '../validation';

// ── sanitize ──────────────────────────────────────────────────────────────────

describe('sanitize', () => {
  it('escapes < and > as HTML entities', () => {
    expect(sanitize('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes & as &amp;', () => {
    expect(sanitize('A & B')).toBe('A &amp; B');
  });

  it('escapes double quotes', () => {
    expect(sanitize('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it("escapes single quotes", () => {
    expect(sanitize("it's fine")).toBe("it&#39;s fine");
  });

  it('strips control characters', () => {
    expect(sanitize('hello\x00world')).toBe('helloworld');
  });

  it('strips tab and newline control characters', () => {
    expect(sanitize('line1\x09line2\x0Aline3')).toBe('line1line2line3');
  });

  it('normalizes NFD sequences to NFC', () => {
    // cafe + combining acute (NFD) should become café (NFC)
    const nfd = 'café';
    const nfc = 'café';
    expect(sanitize(nfd)).toBe(sanitize(nfc));
    expect(sanitize(nfd)).toBe(nfc);
  });

  it('strips leading and trailing whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(sanitize('')).toBe('');
  });

  it('leaves safe ASCII untouched', () => {
    expect(sanitize('Hello, world! 123')).toBe('Hello, world! 123');
  });
});

// ── sanitizePlainText ─────────────────────────────────────────────────────────

describe('sanitizePlainText', () => {
  it('strips control characters', () => {
    expect(sanitizePlainText('hello\x00world')).toBe('helloworld');
  });

  it('does NOT escape HTML entities', () => {
    expect(sanitizePlainText('<b>bold</b>')).toBe('<b>bold</b>');
  });

  it('does not escape ampersand', () => {
    expect(sanitizePlainText('A & B')).toBe('A & B');
  });

  it('normalizes NFD to NFC', () => {
    expect(sanitizePlainText('café')).toBe('café');
  });

  it('strips leading and trailing whitespace', () => {
    expect(sanitizePlainText('  bio text  ')).toBe('bio text');
  });
});

// ── sanitizeUsername ──────────────────────────────────────────────────────────

describe('sanitizeUsername', () => {
  it('trims and lowercases', () => {
    expect(sanitizeUsername('  Alice  ')).toBe('alice');
  });

  it('strips control characters', () => {
    expect(sanitizeUsername('alice\x00')).toBe('alice');
  });

  it('normalizes NFD to NFC', () => {
    expect(sanitizeUsername('café')).toBe('café');
  });

  it('lowercases mixed-case input', () => {
    expect(sanitizeUsername('BobSmith')).toBe('bobsmith');
  });
});

// ── sanitizeURL ───────────────────────────────────────────────────────────────

describe('sanitizeURL', () => {
  it('accepts and returns https URLs', () => {
    expect(sanitizeURL('https://example.com')).toBe('https://example.com/');
  });

  it('accepts http URLs', () => {
    expect(sanitizeURL('http://example.com')).toBe('http://example.com/');
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeURL('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(sanitizeURL('data:text/html,<h1>hi</h1>')).toBeNull();
  });

  it('rejects vbscript: protocol', () => {
    expect(sanitizeURL('vbscript:msgbox(1)')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeURL('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeURL('   ')).toBeNull();
  });

  it('returns null for plain text (no protocol)', () => {
    expect(sanitizeURL('not a url')).toBeNull();
  });

  it('returns null for ftp: protocol', () => {
    expect(sanitizeURL('ftp://files.example.com')).toBeNull();
  });

  it('preserves query string and fragment', () => {
    expect(sanitizeURL('https://example.com/path?q=1#sec')).toBe(
      'https://example.com/path?q=1#sec',
    );
  });
});

// ── hasHomoglyphs ─────────────────────────────────────────────────────────────

describe('hasHomoglyphs', () => {
  it('returns false for pure ASCII Latin username', () => {
    expect(hasHomoglyphs('alice')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasHomoglyphs('')).toBe(false);
  });

  it('returns false for digits and underscores only', () => {
    expect(hasHomoglyphs('user_123')).toBe(false);
  });

  it('detects Cyrillic a mixed with Latin letters', () => {
    // U+0430 (Cyrillic small a) looks identical to Latin a
    const cyrillicA = 'а';
    expect(hasHomoglyphs(cyrillicA + 'lice')).toBe(true);
  });

  it('detects Greek alpha mixed with Latin letters', () => {
    // U+03B1 (Greek small alpha) looks like Latin a
    const greekAlpha = 'α';
    expect(hasHomoglyphs(greekAlpha + 'lice')).toBe(true);
  });

  it('returns false for pure Cyrillic string', () => {
    // No Latin characters present — not a homograph attack
    expect(hasHomoglyphs('алиса')).toBe(false);
  });
});

// ── validateUsername integration ──────────────────────────────────────────────

describe('validateUsername homograph rejection', () => {
  it('rejects username with Cyrillic homoglyph', () => {
    const cyrillicA = 'а';
    const result = validateUsername(cyrillicA + 'lice');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username contains potentially confusable characters.');
  });
});
