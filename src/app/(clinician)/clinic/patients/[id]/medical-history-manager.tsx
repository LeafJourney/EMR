"use client";

import { useState, useTransition } from "react";
import {
  addPastMedicalConditionAction,
  deletePastMedicalConditionAction,
  addPastSurgeryAction,
  deletePastSurgeryAction,
} from "./actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface PastMedicalCondition {
  id: string;
  condition: string;
  onsetYear: number | null;
  notes: string | null;
}

interface PastSurgery {
  id: string;
  procedure: string;
  performedDateText: string | null;
  notes: string | null;
}

interface MedicalHistoryManagerProps {
  patientId: string;
  initialPMH: PastMedicalCondition[];
  initialPSH: PastSurgery[];
}

export function MedicalHistoryManager({
  patientId,
  initialPMH,
  initialPSH,
}: MedicalHistoryManagerProps) {
  const [pmh, setPMH] = useState<PastMedicalCondition[]>(initialPMH);
  const [psh, setPSH] = useState<PastSurgery[]>(initialPSH);

  // PMH input states
  const [newPMHName, setNewPMHName] = useState("");
  const [newPMHYear, setNewPMHYear] = useState("");
  const [newPMHNotes, setNewPMHNotes] = useState("");

  // PSH input states
  const [newPSHName, setNewPSHName] = useState("");
  const [newPSHDateText, setNewPSHDateText] = useState("");
  const [newPSHNotes, setNewPSHNotes] = useState("");

  const [isPending, startTransition] = useTransition();

  const handleAddPMH = () => {
    if (!newPMHName.trim()) return;
    const name = newPMHName.trim();
    const year = newPMHYear ? parseInt(newPMHYear, 10) : null;
    const notes = newPMHNotes.trim() || null;

    // Temporary optimistic UI addition
    const tempId = `temp-${Date.now()}`;
    const newItem: PastMedicalCondition = { id: tempId, condition: name, onsetYear: year, notes };
    setPMH((prev) => [...prev, newItem]);

    setNewPMHName("");
    setNewPMHYear("");
    setNewPMHNotes("");

    startTransition(async () => {
      const res = await addPastMedicalConditionAction(patientId, name, year, notes);
      if (res.ok) {
        // revalidation will refresh initialPMH and trigger setPMH via useEffect or page state sync
      }
    });
  };

  const handleRemovePMH = (id: string) => {
    setPMH((prev) => prev.filter((item) => item.id !== id));
    startTransition(async () => {
      await deletePastMedicalConditionAction(patientId, id);
    });
  };

  const handleAddPSH = () => {
    if (!newPSHName.trim()) return;
    const procedure = newPSHName.trim();
    const dateText = newPSHDateText.trim() || null;
    const notes = newPSHNotes.trim() || null;

    // Temporary optimistic UI addition
    const tempId = `temp-${Date.now()}`;
    const newItem: PastSurgery = { id: tempId, procedure, performedDateText: dateText, notes };
    setPSH((prev) => [...prev, newItem]);

    setNewPSHName("");
    setNewPSHDateText("");
    setNewPSHNotes("");

    startTransition(async () => {
      const res = await addPastSurgeryAction(patientId, procedure, dateText, notes);
      if (res.ok) {
        // revalidation will refresh
      }
    });
  };

  const handleRemovePSH = (id: string) => {
    setPSH((prev) => prev.filter((item) => item.id !== id));
    startTransition(async () => {
      await deletePastSurgeryAction(patientId, id);
    });
  };

  // Sync state if initial props change on revalidation
  if (initialPMH.length !== pmh.filter(x => !x.id.startsWith("temp-")).length && !isPending) {
    setPMH(initialPMH);
  }
  if (initialPSH.length !== psh.filter(x => !x.id.startsWith("temp-")).length && !isPending) {
    setPSH(initialPSH);
  }

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
            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-md bg-surface-muted p-2 space-y-1.5 min-h-[120px]">
              {pmh.length === 0 ? (
                <p className="text-xs text-text-subtle italic p-2">No past medical history documented.</p>
              ) : (
                pmh.map((cond) => (
                  <div
                    key={cond.id}
                    className="flex flex-col bg-surface border border-border/40 rounded p-2 text-xs text-text hover:border-border transition-colors relative group"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-semibold">{cond.condition}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePMH(cond.id)}
                        className="text-text-subtle hover:text-red-500 font-bold ml-2 text-sm focus:outline-none"
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                    {(cond.onsetYear || cond.notes) && (
                      <div className="text-[10px] text-text-subtle mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {cond.onsetYear && <span>Onset: {cond.onsetYear}</span>}
                        {cond.onsetYear && cond.notes && <span>&middot;</span>}
                        {cond.notes && <span className="italic">{cond.notes}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Condition (e.g. Hypertension)"
                value={newPMHName}
                onChange={(e) => setNewPMHName(e.target.value)}
                className="w-full text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Onset Year (e.g. 2018)"
                  value={newPMHYear}
                  onChange={(e) => setNewPMHYear(e.target.value)}
                  className="w-1/3 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder="Optional brief notes..."
                  value={newPMHNotes}
                  onChange={(e) => setNewPMHNotes(e.target.value)}
                  className="flex-1 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleAddPMH}
                  className="px-4 py-1.5 text-xs bg-accent text-accent-ink rounded-md hover:bg-accent-strong transition-colors font-medium shrink-0"
                >
                  Add
                </button>
              </div>
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
            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-md bg-surface-muted p-2 space-y-1.5 min-h-[120px]">
              {psh.length === 0 ? (
                <p className="text-xs text-text-subtle italic p-2">No surgical history documented.</p>
              ) : (
                psh.map((surg) => (
                  <div
                    key={surg.id}
                    className="flex flex-col bg-surface border border-border/40 rounded p-2 text-xs text-text hover:border-border transition-colors relative group"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-semibold">{surg.procedure}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePSH(surg.id)}
                        className="text-text-subtle hover:text-red-500 font-bold ml-2 text-sm focus:outline-none"
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                    {(surg.performedDateText || surg.notes) && (
                      <div className="text-[10px] text-text-subtle mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {surg.performedDateText && <span>Date: {surg.performedDateText}</span>}
                        {surg.performedDateText && surg.notes && <span>&middot;</span>}
                        {surg.notes && <span className="italic">{surg.notes}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Procedure (e.g. Appendectomy)"
                value={newPSHName}
                onChange={(e) => setNewPSHName(e.target.value)}
                className="w-full text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Date (e.g. Aug 2022)"
                  value={newPSHDateText}
                  onChange={(e) => setNewPSHDateText(e.target.value)}
                  className="w-1/3 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder="Optional brief notes..."
                  value={newPSHNotes}
                  onChange={(e) => setNewPSHNotes(e.target.value)}
                  className="flex-1 text-xs rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleAddPSH}
                  className="px-4 py-1.5 text-xs bg-accent text-accent-ink rounded-md hover:bg-accent-strong transition-colors font-medium shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
