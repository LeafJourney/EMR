import { describe, expect, it } from "vitest";
import * as React from "react";
import util from "util";

import { RunwaySparkline } from "./runway-sparkline";
import type { RunwayTrend } from "@/lib/finance/cash-flow-runway";

function dump(node: React.ReactElement | null): string {
  return util.inspect(node, { depth: null });
}

describe("RunwaySparkline", () => {
  it("renders normalized points and the runway caption", () => {
    const trend: RunwayTrend = {
      points: [
        { x: 0, y: 4 },
        { x: 50, y: 16 },
        { x: 100, y: 25 },
      ],
      projectedCashCents: 0,
      caption: "30d runway at current burn",
      tone: "bad",
    };

    const out = RunwaySparkline({ trend });
    const str = dump(out);

    expect(str).toContain("0,4 50,16 100,25");
    expect(str).toContain("30d runway at current burn");
    expect(str).toContain("stroke-danger");
  });
});
