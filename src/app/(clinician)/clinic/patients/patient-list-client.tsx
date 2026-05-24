"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { listStagger, listStaggerChild } from "@/lib/ui/motion";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MetricTile } from "@/components/ui/metric-tile";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PatientsEmptyIllustration,
  ResearchEmptyIllustration,
} from "@/components/ui/empty-illustrations";
import { Button } from "@/components/ui/button";
import { patientMatchesQuery } from "@/lib/search/patient-search";
import { UniversalPatientSearch } from "@/components/clinic/UniversalPatientSearch";
import { BulkActionBar, useBulkSelection } from "@/components/ui/bulk-action-bar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  bulkArchivePatientsAction,
  bulkExportPatientsAction,
} from "./bulk-actions";
import {
  useContextMenu,
  ContextMenuIcons,
  ContextMenuHint,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  dob: string | null;
  phone: string | null;
  presentingConcerns: string | null;
  completenessScore: number | null;
  updatedAt: string;
  lastVisit: string | null;
  painTrend: number[];
}

interface StatusCounts {
  all: number;
  prospect: number;
}

interface Props {
  patients: PatientRow[];
  statusCounts: StatusCounts;
  avgReadiness: number;
  initialSearch?: string;
}

/* ------------------------------------------------------------------ */
/*  Power filter chips (EMR-clinician power-tools)                     */
/* ------------------------------------------------------------------ */

// EMR-684: "active" used to be a chip; it was dropped along with the
// active/inactive segmented toggle. Keep the union minimal.
type PowerFilter = "all" | "new" | "vip" | "high-risk";

const POWER_FILTERS: { key: PowerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New (30d)" },
  { key: "vip", label: "VIP" },
  { key: "high-risk", label: "High-risk" },
];

interface SavedView {
  name: string;
  powerFilter: PowerFilter;
  search: string;
  savedAt: string;
}

const SAVED_VIEWS_KEY = "patient-list-saved-views";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusTone(status: string): "success" | "warning" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "prospect":
      return "warning";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "prospect":
      return "In Intake";
    case "inactive":
      return "Inactive";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Mini sparkline (SVG)                                               */
/* ------------------------------------------------------------------ */

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;

  const width = 64;
  const height = 24;
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * innerW;
    const y = padding + innerH - ((v - min) / range) * innerH;
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");

  // Determine trend color: compare last vs first
  const trending = data[data.length - 1] <= data[0]; // lower pain = good
  const strokeColor = trending ? "var(--success)" : "var(--warning)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d={pathD}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Last point dot */}
      <circle
        cx={parseFloat(points[points.length - 1].split(",")[0])}
        cy={parseFloat(points[points.length - 1].split(",")[1])}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Search icon                                                        */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="text-text-subtle"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Chevron icon                                                       */
/* ------------------------------------------------------------------ */

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="text-text-subtle"
      aria-hidden="true"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Patient row — wraps the existing <Link> in a right-click menu so   */
/*  every roster row gets Monday/Linear-tier quick actions without     */
/*  having to chase the kebab.                                         */
/* ------------------------------------------------------------------ */

function PatientRosterRow({
  patient,
  children,
}: {
  patient: PatientRow;
  children: ReactNode;
}) {
  const router = useRouter();
  const items: ContextMenuItem[] = [
    {
      label: "Open chart",
      icon: ContextMenuIcons.Open,
      onSelect: (c) => {
        router.push(`/clinic/patients/${patient.id}`);
        c();
      },
      kbd: "↵",
    },
    {
      label: "Compose message",
      icon: ContextMenuIcons.Message,
      onSelect: (c) => {
        router.push(`/clinic/messages?compose=1&patient=${patient.id}`);
        c();
      },
    },
    {
      label: "Schedule visit",
      icon: ContextMenuIcons.Calendar,
      onSelect: (c) => {
        router.push(`/clinic/schedule?patient=${patient.id}`);
        c();
      },
    },
    { divider: true, label: "" },
    {
      label: "Copy patient ID",
      icon: ContextMenuIcons.Copy,
      onSelect: (c) => {
        try {
          void navigator.clipboard?.writeText(patient.id);
        } catch {
          /* ignore */
        }
        c();
      },
      kbd: "⌘ C",
    },
    { divider: true, label: "" },
    {
      label: "Archive patient",
      icon: ContextMenuIcons.Archive,
      danger: true,
      onSelect: (c) => {
        if (
          typeof window !== "undefined" &&
          window.confirm(
            `Archive ${patient.firstName} ${patient.lastName}? They will be hidden from the roster but their chart will be preserved.`,
          )
        ) {
          // Mutation hook to be wired into the existing actions.ts —
          // for now we simply navigate to the chart so the clinician
          // can complete archival from the canonical surface.
          router.push(`/clinic/patients/${patient.id}?archive=1`);
        }
        c();
      },
    },
  ];
  const ctx = useContextMenu(() => items);
  return (
    <div
      onContextMenu={ctx.triggerProps.onContextMenu}
      onTouchStart={ctx.triggerProps.onTouchStart}
      onTouchEnd={ctx.triggerProps.onTouchEnd}
      onTouchMove={ctx.triggerProps.onTouchMove}
    >
      {children}
      {ctx.menu}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main client component                                              */
/* ------------------------------------------------------------------ */

export function PatientListClient({
  patients,
  statusCounts,
  avgReadiness,
  initialSearch = "",
}: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [powerFilter, setPowerFilter] = useState<PowerFilter>("all");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  // Shared motion: stagger the roster fan-in. No-op under reduced motion.
  const reduceMotion = useReducedMotion() ?? false;
  const listStaggerProps = useMemo(() => listStagger(reduceMotion), [reduceMotion]);
  const childVariants = useMemo(() => listStaggerChild(reduceMotion), [reduceMotion]);

  // Bulk selection state — drives both the in-row checkboxes and the
  // BulkActionBar that slides up from the bottom when count >= 1.
  const selection = useBulkSelection<string>();
  const { toast } = useToast();
  // Last-clicked row id, used for Shift+Click range selection.
  const lastClickedRef = useRef<string | null>(null);
  // Confirm-dialog state for the destructive bulk-archive flow.
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archivePending, setArchivePending] = useState(false);

  /* Hydrate saved views from localStorage -------------------------- */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) setSavedViews(JSON.parse(raw) as SavedView[]);
    } catch {
      /* ignore parse errors */
    }
  }, []);

  /* Power filter predicate ----------------------------------------- */
  const matchesPowerFilter = (p: PatientRow): boolean => {
    if (powerFilter === "all") return true;
    if (powerFilter === "new") {
      const created = new Date(p.updatedAt).getTime();
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return created >= thirtyDaysAgo;
    }
    if (powerFilter === "vip") {
      // Read VIP tag from localStorage
      try {
        const tags = window.localStorage.getItem(`patient-tags-${p.id}`);
        return tags ? tags.includes("t-vip") : false;
      } catch {
        return false;
      }
    }
    if (powerFilter === "high-risk") {
      // Pain trending upward = high risk
      if (p.painTrend.length >= 2) {
        return p.painTrend[p.painTrend.length - 1] > p.painTrend[0];
      }
      return false;
    }
    return true;
  };

  /* Filter + search ------------------------------------------------ */
  const filtered = useMemo(() => {
    let list = patients;

    // Power filter
    list = list.filter(matchesPowerFilter);

    // Partial-match search (name / DOB / phone) — see EMR-599.
    if (search.trim()) {
      list = list.filter((p) => patientMatchesQuery(p, search));
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, search, powerFilter]);

  /* Visible row IDs for ⌘/Ctrl+A select-all + Shift+Click range select. */
  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);

  /* ⌘/Ctrl+A — select every currently-visible patient. Ignored when the
     user is typing in an input so the shortcut never hijacks ordinary
     text editing in the search field. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selection.setAllVisible(visibleIds);
      } else if (e.key === "Escape" && selection.size > 0) {
        selection.clear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleIds, selection]);

  /* Row click — Shift extends range, plain click toggles a single row.
     Returns true when the row click was "consumed" by selection logic
     (i.e. the Shift was held) so the calling anchor can decide whether
     to follow its href. We deliberately only intercept Shift+Click; a
     normal click still navigates into the chart. */
  const handleRowToggle = useCallback(
    (id: string, opts?: { shift?: boolean }) => {
      if (opts?.shift) {
        selection.selectRange(visibleIds, lastClickedRef.current, id);
      } else {
        selection.toggle(id);
      }
      lastClickedRef.current = id;
    },
    [selection, visibleIds],
  );

  /* Bulk Export — runs immediately, builds CSV in the browser. */
  const handleBulkExport = useCallback(async () => {
    const ids = selection.asArray;
    if (!ids.length) return;
    const res = await bulkExportPatientsAction({ patientIds: ids });
    if (!res.ok) {
      toast({
        title: "Export failed",
        description: res.error,
        variant: "error",
      });
      return;
    }
    // Tiny inline CSV builder — escape quotes/commas, header row first.
    const header = [
      "id",
      "firstName",
      "lastName",
      "dob",
      "email",
      "phone",
      "status",
      "lastVisit",
    ];
    const escape = (v: string | null) =>
      v == null
        ? ""
        : /[",\n]/.test(v)
          ? `"${v.replace(/"/g, '""')}"`
          : v;
    const lines = [header.join(",")];
    for (const r of res.rows) {
      lines.push(
        [
          r.id,
          r.firstName,
          r.lastName,
          r.dob,
          r.email,
          r.phone,
          r.status,
          r.lastVisit,
        ]
          .map((x) => escape(x as string | null))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: `Exported ${res.rows.length} patient${res.rows.length === 1 ? "" : "s"}`,
      variant: "success",
    });
  }, [selection.asArray, toast]);

  /* Bulk Archive — destructive; gated behind the confirm dialog. */
  const handleBulkArchive = useCallback(async () => {
    const ids = selection.asArray;
    if (!ids.length) return;
    setArchivePending(true);
    const res = await bulkArchivePatientsAction({ patientIds: ids });
    setArchivePending(false);
    setArchiveConfirmOpen(false);
    if (!res.ok) {
      toast({
        title: "Archive failed",
        description: res.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: `Archived ${res.count} patient${res.count === 1 ? "" : "s"}`,
      variant: "success",
    });
    selection.clear();
  }, [selection, toast]);

  /* Bulk Tag / Broadcast — placeholders that toast the not-yet-wired
     server actions. The bar is wired so the second the server lands
     these stop being stubs and start being live. */
  const handleBulkBroadcast = useCallback(() => {
    toast({
      title: "Compose a broadcast",
      description: `Selected ${selection.size} recipient${
        selection.size === 1 ? "" : "s"
      }. Continue in the broadcast composer (EMR-707).`,
      variant: "info",
    });
  }, [selection.size, toast]);

  const handleBulkTag = useCallback(() => {
    toast({
      title: "Tag",
      description: "Server-side patient tags ship in EMR-684. For now, tag from each patient's chart.",
      variant: "info",
    });
  }, [toast]);

  /* Save/load views ------------------------------------------------ */
  function handleSaveView() {
    const name = window.prompt("Name this view (e.g. 'My VIPs')");
    if (!name?.trim()) return;
    const view: SavedView = {
      name: name.trim(),
      powerFilter,
      search,
      savedAt: new Date().toISOString(),
    };
    const next = [...savedViews.filter((v) => v.name !== view.name), view];
    setSavedViews(next);
    try {
      window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  function applySavedView(view: SavedView) {
    setPowerFilter(view.powerFilter);
    setSearch(view.search);
  }

  function removeSavedView(name: string) {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    try {
      window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-6">
      {/* Summary metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricTile
          label="Total Patients"
          value={statusCounts.all}
          accent="none"
        />
        <MetricTile
          label="In Intake"
          value={statusCounts.prospect}
          accent="amber"
          hint="Prospects"
        />
        <MetricTile
          label="Avg Readiness"
          value={`${avgReadiness}%`}
          accent="forest"
          hint="Chart completeness"
        />
      </div>

      {/* Power filter chips + saved views */}
      <div className="flex items-center gap-2 flex-wrap">
        {POWER_FILTERS.map((f) => {
          const isActive = powerFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setPowerFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors duration-200 ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-surface-raised text-text-muted border-border hover:bg-surface-muted hover:border-border-strong"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleSaveView}>
            Save this view
          </Button>
        </div>
      </div>

      {savedViews.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium">
            Saved views
          </span>
          {savedViews.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 text-xs font-medium rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              <button
                onClick={() => applySavedView(v)}
                className="hover:underline"
                title={`Apply: ${v.powerFilter}${v.search ? ` · "${v.search}"` : ""}`}
              >
                {v.name}
              </button>
              <button
                onClick={() => removeSavedView(v.name)}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-700/70 hover:bg-emerald-200 hover:text-emerald-900"
                aria-label={`Remove ${v.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Patient list card */}
      <Card tone="raised" className="overflow-hidden">
        {/* Search bar */}
        <div className="px-5 pt-5 pb-4">
          <UniversalPatientSearch
            className="w-full max-w-md"
            onQueryChange={setSearch}
            value={search}
          />
        </div>

        {/* Patient rows */}
        <CardContent className="px-0 pb-0">
          {patients.length === 0 ? (
            <div className="px-5 pb-6">
              <EmptyState
                illustration={<PatientsEmptyIllustration />}
                title="Add your first patient"
                description="Your roster lives here. Once you add a patient their charts, messages, and visits all roll up into a single timeline."
                primaryAction={
                  <Link href="/clinic/patients/new">
                    <Button size="sm">Add patient</Button>
                  </Link>
                }
                secondaryAction={
                  <Link href="/clinic/patients/import">
                    <Button size="sm" variant="ghost">
                      Import from CSV
                    </Button>
                  </Link>
                }
                tips={[
                  "Bulk import existing patients from a CSV export",
                  "Front desk can intake new patients without touching the chart",
                  "Every new patient gets an auto-generated portal invite",
                ]}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 pb-6">
              <EmptyState
                illustration={<ResearchEmptyIllustration />}
                title="No matches for that search"
                description="We couldn't find anyone in your roster matching this query. Try a shorter search term, or clear your filter chips."
                secondaryAction={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setPowerFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <ContextMenuHint>
            <motion.ul
              className="divide-y divide-border/60"
              // Replay stagger when the active filter/search changes.
              key={`roster-${powerFilter}-${search}`}
              {...listStaggerProps}
            >
              {filtered.map((p) => {
                const isSelected = selection.has(p.id);
                return (
                <motion.li key={p.id} variants={childVariants}>
                  <PatientRosterRow patient={p}>
                  <Link
                    href={`/clinic/patients/${p.id}`}
                    onClick={(e) => {
                      // Shift+Click = range-select; intercept navigation.
                      // Plain click still navigates into the chart.
                      if (e.shiftKey) {
                        e.preventDefault();
                        handleRowToggle(p.id, { shift: true });
                      }
                    }}
                    className={`card-hover flex items-center gap-4 px-5 py-4 transition-colors duration-150 group ${
                      isSelected
                        ? "bg-accent-soft/40"
                        : "hover:bg-surface-muted/50"
                    }`}
                  >
                    {/* Bulk-select checkbox — clicking the box never
                        navigates. Shown on hover when nothing is selected
                        and always when the row is selected, mirroring the
                        Gmail/Linear roster pattern. */}
                    <label
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className={`shrink-0 inline-flex items-center justify-center h-5 w-5 -ml-1 ${
                        isSelected || selection.size > 0
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 transition-opacity"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleRowToggle(p.id, {
                            shift: (e.nativeEvent as MouseEvent | undefined)
                              ?.shiftKey,
                          });
                        }}
                        aria-label={`Select ${p.firstName} ${p.lastName}`}
                        className="h-4 w-4 rounded border-border-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                    </label>
                    {/* Avatar */}
                    <Avatar
                      firstName={p.firstName}
                      lastName={p.lastName}
                      size="md"
                    />

                    {/* Center info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-base font-medium text-text leading-tight">
                        {p.firstName} {p.lastName}
                      </p>
                      {p.presentingConcerns && (
                        <p className="text-xs text-text-muted mt-0.5 truncate max-w-md">
                          {p.presentingConcerns}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge tone={statusTone(p.status)}>
                          {statusLabel(p.status)}
                        </Badge>
                        {p.completenessScore !== null && (
                          <Badge tone="accent">
                            Chart {p.completenessScore}%
                          </Badge>
                        )}
                        {p.lastVisit && (
                          <Badge tone="neutral">
                            Last visit {formatShortDate(p.lastVisit)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Sparkline + chevron */}
                    <div className="hidden md:flex items-center gap-3 shrink-0">
                      {p.painTrend.length >= 2 && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-text-subtle uppercase tracking-wider mb-0.5">
                            Pain
                          </span>
                          <Sparkline data={p.painTrend} />
                        </div>
                      )}
                      <ChevronRight />
                    </div>

                    {/* Mobile chevron */}
                    <div className="md:hidden shrink-0">
                      <ChevronRight />
                    </div>
                  </Link>
                  </PatientRosterRow>
                </motion.li>
                );
              })}
            </motion.ul>
            </ContextMenuHint>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar — slides up when any patient is selected. */}
      <BulkActionBar
        count={selection.size}
        onClear={selection.clear}
        itemNoun="patient"
        ariaLabel="Patient bulk actions"
        actions={[
          {
            key: "broadcast",
            label: "Send broadcast",
            onClick: handleBulkBroadcast,
          },
          {
            key: "tag",
            label: "Tag",
            onClick: handleBulkTag,
          },
          {
            key: "export",
            label: "Export to CSV",
            onClick: handleBulkExport,
          },
          {
            key: "archive",
            label: "Archive",
            onClick: () => setArchiveConfirmOpen(true),
            isDestructive: true,
            isPending: archivePending,
          },
        ]}
      />

      {/* Confirm dialog — destructive bulk archive. */}
      <Dialog
        open={archiveConfirmOpen}
        onOpenChange={(next) => {
          if (!archivePending) setArchiveConfirmOpen(next);
        }}
      >
        <DialogContent className="max-w-md p-6">
          <DialogTitle className="font-display text-lg font-semibold text-text">
            Archive {selection.size} patient
            {selection.size === 1 ? "" : "s"}?
          </DialogTitle>
          <p className="mt-2 text-sm text-text-muted">
            Archived patients are hidden from your roster and any active
            workflows. Their charts remain accessible to super-admins for
            audit purposes. This can be undone individually from the chart.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setArchiveConfirmOpen(false)}
              disabled={archivePending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkArchive}
              disabled={archivePending}
            >
              {archivePending ? "Archiving…" : "Archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
