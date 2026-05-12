// EMR-127 — Public Foundation page.
//
// `/foundation` is the donor-facing front door: ledger snapshot,
// allocation breakdown, grant application, impact stories, and the
// 501(c)(3) compliance card. The transparent ledger detail view at
// `/advocacy/fund` is linked from here.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SITE_URL } from "@/lib/seo";
import { summarizeFund, verifyChain } from "@/lib/domain/charitable-fund";
import { buildDemoFundLedger } from "@/lib/domain/charitable-fund-demo";
import {
  LEAFJOURNEY_COMPLIANCE,
  allocationBreakdown,
  buildImpactStory,
  centsToDollarsCompact,
} from "@/lib/community/charitable-fund";

export const metadata: Metadata = {
  title: "Foundation — Leafjourney",
  description:
    "Leafjourney Charitable Foundation: a 501(c)(3) public charity dedicated to expanding access to medical cannabis. Public hash-chained ledger, grant program, and impact reporting.",
  alternates: { canonical: `${SITE_URL}/foundation` },
};

export default function FoundationPage() {
  const ledger = buildDemoFundLedger();
  const summary = summarizeFund(ledger);
  const verification = verifyChain(ledger);
  const breakdown = allocationBreakdown(summary);
  const compliance = LEAFJOURNEY_COMPLIANCE;

  // Curate three exemplar impact stories from the most recent outflows.
  const recentOutflows = ledger
    .filter((e) => e.direction === "outflow")
    .slice(-3)
    .reverse();
  const stories = recentOutflows.map((e, i) =>
    buildImpactStory({
      ledgerEntry: e,
      title: `${e.destinationCharityName ?? "Recipient"} — ${centsToDollarsCompact(e.amountCents)} delivered`,
      body:
        i === 0
          ? "A patient navigator funded by this grant connected 47 newly-diagnosed members with a clinic in their first week, with zero out-of-pocket cost."
          : i === 1
          ? "Quarterly cohort report: 312 veterans onboarded into outcome-tracked care, with measurable PTSD-scale improvements at 90 days."
          : "Pediatric epilepsy program: ratio-titration protocol now reaches 18 families monthly, replacing prior ad-hoc dosing guidance.",
      consentTag: i === 1 ? "anonymous" : "first_name",
    }),
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-[1100px] px-6 py-12">
        <header className="mb-10 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">501(c)(3) Public Charity</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Leafjourney Charitable Foundation</h1>
          <p className="mt-4 text-lg leading-relaxed text-zinc-700">
            We exist to make medical cannabis accessible to people who cannot otherwise afford it.
            Every dollar in and every dollar out is recorded on a public, append-only ledger that
            anyone can verify.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/advocacy/fund"
              className="inline-flex items-center rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Open the public ledger
            </Link>
            <a
              href="#donate"
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Donate
            </a>
            <a
              href="#grants"
              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Apply for a grant
            </a>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Total contributed" value={centsToDollarsCompact(summary.totalInflowsCents)} />
          <Stat label="Distributed to charities" value={centsToDollarsCompact(summary.totalOutflowsCents)} />
          <Stat label="Available balance" value={centsToDollarsCompact(summary.balanceCents)} />
          <Stat label="Ledger entries" value={summary.entryCount.toString()} subtext={verification.ok ? "chain verified" : `chain broken @ ${verification.brokenAt}`} />
        </section>

        <section className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-tight">Where the money comes from</h2>
            <ul className="mt-4 space-y-3">
              {breakdown.inflow.map((s) => (
                <li key={s.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.category}</span>
                    <span className="text-zinc-600">{centsToDollarsCompact(s.cents)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-emerald-600" style={{ width: `${Math.max(2, s.pct)}%` }} aria-hidden />
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{s.pct.toFixed(1)}% of contributions</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-tight">Where the money goes</h2>
            <ul className="mt-4 space-y-3">
              {breakdown.outflow.map((s) => (
                <li key={s.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.category}</span>
                    <span className="text-zinc-600">{centsToDollarsCompact(s.cents)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full bg-amber-600" style={{ width: `${Math.max(2, s.pct)}%` }} aria-hidden />
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{s.pct.toFixed(1)}% of disbursements</div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Impact stories</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stories.map((story) => (
              <article key={story.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="font-semibold tracking-tight">{story.title}</h3>
                <p className="mt-2 text-sm text-zinc-700">{story.body}</p>
                <footer className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span>{story.consentTag === "anonymous" ? "Anonymous" : "Named with consent"}</span>
                  <Link href={`/advocacy/fund#${story.ledgerEntryId}`} className="font-mono text-[10px] hover:underline">
                    verify {story.verificationToken.slice(0, 8)}
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section id="grants" className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold tracking-tight">Grant program</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-700">
            Grants are capped at $25,000 per organization per year. Applicants must be IRS-verified
            501(c)(3) public charities active for at least one year and serving cannabis-medicine
            patients. Submissions are reviewed by the patient advisory and clinical advisory
            committees.
          </p>
          <form
            action="/api/foundation/grants"
            method="post"
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <Field label="Organization legal name" name="organizationName" required />
            <Field label="EIN (XX-XXXXXXX)" name="ein" required pattern="\d{2}-\d{7}" />
            <Field label="Primary contact name" name="contactName" required />
            <Field label="Contact email" name="contactEmail" type="email" required />
            <Field label="Years operating" name="yearsActive" type="number" min={1} required />
            <Field label="Requested amount (USD)" name="requestedDollars" type="number" min={1} max={25000} required />
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">Population served</label>
              <input
                name="populationServed"
                required
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">Program description</label>
              <textarea
                name="programDescription"
                required
                minLength={100}
                rows={6}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Minimum 100 characters. Describe the program, who it serves, and how funds will be deployed."
              />
            </div>
            <div className="md:col-span-2 space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="ein501c3Verified" required className="mt-0.5" />
                <span>I attest the organization is an IRS-verified 501(c)(3) public charity in good standing.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="conflictOfInterestDeclared" required className="mt-0.5" />
                <span>I have declared all conflicts of interest with Leafjourney leadership and board.</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Submit application
              </button>
            </div>
          </form>
        </section>

        <section id="donate" className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold tracking-tight">Donate</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-700">
            All donations are tax-deductible to the fullest extent allowed by law. {compliance.attestation}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/portal/volunteer#donate"
              className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Donate via member portal
            </Link>
            <Link
              href="/legal/donor-faq"
              className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Donor FAQ
            </Link>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-lg font-semibold tracking-tight">501(c)(3) Compliance</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <CompliancePair label="Legal name" value={compliance.legalName} />
            <CompliancePair label="EIN" value={compliance.ein} />
            <CompliancePair label="IRS determination" value={compliance.irsDeterminationDate} />
            <CompliancePair label="Classification" value={compliance.publicCharityClassification} />
            <CompliancePair label="Board members" value={`${compliance.boardSize} (${compliance.independentBoardMembers} independent)`} />
            <CompliancePair label="Last audit" value={compliance.lastAuditAt} />
            <CompliancePair label="Program services" value={`${compliance.programServiceRatioPct}%`} />
            <CompliancePair label="Fundraising" value={`${compliance.fundraisingRatioPct}%`} />
            <CompliancePair label="Management" value={`${compliance.managementRatioPct}%`} />
          </dl>
          <p className="mt-4 text-xs text-zinc-600">
            <Link href={compliance.formNineNinetyUrl} className="underline">
              Form 990 (latest filing)
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Stat({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-zinc-500">{subtext}</div> : null}
    </div>
  );
}

function CompliancePair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  pattern,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  pattern?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        pattern={pattern}
        min={min}
        max={max}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
