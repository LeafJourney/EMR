import { describe, it, expect } from "vitest";
import { buildStatementNotice } from "./statement-notice";

const input = {
  statementNumber: "STMT-2026-001",
  portalUrl: "https://app.leafjourney.com",
  practiceName: "Leafjourney Health",
};

describe("buildStatementNotice", () => {
  it("email notice carries the statement number, practice, and a portal link", () => {
    const n = buildStatementNotice("email", input);
    expect(n.subject).toContain("STMT-2026-001");
    expect(n.subject).toContain("Leafjourney Health");
    expect(n.body).toContain("STMT-2026-001");
    expect(n.body).toContain("https://app.leafjourney.com/portal/billing/statements");
  });

  it("sms notice is link-only and has no subject", () => {
    const n = buildStatementNotice("sms", input);
    expect(n.subject).toBeUndefined();
    expect(n.body).toContain("STMT-2026-001");
    expect(n.body).toContain("https://app.leafjourney.com/portal/billing/statements");
  });

  it("is PHI-safe: never leaks an amount or clinical detail", () => {
    for (const channel of ["email", "sms"] as const) {
      const n = buildStatementNotice(channel, input);
      const text = `${n.subject ?? ""} ${n.body}`;
      // no currency figures
      expect(text).not.toMatch(/\$\d/);
      // no diagnosis/medication/visit words
      expect(text.toLowerCase()).not.toMatch(/diagnos|medication|visit note|cpt|icd/);
    }
  });

  it("falls back to a generic destination when no portal URL is configured", () => {
    const n = buildStatementNotice("email", { ...input, portalUrl: "" });
    expect(n.body).toContain("your patient portal");
    expect(n.body).not.toContain("undefined");
  });

  it("normalizes a trailing slash on the portal origin", () => {
    const n = buildStatementNotice("sms", { ...input, portalUrl: "https://app.leafjourney.com/" });
    expect(n.body).toContain("https://app.leafjourney.com/portal/billing/statements");
    expect(n.body).not.toContain("com//portal");
  });
});
