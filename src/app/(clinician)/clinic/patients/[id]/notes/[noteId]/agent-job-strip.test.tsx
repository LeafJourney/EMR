import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentJobStrip, type AgentJobLite } from "./agent-job-strip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function dump(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("AgentJobStrip", () => {
  it("renders friendly agent names and live statuses", () => {
    const jobs: AgentJobLite[] = [
      {
        id: "1",
        agentName: "codingReadiness",
        status: "succeeded",
        lastError: null,
        completedAt: "2026-06-09T12:00:00.000Z",
      },
      {
        id: "2",
        agentName: "patientOutreach",
        status: "needs_approval",
        lastError: null,
        completedAt: null,
      },
      {
        id: "3",
        agentName: "outcomeTracker",
        status: "running",
        lastError: null,
        completedAt: null,
      },
    ];
    const str = dump(<AgentJobStrip jobs={jobs} />);
    expect(str).toContain("After-visit automations");
    expect(str).toContain("Coding readiness");
    expect(str).toContain("Patient outreach");
    expect(str).toContain("Outcome tracker");
    expect(str).toContain("Done");
    expect(str).toContain("Awaiting approval");
    expect(str).toContain("Running");
  });

  it("surfaces the failure reason for a failed job", () => {
    const jobs: AgentJobLite[] = [
      {
        id: "1",
        agentName: "codingReadiness",
        status: "failed",
        lastError: "model timeout",
        completedAt: null,
      },
    ];
    const str = dump(<AgentJobStrip jobs={jobs} />);
    expect(str).toContain("Failed");
    expect(str).toContain("model timeout");
  });

  it("shows an empty state when no downstream jobs exist", () => {
    const str = dump(<AgentJobStrip jobs={[]} />);
    expect(str).toContain("No downstream agent jobs");
  });
});
