import { describe, expect, it } from "vitest";

import {
  buildPracticeConfigurationVersionDiff,
  isRollbackSnapshotBlocked,
  normalizeControllerStep,
} from "./practice-config-versioning-logic";

describe("practice config versioning logic", () => {
  it("builds a semantic diff between version snapshots", () => {
    const diff = buildPracticeConfigurationVersionDiff(
      {
        id: "v1",
        version: 1,
        snapshot: { careModel: "collaborative", enabledModalities: ["video"] },
      },
      {
        id: "v2",
        version: 2,
        snapshot: { careModel: "physician-led", enabledModalities: ["video"] },
      },
    );

    expect(diff.fromVersion).toBe(1);
    expect(diff.toVersion).toBe(2);
    expect(diff.entries).toEqual([
      expect.objectContaining({
        label: "Care Model",
        path: "careModel",
        kind: "changed",
      }),
    ]);
  });

  it("blocks rollback snapshots that reference deprecated templates", () => {
    expect(isRollbackSnapshotBlocked({ deprecatedTemplateIds: ["tmpl-1"] })).toBe(true);
    expect(
      isRollbackSnapshotBlocked({
        templateStatuses: { "tmpl-1": "active", "tmpl-2": "deprecated" },
      }),
    ).toBe(true);
    expect(isRollbackSnapshotBlocked({ templateStatuses: { "tmpl-1": "active" } })).toBe(false);
  });

  it("clamps controller steps into the wizard range", () => {
    expect(normalizeControllerStep(-3)).toBe(1);
    expect(normalizeControllerStep(20)).toBe(15);
    expect(normalizeControllerStep(4.7)).toBe(4);
  });
});
