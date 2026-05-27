import { describe, expect, it } from "vitest";

import { createAppRouteMatcher } from "./app-route-map";

describe("createAppRouteMatcher", () => {
  it("matches exact app routes and strips query strings", () => {
    const matches = createAppRouteMatcher(["/clinic", "/ops/settings/ai-config"]);

    expect(matches("/clinic")).toBe(true);
    expect(matches("/ops/settings/ai-config?tab=models")).toBe(true);
  });

  it("matches dynamic route segments", () => {
    const matches = createAppRouteMatcher([
      "/clinic/patients/:id",
      "/ops/cfo/reports/:id",
    ]);

    expect(matches("/clinic/patients/patient_123")).toBe(true);
    expect(matches("/ops/cfo/reports/report_123")).toBe(true);
  });

  it("does not match missing sibling routes", () => {
    const matches = createAppRouteMatcher(["/clinic", "/clinic/sign-off/labs"]);

    expect(matches("/clinic/queue")).toBe(false);
    expect(matches("/clinic/labs-review")).toBe(false);
  });
});
