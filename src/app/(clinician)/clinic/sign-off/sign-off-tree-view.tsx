"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export type SignOffRow = {
  id: string;
  kind: "lab" | "refill" | "note" | "message";
  title: string;
  patientName: string;
  patientId: string;
  receivedAt: string; // ISO string — Date is not serialisable across the server→client boundary
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

const KIND_TONE: Record<SignOffRow["kind"], string> = {
  lab: "bg-[color:var(--info-soft)] text-[color:var(--info)]",
  refill: "bg-success/10 text-success",
  note: "bg-highlight-soft text-[color:var(--highlight-hover)]",
  message: "bg-accent-soft text-accent",
};

const KIND_ORDER: SignOffRow["kind"][] = ["lab", "refill", "note", "message"];

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function SignOffTreeView({ rows }: { rows: SignOffRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<SignOffRow["kind"]>>(new Set());

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: rows.filter((r) => r.kind === kind),
    urgentCount: rows.filter((r) => r.kind === kind && r.urgency === "high").length,
  })).filter((g) => g.items.length > 0);

  const toggleCollapse = (kind: SignOffRow["kind"]) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Tree (left) */}
      <div className="w-72 shrink-0 border-r border-border overflow-y-auto bg-surface">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.kind);
          return (
            <div key={group.kind}>
              <button
                type="button"
                onClick={() => toggleCollapse(group.kind)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-muted/40 border-b border-border/60 hover:bg-surface-muted transition-colors sticky top-0 z-10"
                aria-expanded={!isCollapsed}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-subtle">
                  {group.urgentCount > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
                  )}
                  {group.label}
                </span>
                <span className="flex items-center gap-2">
                  {group.urgentCount > 0 && (
                    <Badge tone="danger" className="text-[9px] px-1 py-0">
                      {group.urgentCount}
                    </Badge>
                  )}
                  <span className="text-[10px] text-text-subtle select-none">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                </span>
              </button>

              {!isCollapsed && (
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 border-b border-border/40 transition-colors",
                          selectedId === item.id
                            ? "bg-accent/10"
                            : "hover:bg-surface-muted/60"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {item.urgency === "high" && (
                            <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text truncate leading-snug">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-text-subtle mt-0.5">
                              {item.patientName} · {formatRelative(item.receivedAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-sm font-medium text-text">Queue clear</p>
            <p className="text-[12px] text-text-subtle mt-1">Nothing waiting on a signature</p>
          </div>
        )}
      </div>

      {/* Detail panel (right) */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selected ? (
          <SignOffDetail row={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-subtle">
            <p className="text-sm">Select an item from the tree to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SignOffDetail({ row }: { row: SignOffRow }) {
  return (
    <div className="p-6 max-w-lg">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center justify-center text-[10px] font-medium uppercase tracking-wider rounded-md px-2 py-1",
            KIND_TONE[row.kind]
          )}
        >
          {KIND_LABEL[row.kind].replace(/s$/, "")}
        </span>
        {row.urgency === "high" && (
          <Badge tone="danger" className="text-[10px]">Urgent</Badge>
        )}
      </div>

      <h2 className="font-display text-xl text-text tracking-tight leading-snug mb-1">
        {row.title}
      </h2>
      <p className="text-sm text-text-muted mb-1">{row.patientName}</p>
      <p className="text-[12px] text-text-subtle mb-4">{formatRelative(row.receivedAt)}</p>

      <div className="rounded-xl bg-surface-muted/60 border border-border/60 px-4 py-3 text-sm text-text mb-6">
        {row.hint}
      </div>

      <Link
        href={row.href}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
      >
        Open full review →
      </Link>
    </div>
  );
}
