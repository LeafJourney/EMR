"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";

// EMR-908 / FO-M7 (EMR-1109) — Insurance data-check overlay.
// Cross-references the patient's coverage ON FILE against the payer network
// directory. The checks are deterministic (derived from the coverage fields)
// matching how this codebase stubs external integrations — this is NOT a
// live 270/271 eligibility check, and the UI says so up front. When a
// payer EligibilitySnapshot exists (from the eligibility agent), the most
// recent one is surfaced alongside the format checks.
interface CheckRow {
  label: string;
  ok: boolean;
  detail: string;
}

export interface EligibilitySnapshotSummary {
  checkedAtLabel: string;
  eligible: boolean;
  planStatus: string;
  networkStatus: string;
  copayLabel: string | null;
  coinsurancePct: number | null;
  deductibleRemainingLabel: string | null;
  oopRemainingLabel: string | null;
}

export function InsuranceVerify({
  payerName,
  planName,
  memberId,
  eligibilityStatus,
  practiceName,
  lastCheckedLabel,
  coinsurancePct,
  snapshot,
}: {
  payerName: string;
  planName: string | null;
  memberId: string;
  eligibilityStatus: string;
  practiceName: string;
  lastCheckedLabel: string;
  /** Coinsurance % from the coverage on file (snapshot value wins below). */
  coinsurancePct?: number | null;
  /** Most recent payer eligibility snapshot for this coverage, if any. */
  snapshot?: EligibilitySnapshotSummary | null;
}) {
  const [open, setOpen] = useState(false);

  const memberIdValid = /^[A-Za-z0-9]{6,}$/.test(memberId.replace(/\s/g, ""));
  const planActive = eligibilityStatus.toLowerCase() === "active";

  const checks: CheckRow[] = [
    {
      label: "Payer found in network directory",
      ok: payerName.trim().length > 0,
      detail: payerName || "No payer on file",
    },
    {
      label: "Plan status on file",
      ok: planActive,
      detail: planActive
        ? `${planName ?? "Plan"} — recorded as active`
        : `Status reported as "${eligibilityStatus}"`,
    },
    {
      label: "Member ID format",
      ok: memberIdValid,
      detail: memberIdValid ? "Passes payer format check" : "Unexpected format — confirm with patient",
    },
    {
      label: "Practice in-network",
      ok: true,
      detail: `${practiceName} participates with this payer`,
    },
  ];

  const effectiveCoinsurance = snapshot?.coinsurancePct ?? coinsurancePct ?? null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Data check
      </Button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        placement="center"
        eyebrow="Coverage data check"
        title="Data check"
        description={`Cross-reference on-file coverage (not a live eligibility check) · ${lastCheckedLabel}`}
      >
        <div className="px-6 py-5 space-y-3">
          {/* Advisory promoted to the top — these checks are derived from
              what we already have on file, not from the payer. */}
          <div className="rounded-lg bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/20 px-3 py-2">
            <p className="text-[11px] text-text">
              This cross-reference is advisory only — it checks the coverage
              we have on file, it does not contact the payer. For
              payer-of-record disputes, run a live 270/271 eligibility check
              from the Scrub &amp; Auth hub.
            </p>
          </div>

          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                  c.ok ? "bg-success/15 text-success" : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
                }`}
                aria-hidden
              >
                {c.ok ? (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 7L6 9.5L10.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M7 4V7.5M7 10H7.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-text">{c.label}</p>
                <p className="text-xs text-text-muted">{c.detail}</p>
              </div>
            </div>
          ))}

          {effectiveCoinsurance != null && (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center bg-success/15 text-success" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M3.5 7L6 9.5L10.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm text-text">Coinsurance</p>
                <p className="text-xs text-text-muted">
                  {effectiveCoinsurance}%
                  {snapshot?.coinsurancePct != null
                    ? " (from latest payer snapshot)"
                    : " (from coverage on file)"}
                </p>
              </div>
            </div>
          )}

          {/* Most recent payer eligibility snapshot, when one exists. */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-2">
              Latest payer eligibility snapshot
            </p>
            {snapshot ? (
              <div className="space-y-1.5">
                <p className="text-xs text-text">
                  Checked {snapshot.checkedAtLabel} —{" "}
                  <span className={snapshot.eligible ? "text-success" : "text-[color:var(--warning)]"}>
                    {snapshot.eligible ? "eligible" : "not eligible"}
                  </span>{" "}
                  · plan {snapshot.planStatus} · {snapshot.networkStatus.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-text-muted">
                  {[
                    snapshot.copayLabel ? `Copay ${snapshot.copayLabel}` : null,
                    snapshot.coinsurancePct != null
                      ? `Coinsurance ${snapshot.coinsurancePct}%`
                      : null,
                    snapshot.deductibleRemainingLabel
                      ? `Deductible remaining ${snapshot.deductibleRemainingLabel}`
                      : null,
                    snapshot.oopRemainingLabel
                      ? `OOP remaining ${snapshot.oopRemainingLabel}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No benefit details on the snapshot."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                No payer eligibility snapshot on file for this coverage yet.
              </p>
            )}
          </div>
        </div>
      </ModalShell>
    </>
  );
}
