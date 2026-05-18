import { describe, expect, it } from "vitest";
import {
  RERUN_BUDGET,
  classify,
  type FailureContext,
} from "./triage-staging-failure";

// Builder so each test only spells out the fields that matter to its
// case. Defaults represent a no-op pipeline run: one failing public-route
// crawl with a plain assertion error, no sensitive paths touched.
function ctx(overrides: Partial<FailureContext> = {}): FailureContext {
  return {
    workflowRunId: 12345,
    headSha: "abc123",
    failedJobName: "Automated Tests (Staging)",
    failedTests: [
      {
        file: "e2e/public-surfaces.spec.ts",
        title: "Public surfaces — pass 1 > scan /pricing",
        error: "expect(received).toBe(expected) // some assertion",
      },
    ],
    changedPaths: ["docs/README.md"],
    rerunCount: 0,
    ...overrides,
  };
}

describe("classify (CI/CD self-heal triage)", () => {
  it("escalates when no failed tests were parsed (infra failure)", () => {
    const d = classify(ctx({ failedTests: [] }));
    expect(d.action).toBe("escalate");
    expect(d.risk).toBe("high");
    expect(d.signal).toBe("unknown");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Flake → rerun
  // ─────────────────────────────────────────────────────────────────────
  describe("flake detection", () => {
    it("reroutes a Playwright test-timeout to rerun", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/link-integrity.spec.ts",
              title: "Link integrity > crawl /leafmart",
              error: "Test timeout of 30000ms exceeded",
            },
          ],
        }),
      );
      expect(d.action).toBe("rerun");
      expect(d.signal).toBe("flake");
      expect(d.risk).toBe("low");
    });

    it("treats target-page-closed as a flake", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/click-handlers.spec.ts",
              title: "Click handlers > crawl /pricing",
              error:
                "Error: page.waitForTimeout: Target page, context or browser has been closed",
            },
          ],
        }),
      );
      expect(d.action).toBe("rerun");
    });

    it("treats net::ERR_CONNECTION_RESET as a flake", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/health.spec.ts",
              title: "Platform smoke > homepage loads",
              error: "net::ERR_CONNECTION_RESET at https://staging.../",
            },
          ],
        }),
      );
      expect(d.action).toBe("rerun");
    });

    it("escalates a transient signature once the rerun budget is spent", () => {
      // Same flake, third time in a row → stop calling it a flake.
      const d = classify(
        ctx({
          rerunCount: RERUN_BUDGET,
          failedTests: [
            {
              file: "e2e/link-integrity.spec.ts",
              title: "Link integrity > crawl /leafmart",
              error: "Test timeout of 30000ms exceeded",
            },
          ],
        }),
      );
      expect(d.action).toBe("autofix");
      expect(d.signal).toBe("regression");
      expect(d.reason).toMatch(/treating as a real bug/i);
    });

    it("does NOT classify as flake if even one failed test is non-transient", () => {
      // Two failures: one timeout (flaky), one assertion (real).
      // Whole batch must be classified by the worst signal.
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/link-integrity.spec.ts",
              title: "Link integrity > crawl /leafmart",
              error: "Test timeout of 30000ms exceeded",
            },
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /pricing",
              error: "Expected title to match /Pricing/, got /Leafjourney/",
            },
          ],
        }),
      );
      expect(d.action).toBe("autofix");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Sensitive surface → escalate (no autofix)
  // ─────────────────────────────────────────────────────────────────────
  describe("sensitive-surface escalation", () => {
    it("escalates failures on /portal (patient PHI)", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/click-handlers.spec.ts",
              title: "Click handlers > crawl /portal",
              error: "Expected modal to be visible",
            },
          ],
        }),
      );
      expect(d.action).toBe("escalate");
      expect(d.risk).toBe("high");
    });

    it("escalates failures on /clinic", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/auth.spec.ts",
              title: "Clinician > redirected to /clinic",
              error: "Got /portal instead",
            },
          ],
        }),
      );
      expect(d.action).toBe("escalate");
    });

    it("escalates failures on /admin", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/admin.spec.ts",
              title: "Super admin > /admin/hq loads",
              error: "Expected status 200, got 500",
            },
          ],
        }),
      );
      expect(d.action).toBe("escalate");
    });

    it("escalates when a public-route test calls a sensitive API", () => {
      // Test title is public, but the failure trace includes a fetch to
      // /api/billing — that's a privileged surface. Still escalate.
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /pricing",
              error: "Failed POST /api/billing/calculate → 500",
            },
          ],
        }),
      );
      expect(d.action).toBe("escalate");
    });

    it("does NOT escalate on '/portal-marketing' (substring false positive)", () => {
      // Token-boundary check: /portal-marketing is a marketing route that
      // happens to start with /portal. We don't escalate on that.
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /portal-marketing",
              error: "Title mismatch",
            },
          ],
        }),
      );
      expect(d.action).toBe("autofix");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Sensitive diff → escalate (regardless of which test failed)
  // ─────────────────────────────────────────────────────────────────────
  describe("sensitive-diff escalation", () => {
    it("escalates when the merge touched src/lib/auth/*", () => {
      const d = classify(
        ctx({
          changedPaths: [
            "src/lib/auth/session.ts",
            "docs/CHANGELOG.md",
          ],
          failedTests: [
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /pricing",
              error: "Title mismatch",
            },
          ],
        }),
      );
      expect(d.action).toBe("escalate");
      expect(d.reason).toMatch(/sensitive path/i);
    });

    it("escalates when the merge touched the Prisma schema", () => {
      const d = classify(
        ctx({
          changedPaths: ["prisma/schema.prisma"],
        }),
      );
      expect(d.action).toBe("escalate");
    });

    it("escalates when the merge touched middleware.ts", () => {
      const d = classify(ctx({ changedPaths: ["src/middleware.ts"] }));
      expect(d.action).toBe("escalate");
    });

    it("escalates when the merge touched any (clinician)/(operator)/(patient) page", () => {
      const d = classify(
        ctx({
          changedPaths: ["src/app/(clinician)/clinic/page.tsx"],
        }),
      );
      expect(d.action).toBe("escalate");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Default → autofix (real regression on a non-sensitive surface)
  // ─────────────────────────────────────────────────────────────────────
  describe("autofix routing", () => {
    it("routes plain assertion failures on /pricing to autofix", () => {
      const d = classify(ctx());
      expect(d.action).toBe("autofix");
      expect(d.risk).toBe("medium");
      expect(d.signal).toBe("regression");
    });

    it("routes assertion failures on /leafmart to autofix", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /leafmart",
              error: "Expected hero copy to include 'Shop' got 'Welcome'",
            },
          ],
        }),
      );
      expect(d.action).toBe("autofix");
    });

    it("routes assertion failures on /education to autofix", () => {
      const d = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/link-integrity.spec.ts",
              title: "Link integrity > crawl /education",
              error: "Expected status 200, got 404",
            },
          ],
        }),
      );
      expect(d.action).toBe("autofix");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Signatures are stable + dedupable
  // ─────────────────────────────────────────────────────────────────────
  describe("failure signatures", () => {
    it("produces the same signature for identical failures", () => {
      const a = classify(ctx());
      const b = classify(ctx());
      expect(a.failureSignature).toBe(b.failureSignature);
    });

    it("produces a different signature when a different test fails", () => {
      const a = classify(ctx());
      const b = classify(
        ctx({
          failedTests: [
            {
              file: "e2e/public-surfaces.spec.ts",
              title: "Public surfaces > scan /features",
              error: "expect(received).toBe(expected) // some assertion",
            },
          ],
        }),
      );
      expect(a.failureSignature).not.toBe(b.failureSignature);
    });

    it("is order-independent across the failedTests array", () => {
      const t1 = {
        file: "a.spec.ts",
        title: "alpha test",
        error: "boom 1",
      };
      const t2 = {
        file: "b.spec.ts",
        title: "beta test",
        error: "boom 2",
      };
      const ordered = classify(ctx({ failedTests: [t1, t2] }));
      const reordered = classify(ctx({ failedTests: [t2, t1] }));
      expect(ordered.failureSignature).toBe(reordered.failureSignature);
    });
  });
});
