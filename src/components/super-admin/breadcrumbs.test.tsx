// Unit tests for the super-admin <Breadcrumbs/> component.
//
// Vitest in this repo runs in a node environment with no DOM, so we
// inspect the React element tree directly via util.inspect (same pattern
// as src/app/(clinician)/clinic/page.test.tsx). That's enough to lock
// down the contract: ARIA wrapper, last-item current-page semantics,
// separators between items, and the no-link rule for the final entry.

import { describe, it, expect } from "vitest";
import util from "util";

import { Breadcrumbs } from "./breadcrumbs";

function dump(node: React.ReactElement | null): string {
  return util.inspect(node, { depth: null });
}

describe("<Breadcrumbs/>", () => {
  it("renders a <nav aria-label=\"Breadcrumb\"> wrapper", () => {
    const out = Breadcrumbs({
      items: [
        { label: "HQ", href: "/admin/hq" },
        { label: "Dashboard" },
      ],
    });
    const str = dump(out as React.ReactElement);
    expect(str).toContain("'aria-label': 'Breadcrumb'");
  });

  it("marks the last item with aria-current=page and gives it NO link", () => {
    const out = Breadcrumbs({
      items: [
        { label: "HQ", href: "/admin/hq" },
        { label: "Operations" },
        { label: "Practices", href: "/practices" },
        { label: "Sunrise Pain Clinic" },
      ],
    });
    const str = dump(out as React.ReactElement);

    // aria-current marker is present
    expect(str).toContain("'aria-current': 'page'");

    // The final label should NOT appear inside a Link href
    // (i.e. no "Sunrise Pain Clinic" string near an href= attribute).
    // We check by ensuring the substring "Sunrise Pain Clinic" never
    // appears alongside an href in the same element block.
    const finalLabel = "Sunrise Pain Clinic";
    expect(str).toContain(finalLabel);
    // No href referencing the final label's slugged path should exist —
    // simplest tight check: the final label should only ever appear in a
    // span element, never inside a Link's children alongside an href.
    const linkifiedFinal = new RegExp(
      `href:\\s*['"][^'"]*['"][^}]*children:\\s*['"]${finalLabel}`,
    );
    expect(str).not.toMatch(linkifiedFinal);
  });

  it("renders the chevron separator between every pair of items", () => {
    const out = Breadcrumbs({
      items: [
        { label: "HQ", href: "/admin/hq" },
        { label: "Audit" },
        { label: "Audit log" },
      ],
    });
    const str = dump(out as React.ReactElement);
    // Three items → two separators.
    const matches = str.match(/›/g) ?? [];
    expect(matches.length).toBe(2);
    // Separators are aria-hidden so they don't pollute screen readers.
    expect(str).toContain("'aria-hidden': 'true'");
  });

  it("renders mid-chain pillar items WITHOUT an href as plain spans", () => {
    const out = Breadcrumbs({
      items: [
        { label: "HQ", href: "/admin/hq" },
        { label: "Security" }, // pillar — no href on purpose
        { label: "Super-admin console" },
      ],
    });
    const str = dump(out as React.ReactElement);

    // First item is a Link (it has href="/admin/hq").
    expect(str).toContain("'/admin/hq'");

    // Pillar item "Security" must NOT appear inside a Link element — we
    // detect a Link by the presence of an `href` adjacent to the pillar
    // label.
    const linkifiedPillar = /href:\s*['"][^'"]*['"][^}]*children:\s*['"]Security/;
    expect(str).not.toMatch(linkifiedPillar);
  });

  it("returns null when given an empty items array", () => {
    const out = Breadcrumbs({ items: [] });
    expect(out).toBeNull();
  });

  it("renders a single-item trail as just the current page with no separators", () => {
    const out = Breadcrumbs({ items: [{ label: "Dashboard" }] });
    const str = dump(out as React.ReactElement);
    expect(str).not.toContain("›");
    expect(str).toContain("'aria-current': 'page'");
    expect(str).toContain("Dashboard");
  });
});
