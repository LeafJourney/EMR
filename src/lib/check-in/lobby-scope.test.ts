import { describe, expect, it } from "vitest";

import {
  isLobbyWorkflow,
  workflowForRequirement,
  resolveLobbyTasks,
  LOBBY_WORKFLOWS,
} from "./lobby-scope";

describe("isLobbyWorkflow", () => {
  it("accepts only the in-scope workflows", () => {
    expect(isLobbyWorkflow("intake")).toBe(true);
    expect(isLobbyWorkflow("consent")).toBe(true);
  });
  it("rejects anything outside the allow-list (chart, records, messages)", () => {
    expect(isLobbyWorkflow("chart")).toBe(false);
    expect(isLobbyWorkflow("records")).toBe(false);
    expect(isLobbyWorkflow("messages")).toBe(false);
    expect(isLobbyWorkflow("")).toBe(false);
  });
});

describe("workflowForRequirement", () => {
  it("maps phone-resolvable gate requirements to their workflow", () => {
    expect(workflowForRequirement("presenting_concerns")).toBe("intake");
    expect(workflowForRequirement("cannabis_history")).toBe("intake");
    expect(workflowForRequirement("consent")).toBe("consent");
  });
  it("returns null for requirements the front desk owns (never a phone task)", () => {
    expect(workflowForRequirement("demographics")).toBeNull();
    expect(workflowForRequirement("id_age_verification")).toBeNull();
    expect(workflowForRequirement("allergy_screen")).toBeNull();
    expect(workflowForRequirement("insurance_or_attestation")).toBeNull();
    expect(workflowForRequirement("outcome_log_since_last_visit")).toBeNull();
  });
});

describe("resolveLobbyTasks", () => {
  it("returns no tasks when nothing phone-resolvable is missing", () => {
    expect(resolveLobbyTasks(["demographics", "insurance_or_attestation"])).toEqual([]);
  });

  it("surfaces only the workflows whose requirements are outstanding", () => {
    const tasks = resolveLobbyTasks(["presenting_concerns", "demographics"]);
    expect(tasks.map((t) => t.workflow)).toEqual(["intake"]);
  });

  it("de-duplicates multiple requirements that map to the same workflow", () => {
    const tasks = resolveLobbyTasks(["presenting_concerns", "cannabis_history"]);
    expect(tasks.map((t) => t.workflow)).toEqual(["intake"]);
  });

  it("keeps stable workflow order (intake before consent)", () => {
    const tasks = resolveLobbyTasks(["consent", "presenting_concerns"]);
    expect(tasks.map((t) => t.workflow)).toEqual(["intake", "consent"]);
  });

  it("builds a cookie-based (not token-scoped) href per task", () => {
    const [task] = resolveLobbyTasks(["consent"]);
    expect(task.href).toBe("/kiosk/lobby/consent");
  });

  it("never emits a workflow outside the allow-list", () => {
    const tasks = resolveLobbyTasks(["presenting_concerns", "consent", "demographics"]);
    for (const t of tasks) {
      expect(LOBBY_WORKFLOWS).toContain(t.workflow);
    }
  });

  it("marks tasks as not-submitted by default", () => {
    const tasks = resolveLobbyTasks(["presenting_concerns", "consent"]);
    expect(tasks.map((t) => t.submitted)).toEqual([false, false]);
  });

  it("flags only the workflows with a staged submission, but keeps them in scope", () => {
    const tasks = resolveLobbyTasks(
      ["presenting_concerns", "consent"],
      new Set(["intake" as const]),
    );
    // intake submitted, consent not — and BOTH remain outstanding tasks (the
    // chart isn't written until staff accept, so scope is unchanged).
    expect(tasks.map((t) => [t.workflow, t.submitted])).toEqual([
      ["intake", true],
      ["consent", false],
    ]);
  });
});
