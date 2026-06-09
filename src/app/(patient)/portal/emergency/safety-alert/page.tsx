import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { SafetyAlertClient } from "./safety-alert-client";

export const metadata = { title: "Safety Alert" };

// EMR-383 — Patient portal emergency safety alert.
// Server shell: auth gate + calm explainer; the interactive prompt,
// countdown, and motion listener all live in the client component.

export default async function SafetyAlertPage() {
  await requireRole("patient");

  return (
    <PageShell maxWidth="max-w-[760px]">
      <PageHeader
        eyebrow="Safety"
        title="Emergency safety alert"
        description="If your device thinks you've taken a hard fall, a full-screen prompt asks if you're OK and counts down to calling 911. You can always cancel — nothing dials without your go-ahead unless the timer runs out."
      />

      <SafetyAlertClient />

      {/* Calm explainer cards */}
      <section className="mt-8">
        <Eyebrow className="mb-4">How it works</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-3">
          <ExplainerCard
            step="1"
            title="A possible fall is detected"
            body="An automatic motion trigger — or you, tapping the test button — opens the full-screen alert."
          />
          <ExplainerCard
            step="2"
            title="You get 15 seconds"
            body="A big, calm countdown gives you time to tap “I'm OK” if it was a false alarm. No rush, no panic."
          />
          <ExplainerCard
            step="3"
            title="911 is dialed if needed"
            body="If the timer runs out, your phone's dialer opens to 911 automatically. You can also tap Call 911 right away."
          />
        </div>
      </section>
    </PageShell>
  );
}

function ExplainerCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <Card tone="raised">
      <CardContent className="py-5">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent font-display text-sm mb-3"
          aria-hidden="true"
        >
          {step}
        </span>
        <p className="font-medium text-text mb-1.5">{title}</p>
        <p className="text-sm text-text-muted leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
