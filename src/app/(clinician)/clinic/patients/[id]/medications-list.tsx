"use client";

import { useState, useEffect } from "react";

function format(date: Date, fmt: string) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

interface MedicationsListProps {
  patientId: string;
  medications: any[];
  patient: any;
}

export function MedicationsList({ patientId, medications, patient }: MedicationsListProps) {
  const [viewMed, setViewMed] = useState<any | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; med: any } | null>(null);

  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, []);

  return (
    <>
      <div className="max-h-24 overflow-y-auto text-sm space-y-1 pr-2 custom-scrollbar">
        {medications.length === 0 ? (
          <span className="text-xs text-text-muted">No medications on file</span>
        ) : (
          medications.map((med) => (
            <div
              key={med.id}
              className="group flex flex-col p-1.5 hover:bg-surface-muted rounded-md cursor-pointer transition-colors"
              onClick={() => window.location.href = `/clinic/patients/${patientId}?tab=rx`}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  med,
                });
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text">{med.name}</span>
                <span className="text-xs text-text-subtle">{med.dosage || "20mg"}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-text-subtle mt-0.5">
                <span>{med.frequency || "qDay"}</span>
                <span>Refill: {med.lastRefillDate ? format(new Date(med.lastRefillDate), "MM/dd/yyyy") : "Unknown"}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[120] bg-surface-raised rounded-lg shadow-lg border border-border py-1 text-xs text-text min-w-[120px] select-none"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setViewMed(contextMenu.med);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-surface-muted transition-colors font-medium flex items-center gap-1.5"
          >
            <span>👁</span> View Details
          </button>
        </div>
      )}

      {viewMed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-surface rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-surface-raised">
              <h3 className="font-display text-lg font-medium">Medication Details</h3>
              <button onClick={() => setViewMed(null)} className="text-text-subtle hover:text-text p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Patient Info */}
              <section>
                <h4 className="text-xs font-semibold text-text-subtle uppercase tracking-wider mb-3">Patient Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm bg-surface-muted p-4 rounded-lg">
                  <div><span className="text-text-subtle block mb-0.5">Name</span> {patient.firstName} {patient.lastName}</div>
                  <div><span className="text-text-subtle block mb-0.5">Gender / DOB</span> {patient.sex || "F"} · {patient.dateOfBirth ? format(new Date(patient.dateOfBirth), "MM/dd/yyyy") : "N/A"}</div>
                  <div className="col-span-2"><span className="text-text-subtle block mb-0.5">Address</span> {[patient.addressLine1, patient.city, patient.state, patient.postalCode].filter(Boolean).join(", ")}</div>
                  <div><span className="text-text-subtle block mb-0.5">Phone</span> {patient.phone || "N/A"}</div>
                  <div><span className="text-text-subtle block mb-0.5">Appointments</span> Last: 10/12/2025 · Next: 11/15/2025</div>
                </div>
                {/* 2-lined summary */}
                <p className="text-sm text-text-muted mt-3 italic border-l-2 border-accent pl-3">
                  {patient.firstName} is a {patient.age || "35"} year old {patient.sex || "female"} presenting with chronic conditions managed on current regimen. Responding well to recent adjustments, continue close monitoring.
                </p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pharmacy Info */}
                <section>
                  <h4 className="text-xs font-semibold text-text-subtle uppercase tracking-wider mb-3">Pharmacy Information</h4>
                  <div className="space-y-2 text-sm bg-surface-muted p-4 rounded-lg">
                    <div className="flex justify-between"><span className="text-text-subtle">Name</span> CVS Pharmacy</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Address</span> 123 Main St, City, ST</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Telephone</span> (555) 123-4567</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Fax</span> (555) 123-4568</div>
                    <div className="flex justify-between"><span className="text-text-subtle">NCPDPID</span> 1234567</div>
                    <div className="flex justify-between"><span className="text-text-subtle">State License</span> PHA-98765</div>
                    <div className="flex justify-between"><span className="text-text-subtle">DEA</span> AB1234567</div>
                    <div className="flex justify-between"><span className="text-text-subtle">NPI</span> 1987654321</div>
                  </div>
                </section>

                {/* Prescriber Info */}
                <section>
                  <h4 className="text-xs font-semibold text-text-subtle uppercase tracking-wider mb-3">Prescriber Information</h4>
                  <div className="space-y-2 text-sm bg-surface-muted p-4 rounded-lg">
                    <div className="flex justify-between"><span className="text-text-subtle">Name</span> Dr. Sarah Patel</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Address</span> 456 Clinic Blvd, Suite 100</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Telephone</span> (555) 987-6543</div>
                    <div className="flex justify-between"><span className="text-text-subtle">Fax</span> (555) 987-6544</div>
                    <div className="flex justify-between"><span className="text-text-subtle">DEA</span> CD7654321</div>
                    <div className="flex justify-between"><span className="text-text-subtle">NPI</span> 1234567890</div>
                  </div>
                </section>
              </div>

              {/* Medication Info */}
              <section>
                <h4 className="text-xs font-semibold text-text-subtle uppercase tracking-wider mb-3">Prescription Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-accent/5 border border-accent/20 p-4 rounded-lg">
                  <div className="col-span-2"><span className="text-text-subtle block mb-1 text-xs">Medication</span> <span className="font-medium">{viewMed.name}</span></div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Dose</span> {viewMed.dosage || "20mg"}</div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Product Code</span> NDC-12345</div>
                  <div className="col-span-4"><span className="text-text-subtle block mb-1 text-xs">Instructions (SIG)</span> Take 1 tablet by mouth daily.</div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Quantity</span> 30</div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Days Supply</span> 30</div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Refills</span> 3</div>
                  <div><span className="text-text-subtle block mb-1 text-xs">Last Refill</span> {viewMed.lastRefillDate ? format(new Date(viewMed.lastRefillDate), "MM/dd/yyyy") : "N/A"}</div>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
