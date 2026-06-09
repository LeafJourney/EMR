"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  useContextMenu,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { setPatientStatus, sendPatientMessage } from "./actions";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "highlight";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  email: string | null;
  phone: string | null;
  chartReadiness: number | null;
  missingFields: string[];
  openTaskCount: number;
  updatedAt: string;
  createdAt: string;
  intakeProgress: number;
  // EMR-955 — serialized DOB (ISO string) for the compact age label.
  dateOfBirth: string | null;
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

/** Statuses the right-click menu can set, in display order. */
const STATUS_OPTIONS = [
  { value: "prospect", label: "Change to Prospect" },
  { value: "active", label: "Change to Active" },
  { value: "inactive", label: "Change to Inactive" },
] as const;

function statusTone(status: string): BadgeTone {
  if (status === "active") return "success";
  if (status === "prospect") return "warning";
  // EMR-943 — inactive/archived patients read as "danger" (red) so a dropped
  // patient is visually distinct from an active/prospect one at a glance.
  if (status === "inactive" || status === "archived") return "danger";
  return "neutral";
}

// EMR-955 — compact age string for the row subheader. The Patient model has
// NO sex/gender field (confirmed against prisma/schema.prisma — only
// dateOfBirth exists), so we fall back to an age-only label like "38y"
// instead of the requested "38F". Wire in sex here if the schema ever gains
// a gender/sex field.
function ageLabel(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  if (age < 0 || age > 150) return null;
  return `${age}y`;
}

// EMR-967 — map a free-form `missingFields` string to the most relevant chart
// section. Chart sections are addressed two ways in the clinic app: dedicated
// sub-routes (e.g. `/problems`, `/imaging`) and `?tab=` deep links inside the
// chart frame (e.g. `?tab=demographics`, `?tab=rx`). We keyword-match the
// (often loose) field label and fall back to the chart home when nothing fits.
function chartHrefForMissingField(patientId: string, field: string): string {
  const base = `/clinic/patients/${patientId}`;
  const f = field.toLowerCase();

  const has = (...needles: string[]) => needles.some((n) => f.includes(n));

  if (has("allerg")) return `${base}?tab=demographics`;
  if (has("medication", "med list", "drug", "rx", "prescription"))
    return `${base}?tab=rx`;
  if (has("problem", "diagnos", "condition", "surgical", "medical history"))
    return `${base}/problems`;
  if (has("document", "consent", "form", "id ", "license", "insurance card"))
    return `${base}?tab=records`;
  if (has("imaging", "x-ray", "xray", "scan", "mri", "ct ", "dicom"))
    return `${base}/imaging`;
  if (has("lab", "blood", "panel", "sleep study", "results"))
    return `${base}?tab=labs`;
  if (has("insurance", "payer", "coverage", "billing", "payment"))
    return `${base}/billing`;
  if (
    has(
      "demographic",
      "dob",
      "date of birth",
      "address",
      "phone",
      "email",
      "contact",
      "name",
      "gender",
      "sex",
    )
  )
    return `${base}?tab=demographics`;

  // Intake-specific gaps (presenting concerns, treatment goals, cannabis
  // history) live in the chart overview — fall through to chart home.
  return base;
}

export function PatientsClient({
  patients,
  activeFilter,
}: {
  patients: PatientRow[];
  activeFilter: string;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeFor, setComposeFor] = useState<PatientRow | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setFilter(status: string) {
    if (status === "all") {
      router.push("/ops/patients");
    } else {
      router.push(`/ops/patients?status=${status}`);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleSetStatus(patientId: string, status: string) {
    setPendingStatusId(patientId);
    startTransition(async () => {
      try {
        await setPatientStatus(patientId, status);
      } finally {
        setPendingStatusId(null);
      }
    });
  }

  return (
    <>
      {/* ---- Status filter tabs ---- */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeFilter === tab.value
                ? "text-text after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full"
                : "text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          {patients.length === 0 ? (
            <EmptyState
              title="No patients found"
              description="No patients match the current filter."
            />
          ) : (
            <ul className="divide-y divide-border -mx-6">
              {patients.map((p) => (
                <PatientListItem
                  key={p.id}
                  patient={p}
                  isExpanded={expandedId === p.id}
                  isStatusPending={pendingStatusId === p.id}
                  onToggle={() => toggleExpanded(p.id)}
                  onSetStatus={(status) => handleSetStatus(p.id, status)}
                  onCompose={() => setComposeFor(p)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* EMR-964 — email compose popup */}
      {composeFor && (
        <ComposeEmailModal
          patient={composeFor}
          onClose={() => setComposeFor(null)}
        />
      )}
    </>
  );
}

function PatientListItem({
  patient: p,
  isExpanded,
  isStatusPending,
  onToggle,
  onSetStatus,
  onCompose,
}: {
  patient: PatientRow;
  isExpanded: boolean;
  isStatusPending: boolean;
  onToggle: () => void;
  onSetStatus: (status: string) => void;
  onCompose: () => void;
}) {
  // EMR-939 — right-click context menu to change patient status. The entry
  // matching the patient's current status is disabled.
  const menuItems: ContextMenuItem[] = STATUS_OPTIONS.map((opt) => ({
    label: opt.label,
    disabled: p.status === opt.value || isStatusPending,
    onSelect: (close) => {
      onSetStatus(opt.value);
      close();
    },
  }));
  const { triggerProps, menu } = useContextMenu(menuItems);

  return (
    <li>
      <div
        onClick={onToggle}
        {...triggerProps}
        className={`px-6 py-4 cursor-pointer transition-colors ${
          isExpanded ? "bg-surface-muted/50" : "hover:bg-surface-muted/30"
        }`}
      >
        <div className="flex items-center gap-4">
          <Avatar firstName={p.firstName} lastName={p.lastName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* EMR-950 — when expanded, the full name links to the chart home */}
              {isExpanded ? (
                <Link
                  href={`/clinic/patients/${p.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium text-text hover:text-accent underline underline-offset-2 decoration-border hover:decoration-accent transition-colors"
                >
                  {p.firstName} {p.lastName}
                </Link>
              ) : (
                <p className="text-sm font-medium text-text">
                  {p.firstName} {p.lastName}
                </p>
              )}
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              {p.chartReadiness !== null && (
                <Badge tone={p.chartReadiness >= 80 ? "success" : "accent"}>
                  Chart {p.chartReadiness}%
                </Badge>
              )}
              {p.openTaskCount > 0 && (
                <Badge tone="warning">
                  {p.openTaskCount} open task{p.openTaskCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {/* EMR-955 — compact age (sex omitted: no schema field) */}
              {ageLabel(p.dateOfBirth) && (
                <p className="text-xs font-medium text-text-muted tabular-nums">
                  {ageLabel(p.dateOfBirth)}
                </p>
              )}
              <p className="text-xs text-text-subtle">
                Updated {formatRelative(p.updatedAt)}
              </p>
              {p.intakeProgress > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-16 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${p.intakeProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-subtle tabular-nums">
                    {p.intakeProgress}%
                  </span>
                </div>
              )}
            </div>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className={`text-text-subtle shrink-0 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
      </div>

      {/* ---- Expanded detail ---- */}
      {isExpanded && (
        <div className="px-6 pb-5 pt-1 bg-surface-muted/30 border-t border-border/40">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3">
            {/* EMR-964 — clickable email (compose popup) */}
            <DetailField label="Email">
              {p.email ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCompose();
                  }}
                  className="text-sm text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/40 hover:decoration-accent transition-colors text-left truncate max-w-full"
                  title={`Email ${p.email}`}
                >
                  {p.email}
                </button>
              ) : (
                <span className="text-sm text-text">Not provided</span>
              )}
            </DetailField>

            {/* EMR-964 — clickable phone (call now) */}
            <DetailField label="Phone">
              {p.phone ? (
                <a
                  href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/40 hover:decoration-accent transition-colors"
                  title={`Call ${p.phone}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path
                      d="M3 3.5C3 3 3.4 2.5 4 2.5h1.5c.4 0 .8.3.9.7l.6 2.2c.1.4 0 .8-.3 1L5.7 7.5a8 8 0 0 0 2.8 2.8l1.1-1c.3-.3.7-.4 1-.3l2.2.6c.4.1.7.5.7.9V12c0 .6-.5 1-1 1A9 9 0 0 1 3 3.5z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {p.phone}
                </a>
              ) : (
                <span className="text-sm text-text">Not provided</span>
              )}
            </DetailField>

            <DetailField label="Created">
              <span className="text-sm text-text">
                {formatRelative(p.createdAt)}
              </span>
            </DetailField>
            <DetailField label="Chart readiness">
              <span className="text-sm text-text">
                {p.chartReadiness !== null
                  ? `${p.chartReadiness}%`
                  : "No chart yet"}
              </span>
            </DetailField>
          </div>

          {/* EMR-967 — Missing fields deep-link into the relevant chart section */}
          {p.missingFields.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5">
                Missing fields
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.missingFields.map((f) => (
                  <Link
                    key={f}
                    href={chartHrefForMissingField(p.id, f)}
                    onClick={(e) => e.stopPropagation()}
                    title={`Open ${f} in chart`}
                    className={cn(
                      "group/chip inline-flex items-center gap-1 rounded-full",
                      "border border-border bg-surface-muted px-2 py-0.5",
                      "text-[9px] font-medium uppercase tracking-wide text-text-muted",
                      "cursor-pointer transition-colors",
                      "hover:bg-surface-raised hover:text-text hover:border-accent/40",
                    )}
                  >
                    <span className="underline-offset-2 group-hover/chip:underline">
                      {f}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-text-subtle/70 group-hover/chip:text-accent"
                    >
                      ↗
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Intake progress bar (larger) */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                Intake progress
              </p>
              <span className="text-xs text-text-muted tabular-nums">
                {p.intakeProgress}%
              </span>
            </div>
            <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-[#3A8560] rounded-full transition-all"
                style={{ width: `${p.intakeProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {menu}
    </li>
  );
}

// EMR-964 — Email compose popup: Subject + message, with Draft / Send / Cancel.
function ComposeEmailModal({
  patient,
  onClose,
}: {
  patient: PatientRow;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = subject.trim().length > 0 || body.trim().length > 0;

  function submit(draft: boolean) {
    setError(null);
    setFeedback(null);
    if (!body.trim()) {
      setError("Please enter a message.");
      return;
    }
    startTransition(async () => {
      const res = await sendPatientMessage(patient.id, subject, body, { draft });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (draft) {
        setFeedback("Saved draft.");
      } else {
        onClose();
      }
    });
  }

  const mailtoHref = patient.email
    ? `mailto:${patient.email}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`
    : undefined;

  return (
    <ModalShell
      open
      onClose={onClose}
      eyebrow="Compose"
      title={`Email ${patient.firstName} ${patient.lastName}`}
      description={patient.email ?? undefined}
      placement="center"
      isDirty={isDirty}
      footer={
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          {mailtoHref ? (
            <a
              href={mailtoHref}
              className="text-xs font-medium text-text-subtle hover:text-accent underline underline-offset-2 transition-colors"
            >
              Open in mail app
            </a>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit(true)}
              disabled={isPending}
            >
              Draft
            </Button>
            <Button onClick={() => submit(false)} disabled={isPending}>
              Send
            </Button>
          </div>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        <div>
          <label
            htmlFor="compose-subject"
            className="block text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5"
          >
            Subject
          </label>
          <Input
            id="compose-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>
        <div>
          <label
            htmlFor="compose-body"
            className="block text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5"
          >
            Message
          </label>
          <textarea
            id="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your message…"
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3 py-2",
              "text-sm text-text placeholder:text-text-subtle",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
              "resize-y min-h-[140px]",
            )}
          />
        </div>
        {feedback && (
          <p className="text-sm text-accent font-medium">{feedback}</p>
        )}
        {error && <p className="text-sm text-danger font-medium">{error}</p>}
      </div>
    </ModalShell>
  );
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </p>
      <div className="mt-0.5">
        {children ?? <p className="text-sm text-text">{value}</p>}
      </div>
    </div>
  );
}
