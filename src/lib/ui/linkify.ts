// Linkify — auto-detect URLs, emails, phone numbers, and patient refs in free
// text. Returns a token stream that downstream renderers (see LinkifiedText)
// can walk to safely emit <a> elements.
//
// Pure, no React, no server imports. Two correctness contracts:
//   1. The concatenation of all `token.text` values equals the input string —
//      i.e. linkifying never drops or rewrites characters in the source.
//   2. `href` values are only ever constructed for patterns the regexes
//      matched; the only allowed schemes are http(s), mailto, tel, and our
//      internal `/clinic/patients/<id>` route. javascript:, data:, file:, etc.
//      can never reach the renderer.
//
// All character classes are intentionally restrictive — when in doubt, prefer
// leaving a URL as plain text over generating a wrong link.

export type LinkKind = "text" | "url" | "email" | "phone" | "ref";

export type LinkToken = {
  kind: LinkKind;
  text: string;
  /** Defined for every kind except "text". Always one of the safe schemes. */
  href?: string;
};

// -----------------------------------------------------------------------------
// Regex building blocks
// -----------------------------------------------------------------------------

// Common TLDs we accept on bare domains (no scheme). Kept intentionally short —
// matching e.g. `notes.txt` as a URL would be a worse UX than missing a link.
const BARE_TLDS = [
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "io",
  "co",
  "app",
  "ai",
  "health",
  "dev",
  "us",
];

// Trailing punctuation that should never be considered part of a URL even if
// the regex greedily captured it (e.g. "see https://example.com." or
// "(https://example.com)"). Stripped onto the following text token.
// Excludes the bracket-close set on purpose — `trimTrailing` handles those
// with a balance check so URLs containing balanced parens (e.g. wikipedia
// `_(bar)` paths) survive intact.
const TRAILING_PUNCT = /[.,;:!?'"»]+$/;

// Balance-aware: if the URL has more closing than opening parens/brackets, peel
// the extras back off. Handles markdown-style "(see https://en.wikipedia.org/wiki/Foo_(bar))".
function trimTrailing(url: string): { url: string; trail: string } {
  let trail = "";
  // First, balance closing parens/brackets/braces against any opens inside.
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of pairs) {
      if (!url.endsWith(close)) continue;
      const opens = (url.match(new RegExp(`\\${open}`, "g")) ?? []).length;
      const closes = (url.match(new RegExp(`\\${close}`, "g")) ?? []).length;
      if (closes > opens) {
        trail = url.slice(-1) + trail;
        url = url.slice(0, -1);
        changed = true;
      }
    }
  }
  // Then strip any pure trailing punctuation.
  const m = TRAILING_PUNCT.exec(url);
  if (m) {
    trail = m[0] + trail;
    url = url.slice(0, -m[0].length);
  }
  return { url, trail };
}

// URLs with explicit scheme or www. prefix. We allow only http/https here —
// any other scheme (javascript:, data:, file:, ftp:) is intentionally rejected.
const URL_SCHEMED = /\bhttps?:\/\/[^\s<>"']+/gi;
const URL_WWW = /\bwww\.[^\s<>"']+/gi;

// Bare domains: at least one label, then a known TLD, then optional path.
const URL_BARE = new RegExp(
  String.raw`\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${BARE_TLDS.join(
    "|",
  )})\b(?:\/[^\s<>"']*)?`,
  "gi",
);

// Email — RFC 5322 is huge; this covers the 99% case clinicians type.
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

// US phone numbers in the common formats. We deliberately keep this US-only;
// international support is a follow-up. Anchored on word boundaries / start of
// segment to avoid matching arbitrary number runs (e.g. order IDs).
const PHONE =
  /(?:(?<=^)|(?<=[^\d]))(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}(?=$|[^\d])|(?:(?<=^)|(?<=[^\d]))\d{10}(?=$|[^\d])/g;

// Patient ref markers: @patient:<id> or [[<id>]]. CUID-ish: lowercase alnum, 8+ chars.
const PATIENT_REF = /@patient:([a-z0-9_-]{6,})\b|\[\[([a-z0-9_-]{6,})\]\]/gi;

// -----------------------------------------------------------------------------
// Safe href construction
// -----------------------------------------------------------------------------

const SAFE_URL_SCHEMES = ["http:", "https:"];

function safeUrlHref(raw: string): string | null {
  // If no scheme, prepend https://. Then validate.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!SAFE_URL_SCHEMES.includes(u.protocol.toLowerCase())) return null;
    // Reject obvious credential-bearing URLs as a small phishing mitigation.
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function safeEmailHref(raw: string): string | null {
  // Bare validation: must look like an email and not contain CR/LF that could
  // smuggle headers into a mailto: link.
  if (/[\r\n]/.test(raw)) return null;
  return `mailto:${raw}`;
}

function safePhoneHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return null;
  // E.164 normalization for US.
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `tel:${e164}`;
}

function safePatientHref(id: string): string | null {
  if (!/^[a-z0-9_-]{6,}$/i.test(id)) return null;
  return `/clinic/patients/${id}`;
}

// -----------------------------------------------------------------------------
// Match collection — find all matches across all kinds, then resolve overlaps
// -----------------------------------------------------------------------------

type RawMatch = {
  start: number;
  end: number;
  kind: Exclude<LinkKind, "text">;
  text: string;
  href: string;
};

function collectMatches(input: string): RawMatch[] {
  const matches: RawMatch[] = [];

  // Patient refs first — highest signal, lowest false-positive rate.
  for (const m of input.matchAll(PATIENT_REF)) {
    const id = m[1] ?? m[2];
    if (!id) continue;
    const href = safePatientHref(id);
    if (!href) continue;
    matches.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      kind: "ref",
      text: m[0],
      href,
    });
  }

  // Emails before URLs (so foo@bar.com isn't eaten by the bare-domain rule).
  for (const m of input.matchAll(EMAIL)) {
    const href = safeEmailHref(m[0]);
    if (!href) continue;
    matches.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      kind: "email",
      text: m[0],
      href,
    });
  }

  // URLs — schemed, www, then bare. Each pass skips overlaps with earlier matches.
  const pushUrl = (re: RegExp) => {
    for (const m of input.matchAll(re)) {
      const start = m.index ?? 0;
      const { url, trail: _trail } = trimTrailing(m[0]);
      const end = start + url.length;
      const href = safeUrlHref(url);
      if (!href) continue;
      matches.push({ start, end, kind: "url", text: url, href });
    }
  };
  pushUrl(URL_SCHEMED);
  pushUrl(URL_WWW);
  pushUrl(URL_BARE);

  // Phones last — most ambiguous, easiest to be wrong.
  for (const m of input.matchAll(PHONE)) {
    const text = m[0];
    // Skip leading whitespace if the lookbehind ate it (it shouldn't, but
    // belt-and-suspenders for non-digit boundary).
    const start = (m.index ?? 0);
    const end = start + text.length;
    const href = safePhoneHref(text);
    if (!href) continue;
    matches.push({ start, end, kind: "phone", text, href });
  }

  // Resolve overlaps: sort by start, then prefer earliest, longest, higher-priority kind.
  // Priority: ref > email > url > phone.
  const priority: Record<RawMatch["kind"], number> = {
    ref: 4,
    email: 3,
    url: 2,
    phone: 1,
  };
  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return priority[b.kind] - priority[a.kind];
  });

  const resolved: RawMatch[] = [];
  for (const m of matches) {
    const last = resolved[resolved.length - 1];
    if (last && m.start < last.end) {
      // Overlap. Keep the higher-priority or longer one.
      if (
        priority[m.kind] > priority[last.kind] ||
        (priority[m.kind] === priority[last.kind] &&
          m.end - m.start > last.end - last.start)
      ) {
        resolved[resolved.length - 1] = m;
      }
      continue;
    }
    resolved.push(m);
  }
  return resolved;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Tokenize a string into a stream of text + link segments. Concatenating every
 * token's `.text` yields the input string exactly.
 */
export function linkifyText(text: string): LinkToken[] {
  if (!text) return [];
  const matches = collectMatches(text);
  if (matches.length === 0) {
    return [{ kind: "text", text }];
  }
  const tokens: LinkToken[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      tokens.push({ kind: "text", text: text.slice(cursor, m.start) });
    }
    tokens.push({ kind: m.kind, text: m.text, href: m.href });
    cursor = m.end;
  }
  if (cursor < text.length) {
    tokens.push({ kind: "text", text: text.slice(cursor) });
  }
  return tokens;
}

/**
 * Internal helper: re-export the safe-href constructors so tests can exercise
 * the XSS-rejection paths directly.
 */
export const __testables = {
  safeUrlHref,
  safeEmailHref,
  safePhoneHref,
  safePatientHref,
  trimTrailing,
};
