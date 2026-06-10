import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildVisitCompletionBundle } from "@/lib/domain/visit-completion";
import {
  FinalReleaseReviewPanel,
  VisitCompletionDetailsDrawer,
  VisitCompletionPanel,
} from "./visit-completion-panel";
import type { VisitCompletionReleasePayload } from "@/lib/domain/visit-completion-selection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
  useParams: () => ({ id: "patient_1", noteId: "note_1" }),
}));

vi.mock("./actions", () => ({
  releaseVisitCompletion: vi.fn(),
}));

vi.mock("../../leaflet/actions", () => ({
  generateLeafletForNote: vi.fn(),
}));

function dump(node: React.ReactElement | null): string {
  return renderToStaticMarkup(node);
}

describe("VisitCompletionPanel", () => {
  it("renders the physician co-pilot language and four action cards", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      hasFutureAppointment: false,
      blocks: [
        {
          heading: "Plan",
          body: "Return to clinic in 6 weeks after medication adjustment.",
        },
      ],
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [{ code: "G89.29", label: "Chronic pain", confidence: 0.88 }],
      },
    });

    const str = dump(<VisitCompletionPanel bundle={bundle} noteId="note_1" />);

    expect(str).toContain("AI Visit Completion");
    expect(str).toContain("Suggested Next Best Actions");
    expect(str).toContain("Suggested next actions before sign-off");
    expect(str).toContain("Release Care Plan");
    expect(str).toContain("Select Care Actions");
    expect(str).toContain("Suggested Orders");
    expect(str).toContain("Follow-Up Plan");
    expect(str).toContain("Patient Communication");
    expect(str).toContain("Practice Readiness");
    expect(str).toContain(
      "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    );
    expect(str).toContain("Review orders");
    expect(str).toContain("Send to front desk");
    expect(str).toContain("Preview message");
    expect(str).toContain("Create staff tasks");
    expect(str).toContain("Review selected actions");
    expect(str).toContain("Progress toward release");
    expect(str).toContain("Next suggested step");
    expect(str).toContain("Review Practice Readiness");
    // EMR-1100: the Practice Readiness card renders the real coding state,
    // not placeholder copy.
    expect(str).toContain("Coding review needed — 1 suggested code awaiting approval");
    expect(str).toContain("Suggested E/M: 99214");
    expect(str).toContain("ICD-10 candidate: G89.29 Chronic pain");
    expect(str).toContain(
      "Release creates only reviewed tasks, drafts, and audit records after physician approval.",
    );
    expect(str).toContain("No actions have been released.");
    expect(str).toContain("Selected for release");
    expect(str).toContain("Release readiness");
    expect(str).toContain("Final release review");
    expect(str).toContain("0 of 4 cards resolved");
    expect(str).toContain("Confirmation required before release.");
    expect(str).toContain("Click in to confirm");
    expect(str).toContain("Open details");
    expect(str).toContain("aria-label=\"Open Suggested Orders details\"");
    expect(str).toContain("tabindex=\"0\"");
    expect(str).toContain("Final release review");
    expect(str).toContain("Structured release payload");
    expect(str).toContain("Preview release payload");
    expect(str).toContain(
      "Release Care Plan is blocked until every card has an explicit physician disposition.",
    );
    expect(str).toContain(
      "Release Care Plan creates reviewed tasks/drafts and an audit record after physician approval.",
    );
    expect(str).toContain(
      "It does not place clinical orders, send patient messages, submit billing, book appointments, or overwrite chart data.",
    );
    expect(str).toContain("Physician remains in control.");
    expect(str).toContain("Learns from approvals, edits, removals, and deferrals.");
    expect(str.lastIndexOf("Release Care Plan</button>")).toBeGreaterThan(
      str.indexOf("Review selected actions"),
    );
    // The Release Care Plan button should be disabled because not all cards are resolved
    expect(str).toContain("disabled");
  });

  it("renders card details in a right-side drawer surface", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      hasFutureAppointment: false,
      blocks: [
        {
          heading: "Plan",
          body: "Return to clinic in 6 weeks after medication adjustment.",
        },
      ],
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [{ code: "G89.29", label: "Chronic pain", confidence: 0.88 }],
      },
    });

    const str = dump(
      <VisitCompletionDetailsDrawer
        card={bundle.cards[0]}
        cardState={{ status: "selected" }}
        onClose={() => undefined}
        onConfirm={() => undefined}
        onEdit={() => undefined}
        onSaveEdit={() => undefined}
        onCancelEdit={() => undefined}
        onRemove={() => undefined}
        onDefer={() => undefined}
        isReleased={false}
      />,
    );

    expect(str).toContain("role=\"dialog\"");
    expect(str).toContain("Review details drawer");
    expect(str).toContain("Close details");
    expect(str).toContain("Confirm this card");
    expect(str).toContain("What release will do");
    expect(str).toContain("Creates a back-office task with reviewed order suggestions.");
    expect(str).toContain("Does not place clinical orders automatically.");
    expect(str).toContain("Item evidence");
    expect(str).toContain("Source: heuristic");
    expect(str).toContain("Confidence 72%");
    expect(str).toContain("Physician approval required");
    expect(str).toContain("fixed inset-y-0 right-0");
  });

  it("renders structured edit controls inside the details drawer", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      hasFutureAppointment: false,
      blocks: [
        {
          heading: "Plan",
          body: "Repeat labs and return to clinic in 6 weeks after medication adjustment.",
        },
      ],
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [{ code: "E11.9", label: "Diabetes mellitus", confidence: 0.88 }],
      },
    });

    const str = dump(
      <VisitCompletionDetailsDrawer
        card={bundle.cards[1]}
        cardState={{ status: "selected" }}
        mode="edit"
        onClose={() => undefined}
        onConfirm={() => undefined}
        onEdit={() => undefined}
        onSaveEdit={() => undefined}
        onCancelEdit={() => undefined}
        onRemove={() => undefined}
        onDefer={() => undefined}
        isReleased={false}
      />,
    );

    expect(str).toContain("Edit Follow-Up Plan");
    expect(str).toContain("Included actions");
    expect(str).toContain("Follow-up interval");
    expect(str).toContain("Scheduling handoff");
    expect(str).toContain("Add custom action");
    expect(str).toContain("Physician note");
    expect(str).toContain("Save and confirm");
    expect(str).toContain("Cancel edit");
  });

  it("surfaces structured edits in the final release review", () => {
    const payload: VisitCompletionReleasePayload = {
      version: "visit-completion-release/v1",
      releaseActionLabel: "Release Care Plan",
      mode: "physician_release_v1",
      status: "ready_for_physician_release",
      canRelease: true,
      summary: {
        totalCards: 4,
        includedCards: 2,
        heldOutCards: 0,
        unresolvedCards: 0,
      },
      sideEffects: {
        clinical: false,
        billing: false,
        patientCommunication: true,
        scheduling: true,
        staffAssignment: true,
        chartWrite: false,
      },
      includedSections: [
        {
          cardId: "follow_up",
          title: "Follow-Up Plan",
          status: "edited",
          disposition: "include",
          labels: [
            "RTC in 6 weeks recommended. No appointment currently scheduled.",
            "Follow-up interval: 6 weeks",
            "Scheduling handoff: front desk scheduling task",
          ],
          editNote:
            "Follow-up interval: 6 weeks; scheduling handoff: front desk scheduling task.",
          structuredEdit: {
            followUpInterval: "6 weeks",
            followUpRouting: "front_desk",
          },
          requiresPhysicianApproval: true,
        },
        {
          cardId: "patient_message",
          title: "Patient Communication",
          status: "edited",
          disposition: "include",
          labels: [
            "Portal summary drafted with lab instructions and follow-up timing.",
            "Patient message channel: portal draft",
          ],
          editNote: "Please complete labs before your 6-week follow-up.",
          structuredEdit: {
            patientMessageChannel: "portal",
            patientMessageDraft: "Please complete labs before your 6-week follow-up.",
          },
          requiresPhysicianApproval: true,
        },
      ],
      heldOutSections: [],
      unresolvedSections: [],
      blockingCardIds: [],
      auditEvents: [],
      feedbackSignals: [],
      safetyCopy:
        "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    };

    const str = dump(
      <FinalReleaseReviewPanel
        payload={payload}
        isOpen
        onToggle={() => undefined}
        isReleasing={false}
        releaseError={null}
        onRelease={() => undefined}
        isReleased={false}
      />,
    );

    expect(str).toContain("Physician-edited release details");
    expect(str).toContain("Interval: 6 weeks");
    expect(str).toContain("Handoff: front desk scheduling task");
    expect(str).toContain("Channel: portal draft");
    expect(str).toContain("Patient draft edited");
    expect(str).toContain("Please complete labs before your 6-week follow-up.");
  });

  it("renders the released state and locks controls when releasedPayload is provided", () => {
    const bundle = buildVisitCompletionBundle({
      patientFirstName: "Miguel",
      hasFutureAppointment: false,
      blocks: [
        {
          heading: "Plan",
          body: "Return to clinic in 6 weeks after medication adjustment.",
        },
      ],
      codingSuggestion: {
        emLevel: "99214",
        rationale: "Chronic condition management with medication adjustment.",
        icd10: [{ code: "G89.29", label: "Chronic pain", confidence: 0.88 }],
      },
    });

    const releasedPayload: VisitCompletionReleasePayload = {
      version: "visit-completion-release/v1",
      releaseActionLabel: "Release Care Plan",
      mode: "physician_release_v1",
      status: "ready_for_physician_release",
      canRelease: true,
      summary: {
        totalCards: 4,
        includedCards: 4,
        heldOutCards: 0,
        unresolvedCards: 0,
      },
      sideEffects: {
        clinical: false,
        billing: false,
        patientCommunication: true,
        scheduling: true,
        staffAssignment: true,
        chartWrite: false,
      },
      includedSections: [
        {
          cardId: "orders" as const,
          title: "Suggested Orders",
          status: "confirmed" as const,
          disposition: "include",
          labels: ["Order CBC", "Order BMP"],
          confirmationNote: "Approved",
          requiresPhysicianApproval: true,
        },
      ],
      heldOutSections: [],
      unresolvedSections: [],
      blockingCardIds: [],
      auditEvents: [],
      feedbackSignals: [],
      safetyCopy: "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    };

    const str = dump(
      <VisitCompletionPanel
        bundle={bundle}
        releasedPayload={releasedPayload}
        noteId="note_1"
      />
    );

    // Released status checks
    expect(str).toContain("Care Plan Released");
    expect(str).toContain("Released");
    expect(str).toContain("Care actions have been durably saved and routed.");
    expect(str).toContain("Care Plan released.");
    expect(str).toContain(
      "Audited physician actions have been durably saved and task handoffs are routed to queues."
    );

    // UI components lock down check (buttons like Confirm this card or release action CTA should not render or should be disabled)
    expect(str).not.toContain("Confirm this card");
    expect(str).not.toContain("Release Care Plan</button>");
  });
});
