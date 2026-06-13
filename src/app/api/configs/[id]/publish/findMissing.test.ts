import { describe, expect, it } from "vitest";

import { findMissing } from "./readiness";

// A config that satisfies every structural go-live requirement. The
// cross-record checks (active provider, valid NPI) are enforced in the handler
// against the DB and are intentionally out of scope for this pure unit test.
const completeConfig: Record<string, unknown> = {
  selectedSpecialty: "primary-care",
  careModel: "in-person",
  enabledModalities: ["telehealth"],
  chartingTemplateIds: ["charting-1"],
  workflowTemplateIds: ["workflow-1"],
};

describe("publish gate — findMissing (structural readiness)", () => {
  it("returns no missing fields for a fully-configured draft", () => {
    expect(findMissing({ ...completeConfig })).toEqual([]);
  });

  it("flags an empty charting template array — clinicians need a charting surface", () => {
    expect(findMissing({ ...completeConfig, chartingTemplateIds: [] })).toContain(
      "chartingTemplateIds",
    );
  });

  it("flags a missing workflow template array", () => {
    const { workflowTemplateIds: _omit, ...noWorkflows } = completeConfig;
    expect(findMissing(noWorkflows)).toContain("workflowTemplateIds");
  });

  it("still flags the original required fields", () => {
    const missing = findMissing({});
    expect(missing).toEqual(
      expect.arrayContaining([
        "selectedSpecialty",
        "careModel",
        "enabledModalities",
        "chartingTemplateIds",
        "workflowTemplateIds",
      ]),
    );
  });

  it("accepts enabledModalities nested under settings (legacy shape)", () => {
    const { enabledModalities: _omit, ...rest } = completeConfig;
    const legacy = { ...rest, settings: { enabledModalities: ["telehealth"] } };
    expect(findMissing(legacy)).toEqual([]);
  });
});
