import type { Metadata } from "next";
import { TermsSection } from "./terms-section";
import { TermsSignature } from "./terms-signature";
import { TermsLayout } from "./terms-layout";

export const metadata: Metadata = { title: "Terms of Service" };

const SECTIONS: { id: string; title: string; summary: string; body: React.ReactNode }[] = [
  {
    id: "acceptable-use",
    title: "1. Acceptable Use & Restrictions",
    summary:
      "AI summary: You agree to use Leafjourney for legitimate clinical or research purposes only. Don't reverse-engineer the software, build a competing EMR with it, or share your credentials with people who shouldn't have access.",
    body: (
      <>
        <p>
          The Leafjourney platform is licensed for use by clinicians, staff,
          and patients of authorized practices. Users are strictly prohibited
          from reverse-engineering, decompiling, or disassembling the
          software; using it to build a competing electronic medical record
          system or marketplace; or sharing login credentials with
          unauthorized personnel.
        </p>
        <p>
          You may not scrape, exfiltrate, or attempt to bulk-export Protected
          Health Information (PHI) outside the export pathways that
          Leafjourney provides. You may not interfere with the integrity or
          performance of the Service or attempt to circumvent the
          authentication, scope, or audit controls that protect it.
        </p>
      </>
    ),
  },
  {
    id: "regulatory-compliance",
    title: "2. Regulatory Compliance",
    summary:
      "AI summary: Both sides commit to following HIPAA, HITECH, and the privacy laws of your state. A separate Business Associate Agreement (BAA) governs how we handle PHI on your behalf.",
    body: (
      <>
        <p>
          Leafjourney and the practice user agree to strict adherence to the
          Health Insurance Portability and Accountability Act (HIPAA), the
          Health Information Technology for Economic and Clinical Health Act
          (HITECH), and any state-specific privacy laws applicable to the
          practice&apos;s jurisdiction.
        </p>
        <p>
          Practices acting as Covered Entities must execute a separate
          Business Associate Agreement (BAA) with Leafjourney that defines
          how Protected Health Information is created, received, maintained,
          or transmitted on the practice&apos;s behalf. The BAA controls in
          the event of a conflict between it and these Terms.
        </p>
      </>
    ),
  },
  {
    id: "data-ownership",
    title: "3. Data Ownership & Portability",
    summary:
      "AI summary: We own the software. You own your patient data. You can export it any time. We may use de-identified, aggregated data to improve our products and benchmark performance.",
    body: (
      <>
        <p>
          Leafjourney owns the platform, its source code, and all associated
          intellectual property. The practice retains ownership of all
          Client Data, including patient records, clinical notes, and
          outcomes data created within the Service.
        </p>
        <p>
          The practice may export Client Data at any time during the
          contract term, in industry-standard formats (CSV, FHIR R4, and
          JSON bundles). Leafjourney is granted a perpetual, royalty-free
          license to use de-identified, aggregated data for benchmarking,
          quality improvement, and research, in accordance with the HIPAA
          Safe Harbor de-identification standard.
        </p>
      </>
    ),
  },
  {
    id: "liability-disclaimer",
    title: "4. Liability Disclaimer",
    summary:
      "AI summary: Leafjourney is a tool to support clinicians, not a replacement for medical judgment. We are not liable for diagnostic decisions, medical errors, or platform outages.",
    body: (
      <>
        <p>
          Leafjourney is a clinical workflow tool. It is not a medical
          device, and it is not a substitute for the professional judgment
          of a licensed clinician. Clinical decisions — including
          diagnoses, treatment plans, and prescribing — remain the sole
          responsibility of the treating provider.
        </p>
        <p>
          To the maximum extent permitted by law, Leafjourney disclaims
          liability for medical errors, diagnostic inaccuracies, third-party
          content, and Service interruptions. Aggregate liability under
          these Terms is limited to fees paid in the twelve months
          preceding the event giving rise to the claim.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "5. Termination & Data Retrieval",
    summary:
      "AI summary: Either party can end the contract with 90 days' notice. Before access is cut off, the practice has a 30-day window to export all data.",
    body: (
      <>
        <p>
          Either party may terminate the contract for convenience with{" "}
          <strong>ninety (90) days&apos;</strong> written notice. Either
          party may terminate immediately for material breach if the breach
          is not cured within thirty (30) days of written notice.
        </p>
        <p>
          Upon termination, the practice will have a{" "}
          <strong>thirty (30) day</strong> window to retrieve Client Data
          before access is removed. Following the export window, Leafjourney
          will retain Client Data only as required by HIPAA recordkeeping
          requirements (six years, where applicable) and will then securely
          destroy it.
        </p>
      </>
    ),
  },
  {
    id: "verifying-accuracy",
    title: "6. Verifying Accuracy",
    summary:
      "AI summary: It's the practice's job to make sure patient information, medication lists, and allergies are correct. AI-generated suggestions must be reviewed before they affect care.",
    body: (
      <>
        <p>
          The practice is responsible for verifying the accuracy of patient
          information, including but not limited to medication lists,
          allergies, problem lists, immunization records, and demographic
          data. Leafjourney provides tools — including AI-generated drafts —
          to assist with documentation and reconciliation, but every entry
          that affects care must be reviewed and signed by an authorized
          clinician before it becomes part of the record.
        </p>
      </>
    ),
  },
  {
    id: "patient-consent",
    title: "7. Patient Consent",
    summary:
      "AI summary: You must collect proper consent from patients before using the platform on their behalf — including consent to share their data with the systems we connect to.",
    body: (
      <>
        <p>
          The practice must obtain all legal authorizations from patients
          required to use a digital platform on their behalf and to share
          their PHI with downstream systems Leafjourney integrates with
          (e.g., laboratories, pharmacies, dispensaries, payers).
          Leafjourney provides consent-capture tooling but is not the
          consent-holder.
        </p>
      </>
    ),
  },
  {
    id: "security-safeguards",
    title: "8. Security Safeguards",
    summary:
      "AI summary: Both sides commit to commercially reasonable security: encryption, audit logging, MFA, and basic operational hygiene like logging out of shared terminals.",
    body: (
      <>
        <p>
          Leafjourney commits to commercially reasonable administrative,
          physical, and technical safeguards, including encryption of PHI in
          transit and at rest, scoped API keys, multi-factor authentication
          for clinician accounts, and an immutable audit log of access to
          patient records.
        </p>
        <p>
          The practice is responsible for operational safeguards on its
          side: logging out of shared terminals, securing printed records,
          training staff on phishing and social engineering, and promptly
          disabling accounts of departing personnel.
        </p>
      </>
    ),
  },
  {
    id: "changes-contact",
    title: "9. Changes & Contact",
    summary:
      "AI summary: We can update these terms; we'll give notice. Reach out to neal@leafjourney.com or scott@leafjourney.com with any questions.",
    body: (
      <>
        <p>
          Leafjourney may update these Terms from time to time. Material
          changes will be communicated via the operator admin panel and via
          email to the practice&apos;s designated contact. Continued use of
          the Service after the effective date of an update constitutes
          acceptance.
        </p>
        <p>
          Questions or concerns about these Terms may be directed to{" "}
          <a
            href="mailto:neal@leafjourney.com"
            className="underline underline-offset-2 decoration-[var(--accent)]/40 hover:decoration-[var(--accent)]"
          >
            neal@leafjourney.com
          </a>{" "}
          and{" "}
          <a
            href="mailto:scott@leafjourney.com"
            className="underline underline-offset-2 decoration-[var(--accent)]/40 hover:decoration-[var(--accent)]"
          >
            scott@leafjourney.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  const tocSections = SECTIONS.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div id="terms-top" className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 print:px-0 print:py-0">
      <header className="mb-10 print:mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--leaf,#2d8b5e)] mb-2">
          Legal
        </p>
        <h1 className="font-display text-[32px] sm:text-[40px] font-normal tracking-[-1px] leading-[1.05] text-[var(--ink)]">
          Terms of Service
        </h1>
        <p className="mt-3 text-[13px] text-[var(--text-subtle)]">
          Last updated: 2026-05-09 (Draft v2 — pending outside-counsel review)
        </p>
        <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--text-soft)] max-w-[640px]">
          These Terms govern the practice&apos;s use of Leafjourney as an
          electronic medical record system, AI clinical workflow tool, and
          connected marketplace. They are based on standard EMR contracting
          practice and the Office of the National Coordinator&apos;s{" "}
          <a
            href="https://healthit.gov/wp-content/uploads/2025/03/EHR_Contracts_Untangled.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--leaf,#2d8b5e)] underline underline-offset-2 decoration-[var(--leaf,#2d8b5e)]/40 hover:decoration-[var(--leaf,#2d8b5e)]"
          >
            EHR Contracts Untangled
          </a>{" "}
          guide.
        </p>
      </header>

      <TermsLayout sections={tocSections}>
        {SECTIONS.map((s) => (
          <TermsSection key={s.id} id={s.id} title={s.title} summary={s.summary}>
            {s.body}
          </TermsSection>
        ))}

        <section id="total-summary" className="not-prose mt-12 mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted,#fafaf7)] p-6 print:bg-transparent print:border-0 print:p-0">
          <h2 className="font-display text-[20px] font-medium text-[var(--ink)] mb-2">
            Total summary
          </h2>
          <p className="text-[14.5px] leading-relaxed text-[var(--text-soft)]">
            You and Leafjourney both promise to take HIPAA seriously. We
            provide the software and the AI; you provide the clinical judgment
            and the patient consent. You own your data and can leave with it.
            The platform is a tool, not a replacement for a clinician — and
            either side can end the relationship cleanly with 90 days&apos;
            notice plus a 30-day export window.
          </p>
        </section>

        <TermsSignature />
      </TermsLayout>
    </div>
  );
}
