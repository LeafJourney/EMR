// /clinic/sign-off/refills/[id]/print — Rx refill authorization slip.
//
// ux/print-stylesheets-clinical (unticketed UX run).
//
// One-page printable that a pharmacy fax workflow (or front-desk back-up
// when the e-Rx route is down) can drop straight into the patient's chart
// or hand to the pharmacy. Mirrors the layout of a paper Rx pad: patient
// block, medication line with dose/qty/days, pharmacy block, prescriber
// signature block at the bottom.
//
// Source data is RefillRequest (MALLIK-007 sign-off queue). The route is
// signature-agnostic — printing an unsigned refill prints "PENDING REVIEW"
// in the status field so nobody accidentally treats a draft as authorized.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/utils/format";
import {
  PrintDocument,
  PrintSection,
  PrintField,
} from "@/components/print/PrintDocument";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Refill authorization — print" };

const STATUS_DISPLAY: Record<string, { label: string; tone: "info" | "approved" | "warn" }> = {
  new: { label: "PENDING REVIEW", tone: "warn" },
  flagged: { label: "FLAGGED — REVIEW REQUIRED", tone: "warn" },
  approved: { label: "APPROVED", tone: "approved" },
  sent: { label: "SENT TO PHARMACY", tone: "approved" },
  denied: { label: "DENIED", tone: "warn" },
};

export default async function RefillPrintPage({ params }: PageProps) {
  const user = await requireUser();
  // EMR-1111 (FO-B5): direct-URL print views carry the same PHI as the
  // sign-off queue and must gate themselves, not rely on the layout.
  if (!hasPermission(user, "notes.read")) redirect("/clinic");

  const refill = await prisma.refillRequest.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          phone: true,
          allergies: true,
        },
      },
      medication: true,
      signedBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!refill) notFound();

  const providerName =
    refill.signedBy != null
      ? `${refill.signedBy.firstName} ${refill.signedBy.lastName}`
      : `${user.firstName} ${user.lastName}`;
  const practiceName = user.organizationName ?? "Leafjourney";

  const dob = refill.patient.dateOfBirth
    ? new Date(refill.patient.dateOfBirth)
    : null;
  const age = dob
    ? Math.floor(
        (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : null;
  const dobLabel = dob
    ? `${formatDate(dob)}${age !== null ? ` (${age} y/o)` : ""}`
    : null;

  const patientAddress = [
    refill.patient.addressLine1,
    [refill.patient.city, refill.patient.state, refill.patient.postalCode]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const status = STATUS_DISPLAY[refill.status] ?? {
    label: refill.status.toUpperCase(),
    tone: "info" as const,
  };

  return (
    <PrintDocument
      eyebrow="Rx · Refill authorization"
      title={refill.medication.name}
      practiceName={practiceName}
      patientName={`${refill.patient.firstName} ${refill.patient.lastName}`}
      patientDob={dobLabel}
      patientMrn={refill.patient.id.slice(0, 12).toUpperCase()}
      providerName={providerName}
    >
      {/* Status banner — printed in the heaviest weight on the page so the
          pharmacist sees authorization state before the medication line. */}
      <PrintSection heading="Status">
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            border: `2px solid ${status.tone === "approved" ? "#1F4D37" : "#b3261e"}`,
            color: status.tone === "approved" ? "#1F4D37" : "#b3261e",
            fontWeight: 700,
            letterSpacing: "0.06em",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
            textAlign: "center",
          }}
        >
          {status.label}
        </p>
      </PrintSection>

      <PrintSection heading="Patient">
        <div className="doc-grid">
          <PrintField label="Phone" value={refill.patient.phone ?? "—"} />
          <PrintField label="Address" value={patientAddress || "—"} />
          <PrintField
            label="Allergies"
            value={
              refill.patient.allergies.length === 0
                ? "NKDA"
                : refill.patient.allergies.join(", ")
            }
          />
        </div>
      </PrintSection>

      <PrintSection heading="Medication">
        <div className="doc-grid">
          <PrintField label="Drug" value={refill.medication.name} />
          <PrintField label="Type" value={refill.medication.type} />
          <PrintField
            label="Strength / dose"
            value={refill.medication.dosage ?? "—"}
          />
          <PrintField
            label="Quantity"
            value={`${refill.requestedQty}`}
          />
          <PrintField
            label="Days supply"
            value={refill.requestedDays != null ? `${refill.requestedDays}` : "—"}
          />
          <PrintField
            label="Refills remaining"
            value={refill.status === "approved" || refill.status === "sent" ? "As authorized" : "Pending"}
          />
        </div>
      </PrintSection>

      <PrintSection heading="Pharmacy">
        <div className="doc-grid">
          <PrintField label="Name" value={refill.pharmacyName} />
          <PrintField label="Phone" value={refill.pharmacyPhone ?? "—"} />
          <PrintField label="Address" value={refill.pharmacyAddress ?? "—"} />
          <PrintField
            label="Received"
            value={formatDate(refill.receivedAt)}
          />
        </div>
      </PrintSection>

      {refill.rationale && (
        <PrintSection heading="Clinical rationale">
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{refill.rationale}</p>
        </PrintSection>
      )}

      {refill.deniedReason && (
        <PrintSection heading="Denial reason">
          <p className="doc-callout" style={{ margin: 0 }}>
            {refill.deniedReason}
          </p>
        </PrintSection>
      )}

      <PrintSection heading="Notice">
        {/* Standard pharmacy fax cover language. Keeps the document
            defensible if it's faxed and the cover sheet is lost. */}
        <p style={{ margin: 0, fontSize: "9.5pt", color: "#444" }}>
          This document contains Protected Health Information (PHI) intended
          solely for the addressed pharmacy. If you received this in error,
          please notify the sender and destroy the document. Authorization is
          valid only when signed below by the prescribing clinician.
        </p>
      </PrintSection>
    </PrintDocument>
  );
}
