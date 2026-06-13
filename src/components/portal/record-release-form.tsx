"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";
import {
  RECORD_CATEGORY_LABELS,
  STATUS_LABELS,
  type NewRecordReleaseInput,
  type RecordCategory,
  type RecordReleaseRequest,
  type RecordReleaseScope,
} from "@/lib/domain/record-release";
import {
  createReleaseRequest,
  revokeReleaseRequest,
} from "@/app/(patient)/portal/records/release/actions";

type Props = {
  patientLegalName?: string | null;
  initialHistory: RecordReleaseRequest[];
};

const ALL_CATEGORIES: RecordCategory[] = [
  "notes",
  "labs",
  "imaging",
  "medications",
  "immunizations",
  "problem_list",
  "allergies",
  "billing",
];

export function RecordReleaseForm({ patientLegalName, initialHistory }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Form state
  const [recipientName, setRecipientName] = useState("");
  const [practice, setPractice] = useState("");
  const [email, setEmail] = useState("");
  const [fax, setFax] = useState("");
  const [address, setAddress] = useState("");

  const [scope, setScope] = useState<RecordReleaseScope>("everything");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categories, setCategories] = useState<RecordCategory[]>([
    ...ALL_CATEGORIES,
  ]);

  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const [submitted, setSubmitted] = useState<RecordReleaseRequest | null>(null);
  const [history, setHistory] = useState<RecordReleaseRequest[]>(initialHistory);

  const formId = useId();

  // Re-sync with server truth after a mutation triggers router.refresh().
  useEffect(() => {
    setHistory(initialHistory);
  }, [initialHistory]);

  const expectedSignature = useMemo(
    () => (patientLegalName ?? "").trim().toLowerCase(),
    [patientLegalName],
  );
  const signatureMatches = useMemo(() => {
    if (!expectedSignature) return signature.trim().length >= 3;
    return signature.trim().toLowerCase() === expectedSignature;
  }, [expectedSignature, signature]);

  const canSubmit =
    recipientName.trim().length > 0 &&
    (email.trim().length > 0 || fax.trim().length > 0 || address.trim().length > 0) &&
    categories.length > 0 &&
    (scope !== "date_range" || (dateFrom && dateTo)) &&
    signature.trim().length >= 3 &&
    signatureMatches &&
    acknowledged;

  const toggleCategory = (c: RecordCategory) =>
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const input: NewRecordReleaseInput = {
      recipient: {
        fullName: recipientName.trim(),
        practice: practice.trim() || undefined,
        email: email.trim() || undefined,
        fax: fax.trim() || undefined,
        address: address.trim() || undefined,
      },
      scope,
      categories,
      dateFrom: scope === "date_range" ? dateFrom : undefined,
      dateTo: scope === "date_range" ? dateTo : undefined,
      patientSignatureName: signature.trim(),
      reason: reason.trim() || undefined,
    };
    startTransition(async () => {
      const res = await createReleaseRequest(input);
      if (res.ok && res.request) {
        setSubmitted(res.request);
        router.refresh();
      }
    });
  };

  const onRevoke = (id: string) => {
    // Optimistic; reconciled by router.refresh() once the server confirms.
    setHistory((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "revoked" as const } : r)),
    );
    startTransition(async () => {
      await revokeReleaseRequest(id);
      router.refresh();
    });
  };

  const onStartAnother = () => {
    setSubmitted(null);
    setRecipientName("");
    setPractice("");
    setEmail("");
    setFax("");
    setAddress("");
    setScope("everything");
    setDateFrom("");
    setDateTo("");
    setCategories([...ALL_CATEGORIES]);
    setReason("");
    setSignature("");
    setAcknowledged(false);
  };

  return (
    <div className="space-y-6">
      {submitted ? (
        <SubmittedConfirmation
          request={submitted}
          onAnother={onStartAnother}
        />
      ) : (
        <Card tone="raised" className="rounded-3xl">
          <CardHeader>
            <Eyebrow className="mb-2">HIPAA authorization</Eyebrow>
            <CardTitle className="font-display text-2xl">
              Send your records to another doctor
            </CardTitle>
            <p className="text-sm text-text-muted leading-relaxed mt-2 max-w-2xl">
              Tell us where the records should go and what you&apos;d like
              shared. Your care team reviews every request before anything
              leaves the practice. You can revoke an authorization at any time.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-7">
              {/* Recipient */}
              <Section title="Who should receive your records?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Provider full name" required>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Dr. Jane Doe, MD"
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label="Practice or facility">
                    <input
                      type="text"
                      value={practice}
                      onChange={(e) => setPractice(e.target.value)}
                      placeholder="Riverside Family Medicine"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="records@example.com"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Secure fax">
                    <input
                      type="tel"
                      value={fax}
                      onChange={(e) => setFax(e.target.value)}
                      placeholder="(555) 555-5555"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Mailing address" className="md:col-span-2">
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                      placeholder="Street, city, state, zip"
                      className={cn(inputClass, "resize-y")}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-text-subtle mt-2">
                  Please provide at least one of email, fax, or address.
                </p>
              </Section>

              {/* Scope */}
              <Section title="What should we share?">
                <fieldset className="space-y-2">
                  <legend className="sr-only">Release scope</legend>
                  <ScopeOption
                    name={`${formId}-scope`}
                    value="everything"
                    label="My complete record"
                    description="All notes, results, medications, and history."
                    checked={scope === "everything"}
                    onChange={() => setScope("everything")}
                  />
                  <ScopeOption
                    name={`${formId}-scope`}
                    value="date_range"
                    label="A specific date range"
                    description="Limit the release to records from a window of time."
                    checked={scope === "date_range"}
                    onChange={() => setScope("date_range")}
                  />
                  <ScopeOption
                    name={`${formId}-scope`}
                    value="encounter_types"
                    label="Specific record types only"
                    description="Choose exactly which categories to include."
                    checked={scope === "encounter_types"}
                    onChange={() => setScope("encounter_types")}
                  />
                </fieldset>

                {scope === "date_range" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <Field label="From" required>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="To" required>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </Field>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
                    Categories included
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map((c) => {
                      const on = categories.includes(c);
                      const locked = scope === "everything";
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => !locked && toggleCategory(c)}
                          aria-pressed={on}
                          disabled={locked}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            on
                              ? "bg-accent text-white border-accent"
                              : "bg-surface border-border text-text hover:bg-surface-muted",
                            locked && "opacity-60 cursor-not-allowed",
                          )}
                        >
                          {RECORD_CATEGORY_LABELS[c]}
                        </button>
                      );
                    })}
                  </div>
                  {scope === "everything" && (
                    <p className="text-[11px] text-text-subtle mt-2">
                      All categories are included with a complete-record
                      release. Switch to a specific scope to choose individual
                      categories.
                    </p>
                  )}
                </div>
              </Section>

              {/* Reason */}
              <Section title="Reason for release (optional)">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Establishing care with a new primary care provider."
                  className={cn(inputClass, "resize-y")}
                />
              </Section>

              {/* Signature + acknowledgement */}
              <Section title="Authorization">
                <p className="text-sm text-text-muted leading-relaxed mb-3">
                  Type your full legal name below as your electronic
                  signature. This authorization is valid for{" "}
                  <span className="font-semibold text-text">12 months</span>{" "}
                  unless you revoke it sooner.
                </p>

                <Field label="Your full legal name (signature)" required>
                  <input
                    type="text"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={patientLegalName ?? "Type your full name"}
                    className={cn(
                      inputClass,
                      signature.length > 0 && !signatureMatches &&
                        "border-[color:var(--warning)]",
                    )}
                    required
                  />
                </Field>
                {patientLegalName && signature.length > 0 && !signatureMatches && (
                  <p className="text-[12px] text-[color:var(--warning)] mt-1">
                    Please type your name exactly as it appears on your record:
                    {" "}
                    <span className="font-semibold">{patientLegalName}</span>
                  </p>
                )}

                <label className="mt-4 flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border accent-accent"
                  />
                  <span className="text-sm text-text-muted leading-relaxed">
                    I understand that I can revoke this authorization at any
                    time, and that records released before revocation cannot
                    be recalled. I confirm the recipient&rsquo;s information
                    is accurate.
                  </span>
                </label>
              </Section>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border">
                <p className="text-[11px] text-text-muted leading-relaxed max-w-md">
                  Your care team will review this request before anything is
                  sent. You&apos;ll see the status update here and in your
                  messages.
                </p>
                <Button type="submit" disabled={!canSubmit || isPending}>
                  {isPending ? "Submitting…" : "Submit for review"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card tone="raised" className="rounded-3xl">
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Your release authorizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {history.map((r) => (
                <li
                  key={r.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-text truncate">
                        {r.recipient.fullName}
                      </p>
                      <Badge tone={statusTone(r.status)}>
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {r.recipient.practice ?? ""}
                      {r.recipient.practice && " · "}
                      {new Date(r.createdAt).toLocaleDateString()}
                      {" · expires "}
                      {new Date(r.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {r.status !== "revoked" && r.status !== "declined" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(r.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function statusTone(s: RecordReleaseRequest["status"]) {
  switch (s) {
    case "approved":
    case "sent":
      return "success" as const;
    case "submitted":
      return "accent" as const;
    case "declined":
    case "revoked":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

const inputClass =
  "w-full h-11 rounded-xl border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40";

function Field({
  label,
  children,
  className,
  required,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-xs font-semibold uppercase tracking-widest text-text-muted mb-1.5">
        {label}
        {required && <span className="text-accent ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-display text-base text-text tracking-tight mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScopeOption({
  name,
  value,
  label,
  description,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors",
        checked
          ? "border-accent bg-accent-soft/40"
          : "border-border bg-surface hover:bg-surface-muted",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        <span className="block text-xs text-text-muted mt-0.5 leading-relaxed">
          {description}
        </span>
      </span>
    </label>
  );
}

function SubmittedConfirmation({
  request,
  onAnother,
}: {
  request: RecordReleaseRequest;
  onAnother: () => void;
}) {
  return (
    <Card tone="raised" className="rounded-3xl">
      <CardContent className="pt-8 pb-8 text-center max-w-xl mx-auto">
        <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <path
              d="M5 12.5l4 4 10-10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Eyebrow className="justify-center mb-2">Submitted for review</Eyebrow>
        <h3 className="font-display text-2xl text-text tracking-tight mb-2">
          We&rsquo;ve received your authorization
        </h3>
        <p className="text-sm text-text-muted leading-relaxed mb-5">
          Your care team usually reviews release requests within one business
          day. You&rsquo;ll see the status update here, and we&rsquo;ll
          message you when records are sent to{" "}
          <span className="font-semibold text-text">
            {request.recipient.fullName}
          </span>
          .
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={onAnother} variant="secondary">
            Send another release
          </Button>
          <Link href="/portal/records">
            <Button>Back to records</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
