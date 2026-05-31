import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildVisitCompletionBundle } from "@/lib/domain/visit-completion";
import { VisitCompletionPanel } from "./visit-completion-panel";
import type { VisitCompletionReleasePayload } from "@/lib/domain/visit-completion-selection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  releaseVisitCompletion: vi.fn(),
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
    expect(str).toContain(
      "Release creates only reviewed tasks, drafts, and audit records after physician approval.",
    );
    expect(str).toContain("No actions have been released.");
    expect(str).toContain("Selected for release");
    expect(str).toContain("Open release review");
    expect(str).toContain("Release readiness");
    expect(str).toContain("0 of 4 cards resolved");
    expect(str).toContain("Confirmation required before release.");
    expect(str).toContain("Click in to confirm");
    expect(str).toContain("Confirm this card");
    expect(str).toContain("Open details");
    expect(str).toContain("aria-label=\"Open Suggested Orders details\"");
    expect(str).toContain("tabindex=\"0\"");
    expect(str).toContain("What release will do");
    expect(str).toContain("Creates a back-office task with reviewed order suggestions.");
    expect(str).toContain("Does not place clinical orders automatically.");
    expect(str).toContain("Item evidence");
    expect(str).toContain("Source: heuristic");
    expect(str).toContain("Confidence 72%");
    expect(str).toContain("Physician approval required");
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
    // The Release Care Plan button should be disabled because not all cards are resolved
    expect(str).toContain("disabled");
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
