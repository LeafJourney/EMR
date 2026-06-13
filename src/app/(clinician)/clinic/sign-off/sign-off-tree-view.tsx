"use client";

import { useState } from "react";
import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  MessageSquare,
  Pill,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SplitPane } from "@/components/ui/split-pane";
import { cn } from "@/lib/utils/cn";
import { PatientHoverCard } from "@/components/preview";

export type SignOffRow = {
  id: string;
  kind: "lab" | "refill" | "note" | "message";
  title: string;
  patientName: string;
  patientId: string;
  receivedAt: string; // ISO — Date is not serialisable across the server→client boundary
  urgency: "high" | "normal" | "low";
  hint: string;
  href: string;
};

const KIND_LABEL: Record<SignOffRow["kind"], string> = {
  lab: "Labs",
  refill: "Refills",
  note: "Clinical Notes",
  message: "Messages",
};

const KIND_ICON: Record<SignOffRow["kind"], LucideIcon> = {
  lab: FlaskConical,
  refill: Pill,
  note: FileText,
  message: MessageSquare,
};

const KIND_TONE: Record<SignOffRow["kind"], string> = {
  lab: "bg-blue-50 text-info border-blue-200",
  refill: "bg-emerald-50 text-success border-emerald-200",
  note: "bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/25",
  message: "bg-accent-soft text-accent border-accent/20",
};

const KIND_ICON_COLOR: Record<SignOffRow["kind"], string> = {
  lab: "text-info",
  refill: "text-success",
  note: "text-[color:var(--highlight-hover)]",
  message: "text-accent",
};

// Left accent bar color per kind — appears on selected / hovered tree items.
const KIND_BAR: Record<SignOffRow["kind"], string> = {
  lab: "bg-info",
  refill: "bg-success",
  note: "bg-[color:var(--highlight-hover)]",
  message: "bg-accent",
};

const KIND_ORDER: SignOffRow["kind"][] = ["lab", "refill", "note", "message"];

type FilterMode = "all" | "urgent" | "today";

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function PatientInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2);
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent uppercase">
      {initials}
    </span>
  );
}

function TreeItem({
  item,
  selected,
  onSelect,
}: {
  item: SignOffRow;
  selected: boolean;
  onSelect: () => void;
  key?: string; // workaround: TS env lacks React.JSX.IntrinsicAttributes so `key` leaks into props check
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group w-full text-left border-b border-border/30 transition-colors flex items-stretch relative",
          selected ? "bg-accent/10" : "hover:bg-surface-muted/60"
        )}
      >
        {/* Left kind-accent bar */}
        <span
          className={cn(
            "w-[3px] shrink-0 rounded-r-full transition-opacity",
            KIND_BAR[item.kind],
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          )}
          aria-hidden
        />

        <div className="flex items-start gap-2.5 px-3 py-2.5 min-w-0 flex-1">
          <Icon
            className={cn("mt-[3px] h-3.5 w-3.5 shrink-0", KIND_ICON_COLOR[item.kind])}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {item.urgency === "high" && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-danger shrink-0"
                  aria-label="urgent"
                />
              )}
              <p className="text-[13px] font-medium text-text truncate leading-snug">
                {item.title}
              </p>
            </div>
            <p className="text-[11px] text-text-subtle mt-0.5 truncate">
              {item.patientName} · {formatRelative(item.receivedAt)}
            </p>
            {item.hint && (
              <p className="text-[11px] text-text-subtle/70 mt-0.5 truncate italic">
                {item.hint}
              </p>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function SectionHeader({
  label,
  groupKey,
  urgentCount,
  itemCount,
  icon: Icon,
  isCollapsed,
  onToggle,
}: {
  label: string;
  groupKey: string;
  urgentCount?: number;
  itemCount: number;
  icon?: LucideIcon;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-surface-muted/40 border-b border-border/60 hover:bg-surface-muted transition-colors sticky top-0 z-10"
      aria-expanded={!isCollapsed}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-subtle">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {(urgentCount ?? 0) > 0 && (
          <span className="h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
        )}
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] text-text-subtle tabular-nums">{itemCount}</span>
        <Chevron className="h-3 w-3 text-text-subtle" />
      </span>
    </button>
  );
}

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterMode;
  onChange: (m: FilterMode) => void;
  counts: Record<FilterMode, number>;
}) {
  const tabs: { key: FilterMode; label: string }[] = [
    { key: "all", label: "All" },
    { key: "urgent", label: "Urgent" },
    { key: "today", label: "Today" },
  ];
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/60 bg-surface">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
            active === key
              ? "bg-accent/15 text-accent"
              : "text-text-subtle hover:text-text hover:bg-surface-muted"
          )}
        >
          {label}
          {counts[key] > 0 && (
            <span
              className={cn(
                "tabular-nums text-[10px] min-w-[14px] text-center",
                key === "urgent" && counts[key] > 0 ? "text-danger" : ""
              )}
            >
              {counts[key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SignOffTreeView({ rows }: { rows: SignOffRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterMode>("all");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Filter rows for the tree display
  const visibleRows = rows.filter((r) => {
    if (filter === "urgent") return r.urgency === "high";
    if (filter === "today") return isToday(r.receivedAt);
    return true;
  });

  const urgentItems = visibleRows.filter((r) => r.urgency === "high");

  // Kind groups only include non-urgent items so items appear exactly once.
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: visibleRows.filter((r) => r.kind === kind && r.urgency !== "high"),
    urgentCount: visibleRows.filter((r) => r.kind === kind && r.urgency === "high").length,
  })).filter((g) => g.items.length > 0);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev: Set<string>) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filterCounts: Record<FilterMode, number> = {
    all: rows.length,
    urgent: rows.filter((r) => r.urgency === "high").length,
    today: rows.filter((r) => isToday(r.receivedAt)).length,
  };

  const handleSelect = (id: string) => {
    setSelectedId((prev: string | null) => (prev === id ? null : id));
  };

  return (
    <SplitPane
      orientation="horizontal"
      defaultSize={300}
      minSize={220}
      maxSize={520}
      storageKey="sign-off-tree"
      ariaLabel="Resize sign-off queue"
    >
      {/* Tree panel */}
      <div className="h-full overflow-hidden bg-surface border-r border-border flex flex-col">
        {/* Sticky panel header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-2.5 bg-surface border-b border-border/60">
          <span className="text-[13px] font-semibold text-text">Sign-Off Queue</span>
          <div className="flex items-center gap-1.5">
            {urgentItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-danger rounded-full px-1.5 py-0.5 tabular-nums">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                {urgentItems.length}
              </span>
            )}
            <span className="text-[11px] text-text-subtle tabular-nums">
              {visibleRows.length} pending
            </span>
          </div>
        </div>

        {/* Filter tabs */}
        <FilterTabs active={filter} onChange={setFilter} counts={filterCounts} />

        {/* Tree content */}
        <div className="flex-1 overflow-y-auto">
          {/* Urgent group — only when urgent items exist */}
          {urgentItems.length > 0 && (
            <div>
              <SectionHeader
                label="Urgent"
                groupKey="urgent"
                urgentCount={urgentItems.length}
                itemCount={urgentItems.length}
                icon={AlertTriangle}
                isCollapsed={collapsed.has("urgent")}
                onToggle={() => toggleCollapse("urgent")}
              />
              {!collapsed.has("urgent") && (
                <ul>
                  {urgentItems.map((item) => (
                    <TreeItem
                      key={`urgent-${item.id}`}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={() => handleSelect(item.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Kind groups (non-urgent items only) */}
          {groups.map((group) => {
            const Icon = KIND_ICON[group.kind];
            return (
              <div key={group.kind}>
                <SectionHeader
                  label={group.label}
                  groupKey={group.kind}
                  urgentCount={group.urgentCount}
                  itemCount={group.items.length}
                  icon={Icon}
                  isCollapsed={collapsed.has(group.kind)}
                  onToggle={() => toggleCollapse(group.kind)}
                />
                {!collapsed.has(group.kind) && (
                  <ul>
                    {group.items.map((item) => (
                      <TreeItem
                        key={item.id}
                        item={item}
                        selected={selectedId === item.id}
                        onSelect={() => handleSelect(item.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {visibleRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              {filter === "all" ? (
                <>
                  <span className="text-3xl mb-3">✅</span>
                  <p className="text-sm font-medium text-text">Queue clear</p>
                  <p className="text-[12px] text-text-subtle mt-1">
                    Nothing waiting on a signature
                  </p>
                </>
              ) : (
                <>
                  <span className="text-3xl mb-3">🔍</span>
                  <p className="text-sm font-medium text-text">No items match</p>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="text-[12px] text-accent mt-2 hover:underline"
                  >
                    Show all items
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="h-full overflow-y-auto bg-surface-raised">
        {selected ? (
          <SignOffDetail row={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-subtle">
            <span className="text-2xl opacity-40">←</span>
            <p className="text-sm">Select an item to preview</p>
          </div>
        )}
      </div>
    </SplitPane>
  );
}

function SignOffDetail({ row }: { row: SignOffRow }) {
  const Icon = KIND_ICON[row.kind];
  return (
    <div className="p-6 max-w-xl">
      {/* Patient header */}
      <div className="flex items-center gap-3 mb-5">
        <PatientInitials name={row.patientName} />
        <PatientHoverCard patientId={row.patientId}>
          <div className="cursor-default">
            <p className="text-[13px] font-semibold text-text leading-snug">{row.patientName}</p>
            <p className="text-[11px] text-text-subtle">{formatRelative(row.receivedAt)}</p>
          </div>
        </PatientHoverCard>
      </div>

      {/* Kind + urgency pills */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider rounded-full px-2.5 py-1 border",
            KIND_TONE[row.kind]
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {KIND_LABEL[row.kind].replace(/s$/, "")}
        </span>
        {row.urgency === "high" && (
          <Badge tone="danger" className="text-[10px]">
            Urgent
          </Badge>
        )}
      </div>

      {/* Title */}
      <h2 className="font-display text-xl text-text tracking-tight leading-snug mb-4">
        {row.title}
      </h2>

      {/* Hint card */}
      <div className="rounded-xl bg-surface border border-border px-4 py-3 text-sm text-text mb-6">
        {row.hint}
      </div>

      {/* CTA */}
      <Link
        href={row.href}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
      >
        Open full review →
      </Link>
    </div>
  );
}
