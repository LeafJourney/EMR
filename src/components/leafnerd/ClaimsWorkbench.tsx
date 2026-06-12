"use client";

import React, { useState } from "react";

interface Claim {
  id: string;
  claimNumber: string | null;
  cptCodes: any;
  diagnoses?: any;
  icd10Codes?: any;
  [key: string]: any;
}

interface Anomaly {
  id: string;
  claimId: string;
  status: string;
  edits: any;
  scrubbedAt: Date | string;
  claim: Claim | null;
}

interface ClaimsWorkbenchProps {
  initialAnomalies: Anomaly[];
}

// Map the raw ScrubStatus enum (clean | warnings | blocked) — plus the in-app
// "Awaiting Provider" state set after a Contact Provider action — to friendly
// labels and a display tone. Only "blocked" is a true clearinghouse error (red);
// "warnings" / "clean" are advisory and "Awaiting Provider" is the post-action
// waiting state, all of which read as warning (amber) rather than a red error.
type StatusTone = "error" | "warning";

const STATUS_LABELS: Record<string, string> = {
  clean: "Passing",
  warnings: "Needs review",
  blocked: "Clearinghouse blocked",
  "Awaiting Provider": "Awaiting clinician",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusTone(status: string): StatusTone {
  return status === "blocked" ? "error" : "warning";
}

export function ClaimsWorkbench({ initialAnomalies }: ClaimsWorkbenchProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>(initialAnomalies);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [drawerActionState, setDrawerActionState] = useState<"idle" | "fixing" | "fixed" | "submitting" | "contacting">("idle");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleApplyAutoFix = (anomalyId: string) => {
    setDrawerActionState("fixing");

    // Simulate rule re-evaluation
    setTimeout(() => {
      setDrawerActionState("fixed");
      
      setTimeout(() => {
        // Animate out of list
        setAnomalies((prev) => prev.filter((a) => a.id !== anomalyId));
        setSelectedAnomaly(null);
        setDrawerActionState("idle");
        showToast("Claim auto-fix applied: CPT modifier corrected. Re-queued for clearinghouse submission.");
      }, 1000);
    }, 1200);
  };

  const handleApproveSubmit = (anomalyId: string) => {
    setDrawerActionState("submitting");

    setTimeout(() => {
      setAnomalies((prev) => prev.filter((a) => a.id !== anomalyId));
      setSelectedAnomaly(null);
      setDrawerActionState("idle");
      showToast("Claim override approved. Forwarding to insurance clearinghouse.");
    }, 1200);
  };

  const handleContactProvider = (anomalyId: string) => {
    setDrawerActionState("contacting");

    setTimeout(() => {
      setAnomalies((prev) =>
        prev.map((a) =>
          a.id === anomalyId ? { ...a, status: "Awaiting Provider" } : a
        )
      );
      setDrawerActionState("idle");
      showToast("Clarification request sent to ordering clinician.");
    }, 1200);
  };

  return (
    <div className="relative">
      {/* Header Stat Area */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-border/5">
        <h3 className="text-lg font-semibold text-text-strong">Flagged Billing Claims ({anomalies.length})</h3>
        <div className="px-4 py-1.5 bg-error/10 text-error font-bold rounded-lg text-xs flex items-center gap-2 border border-error/20">
          <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
          {anomalies.length} unresolved flags
        </div>
      </div>

      {/* Main Grid List */}
      <div className="grid grid-cols-1 gap-4">
        {anomalies.length === 0 ? (
          <div className="bg-bg-surface border border-border/10 rounded-2xl p-16 text-center shadow-sm">
            <span className="text-3xl">🎉</span>
            <h4 className="text-lg font-bold text-text-strong mt-4">All anomalies resolved!</h4>
            <p className="text-sm text-text-muted mt-2">Billing workbench is clean. Excellent work.</p>
          </div>
        ) : (
          anomalies.map((flag) => {
            const edits = Array.isArray(flag.edits) ? flag.edits : [];
            const issue = (edits[0] as any)?.message || "Rule violation detected";
            const cptCodes = flag.claim?.cptCodes as any[];
            const code = cptCodes && cptCodes.length > 0 ? cptCodes[0]?.code : "99214";
            const tone = statusTone(flag.status);

            return (
              <div
                key={flag.id}
                onClick={() => setSelectedAnomaly(flag)}
                className="bg-bg-surface border border-border/10 rounded-xl p-5 flex items-center justify-between shadow-sm hover:border-accent-strong/30 hover:bg-bg-highlight/5 transition-all group cursor-pointer animate-in fade-in duration-300"
              >
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-lg font-mono font-bold flex items-center justify-center border transition-colors ${
                    tone === "error"
                      ? "bg-error/10 text-error border-error/20"
                      : "bg-warning/10 text-warning border-warning/20"
                  }`}>
                    {code}
                  </div>
                  <div>
                    <h4 className="font-bold text-text-strong group-hover:text-accent-strong transition-colors">{issue}</h4>
                    <p className="text-sm text-text-muted mt-1">
                      Claim #{flag.claim?.claimNumber || flag.claimId.slice(0, 8)} • Status: <span className={tone === "error" ? "text-error font-semibold" : "text-warning font-semibold"}>{statusLabel(flag.status)}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">AI Scanned</div>
                  <div className="text-xs text-accent-strong font-semibold mt-1 group-hover:underline">Review Claim →</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Slide-over Drawer Panel */}
      {selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Overlay */}
          <div
            onClick={() => drawerActionState === "idle" && setSelectedAnomaly(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Body */}
          <div className="relative w-full max-w-lg bg-bg border-l border-border/15 h-full flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-border/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-accent-strong font-bold uppercase tracking-wider">Anomaly Workbench</span>
                <h3 className="text-lg font-bold text-text-strong mt-1">Claim Details • #{selectedAnomaly.claim?.claimNumber || selectedAnomaly.claimId.slice(0, 8)}</h3>
              </div>
              <button
                disabled={drawerActionState !== "idle"}
                onClick={() => setSelectedAnomaly(null)}
                className="text-text-muted hover:text-text-strong p-1 rounded-lg border border-border/10 hover:bg-bg-highlight/5 transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                statusTone(selectedAnomaly.status) === "error"
                  ? "bg-error/5 border-error/20 text-error"
                  : "bg-warning/5 border-warning/20 text-warning"
              }`}>
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">Active Rule Flag</div>
                  <div className="text-sm font-semibold text-text-strong mt-0.5">
                    {selectedAnomaly.status === "Awaiting Provider" ? "Awaiting Clinical Response" : statusLabel(selectedAnomaly.status)}
                  </div>
                </div>
              </div>

              {/* Validation Problem Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Validation Error</h4>
                <div className="bg-bg-surface border border-border/10 rounded-xl p-4 text-sm text-text-strong font-medium leading-relaxed">
                  {(selectedAnomaly.edits?.[0] as any)?.message || "Billing code mismatch: The diagnosed ICD-10 code requires a matching modifier modifier -25 when billed on the same date of service as a treatment evaluation."}
                </div>
              </div>

              {/* Code Breakdown Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-surface border border-border/10 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">CPT Codes</span>
                  <div className="text-base font-black text-text-strong mt-2">
                    {selectedAnomaly.claim?.cptCodes?.[0]?.code || "99214"}
                  </div>
                  <span className="text-xs text-text-muted mt-1 block">Level 4 Outpatient Visit</span>
                </div>
                <div className="bg-bg-surface border border-border/10 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Diagnosis Codes</span>
                  <div className="text-base font-black text-text-strong mt-2">
                    {selectedAnomaly.claim?.icd10Codes?.[0]?.code || selectedAnomaly.claim?.diagnoses?.[0]?.code || "F41.1"}
                  </div>
                  <span className="text-xs text-text-muted mt-1 block">Generalized anxiety disorder</span>
                </div>
              </div>

              {/* Raw JSON Data Drawer */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Raw Claim Metadata</h4>
                <pre className="bg-bg-surface border border-border/10 rounded-xl p-4 text-[11px] font-mono text-text-strong overflow-x-auto max-h-[150px]">
                  {JSON.stringify(selectedAnomaly.claim, null, 2)}
                </pre>
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="p-6 border-t border-border/10 space-y-3 bg-bg-surface/50 backdrop-blur-md">
              {drawerActionState === "fixing" && (
                <div className="py-3 bg-bg border border-border/10 rounded-xl flex items-center justify-center space-x-3 text-sm text-text-strong font-semibold shadow-inner">
                  <div className="w-4 h-4 border-2 border-accent-strong border-t-transparent rounded-full animate-spin" />
                  <span>Generating rule correction...</span>
                </div>
              )}
              {drawerActionState === "fixed" && (
                <div className="py-3 bg-accent-strong/10 border border-accent-strong/20 text-accent-strong rounded-xl flex items-center justify-center space-x-2 text-sm font-bold animate-pulse shadow-sm">
                  <span>✓</span>
                  <span>Correction Applied! Resolving...</span>
                </div>
              )}
              {drawerActionState === "submitting" && (
                <div className="py-3 bg-bg border border-border/10 rounded-xl flex items-center justify-center space-x-3 text-sm text-text-strong font-semibold shadow-inner">
                  <div className="w-4 h-4 border-2 border-accent-strong border-t-transparent rounded-full animate-spin" />
                  <span>Submitting with override...</span>
                </div>
              )}
              {drawerActionState === "contacting" && (
                <div className="py-3 bg-bg border border-border/10 rounded-xl flex items-center justify-center space-x-3 text-sm text-text-strong font-semibold shadow-inner">
                  <div className="w-4 h-4 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                  <span>Emailing clinician dashboard...</span>
                </div>
              )}

              {drawerActionState === "idle" && (
                <>
                  <button
                    onClick={() => handleApplyAutoFix(selectedAnomaly.id)}
                    className="w-full py-3 bg-accent-strong text-bg rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:bg-accent-strong/90 hover:-translate-y-0.5 transition-all flex items-center justify-center space-x-2"
                  >
                    <span>⚡</span>
                    <span>Apply Auto-Fix (Add Modifier -25)</span>
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleApproveSubmit(selectedAnomaly.id)}
                      className="py-2.5 bg-bg border border-border/15 hover:border-text text-text-strong rounded-xl text-xs font-bold transition-all"
                    >
                      Override & Submit
                    </button>
                    <button
                      onClick={() => handleContactProvider(selectedAnomaly.id)}
                      className="py-2.5 bg-bg border border-border/15 hover:border-warning hover:text-warning text-text-muted rounded-xl text-xs font-bold transition-all"
                    >
                      Contact Provider
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-bg-surface border border-accent-strong/30 rounded-2xl p-4 shadow-2xl flex items-center space-x-3 max-w-sm animate-in slide-in-from-bottom duration-300">
          <div className="w-8 h-8 rounded-full bg-accent-strong/10 border border-accent-strong/20 flex items-center justify-center text-accent-strong font-bold">
            ✓
          </div>
          <div className="flex-1">
            <span className="text-xs font-bold text-accent-strong uppercase tracking-wider block">System Notification</span>
            <p className="text-xs text-text-strong mt-0.5 leading-relaxed">{toastMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
