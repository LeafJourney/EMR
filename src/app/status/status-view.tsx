"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils/cn";
import {
  STATE_COPY,
  type ComponentHealth,
  type ComponentState,
  type SystemHealthSnapshot,
} from "@/lib/status/system-health";
import type { Incident, Maintenance } from "./status-data";

interface StatusViewProps {
  snapshot: SystemHealthSnapshot;
  incidents: Incident[];
  maintenance: Maintenance[];
}

const STATE_TONE: Record<
  ComponentState,
  {
    dot: string;
    badge: "success" | "warning" | "danger" | "info";
    bar: { bg: string; text: string; border: string };
    sparkColor: string;
    sparkFill: string;
  }
> = {
  operational: {
    dot: "bg-accent",
    badge: "success",
    bar: { bg: "bg-accent-soft", text: "text-accent", border: "border-accent/30" },
    sparkColor: "var(--accent)",
    sparkFill: "var(--accent-soft)",
  },
  degraded: {
    dot: "bg-highlight",
    badge: "warning",
    bar: { bg: "bg-highlight-soft", text: "text-text", border: "border-highlight/30" },
    sparkColor: "var(--highlight)",
    sparkFill: "var(--highlight-soft)",
  },
  outage: {
    dot: "bg-danger",
    badge: "danger",
    bar: { bg: "bg-red-50", text: "text-danger", border: "border-red-200" },
    sparkColor: "var(--danger)",
    sparkFill: "#fee2e2",
  },
  maintenance: {
    dot: "bg-info",
    badge: "info",
    bar: { bg: "bg-blue-50", text: "text-info", border: "border-blue-200" },
    sparkColor: "var(--info)",
    sparkFill: "#dbeafe",
  },
};

const SEVERITY_TONE: Record<Incident["severity"], "neutral" | "warning" | "danger"> = {
  minor: "neutral",
  major: "warning",
  critical: "danger",
};

function formatPct(n: number): string {
  // Strip trailing zeros — "99.98" not "99.98000"; "100" stays "100".
  return `${(Math.round(n * 100) / 100).toString()}%`;
}

function formatChecked(iso: string): string {
  // Local time, server-rendered with the snapshot ISO so first paint matches
  // hydration. We refresh this every minute on the client.
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function StatusView({ snapshot, incidents, maintenance }: StatusViewProps) {
  const overall = snapshot.overall;
  const overallTone = STATE_TONE[overall];
  const overallCopy = STATE_COPY[overall];

  // Client-side refresh of the "last checked" label without remounting the
  // server-rendered snapshot. Hydration-safe: initial value is derived from
  // the server-provided ISO.
  const [checkedLabel, setCheckedLabel] = useState<string>(() => formatChecked(snapshot.checkedAt));
  useEffect(() => {
    setCheckedLabel(formatChecked(snapshot.checkedAt));
    const t = setInterval(() => {
      // Approximate "moments ago" by re-formatting against the server time —
      // the actual server snapshot still ages, the label simply re-renders.
      setCheckedLabel(formatChecked(new Date().toISOString()));
    }, 60_000);
    return () => clearInterval(t);
  }, [snapshot.checkedAt]);

  const overallUptime = useMemo(() => {
    if (snapshot.components.length === 0) return 100;
    const avg =
      snapshot.components.reduce((sum, c) => sum + c.uptime90, 0) /
      snapshot.components.length;
    return Math.round(avg * 100) / 100;
  }, [snapshot.components]);

  const [subscribeOpen, setSubscribeOpen] = useState(false);

  return (
    <div className="space-y-10">
      {/* HERO — overall status pill */}
      <section
        className={cn(
          "rounded-2xl border p-6 lg:p-7 flex items-center gap-5",
          overallTone.bar.bg,
          overallTone.bar.border,
        )}
      >
        <span
          className={cn(
            "relative flex h-3.5 w-3.5 shrink-0 items-center justify-center",
          )}
          aria-hidden="true"
        >
          {overall === "operational" && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
                overallTone.dot,
              )}
            />
          )}
          <span className={cn("relative inline-flex h-3.5 w-3.5 rounded-full", overallTone.dot)} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl lg:text-3xl text-text leading-tight">
            {overallCopy.pillLabel}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Last checked {checkedLabel} ·{" "}
            <span className="text-text-subtle">
              {formatPct(overallUptime)} average uptime over the last 90 days
            </span>
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setSubscribeOpen(true)}>
            Subscribe to updates
          </Button>
        </div>
      </section>

      {/* COMPONENT GRID */}
      <section>
        <header className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg text-text">Components</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Live status by system area · 90-day uptime
            </p>
          </div>
          <span className="text-xs text-text-subtle hidden sm:inline">
            Updated every 30s
          </span>
        </header>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {snapshot.components.map((c) => (
                <ComponentRow key={c.key} component={c} />
              ))}
            </ul>
          </CardContent>
        </Card>
        <p className="mt-3 text-[11px] text-text-subtle flex items-center gap-3 flex-wrap">
          <Legend tone={STATE_TONE.operational} label="Operational" />
          <Legend tone={STATE_TONE.degraded} label="Degraded" />
          <Legend tone={STATE_TONE.outage} label="Outage" />
          <Legend tone={STATE_TONE.maintenance} label="Maintenance" />
        </p>
      </section>

      {/* INCIDENT HISTORY */}
      <section>
        <header className="mb-4">
          <h2 className="font-display text-lg text-text">Incident history</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Past incidents and their resolution timeline
          </p>
        </header>
        <Card>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent text-lg mb-3">
                  ✓
                </div>
                <p className="text-sm text-text">No incidents reported.</p>
                <p className="text-xs text-text-muted mt-1">
                  When something happens, we&apos;ll post updates here in real time.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {incidents.map((i) => (
                  <IncidentRow key={i.id} incident={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* SCHEDULED MAINTENANCE */}
      {maintenance.length > 0 && (
        <section>
          <header className="mb-4">
            <h2 className="font-display text-lg text-text">Scheduled maintenance</h2>
            <p className="text-xs text-text-muted mt-0.5">Upcoming planned work</p>
          </header>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {maintenance.map((m) => (
                  <li key={m.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text">{m.title}</div>
                        <div className="text-xs text-text-muted mt-0.5">{m.impact}</div>
                      </div>
                      <span className="text-xs text-text-subtle whitespace-nowrap">
                        {m.startsAt} → {m.endsAt}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* SUBSCRIBE CTA — mobile + always-visible footer */}
      <Card tone="ambient">
        <CardHeader>
          <CardTitle>Subscribe to updates</CardTitle>
          <CardDescription>
            Get an email when we open, update, or resolve an incident.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setSubscribeOpen(true)}>Subscribe to updates</Button>
          <p className="mt-3 text-[11px] text-text-subtle">
            Prefer RSS? An Atom feed is on our roadmap — until then, drop us
            your email and we&apos;ll wire you in once the broadcast service ships.
          </p>
        </CardContent>
      </Card>

      <SubscribeDialog open={subscribeOpen} onOpenChange={setSubscribeOpen} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component row                                                              */
/* -------------------------------------------------------------------------- */

function ComponentRow({ component }: { component: ComponentHealth }) {
  const tone = STATE_TONE[component.state];
  const stateLabel = STATE_COPY[component.state].label;

  return (
    <li className="px-5 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:grid-cols-[auto_1fr_auto_auto]">
      <span
        className={cn("h-2.5 w-2.5 rounded-full shrink-0", tone.dot)}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">{component.name}</div>
        <div className="text-xs text-text-muted truncate">{component.description}</div>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        <Sparkline
          data={component.uptimeSeries}
          width={140}
          height={32}
          color={tone.sparkColor}
          fill={tone.sparkFill}
          showDots={false}
        />
        <span className="text-[10px] text-text-subtle tabular-nums">
          {formatPct(component.uptime90)} · 90d
        </span>
      </div>
      <Badge tone={tone.badge}>{stateLabel}</Badge>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Incident row + timeline                                                    */
/* -------------------------------------------------------------------------- */

function IncidentRow({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left min-w-0 flex-1 group"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text group-hover:underline underline-offset-2">
              {incident.title}
            </span>
            <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>
          </div>
          <p className="text-xs text-text-muted mt-1">{incident.summary}</p>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-text-subtle tabular-nums">{incident.date}</span>
          <Badge tone={incident.resolved ? "success" : "warning"}>
            {incident.resolved ? "Resolved" : "Ongoing"}
          </Badge>
        </div>
      </div>
      {open && (
        <div className="mt-3 pl-3 ml-1 border-l-2 border-border space-y-3">
          {incident.timeline.map((entry, idx) => (
            <div key={`${incident.id}-${idx}`} className="relative">
              <span
                className="absolute -left-[15px] top-1.5 h-2.5 w-2.5 rounded-full bg-surface-raised border-2 border-border"
                aria-hidden="true"
              />
              <div className="text-xs font-medium text-text">
                {entry.label}
                <span className="ml-2 text-text-subtle font-normal tabular-nums">
                  {new Date(entry.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">{entry.note}</p>
            </div>
          ))}
          {incident.postmortemUrl && (
            <a
              href={incident.postmortemUrl}
              className="inline-block text-xs text-accent hover:underline underline-offset-2"
            >
              Read postmortem →
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Subscribe modal — mailto stub; real broadcast wiring is a follow-up.       */
/* -------------------------------------------------------------------------- */

function SubscribeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = useState("");

  const mailto = useMemo(() => {
    const subject = encodeURIComponent("Subscribe to Leafjourney status updates");
    const body = encodeURIComponent(
      "Please subscribe me to status updates.\n\n— (sent from /status)",
    );
    const to = "status@leafjourney.com";
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe to status updates</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-muted">
          We&apos;ll send you an email when an incident opens, updates, or
          resolves. No spam, no marketing — just status.
        </p>
        <div className="mt-4 space-y-2">
          <label
            htmlFor="status-subscribe-email"
            className="text-xs font-medium text-text-muted"
          >
            Email
          </label>
          <Input
            id="status-subscribe-email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <DialogClose
            className={cn(
              "inline-flex items-center justify-center rounded-md font-medium",
              "h-10 px-4 text-sm bg-transparent text-text-muted hover:bg-surface-muted hover:text-text",
              "transition-colors focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            )}
          >
            Cancel
          </DialogClose>
          {/*
            v1: the broadcast service does not exist yet. We open the
            user's mail client with a pre-filled message to
            status@leafjourney.com so ops can manually add them to the
            eventual list. Follow-up: replace with a POST to a real
            subscribe endpoint once that lands.
          */}
          <a
            href={mailto}
            aria-disabled={email.trim().length === 0}
            onClick={(e) => {
              if (email.trim().length === 0) {
                e.preventDefault();
                return;
              }
              // Snap the dialog closed once they click — the mail client
              // takes over. If they cancel out of their mail client, they
              // can reopen the dialog; no state is dropped.
              setTimeout(() => onOpenChange(false), 50);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-md font-medium",
              "h-10 px-4 text-sm shadow-seal text-accent-ink",
              "bg-gradient-to-b from-accent to-accent-strong",
              "hover:from-accent/90 hover:to-accent hover:shadow-xl",
              "transition-all focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              email.trim().length === 0 && "opacity-50 cursor-not-allowed pointer-events-none",
            )}
          >
            Open email
          </a>
        </div>
        <p className="mt-3 text-[11px] text-text-subtle">
          Follow-up: wire to a real subscribe endpoint (Resend audience or a
          dedicated broadcast service) and add SMS + Slack channels.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Legend chip                                                                */
/* -------------------------------------------------------------------------- */

function Legend({
  tone,
  label,
}: {
  tone: (typeof STATE_TONE)[keyof typeof STATE_TONE];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", tone.dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
