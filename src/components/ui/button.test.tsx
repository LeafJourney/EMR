import { describe, expect, it } from "vitest";
import * as React from "react";
import util from "util";
import { Button } from "./button";

function dump(node: React.ReactElement | null): string {
  return util.inspect(node, { depth: null });
}

describe("Button Component", () => {
  it("includes whitespace-nowrap base class", () => {
    const ButtonRender = (Button as any).render;
    const out = ButtonRender({ children: "Test Button" }, null);
    const str = dump(out);
    expect(str).toContain("whitespace-nowrap");
  });
});
