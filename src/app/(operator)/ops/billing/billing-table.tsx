"use client";

/**
 * BillingTable — client-interactive claims table for /ops/billing.
 *
 * Adds two owner-portal features on top of the server-rendered claims list:
 *   • EMR-973 — denied rows expand into a detail panel with the full
 *     chronological audit/history trail (denial events, clearinghouse
 *     submissions, adjudications, appeal packets + outcomes).
 *   • EMR-963 — sortable column headers (click to toggle asc/desc) plus
 *     drag-to-reorder and add/remove columns, persisted to localStorage.
 *
 * The server passes already-serialized rows (Dates → ISO strings, cents →
 * numbers) so this component never touches Prisma Date/Decimal objects.
 */

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { DenialActionForm } from "./denial-action-form";

// ───────────────────────────────────────── Serialized row shapes

export interface SerializedDenialEvent {
  id: string;
  carcCode: string;
  rarcCode: string | null;
  groupCode: string;
  denialCategory: string | null;
  amountDeniedCents: number;
  recoverable: boolean;
  recoverableAmountCents: number | null;
  resolution: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SerializedAppealPacket {
  id: string;
  appealLevel: number;
  status: string;
  submittedAt: string | null;
  submittedTo: string | null;
  outcomeReceivedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  outcomeDecision: string | null;
}

export interface SerializedSubmission {
  id: string;
  clearinghouseName: string;
  responseStatus: string;
  responseCode: string | null;
  responseMessage: string | null;
  submittedAt: string;
  respondedAt: string | null;
  retryCount: number;
}

export interface SerializedAdjudication {
  id: string;
  claimStatus: string;
  checkNumber: string | null;
  totalPaidCents: number;
  totalAllowedCents: number;
  totalAdjustedCents: number;
  totalPatientRespCents: number;
  eraDate: string;
  parsedAt: string;
}

export interface SerializedClaim {
  id: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string };
  serviceDate: string;
  cptCodes: Array<{ code: string; label?: string }>;
  icd10Codes: Array<{ code: string }>;
  payerName: string | null;
  billedAmountCents: number;
  paidAmountCents: number;
  allowedAmountCents: number | null;
  patientRespCents: number;
  denialReason: string | null;
  deniedAt: string | null;
  denialEvents: SerializedDenialEvent[];
  appealPackets: SerializedAppealPacket[];
  submissions: SerializedSubmission[];
  adjudications: SerializedAdjudication[];
}

// ───────────────────────────────────────── Status presentation

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "accent" | "info"
> = {
  draft: "neutral",
  submitted: "info",
  pending: "warning",
  paid: "success",
  partial: "accent",
  denied: "danger",
  appealed: "warning",
  written_off: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending: "Pending",
  paid: "Paid",
  partial: "Partial",
  denied: "Denied",
  appealed: "Appealed",
  written_off: "Written off",
};

// Stable group order so "Status" sort clusters like statuses together.
const STATUS_GROUP_ORDER: Record<string, number> = {
  draft: 0,
  submitted: 1,
  accepted: 2,
  adjudicated: 3,
  pending: 4,
  partial: 5,
  paid: 6,
  appealed: 7,
  denied: 8,
  closed: 9,
  written_off: 10,
  voided: 11,
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function statusTone(status: string) {
  return STATUS_TONE[status] ?? "neutral";
}

// ───────────────────────────────────────── Column model

type ColumnKey =
  | "patient"
  | "date"
  | "codes"
  | "payer"
  | "billed"
  | "paid"
  | "status";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Right-align the header + cell (numeric money columns). */
  alignRight?: boolean;
  /** Comparator for ascending order; descending negates the result. */
  compare: (a: SerializedClaim, b: SerializedClaim) => number;
}

const COLUMNS: Record<ColumnKey, ColumnDef> = {
  patient: {
    key: "patient",
    label: "Patient",
    compare: (a, b) => {
      const an = `${a.patient.lastName} ${a.patient.firstName}`.toLowerCase();
      const bn = `${b.patient.lastName} ${b.patient.firstName}`.toLowerCase();
      return an.localeCompare(bn);
    },
  },
  date: {
    key: "date",
    label: "Date",
    compare: (a, b) =>
      new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime(),
  },
  codes: {
    key: "codes",
    label: "Codes",
    compare: (a, b) => {
      const ac = a.cptCodes[0]?.code ?? "";
      const bc = b.cptCodes[0]?.code ?? "";
      return ac.localeCompare(bc);
    },
  },
  payer: {
    key: "payer",
    label: "Payer",
    compare: (a, b) =>
      (a.payerName ?? "").toLowerCase().localeCompare((b.payerName ?? "").toLowerCase()),
  },
  billed: {
    key: "billed",
    label: "Billed",
    alignRight: true,
    compare: (a, b) => a.billedAmountCents - b.billedAmountCents,
  },
  paid: {
    key: "paid",
    label: "Paid",
    alignRight: true,
    compare: (a, b) => a.paidAmountCents - b.paidAmountCents,
  },
  status: {
    key: "status",
    label: "Status",
    compare: (a, b) => {
      const ao = STATUS_GROUP_ORDER[a.status] ?? 99;
      const bo = STATUS_GROUP_ORDER[b.status] ?? 99;
      return ao - bo;
    },
  },
};

const DEFAULT_ORDER: ColumnKey[] = [
  "patient",
  "date",
  "codes",
  "payer",
  "billed",
  "paid",
  "status",
];

const STORAGE_KEY = "ops.billing.columns.v1";

interface ColumnLayout {
  order: ColumnKey[];
  hidden: ColumnKey[];
}

function isColumnKey(v: unknown): v is ColumnKey {
  return typeof v === "string" && v in COLUMNS;
}

function loadLayout(): ColumnLayout {
  const fallback: ColumnLayout = { order: [...DEFAULT_ORDER], hidden: [] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter(isColumnKey)
      : [];
    // Backfill any columns that exist in the model but are missing from
    // a stale persisted layout (e.g. after an app update adds a column).
    for (const key of DEFAULT_ORDER) {
      if (!order.includes(key)) order.push(key);
    }
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter(isColumnKey)
      : [];
    return { order, hidden };
  } catch {
    return fallback;
  }
}

// ───────────────────────────────────────── Sort state

interface SortState {
  key: ColumnKey;
  dir: "asc" | "desc";
}

// ───────────────────────────────────────── Audit timeline

type TimelineTone = "neutral" | "accent" | "success" | "danger" | "warning" | "info";

interface TimelineEntry {
  id: string;
  date: string | null;
  title: string;
  tone: TimelineTone;
  /** Who/what received this — "provider" vs "patient" framing. */
  audience?: "provider" | "patient";
  detail?: React.ReactNode;
}

const DENIAL_RESOLUTION_LABEL: Record<string, string> = {
  pending: "Pending",
  corrected_and_resubmitted: "Corrected & resubmitted",
  appealed: "Appealed",
  written_off: "Written off",
  patient_responsibility: "Patient responsibility",
  overturned: "Overturned",
  escalated: "Escalated",
};

const APPEAL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved_for_submission: "Approved for submission",
  submitted: "Submitted",
  overturned: "Overturned",
  upheld: "Upheld",
  pending_review: "Pending review",
};

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

function buildTimeline(claim: SerializedClaim): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const s of claim.submissions) {
    entries.push({
      id: `sub-${s.id}`,
      date: s.submittedAt,
      title: `Submitted to ${s.clearinghouseName}`,
      tone: "info",
      audience: "provider",
      detail: (
        <span>
          {SUBMISSION_STATUS_LABEL[s.responseStatus] ?? s.responseStatus}
          {s.responseCode ? ` · code ${s.responseCode}` : ""}
          {s.retryCount > 0 ? ` · ${s.retryCount} retr${s.retryCount === 1 ? "y" : "ies"}` : ""}
          {s.responseMessage ? ` — ${s.responseMessage}` : ""}
        </span>
      ),
    });
    if (s.respondedAt) {
      entries.push({
        id: `sub-resp-${s.id}`,
        date: s.respondedAt,
        title: `Clearinghouse response (${s.clearinghouseName})`,
        tone: s.responseStatus === "rejected" ? "danger" : "neutral",
        audience: "provider",
        detail: s.responseMessage ?? undefined,
      });
    }
  }

  for (const a of claim.adjudications) {
    entries.push({
      id: `adj-${a.id}`,
      date: a.eraDate,
      title: `ERA adjudication — ${a.claimStatus}`,
      tone: a.claimStatus === "paid" ? "success" : a.claimStatus === "denied" ? "danger" : "warning",
      audience: "provider",
      detail: (
        <span>
          Paid {formatMoney(a.totalPaidCents)} · allowed {formatMoney(a.totalAllowedCents)} ·
          adjusted {formatMoney(a.totalAdjustedCents)} · patient resp{" "}
          {formatMoney(a.totalPatientRespCents)}
          {a.checkNumber ? ` · check ${a.checkNumber}` : ""}
        </span>
      ),
    });
  }

  for (const d of claim.denialEvents) {
    entries.push({
      id: `den-${d.id}`,
      date: d.createdAt,
      title: `Denial — CARC ${d.carcCode}${d.rarcCode ? ` / RARC ${d.rarcCode}` : ""} (${d.groupCode})`,
      tone: "danger",
      audience: "provider",
      detail: (
        <span>
          {d.denialCategory ? `${d.denialCategory.replace(/_/g, " ")} · ` : ""}
          {formatMoney(d.amountDeniedCents)} denied
          {d.recoverable && d.recoverableAmountCents != null
            ? ` · ${formatMoney(d.recoverableAmountCents)} recoverable`
            : d.recoverable
              ? " · recoverable"
              : " · not recoverable"}
          {" · "}
          {DENIAL_RESOLUTION_LABEL[d.resolution] ?? d.resolution}
        </span>
      ),
    });
    if (d.resolvedAt) {
      entries.push({
        id: `den-res-${d.id}`,
        date: d.resolvedAt,
        title: `Denial resolved — ${DENIAL_RESOLUTION_LABEL[d.resolution] ?? d.resolution}`,
        tone: d.resolution === "overturned" ? "success" : "neutral",
        audience: "provider",
      });
    }
  }

  for (const p of claim.appealPackets) {
    entries.push({
      id: `app-${p.id}`,
      date: p.submittedAt ?? p.createdAt,
      title: `Appeal level ${p.appealLevel} — ${APPEAL_STATUS_LABEL[p.status] ?? p.status}`,
      tone: "accent",
      audience: "provider",
      detail: (
        <span>
          {p.submittedTo ? `Submitted to ${p.submittedTo}` : "Not yet submitted"}
          {p.reviewedBy ? " · human-reviewed" : ""}
        </span>
      ),
    });
    if (p.outcomeReceivedAt) {
      const overturned = p.outcomeDecision === "overturned" || p.status === "overturned";
      entries.push({
        id: `app-out-${p.id}`,
        date: p.outcomeReceivedAt,
        title: `Appeal outcome — ${p.outcomeDecision ?? (p.status === "upheld" ? "upheld" : p.status)}`,
        tone: overturned ? "success" : "danger",
        audience: "patient",
        detail: "Correspondence received",
      });
    }
  }

  // Chronological order; entries without a date sink to the bottom.
  entries.sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
    return at - bt;
  });

  return entries;
}

const TIMELINE_DOT: Record<TimelineTone, string> = {
  neutral: "bg-border-strong",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-[color:var(--highlight)]",
  info: "bg-info",
};

// ───────────────────────────────────────── Cell renderers

function renderCell(claim: SerializedClaim, key: ColumnKey): React.ReactNode {
  switch (key) {
    case "patient":
      return (
        <Link
          href={`/clinic/patients/${claim.patient.id}`}
          className="flex items-center gap-2 group"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            firstName={claim.patient.firstName}
            lastName={claim.patient.lastName}
            size="sm"
          />
          <span className="font-medium text-text group-hover:text-accent transition-colors">
            {claim.patient.firstName} {claim.patient.lastName}
          </span>
        </Link>
      );
    case "date":
      return (
        <span className="text-text-muted tabular-nums">
          {formatDate(claim.serviceDate)}
        </span>
      );
    case "codes":
      return (
        <div className="flex flex-wrap gap-1">
          {claim.cptCodes.slice(0, 2).map((c) => (
            <span
              key={c.code}
              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
            >
              {c.code}
            </span>
          ))}
          {claim.icd10Codes.slice(0, 2).map((c) => (
            <span
              key={c.code}
              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-highlight/10 text-[color:var(--highlight)]"
            >
              {c.code}
            </span>
          ))}
        </div>
      );
    case "payer":
      return (
        <span className="text-text-muted text-xs">{claim.payerName ?? "—"}</span>
      );
    case "billed":
      return (
        <span className="font-medium text-text tabular-nums">
          {formatMoney(claim.billedAmountCents)}
        </span>
      );
    case "paid":
      return (
        <span
          className={cn(
            "tabular-nums",
            claim.paidAmountCents === 0 ? "text-text-subtle" : "text-success",
          )}
        >
          {formatMoney(claim.paidAmountCents)}
        </span>
      );
    case "status":
      return (
        <>
          <Badge tone={statusTone(claim.status)}>{statusLabel(claim.status)}</Badge>
          {claim.status === "denied" && claim.denialReason && (
            <p className="text-sm text-danger mt-1 max-w-[260px] leading-snug">
              {claim.denialReason}
            </p>
          )}
        </>
      );
    default:
      return null;
  }
}

// ───────────────────────────────────────── Component

export function BillingTable({ claims }: { claims: SerializedClaim[] }) {
  const [layout, setLayout] = React.useState<ColumnLayout>({
    order: [...DEFAULT_ORDER],
    hidden: [],
  });
  const [sort, setSort] = React.useState<SortState | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  // Load persisted layout after mount to avoid SSR/CSR mismatch.
  React.useEffect(() => {
    setLayout(loadLayout());
    setHydrated(true);
  }, []);

  // Persist layout changes (skip the initial pre-hydration default).
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Storage may be unavailable (private mode / quota); ignore.
    }
  }, [layout, hydrated]);

  const visibleColumns = React.useMemo(
    () => layout.order.filter((k) => !layout.hidden.includes(k)),
    [layout],
  );

  const sortedClaims = React.useMemo(() => {
    if (!sort) return claims;
    const def = COLUMNS[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    // Stable sort: decorate with original index as tiebreaker.
    return claims
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const cmp = def.compare(a.c, b.c) * factor;
        return cmp !== 0 ? cmp : a.i - b.i;
      })
      .map((x) => x.c);
  }, [claims, sort]);

  const toggleSort = (key: ColumnKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears sort → back to server order
    });
  };

  // ── HTML5 drag-and-drop reorder on the header cells ──
  const dragKey = React.useRef<ColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = React.useState<ColumnKey | null>(null);

  const onHeaderDragStart = (key: ColumnKey) => (e: React.DragEvent) => {
    dragKey.current = key;
    try {
      e.dataTransfer.setData("text/plain", key);
      e.dataTransfer.effectAllowed = "move";
    } catch {
      /* mocked dataTransfer in tests */
    }
  };

  const onHeaderDragOver = (key: ColumnKey) => (e: React.DragEvent) => {
    if (dragKey.current == null) return;
    e.preventDefault();
    if (dragOverKey !== key) setDragOverKey(key);
  };

  const onHeaderDrop = (key: ColumnKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragKey.current;
    dragKey.current = null;
    setDragOverKey(null);
    if (from == null || from === key) return;
    setLayout((prev) => {
      const order = prev.order.filter((k) => k !== from);
      const targetIdx = order.indexOf(key);
      order.splice(targetIdx, 0, from);
      return { ...prev, order };
    });
  };

  const onHeaderDragEnd = () => {
    dragKey.current = null;
    setDragOverKey(null);
  };

  const toggleColumn = (key: ColumnKey) => {
    setLayout((prev) => {
      const hidden = prev.hidden.includes(key)
        ? prev.hidden.filter((k) => k !== key)
        : // Never let the owner hide the last visible column.
          prev.order.filter((k) => !prev.hidden.includes(k)).length > 1
          ? [...prev.hidden, key]
          : prev.hidden;
      return { ...prev, hidden };
    });
  };

  const resetLayout = () => setLayout({ order: [...DEFAULT_ORDER], hidden: [] });

  return (
    <div>
      {/* Column controls */}
      <div className="flex items-center justify-end px-5 py-2 border-b border-border relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text px-2.5 py-1 rounded-md border border-border bg-surface hover:bg-surface-muted transition-colors"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M3 6h18M7 12h10M11 18h2" strokeLinecap="round" />
          </svg>
          Columns
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-5 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface-raised shadow-lg p-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-text-subtle px-2 py-1">
                Show columns
              </p>
              {layout.order.map((key) => {
                const checked = !layout.hidden.includes(key);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-muted cursor-pointer text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(key)}
                      className="accent-[color:var(--accent)]"
                    />
                    {COLUMNS[key].label}
                  </label>
                );
              })}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  type="button"
                  onClick={resetLayout}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-muted text-xs text-text-muted"
                >
                  Reset to default
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {/* expand affordance column */}
              <th className="w-8 py-3 pl-5" aria-hidden="true" />
              {visibleColumns.map((key) => {
                const def = COLUMNS[key];
                const active = sort?.key === key;
                return (
                  <th
                    key={key}
                    scope="col"
                    draggable
                    onDragStart={onHeaderDragStart(key)}
                    onDragOver={onHeaderDragOver(key)}
                    onDrop={onHeaderDrop(key)}
                    onDragEnd={onHeaderDragEnd}
                    aria-sort={
                      active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"
                    }
                    className={cn(
                      "py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider select-none cursor-move",
                      def.alignRight && "text-right",
                      dragOverKey === key && "bg-accent-soft/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-text transition-colors",
                        def.alignRight && "flex-row-reverse",
                        active && "text-text",
                      )}
                      title="Click to sort · drag header to reorder"
                    >
                      {def.label}
                      <span className="text-[8px] leading-none w-2 inline-block">
                        {active ? (sort?.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sortedClaims.map((claim) => {
              const isDenied = claim.status === "denied";
              const isOpen = expanded === claim.id;
              return (
                <React.Fragment key={claim.id}>
                  <tr
                    className={cn(
                      "transition-colors",
                      isDenied ? "cursor-pointer hover:bg-surface-muted/40" : "hover:bg-surface-muted/40",
                      isOpen && "bg-surface-muted/40",
                    )}
                    onClick={isDenied ? () => setExpanded(isOpen ? null : claim.id) : undefined}
                  >
                    <td className="w-8 py-3 pl-5 align-top">
                      {isDenied && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Collapse denial detail" : "Expand denial detail"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(isOpen ? null : claim.id);
                          }}
                          className="text-text-subtle hover:text-text transition-transform"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden="true"
                            className={cn("transition-transform", isOpen && "rotate-90")}
                          >
                            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </td>
                    {visibleColumns.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          "py-3 px-5 align-top",
                          COLUMNS[key].alignRight && "text-right",
                        )}
                      >
                        {renderCell(claim, key)}
                      </td>
                    ))}
                  </tr>
                  {isDenied && isOpen && (
                    <tr className="bg-surface-muted/30">
                      <td colSpan={visibleColumns.length + 1} className="px-5 pb-5 pt-1">
                        <DenialDetail claim={claim} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Denial detail panel

function DenialDetail({ claim }: { claim: SerializedClaim }) {
  const timeline = React.useMemo(() => buildTimeline(claim), [claim]);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {/* Summary facts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Fact label="Denied on" value={formatDate(claim.deniedAt)} />
        <Fact label="Payer" value={claim.payerName ?? "—"} />
        <Fact label="Billed" value={formatMoney(claim.billedAmountCents)} />
        <Fact
          label="Paid / Patient resp."
          value={`${formatMoney(claim.paidAmountCents)} / ${formatMoney(claim.patientRespCents)}`}
        />
      </div>

      {claim.denialReason && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-danger/70 mb-0.5">
            Denial reason
          </p>
          <p className="text-sm text-danger leading-snug">{claim.denialReason}</p>
        </div>
      )}

      {/* Audit / history trail */}
      <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-3">
        Denial history &amp; audit trail
      </p>
      {timeline.length === 0 ? (
        <p className="text-xs text-text-subtle italic">
          No recorded events for this denial yet.
        </p>
      ) : (
        <ol className="relative pl-5">
          <span
            className="absolute left-[5px] top-1 bottom-1 w-px bg-border"
            aria-hidden="true"
          />
          {timeline.map((entry) => (
            <li key={entry.id} className="relative pb-4 last:pb-0">
              <span
                className={cn(
                  "absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-surface",
                  TIMELINE_DOT[entry.tone],
                )}
                aria-hidden="true"
              />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-text">{entry.title}</p>
                <span className="text-[11px] text-text-subtle tabular-nums whitespace-nowrap">
                  {formatDate(entry.date)}
                </span>
              </div>
              {entry.detail && (
                <p className="text-xs text-text-muted mt-0.5 leading-snug">
                  {entry.detail}
                </p>
              )}
              {entry.audience && (
                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider text-text-subtle">
                  {entry.audience === "patient"
                    ? "What the patient received"
                    : "What the provider received"}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* EMR-980 — Take action on this denied claim */}
      <DenialActionForm
        claimId={claim.id}
        patientName={`${claim.patient.firstName} ${claim.patient.lastName}`}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-0.5">
        {label}
      </p>
      <p className="text-sm text-text tabular-nums">{value}</p>
    </div>
  );
}
