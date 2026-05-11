import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  title: "Team — Leafjourney",
  description:
    "The C-suite, leadership, and advisory board behind Leafjourney — the cannabis EMR rebuilding healthcare from the ground up.",
};

interface Executive {
  role: string;
  title: string;
  name: string;
  initials: string;
  filled: boolean;
  bio?: string;
  focus: string;
  linkedinUrl?: string;
  photoSrc?: string;
}

const EXECS: Executive[] = [
  {
    role: "CEO",
    title: "Chief Executive Officer",
    name: "Dr. Neal H. Patel, D.O.",
    initials: "NP",
    filled: true,
    bio: "Physician, innovator, and cannabis medicine pioneer. Decades of clinical experience, a fearless vision for patient-centered care, and the founding voice behind Leafjourney's clinical strategy.",
    focus: "Clinical vision, partnerships, and patient-centered strategy.",
    linkedinUrl: "https://www.linkedin.com/in/neal-patel-md",
  },
  {
    role: "CPTO",
    title: "Chief Product & Technology Officer",
    name: "Scott Wayman",
    initials: "SW",
    filled: true,
    bio: "AI architect, serial entrepreneur, and EMR visionary. Brings deep expertise in artificial intelligence and enterprise software to reimagine what a medical record system can be.",
    focus: "AI architecture, platform engineering, and product velocity.",
    linkedinUrl: "https://www.linkedin.com/in/scott-wayman",
  },
  {
    role: "CMO",
    title: "Chief Medical Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "Clinical governance, evidence reviews, and physician network.",
  },
  {
    role: "CSO",
    title: "Chief Scientific Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "Cannabis research corpus, real-world-evidence pipelines, IRB strategy.",
  },
  {
    role: "COO",
    title: "Chief Operating Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "Practice operations, revenue cycle, and clinic onboarding.",
  },
  {
    role: "CFO",
    title: "Chief Financial Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "Financial planning, payer contracts, and capital strategy.",
  },
  {
    role: "CIO",
    title: "Chief Information Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "HIPAA compliance, security posture, and infrastructure resilience.",
  },
  {
    role: "CHRO",
    title: "Chief Human Resources Officer",
    name: "Open seat",
    initials: "+",
    filled: false,
    focus: "Talent, culture, and clinician retention.",
  },
];

interface Advisor {
  name: string;
  title: string;
  initials: string;
  contribution: string;
  linkedinUrl?: string;
}

const ADVISORS: Advisor[] = [
  {
    name: "Justin Kander",
    title: "Cannabis researcher & author, Cannabis & Cancer",
    initials: "JK",
    contribution:
      "Independent cannabis research lead and author of the Cannabis & Cancer corpus. Advisor on the ChatCB knowledge base and the Combo Wheel evidence model.",
    linkedinUrl: "https://www.linkedin.com/in/justin-kander",
  },
  {
    name: "Open seat",
    title: "Healthcare policy advisor",
    initials: "+",
    contribution:
      "Looking for a former state health-department official with cannabis-program experience.",
  },
  {
    name: "Open seat",
    title: "Payer strategy advisor",
    initials: "+",
    contribution:
      "Looking for a former payer-side executive who has stood up new clinical-program reimbursement.",
  },
  {
    name: "Open seat",
    title: "Patient advocacy advisor",
    initials: "+",
    contribution:
      "Looking for a recognized patient advocate from the medical cannabis community.",
  },
];

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
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

      {/* Hero */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-12 pb-12">
        <Eyebrow className="mb-6">Our team</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl">
          The people building <span className="text-accent">Leafjourney</span>.
        </h1>
        <p className="text-[17px] md:text-lg text-text-muted mt-7 max-w-2xl leading-relaxed">
          Two founders, eight C-suite seats, and an advisory board we hire
          slowly and deliberately for. Every role here helps shape how
          cannabis medicine gets practiced for the next decade.
        </p>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Mission + Vision */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-surface-raised rounded-2xl border border-border p-8 shadow-sm ambient">
            <Eyebrow className="mb-4">Mission</Eyebrow>
            <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-[1.15]">
              Make cannabis medicine practiceable.
            </h2>
            <p className="text-[15px] text-text-muted mt-5 leading-relaxed">
              Build the EMR a cannabis-medicine practice would design for
              itself if it could. Every workflow, every data point, every
              outcome scale exists because a real clinician asked us to
              build it.
            </p>
          </div>
          <div className="bg-surface-raised rounded-2xl border border-border p-8 shadow-sm ambient">
            <Eyebrow className="mb-4">Vision</Eyebrow>
            <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-[1.15]">
              The default cannabis EMR by 2028.
            </h2>
            <p className="text-[15px] text-text-muted mt-5 leading-relaxed">
              When a clinician opens a cannabis-medicine practice, the
              question they ask is &ldquo;which Leafjourney module mix?&rdquo;
              — the same way an orthopedic practice asks which Epic build.
              Practice-grade cannabis care, normalized.
            </p>
          </div>
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* C-Suite */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Executive team</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            The C-suite.
          </h2>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
            Two seats filled. Six open. We&apos;d rather wait for the right
            person than fill a seat to fill a slide.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {EXECS.map((exec) =>
            exec.filled ? (
              <article
                key={exec.role}
                className="bg-surface-raised rounded-2xl border border-border p-6 shadow-sm card-hover"
              >
                <PhotoFrame initials={exec.initials} src={exec.photoSrc} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent mt-5">
                  {exec.role}
                </p>
                <h3 className="font-display text-xl text-text tracking-tight mt-1">
                  {exec.name}
                </h3>
                <p className="text-xs text-text-subtle mt-1">{exec.title}</p>
                {exec.bio && (
                  <p className="text-[13px] text-text-muted mt-3 leading-relaxed">
                    {exec.bio}
                  </p>
                )}
                <p className="text-[12px] text-text-muted mt-3 leading-relaxed">
                  <span className="text-text font-medium">Focus: </span>
                  {exec.focus}
                </p>

                {exec.linkedinUrl && (
                  <a
                    href={exec.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-[12px] text-accent hover:underline"
                    aria-label={`${exec.name} on LinkedIn (opens in new tab)`}
                  >
                    LinkedIn ↗
                  </a>
                )}
              </article>
            ) : (
              <Link
                key={exec.role}
                href={`/contact?role=${encodeURIComponent(exec.role)}`}
                className="block bg-surface-muted rounded-2xl border border-dashed border-border p-6 hover:border-accent/60 hover:bg-surface transition-all group"
              >
                <PhotoFrame initials={exec.initials} dashed />
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent mt-5">
                  {exec.role}
                </p>
                <h3 className="font-display text-lg text-text-muted tracking-tight mt-1">
                  {exec.name}
                </h3>
                <p className="text-xs text-text-subtle mt-1">{exec.title}</p>
                <p className="text-[12px] text-text-muted mt-3 leading-relaxed">
                  {exec.focus}
                </p>
                <p className="text-[10px] font-medium text-accent uppercase tracking-wider mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  Apply →
                </p>
              </Link>
            )
          )}
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Advisory board */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Advisory board</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            People we listen to.
          </h2>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
            Researchers, policy hands, and patient advocates whose work
            shaped the EMR before we wrote a single line of it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADVISORS.map((advisor) =>
            advisor.linkedinUrl ? (
              <article
                key={advisor.name}
                className="bg-surface-raised rounded-2xl border border-border p-6 shadow-sm card-hover"
              >
                <div className="flex items-start gap-4">
                  <PhotoFrame initials={advisor.initials} compact />
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-text tracking-tight">
                      {advisor.name}
                    </h3>
                    <p className="text-xs text-text-subtle mt-1">{advisor.title}</p>
                    <p className="text-[13px] text-text-muted mt-3 leading-relaxed">
                      {advisor.contribution}
                    </p>
                    <a
                      href={advisor.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-[12px] text-accent hover:underline"
                      aria-label={`${advisor.name} on LinkedIn (opens in new tab)`}
                    >
                      LinkedIn ↗
                    </a>
                  </div>
                </div>
              </article>
            ) : (
              <Link
                key={advisor.title}
                href={`/contact?role=advisor&seat=${encodeURIComponent(advisor.title)}`}
                className="block bg-surface-muted rounded-2xl border border-dashed border-border p-6 hover:border-accent/60 hover:bg-surface transition-all group"
              >
                <div className="flex items-start gap-4">
                  <PhotoFrame initials="+" compact dashed />
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-text-muted tracking-tight">
                      {advisor.name}
                    </h3>
                    <p className="text-xs text-text-subtle mt-1">{advisor.title}</p>
                    <p className="text-[13px] text-text-muted mt-3 leading-relaxed">
                      {advisor.contribution}
                    </p>
                    <p className="text-[10px] font-medium text-accent uppercase tracking-wider mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      Nominate →
                    </p>
                  </div>
                </div>
              </Link>
            )
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-2xl">
            <Eyebrow className="mb-4">Join us</Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              We&apos;re hiring deliberately.
            </h2>
            <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
              Senior clinicians, researchers, and operators — if you&apos;ve
              done the thing once and want to do it again, better, write to
              us with your story.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact">
                <Button size="lg">Reach out</Button>
              </Link>
              <Link href="/about">
                <Button size="lg" variant="ghost">
                  Back to About
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

function PhotoFrame({
  initials,
  src,
  compact = false,
  dashed = false,
}: {
  initials: string;
  src?: string;
  compact?: boolean;
  dashed?: boolean;
}) {
  const size = compact ? "w-14 h-14" : "w-20 h-20";
  if (src) {
    return (
      <div
        className={`${size} rounded-full overflow-hidden ring-2 ring-white/40 shrink-0`}
        style={{ backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }}
        role="img"
        aria-label="Team member portrait"
      />
    );
  }
  return (
    <div
      className={`${size} rounded-full ${
        dashed
          ? "bg-surface border border-dashed border-border"
          : "bg-gradient-to-br from-accent to-accent-strong shadow-lg ring-4 ring-white/40"
      } flex items-center justify-center shrink-0`}
    >
      <span
        className={`font-display ${compact ? "text-xl" : "text-2xl"} ${
          dashed ? "text-text-subtle" : "text-white/95"
        } select-none flex items-center gap-1`}
      >
        {dashed && <LeafSprig size={14} className="text-text-subtle/60" />}
        {initials}
      </span>
    </div>
  );
}
