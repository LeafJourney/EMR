import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata = {
  title: "About — Leafjourney",
  description:
    "Meet the founders behind Leafjourney: visionaries rebuilding healthcare from the ground up.",
};

const FOUNDERS = [
  {
    name: "Dr. Neal H. Patel, D.O.",
    title: "Co-Founder & CEO",
    bio: "Physician, innovator, and cannabis medicine pioneer. Dr. Patel combines decades of clinical experience with a fearless vision for patient-centered care. A true shaman of modern medicine — blending evidence-based practice with deep compassion for every patient's journey.",
    initials: "NP",
    gradient: "from-accent to-accent-strong",
  },
  {
    name: "Scott Wayman",
    title: "Co-Founder & Chief Product and Technology Officer",
    bio: "AI architect, serial entrepreneur, and EMR visionary. Scott brings deep expertise in artificial intelligence and enterprise software to reimagine what a medical record system can be. His mission: build technology that serves the human, not the other way around.",
    initials: "SW",
    gradient: "from-highlight to-highlight-hover",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      {/* Ambient wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 85% 10%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 50% 60% at 10% 90%, var(--accent-soft), transparent 60%)",
        }}
      />

      <SiteHeader />

      <main id="main-content">

      {/* Hero — added a CTA pair (UX polish pass). Marketing pages
          should never dead-end; visitors landing on /about from a
          search result or PR mention had no next step. */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-12 pb-16">
        <Eyebrow className="mb-6">Our story</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl">
          We didn&apos;t set out to disrupt healthcare.
          <br />
          <span className="text-accent">We set out to rebuild it.</span>
        </h1>
        <p className="text-[17px] md:text-lg text-text-muted mt-7 max-w-2xl leading-relaxed">
          As doctors and patients, we are done with the current EMR models.
          They&apos;re outdated, archaic, not user friendly, and intimidating.
          We aim to create a revolutionary new EMR from scratch.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/book-demo">
            <Button size="lg">Request a demo</Button>
          </Link>
          <Link href="/features">
            <Button size="lg" variant="secondary">
              Tour the platform
            </Button>
          </Link>
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Mission Statement */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-3xl mx-auto text-center">
            <LeafSprig size={32} className="text-accent mx-auto mb-6" />
            <blockquote className="font-display text-2xl md:text-3xl text-text tracking-tight leading-snug">
              &ldquo;This isn&apos;t MyChart. This is MyStory.<br />
              This isn&apos;t a patient&apos;s medical history. This is a patient&apos;s medical journey.<br />
              This isn&apos;t a patient&apos;s problem, it&apos;s a patient&apos;s process.&rdquo;
            </blockquote>
            <p className="text-text-muted mt-6 text-[15px] leading-relaxed max-w-xl mx-auto">
              We will not disrupt healthcare. We will destroy it and rebuild it
              the right way — with heart, with soul, and with technology that
              serves the human being at its center.
            </p>
            <p className="text-accent mt-5 text-sm font-medium tracking-wide">
              — Dr. Neal H. Patel
            </p>
          </div>
        </div>
      </section>

      {/* Founders */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-20">
        <div className="max-w-2xl mb-14">
          <Eyebrow className="mb-4">Meet our team</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Built by people who live this every day.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          {FOUNDERS.map((founder) => (
            <article
              key={founder.name}
              className="relative bg-surface-raised rounded-2xl border border-border p-8 shadow-md overflow-hidden card-hover"
            >
              <div
                className={`w-24 h-24 rounded-full bg-gradient-to-br ${founder.gradient} flex items-center justify-center mb-6 shadow-lg ring-4 ring-white/40`}
              >
                <span className="font-display text-3xl text-white/95 select-none">
                  {founder.initials}
                </span>
              </div>
              <h3 className="font-display text-xl text-text tracking-tight">
                {founder.name}
              </h3>
              <p className="text-xs text-accent font-medium uppercase tracking-wider mt-1">
                {founder.title}
              </p>
              <p className="text-sm text-text-muted mt-4 leading-relaxed">
                {founder.bio}
              </p>
            </article>
          ))}
        </div>

        {/* C-Suite + Teams — EMR-170 */}
        <div className="mt-16 max-w-4xl">
          <Eyebrow className="mb-4">Leadership</Eyebrow>
          <h2 className="font-display text-2xl text-text tracking-tight mb-3">
            The people building Leafjourney
          </h2>
          <p className="text-sm text-text-muted leading-relaxed mb-8 max-w-2xl">
            Two founders, eight C-suite seats, and a half-dozen specialized
            teams. We hire slowly and deliberately — every role here will help
            shape how cannabis medicine is practiced for the next decade.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {EXECS.map((exec) =>
              exec.filled ? (
                <div
                  key={exec.role}
                  className="bg-surface-raised rounded-xl border border-border p-4"
                >
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                    <span className="text-sm font-medium text-accent">
                      {exec.initials}
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {exec.role}
                  </p>
                  <p className="text-xs font-medium text-text mt-1">
                    {exec.name}
                  </p>
                  <p className="text-[11px] text-text-subtle mt-0.5">
                    {exec.title}
                  </p>
                  <p className="text-[11px] text-text-muted leading-relaxed mt-2">
                    {exec.focus}
                  </p>
                </div>
              ) : (
                <Link
                  key={exec.role}
                  href={`/contact?role=${encodeURIComponent(exec.role)}`}
                  className="block bg-surface-muted rounded-xl border border-dashed border-border p-4 hover:border-accent/60 hover:bg-surface transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-3 border border-dashed border-border group-hover:border-accent/40">
                    <span className="text-sm text-text-subtle select-none group-hover:text-accent">
                      +
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {exec.role}
                  </p>
                  <p className="text-xs font-medium text-text-muted mt-1">
                    Open seat
                  </p>
                  <p className="text-[11px] text-text-subtle mt-0.5">
                    {exec.title}
                  </p>
                  <p className="text-[11px] text-text-muted leading-relaxed mt-2">
                    {exec.focus}
                  </p>
                  <p className="text-[10px] font-medium text-accent uppercase tracking-wider mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    Apply →
                  </p>
                </Link>
              )
            )}
          </div>

          <Eyebrow className="mb-4">Specialized teams</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
            {TEAMS.map((team) => (
              <Link
                key={team.name}
                href={`/contact?role=${encodeURIComponent(team.name)}`}
                className="group relative flex items-start gap-3 px-4 py-3 rounded-lg bg-surface border border-border/60 hover:border-accent/60 hover:bg-surface-raised transition-all"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-2" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">{team.name}</p>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                    {team.desc}
                  </p>
                </div>
                <span className="absolute top-2 right-3 text-[10px] font-semibold uppercase tracking-wider text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Apply →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Values */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
        <div className="max-w-2xl mb-14">
          <Eyebrow className="mb-4">What we believe</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Principles that guide every line of code.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {VALUES.map((value, i) => (
            <div
              key={value.title}
              className="flex gap-5 bg-surface-raised rounded-2xl border border-border p-7 shadow-sm card-hover"
            >
              <span className="font-display text-[32px] leading-none text-accent/30 select-none shrink-0">
                0{i + 1}
              </span>
              <div>
                <h3 className="font-display text-lg text-text tracking-tight">
                  {value.title}
                </h3>
                <p className="text-sm text-text-muted mt-2 leading-relaxed">
                  {value.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-2xl">
            <Eyebrow className="mb-4">Join us</Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              This is just the beginning.
            </h2>
            <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
              Whether you&apos;re a patient seeking better care, a provider
              ready for better tools, or a partner who shares our vision —
              we&apos;d love to hear from you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* B2B funnel — /book-demo, not Clerk /sign-up. */}
              <Link href="/book-demo">
                <Button size="lg">Request a demo</Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="ghost">
                  Get in touch
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}

const EXECS: {
  role: string;
  title: string;
  name: string;
  initials: string;
  filled: boolean;
  focus: string;
}[] = [
  {
    role: "CEO",
    title: "Chief Executive Officer",
    name: "Dr. Neal H. Patel, D.O.",
    initials: "NP",
    filled: true,
    focus: "Clinical vision, partnerships, and patient-centered strategy.",
  },
  {
    role: "CPTO",
    title: "Chief Product & Technology Officer",
    name: "Scott Wayman",
    initials: "SW",
    filled: true,
    focus: "AI architecture, platform engineering, and product velocity.",
  },
  {
    role: "CMO",
    title: "Chief Medical Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus: "Clinical governance, evidence reviews, and physician network.",
  },
  {
    role: "CSO",
    title: "Chief Scientific Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus: "Cannabis research corpus, real-world-evidence pipelines, IRB strategy.",
  },
  {
    role: "COO",
    title: "Chief Operating Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus: "Practice operations, revenue cycle, and clinic onboarding.",
  },
  {
    role: "CFO",
    title: "Chief Financial Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus: "Financial planning, payer contracts, and capital strategy.",
  },
  {
    role: "CIO",
    title: "Chief Information Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus: "HIPAA compliance, security posture, and infrastructure resilience.",
  },
  {
    role: "CRO",
    title: "Chief Regulatory Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus:
      "General counsel and regulatory lead. Owns HIPAA, BAA, state cannabis licensing, FDA/DEA posture, and contract review.",
  },
  {
    role: "CPO",
    title: "Chief Product Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus:
      "Vets product validity and decides which products sit on TheLeafMart. Owns vendor diligence, COA review, and product strategy.",
  },
  {
    role: "CREVO",
    title: "Chief Revenue Officer",
    name: "Open",
    initials: "+",
    filled: false,
    focus:
      "Owns lead generation, provider acquisition, and MRR. Builds the sales engine that brings clinicians and clients onto Leafjourney.",
  },
];

const TEAMS: { name: string; desc: string }[] = [
  { name: "Cannabis Care", desc: "Clinical protocols, dosing, and outcome tracking for medical cannabis patients." },
  { name: "Fitness & Movement", desc: "Movement-as-medicine programs integrated with the patient care plan." },
  { name: "Spiritual Wellness", desc: "Mindfulness, meditation, and ritual practices that support whole-person healing." },
  { name: "Psilocybin Research", desc: "Tracking emerging clinical evidence and protocol development for psychedelic care." },
  { name: "Veterans Affairs", desc: "Trauma-informed cannabis and mental health workflows tailored to veteran populations." },
  { name: "Veterinary", desc: "Cannabinoid therapeutics for companion animals — dosing, safety, and outcomes." },
  { name: "First Responders", desc: "Specialized care pathways for first responders managing chronic pain and PTSD." },
  { name: "Mental Health", desc: "Integrated psychiatric care, medication management, and behavioral health support." },
];

const VALUES = [
  {
    title: "Patients are people, not charts",
    body: "Every feature we build starts with one question: does this make the human being at the center feel seen, heard, and cared for?",
  },
  {
    title: "Cannabis is medicine",
    body: "We treat cannabis with the same rigor as any pharmaceutical — evidence-based dosing, drug interaction checking, outcome tracking, and clinical documentation.",
  },
  {
    title: "AI serves the clinician",
    body: "Our AI agents draft notes, suggest codes, and surface research — but the physician always has final authority. Technology amplifies care, never replaces it.",
  },
  {
    title: "Data belongs to the patient",
    body: "Your health data is yours. We build with privacy by design, HIPAA compliance, and the conviction that patients should own their medical story.",
  },
];
