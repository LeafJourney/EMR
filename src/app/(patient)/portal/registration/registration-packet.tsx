"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitRegistrationPacket, type RegistrationResult } from "./actions";
import { Button } from "@/components/ui/button";

// EMR-489 — New-patient digital registration packet: a guided multi-step flow
// (personal → insurance → consents → review) that writes to the patient record
// + creates SignedConsent rows via submitRegistrationPacket.

export interface RegistrationPrefill {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // yyyy-mm-dd or ""
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

const STEPS = ["Personal", "Insurance", "Consents", "Review"] as const;

export function RegistrationPacket({ prefill }: { prefill: RegistrationPrefill }) {
  const [state, formAction] = useFormState<RegistrationResult | null, FormData>(
    submitRegistrationPacket,
    null,
  );
  const [step, setStep] = useState(0);

  const [f, setF] = useState({ ...prefill });
  const [selfPay, setSelfPay] = useState(false);
  const [insurancePayer, setInsurancePayer] = useState("");
  const [memberId, setMemberId] = useState("");
  const [treatmentConsent, setTreatmentConsent] = useState(false);
  const [telehealthConsent, setTelehealthConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const set = (k: keyof RegistrationPrefill, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const stepValid = (() => {
    if (step === 0) return f.firstName.trim() && f.lastName.trim();
    if (step === 1) return selfPay || (insurancePayer.trim() && memberId.trim());
    if (step === 2) return treatmentConsent && privacyConsent;
    return true;
  })();

  if (state?.ok) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🌱</div>
        <h2 className="font-display text-2xl text-text mb-2">You're all set.</h2>
        <p className="text-sm text-text-muted">
          Your registration is complete. Your care team has everything they need for your first
          visit.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      {/* All state mirrored as hidden inputs so the final submit carries it. */}
      <input type="hidden" name="firstName" value={f.firstName} />
      <input type="hidden" name="lastName" value={f.lastName} />
      <input type="hidden" name="dateOfBirth" value={f.dateOfBirth} />
      <input type="hidden" name="email" value={f.email} />
      <input type="hidden" name="phone" value={f.phone} />
      <input type="hidden" name="addressLine1" value={f.addressLine1} />
      <input type="hidden" name="city" value={f.city} />
      <input type="hidden" name="state" value={f.state} />
      <input type="hidden" name="postalCode" value={f.postalCode} />
      <input type="hidden" name="selfPay" value={String(selfPay)} />
      <input type="hidden" name="insurancePayer" value={selfPay ? "" : insurancePayer} />
      <input type="hidden" name="memberId" value={selfPay ? "" : memberId} />
      <input type="hidden" name="treatmentConsent" value={String(treatmentConsent)} />
      <input type="hidden" name="telehealthConsent" value={String(telehealthConsent)} />
      <input type="hidden" name="privacyConsent" value={String(privacyConsent)} />

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`text-[11px] font-medium ${
                i === step ? "text-accent" : i < step ? "text-text-muted" : "text-text-subtle"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step bodies */}
      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input value={f.firstName} onChange={(v) => set("firstName", v)} />
          </Field>
          <Field label="Last name" required>
            <Input value={f.lastName} onChange={(v) => set("lastName", v)} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={f.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(v) => set("phone", v)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(v) => set("email", v)} />
          </Field>
          <Field label="Address">
            <Input value={f.addressLine1} onChange={(v) => set("addressLine1", v)} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={(v) => set("city", v)} />
          </Field>
          <Field label="State">
            <Input value={f.state} onChange={(v) => set("state", v)} />
          </Field>
          <Field label="ZIP">
            <Input value={f.postalCode} onChange={(v) => set("postalCode", v)} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelfPay(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                !selfPay ? "bg-accent text-accent-ink border-accent" : "bg-surface-muted text-text-muted border-border"
              }`}
            >
              I have insurance
            </button>
            <button
              type="button"
              onClick={() => setSelfPay(true)}
              className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                selfPay ? "bg-accent text-accent-ink border-accent" : "bg-surface-muted text-text-muted border-border"
              }`}
            >
              Self-pay
            </button>
          </div>
          {!selfPay && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Insurance payer" required>
                <Input value={insurancePayer} onChange={setInsurancePayer} />
              </Field>
              <Field label="Member ID" required>
                <Input value={memberId} onChange={setMemberId} />
              </Field>
            </div>
          )}
          {selfPay && (
            <p className="text-sm text-text-muted">
              No problem — you can add insurance later from your profile.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Consent
            checked={treatmentConsent}
            onChange={setTreatmentConsent}
            title="Consent to Treatment"
            body="I consent to evaluation and treatment by this practice's clinicians."
            required
          />
          <Consent
            checked={privacyConsent}
            onChange={setPrivacyConsent}
            title="Notice of Privacy Practices"
            body="I acknowledge I've received the Notice of Privacy Practices (HIPAA)."
            required
          />
          <Consent
            checked={telehealthConsent}
            onChange={setTelehealthConsent}
            title="Telehealth Consent"
            body="I consent to receiving care via secure video visits (optional)."
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2 text-sm">
          <Review label="Name" value={`${f.firstName} ${f.lastName}`.trim() || "—"} />
          <Review label="Date of birth" value={f.dateOfBirth || "—"} />
          <Review label="Contact" value={[f.phone, f.email].filter(Boolean).join(" · ") || "—"} />
          <Review
            label="Address"
            value={[f.addressLine1, f.city, f.state, f.postalCode].filter(Boolean).join(", ") || "—"}
          />
          <Review
            label="Coverage"
            value={selfPay ? "Self-pay" : `${insurancePayer} · ${memberId}`}
          />
          <Review
            label="Consents"
            value={[
              treatmentConsent && "Treatment",
              privacyConsent && "Privacy",
              telehealthConsent && "Telehealth",
            ]
              .filter(Boolean)
              .join(", ")}
          />
        </div>
      )}

      {state?.ok === false && <p className="text-xs text-danger mt-4">{state.error}</p>}

      {/* Nav */}
      <div className="flex items-center justify-between mt-6">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid}
          >
            Continue
          </Button>
        ) : (
          <SubmitButton />
        )}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Submitting…" : "Complete registration"}
    </Button>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
    />
  );
}

function Consent({
  checked,
  onChange,
  title,
  body,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer hover:border-accent/40 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/40"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">
          {title}
          {required && <span className="text-danger"> *</span>}
        </span>
        <span className="block text-xs text-text-muted mt-0.5">{body}</span>
      </span>
    </label>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <span className="text-[10px] uppercase tracking-wider text-text-subtle">{label}</span>
      <span className="text-sm text-text text-right">{value}</span>
    </div>
  );
}
