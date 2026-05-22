import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Mindful Break" };

/**
 * Mindful Break — hub.
 *
 * Three paths from the Dr. Patel brief: Breathe, Move, Inspire. Breathe
 * ships first (working animation + timer). Move and Inspire land as
 * separate PRs so each can be delightful on its own terms without
 * blocking the rest.
 *
 * Every path is capped at 10 minutes (per the sketch — "back to work!"
 * is the point). Exit is always one click.
 */
export default async function MindfulHubPage() {
  await requireUser();

  return (
    <PageShell maxWidth="max-w-[900px]">
      <div className="text-center mb-10">
        <Eyebrow className="justify-center mb-3">Mindful Break</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
          Take a breath. You&apos;ve earned it.
        </h1>
        <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl mx-auto">
          Pick something simple. Ten minutes max. We&apos;ll nudge you back to
          work when you&apos;re ready.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MindfulCard
          href="/clinic/mindful/breathe"
          icon="🌬️"
          title="Breathe"
          blurb="A soft breathing circle. Inhale, hold, exhale, pause. Two to ten minutes."
          available
        />
        <MindfulCard
          icon="🚶"
          title="Move"
          blurb="Micro-stretches, standing flows, or chair work. Picks what fits where you are."
          available={false}
        />
        <MindfulCard
          icon="✨"
          title="Inspire"
          blurb="A single quote, painting, or landscape. Something beautiful, on purpose."
          available={false}
        />
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/clinic/command"
          className="text-sm text-text-subtle hover:text-text transition-colors"
        >
          ← Back to command
        </Link>
      </div>
    </PageShell>
  );
}

function MindfulCard({
  href,
  icon,
  title,
  blurb,
  available,
}: {
  href?: string;
  icon: string;
  title: string;
  blurb: string;
  available: boolean;
}) {
  const body = (
    <div
      className={cn(
        "h-full rounded-2xl border p-6 flex flex-col gap-3 transition-all",
        available
          ? "bg-surface border-border/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-accent/40 cursor-pointer"
          : "bg-surface/60 border-dashed border-border-strong/40 opacity-75"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-3xl leading-none" aria-hidden="true">
          {icon}
        </span>
        {!available && <Badge tone="neutral">Soon</Badge>}
      </div>
      <h2 className="font-display text-xl text-text tracking-tight">{title}</h2>
      <p className="text-sm text-text-muted leading-relaxed">{blurb}</p>
    </div>
  );

  if (!available || !href) {
    return <div aria-disabled="true">{body}</div>;
  }

  return (
    <Link href={href} aria-label={title}>
      {body}
    </Link>
  );
}
