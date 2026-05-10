import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Bookmark } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

// Mock CMS data for V1. Replace this block with a real CMS query
// (Sanity, Contentful, etc.) before promoting the slug route past the
// hardcoded set. The shape lives next to the data so a real CMS adapter
// can target it directly.
interface Article {
  title: string;
  description: string;
  author: string;
  date: string;
  category: string;
  /** HTML body — sanitize at the CMS layer before this lands here. */
  content: string;
}

const ARTICLES: Record<string, Article> = {
  "terpenes-101": {
    title: "Terpenes 101: The Aromatherapy of Cannabis",
    description: "Discover how terpenes shape the effects of your cannabis experience beyond just THC and CBD.",
    author: "Dr. Sarah Jenkins",
    date: "October 12, 2026",
    category: "Science",
    content: `
      <p>When you smell a cannabis flower, you're experiencing its terpene profile. Terpenes are aromatic compounds found in many plants, not just cannabis. They are what make lemons smell citrusy, pine trees smell piney, and lavender smell relaxing.</p>
      <h2>The Entourage Effect</h2>
      <p>For decades, cannabis science focused almost exclusively on cannabinoids like THC and CBD. However, modern research suggests that terpenes play a massive role in steering the effects of these cannabinoids—a phenomenon known as the "entourage effect".</p>
      <h3>Myrcene: The Couch-Lock Terpene</h3>
      <p>Myrcene is the most abundant terpene in modern cannabis. Found also in mangoes and hops, it is known for its deeply relaxing and sedative effects.</p>
      <h3>Limonene: The Uplifter</h3>
      <p>As the name suggests, Limonene is found in citrus rinds. Strains high in limonene are often reported to elevate mood and provide stress relief.</p>
    `,
  },
  "sleep-and-cbn": {
    title: "Can CBN Help You Sleep?",
    description: "An evidence-based look at Cannabinol (CBN) and its potential as a sleep aid.",
    author: "Leafjourney Research Team",
    date: "November 4, 2026",
    category: "Clinical",
    content: `
      <p>Sleep architecture is complex, and many patients turn to cannabis when traditional sleep aids fail or cause unwanted side effects.</p>
      <h2>What is CBN?</h2>
      <p>CBN is a minor cannabinoid that is actually the degradation product of THC. When THC is exposed to oxygen and light over time, it converts to CBN.</p>
      <h2>The Evidence</h2>
      <p>While often marketed heavily as a sedative, current clinical research on CBN as an isolated compound for sleep is still emerging. However, when combined with THC and relaxing terpenes like Linalool, patients consistently report improved sleep onset and duration.</p>
    `,
  }
};

export function generateMetadata({ params }: { params: { slug: string } }) {
  const article = ARTICLES[params.slug];
  if (!article) return { title: "Not Found" };
  return { title: `${article.title} · Leafjourney Education` };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = ARTICLES[params.slug];

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <article className="max-w-[800px] mx-auto px-6 lg:px-12 pt-16 pb-24">
        {/* Back Link */}
        <Link href="/education" className="inline-flex items-center text-sm font-medium text-text-muted hover:text-[var(--accent)] transition-colors mb-12">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Chat & Learn
        </Link>

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge tone="accent">{article.category}</Badge>
            <span className="text-sm text-text-muted">{article.date}</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-text leading-[1.1] tracking-tight mb-6">
            {article.title}
          </h1>
          <p className="text-xl text-text-muted leading-relaxed mb-8">
            {article.description}
          </p>
          
          <div className="flex items-center justify-between border-y border-[var(--border)] py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-muted)] flex items-center justify-center font-medium text-text">
                {article.author.charAt(0)}
              </div>
              <span className="font-medium text-text">{article.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" aria-label="Action" className="h-9 w-9 p-0 rounded-full">
                <Bookmark className="w-4 h-4 text-text-muted" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Action" className="h-9 w-9 p-0 rounded-full">
                <Share2 className="w-4 h-4 text-text-muted" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div 
          className="prose prose-lg prose-leafmart max-w-none prose-headings:font-display prose-headings:font-medium prose-a:text-[var(--accent)] hover:prose-a:text-[var(--accent-hover)]"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        {/* Footer CTA */}
        <div className="mt-16 bg-[var(--surface-muted)] rounded-3xl p-8 sm:p-12 text-center">
          <Eyebrow className="justify-center mb-4 text-[var(--accent)]">Have more questions?</Eyebrow>
          <h3 className="font-display text-2xl md:text-3xl text-text tracking-tight mb-4">
            Ask the ChatCB Intelligence Engine
          </h3>
          <p className="text-text-muted mb-8 max-w-md mx-auto">
            Get instant, evidence-based answers cited directly from over 11,000 peer-reviewed clinical studies.
          </p>
          <Link href="/education">
            <Button size="lg" className="rounded-full px-8">
              Open ChatCB
            </Button>
          </Link>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}
