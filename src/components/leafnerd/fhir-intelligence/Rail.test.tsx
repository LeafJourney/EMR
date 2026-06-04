import { describe, it, expect } from "vitest";
import { getInitials } from "./Rail";

describe("Leafnerd Rail - getInitials helper", () => {
  it("returns DP for Dr. Patel", () => {
    expect(getInitials("Dr. Patel")).toBe("DP");
  });

  it("returns DR for Dr. Reyes", () => {
    expect(getInitials("Dr. Reyes")).toBe("DR");
  });

  it("returns DR for undefined input", () => {
    expect(getInitials(undefined)).toBe("DR");
    expect(getInitials("")).toBe("DR");
  });

  it("handles double-digit regular names correctly", () => {
    expect(getInitials("Lena Reyes")).toBe("LR");
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("handles single-digit names correctly", () => {
    expect(getInitials("Neal")).toBe("N");
    expect(getInitials("A")).toBe("A");
  });
});
