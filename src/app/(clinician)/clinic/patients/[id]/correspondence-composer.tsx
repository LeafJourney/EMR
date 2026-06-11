"use client";

/**
 * EMR-896 / EMR-897 — blank right-pane composer for the Correspondence tab.
 *
 * A new message starts a fresh recipient-driven compose flow:
 *   • To: searchable directory by partial first/last/title/department, with a
 *     disambiguation popup when more than one match shares a name.
 *   • Subject + expandable free-text body.
 *   • Call / video emoji in the top-right (placeholder hand-offs).
 *   • Save → marks the message DRAFT in the inbox (persisted via the caller's
 *     usePersistentState); Send → hands the composed payload to the caller.
 *
 * The staff/provider directory is a small hardcoded array (no schema column),
 * and every entry carries a fixed identity colour + emoji avatar (EMR-897) so
 * recipients are instantly recognisable across the chart.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { identityColor, initialsOf } from "@/lib/clinical/chart-bubbles";
import { cn } from "@/lib/utils/cn";

export interface DirectoryEntry {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  department: string;
}

/** EMR-896 — small hardcoded staff/provider directory (no schema column). */
export const STAFF_DIRECTORY: DirectoryEntry[] = [
  { id: "u_okafor", firstName: "Dana", lastName: "Okafor", title: "MD", department: "Pain & Cannabis Medicine" },
  { id: "u_patel", firstName: "Anika", lastName: "Patel", title: "MD", department: "Medical Director" },
  { id: "u_nguyen", firstName: "Linh", lastName: "Nguyen", title: "PharmD", department: "Pharmacy" },
  { id: "u_rivera", firstName: "Sofia", lastName: "Rivera", title: "RN", department: "Nursing" },
  { id: "u_rivera2", firstName: "Marco", lastName: "Rivera", title: "MA", department: "Front Desk" },
  { id: "u_chen", firstName: "Wei", lastName: "Chen", title: "NP", department: "Primary Care" },
  { id: "u_brooks", firstName: "Jordan", lastName: "Brooks", title: "LCSW", department: "Behavioral Health" },
  { id: "u_haddad", firstName: "Layla", lastName: "Haddad", title: "RN", department: "Triage" },
  { id: "u_santos", firstName: "Paulo", lastName: "Santos", title: "Biller", department: "Billing" },
  { id: "u_kim", firstName: "Grace", lastName: "Kim", title: "MD", department: "Sleep Medicine" },
];

export function fullName(e: DirectoryEntry): string {
  return `${e.firstName} ${e.lastName}`;
}

export function searchDirectory(query: string): DirectoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return STAFF_DIRECTORY;
  return STAFF_DIRECTORY.filter((e) =>
    [e.firstName, e.lastName, e.title, e.department, fullName(e)]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

/** EMR-897 — fixed colour + emoji avatar for any sender/recipient. */
export function IdentityAvatar({
  seed,
  name,
  size = "sm",
}: {
  seed: string;
  name: string;
  size?: "xs" | "sm";
}) {
  const color = identityColor(seed);
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  return (
    <span
      title={`${name} · ${color.name}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full ring-1 font-semibold shrink-0 relative",
        color.bg,
        color.text,
        color.ring,
        dim,
      )}
    >
      {initialsOf(name)}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 text-[9px] leading-none"
      >
        {color.emoji}
      </span>
    </span>
  );
}

export interface ComposerPayload {
  to: DirectoryEntry;
  subject: string;
  body: string;
}

export function CorrespondenceComposer({
  patientName,
  onSave,
  onSend,
  onCancel,
}: {
  patientName: string;
  onSave: (payload: ComposerPayload) => void;
  onSend: (payload: ComposerPayload) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [recipient, setRecipient] = React.useState<DirectoryEntry | null>(null);
  const [showResults, setShowResults] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  // Disambiguation popup when a typed name maps to duplicates.
  const [ambiguous, setAmbiguous] = React.useState<DirectoryEntry[] | null>(
    null,
  );

  const results = React.useMemo(() => searchDirectory(query), [query]);

  function chooseRecipient(e: DirectoryEntry) {
    // EMR-896 — duplicate display name → disambiguation popup.
    const sameName = STAFF_DIRECTORY.filter(
      (x) => fullName(x).toLowerCase() === fullName(e).toLowerCase(),
    );
    if (sameName.length > 1 && !ambiguous) {
      setAmbiguous(sameName);
      return;
    }
    setRecipient(e);
    setQuery(fullName(e));
    setShowResults(false);
    setAmbiguous(null);
  }

  const canSubmit = recipient != null && subject.trim().length > 0;

  function payload(): ComposerPayload | null {
    if (!recipient) return null;
    return { to: recipient, subject: subject.trim(), body: body.trim() };
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with call/video hand-offs (top-right). */}
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-subtle">
            New message
          </p>
          <h3 className="font-display text-lg text-text leading-tight">
            Compose
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Start a call"
            aria-label="Start a call"
            onClick={() => {
              /* call hand-off placeholder */
            }}
            className="h-8 w-8 rounded-full bg-surface-muted hover:bg-surface-raised flex items-center justify-center text-sm"
          >
            <span aria-hidden="true">📞</span>
          </button>
          <button
            type="button"
            title="Start a video visit"
            aria-label="Start a video visit"
            onClick={() => {
              /* video hand-off placeholder */
            }}
            className="h-8 w-8 rounded-full bg-surface-muted hover:bg-surface-raised flex items-center justify-center text-sm"
          >
            <span aria-hidden="true">🎥</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Subject — placed ABOVE the To field per the revision directive. */}
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Subject
          </label>
          <Input
            value={subject}
            placeholder="Subject"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* To: searchable directory. */}
        <div className="relative">
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            To
          </label>
          <div className="flex items-center gap-2">
            {recipient && (
              <IdentityAvatar
                seed={recipient.id}
                name={fullName(recipient)}
                size="sm"
              />
            )}
            <Input
              value={query}
              placeholder="Search by name, title, or department…"
              onFocus={() => setShowResults(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
                setRecipient(null);
              }}
            />
          </div>

          {showResults && results.length > 0 && !recipient && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {results.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => chooseRecipient(e)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-muted"
                >
                  <IdentityAvatar seed={e.id} name={fullName(e)} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm text-text truncate">
                      {fullName(e)}{" "}
                      <span className="text-text-subtle">· {e.title}</span>
                    </span>
                    <span className="block text-[11px] text-text-subtle truncate">
                      {e.department}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {showResults && results.length === 0 && (
            <p className="text-[11px] text-text-subtle mt-1">
              No staff match “{query}”.
            </p>
          )}
        </div>

        {/* Drag-to-resize message body — grab the bottom-right corner to
            expand the box free-handedly (CSS resize) instead of a toggle. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text inline-block">
              Message
            </label>
            <span className="text-[11px] text-text-subtle">
              Drag the bottom-right corner to resize
            </span>
          </div>
          <Textarea
            value={body}
            rows={6}
            placeholder="Write your message…"
            onChange={(e) => setBody(e.target.value)}
            className="resize-y min-h-[7rem] max-h-[28rem]"
          />
        </div>
      </div>

      {/* Footer actions. */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              const p = payload();
              if (p) onSave(p);
            }}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              const p = payload();
              if (p) onSend(p);
            }}
          >
            Send
          </Button>
        </div>
      </div>

      {/* EMR-896 — disambiguation popup for duplicate names. */}
      {ambiguous && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAmbiguous(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-bg border border-border shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-1">
              Multiple matches
            </p>
            <h4 className="font-display text-lg text-text mb-3">
              Which {fullName(ambiguous[0])}?
            </h4>
            <div className="space-y-1.5">
              {ambiguous.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setRecipient(e);
                    setQuery(fullName(e));
                    setShowResults(false);
                    setAmbiguous(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg border border-border hover:bg-surface-muted"
                >
                  <IdentityAvatar seed={e.id} name={fullName(e)} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm text-text">
                      {fullName(e)}
                    </span>
                    <span className="block text-[11px] text-text-subtle">
                      {e.title} · {e.department}
                    </span>
                  </span>
                  <Badge tone="neutral" className="ml-auto text-[9px]">
                    {e.title}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
