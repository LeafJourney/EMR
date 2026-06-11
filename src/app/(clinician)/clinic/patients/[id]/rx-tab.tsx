"use client";

/**
 * Rx tab (formerly "Cannabis Rx") — Dr. Patel revision cluster
 * EMR-873/874/875/876/878/879/880/881/882.
 *
 * - 873: title is "Rx"; cannabis/psilocybin are modular and scrubbed when off.
 * - 874: THC/CBD daily totals open an accountant-style breakdown popup + Feather.
 * - 875: interaction checks get per-row + bulk acknowledge/dismiss, red rows
 *        require a justification, every action is timestamped into the ledger
 *        (the Correspondence record). Section is collapsible.
 * - 876: "Active Regimens" → "Active Medications"; Edit jumps to /prescribe.
 * - 878: rows collapse to 4 columns (Name+dose / Sig / Prescribed / Renewed)
 *        and expand to ICD-10, controlled bubble, pharmacy; title → deep page.
 * - 879: standardized bubble colours (ratio=gold, active=green, inactive=red)
 *        with left-click filter popups and right-click edit.
 * - 880: Methods of Administration taxonomy reference + per-med mapping.
 * - 881: Recent Dose Logs emoji symptom tracker + Feather, cannabis-only.
 * - 882: Patient Instructions as bullets; Clinician Notes dated + running list.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Bubble,
  BubbleStrip,
  CindySays,
  CollapsibleSection,
  AckDismissControls,
  FeatherTrend,
  ModalShell,
  useChartLedger,
  type ResolveAction,
  type FilterBubble,
} from "./chart-kit";
import type { ModuleFlags } from "@/lib/clinical/module-opt-in";
import { scrubModuleWords } from "@/lib/clinical/module-opt-in";
import {
  ADMINISTRATION_METHODS,
  methodByKey,
} from "@/lib/clinical/methods-of-administration";
import { cindyTrend } from "@/lib/clinical/cindy-says";

/* ── Serialized shapes (page.tsx → client) ───────────────────────────── */

export interface RxRegimen {
  id: string;
  productName: string;
  brand: string | null;
  productType: string | null;
  route: string | null;
  active: boolean;
  isControlled: boolean;
  ratioLabel: string | null;
  doseLabel: string; // "0.25 mL"
  sig: string; // directions
  thcMgPerDose: number | null;
  cbdMgPerDose: number | null;
  thcMgPerDay: number | null;
  cbdMgPerDay: number | null;
  frequencyPerDay: number;
  prescribedDate: string | null;
  renewedDate: string | null;
  endDate: string | null;
  methodKey: string;
  patientInstructions: string | null;
  clinicianNotes: string | null;
  clinicianNoteAt: string | null;
}

export interface RxDoseLog {
  id: string;
  productName: string;
  loggedAt: string;
  volume: string;
  thcMg: number | null;
  cbdMg: number | null;
  note: string | null;
}

export interface RxInteraction {
  drug: string;
  cannabinoid: string;
  severity: "red" | "yellow" | "green";
  mechanism: string;
  recommendation: string;
}

interface RxTabProps {
  patientId: string;
  moduleFlags: ModuleFlags;
  regimens: RxRegimen[];
  doseLogs: RxDoseLog[];
  interactions: RxInteraction[];
  totalThcPerDay: number;
  totalCbdPerDay: number;
}

/* ── Symptom emoji dropdown (EMR-881) ────────────────────────────────── */

const SYMPTOM_EMOJIS: { emoji: string; label: string }[] = [
  { emoji: "😊", label: "mood" },
  { emoji: "🤢", label: "nausea" },
  { emoji: "✅", label: "improved" },
  { emoji: "❌", label: "worse" },
  { emoji: "😴", label: "sleep" },
  { emoji: "🤕", label: "pain" },
  { emoji: "😰", label: "anxiety" },
  { emoji: "🍽️", label: "appetite" },
];

/* ── Main ────────────────────────────────────────────────────────────── */

export function RxTab({
  patientId,
  moduleFlags,
  regimens,
  doseLogs,
  interactions,
  totalThcPerDay,
  totalCbdPerDay,
}: RxTabProps) {
  const { record } = useChartLedger(patientId);
  const active = regimens.filter((r) => r.active);
  const inactive = regimens.filter((r) => !r.active);

  const title = scrubModuleWords("Rx", moduleFlags) || "Rx";
  const showDoseLogs = moduleFlags.cannabis || moduleFlags.psilocybin;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xl text-text tracking-tight">{title}</h2>
        <Link href={`/clinic/patients/${patientId}/prescribe`}>
          <Button variant="primary" size="sm">
            New prescription
          </Button>
        </Link>
      </div>

      {regimens.length === 0 && doseLogs.length === 0 ? (
        <EmptyState
          title="No prescriptions on file"
          description="Create one to begin structured dosing with precise mg-based regimens."
        />
      ) : (
        <>
          {/* ── THC/CBD daily totals (EMR-874) ── */}
          {(moduleFlags.cannabis) && active.length > 0 && (
            <CannabinoidTotals
              regimens={active}
              totalThcPerDay={totalThcPerDay}
              totalCbdPerDay={totalCbdPerDay}
            />
          )}

          {/* ── Interaction check (EMR-875) ── */}
          {interactions.length > 0 && (
            <InteractionCheck
              interactions={interactions}
              onResolve={(i, action, justification) =>
                record({
                  kind: action,
                  source: "Interaction check",
                  subject: `${i.drug} + ${i.cannabinoid} (${i.severity})`,
                  justification,
                })
              }
            />
          )}

          {/* ── Active Medications (EMR-876/878/879/880) ── */}
          <ActiveMedications
            patientId={patientId}
            activeRegimens={active}
            inactiveRegimens={inactive}
            heading="Active Medications"
            record={record}
          />

          {/* ── Methods of Administration reference (EMR-880) ── */}
          <MethodsReference />

          {/* ── Inactive ── */}
          {inactive.length > 0 && (
            <CollapsibleSection
              storageKey={`rx:inactive:${patientId}`}
              defaultOpen={false}
              title={`Inactive medications (${inactive.length})`}
            >
              <div className="space-y-2 pt-1">
                {inactive.map((r) => (
                  <RegimenRow key={r.id} patientId={patientId} regimen={r} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Recent Dose Logs (EMR-881) ── */}
          {showDoseLogs && doseLogs.length > 0 && (
            <DoseLogs patientId={patientId} logs={doseLogs} record={record} />
          )}
        </>
      )}
    </div>
  );
}

/* ── EMR-874: cannabinoid totals + accountant breakdown ──────────────── */

function CannabinoidTotals({
  regimens,
  totalThcPerDay,
  totalCbdPerDay,
}: {
  regimens: RxRegimen[];
  totalThcPerDay: number;
  totalCbdPerDay: number;
}) {
  const [open, setOpen] = React.useState<null | "thc" | "cbd">(null);

  const breakdown = (kind: "thc" | "cbd") =>
    regimens
      .map((r) => ({
        name: r.productName,
        mg: kind === "thc" ? r.thcMgPerDay ?? 0 : r.cbdMgPerDay ?? 0,
      }))
      .filter((x) => x.mg > 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TotalTile
        label="Total THC / day"
        value={`${totalThcPerDay.toFixed(1)} mg`}
        accentClass="text-accent"
        onClick={() => setOpen("thc")}
      />
      <TotalTile
        label="Total CBD / day"
        value={`${totalCbdPerDay.toFixed(1)} mg`}
        accentClass="text-[color:var(--highlight)]"
        onClick={() => setOpen("cbd")}
      />

      <ModalShell
        open={open !== null}
        onClose={() => setOpen(null)}
        eyebrow="Daily total breakdown"
        title={open === "thc" ? "Total THC / day" : "Total CBD / day"}
        placement="center"
        maxWidth="max-w-md"
      >
        {open && (
          <AccountantBreakdown
            rows={breakdown(open)}
            total={open === "thc" ? totalThcPerDay : totalCbdPerDay}
            unit={open === "thc" ? "THC" : "CBD"}
          />
        )}
      </ModalShell>
    </div>
  );
}

function TotalTile({
  label,
  value,
  accentClass,
  onClick,
}: {
  label: string;
  value: string;
  accentClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent/40 hover:shadow-sm transition-all group"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
        {label}
      </p>
      <p className={cn("font-display text-2xl tabular-nums", accentClass)}>{value}</p>
      <p className="text-[11px] text-text-subtle mt-1 group-hover:text-accent transition-colors">
        Click for the per-product breakdown →
      </p>
    </button>
  );
}

function AccountantBreakdown({
  rows,
  total,
  unit,
}: {
  rows: { name: string; mg: number }[];
  total: number;
  unit: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-muted">No contributing products.</p>
        ) : (
          rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className="text-text">{r.name}</span>
              <span className="tabular-nums font-medium text-text">
                {r.mg.toFixed(1)} mg {unit}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-accent-soft border border-accent/20">
        <span className="text-sm font-semibold text-text">Total / day</span>
        <span className="tabular-nums font-display text-lg text-accent">
          {total.toFixed(1)} mg {unit}
        </span>
      </div>
      <FeatherTrend
        label={`${unit} per day`}
        series={rows.map((r) => Math.round(r.mg * 10) / 10)}
        unit="mg"
        analysis={cindyTrend({
          label: `${unit} contribution`,
          values: rows.map((r) => r.mg),
          unit: "mg",
        })}
        triggerClassName="border border-border"
      />
    </div>
  );
}

/* ── EMR-875: interaction check with ack/dismiss + justification ─────── */

function InteractionCheck({
  interactions,
  onResolve,
}: {
  interactions: RxInteraction[];
  onResolve: (i: RxInteraction, action: ResolveAction, justification?: string) => void;
}) {
  const [resolved, setResolved] = React.useState<
    Record<number, { action: ResolveAction; justification?: string; at: string }>
  >({});

  function resolveOne(idx: number, action: ResolveAction, justification?: string) {
    setResolved((prev) => ({
      ...prev,
      [idx]: { action, justification, at: new Date().toISOString() },
    }));
    onResolve(interactions[idx], action, justification);
  }

  function bulk(action: ResolveAction) {
    // Bulk skips unresolved critical (red) rows — those need a justification.
    interactions.forEach((it, idx) => {
      if (resolved[idx]) return;
      if (it.severity === "red") return;
      resolveOne(idx, action);
    });
  }

  const open = interactions.length - Object.keys(resolved).length;
  const toneFor = (s: RxInteraction["severity"]) =>
    s === "red" ? "severe" : s === "yellow" ? "mild" : "normal";

  return (
    <CollapsibleSection
      storageKey="rx:interactions"
      title={
        <span className="flex items-center gap-2">
          Interaction check
          <span className="text-[11px] font-normal text-text-subtle">
            {open} open · {interactions.length} total
          </span>
        </span>
      }
      right={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bulk("acknowledge")}
            className="px-2 py-1 text-[11px] rounded-md font-medium border border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
          >
            Acknowledge all
          </button>
          <button
            type="button"
            onClick={() => bulk("dismiss")}
            className="px-2 py-1 text-[11px] rounded-md font-medium border border-border text-text-muted hover:bg-surface-muted"
          >
            Dismiss all
          </button>
        </div>
      }
    >
      <div className="divide-y divide-border/60 pt-1">
        {interactions.map((it, idx) => (
          <div key={idx} className="py-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-medium text-text">
                  {cap(it.drug)} + {it.cannabinoid}
                </p>
                <Bubble tone={toneFor(it.severity)}>
                  {it.severity === "red"
                    ? "Critical"
                    : it.severity === "yellow"
                      ? "Caution"
                      : "Safe"}
                </Bubble>
              </div>
              <p className="text-[13px] text-text-muted leading-snug">{it.mechanism}</p>
              {it.recommendation && (
                <p className="text-[12px] text-accent mt-0.5">{it.recommendation}</p>
              )}
            </div>
            <AckDismissControls
              isCritical={it.severity === "red"}
              resolved={resolved[idx] ?? null}
              onResolve={(action, justification) => resolveOne(idx, action, justification)}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-subtle mt-3">
        Every acknowledgement and dismissal is time-stamped into the chart
        Correspondence record.
      </p>
    </CollapsibleSection>
  );
}

/* ── EMR-876/878/879/880: active medications ─────────────────────────── */

function ActiveMedications({
  patientId,
  activeRegimens,
  inactiveRegimens,
  heading,
  record,
}: {
  patientId: string;
  activeRegimens: RxRegimen[];
  inactiveRegimens: RxRegimen[];
  heading: string;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  // EMR-879: left-click a bubble class to filter; EMR-878: sortable.
  const [filter, setFilter] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<"name" | "sig" | "prescribed" | "renewed">(
    "name",
  );
  // Dr. Patel doc ~line 729: top-of-section dropdown toggles the view between
  // active and inactive regimens. Pure client state over the regimens already
  // passed in — partitioned by their `active` flag.
  const [view, setView] = React.useState<"active" | "inactive">("active");
  const regimens = view === "active" ? activeRegimens : inactiveRegimens;

  const viewToggle = (
    <select
      value={view}
      onChange={(e) => setView(e.target.value as typeof view)}
      aria-label="Regimen status"
      className="text-xs rounded-md border border-border bg-surface px-2 py-1 text-text focus:outline-none focus:border-accent"
    >
      <option value="active">Active regimens</option>
      <option value="inactive">Inactive regimens</option>
    </select>
  );

  if (regimens.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="font-display text-lg text-text tracking-tight">{heading}</h3>
          {viewToggle}
        </div>
        <p className="text-sm text-text-muted">
          {view === "active" ? "No active medications." : "No inactive medications."}
        </p>
      </section>
    );
  }

  const filterBubbles: FilterBubble[] = [
    { key: "active", label: "Active", tone: "active" },
    { key: "controlled", label: "Controlled", tone: "info" },
    { key: "ratio", label: "Has ratio", tone: "ratio" },
  ];

  const filtered = regimens.filter((r) => {
    if (!filter) return true;
    if (filter === "active") return r.active;
    if (filter === "controlled") return r.isControlled;
    if (filter === "ratio") return Boolean(r.ratioLabel);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "sig":
        return a.sig.localeCompare(b.sig);
      case "prescribed":
        return (b.prescribedDate ?? "").localeCompare(a.prescribedDate ?? "");
      case "renewed":
        return (b.renewedDate ?? "").localeCompare(a.renewedDate ?? "");
      default:
        return a.productName.localeCompare(b.productName);
    }
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        {/* EMR-878: title click → active vs inactive deep page */}
        <Link
          href={`/clinic/patients/${patientId}/regimens`}
          className="font-display text-lg text-text tracking-tight hover:text-accent transition-colors"
        >
          {heading} →
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {viewToggle}
          <label className="text-[11px] text-text-subtle">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="text-xs rounded-md border border-border bg-surface px-2 py-1 text-text focus:outline-none focus:border-accent"
          >
            <option value="name">Name</option>
            <option value="sig">Sig</option>
            <option value="prescribed">Date prescribed</option>
            <option value="renewed">Date renewed</option>
          </select>
        </div>
      </div>

      <div className="mb-3">
        <BubbleStrip bubbles={filterBubbles} selected={filter} onSelect={setFilter} />
      </div>

      <div className="space-y-2">
        {sorted.map((r) => (
          <RegimenRow key={r.id} patientId={patientId} regimen={r} record={record} />
        ))}
      </div>
    </section>
  );
}

/** EMR-878: collapsed 4-column row, expands to full prescription detail. */
function RegimenRow({
  patientId,
  regimen: r,
  record,
}: {
  patientId: string;
  regimen: RxRegimen;
  record?: ReturnType<typeof useChartLedger>["record"];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const method = methodByKey(r.methodKey);

  return (
    <Card tone="raised" className="overflow-hidden">
      <CardContent className="py-0 px-0">
        {/* Collapsed 4-column view */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full grid grid-cols-12 gap-2 items-center px-4 py-3 text-left hover:bg-surface-muted/40 transition-colors"
        >
          <div className="col-span-4 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span
                className={cn(
                  "text-text-subtle text-xs transition-transform inline-block",
                  expanded && "rotate-90",
                )}
                aria-hidden="true"
              >
                ›
              </span>
              <span className="text-sm font-medium text-text truncate">
                {r.productName}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap pl-4">
              {r.ratioLabel && <Bubble tone="ratio">{r.ratioLabel}</Bubble>}
              <Bubble tone={r.active ? "active" : "inactive"}>
                {r.active ? "Active" : "Inactive"}
              </Bubble>
            </div>
          </div>
          <div className="col-span-4 text-xs text-text-muted">
            <span className="text-text">{r.sig || "—"}</span>
            <span className="block text-text-subtle mt-0.5">{r.doseLabel}</span>
          </div>
          <div className="col-span-2 text-xs text-text-muted tabular-nums">
            <span className="block text-[10px] uppercase tracking-wide text-text-subtle">
              Prescribed
            </span>
            {fmt(r.prescribedDate)}
          </div>
          <div className="col-span-2 text-xs text-text-muted tabular-nums">
            <span className="block text-[10px] uppercase tracking-wide text-text-subtle">
              Renewed
            </span>
            {fmt(r.renewedDate)}
          </div>
        </button>

        {/* Expanded prescription detail */}
        {expanded && (
          <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Bubble tone={r.isControlled ? "info" : "beige"}>
                {r.isControlled ? "Controlled" : "Non-controlled"}
              </Bubble>
              {method && (
                <Bubble className={method.headerClass}>{method.label}</Bubble>
              )}
              {r.route && <Bubble tone="beige">{r.route}</Bubble>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Detail label="ICD-10" value="—" />
              <Detail
                label="Per dose"
                value={`${r.thcMgPerDose?.toFixed(1) ?? "—"} THC / ${r.cbdMgPerDose?.toFixed(1) ?? "—"} CBD`}
              />
              <Detail label="Frequency" value={`${r.frequencyPerDay}× daily`} />
              <Detail label="End date" value={fmt(r.endDate)} />
            </div>
            {/* EMR-882: Patient instructions as bullets */}
            {r.patientInstructions && (
              <div className="rounded-lg bg-accent-soft border border-accent/15 px-3.5 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent mb-1.5">
                  Patient instructions
                </p>
                <ul className="space-y-1">
                  {bulletize(r.patientInstructions).map((b, i) => (
                    <li key={i} className="text-[13px] text-text flex gap-1.5">
                      <span className="text-accent/60">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* EMR-882: Clinician notes dated + running list */}
            {r.clinicianNotes && (
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="w-full text-left rounded-lg bg-surface-muted/60 border border-border/50 px-3.5 py-2.5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                    Clinician notes
                  </p>
                  <span className="text-[11px] text-text-subtle tabular-nums">
                    {fmt(r.clinicianNoteAt)}
                  </span>
                </div>
                <p className="text-[13px] text-text-muted leading-snug mt-1 line-clamp-2">
                  {r.clinicianNotes}
                </p>
                <span className="text-[11px] text-accent mt-1 inline-block">
                  View running list →
                </span>
              </button>
            )}
            <div className="flex items-center gap-2">
              {/* EMR-876: edit → actual prescribe page */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/clinic/patients/${patientId}/prescribe`)}
              >
                Edit
              </Button>
              {r.active && record && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    record({
                      kind: "note",
                      source: "Rx",
                      subject: `Discontinue requested: ${r.productName}`,
                    })
                  }
                >
                  Discontinue
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <ModalShell
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        eyebrow={r.productName}
        title="Clinician notes — running list"
        placement="center"
        maxWidth="max-w-md"
      >
        <ol className="space-y-2">
          <li className="rounded-lg border border-border px-3 py-2">
            <p className="text-[11px] text-text-subtle tabular-nums mb-0.5">
              {fmt(r.clinicianNoteAt)}
            </p>
            <p className="text-sm text-text">{r.clinicianNotes}</p>
          </li>
        </ol>
      </ModalShell>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-subtle mb-0.5">
        {label}
      </p>
      <p className="text-text tabular-nums">{value}</p>
    </div>
  );
}

/* ── EMR-880: methods of administration reference ────────────────────── */

function MethodsReference() {
  return (
    <CollapsibleSection
      storageKey="rx:methods"
      defaultOpen={false}
      title="Methods of Administration"
      meta={`${ADMINISTRATION_METHODS.length} routes`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {ADMINISTRATION_METHODS.map((m) => (
          <div key={m.key} className="rounded-lg border border-border/60 p-2.5">
            <Bubble className={m.headerClass}>{m.label}</Bubble>
            <div className="flex flex-wrap gap-1 mt-2">
              {m.examples.map((ex) => (
                <Bubble key={ex} tone="beige">
                  {ex}
                </Bubble>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/* ── EMR-881: recent dose logs with emoji symptom tracker ────────────── */

function DoseLogs({
  patientId,
  logs,
  record,
}: {
  patientId: string;
  logs: RxDoseLog[];
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const [detail, setDetail] = React.useState<RxDoseLog | null>(null);

  const thcSeries = [...logs]
    .reverse()
    .map((l) => l.thcMg ?? 0)
    .filter((n) => n > 0);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-display text-lg text-text tracking-tight">Recent dose logs</h3>
        <FeatherTrend
          label="THC per dose log"
          series={thcSeries}
          unit="mg"
          analysis={cindyTrend({
            label: "THC per dose",
            values: thcSeries,
            unit: "mg",
          })}
        />
      </div>
      <Card tone="raised">
        <CardContent className="px-0 py-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.14em] text-text-subtle">
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Product</th>
                <th className="text-right py-3 pr-4 font-medium">Volume</th>
                <th className="text-right py-3 pr-4 font-medium text-accent">THC</th>
                <th className="text-left py-3 pr-4 font-medium">Notes</th>
                <th className="py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logs.map((log) => (
                <DoseLogRow
                  key={log.id}
                  log={log}
                  onOpen={() => setDetail(log)}
                  onTag={(emoji, label) =>
                    record({
                      kind: "note",
                      source: "Dose log",
                      subject: `${log.productName}: ${emoji} ${label}`,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ModalShell
        open={detail !== null}
        onClose={() => setDetail(null)}
        eyebrow="Dose log"
        title={detail?.productName ?? ""}
        placement="center"
        maxWidth="max-w-md"
      >
        {detail && (
          <div className="space-y-2 text-sm">
            <Row k="Logged" v={fmt(detail.loggedAt)} />
            <Row k="Volume" v={detail.volume} />
            <Row k="THC" v={detail.thcMg != null ? `${detail.thcMg.toFixed(1)} mg` : "—"} />
            <Row k="CBD" v={detail.cbdMg != null ? `${detail.cbdMg.toFixed(1)} mg` : "—"} />
            <Row k="Note" v={detail.note || "—"} />
          </div>
        )}
      </ModalShell>
    </section>
  );
}

function DoseLogRow({
  log,
  onOpen,
  onTag,
}: {
  log: RxDoseLog;
  onOpen: () => void;
  onTag: (emoji: string, label: string) => void;
}) {
  const [tag, setTag] = React.useState<string>("");
  return (
    <tr className="hover:bg-surface-muted/40 transition-colors">
      <td className="py-2.5 px-4 text-text-muted tabular-nums whitespace-nowrap text-xs">
        <button type="button" onClick={onOpen} className="hover:text-accent">
          {fmt(log.loggedAt)}
        </button>
      </td>
      <td className="py-2.5 pr-4 text-text">{log.productName}</td>
      <td className="py-2.5 pr-4 text-right text-text tabular-nums">{log.volume}</td>
      <td className="py-2.5 pr-4 text-right text-accent font-medium tabular-nums">
        {log.thcMg != null ? log.thcMg.toFixed(1) : "—"}
      </td>
      <td className="py-2.5 pr-4 text-text-muted text-xs max-w-[180px] truncate">
        {log.note || "—"}
      </td>
      <td className="py-2.5 pr-4 text-right">
        <select
          value={tag}
          onChange={(e) => {
            const sym = SYMPTOM_EMOJIS.find((s) => s.label === e.target.value);
            if (sym) {
              onTag(sym.emoji, sym.label);
              setTag("");
            }
          }}
          aria-label="Log a symptom"
          className="text-xs rounded-md border border-border bg-surface px-1.5 py-1 text-text focus:outline-none focus:border-accent"
        >
          <option value="">＋ symptom</option>
          {SYMPTOM_EMOJIS.map((s) => (
            <option key={s.label} value={s.label}>
              {s.emoji} ({s.label})
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

/* ── small helpers ───────────────────────────────────────────────────── */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-subtle text-xs uppercase tracking-wide">{k}</span>
      <span className="text-text">{v}</span>
    </div>
  );
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function bulletize(text: string): string[] {
  return text
    .split(/[\n;•]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
