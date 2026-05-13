"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  buildAccessAudit,
  CATEGORY_LABEL,
  decideAccess,
  type AccessAttempt,
  type BreakGlassAttestation,
  type SensitiveAccessAudit,
  type SensitivityClassification,
  type ViewerRole,
} from "@/lib/clinical/mental-health-access";

/**
 * EMR-094 — Sensitive-record access wall.
 *
 * Renders a HIPAA / 42 CFR Part 2 break-glass form between a clinician
 * and a sensitive record (psychotherapy notes, SUD treatment, suicidal
 * ideation, reproductive care, etc.). Drives the same `decideAccess`
 * state machine the audit agent watches, so on-screen behavior and
 * audit records are guaranteed to agree.
 */

interface Props {
  classification: SensitivityClassification;
  viewerRole: ViewerRole;
  viewerUserId: string;
  resource: { type: string; id: string; patientId: string };
  /** True when the viewer is the patient (bypasses wall for self-view). */
  isViewingOwnRecord?: boolean;
  hasTreatmentRelationship?: boolean;
  onUnlock: (audit: SensitiveAccessAudit) => void;
  onDeny?: (reason: string) => void;
}

export function SensitiveRecordWall({
  classification,
  viewerRole,
  viewerUserId,
  resource,
  isViewingOwnRecord,
  hasTreatmentRelationship,
  onUnlock,
  onDeny,
}: Props) {
  const [reason, setReason] = React.useState("");
  const [name, setName] = React.useState("");
  const [clinicalAck, setClinicalAck] = React.useState(false);
  const [redisclosureAck, setRedisclosureAck] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const baseAttempt = React.useMemo<AccessAttempt>(
    () => ({
      viewerRole,
      isViewingOwnRecord,
      hasTreatmentRelationship,
    }),
    [viewerRole, isViewingOwnRecord, hasTreatmentRelationship],
  );

  // Pre-attestation decision — drives whether we even render the form.
  const initialDecision = React.useMemo(
    () => decideAccess(classification, baseAttempt),
    [classification, baseAttempt],
  );

  // Fire onUnlock / onDeny side effects when the upstream decision is
  // already final (treating clinician, self-view, hard deny).
  React.useEffect(() => {
    if (!classification.isSensitive) return;
    if (initialDecision.kind === "allow") {
      const audit = buildAccessAudit(
        classification,
        baseAttempt,
        { ...resource, viewerUserId },
        initialDecision,
      );
      onUnlock(audit);
    } else if (initialDecision.kind === "deny") {
      onDeny?.(initialDecision.reason);
    }
    // We deliberately depend only on the inputs that change the decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classification, baseAttempt, initialDecision.kind]);

  if (!classification.isSensitive) return null;
  if (initialDecision.kind === "allow") return null;

  if (initialDecision.kind === "deny") {
    return (
      <Card tone="outlined" className={cn("max-w-xl mx-auto p-6")}>
        <CardHeader>
          <CardTitle>Access blocked</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">{initialDecision.reason}</p>
        </CardContent>
      </Card>
    );
  }

  const handleUnlock = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const attestation: BreakGlassAttestation = {
      reason,
      clinicianAttestation: name,
      acknowledgedClinicalPurpose: clinicalAck,
      acknowledgedRedisclosureRules: redisclosureAck,
    };
    const attempt: AccessAttempt = {
      ...baseAttempt,
      breakGlassAttestation: attestation,
    };
    const decision = decideAccess(classification, attempt);
    if (decision.kind !== "allow") {
      setError(
        "Attestation incomplete. Provide a 20+ character clinical reason, your typed full name, and acknowledge both check-boxes.",
      );
      return;
    }
    const audit = buildAccessAudit(
      classification,
      attempt,
      { ...resource, viewerUserId },
      decision,
    );
    onUnlock(audit);
  };

  return (
    <Card tone="raised" className="max-w-2xl mx-auto p-6 ring-2 ring-amber-300">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full bg-amber-600 text-white text-xs font-semibold uppercase tracking-wide px-2.5 py-1">
            Protected record
          </span>
          {classification.categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full bg-amber-50 text-amber-900 text-xs font-medium px-2 py-0.5 border border-amber-200"
            >
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        </div>
        <CardTitle className="mt-2">Confirm clinical purpose before viewing</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">{classification.rationale}</p>
        <form onSubmit={handleUnlock} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Clinical purpose for this access</span>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-accent/40"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="At least 20 characters. Describe the specific clinical reason you need this record."
              required
              minLength={20}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Type your full name (e-signature)</span>
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-accent/40"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={clinicalAck}
                onChange={(e) => setClinicalAck(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span>
                I am NOT the patient and I have a clinical purpose for accessing this record.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={redisclosureAck}
                onChange={(e) => setRedisclosureAck(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span>
                I acknowledge 42 CFR Part 2 and applicable state mental-health redisclosure rules.
              </span>
            </label>
          </div>

          {error && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Unlock record
            </Button>
          </div>
          <p className="text-[11px] text-text-muted">
            This access is recorded in the immutable audit log and reviewed weekly by the privacy officer.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
