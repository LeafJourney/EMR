import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, it, expect } from "vitest";
import { loginFailureDetector } from "./login-failure";

describe("loginFailureDetector (no-op stub — EMR-737)", () => {
  it("has stable slug login_failure", () => {
    expect(loginFailureDetector.slug).toBe("login_failure");
  });

  it("emits nothing until a first-class auth-failure source exists", async () => {
    const fakePrisma = {} as never;
    const out = await loginFailureDetector.run(fakePrisma);
    expect(out).toEqual([]);
  });
});
