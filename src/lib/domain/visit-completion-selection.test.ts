import { describe, expect, it } from "vitest";
import { buildVisitCompletionBundle } from "./visit-completion";
import {
  applyVisitCompletionAction,
  buildVisitCompletionReleasePayload,
  buildVisitCompletionReview,
  initializeVisitCompletionSelection,
} from "./visit-completion-selection";

const bundle = buildVisitCompletionBundle({
  patientFirstName: "Miguel",
  hasFutureAppointment: false,
  blocks: [
    {
      heading: "Assessment",
      body: "Diabetes follow-up with worsening glycemic control.",
    },
    {
      heading: "Plan",
      body: "Repeat labs and return to clinic in 6 weeks to review A1C and medication response.",
    },
  ],
  codingSuggestion: {
    emLevel: "99214",
    rationale: "Chronic condition management with medication adjustment.",
    icd10: [{ code: "E11.9", label: "Diabetes mellitus", confidence: 0.91 }],
  },
});

describe("visit completion selection state", () => {
  it("starts every card selected for physician review without creating side effects", () => {
    const state = initializeVisitCompletionSelection(bundle);
    const review = buildVisitCompletionReview(bundle, state);

    expect(Object.values(state.cardStates).map((card) => card.status)).toEqual([
      "selected",
      "selected",
      "selected",
      "selected",
    ]);
    expect(review.selectedCount).toBe(
      bundle.cards.reduce((sum, card) => sum + card.items.length, 0),
    );
    expect(review.removedCount).toBe(0);
    expect(review.deferredCount).toBe(0);
    expect(review.hasClinicalSideEffects).toBe(false);
    expect(review.hasBillingSideEffects).toBe(false);
    expect(review.hasPatientCommunicationSideEffects).toBe(false);
    expect(review.hasStaffAssignmentSideEffects).toBe(false);
    expect(review.hasChartWriteSideEffects).toBe(false);
  });

  it("records approvals, removals, deferrals, and edits as learning feedback", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const approved = applyVisitCompletionAction(bundle, initial, {
      type: "approve_card",
      cardId: "orders",
    });
    const removed = applyVisitCompletionAction(bundle, approved, {
      type: "remove_card",
      cardId: "follow_up",
    });
    const deferred = applyVisitCompletionAction(bundle, removed, {
      type: "defer_card",
      cardId: "practice_readiness",
    });
    const edited = applyVisitCompletionAction(bundle, deferred, {
      type: "edit_card",
      cardId: "patient_message",
      note: "Use simpler language and include pharmacy confirmation.",
    });

    const review = buildVisitCompletionReview(bundle, edited);

    expect(edited.cardStates.orders.status).toBe("approved");
    expect(edited.cardStates.follow_up.status).toBe("removed");
    expect(edited.cardStates.practice_readiness.status).toBe("deferred");
    expect(edited.cardStates.patient_message).toMatchObject({
      status: "edited",
      editNote: "Use simpler language and include pharmacy confirmation.",
    });
    expect(review.removedCount).toBe(
      bundle.cards.find((card) => card.id === "follow_up")?.items.length,
    );
    expect(review.deferredCount).toBe(
      bundle.cards.find((card) => card.id === "practice_readiness")?.items.length,
    );
    expect(review.feedbackSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "orders", feedbackAction: "approved" }),
        expect.objectContaining({ cardId: "follow_up", feedbackAction: "rejected" }),
        expect.objectContaining({ cardId: "practice_readiness", feedbackAction: "dismissed" }),
        expect.objectContaining({
          cardId: "patient_message",
          feedbackAction: "approved_with_edits",
        }),
      ]),
    );
  });

  it("builds a release review that separates selected, removed, and deferred work", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const removed = applyVisitCompletionAction(bundle, initial, {
      type: "remove_card",
      cardId: "orders",
    });
    const deferred = applyVisitCompletionAction(bundle, removed, {
      type: "defer_card",
      cardId: "follow_up",
    });

    const review = buildVisitCompletionReview(bundle, deferred);

    expect(review.selectedSections.map((section) => section.cardId)).toEqual([
      "patient_message",
      "practice_readiness",
    ]);
    expect(review.removedSections.map((section) => section.cardId)).toEqual(["orders"]);
    expect(review.deferredSections.map((section) => section.cardId)).toEqual(["follow_up"]);
    expect(review.selectedLabels).toEqual(
      expect.arrayContaining([
        "Portal summary drafted with lab instructions and follow-up timing.",
        "Suggested E/M: 99214",
      ]),
    );
    expect(review.removedLabels).toEqual(
      expect.arrayContaining(["A1C", "Urine albumin/creatinine", "CMP/eGFR"]),
    );
    expect(review.deferredLabels).toEqual(
      expect.arrayContaining(["RTC in 6 weeks recommended. No appointment currently scheduled."]),
    );
  });

  it("requires every card to be clicked into and resolved before release readiness", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const initialReview = buildVisitCompletionReview(bundle, initial);

    expect(initialReview.totalCardCount).toBe(4);
    expect(initialReview.resolvedCardCount).toBe(0);
    expect(initialReview.needsConfirmationCount).toBe(4);
    expect(initialReview.isReadyForRelease).toBe(false);
    expect(initialReview.needsConfirmationSections.map((section) => section.cardId)).toEqual([
      "orders",
      "follow_up",
      "patient_message",
      "practice_readiness",
    ]);

    const confirmedOrders = applyVisitCompletionAction(bundle, initial, {
      type: "confirm_card",
      cardId: "orders",
      confirmationNote: "Orders reviewed in the detail panel.",
    });
    const removedFollowUp = applyVisitCompletionAction(bundle, confirmedOrders, {
      type: "remove_card",
      cardId: "follow_up",
    });
    const editedPatientMessage = applyVisitCompletionAction(bundle, removedFollowUp, {
      type: "edit_card",
      cardId: "patient_message",
      note: "Tell Miguel to complete labs before the follow-up.",
    });
    const deferredReadiness = applyVisitCompletionAction(bundle, editedPatientMessage, {
      type: "defer_card",
      cardId: "practice_readiness",
    });

    const finalReview = buildVisitCompletionReview(bundle, deferredReadiness);

    expect(deferredReadiness.cardStates.orders).toMatchObject({
      status: "confirmed",
      confirmationNote: "Orders reviewed in the detail panel.",
    });
    expect(finalReview.confirmedSections.map((section) => section.cardId)).toEqual(["orders"]);
    expect(finalReview.resolvedCardCount).toBe(4);
    expect(finalReview.needsConfirmationCount).toBe(0);
    expect(finalReview.isReadyForRelease).toBe(true);
  });

  it("builds a blocked release payload until every card has an explicit disposition", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const payload = buildVisitCompletionReleasePayload(bundle, initial);

    expect(payload.version).toBe("visit-completion-release/v1");
    expect(payload.releaseActionLabel).toBe("Release Care Plan");
    expect(payload.mode).toBe("physician_release_v1");
    expect(payload.canRelease).toBe(false);
    expect(payload.status).toBe("blocked_needs_confirmation");
    expect(payload.blockingCardIds).toEqual([
      "orders",
      "follow_up",
      "patient_message",
      "practice_readiness",
    ]);
    expect(payload.sideEffects).toEqual({
      clinical: false,
      billing: false,
      patientCommunication: false,
      staffAssignment: false,
      chartWrite: false,
      scheduling: false,
    });
    expect(payload.auditEvents).toHaveLength(4);
    expect(payload.auditEvents.every((event) => event.requiresPhysicianApproval)).toBe(true);
  });

  it("builds a physician-release payload after all cards are resolved", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const confirmedOrders = applyVisitCompletionAction(bundle, initial, {
      type: "confirm_card",
      cardId: "orders",
      confirmationNote: "Orders confirmed.",
    });
    const confirmedFollowUp = applyVisitCompletionAction(bundle, confirmedOrders, {
      type: "confirm_card",
      cardId: "follow_up",
      confirmationNote: "Follow-up handoff confirmed.",
    });
    const editedPatientMessage = applyVisitCompletionAction(bundle, confirmedFollowUp, {
      type: "edit_card",
      cardId: "patient_message",
      note: "Use simpler language.",
    });
    const deferredReadiness = applyVisitCompletionAction(bundle, editedPatientMessage, {
      type: "defer_card",
      cardId: "practice_readiness",
    });

    const payload = buildVisitCompletionReleasePayload(bundle, deferredReadiness);

    expect(payload.canRelease).toBe(true);
    expect(payload.mode).toBe("physician_release_v1");
    expect(payload.status).toBe("ready_for_physician_release");
    expect(payload.blockingCardIds).toEqual([]);
    expect(payload.includedSections.map((section) => section.cardId)).toEqual([
      "orders",
      "follow_up",
      "patient_message",
    ]);
    expect(payload.heldOutSections.map((section) => section.cardId)).toEqual([
      "practice_readiness",
    ]);
    expect(payload.summary).toEqual({
      totalCards: 4,
      includedCards: 3,
      heldOutCards: 1,
      unresolvedCards: 0,
    });
    expect(payload.sideEffects).toEqual({
      clinical: false,
      billing: false,
      patientCommunication: true,
      staffAssignment: true,
      chartWrite: false,
      scheduling: true,
    });
    expect(payload.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "orders",
          eventType: "visit_completion.card_confirmed",
          disposition: "include",
        }),
        expect.objectContaining({
          cardId: "patient_message",
          eventType: "visit_completion.card_edited",
          disposition: "include",
          note: "Use simpler language.",
        }),
        expect.objectContaining({
          cardId: "practice_readiness",
          eventType: "visit_completion.card_deferred",
          disposition: "hold_out",
        }),
      ]),
    );
  });

  it("carries structured drawer edits into the release payload", () => {
    const initial = initializeVisitCompletionSelection(bundle);
    const editedOrders = applyVisitCompletionAction(bundle, initial, {
      type: "edit_card",
      cardId: "orders",
      note: "A1C only today; add retinal exam referral for staff follow-up.",
      selectedItemIds: ["a1c-due"],
      customLabels: ["Retinal exam referral"],
      structuredEdit: {
        physicianNote: "A1C only today; add retinal exam referral for staff follow-up.",
        customLabels: ["Retinal exam referral"],
        selectedItemIds: ["a1c-due"],
      },
    });

    const payload = buildVisitCompletionReleasePayload(bundle, editedOrders);
    const ordersSection = payload.includedSections.find((section) => section.cardId === "orders");

    expect(ordersSection).toMatchObject({
      status: "edited",
      labels: ["A1C", "Retinal exam referral"],
      editNote: "A1C only today; add retinal exam referral for staff follow-up.",
      structuredEdit: {
        physicianNote: "A1C only today; add retinal exam referral for staff follow-up.",
        customLabels: ["Retinal exam referral"],
        selectedItemIds: ["a1c-due"],
      },
    });
  });
});
