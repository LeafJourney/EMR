import { describe, it, expect } from "vitest";
import { labelFor } from "./labels";

describe("labelFor", () => {
  it("uses the explicit label for known top-level keys", () => {
    expect(labelFor("selectedSpecialty")).toBe("Selected specialty");
    expect(labelFor("careModel")).toBe("Care model");
    expect(labelFor("publishedAt")).toBe("Published at");
  });

  it("falls back to humanized camelCase for unknown keys", () => {
    expect(labelFor("someExperimentalFlag")).toBe("Some experimental flag");
  });

  it("formats numeric path segments as 1-based items", () => {
    expect(labelFor("enabledModalities.0")).toBe("Enabled modalities · Item 1");
    expect(labelFor("enabledModalities.2")).toBe("Enabled modalities · Item 3");
  });

  it("walks nested paths", () => {
    expect(labelFor("regulatoryFlags.hipaa")).toBe("Regulatory flags · Hipaa");
  });

  it("returns empty string for empty input", () => {
    expect(labelFor("")).toBe("");
  });
});
