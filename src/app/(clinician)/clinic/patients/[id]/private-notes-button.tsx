"use client";

/**
 * Private notes — moved off its own tab onto the Patient Chart card (EMR-894).
 *
 * A borderless "Private" label on the chart card opens a popup containing the
 * existing private-notes manager (Add a private note / Show Notes tabs, with
 * the "not in the patient's chart" disclaimer preserved). Notes can be
 * archived but never deleted — they're a technical record of the chart.
 */

import * as React from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { PrivateNotesTab } from "./private-notes-tab";

type PrivateNotesTabProps = React.ComponentProps<typeof PrivateNotesTab>;

export function PrivateNotesButton({
  patientId,
  notes,
  canAuthor,
  patientFirstName,
}: PrivateNotesTabProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-text-subtle hover:text-accent transition-colors"
        title="Private provider notes — not in the patient's chart"
      >
        🔒 Private{notes.length > 0 ? ` (${notes.length})` : ""}
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={patientFirstName}
        title="Private notes"
        placement="center"
        maxWidth="max-w-2xl"
      >
        <PrivateNotesTab
          patientId={patientId}
          notes={notes}
          canAuthor={canAuthor}
          patientFirstName={patientFirstName}
        />
      </ModalShell>
    </>
  );
}
