"use client";

// EMR-707 — Airplane (send) icon per Recent Campaigns row. Opens a small
// "Send message?" confirm popup, then fires sendCampaignNowAction.

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendCampaignNowAction } from "./actions";

export function SendNowButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        aria-label="Send campaign now"
        title="Send now"
        onClick={() => setOpen(true)}
        className="p-1 rounded hover:bg-surface text-accent"
      >
        <Send className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send message?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-text-muted mt-1">
            Recipients will be messaged immediately.
          </p>
          {error ? <p className="text-xs text-danger mt-2">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                const fd = new FormData();
                fd.set("campaignId", campaignId);
                startTransition(async () => {
                  const res = await sendCampaignNowAction(fd);
                  if (res.ok) {
                    setOpen(false);
                  } else {
                    setError(res.error);
                  }
                });
              }}
            >
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
