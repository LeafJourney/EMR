"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendTaxSummaryNotice } from "../actions";

// Clinician-side actions for the year-end tax summary (Dr. Patel directive).
// Print uses the browser dialog; Email/Text notify the patient their summary
// is ready via the deliverMessage pipeline (recorded to Correspondence).
// Inline — no popup (EMR-1125).
export function TaxSummaryActions({
  patientId,
  year,
  canEmail,
  canText,
}: {
  patientId: string;
  year: number;
  canEmail: boolean;
  canText: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    tone: "success" | "muted" | "danger";
    text: string;
  } | null>(null);

  function notify(channel: "email" | "sms") {
    setStatus(null);
    startTransition(async () => {
      const r = await sendTaxSummaryNotice(patientId, year, channel);
      if (!r.ok) {
        setStatus({ tone: "danger", text: r.error });
        return;
      }
      const verb = channel === "email" ? "Emailed" : "Texted";
      setStatus(
        r.delivery === "delivered"
          ? { tone: "success", text: `${verb} ✓` }
          : r.delivery === "recorded"
            ? { tone: "muted", text: "Logged (no provider)" }
            : { tone: "danger", text: "Send failed" },
      );
    });
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      {status && (
        <span
          className={`text-xs mr-1 ${
            status.tone === "success"
              ? "text-success"
              : status.tone === "danger"
                ? "text-danger"
                : "text-text-subtle"
          }`}
        >
          {status.text}
        </span>
      )}
      {canEmail && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => notify("email")}
        >
          Email patient
        </Button>
      )}
      {canText && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => notify("sms")}
        >
          Text patient
        </Button>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          if (typeof window !== "undefined") window.print();
        }}
      >
        Print / save PDF
      </Button>
    </div>
  );
}
