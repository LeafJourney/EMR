/**
 * EMR-081 — OCR scan & auto-populate
 *
 * Inbound counterpart to record release: a clinician drops in the OCR
 * output of a scanned outside record and the engine extracts structured
 * chart fields, then reconciles them against the chart so the clinician
 * applies only what's new and reviews only what conflicts.
 *
 * The extraction + merge math lives in the pure engines under
 * `@/lib/clinical/` (ocr-extract, ocr-chart-merge, ocr-review); this
 * page is just the shell + a thin client review surface.
 */

import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { OcrReviewClient } from "./ocr-review-client";

export const metadata = { title: "OCR scan & auto-populate" };

export default async function OcrScanPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Records"
        title="Scan & auto-populate"
        description="Turn an OCR'd outside record into a reviewed chart patch. Fields are extracted, scored for confidence, and reconciled against the chart — adds, conflicts, and duplicates separated so nothing is overwritten by accident."
      />
      <OcrReviewClient />
    </PageShell>
  );
}
