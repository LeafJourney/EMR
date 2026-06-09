"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea, FieldGroup } from "@/components/ui/input";
import { Stepper as UiStepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils/cn";
import { confirmBookingAction, type ConfirmBookingInput } from "./actions";
import { googleCalendarUrl } from "@/lib/scheduling/ics-export";

export interface VisitTypeOption {
  id: "new_patient" | "follow_up" | "renewal" | "in_person";
  label: string;
  durationMinutes: number;
  description: string;
  modality: "video" | "in_person";
  requiresInsurance: boolean;
}
export interface ProviderOption {
  id: string;
  name: string;
  title: string;
  specialties: string[];
}

interface Props {
  visitTypes: VisitTypeOption[];
  providers: ProviderOption[];
  slotsByProvider: Record<string, string[]>;
  horizonStartIso: string;
}

type Step = "visit_type" | "provider" | "slot" | "insurance" | "confirm" | "done";

const STEPS: Step[] = ["visit_type", "provider", "slot", "insurance", "confirm"];
const STEP_LABEL: Record<Step, string> = {
  visit_type: "Visit type",
  provider: "Provider",
  slot: "Time",
  insurance: "Insurance",
  confirm: "Confirm",
  done: "Confirmed",
};

export function BookingFlow({ visitTypes, providers, slotsByProvider }: Props) {
  const [step, setStep] = useState<Step>("visit_type");
  const [visitType, setVisitType] = useState<VisitTypeOption | null>(null);
  const [providerId, setProviderId] = useState<string | "first_available" | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [insurance, setInsurance] = useState({
    payer: "",
    memberId: "",
    selfPay: false,
    notes: "",
  });
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<{
    appointmentId: string;
    icsDataUrl: string;
    icsFileName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const canAdvance = useMemo(() => {
    switch (step) {
      case "visit_type": return !!visitType;
      case "provider": return !!providerId;
      case "slot": return !!slotIso;
      case "insurance":
        return insurance.selfPay || (insurance.payer.trim() !== "" && insurance.memberId.trim() !== "");
      default: return false;
    }
  }, [step, visitType, providerId, slotIso, insurance]);

  const advance = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };
  const back = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleConfirm = () => {
    if (!visitType || !providerId || !slotIso) return;
    setError(null);
    const payload: ConfirmBookingInput = {
      visitTypeId: visitType.id,
      durationMinutes: visitType.durationMinutes,
      modality: visitType.modality,
      providerId: providerId === "first_available" ? null : providerId,
      slotStartIso: slotIso,
      insurance: insurance.selfPay
        ? { selfPay: true }
        : { selfPay: false, payer: insurance.payer, memberId: insurance.memberId, notes: insurance.notes },
    };
    startTransition(async () => {
      const result = await confirmBookingAction(payload);
      if (result.ok) {
        setConfirmation(result);
        setStep("done");
      } else {
        setError(result.error);
      }
    });
  };

  if (step === "done" && confirmation) {
    return <ConfirmedScreen confirmation={confirmation} visitType={visitType!} slotIso={slotIso!} />;
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === "visit_type" && (
        <VisitTypeStep options={visitTypes} selected={visitType} onSelect={setVisitType} />
      )}
      {step === "provider" && (
        <ProviderStep
          options={providers}
          selected={providerId}
          onSelect={setProviderId}
        />
      )}
      {step === "slot" && visitType && (
        <SlotStep
          providerId={providerId ?? "first_available"}
          providers={providers}
          slotsByProvider={slotsByProvider}
          duration={visitType.durationMinutes}
          selected={slotIso}
          onSelect={setSlotIso}
        />
      )}
      {step === "insurance" && (
        <InsuranceStep
          required={visitType?.requiresInsurance ?? false}
          value={insurance}
          onChange={setInsurance}
        />
      )}
      {step === "confirm" && visitType && slotIso && (
        <ConfirmStep
          visitType={visitType}
          provider={providers.find((p) => p.id === providerId) ?? null}
          slotIso={slotIso}
          insurance={insurance}
        />
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={back} disabled={stepIndex === 0 || pending}>
          Back
        </Button>
        {step !== "confirm" ? (
          <Button onClick={advance} disabled={!canAdvance || pending}>
            Continue
          </Button>
        ) : (
          <Button onClick={handleConfirm} disabled={pending}>
            {pending ? "Confirming…" : "Confirm visit"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <UiStepper
      steps={STEPS.map((s) => STEP_LABEL[s])}
      current={idx}
      aria-label="Booking progress"
    />
  );
}

function VisitTypeStep({
  options,
  selected,
  onSelect,
}: {
  options: VisitTypeOption[];
  selected: VisitTypeOption | null;
  onSelect: (v: VisitTypeOption) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((vt) => {
        const active = selected?.id === vt.id;
        return (
          <button
            key={vt.id}
            onClick={() => onSelect(vt)}
            className={cn(
              "text-left rounded-xl border bg-surface p-5 transition-all hover:border-accent/50 hover:shadow-md",
              active ? "border-accent shadow-md ring-2 ring-accent/20" : "border-border",
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-lg text-text">{vt.label}</h3>
              <Badge tone={vt.modality === "in_person" ? "accent" : "info"}>
                {vt.modality === "in_person" ? "In-person" : "Video"}
              </Badge>
            </div>
            <p className="text-sm text-text-muted leading-relaxed mb-3">{vt.description}</p>
            <p className="text-xs text-text-subtle tabular-nums">~{vt.durationMinutes} min</p>
          </button>
        );
      })}
    </div>
  );
}

function ProviderStep({
  options,
  selected,
  onSelect,
}: {
  options: ProviderOption[];
  selected: string | null;
  onSelect: (id: string | "first_available") => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <button
        onClick={() => onSelect("first_available")}
        className={cn(
          "text-left rounded-xl border bg-surface p-5 transition-all hover:border-accent/50 hover:shadow-md",
          selected === "first_available"
            ? "border-accent shadow-md ring-2 ring-accent/20"
            : "border-border",
        )}
      >
        <h3 className="font-display text-lg text-text mb-1">First available</h3>
        <p className="text-sm text-text-muted">Get the soonest slot from any provider on your team.</p>
      </button>
      {options.map((p) => {
        const active = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              "text-left rounded-xl border bg-surface p-5 transition-all hover:border-accent/50 hover:shadow-md",
              active ? "border-accent shadow-md ring-2 ring-accent/20" : "border-border",
            )}
          >
            <h3 className="font-display text-lg text-text mb-1">{p.name}</h3>
            <p className="text-xs text-text-subtle uppercase tracking-wider mb-2">{p.title}</p>
            {p.specialties.length > 0 && (
              <p className="text-sm text-text-muted">{p.specialties.slice(0, 3).join(" · ")}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SlotStep({
  providerId,
  providers,
  slotsByProvider,
  duration,
  selected,
  onSelect,
}: {
  providerId: string | "first_available";
  providers: ProviderOption[];
  slotsByProvider: Record<string, string[]>;
  duration: number;
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  // For "first available" we union slots across providers and dedupe.
  const slots = useMemo(() => {
    if (providerId === "first_available") {
      const all = providers.flatMap((p) => slotsByProvider[p.id] ?? []);
      return Array.from(new Set(all)).sort();
    }
    return [...(slotsByProvider[providerId] ?? [])].sort();
  }, [providerId, providers, slotsByProvider]);

  // Group by day for display.
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots) {
      const dayKey = iso.slice(0, 10);
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(iso);
    }
    return Array.from(map.entries()).slice(0, 14);
  }, [slots]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Available {duration}-minute slots in the next two weeks. Times in your local timezone.
      </p>
      {byDay.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-sm text-text-muted">
            No availability in the next 14 days. Try a different provider, or call the front desk.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {byDay.map(([day, isos]) => (
            <div key={day}>
              <p className="text-xs uppercase tracking-wider text-text-subtle mb-2">{formatDayHeader(day)}</p>
              <div className="flex flex-wrap gap-2">
                {isos.map((iso) => {
                  const active = selected === iso;
                  return (
                    <button
                      key={iso}
                      onClick={() => onSelect(iso)}
                      className={cn(
                        "rounded-md border px-3 h-9 text-sm tabular-nums transition-colors",
                        active
                          ? "bg-accent text-accent-ink border-accent"
                          : "bg-surface border-border-strong text-text hover:border-accent/50",
                      )}
                    >
                      {formatTime(iso)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsuranceStep({
  required,
  value,
  onChange,
}: {
  required: boolean;
  value: { payer: string; memberId: string; selfPay: boolean; notes: string };
  onChange: (next: typeof value) => void;
}) {
  return (
    <Card tone="raised">
      <CardContent className="pt-6 pb-6 space-y-4">
        <div>
          <h3 className="font-display text-lg text-text mb-1">Insurance pre-screen</h3>
          <p className="text-sm text-text-muted">
            We verify benefits before your visit so there are no surprises. {required ? "Required for in-person visits." : ""}
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value.selfPay}
            onChange={(e) => onChange({ ...value, selfPay: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <div className="text-sm">
            <p className="font-medium text-text">Self-pay (no insurance)</p>
            <p className="text-text-muted text-xs mt-0.5">
              You'll see the cash price before confirming. We never bill you a surprise.
            </p>
          </div>
        </label>
        {!value.selfPay && (
          <div className="grid md:grid-cols-2 gap-4">
            <FieldGroup label="Payer">
              <Input
                value={value.payer}
                onChange={(e) => onChange({ ...value, payer: e.target.value })}
                placeholder="Aetna, BCBS, Humana…"
              />
            </FieldGroup>
            <FieldGroup label="Member ID">
              <Input
                value={value.memberId}
                onChange={(e) => onChange({ ...value, memberId: e.target.value })}
                placeholder="As shown on your card"
              />
            </FieldGroup>
            <div className="md:col-span-2">
              <FieldGroup label="Anything we should know?" hint="Optional">
                <Textarea
                  value={value.notes}
                  onChange={(e) => onChange({ ...value, notes: e.target.value })}
                  rows={2}
                  placeholder="Secondary coverage, prior auth concerns, etc."
                />
              </FieldGroup>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmStep({
  visitType,
  provider,
  slotIso,
  insurance,
}: {
  visitType: VisitTypeOption;
  provider: ProviderOption | null;
  slotIso: string;
  insurance: { payer: string; memberId: string; selfPay: boolean };
}) {
  return (
    <Card tone="raised">
      <CardContent className="pt-6 pb-6 space-y-4">
        <h3 className="font-display text-xl text-text">Review and confirm</h3>
        <Row label="Visit" value={`${visitType.label} (${visitType.durationMinutes} min)`} />
        <Row label="Modality" value={visitType.modality === "video" ? "Video" : "In-person"} />
        <Row label="Provider" value={provider?.name ?? "First available"} />
        <Row label="When" value={`${formatDayHeader(slotIso.slice(0, 10))} at ${formatTime(slotIso)}`} />
        <Row label="Insurance" value={insurance.selfPay ? "Self-pay" : `${insurance.payer || "—"} (${insurance.memberId || "no ID"})`} />
        <p className="text-xs text-text-subtle pt-2 leading-relaxed">
          Confirming will send a calendar invite + a reminder before your visit. You can cancel or reschedule any time.
        </p>
      </CardContent>
    </Card>
  );
}

function ConfirmedScreen({
  confirmation,
  visitType,
  slotIso,
}: {
  confirmation: { appointmentId: string; icsDataUrl: string; icsFileName: string };
  visitType: VisitTypeOption;
  slotIso: string;
}) {
  // EMR-388 — Google Calendar invite link alongside the iCal download.
  const gcalUrl = googleCalendarUrl({
    id: `appt-${confirmation.appointmentId}`,
    title: visitType.label,
    startsAt: slotIso,
    endsAt: new Date(
      new Date(slotIso).getTime() + visitType.durationMinutes * 60_000,
    ).toISOString(),
  });
  return (
    <Card tone="ambient">
      <CardContent className="pt-8 pb-8 text-center">
        <div className="text-3xl mb-3">✓</div>
        <h2 className="font-display text-2xl text-text mb-2">You're booked.</h2>
        <p className="text-sm text-text-muted mb-6">
          {visitType.label} on {formatDayHeader(slotIso.slice(0, 10))} at {formatTime(slotIso)}.
          We've sent a confirmation to your secure inbox.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* EMR-388 — iCal (.ics) + Google Calendar share */}
          <a href={confirmation.icsDataUrl} download={confirmation.icsFileName}>
            <Button variant="primary">Add to calendar (.ics)</Button>
          </a>
          <a href={gcalUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">Google Calendar</Button>
          </a>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Book another
          </Button>
        </div>
        <p className="text-[11px] text-text-subtle mt-6 tabular-nums">
          Confirmation #{confirmation.appointmentId.slice(0, 8).toUpperCase()}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wider text-text-subtle">{label}</span>
      <span className="text-sm text-text">{value}</span>
    </div>
  );
}

function formatDayHeader(dayKey: string): string {
  const d = new Date(dayKey + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
