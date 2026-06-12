"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteExpenseAction } from "../actions";

// EMR-1059 — Delete a logged expense behind a confirmation popup instead of
// the bare one-click `<form action={deleteExpenseAction}>` (which deleted the
// line item immediately, with no undo). The Delete button now opens a danger
// ConfirmDialog; only "Delete" submits the original server-action form.
//
// (The companion directive — "stop the sidebar expanding on delete" — is
// already handled globally by the PillarNav same-route guard, so this file
// only owns the confirmation step.)
export function DeleteExpenseButton({
  id,
  label,
}: {
  id: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={deleteExpenseAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-danger hover:underline cursor-pointer"
        >
          Delete
        </button>
      </form>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        severity="danger"
        title="Delete this line item?"
        description={
          label
            ? `“${label}” will be permanently removed from your expense ledger. This can’t be undone.`
            : "This expense line item will be permanently removed from your ledger. This can’t be undone."
        }
        confirmLabel="Delete"
      />
    </>
  );
}
