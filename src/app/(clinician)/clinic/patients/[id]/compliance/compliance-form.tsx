"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import {
  getStateForm,
  type StateFormField,
} from "@/lib/domain/state-compliance";
import { THERAPEUTIC_INDICATIONS } from "@/lib/domain/cannabis-icd10";
import { getRegistryForState } from "@/lib/domain/state-registry";
import {
  saveComplianceForm,
  signComplianceForm,
  submitComplianceForm,
  type ComplianceFormDto,
  type FieldErrors,
  type RegistryAttempt,
} from "./actions";

// ─── Types ──────────────────────────────────────────────

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

interface ComplianceFormViewProps {
  patient: PatientInfo;
  availableStates: { code: string; name: string }[];
  defaultStateCode: string;
  prePopulatedFields: Record<string, string>;
  /** Latest persisted StateComplianceForm per state code (EMR-1095). */
  existingForms: Record<string, ComplianceFormDto>;
}

type FormStatus = "draft" | "complete" | "submitted";

// ─── ICD-10 Search Dropdown ─────────────────────────────

function ICD10SearchField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return THERAPEUTIC_INDICATIONS.filter(
      (ind) =>
        ind.condition.toLowerCase().includes(q) ||
        ind.icd10.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  return (
    <div className="relative">
      <Input
        value={query}
        disabled={disabled}
        placeholder="Search ICD-10 code or condition..."
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((ind) => (
            <button
              key={ind.icd10}
              type="button"
              className="w-full text-left px-4 py-2.5 hover:bg-surface-muted text-sm border-b border-border/40 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(ind.icd10);
                onChange(ind.icd10);
                setOpen(false);
              }}
            >
              <span className="font-mono text-accent text-xs font-medium">
                {ind.icd10}
              </span>
              <span className="text-text-muted ml-2">{ind.condition}</span>
              <Badge tone="neutral" className="ml-2 text-[9px]">
                Level {ind.evidenceLevel}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-1">
      <path
        d="M4 6V2h8v4M4 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6h11A1.5 1.5 0 0115 7.5v3a1.5 1.5 0 01-1.5 1.5H12M4 10h8v4H4v-4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────

export function ComplianceFormView({
  patient,
  availableStates,
  defaultStateCode,
  prePopulatedFields,
  existingForms,
}: ComplianceFormViewProps) {
  const params = useParams<{ id: string }>();
  const initial = existingForms[defaultStateCode] ?? null;

  const [selectedState, setSelectedState] = useState(defaultStateCode);
  const [formId, setFormId] = useState<string | null>(initial?.id ?? null);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>(
    initial ? { ...prePopulatedFields, ...initial.fields } : prePopulatedFields,
  );
  const [status, setStatus] = useState<FormStatus>(initial?.status ?? "draft");
  const [signedAt, setSignedAt] = useState<string | null>(initial?.signedAt ?? null);
  const [signedBy, setSignedBy] = useState<string | null>(initial?.signedBy ?? null);
  const [registryAttempt, setRegistryAttempt] = useState<RegistryAttempt | null>(
    initial?.registrySubmission ?? null,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const signed = Boolean(signedAt);
  const template = useMemo(() => getStateForm(selectedState), [selectedState]);
  const registry = useMemo(() => getRegistryForState(selectedState), [selectedState]);

  // WS-C task 5: dedicated print-ready packet (server-rendered, letterhead) for
  // manual filing. Available once the form is persisted (has an id); falls back
  // to the in-page window.print() before then.
  const printHref = formId
    ? `/clinic/patients/${patient.id}/compliance/print?formId=${formId}`
    : null;

  // Which fields were auto-populated (read-only)
  const autoPopKeys = useMemo(() => {
    return new Set(Object.keys(prePopulatedFields));
  }, [prePopulatedFields]);

  /** Sync all client state from a persisted form row (or reset to a fresh
   * draft when null). */
  const hydrate = useCallback(
    (form: ComplianceFormDto | null) => {
      setFormId(form?.id ?? null);
      setFormValues(
        form
          ? { ...prePopulatedFields, ...form.fields }
          : { ...prePopulatedFields },
      );
      setStatus(form?.status ?? "draft");
      setSignedAt(form?.signedAt ?? null);
      setSignedBy(form?.signedBy ?? null);
      setRegistryAttempt(form?.registrySubmission ?? null);
      setFieldErrors({});
      setActionError(null);
      setDraftSavedAt(null);
    },
    [prePopulatedFields],
  );

  const handleStateChange = useCallback(
    (code: string) => {
      setSelectedState(code);
      hydrate(existingForms[code] ?? null);
    },
    [existingForms, hydrate],
  );

  const updateField = useCallback((key: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    // Editing a field clears its inline validation error.
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSaveDraft = useCallback(() => {
    setActionError(null);
    startTransition(async () => {
      const res = await saveComplianceForm({
        patientId: patient.id,
        stateCode: selectedState,
        fields: formValues,
      });
      if (!res.ok) {
        setActionError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setFormId(res.form.id);
      setStatus(res.form.status);
      setDraftSavedAt(new Date().toISOString());
    });
  }, [patient.id, selectedState, formValues]);

  const handleSign = useCallback(() => {
    setActionError(null);
    startTransition(async () => {
      // Persist the current draft first so the signature attaches to
      // exactly what is on screen.
      const saved = await saveComplianceForm({
        patientId: patient.id,
        stateCode: selectedState,
        fields: formValues,
      });
      if (!saved.ok) {
        setActionError(saved.error);
        setFieldErrors(saved.fieldErrors ?? {});
        return;
      }
      setFormId(saved.form.id);
      const res = await signComplianceForm(saved.form.id);
      if (!res.ok) {
        setActionError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      hydrate(res.form);
    });
  }, [patient.id, selectedState, formValues, hydrate]);

  const handleSubmit = useCallback(() => {
    if (!formId) return;
    setActionError(null);
    startTransition(async () => {
      const res = await submitComplianceForm(formId);
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {});
        if (res.form) {
          // The failed/manual attempt was persisted — render it honestly.
          setRegistryAttempt(res.form.registrySubmission);
          setStatus(res.form.status);
        } else {
          setActionError(res.error);
        }
        return;
      }
      hydrate(res.form);
    });
  }, [formId, hydrate]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ─── Render field based on type ─────────────────────

  function renderField(field: StateFormField) {
    const isAutoPopulated = autoPopKeys.has(field.key) && status === "draft";
    const value = formValues[field.key] ?? "";
    const readOnly = isAutoPopulated || status !== "draft";

    switch (field.type) {
      case "text":
        return (
          <Input
            value={String(value)}
            readOnly={readOnly}
            onChange={(e) => updateField(field.key, e.target.value)}
            className={cn(readOnly && "bg-surface-muted text-text-muted cursor-not-allowed")}
          />
        );

      case "date":
        // State compliance forms (regulatory) can land on insurance effective
        // dates, expiry, certification dates — all benefit from the inline
        // calendar instead of native browser pickers.
        return readOnly ? (
          <Input
            type="text"
            value={String(value)}
            readOnly
            className={cn("bg-surface-muted text-text-muted cursor-not-allowed")}
          />
        ) : (
          <DatePicker
            value={String(value)}
            onChange={(v) => updateField(field.key, v)}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={String(value)}
            readOnly={readOnly}
            onChange={(e) => updateField(field.key, e.target.value)}
            className={cn(readOnly && "bg-surface-muted text-text-muted cursor-not-allowed")}
          />
        );

      case "select":
        return (
          <select
            value={String(value)}
            disabled={readOnly}
            onChange={(e) => updateField(field.key, e.target.value)}
            className={cn(
              "flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text",
              "transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
              readOnly && "bg-surface-muted text-text-muted cursor-not-allowed",
            )}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "checkbox":
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={readOnly}
              onChange={(e) => updateField(field.key, e.target.checked)}
              className="h-5 w-5 rounded border-border-strong text-accent focus:ring-accent/20"
            />
            <span className="text-sm text-text">{field.label}</span>
          </label>
        );

      case "icd10":
        return (
          <ICD10SearchField
            value={String(value)}
            onChange={(val) => updateField(field.key, val)}
            disabled={readOnly}
          />
        );

      case "signature":
        return (
          <div className="flex items-center gap-4">
            {signed ? (
              <div className="flex items-center gap-3">
                <div className="h-12 px-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center gap-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="text-accent"
                  >
                    <path
                      d="M7 10l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="10"
                      cy="10"
                      r="8"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                  <span className="text-sm font-medium text-accent">
                    Electronically signed
                    {signedBy ? ` — ${signedBy}` : ""}
                  </span>
                </div>
                {signedAt && (
                  <span className="text-xs text-text-muted">
                    {new Date(signedAt).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSign}
                disabled={status !== "draft" || isPending}
              >
                {isPending ? "Signing..." : "Sign electronically"}
              </Button>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  // ─── Status badge ──────────────────────────────────

  const statusTone =
    status === "submitted"
      ? "success"
      : status === "complete"
        ? "accent"
        : "warning";

  const statusLabel =
    status === "submitted"
      ? "Submitted"
      : status === "complete"
        ? "Complete"
        : "Draft";

  return (
    <div className="print:p-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div className="max-w-2xl">
          <Eyebrow className="mb-3">State compliance</Eyebrow>
          <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Compliance forms
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed">
            Generate state-required certification forms for{" "}
            <span className="font-medium text-text">
              {patient.firstName} {patient.lastName}
            </span>
            . Auto-populated fields are pre-filled from the patient chart.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone={statusTone} className="text-xs px-3 py-1">
            {statusLabel}
          </Badge>
          <Link href={`/clinic/patients/${params.id}`}>
            <Button variant="secondary" size="sm">
              Back to chart
            </Button>
          </Link>
        </div>
      </div>

      {/* State Selector */}
      <Card tone="raised" className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LeafSprig size={16} className="text-accent" />
            Select state
          </CardTitle>
          <CardDescription>
            Choose the state whose compliance form you need to generate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {availableStates.map((s) => (
              <button
                key={s.code}
                onClick={() => handleStateChange(s.code)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-all duration-200",
                  selectedState === s.code
                    ? "bg-accent/10 border-accent text-accent shadow-sm"
                    : "bg-surface border-border hover:bg-surface-muted hover:border-border-strong",
                )}
              >
                <span className="block text-lg font-display font-medium">
                  {s.code}
                </span>
                <span className="block text-[11px] text-text-muted mt-0.5 truncate">
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Form Template */}
      {template ? (
        <>
        <Card tone="raised" className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{template.formName}</CardTitle>
                <CardDescription className="mt-1.5">
                  {template.description}
                </CardDescription>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-text-subtle uppercase tracking-wider">
                  Form ID
                </p>
                <p className="text-xs font-mono text-text-muted">
                  {template.formId}
                </p>
                <p className="text-[10px] text-text-subtle mt-2">
                  Renewal: {template.renewalPeriodDays} days
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {template.requiredFields.map((field) => (
                <div key={field.key}>
                  {field.type !== "checkbox" && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <Label htmlFor={field.key}>{field.label}</Label>
                      {field.required && (
                        <span className="text-danger text-xs">*</span>
                      )}
                      {autoPopKeys.has(field.key) && (
                        <Badge tone="accent" className="text-[9px]">
                          Auto-filled
                        </Badge>
                      )}
                    </div>
                  )}
                  {renderField(field)}
                  {fieldErrors[field.key] && (
                    <p className="text-xs text-danger mt-1.5">
                      {fieldErrors[field.key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>

          <EditorialRule className="mx-6" />

          {actionError && (
            <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">{actionError}</p>
            </div>
          )}

          <CardFooter className="flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {status === "draft" && (
                <>
                  <Button onClick={handleSaveDraft} size="md" disabled={isPending}>
                    {isPending ? "Saving..." : "Save draft"}
                  </Button>
                  <span className="text-xs text-text-muted">
                    {draftSavedAt
                      ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString()}`
                      : "Sign electronically to complete the form."}
                  </span>
                </>
              )}
              {status === "complete" && (
                <Button onClick={handleSubmit} size="md" disabled={isPending}>
                  {isPending ? "Submitting..." : "Submit form"}
                </Button>
              )}
              {status === "submitted" && (
                <Button variant="secondary" size="md" disabled>
                  Submitted
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePrint}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="mr-1"
                >
                  <path
                    d="M4 6V2h8v4M4 12H2.5A1.5 1.5 0 011 10.5v-3A1.5 1.5 0 012.5 6h11A1.5 1.5 0 0115 7.5v3a1.5 1.5 0 01-1.5 1.5H12M4 10h8v4H4v-4z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                Print
              </Button>
            </div>
          </CardFooter>
        </Card>
        {/* Submit to State Registry */}
        {registry && (
          <Card tone="raised" className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LeafSprig size={16} className="text-accent" />
                Submit to state registry
              </CardTitle>
              <CardDescription>
                Submit this certification electronically to the state cannabis registry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Registry info */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-surface-muted border border-border">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-text">{registry.registryName}</p>
                    <a
                      href={registry.registryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      {registry.registryUrl}
                    </a>
                  </div>
                  <Badge
                    tone={registry.supportsElectronicSubmission ? "success" : "warning"}
                    className="text-[10px] shrink-0"
                  >
                    {registry.supportsElectronicSubmission ? "Electronic submission" : "Manual submission"}
                  </Badge>
                </div>

                {registry.notes && (
                  <p className="text-xs text-text-muted leading-relaxed">{registry.notes}</p>
                )}

                {/* Electronic submission */}
                {registry.supportsElectronicSubmission ? (
                  <div>
                    {status !== "submitted" && !registryAttempt && (
                      <Button
                        onClick={handleSubmit}
                        disabled={status !== "complete" || isPending}
                        size="md"
                        className="w-full sm:w-auto"
                      >
                        {isPending ? "Submitting..." : "Submit to registry"}
                      </Button>
                    )}
                    {status === "draft" && (
                      <p className="text-xs text-text-muted mt-2">
                        Sign the form first before submitting to the registry.
                      </p>
                    )}
                  </div>
                ) : (
                  /* Print and mail instructions */
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-800 mb-2">
                      Print and mail required
                    </p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {registry.stateName} does not support electronic submission.
                      Please print the completed form and mail it to the state registry.
                      The patient will need to submit the physician certification along with
                      their application to the state program.
                    </p>
                    {printHref ? (
                      <Link href={printHref} target="_blank" rel="noopener noreferrer" className="inline-block mt-3">
                        <Button variant="secondary" size="sm">
                          <PrinterIcon />
                          Print packet for filing
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={handlePrint} className="mt-3">
                        <PrinterIcon />
                        Print form
                      </Button>
                    )}
                  </div>
                )}

                {/* Success state — ONLY a real registry API acceptance is green.
                    A stubbed/manual result must never look like an electronic
                    submission (EMR-1096). */}
                {registryAttempt && registryAttempt.success && registryAttempt.mode === "api" && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-emerald-600 shrink-0">
                        <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      <p className="text-sm font-medium text-emerald-800">
                        Successfully submitted to registry
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      {registryAttempt.confirmationNumber && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Confirmation #</p>
                          <p className="text-sm font-mono text-emerald-900">{registryAttempt.confirmationNumber}</p>
                        </div>
                      )}
                      {registryAttempt.registryPatientId && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Registry patient ID</p>
                          <p className="text-sm font-mono text-emerald-900">{registryAttempt.registryPatientId}</p>
                        </div>
                      )}
                      {registryAttempt.expirationDate && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Expires</p>
                          <p className="text-sm text-emerald-900">{registryAttempt.expirationDate}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-2">
                      Submitted at {new Date(registryAttempt.attemptedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Manual-stub state — the registry API is not connected, so
                    nothing was transmitted. Amber, no confirmation number. */}
                {registryAttempt && registryAttempt.success && registryAttempt.mode === "manual_stub" && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                    <p className="text-sm font-medium text-amber-800">
                      Manual submission required — registry API not connected
                    </p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Form saved and signed; print the packet for manual filing.
                      No electronic submission was made and no confirmation
                      number exists.
                    </p>
                    {printHref ? (
                      <Link href={printHref} target="_blank" rel="noopener noreferrer" className="inline-block mt-1">
                        <Button variant="secondary" size="sm">
                          <PrinterIcon />
                          Print packet for filing
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={handlePrint} className="mt-1">
                        <PrinterIcon />
                        Print form
                      </Button>
                    )}
                    <p className="text-[10px] text-amber-600">
                      Attempt recorded {new Date(registryAttempt.attemptedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Error state */}
                {registryAttempt && !registryAttempt.success && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                    <p className="text-sm font-medium text-red-800">Submission failed</p>
                    <ul className="space-y-1">
                      {(registryAttempt.errors ?? ["Unknown error occurred."]).map((err, i) => (
                        <li key={i} className="text-xs text-red-700 flex items-start gap-2">
                          <span className="text-red-400 mt-0.5 shrink-0">-</span>
                          {err}
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={handleSubmit}
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        </>
      ) : (
        <Card tone="raised">
          <CardContent className="py-12 text-center">
            <p className="text-text-muted">
              No compliance form template available for the selected state.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
