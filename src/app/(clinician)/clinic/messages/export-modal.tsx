"use client";

// EMR-660 — Export modal for a patient correspondence thread. Sibling of
// smart-inbox.tsx to minimize merge surface (see EMR-659 collision note).
//
// Scope of this PR:
//   - Date range picker (defaults to the thread's full span)
//   - Delivery channel selector: Email · Text (read-only link) · Print · Fax
//     · Save as PDF
//   - "Save as PDF" and "Print" both call window.print() against a freshly
//     prepared, printer-friendly snapshot of the visible thread. The other
//     channels (Email / Text / Fax) are queued client-side via a TODO toast
//     since the outbound channel server actions are owned by EMR-664.
//
// The modal is intentionally controlled (not from <Dialog>) so the parent
// smart-inbox can choose where to mount it and so we don't pull in extra
// dialog plumbing that the modal doesn't need.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { exportThread } from "./actions";

export type ExportableMessage = {
  id: string;
  body: string;
  createdAt: string; // ISO
  senderLabel: string; // "Dr. Patel" / "Patient" / "AI draft"
};

interface Props {
  open: boolean;
  onClose: () => void;
  threadId: string;
  patientName: string;
  subject: string;
  messages: ExportableMessage[];
}

type Channel = "pdf" | "print" | "email" | "text" | "fax";

const CHANNELS: { key: Channel; label: string; helper: string }[] = [
  { key: "pdf", label: "Save as PDF", helper: "Download a chart-ready PDF." },
  { key: "print", label: "Print", helper: "Send directly to a printer." },
  { key: "email", label: "Email", helper: "Email the transcript (real send when a mail provider is configured)." },
  { key: "text", label: "Text (portal notice)", helper: "SMS a secure portal-login notice — never PHI." },
  { key: "fax", label: "Fax", helper: "Not yet configured — records the export only." },
];

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

export function ExportModal({
  open,
  onClose,
  threadId,
  patientName,
  subject,
  messages,
}: Props) {
  const [sending, setSending] = useState(false);
  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  const earliest = sorted[0]?.createdAt ?? new Date().toISOString();
  const latest = sorted[sorted.length - 1]?.createdAt ?? earliest;

  const [from, setFrom] = useState(toDateInputValue(earliest));
  const [to, setTo] = useState(toDateInputValue(latest));
  const [channel, setChannel] = useState<Channel>("pdf");
  const [destination, setDestination] = useState("");

  useEffect(() => {
    if (!open) return;
    setFrom(toDateInputValue(earliest));
    setTo(toDateInputValue(latest));
    setChannel("pdf");
    setDestination("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, earliest, latest, onClose]);

  if (!open) return null;

  const inRange = sorted.filter((m) => {
    const d = m.createdAt.slice(0, 10);
    return d >= from && d <= to;
  });

  async function handleExport() {
    if (channel === "pdf" || channel === "print") {
      const win = window.open("", "_blank", "noopener,width=720,height=900");
      if (!win) {
        window.alert("Pop-up blocked. Allow pop-ups to export.");
        return;
      }
      const rows = inRange
        .map(
          (m) =>
            `<div class="row"><div class="meta"><strong>${escapeHtml(
              m.senderLabel,
            )}</strong> · ${new Date(m.createdAt).toLocaleString()}</div><div class="body">${escapeHtml(
              m.body,
            )}</div></div>`,
        )
        .join("\n");
      win.document.write(`<!doctype html><html><head><title>${escapeHtml(
        patientName,
      )} — ${escapeHtml(subject)}</title><style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 14px; font-weight: 500; color: #555; margin: 0 0 24px; }
        .row { margin-bottom: 16px; page-break-inside: avoid; }
        .meta { font-size: 11px; color: #666; margin-bottom: 4px; }
        .body { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${escapeHtml(patientName)} — ${escapeHtml(subject)}</h1>
        <h2>${from} → ${to} · ${inRange.length} message${inRange.length === 1 ? "" : "s"}</h2>
        ${rows}
        <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
      </body></html>`);
      win.document.close();
      onClose();
      return;
    }

    if (!destination.trim()) {
      window.alert(
        channel === "email"
          ? "Enter a destination email."
          : channel === "text"
            ? "Enter a destination phone number."
            : "Enter a destination fax number.",
      );
      return;
    }

    // EMR-808 — real send (email/text) or honest recorded-only (fax / no
    // provider). The server action audits the export and returns the truthful
    // delivery outcome.
    setSending(true);
    try {
      const res = await exportThread({
        threadId,
        channel,
        destination: destination.trim(),
        from,
        to,
      });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      window.alert(res.detail);
      onClose();
    } catch {
      window.alert("Could not export the thread. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export thread"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">Export thread</h2>
        <p className="mt-1 text-xs text-text-muted">
          {patientName} · {subject}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted">From</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to}
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">To</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs text-text-muted mb-2">Send to</legend>
          <div className="grid grid-cols-1 gap-1.5">
            {CHANNELS.map((c) => (
              <label
                key={c.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  channel === c.key
                    ? "border-accent bg-accent/10 text-text"
                    : "border-border bg-surface text-text hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="export-channel"
                  value={c.key}
                  checked={channel === c.key}
                  onChange={() => setChannel(c.key)}
                  className="accent-accent"
                />
                <span className="flex-1">{c.label}</span>
                <span className="text-[11px] text-text-subtle">{c.helper}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {(channel === "email" || channel === "text" || channel === "fax") && (
          <label className="mt-3 block">
            <span className="text-xs text-text-muted">
              {channel === "email"
                ? "Email address"
                : channel === "text"
                  ? "Phone number"
                  : "Fax number"}
            </span>
            <Input
              type="text"
              autoComplete={channel === "email" ? "email" : "tel"}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={
                channel === "email"
                  ? "patient@example.com"
                  : "+1 555 555 5555"
              }
            />
          </label>
        )}

        <p className="mt-4 text-[11px] text-text-subtle">
          {inRange.length} message{inRange.length === 1 ? "" : "s"} in range.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={sending}>
            {sending
              ? "Sending…"
              : channel === "pdf"
                ? "Save as PDF"
                : channel === "print"
                  ? "Print"
                  : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
