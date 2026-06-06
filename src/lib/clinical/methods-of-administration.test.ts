import { describe, it, expect } from "vitest";
import {
  ADMINISTRATION_METHODS,
  methodByKey,
  mapRouteToMethod,
} from "./methods-of-administration";

describe("administration method taxonomy (EMR-880)", () => {
  it("never uses gold/red/green for header bubbles", () => {
    for (const m of ADMINISTRATION_METHODS) {
      expect(m.headerClass).not.toMatch(/amber|yellow|gold|red-|green-/);
    }
  });
  it("has examples for each method", () => {
    expect(ADMINISTRATION_METHODS.length).toBeGreaterThanOrEqual(12);
    expect(methodByKey("oral")?.examples).toContain("Edibles");
  });
});

describe("mapRouteToMethod", () => {
  it("maps free-text routes to canonical families", () => {
    expect(mapRouteToMethod("vape cartridge")).toBe("inhalation");
    expect(mapRouteToMethod("sublingual tincture")).toBe("oral");
    expect(mapRouteToMethod("transdermal patch")).toBe("topical_transdermal");
    expect(mapRouteToMethod("rectal suppository")).toBe("suppository");
    expect(mapRouteToMethod("IM injection")).toBe("injectable");
  });
  it("defaults unknown routes to oral", () => {
    expect(mapRouteToMethod("")).toBe("oral");
    expect(mapRouteToMethod(undefined)).toBe("oral");
  });
});
