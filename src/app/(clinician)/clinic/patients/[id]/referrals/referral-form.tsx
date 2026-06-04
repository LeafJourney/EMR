"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, FieldGroup } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import type {
  Referral,
  ReferralDirection,
  ReferralPriority,
  ReferralStatus,
} from "@/lib/domain/referrals";
import { SPECIALTIES, STATUS_LABELS } from "@/lib/domain/referrals";

// ── Demo referrals ──────────────────────────────────

function buildDemoReferrals(patientId: string, patientName: string): Referral[] {
  return [
    {
      id: "ref-001",
      patientId,
      patientName,
      direction: "outbound",
      status: "sent",
      priority: "routine",
      referringProviderName: "Dr. Elena Rivera",
      referringProviderNpi: "1234567890",
      referringPracticeName: "Leafjourney Clinic",
      referredToProviderName: "Dr. Michael Chen",
      referredToSpecialty: "Pain Management",
      referredToPracticeName: "Summit Pain Specialists",
      referredToPhone: "(555) 234-5678",
      reason:
        "Patient has chronic lower back pain not adequately controlled with current cannabis regimen. Requesting evaluation for complementary pain management strategies.",
      diagnosisCodes: [
        { code: "M54.5", label: "Low back pain" },
        { code: "G89.29", label: "Other chronic pain" },
      ],
      clinicalNotes:
        "Patient has been on CBD:THC 20:1 tincture for 3 months with moderate improvement. Requesting PM eval for multimodal approach.",
      attachedDocumentIds: [],
      sentAt: "2026-04-01T10:30:00Z",
      createdAt: "2026-03-28T14:00:00Z",
      updatedAt: "2026-04-01T10:30:00Z",
    },
    {
      id: "ref-002",
      patientId,
      patientName,
      direction: "inbound",
      status: "completed",
      priority: "routine",
      referringProviderName: "Dr. Sarah Patel",
      referringPracticeName: "Westside Primary Care",
      referredToProviderName: "Dr. Elena Rivera",
      referredToSpecialty: "Integrative Medicine",
      referredToPracticeName: "Leafjourney Clinic",
      reason:
        "Patient interested in exploring medical cannabis for generalized anxiety disorder. Currently on sertraline 100mg with partial response.",
      diagnosisCodes: [
        { code: "F41.1", label: "Generalized anxiety disorder" },
      ],
      attachedDocumentIds: [],
      receivedAt: "2026-02-15T09:00:00Z",
      scheduledDate: "2026-03-01",
      completedAt: "2026-03-01T14:30:00Z",
      completionNotes: "Initial evaluation completed. Patient enrolled in cannabis treatment program.",
      createdAt: "2026-02-15T09:00:00Z",
      updatedAt: "2026-03-01T14:30:00Z",
    },
    {
      id: "ref-003",
      patientId,
      patientName,
      direction: "outbound",
      status: "scheduled",
      priority: "urgent",
      referringProviderName: "Dr. Elena Rivera",
      referringPracticeName: "Leafjourney Clinic",
      referredToProviderName: "Dr. Lisa Thompson",
      referredToSpecialty: "Psychiatry",
      referredToPracticeName: "Mindful Psychiatry Associates",
      referredToPhone: "(555) 345-6789",
      reason:
        "Patient reporting increased anxiety and sleep disturbance despite dose adjustments. Requesting psychiatric evaluation for possible medication adjustment.",
      diagnosisCodes: [
        { code: "F41.1", label: "Generalized anxiety disorder" },
        { code: "G47.00", label: "Insomnia, unspecified" },
      ],
      urgencyNotes: "Patient reports daily panic attacks for the past week.",
      attachedDocumentIds: [],
      sentAt: "2026-04-10T08:00:00Z",
      scheduledDate: "2026-04-18",
      createdAt: "2026-04-09T16:00:00Z",
      updatedAt: "2026-04-10T08:00:00Z",
    },
  ];
}

// ── Diagnosis code options ──────────────────────────

const COMMON_DIAGNOSES = [
  { code: "M54.5", label: "Low back pain" },
  { code: "G89.29", label: "Other chronic pain" },
  { code: "F41.1", label: "Generalized anxiety disorder" },
  { code: "F32.1", label: "Major depressive disorder, moderate" },
  { code: "G47.00", label: "Insomnia, unspecified" },
  { code: "R51.9", label: "Headache, unspecified" },
  { code: "G43.909", label: "Migraine, unspecified" },
  { code: "F43.10", label: "Post-traumatic stress disorder" },
  { code: "G40.909", label: "Epilepsy, unspecified" },
  { code: "R11.0", label: "Nausea" },
];

import { createReferralAction } from "./actions";

// ── Priority badge config ───────────────────────────

const PRIORITY_BADGE: Record<ReferralPriority, { tone: "danger" | "warning" | "neutral" }> = {
  stat: { tone: "danger" },
  urgent: { tone: "warning" },
  routine: { tone: "neutral" },
};

// ── Main component ──────────────────────────────────

export function ReferralForm({
  patientId,
  patientName,
  initialReferrals,
}: {
  patientId: string;
  patientName: string;
  initialReferrals: Referral[];
}) {
  const [referrals, setReferrals] = useState<Referral[]>(initialReferrals);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [direction, setDirection] = useState<ReferralDirection>("outbound");
  const [priority, setPriority] = useState<ReferralPriority>("routine");
  const [specialty, setSpecialty] = useState("");
  const [providerName, setProviderName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [reason, setReason] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<
    { code: string; label: string }[]
  >([]);

  function resetForm() {
    setDirection("outbound");
    setPriority("routine");
    setSpecialty("");
    setProviderName("");
    setPracticeName("");
    setReason("");
    setClinicalNotes("");
    setSelectedDiagnoses([]);
  }

  async function handleSubmit() {
    const referringProv = direction === "outbound" ? "Dr. Elena Rivera" : providerName;
    const referringPrac = direction === "outbound" ? "Leafjourney Clinic" : practiceName;
    const referredToProv = direction === "outbound" ? providerName : "Dr. Elena Rivera";
    const referredToPrac = direction === "outbound" ? practiceName : "Leafjourney Clinic";

    const res = await createReferralAction({
      patientId,
      direction,
      priority,
      referringProviderName: referringProv,
      referringPracticeName: referringPrac,
      referredToProviderName: referredToProv,
      referredToSpecialty: specialty,
      referredToPracticeName: referredToPrac,
      reason,
      diagnosisCodes: selectedDiagnoses,
      clinicalNotes: clinicalNotes || undefined,
    });

    if (res.ok && res.referral) {
      setReferrals((prev) => [res.referral, ...prev]);
      resetForm();
      setShowForm(false);
    }
  }

  function toggleDiagnosis(diag: { code: string; label: string }) {
    setSelectedDiagnoses((prev) =>
      prev.some((d) => d.code === diag.code)
        ? prev.filter((d) => d.code !== diag.code)
        : [...prev, diag]
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text">
          Referrals ({referrals.length})
        </h2>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            New referral
          </Button>
        )}
      </div>

      {/* ── New Referral Form ──────────────────── */}
      {showForm && (
        <Card tone="raised" className="border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle>New referral</CardTitle>
            <CardDescription>
              Create a new referral for {patientName}.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-5">
              {/* Direction */}
              <div>
                <Label>Direction</Label>
                <div className="flex gap-2 mt-1.5">
                  {(["outbound", "inbound"] as ReferralDirection[]).map(
                    (dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setDirection(dir)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                          direction === dir
                            ? "bg-accent text-accent-ink border-accent shadow-sm"
                            : "bg-surface-muted text-text-muted border-border hover:border-accent/40"
                        )}
                      >
                        {dir === "outbound"
                          ? "Outbound (referring out)"
                          : "Inbound (referred to us)"}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Priority */}
              <div>
                <Label>Priority</Label>
                <div className="flex gap-2 mt-1.5">
                  {(["stat", "urgent", "routine"] as ReferralPriority[]).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium border transition-all capitalize",
                          priority === p
                            ? p === "stat"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : p === "urgent"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-surface-muted text-text border-border-strong"
                            : "bg-surface-muted text-text-muted border-border hover:border-accent/40"
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Specialty */}
              <FieldGroup label="Specialty">
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">Select specialty...</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              {/* Provider info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup
                  label={
                    direction === "outbound"
                      ? "Referred-to provider"
                      : "Referring provider"
                  }
                >
                  <Input
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder="Provider name"
                  />
                </FieldGroup>
                <FieldGroup label="Practice name">
                  <Input
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                    placeholder="Practice or clinic name"
                  />
                </FieldGroup>
              </div>

              {/* Reason */}
              <FieldGroup label="Reason for referral">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the reason for this referral..."
                  rows={3}
                />
              </FieldGroup>

              {/* Diagnosis codes */}
              <div>
                <Label>Diagnosis codes</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {COMMON_DIAGNOSES.map((diag) => {
                    const selected = selectedDiagnoses.some(
                      (d) => d.code === diag.code
                    );
                    return (
                      <button
                        key={diag.code}
                        type="button"
                        onClick={() => toggleDiagnosis(diag)}
                        className={cn(
                          "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          selected
                            ? "bg-accent/10 text-accent border-accent/30"
                            : "bg-surface-muted text-text-muted border-border hover:border-accent/30"
                        )}
                      >
                        <span className="font-mono text-[10px]">{diag.code}</span>
                        <span>{diag.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clinical notes */}
              <FieldGroup label="Clinical notes" hint="Optional additional context for the receiving provider.">
                <Textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Any additional clinical context..."
                  rows={3}
                />
              </FieldGroup>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              variant="ghost"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleSubmit}
                disabled={!specialty || !providerName || !reason}
              >
                Save as draft
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!specialty || !providerName || !reason}
              >
                Create referral
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* ── Referral List ──────────────────────── */}
      {referrals.length === 0 ? (
        <EmptyState
          title="No referrals yet"
          description="Create a new referral to coordinate care with other providers."
          action={
            <Button onClick={() => setShowForm(true)}>
              New referral
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {referrals.map((referral) => {
            const statusConfig = STATUS_LABELS[referral.status];
            const priorityConfig = PRIORITY_BADGE[referral.priority];
            return (
              <Card key={referral.id} tone="raised" className="hover:shadow-md transition-shadow">
                <CardContent className="py-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge tone={referral.direction === "outbound" ? "info" : "accent"}>
                          {referral.direction === "outbound" ? "Outbound" : "Inbound"}
                        </Badge>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
                            statusConfig.color
                          )}
                        >
                          {statusConfig.label}
                        </span>
                        <Badge tone={priorityConfig.tone} className="capitalize">
                          {referral.priority}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-medium text-text">
                        {referral.referredToSpecialty}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        {referral.direction === "outbound" ? (
                          <>
                            To: {referral.referredToProviderName} at{" "}
                            {referral.referredToPracticeName}
                          </>
                        ) : (
                          <>
                            From: {referral.referringProviderName} at{" "}
                            {referral.referringPracticeName}
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-text-subtle whitespace-nowrap">
                      {new Date(referral.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm text-text-muted leading-relaxed mb-3">
                    {referral.reason}
                  </p>

                  {referral.diagnosisCodes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {referral.diagnosisCodes.map((diag) => (
                        <span
                          key={diag.code}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-muted text-text-muted border border-border/60"
                        >
                          <span className="font-mono">{diag.code}</span>
                          {diag.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {referral.scheduledDate && (
                    <p className="text-xs text-accent font-medium">
                      Scheduled:{" "}
                      {new Date(referral.scheduledDate).toLocaleDateString()}
                    </p>
                  )}

                  {referral.completionNotes && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/50">
                      <p className="text-xs font-medium text-emerald-700 mb-0.5">
                        Completion notes
                      </p>
                      <p className="text-sm text-emerald-900/80 leading-relaxed">
                        {referral.completionNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
