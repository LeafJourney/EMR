"use client";

// EMR-1116 (PJ-M3) — patient-facing refill request panel for a regimen card.
// Shows the round trip: request → pending in the clinic sign-off queue →
// approved/denied state reflected back here.

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestRefillAction } from "./actions";

export interface PharmacyOption {
  id: string;
  name: string;
}

export interface RefillStatusInfo {
  /** RefillRequest lifecycle: "new" | "flagged" | "approved" | "sent" | "denied" */
  status: string;
  receivedAt: string;
  deniedReason: string | null;
}

interface Props {
  regimenId: string;
  pharmacies: PharmacyOption[];
  latestRequest: RefillStatusInfo | null;
}

const DAYS_OPTIONS = [30, 60, 90];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ request }: { request: RefillStatusInfo }) {
  const requested = formatDate(request.receivedAt);
  switch (request.status) {
    case "new":
    case "flagged":
      return (
        <Badge tone="warning">
          Refill requested {requested} — pending review
        </Badge>
      );
    case "approved":
    case "sent":
      return <Badge tone="success">Refill approved</Badge>;
    case "denied":
      return (
        <Badge tone="danger">
          Refill denied{request.deniedReason ? ` — ${request.deniedReason}` : ""}
        </Badge>
      );
    default:
      return null;
  }
}

export function RefillRequestPanel({ regimenId, pharmacies, latestRequest }: Props) {
  const [open, setOpen] = useState(false);
  const [daysSupply, setDaysSupply] = useState(30);
  const [pharmacyContactId, setPharmacyContactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isOpenRequest =
    submitted ||
    (latestRequest != null &&
      (latestRequest.status === "new" || latestRequest.status === "flagged"));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await requestRefillAction({
        regimenId,
        daysSupply,
        pharmacyContactId: pharmacyContactId || undefined,
      });
      if (result.ok) {
        setSubmitted(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="w-full space-y-3" data-testid="refill-request-panel">
      <div className="flex items-center gap-3 flex-wrap">
        {submitted ? (
          <Badge tone="warning">Refill requested — pending review</Badge>
        ) : latestRequest ? (
          <StatusBadge request={latestRequest} />
        ) : null}

        {!isOpenRequest && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Cancel" : "Request refill"}
          </Button>
        )}
      </div>

      {open && !isOpenRequest && (
        <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
              Days of supply
            </p>
            <div className="flex items-center gap-2">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysSupply(d)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors duration-200 ${
                    daysSupply === d
                      ? "bg-accent text-accent-ink border-accent"
                      : "bg-surface text-text-muted border-border hover:text-text"
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
              Pickup preference
            </p>
            <select
              value={pharmacyContactId}
              onChange={(e) => setPharmacyContactId(e.target.value)}
              aria-label="Pickup preference"
              className="h-10 w-full max-w-xs px-3 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:border-accent"
            >
              <option value="">Clinic dispensary — pickup</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <Button size="md" onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Sending..." : "Send refill request"}
            </Button>
            <p className="text-xs text-text-subtle">
              Your care team reviews every request before it&apos;s filled.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
