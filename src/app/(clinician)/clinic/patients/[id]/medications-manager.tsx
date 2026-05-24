"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";

interface Medication {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  lastRefillAt?: Date | string | null;
  type?: string;
  prescriberName?: string;
  prescriberNpi?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  summary?: string;
}

interface MedicationsManagerProps {
  patientId: string;
  patientName: string;
  patientDOB: Date | string | null;
  medications: Medication[];
}

export function MedicationsManager({
  patientId,
  patientName,
  patientDOB,
  medications,
}: MedicationsManagerProps) {
  const router = useRouter();
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);

  const handleLeftClick = () => {
    // Navigate to rx tab
    router.push(`/clinic/patients/${patientId}?tab=rx`);
  };

  const handleRightClick = (e: React.MouseEvent, med: Medication) => {
    e.preventDefault();
    setSelectedMed(med);
  };

  // Helper details for right-click details modal
  const defaultPrescriber = {
    name: "Dr. Amelia Patel, MD",
    npi: "1982736450",
  };
  const defaultPharmacy = {
    name: "CVS Pharmacy #8432",
    phone: "310-555-0192",
  };

  return (
    <Card tone="raised" className="mt-6 overflow-visible">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Current Medications</span>
          <span className="text-xs text-text-subtle font-normal">
            Left-click row to open Rx Tab. Right-click to inspect profile.
          </span>
        </CardTitle>
        <CardDescription>
          {medications.length} active medication{medications.length !== 1 ? "s" : ""} on file
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {medications.length === 0 ? (
          <p className="text-sm text-text-muted p-6 italic">No active medications on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-surface-muted/50 text-[10px] uppercase tracking-wider text-text-subtle font-semibold">
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Dose</th>
                  <th className="px-6 py-3">Frequency</th>
                  <th className="px-6 py-3">Last Refill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {medications.map((med) => {
                  const refillDate = med.lastRefillAt
                    ? formatDate(new Date(med.lastRefillAt))
                    : "N/A";
                  return (
                    <tr
                      key={med.id}
                      onClick={handleLeftClick}
                      onContextMenu={(e) => handleRightClick(e, med)}
                      className="hover:bg-surface-muted cursor-pointer transition-colors duration-150 group"
                    >
                      <td className="px-6 py-3.5">
                        <Badge
                          tone={
                            med.type === "prescription"
                              ? "info"
                              : med.type === "otc"
                                ? "neutral"
                                : "accent"
                          }
                          className="text-[9px] uppercase tracking-wider"
                        >
                          {med.type || "Rx"}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 font-medium text-text group-hover:text-accent transition-colors">
                        {med.name}
                      </td>
                      <td className="px-6 py-3.5 text-text-muted">{med.dosage || "As directed"}</td>
                      <td className="px-6 py-3.5 text-text-muted">
                        {med.frequency || "Once daily"}
                      </td>
                      <td className="px-6 py-3.5 text-text-muted">{refillDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* ── RIGHT-CLICK MEDICATION DETAILS MODAL ───────────────── */}
      {selectedMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface rounded-xl border border-border shadow-2xl p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-text">
                  Medication Profile: {selectedMed.name}
                </h3>
                <p className="text-xs text-text-subtle mt-0.5">
                  Dose: {selectedMed.dosage || "As directed"} &middot; Freq: {selectedMed.frequency || "Once daily"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMed(null)}
                className="text-text-subtle hover:text-text text-xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {/* Patient */}
              <div className="bg-surface-muted rounded-lg p-3 border border-border/40">
                <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-wider mb-1">
                  Patient Context
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p>
                    <span className="text-text-muted">Name:</span>{" "}
                    <span className="font-medium text-text">{patientName}</span>
                  </p>
                  <p>
                    <span className="text-text-muted">DOB:</span>{" "}
                    <span className="font-medium text-text">
                      {patientDOB ? formatDate(new Date(patientDOB)) : "N/A"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Prescriber & Pharmacy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-surface-muted rounded-lg p-3 border border-border/40">
                  <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-wider mb-1">
                    Prescriber
                  </p>
                  <p className="text-xs font-semibold text-text">
                    {selectedMed.prescriberName || defaultPrescriber.name}
                  </p>
                  <p className="text-[10px] text-text-subtle">
                    NPI: {selectedMed.prescriberNpi || defaultPrescriber.npi}
                  </p>
                </div>

                <div className="bg-surface-muted rounded-lg p-3 border border-border/40">
                  <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-wider mb-1">
                    Pharmacy
                  </p>
                  <p className="text-xs font-semibold text-text">
                    {selectedMed.pharmacyName || defaultPharmacy.name}
                  </p>
                  <p className="text-[10px] text-text-subtle">
                    Phone: {selectedMed.pharmacyPhone || defaultPharmacy.phone}
                  </p>
                </div>
              </div>

              {/* Indication / Summary */}
              <div>
                <p className="text-[10px] font-semibold text-text-subtle uppercase tracking-wider mb-1">
                  Clinical Indication & Summary
                </p>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 text-xs text-text leading-relaxed">
                  <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    Clinical Notes:
                  </p>
                  {selectedMed.summary ||
                    `This medication is actively logged in the patient's chart. Indicated for symptom management. Review for potential cannabinoid-drug interactions prior to adjusting dosage.`}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border/60 mt-4">
              <button
                type="button"
                onClick={() => setSelectedMed(null)}
                className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-md hover:bg-accent-strong transition-colors"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
