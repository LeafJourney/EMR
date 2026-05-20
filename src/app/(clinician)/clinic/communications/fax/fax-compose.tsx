"use client";

import { useFormState } from "react-dom";
import { useRef, useEffect } from "react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendFaxAction, type SendFaxResult } from "./actions";

export function FaxComposeForm() {
  const [state, formAction] = useFormState<SendFaxResult | null, FormData>(
    sendFaxAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fax-to">To</Label>
          <Input
            id="fax-to"
            name="toNumber"
            placeholder="+1 555-555-1234"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fax-from">From</Label>
          <Input
            id="fax-from"
            name="fromNumber"
            placeholder="+1 555-000-0000"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fax-pages">Pages (optional)</Label>
          {/* EMR-694 — dropdown 1-10 with freehand fallback via list input. */}
          <Input
            id="fax-pages"
            name="pageCount"
            type="number"
            min={1}
            max={500}
            list="fax-pages-options"
            placeholder="1"
          />
          <datalist id="fax-pages-options">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fax-patient">Patient Info</Label>
          {/* EMR-694 — was "Patient ID (optional)"; now mandatory. Search by
              phone, DOB, last name, first name, or medical life number. */}
          <Input
            id="fax-patient"
            name="patientId"
            required
            placeholder="phone, DOB, full last/first name, medical life #"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="fax-notes">Cover note (optional)</Label>
        <Textarea
          id="fax-notes"
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Reason for fax / cover sheet body…"
        />
      </div>

      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">Fax queued for delivery.</p>
      )}

      <div className="flex justify-end">
        <Button type="submit">Queue fax</Button>
      </div>
    </form>
  );
}
