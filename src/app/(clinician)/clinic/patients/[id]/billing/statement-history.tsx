"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sendStatementAction } from "./actions";

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

export function StatementHistory({
  statements,
  canEmail = false,
  canText = false,
}: {
  statements: StatementTileItem[];
  /** Patient has an email address on file (enables Email send). */
  canEmail?: boolean;
  /** Patient has a phone number on file (enables Text send). */
  canText?: boolean;
}) {
  return (
    <div className="space-y-2">
      {statements.map((statement) => (
        <StatementTile
          key={statement.id}
          statement={statement}
          canEmail={canEmail}
          canText={canText}
        />
      ))}
    </div>
  );
}

function StatementTile({
  statement,
  canEmail,
  canText,
}: {
  statement: StatementTileItem;
  canEmail: boolean;
  canText: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card tone="raised">
      <CardContent className="py-4">
        {/* Collapsed header — statement name, date, amount due. The toggle
            opens the tile; Print/Share sit beside it (not nested). */}
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex-1 min-w-0 flex items-center gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
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
          <StatementActions
            statementId={statement.id}
            invoiceHref={statement.invoiceHref}
            canEmail={canEmail}
            canText={canText}
          />
        </div>

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

// Per-statement Send + Print actions (Dr. Patel directive — Statement History:
// "send via email, text, or print/save"). Email/Text route through the
// deliverMessage pipeline (PHI-safe portal link, truthful delivery state).
// Print opens the existing branded, printable invoice sheet. Rendered beside
// the toggle, never nested.
function StatementActions({
  statementId,
  invoiceHref,
  canEmail,
  canText,
}: {
  statementId: string;
  invoiceHref: string;
  canEmail: boolean;
  canText: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    tone: "success" | "muted" | "danger";
    text: string;
  } | null>(null);

  function send(channel: "email" | "sms") {
    setStatus(null);
    startTransition(async () => {
      const r = await sendStatementAction(statementId, channel);
      if (!r.ok) {
        setStatus({ tone: "danger", text: r.error });
        return;
      }
      const verb = channel === "email" ? "Emailed" : "Texted";
      setStatus(
        r.delivery === "delivered"
          ? { tone: "success", text: `${verb} ✓` }
          : r.delivery === "recorded"
            ? { tone: "muted", text: "Logged (no provider)" }
            : { tone: "danger", text: "Send failed" },
      );
    });
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {status && (
        <span
          className={`text-[10px] ${
            status.tone === "success"
              ? "text-success"
              : status.tone === "danger"
                ? "text-danger"
                : "text-text-subtle"
          }`}
        >
          {status.text}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        {canEmail && (
          <IconButton
            label="Email statement to patient"
            onClick={() => send("email")}
            disabled={pending}
          >
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
              <path
                d="M3 5h12v8H3V5Zm0 .5L9 10l6-4.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        )}
        {canText && (
          <IconButton
            label="Text statement to patient"
            onClick={() => send("sms")}
            disabled={pending}
          >
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 4h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        )}
        <IconButton
          label="Print or save invoice"
          onClick={() => window.open(invoiceHref, "_blank", "noopener")}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
            <path
              d="M5 7V3h8v4M5 13H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1M5 11h8v4H5v-4Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-7 w-7 rounded-md flex items-center justify-center text-text-subtle hover:text-text hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
