"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Collapsible statement tiles (Dr. Patel directive — Statement History).
// Collapsed: statement name, date, and amount due. Expanded: the rest
// (status detail line, delivery method, invoice link, Cindy summary).
// Money/dates are pre-formatted server-side so this client component never
// imports the billing/prisma layer (mirrors the EventLog pattern).
export interface StatementTileItem {
  id: string;
  /** Statement number, e.g. "STMT-2026-001". */
  statementNumber: string;
  /** Pre-formatted statement date line, e.g. "Due May 9, 2026". */
  dateLabel: string;
  /** Pre-formatted amount due, e.g. "$120.00". */
  amountLabel: string;
  /** Raw status string for the badge text. */
  status: string;
  /** Badge tone resolved server-side. */
  statusTone: "success" | "danger" | "accent" | "warning";
  /** Expanded-only detail line (sent/viewed/due timing). */
  detailLine: string;
  /** Delivery channel label (email / mail / etc.). */
  deliveryMethod: string;
  /** Deep link to the rendered invoice. */
  invoiceHref: string;
  /** Optional plain-language ("Cindy says") summary. */
  plainLanguageSummary: string | null;
}

export function StatementHistory({ statements }: { statements: StatementTileItem[] }) {
  return (
    <div className="space-y-2">
      {statements.map((statement) => (
        <StatementTile key={statement.id} statement={statement} />
      ))}
    </div>
  );
}

function StatementTile({ statement }: { statement: StatementTileItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card tone="raised">
      <CardContent className="py-4">
        {/* Collapsed header — statement name, date, amount due. The whole
            row toggles the tile open/closed. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
        >
          <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 2H14V16H4V2Z"
                stroke="var(--accent)"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M6 6H12M6 9H12M6 12H10"
                stroke="var(--accent)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-text">
                {statement.statementNumber}
              </p>
              <Badge tone={statement.statusTone} className="text-[9px]">
                {statement.status}
              </Badge>
            </div>
            <p className="text-[11px] text-text-subtle mt-0.5">
              {statement.dateLabel}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium text-text tabular-nums">
              {statement.amountLabel}
            </p>
            <p className="text-[11px] text-text-subtle">
              {expanded ? "Hide details" : "Show details"}
            </p>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`shrink-0 text-text-subtle transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <path
              d="M3.5 5L7 8.5L10.5 5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Expanded detail — the rest of the information. */}
        {expanded && (
          <div className="mt-3 pl-14">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p className="text-[11px] text-text-subtle">{statement.detailLine}</p>
              <div className="text-right">
                <p className="text-[11px] text-text-subtle">
                  {statement.deliveryMethod}
                </p>
                <Link
                  href={statement.invoiceHref}
                  className="text-[11px] text-accent hover:text-accent-strong mt-1 inline-block"
                >
                  View invoice →
                </Link>
              </div>
            </div>
            {statement.plainLanguageSummary && (
              <div className="mt-3 p-3 rounded-lg bg-accent/5 border border-accent/10">
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                  Cindy says:
                </p>
                <p className="text-xs text-text-muted leading-relaxed">
                  {statement.plainLanguageSummary}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
