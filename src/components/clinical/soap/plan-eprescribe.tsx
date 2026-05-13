"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

type Status = "draft" | "sending" | "sent";

interface RxState {
  medication: string;
  strength: string;
  form: string;
  sig: string;
  dispense: string;
  refills: string;
  daw: boolean;
  pharmacy: string;
  notes: string;
}

const EMPTY: RxState = {
  medication: "",
  strength: "",
  form: "tincture",
  sig: "",
  dispense: "",
  refills: "0",
  daw: false,
  pharmacy: "",
  notes: "",
};

const FORM_OPTIONS = ["tincture", "capsule", "tablet", "vape cartridge", "topical", "edible", "flower"];

export interface PlanEprescribeProps {
  onSend?: (rx: RxState) => Promise<void> | void;
}

export function PlanEprescribe({ onSend }: PlanEprescribeProps = {}) {
  const [state, setState] = useState<RxState>(EMPTY);
  const [status, setStatus] = useState<Status>("draft");

  const handleField = <K extends keyof RxState>(key: K, value: RxState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    if (status === "sent") setStatus("draft");
  };

  const isValid =
    state.medication.trim().length > 0 &&
    state.sig.trim().length > 0 &&
    state.pharmacy.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || status === "sending") return;
    setStatus("sending");
    try {
      if (onSend) await onSend(state);
      else console.log("E-Prescribe (stub):", state);
      setStatus("sent");
    } catch (err) {
      console.error("E-Prescribe failed:", err);
      setStatus("draft");
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Plan — E-Prescribe</CardTitle>
        <CardDescription>Compose and send a prescription to the patient&apos;s preferred pharmacy.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rx-med">Medication</Label>
              <Input
                id="rx-med"
                value={state.medication}
                onChange={(e) => handleField("medication", e.target.value)}
                placeholder="e.g., CBD:THC 20:1 full-spectrum"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rx-strength">Strength</Label>
              <Input
                id="rx-strength"
                value={state.strength}
                onChange={(e) => handleField("strength", e.target.value)}
                placeholder="e.g., 20 mg/mL"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rx-form">Form</Label>
              <select
                id="rx-form"
                value={state.form}
                onChange={(e) => handleField("form", e.target.value)}
                className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                {FORM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rx-sig">Sig (patient instructions)</Label>
              <Textarea
                id="rx-sig"
                rows={2}
                value={state.sig}
                onChange={(e) => handleField("sig", e.target.value)}
                placeholder="e.g., 0.5 mL sublingually at bedtime; may repeat once if needed"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rx-dispense">Dispense</Label>
              <Input
                id="rx-dispense"
                value={state.dispense}
                onChange={(e) => handleField("dispense", e.target.value)}
                placeholder="e.g., 30 mL"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rx-refills">Refills</Label>
              <Input
                id="rx-refills"
                type="number"
                min={0}
                max={12}
                value={state.refills}
                onChange={(e) => handleField("refills", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rx-pharmacy">Pharmacy</Label>
              <Input
                id="rx-pharmacy"
                value={state.pharmacy}
                onChange={(e) => handleField("pharmacy", e.target.value)}
                placeholder="e.g., Patel Compounding Pharmacy — 555-0101"
                required
              />
            </div>

            <label className="flex items-center gap-2 md:col-span-2 text-sm text-text">
              <input
                type="checkbox"
                checked={state.daw}
                onChange={(e) => handleField("daw", e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
              />
              Dispense as written (no substitution)
            </label>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="rx-notes">Notes to pharmacist (optional)</Label>
              <Textarea
                id="rx-notes"
                rows={2}
                value={state.notes}
                onChange={(e) => handleField("notes", e.target.value)}
                placeholder="e.g., Patient prefers alcohol-free base"
              />
            </div>
          </div>

          {status === "sent" && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              Sent to {state.pharmacy}.
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={!isValid || status === "sending"}>
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Send to Pharmacy"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default PlanEprescribe;
