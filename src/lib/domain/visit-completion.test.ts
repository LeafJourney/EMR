import { describe, expect, it } from "vitest";
import { buildVisitCompletionBundle } from "./visit-completion";

const followUpBlocks = [
  {
    heading: "Assessment",
    body: "Diabetes follow-up with worsening glycemic control.",
  },
  {
    heading: "Plan",
    body: "Repeat labs and return to clinic in 6 weeks to review A1C and medication response.",
  },
];

describe("buildVisitCompletionBundle", () => {
  it("returns the four visit completion cards in stable order", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: true,
    });

    expect(bundle.sectionLabel).toBe("AI Visit Completion");
    expect(bundle.strategyLabel).toBe("Suggested Next Best Actions");
    expect(bundle.heading).toBe("Suggested next actions before sign-off");
    expect(bundle.primaryActionLabel).toBe("Release Care Plan");
    expect(bundle.selectionLabel).toBe("Select Care Actions");
    expect(bundle.safetyCopy).toBe(
      "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    );
    expect(bundle.cards.map((card) => card.id)).toEqual([
      "orders",
      "follow_up",
      "patient_message",
      "practice_readiness",
    ]);
  });

  it("exposes safe placeholder action affordances for every card", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: false,
    });

    const labelsFor = (id: string) =>
      bundle.cards.find((card) => card.id === id)?.actions.map((action) => action.label);

    expect(labelsFor("orders")).toEqual(["Review orders", "Approve", "Remove", "Edit", "Defer"]);
    expect(labelsFor("follow_up")).toEqual([
      "Send to front desk",
      "Text scheduling link",
      "Edit interval",
      "Defer",
    ]);
    expect(labelsFor("patient_message")).toEqual([
      "Preview message",
      "Edit",
      "Send to portal",
      "Print",
      "Defer",
    ]);
    expect(labelsFor("practice_readiness")).toEqual([
      "View checks",
      "Review coding",
      "Create staff tasks",
      "Defer",
    ]);

    expect(bundle.cards.flatMap((card) => card.actions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Send to portal",
          requiresPhysicianApproval: true,
          sideEffect: "none",
        }),
        expect.objectContaining({
          label: "Create staff tasks",
          requiresPhysicianApproval: true,
          sideEffect: "none",
        }),
      ]),
    );
  });

  it("exposes learning-loop metadata for physician action feedback", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: true,
    });

    expect(bundle.learningLoop.agentName).toBe("visitCompletion");
    expect(bundle.learningLoop.agentVersion).toBe("1.0.0");
    expect(bundle.learningLoop.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "release_care_plan",
          feedbackAction: "approved",
        }),
        expect.objectContaining({
          actionId: "edit_item",
          feedbackAction: "approved_with_edits",
        }),
        expect.objectContaining({
          actionId: "remove_item",
          feedbackAction: "rejected",
        }),
        expect.objectContaining({
          actionId: "defer_item",
          feedbackAction: "dismissed",
        }),
      ]),
    );
  });

  it("flags follow-up language when no future appointment exists", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: false,
    });

    expect(bundle.cards.find((card) => card.id === "follow_up")?.items[0]).toMatchObject({
      tone: "alert",
      label: "RTC in 6 weeks recommended. No appointment currently scheduled.",
      requiresPhysicianApproval: true,
      dataMode: "deterministic_heuristic",
    });
  });

  it("uses the MVP/mock diabetes order set without creating real clinical actions", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: true,
    });

    expect(bundle.cards.find((card) => card.id === "orders")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "A1C", dataMode: "mvp_mock" }),
        expect.objectContaining({ label: "Urine albumin/creatinine", dataMode: "mvp_mock" }),
        expect.objectContaining({ label: "CMP/eGFR", dataMode: "mvp_mock" }),
        expect.objectContaining({ label: "Lipid panel if due", dataMode: "mvp_mock" }),
      ]),
    );
  });

  it("uses coding suggestions for practice readiness", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      hasFutureAppointment: true,
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [
          { code: "E11.9", label: "Diabetes mellitus", confidence: 0.91 },
          { code: "I10", label: "Essential hypertension", confidence: 0.82 },
        ],
      },
    });

    const items = bundle.cards.find((card) => card.id === "practice_readiness")?.items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Coding review needed — 2 suggested codes awaiting approval",
          tone: "warning",
          source: "coding",
          dataMode: "agent_output",
          proposedActionType: "coding_review",
        }),
        expect.objectContaining({ label: "Suggested E/M: 99214" }),
        expect.objectContaining({ label: "ICD-10 candidate: E11.9 Diabetes mellitus" }),
        expect.objectContaining({ label: "ICD-10 candidate: I10 Essential hypertension" }),
      ]),
    );
    // EMR-1100: no mocked placeholder items remain on this card.
    expect(items?.every((item) => item.dataMode !== "mvp_mock")).toBe(true);
  });

  it("shows the approved coding state once the physician signs off", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      hasFutureAppointment: true,
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [{ code: "E11.9", label: "Diabetes mellitus", confidence: 0.91 }],
        status: "modified",
        approvedByName: "Asha Patel",
        approvedAt: "2026-06-09T15:00:00.000Z",
        approvedIcd10: [{ code: "E11.65", label: "Diabetes with hyperglycemia" }],
        approvedEmLevel: "99215",
      },
    });

    expect(bundle.cards.find((card) => card.id === "practice_readiness")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Codes approved ✓",
          tone: "neutral",
          source: "coding",
          dataMode: "agent_output",
          reason: expect.stringContaining("Approved by Asha Patel"),
        }),
        expect.objectContaining({ label: "Approved E/M: 99215" }),
        expect.objectContaining({
          label: "ICD-10 approved: E11.65 Diabetes with hyperglycemia",
        }),
      ]),
    );
  });

  it("deep-links the Review coding action to the note's coding section", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: true,
    });

    const reviewCoding = bundle.cards
      .find((card) => card.id === "practice_readiness")
      ?.actions.find((action) => action.id === "review_coding");
    expect(reviewCoding).toMatchObject({
      proposedActionType: "coding_review",
      href: "#coding-suggestions",
    });
  });

  it("degrades practice readiness when coding is not available yet", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      blocks: followUpBlocks,
      codingSuggestion: null,
      hasFutureAppointment: true,
    });

    expect(bundle.cards.find((card) => card.id === "practice_readiness")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "No coding suggestion yet",
          tone: "warning",
        }),
      ]),
    );
    expect(bundle.summary).toContain("billing readiness check");
  });
});
