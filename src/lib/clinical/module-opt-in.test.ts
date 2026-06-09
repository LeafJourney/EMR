import { describe, it, expect } from "vitest";
import {
  resolveModuleFlags,
  anyControlledModule,
  scrubModuleWords,
} from "./module-opt-in";

describe("resolveModuleFlags", () => {
  it("defaults cannabis on, psilocybin off", () => {
    const f = resolveModuleFlags();
    expect(f.cannabis).toBe(true);
    expect(f.psilocybin).toBe(false);
  });
  it("honours explicit org opt-in over defaults", () => {
    const f = resolveModuleFlags({ orgOptIn: { cannabis: false, psilocybin: true } });
    expect(f.cannabis).toBe(false);
    expect(f.psilocybin).toBe(true);
  });
});

describe("anyControlledModule", () => {
  it("is true when either module is on", () => {
    expect(anyControlledModule({ cannabis: false, psilocybin: true })).toBe(true);
    expect(anyControlledModule({ cannabis: false, psilocybin: false })).toBe(false);
  });
});

describe("scrubModuleWords (EMR-873/883)", () => {
  it("removes cannabis when the module is off", () => {
    const flags = { cannabis: false, psilocybin: false };
    expect(scrubModuleWords("Cannabis Rx", flags)).toBe("Rx");
    expect(scrubModuleWords("Cannabis Prescription", flags)).toBe("Prescription");
  });
  it("keeps cannabis when the module is on", () => {
    const flags = { cannabis: true, psilocybin: false };
    expect(scrubModuleWords("Cannabis Rx", flags)).toBe("Cannabis Rx");
  });
});
