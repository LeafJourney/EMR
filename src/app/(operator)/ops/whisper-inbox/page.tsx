import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RouterRefreshFreshness } from "@/components/ui/freshness-indicator.client";
import { lex } from "@/lib/lexicon";
import {
  classifyWhisper,
  type ClassifiedWhisper,
  type WhisperArea,
} from "@/lib/domain/whisper-feedback";

export const metadata = { title: "Whisper Inbox · Operator" };

const AREA_LABEL: Record<WhisperArea, string> = {
  billing: "Billing",
  scheduling: "Scheduling",
  medications: "Medications",
  messaging: "Messaging",
  ux_copy: "UX / copy",
  performance: "Performance",
  feature_request: "Feature request",
  compliment: "Compliment",
  other: "Other",
};

// Until persistence lands, the inbox is seeded with realistic whispers so
// triage flow can be reviewed end-to-end. Live submissions from the FAB
// land in the API route's in-memory ring; the operator UI here renders the
// canonical demo set so the page is deterministic.
function buildDemoWhispers(): ClassifiedWhisper[] {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const seeds = [
    {
      pageUrl: "/portal/billing",
      comment:
        "I got a bill I didn't understand and the EOB summary was confusing. The amount didn't match what I was told at check-in.",
    },
    {
      pageUrl: "/portal/seed-trove",
      comment:
        "The Seed Trove tier strip is amazing — I love watching my Sapling grow into a Canopy. Could you add an alert when I'm one harvest away from the next grove?",
    },
    {
      pageUrl: "/clinic/cme-ledger",
      comment:
        "Submitted three credits to AMA last week and the status is still 'submitted' — would love to know when ACCME confirms.",
    },
    {
      pageUrl: "/portal/volunteer",
      comment:
        "Logged 3 hours at the food bank but the certificate hasn't generated yet. Probably user error but the button wasn't obvious.",
    },
    {
      pageUrl: "/portal/dose-calendar",
      comment: "Page is slow to load on my phone. Hangs for 4-5 seconds before anything appears.",
    },
    {
      pageUrl: "/advocacy/fund",
      comment:
        "Thank you for publishing the ledger. I showed my mom and she signed up. This is exactly the kind of transparency I want from a healthcare company.",
    },
  ];
  return seeds.map((s, i) =>
    classifyWhisper(
      {
        clientId: `wcid-demo-${i}`,
        pageUrl: s.pageUrl,
        comment: s.comment,
        occurredAt: new Date(now - i * day).toISOString(),
      },
      { now: new Date(now - i * day) },
    ),
  );
}

export default async function WhisperInboxPage() {
  await requireUser();
  const whispers = buildDemoWhispers();
  // Render-time stamp drives the FreshnessIndicator chip below. The demo
  // payload is deterministic for now; once persistence lands the chip
  // becomes a real "last fetched" signal without further wiring.
  const loadedAt = new Date().toISOString();

  const cSuiteCount = whispers.filter((w) => w.cSuiteRoute).length;
  const negativeCount = whispers.filter((w) => w.sentiment === "negative").length;

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow={lex("program.feedback")}
        title="Whisper inbox"
        description="Universal feedback from every page, every role. Negative whispers are routed to the C-Suite inbox with a 72-hour first-response SLA."
        actions={<RouterRefreshFreshness since={loadedAt} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total whispers" value={whispers.length.toString()} />
        <KpiTile label="C-Suite routed" value={cSuiteCount.toString()} hint="Negative + feature reqs + compliments" />
        <KpiTile label="Negative" value={negativeCount.toString()} hint="Triaged first" />
        <KpiTile label="Open SLA" value="< 72h" hint="First-response target" />
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {whispers.map((w) => (
          <Card
            key={w.id}
            tone={w.cSuiteRoute ? "raised" : "default"}
            className={w.sentiment === "negative" ? "border-red-300/70 ring-1 ring-red-200" : undefined}
          >
            <CardContent className="py-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] text-text-subtle font-mono">{w.pageUrl}</p>
                  <p className="text-[11px] text-text-subtle">
                    {new Date(w.receivedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={sentimentTone(w.sentiment)}>{w.sentiment}</Badge>
                  {w.cSuiteRoute && <Badge tone="highlight">C-Suite</Badge>}
                </div>
              </div>
              <p className="text-sm text-text-muted">&ldquo;{w.comment}&rdquo;</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="accent">{AREA_LABEL[w.area]}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

function sentimentTone(s: "positive" | "negative" | "neutral"): "success" | "danger" | "neutral" {
  if (s === "positive") return "success";
  if (s === "negative") return "danger";
  return "neutral";
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle">{label}</p>
        <p className="font-display text-2xl text-text mt-1 tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-text-subtle mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
