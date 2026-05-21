"use client";

import { useState, useTransition } from "react";
import { updatePMHAndPSH } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface MedicalHistoryManagerProps {
  patientId: string;
  initialPMH: string[];
  initialPSH: string[];
}

export function MedicalHistoryManager({
  patientId,
  initialPMH,
  initialPSH,
}: MedicalHistoryManagerProps) {
  const [pmh, setPMH] = useState<string[]>(initialPMH);
  const [psh, setPSH] = useState<string[]>(initialPSH);
  const [newPMH, setNewPMH] = useState("");
  const [newPSH, setNewPSH] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAddPMH = () => {
    if (!newPMH.trim()) return;
    const updated = [...pmh, newPMH.trim()];
    setPMH(updated);
    setNewPMH("");
    startTransition(async () => {
      await updatePMHAndPSH(patientId, updated, psh);
    });
  };

  const handleRemovePMH = (idx: number) => {
    const updated = pmh.filter((_, i) => i !== idx);
    setPMH(updated);
    startTransition(async () => {
      await updatePMHAndPSH(patientId, updated, psh);
    });
  };

  const handleAddPSH = () => {
    if (!newPSH.trim()) return;
    const updated = [...psh, newPSH.trim()];
    setPSH(updated);
    setNewPSH("");
    startTransition(async () => {
      await updatePMHAndPSH(patientId, pmh, updated);
    });
  };

  const handleRemovePSH = (idx: number) => {
    const updated = psh.filter((_, i) => i !== idx);
    setPSH(updated);
    startTransition(async () => {
      await updatePMHAndPSH(patientId, pmh, updated);
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
      {/* Past Medical History */}
      <Card tone="raised" className={isPending ? "opacity-70 transition-opacity" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Past Medical History (PMH)</CardTitle>
          <CardDescription>Chronic conditions and ongoing medical history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-md bg-surface-muted p-2 space-y-1.5 min-h-[100px]">
              {pmh.length === 0 ? (
                <p className="text-xs text-text-subtle italic p-2">No past medical history documented.</p>
              ) : (
                pmh.map((cond, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-surface border border-border/40 rounded px-2.5 py-1 text-xs text-text hover:border-border transition-colors"
                  >
                    <span>{cond}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePMH(idx)}
                      className="text-text-subtle hover:text-red-500 font-bold ml-2 text-sm"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Hypertension, Type 2 Diabetes"
                value={newPMH}
                onChange={(e) => setNewPMH(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPMH()}
                className="flex-1 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleAddPMH}
                className="px-3 py-1.5 text-xs bg-accent text-accent-ink rounded-md hover:bg-accent-strong transition-colors font-medium shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Past Surgical History */}
      <Card tone="raised" className={isPending ? "opacity-70 transition-opacity" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Past Surgical History (PSH)</CardTitle>
          <CardDescription>Surgeries and major procedures list</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-md bg-surface-muted p-2 space-y-1.5 min-h-[100px]">
              {psh.length === 0 ? (
                <p className="text-xs text-text-subtle italic p-2">No surgical history documented.</p>
              ) : (
                psh.map((surg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-surface border border-border/40 rounded px-2.5 py-1 text-xs text-text hover:border-border transition-colors"
                  >
                    <span>{surg}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePSH(idx)}
                      className="text-text-subtle hover:text-red-500 font-bold ml-2 text-sm"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Appendectomy (2018), ACL Repair"
                value={newPSH}
                onChange={(e) => setNewPSH(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPSH()}
                className="flex-1 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleAddPSH}
                className="px-3 py-1.5 text-xs bg-accent text-accent-ink rounded-md hover:bg-accent-strong transition-colors font-medium shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
