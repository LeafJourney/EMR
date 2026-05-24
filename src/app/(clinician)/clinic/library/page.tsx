import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditorialRule, LeafSprig } from "@/components/ui/ornament";
import Link from "next/link";
import { getAllInteractions } from "@/lib/domain/drug-interactions";
import { PdfExportButton } from "./pdf-export-button";
import { InteractionBubbles } from "./interaction-bubbles";
import { getCurrentUser } from "@/lib/auth/session";
import { isModalityEnabled } from "@/lib/modality/server";
import { ChatCB } from "../research/chat-cb";

export const metadata = { title: "Clinical Library" };

export default async function LibraryPage() {
  const user = await getCurrentUser();
  const cannabisEnabled = user?.organizationId
    ? await isModalityEnabled(user.organizationId, "cannabis-medicine")
    : false;
  const interactions = getAllInteractions();
  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Library"
        title="Clinical reference"
        description="Quick-reference pharmacology, dosing guidelines, coding, and research for cannabis medicine."
        actions={<PdfExportButton />}
      />

      {/* Cannabinoid pharmacology */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LeafSprig size={16} className="text-accent/80" />
            Cannabinoid pharmacology
          </CardTitle>
        </CardHeader>
        <CardContent className="prose-clinical">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Cannabinoid</th>
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Receptors</th>
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Key CYP enzymes</th>
                  <th className="py-2 font-medium text-text-subtle text-xs uppercase tracking-wide">Clinical effects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">THC</td>
                  <td className="py-3 pr-4 text-text-muted">CB1 (partial agonist), CB2</td>
                  <td className="py-3 pr-4 font-mono text-xs text-text-muted">CYP2C9, CYP3A4</td>
                  <td className="py-3 text-text-muted">Analgesia, antiemetic, appetite stimulation, anxiolysis (low dose), psychoactive</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">CBD</td>
                  <td className="py-3 pr-4 text-text-muted">CB1 (negative allosteric modulator), 5-HT1A, TRPV1</td>
                  <td className="py-3 pr-4 font-mono text-xs text-text-muted">CYP2D6, CYP3A4, CYP2C19</td>
                  <td className="py-3 text-text-muted">Anxiolytic, anti-inflammatory, anticonvulsant, non-intoxicating</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">CBN</td>
                  <td className="py-3 pr-4 text-text-muted">CB1 (weak), CB2</td>
                  <td className="py-3 pr-4 font-mono text-xs text-text-muted">CYP2C9</td>
                  <td className="py-3 text-text-muted">Mildly sedating, anti-inflammatory, appetite stimulation</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">CBG</td>
                  <td className="py-3 pr-4 text-text-muted">CB1, CB2, 5-HT1A, TRPV1</td>
                  <td className="py-3 pr-4 font-mono text-xs text-text-muted">Limited data</td>
                  <td className="py-3 text-text-muted">Anxiolytic, anti-inflammatory, neuroprotective (emerging)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Terpene pharmacology */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LeafSprig size={16} className="text-accent/80" />
            Terpene pharmacology
          </CardTitle>
        </CardHeader>
        <CardContent className="prose-clinical">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Terpene</th>
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Aroma Profile</th>
                  <th className="py-2 font-medium text-text-subtle text-xs uppercase tracking-wide">Clinical effects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">Myrcene</td>
                  <td className="py-3 pr-4 text-text-muted">Earthy, musky, herbal</td>
                  <td className="py-3 text-text-muted">Sedating, muscle relaxant, enhances THC psychoactivity (blood-brain barrier permeability)</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">Limonene</td>
                  <td className="py-3 pr-4 text-text-muted">Citrus, lemon, orange</td>
                  <td className="py-3 text-text-muted">Elevated mood, stress relief, anxiolytic, mild antidepressant</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">Pinene</td>
                  <td className="py-3 pr-4 text-text-muted">Pine, sharp, sweet</td>
                  <td className="py-3 text-text-muted">Alertness, memory retention (acetylcholinesterase inhibitor), bronchodilator</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">Linalool</td>
                  <td className="py-3 pr-4 text-text-muted">Floral, lavender, spicy</td>
                  <td className="py-3 text-text-muted">Anxiolytic, sedative, anticonvulsant, pain relief</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-text">Beta-Caryophyllene</td>
                  <td className="py-3 pr-4 text-text-muted">Pepper, spicy, woody</td>
                  <td className="py-3 text-text-muted">CB2 agonist, anti-inflammatory, analgesic, gastroprotective</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dosing guidelines */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Dosing guidelines by condition</CardTitle>
          <CardDescription>Evidence-based starting doses from the research database. Titrate based on response.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Condition</th>
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Product</th>
                  <th className="py-2 pr-4 font-medium text-text-subtle text-xs uppercase tracking-wide">Starting dose</th>
                  <th className="py-2 font-medium text-text-subtle text-xs uppercase tracking-wide">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr><td className="py-3 pr-4 text-text">Chronic pain</td><td className="py-3 pr-4 text-text-muted">THC:CBD 1:1 spray</td><td className="py-3 pr-4 text-text-muted">2.5mg THC + 2.5mg CBD, 3x/day</td><td className="py-3"><Badge tone="accent">RCT</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">Neuropathic pain</td><td className="py-3 pr-4 text-text-muted">CBD oral</td><td className="py-3 pr-4 text-text-muted">150mg CBD, 2x/day</td><td className="py-3"><Badge tone="accent">Clinical trial</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">CINV</td><td className="py-3 pr-4 text-text-muted">THC:CBD capsules</td><td className="py-3 pr-4 text-text-muted">2.5mg THC + 2.5mg CBD, 3x/day</td><td className="py-3"><Badge tone="accent">Phase II/III</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">Insomnia</td><td className="py-3 pr-4 text-text-muted">THC:CBN:CBD sublingual</td><td className="py-3 pr-4 text-text-muted">10mg THC + 1mg CBN + 0.5mg CBD, nightly</td><td className="py-3"><Badge tone="accent">RCT</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">Anxiety</td><td className="py-3 pr-4 text-text-muted">CBD oral</td><td className="py-3 pr-4 text-text-muted">50-300mg CBD/day</td><td className="py-3"><Badge tone="neutral">Mixed</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">Appetite (cancer)</td><td className="py-3 pr-4 text-text-muted">THC oral</td><td className="py-3 pr-4 text-text-muted">2.5mg THC, 3x/day after meals</td><td className="py-3"><Badge tone="accent">Phase II</Badge></td></tr>
                <tr><td className="py-3 pr-4 text-text">Migraine</td><td className="py-3 pr-4 text-text-muted">THC:CBD flower</td><td className="py-3 pr-4 text-text-muted">6% THC / 11% CBD, vaporized PRN</td><td className="py-3"><Badge tone="accent">RCT</Badge></td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-subtle mt-4">
            Source: Curated research database (50+ studies). See{" "}
            <Link href="/clinic/research" className="text-accent hover:underline">Research Console</Link>{" "}
            for full citations and evidence search.
          </p>
        </CardContent>
      </Card>

      <EditorialRule className="my-8" />

      {/* ICD-10 coding */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>ICD-10 coding for cannabis medicine</CardTitle>
          <CardDescription>Common diagnostic codes for cannabis-related visits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { code: "F12.10", label: "Cannabis use disorder, mild" },
              { code: "F12.20", label: "Cannabis use disorder, moderate/severe" },
              { code: "F12.90", label: "Cannabis use, unspecified" },
              { code: "Z71.89", label: "Other specified counseling (cannabis counseling)" },
              { code: "F41.1", label: "Generalized anxiety disorder" },
              { code: "F32.9", label: "Major depressive disorder, unspecified" },
              { code: "G47.00", label: "Insomnia, unspecified" },
              { code: "G89.29", label: "Other chronic pain" },
              { code: "R11.0", label: "Nausea" },
              { code: "G43.909", label: "Migraine, unspecified" },
              { code: "F43.10", label: "PTSD, unspecified" },
              { code: "T40.7X1A", label: "Poisoning by cannabis, accidental, initial" },
            ].map((item) => (
              <div key={item.code} className="flex items-center gap-3 p-3 rounded-lg bg-surface-muted/50">
                <span className="font-mono text-xs text-accent font-medium whitespace-nowrap">{item.code}</span>
                <span className="text-sm text-text-muted">{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Drug interactions */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Drug interaction reference</CardTitle>
          <CardDescription>
            Click any bubble to see mechanism and recommendation.{" "}
            {interactions.length} interactions in the database — checked automatically when prescribing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InteractionBubbles interactions={interactions} />
        </CardContent>
      </Card>

      {/* ChatCB — AI evidence assistant, cannabis-modality only */}
      {cannabisEnabled && (
        <div className="mb-6">
          <p className="text-xs font-medium text-text-subtle uppercase tracking-wide mb-3">
            AI evidence assistant
          </p>
          <ChatCB />
        </div>
      )}

      {/* Justin Kander's book (EMR-036) */}
      <Card tone="ambient" className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LeafSprig size={16} className="text-highlight" />
            Cannabis and Cancer — Justin Kander
          </CardTitle>
          <CardDescription>
            The largest integration of human cases and research demonstrating how
            cannabis fights cancer. Free resource for clinicians and patients.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="flex-1 space-y-3">
              <p className="text-sm text-text-muted leading-relaxed">
                Justin Kander&apos;s comprehensive book covers cannabis in oncology with
                detailed case studies, dosing protocols, and research summaries across
                multiple cancer types. While dosing isn&apos;t well-characterized in all
                cases, this is the most complete clinical resource available on the
                topic. Recommended for both providers and patients.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="highlight">Free resource</Badge>
                <Badge tone="neutral">Oncology</Badge>
                <Badge tone="neutral">Case studies</Badge>
                <Badge tone="neutral">Research</Badge>
              </div>
            </div>
            <a
              href="https://FreeCannabisCancerBook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-highlight text-white hover:bg-highlight/90 transition-colors shadow-sm"
            >
              Read free online &rarr;
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Research link */}
      <Card>
        <CardContent className="py-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Research database</p>
            <p className="text-xs text-text-muted mt-1">50+ peer-reviewed studies with structured dosing data</p>
          </div>
          <Link href="/clinic/research">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-accent text-accent-ink hover:bg-accent/90 transition-colors">
              Open research console
            </button>
          </Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}
