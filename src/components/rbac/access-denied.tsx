// EMR-786 — Rendered when a user lands on a chart section their role
// (or the chart's privacy flag) does not permit. We keep the surface
// minimal and intentional: no PHI leaks, no fallback to a "preview"
// view, no toast — just a clear, calm message and a path back.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AccessDeniedProps {
  /** Why this surface is denying access. Surfaced verbatim to the user. */
  reason?: string;
  /** Hard-coded fallback path users can navigate to. Defaults to roster. */
  backHref?: string;
  backLabel?: string;
}

export function AccessDenied({
  reason,
  backHref = "/clinic/patients",
  backLabel = "Back to patient roster",
}: AccessDeniedProps) {
  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle>Access denied</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {reason ?? "Your role does not permit access to this chart section."}
        </p>
        <p className="text-xs text-muted-foreground">
          If you believe you should have access, contact your practice
          administrator. All access attempts are audited.
        </p>
        <Link
          href={backHref}
          className="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {backLabel}
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Drop-in placeholder for a chart card whose section is restricted by
 * role (front office on the medical-notes card, etc.). Inline variant
 * of AccessDenied that doesn't take up the full page.
 */
export function MaskedSection({
  label = "Restricted",
  hint,
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground/70">{hint}</div>
      ) : null}
    </div>
  );
}
