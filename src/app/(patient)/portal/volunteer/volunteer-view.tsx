"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { lex } from "@/lib/lexicon";
import {
  type VolunteerOpportunity,
  type VolunteerHour,
  type QuarterProgress,
  generateCertificate,
} from "@/lib/domain/volunteer";

type EnrichedOpportunity = VolunteerOpportunity & { milesFromHome?: number };

const CATEGORY_LABEL: Record<VolunteerOpportunity["category"], string> = {
  patient_advocacy: "Advocacy",
  research: "Research",
  veteran: "Veterans",
  harm_reduction: "Harm reduction",
  food_security: "Food security",
  youth_education: "Youth ed",
  homelessness: "Homelessness",
  environmental: "Environment",
};

export function VolunteerView({
  opportunities,
  hours,
  progress,
  userName,
}: {
  opportunities: EnrichedOpportunity[];
  hours: VolunteerHour[];
  progress: QuarterProgress;
  userName: string;
}) {
  const [logged, setLogged] = useState<VolunteerHour[]>(hours);
  const [logFor, setLogFor] = useState<EnrichedOpportunity | null>(null);
  const [logHours, setLogHours] = useState<number>(1);
  const [logProof, setLogProof] = useState("");
  const [donateInstead, setDonateInstead] = useState(false);
  const [showCert, setShowCert] = useState(false);

  const opportunityById = useMemo(() => {
    const m = new Map<string, EnrichedOpportunity>();
    for (const o of opportunities) m.set(o.id, o);
    return m;
  }, [opportunities]);

  const opportunityNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of opportunities) m.set(o.id, o.charityName);
    return m;
  }, [opportunities]);

  const totalHours = useMemo(
    () => logged.reduce((s, h) => s + h.hours, 0),
    [logged],
  );

  const live = useMemo(() => {
    const totalThisQ = logged
      .filter((h) => {
        const d = new Date(h.occurredAt);
        const q = Math.floor(d.getUTCMonth() / 3);
        const now = new Date();
        return d.getUTCFullYear() === now.getUTCFullYear() && q === Math.floor(now.getUTCMonth() / 3);
      })
      .reduce((s, h) => s + h.hours, 0);
    return {
      hoursThisQuarter: totalThisQ,
      pctToMin: Math.min(100, (totalThisQ / 10) * 100),
      pctToStretch: Math.min(100, (totalThisQ / 20) * 100),
      metMin: totalThisQ >= 10,
      metStretch: totalThisQ >= 20,
      hoursToMin: Math.max(0, 10 - totalThisQ),
      hoursToStretch: Math.max(0, 20 - totalThisQ),
      quarterLabel: progress.quarterLabel,
    };
  }, [logged, progress.quarterLabel]);

  function submitLog() {
    if (!logFor) return;
    const newHour: VolunteerHour = {
      id: `vh-new-${Date.now()}`,
      userId: "self",
      opportunityId: logFor.id,
      hours: logHours,
      occurredAt: new Date().toISOString(),
      status: "self_reported",
      proofUrl: logProof || undefined,
      donatedToCharityId: donateInstead ? logFor.charityId : undefined,
    };
    setLogged((prev) => [newHour, ...prev]);
    setLogFor(null);
    setLogHours(1);
    setLogProof("");
    setDonateInstead(false);
  }

  return (
    <div className="space-y-6">
      <ProgressCard progress={live} totalHours={totalHours} userName={userName} onCertificate={() => setShowCert(true)} />

      <PlantCard hours={live.hoursThisQuarter} />

      <Card>
        <CardHeader>
          <CardTitle>Vetted opportunities within 30 miles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {opportunities.length === 0 && (
            <p className="text-sm text-text-muted">No vetted in-person opportunities near you yet — try a remote one below.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {opportunities.map((o) => (
              <OpportunityCard key={o.id} opp={o} onLog={() => setLogFor(o)} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your logged hours</CardTitle>
        </CardHeader>
        <CardContent>
          {logged.length === 0 && <p className="text-sm text-text-muted">Nothing logged yet. Pick an opportunity above.</p>}
          <ul className="divide-y divide-border/60">
            {logged
              .slice()
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .map((h) => {
                const opp = opportunityById.get(h.opportunityId);
                return (
                  <li key={h.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-text">{opp?.charityName ?? h.opportunityId}</p>
                      <p className="text-[11px] text-text-subtle">
                        {new Date(h.occurredAt).toLocaleDateString()} ·{" "}
                        {h.status === "verified" ? `verified by ${h.verifierName ?? "coordinator"}` : "self-reported"}
                        {h.donatedToCharityId && " · donated"}
                      </p>
                    </div>
                    <span className="font-display tabular-nums text-text">{h.hours}h</span>
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      {logFor && (
        <Modal onClose={() => setLogFor(null)}>
          <CardContent className="py-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-subtle">Log a {lex("program.volunteer").toLowerCase()}</p>
              <h3 className="font-display text-lg text-text">{logFor.charityName}</h3>
              <p className="text-xs text-text-muted">{logFor.title}</p>
            </div>
            <FieldGroup label="Hours">
              <Input type="number" min={0.5} step={0.5} value={logHours} onChange={(e) => setLogHours(Number(e.target.value))} />
            </FieldGroup>
            <FieldGroup label="Proof URL (optional)" hint="Photo, letter, or event link.">
              <Input value={logProof} onChange={(e) => setLogProof(e.target.value)} placeholder="https://" />
            </FieldGroup>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={donateInstead}
                onChange={(e) => setDonateInstead(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              Donate the discount equivalent to {logFor.charityName} instead.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setLogFor(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitLog}>
                Log {logHours}h
              </Button>
            </div>
          </CardContent>
        </Modal>
      )}

      {showCert && (
        <Modal onClose={() => setShowCert(false)}>
          <CertificatePreview
            cert={generateCertificate({
              userId: "self",
              hours: logged,
              opportunityNames,
              periodStart: new Date(new Date().getUTCFullYear(), Math.floor(new Date().getUTCMonth() / 3) * 3, 1).toISOString(),
              periodEnd: new Date().toISOString(),
            })}
            userName={userName}
          />
        </Modal>
      )}
    </div>
  );
}

function ProgressCard({
  progress,
  totalHours,
  userName,
  onCertificate,
}: {
  progress: QuarterProgress;
  totalHours: number;
  userName: string;
  onCertificate: () => void;
}) {
  return (
    <Card tone="ambient">
      <CardContent className="py-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-subtle">{progress.quarterLabel} progress</p>
            <h2 className="font-display text-3xl text-text mt-1">
              {progress.hoursThisQuarter} <span className="text-text-muted text-xl">/ 10 hours</span>
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {progress.metStretch
                ? `Stretch goal hit, ${userName}. The forest grows because you do.`
                : progress.metMin
                  ? `Quarterly minimum met, ${userName}. ${progress.hoursToStretch}h to your stretch goal.`
                  : `${progress.hoursToMin}h to your quarterly minimum. Every hour counts.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-text-subtle">Lifetime</p>
            <p className="font-display text-2xl text-text mt-1 tabular-nums">{totalHours}h</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={onCertificate}>
              View certificate
            </Button>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <ProgressBar label="Quarterly minimum" pct={progress.pctToMin} />
          <ProgressBar label="Stretch goal" pct={progress.pctToStretch} variant="stretch" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ label, pct, variant }: { label: string; pct: number; variant?: "stretch" }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-text-subtle">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-surface-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", variant === "stretch" ? "bg-emerald-500/70" : "bg-emerald-700")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlantCard({ hours }: { hours: number }) {
  // Translate hours into a stage 0–4 so the stylized plant matures with effort.
  const stage = hours >= 20 ? 4 : hours >= 10 ? 3 : hours >= 5 ? 2 : hours >= 2 ? 1 : 0;
  const labels = ["Seedling", "Sprout", "Stem", "Branching", "Flowering"];
  const fills = ["#cfe6c2", "#9bc790", "#6fa86a", "#4a8c5a", "#2d6e4f"];
  return (
    <Card tone="raised">
      <CardContent className="py-6 flex items-center gap-6">
        <div className="shrink-0 w-24 h-24 flex items-end justify-center">
          <svg viewBox="0 0 80 80" className="w-full h-full" aria-hidden="true">
            <line x1="40" y1="80" x2="40" y2={80 - 20 - stage * 10} stroke={fills[stage]} strokeWidth="3" />
            {stage >= 1 && <ellipse cx="32" cy={70 - stage * 8} rx="8" ry="3" fill={fills[stage]} />}
            {stage >= 2 && <ellipse cx="50" cy={62 - stage * 6} rx="9" ry="3" fill={fills[stage]} />}
            {stage >= 3 && <ellipse cx="32" cy={50 - stage * 4} rx="8" ry="3" fill={fills[stage]} />}
            {stage >= 4 && <circle cx="40" cy={32} r="6" fill="#e9b94d" />}
          </svg>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-text-subtle">Your nurture plant</p>
          <p className="font-display text-xl text-text mt-1">{labels[stage]}</p>
          <p className="text-sm text-text-muted mt-1">
            {hours} hour{hours === 1 ? "" : "s"} this quarter — your plant grows with every hour you nurture the community.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function OpportunityCard({ opp, onLog }: { opp: EnrichedOpportunity; onLog: () => void }) {
  return (
    <Card tone="raised">
      <CardContent className="py-5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-base text-text">{opp.charityName}</p>
            <p className="text-sm text-text-muted">{opp.title}</p>
          </div>
          {opp.vetted && <Badge tone="success">Vetted</Badge>}
        </div>
        <p className="text-xs text-text-muted">{opp.summary}</p>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-subtle">
          <Badge tone="neutral">{CATEGORY_LABEL[opp.category]}</Badge>
          <Badge tone="accent">{opp.kind.replace("_", " ")}</Badge>
          <span>~{opp.hoursEstimate}h / session</span>
          {opp.location && (
            <span>
              · {opp.location.city}, {opp.location.state}
              {typeof opp.milesFromHome === "number" && ` · ${opp.milesFromHome.toFixed(1)}mi`}
            </span>
          )}
        </div>
        <div className="pt-2">
          <Button size="sm" variant="secondary" onClick={onLog}>
            Log hours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CertificatePreview({
  cert,
  userName,
}: {
  cert: ReturnType<typeof generateCertificate>;
  userName: string;
}) {
  return (
    <CardContent className="py-8 text-center space-y-4">
      <p className="text-xs uppercase tracking-wider text-text-subtle">Certificate of Volunteer Service</p>
      <h3 className="font-display text-3xl text-text">{userName}</h3>
      <p className="text-sm text-text-muted">
        Verified <span className="text-text font-medium">{cert.totalHours} hours</span> of nurture between{" "}
        {new Date(cert.periodStart).toLocaleDateString()} and {new Date(cert.periodEnd).toLocaleDateString()}
        {cert.charities.length > 0 && (
          <>
            <br />
            with{" "}
            <span className="text-text">
              {cert.charities.slice(0, 3).join(", ")}
              {cert.charities.length > 3 && ` +${cert.charities.length - 3} more`}
            </span>
          </>
        )}
      </p>
      <div className="border-t border-b border-border py-3">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle">Attestation</p>
        <p className="font-mono text-xs text-text-muted break-all">{cert.attestationHash}</p>
      </div>
      <p className="text-[11px] text-text-subtle">
        Issued {new Date(cert.issuedAt).toLocaleDateString()} · Leafjourney
      </p>
    </CardContent>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <Card tone="raised" className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </Card>
    </div>
  );
}
