// Linkify unit coverage. The two load-bearing invariants:
//   1. text round-trip: tokens.map(t => t.text).join("") === input
//   2. href safety: never javascript:/data:/file:/etc. — only http(s)/mailto/tel
//      and our internal /clinic/patients/<id> route.

import { describe, expect, it } from "vitest";

import { __testables, linkifyText } from "./linkify";

const joined = (s: string) =>
  linkifyText(s)
    .map((t) => t.text)
    .join("");

describe("linkifyText — round-trip invariant", () => {
  it("preserves the input verbatim across token boundaries", () => {
    const inputs = [
      "no links here",
      "see https://example.com for details",
      "(per https://en.wikipedia.org/wiki/Foo_(bar)) — neat",
      "email me at clinician@leafjourney.com or call (555) 123-4567",
      "visit www.example.com.",
      "patient @patient:abc123def for review",
      "",
    ];
    for (const input of inputs) {
      expect(joined(input)).toBe(input);
    }
  });
});

describe("linkifyText — URLs", () => {
  it("recognizes schemed http(s) URLs", () => {
    const tokens = linkifyText("go to https://leafjourney.com now");
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("https://leafjourney.com");
    expect(url?.href).toBe("https://leafjourney.com/");
  });

  it("auto-prefixes www. URLs with https://", () => {
    const tokens = linkifyText("see www.example.com");
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("www.example.com");
    expect(url?.href).toBe("https://www.example.com/");
  });

  it("recognizes bare domains with known TLDs", () => {
    const tokens = linkifyText("docs at leafjourney.com today");
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("leafjourney.com");
    expect(url?.href).toBe("https://leafjourney.com/");
  });

  it("strips trailing punctuation off URLs", () => {
    const tokens = linkifyText("read https://example.com.");
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("https://example.com");
    const last = tokens[tokens.length - 1];
    expect(last?.kind).toBe("text");
    expect(last?.text.endsWith(".")).toBe(true);
  });

  it("handles URLs in parentheses without eating the closing paren", () => {
    const tokens = linkifyText("(see https://example.com)");
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("https://example.com");
    const last = tokens[tokens.length - 1];
    expect(last?.text).toBe(")");
  });

  it("keeps balanced parens inside the URL (wikipedia style)", () => {
    const tokens = linkifyText(
      "see https://en.wikipedia.org/wiki/Foo_(bar) for context",
    );
    const url = tokens.find((t) => t.kind === "url");
    expect(url?.text).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });
});

describe("linkifyText — emails", () => {
  it("recognizes standard emails", () => {
    const tokens = linkifyText("reach scott@leafjourney.com please");
    const email = tokens.find((t) => t.kind === "email");
    expect(email?.text).toBe("scott@leafjourney.com");
    expect(email?.href).toBe("mailto:scott@leafjourney.com");
  });

  it("recognizes emails with plus addressing and dots", () => {
    const tokens = linkifyText("triage+oncall@clinic.health");
    const email = tokens.find((t) => t.kind === "email");
    expect(email?.text).toBe("triage+oncall@clinic.health");
  });

  it("does not double-match an email as a bare domain", () => {
    const tokens = linkifyText("write neal@leafjourney.com today");
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toContain("email");
    expect(kinds).not.toContain("url");
  });
});

describe("linkifyText — phones", () => {
  it("recognizes (555) 123-4567 format", () => {
    const tokens = linkifyText("call (555) 123-4567 anytime");
    const phone = tokens.find((t) => t.kind === "phone");
    expect(phone?.text).toBe("(555) 123-4567");
    expect(phone?.href).toBe("tel:+15551234567");
  });

  it("recognizes 555-123-4567 format", () => {
    const tokens = linkifyText("ring 555-123-4567 ASAP");
    const phone = tokens.find((t) => t.kind === "phone");
    expect(phone?.text).toBe("555-123-4567");
    expect(phone?.href).toBe("tel:+15551234567");
  });

  it("recognizes bare 10-digit numbers as phones", () => {
    const tokens = linkifyText("dial 5551234567 now");
    const phone = tokens.find((t) => t.kind === "phone");
    expect(phone?.text).toBe("5551234567");
  });

  it("recognizes +1 prefixed phone numbers", () => {
    const tokens = linkifyText("call +1 (555) 123-4567");
    const phone = tokens.find((t) => t.kind === "phone");
    expect(phone?.href).toBe("tel:+15551234567");
  });
});

describe("linkifyText — patient refs", () => {
  it("recognizes @patient:<id> markers", () => {
    const tokens = linkifyText("flagged by @patient:cln01abc23 today");
    const ref = tokens.find((t) => t.kind === "ref");
    expect(ref?.text).toBe("@patient:cln01abc23");
    expect(ref?.href).toBe("/clinic/patients/cln01abc23");
  });

  it("recognizes [[<id>]] markers", () => {
    const tokens = linkifyText("see chart [[abc123def]] for context");
    const ref = tokens.find((t) => t.kind === "ref");
    expect(ref?.text).toBe("[[abc123def]]");
    expect(ref?.href).toBe("/clinic/patients/abc123def");
  });
});

describe("linkifyText — XSS / scheme safety", () => {
  it("does not linkify javascript: URLs", () => {
    const tokens = linkifyText('click javascript:alert("xss") please');
    expect(tokens.every((t) => t.kind !== "url")).toBe(true);
  });

  it("does not linkify data: URLs", () => {
    const tokens = linkifyText("payload data:text/html,<script>alert(1)</script>");
    expect(tokens.every((t) => t.kind !== "url")).toBe(true);
  });

  it("does not linkify file:// URLs", () => {
    const tokens = linkifyText("see file:///etc/passwd here");
    expect(tokens.every((t) => t.kind !== "url")).toBe(true);
  });

  it("does not linkify ftp:// URLs", () => {
    const tokens = linkifyText("get ftp://example.com/file");
    // The bare-domain path may match example.com but never the ftp scheme.
    for (const t of tokens) {
      expect(t.href?.startsWith("ftp")).not.toBe(true);
    }
  });

  it("escapes <script> payloads as inert text", () => {
    const input = '<script>alert("xss")</script>';
    const tokens = linkifyText(input);
    expect(tokens.every((t) => t.kind === "text")).toBe(true);
    expect(joined(input)).toBe(input);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(__testables.safeUrlHref("https://user:pass@evil.com")).toBeNull();
  });

  it("rejects mailto values with CRLF (header injection)", () => {
    expect(
      __testables.safeEmailHref("a@b.com\r\nBcc: attacker@evil.com"),
    ).toBeNull();
  });

  it("rejects bogus patient ids that don't look like cuids", () => {
    expect(__testables.safePatientHref("a")).toBeNull();
    expect(__testables.safePatientHref("../../etc/passwd")).toBeNull();
  });

  it("rejects phone numbers that are too short or too long", () => {
    expect(__testables.safePhoneHref("12345")).toBeNull();
    expect(__testables.safePhoneHref("123456789012")).toBeNull();
  });

  it("only ever emits safe schemes in href values", () => {
    const input =
      'mix javascript:alert(1) and https://example.com and ftp://x.com and ' +
      'mailto:foo@bar.com and tel:911 and @patient:cln01abc23';
    const tokens = linkifyText(input);
    for (const t of tokens) {
      if (!t.href) continue;
      const ok =
        t.href.startsWith("https://") ||
        t.href.startsWith("http://") ||
        t.href.startsWith("mailto:") ||
        t.href.startsWith("tel:") ||
        t.href.startsWith("/clinic/patients/");
      expect(ok).toBe(true);
    }
  });
});

describe("linkifyText — mixed content", () => {
  it("handles a realistic chart-note snippet", () => {
    const input =
      "Pt reports improved sleep. Sent education to scott@leafjourney.com. " +
      "Reference: https://pubmed.ncbi.nlm.nih.gov/12345 — call (555) 123-4567 for follow-up.";
    const tokens = linkifyText(input);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("url");
    expect(kinds).toContain("phone");
    expect(joined(input)).toBe(input);
  });

  it("returns a single text token when input has no matches", () => {
    const tokens = linkifyText("plain narrative without any links at all");
    expect(tokens).toEqual([
      { kind: "text", text: "plain narrative without any links at all" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(linkifyText("")).toEqual([]);
  });
});
