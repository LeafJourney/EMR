import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotesTab, type NoteLite } from "./notes-tab";

/**
 * WS-A item 4 — honest labels. The primary button starts a visit (creates an
 * encounter), not just a note; signed notes open read-only ("View"), drafts
 * open the editor ("Open to edit").
 */
function dump(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

function note(over: Partial<NoteLite> = {}): NoteLite {
  return {
    id: "n1",
    status: "draft",
    aiDrafted: false,
    title: "Visit note",
    reason: "Follow-up",
    createdAt: "2026-06-09T12:00:00.000Z",
    preview: "Some content",
    pendingAttestation: false,
    ...over,
  };
}

async function noop(): Promise<void> {}

describe("NotesTab honest labels", () => {
  it("labels the primary action 'Start visit' (it creates an encounter)", () => {
    const str = dump(
      <NotesTab patientId="p1" notes={[note()]} startVisitAction={noop} />,
    );
    expect(str).toContain("Start visit");
    expect(str).not.toContain("Draft a note");
  });

  it("shows 'View' for a finalized (signed) note, not 'Open to edit'", () => {
    const str = dump(
      <NotesTab
        patientId="p1"
        notes={[note({ status: "finalized" })]}
        startVisitAction={noop}
      />,
    );
    expect(str).toContain("View");
    expect(str).not.toContain("Open to edit");
  });

  it("shows 'Open to edit' for a draft note", () => {
    const str = dump(
      <NotesTab
        patientId="p1"
        notes={[note({ status: "draft" })]}
        startVisitAction={noop}
      />,
    );
    expect(str).toContain("Open to edit");
  });
});
