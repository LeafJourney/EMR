/**
 * EMR-082 — Electronic record release between providers
 *
 * Outbound queue for chart release packets — one row per release
 * request. Each release goes through:
 *   1. ROI captured (signed authorization on file)
 *   2. Packet curated (which encounters / docs / orders)
 *   3. Sensitive content review (42 CFR Part 2 / state rules)
 *   4. Transmission (Direct Trust, fax, secure portal, or printed pickup)
 *   5. Delivery confirmation
 *
 * The page is the clinician's "what's pending" view.
 */

import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { EmptyState } from "@/components/ui/empty-state";
import {
  evaluatePolicy,
  type ReviewPolicy,
} from "@/lib/clinical/record-release-workflow";
import {
  RECORD_CATEGORY_LABELS,
  type RecordCategory,
} from "@/lib/domain/record-release";

export const metadata = { title: "Record release" };

type ReleaseChannel = "direct_trust" | "fax" | "portal" | "pickup" | "mail";
type ReleaseStage =
  | "roi_pending"
  | "curation"
  | "sensitive_review"
  | "ready_to_send"
  | "transmitted"
  | "delivered"
  | "rejected";

interface ReleaseRequest {
  id: string;
  patientName: string;
  recipientName: string;
  recipientType: "provider" | "facility" | "patient" | "attorney" | "insurer";
  reason: string;
  stage: ReleaseStage;
  channel: ReleaseChannel;
  documentCount: number;
  hasSensitive: boolean;
  requestedAt: string;
  ageHours: number;
  /** Soft deadline — stat = within 24h, urgent = 3 days, routine = 30 days */
  priority: "stat" | "urgent" | "routine";
}

const SAMPLE: ReleaseRequest[] = [
  {
    id: "rel-001",
    patientName: "Hassan, K.",
    recipientName: "UCI Medical Center — Neurology",
    recipientType: "provider",
    reason: "Specialist consult — workup for new MS-like symptoms",
    stage: "ready_to_send",
    channel: "direct_trust",
    documentCount: 14,
    hasSensitive: false,
    requestedAt: "2026-04-29",
    ageHours: 18,
    priority: "urgent",
  },
  {
    id: "rel-002",
    patientName: "Williams, J.",
    recipientName: "Hoag Hospital — ED",
    recipientType: "facility",
    reason: "ER visit — chest pain workup, prior cards records requested",
    stage: "transmitted",
    channel: "direct_trust",
    documentCount: 8,
    hasSensitive: false,
    requestedAt: "2026-04-30",
    ageHours: 1.5,
    priority: "stat",
  },
  {
    id: "rel-003",
    patientName: "Garcia, R.",
    recipientName: "Patient (self)",
    recipientType: "patient",
    reason: "Personal copy — life insurance application",
    stage: "curation",
    channel: "portal",
    documentCount: 0,
    hasSensitive: true,
    requestedAt: "2026-04-25",
    ageHours: 120,
    priority: "routine",
  },
  {
    id: "rel-004",
    patientName: "Nguyen, L.",
    recipientName: "Workers' Comp — Sedgwick",
    recipientType: "insurer",
    reason: "Long-haul COVID claim — full chart since 2024",
    stage: "sensitive_review",
    channel: "fax",
    documentCount: 47,
    hasSensitive: true,
    requestedAt: "2026-04-22",
    ageHours: 192,
    priority: "routine",
  },
  {
    id: "rel-005",
    patientName: "Olafsson, B.",
    recipientName: "Tustin Family Practice",
    recipientType: "provider",
    reason: "Established care transfer — moving to Sacramento",
    stage: "roi_pending",
    channel: "direct_trust",
    documentCount: 0,
    hasSensitive: false,
    requestedAt: "2026-04-28",
    ageHours: 48,
    priority: "routine",
  },
  {
    id: "rel-006",
    patientName: "Rivera, M.",
    recipientName: "South Coast Orthopedic Group",
    recipientType: "provider",
    reason: "Pre-op clearance hand-off",
    stage: "delivered",
    channel: "direct_trust",
    documentCount: 5,
    hasSensitive: false,
    requestedAt: "2026-04-27",
    ageHours: 72,
    priority: "routine",
  },
];

export default async function RecordReleasePage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const blocked = SAMPLE.filter(
    (r) => r.stage === "roi_pending" || r.stage === "rejected"
  );
  const inProgress = SAMPLE.filter(
    (r) =>
      r.stage === "curation" ||
      r.stage === "sensitive_review" ||
      r.stage === "ready_to_send"
  );
  const stats = SAMPLE.filter((r) => r.priority === "stat");

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Records"
        title="Release of information"
        description="Outbound chart packets to other providers, facilities, patients, attorneys, and insurers. Direct Trust transmission whenever the recipient supports it; fax + secure portal as fallback."
        actions={
          <div className="flex gap-2">
            <Link href="/clinic/records/ocr">
              <Button variant="secondary" size="sm">
                Scan inbound record
              </Button>
            </Link>
            <Link href="/clinic/records/release/new">
              <Button variant="primary" size="sm">
                New release
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetricTile
          label="STAT in flight"
          value={stats.length}
          accent={stats.length > 0 ? "amber" : "none"}
          hint="< 24 hours required"
        />
        <MetricTile
          label="In progress"
          value={inProgress.length}
          accent="forest"
          hint="Curation + review + queued"
        />
        <MetricTile
          label="Awaiting ROI"
          value={blocked.length}
          accent={blocked.length > 0 ? "amber" : "none"}
          hint="Need signed authorization"
        />
        <MetricTile
          label="Delivered (7d)"
          value={SAMPLE.filter((r) => r.stage === "delivered").length}
          accent="forest"
          hint="Confirmed receipt"
        />
      </div>

      <RoiPolicyCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Awaiting ROI</CardTitle>
            <CardDescription>
              Patient needs to sign the release authorization before we can
              build the packet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocked.length === 0 ? (
              <EmptyState
                title="All authorizations on file"
                description="Every active release request has a signed ROI."
              />
            ) : (
              blocked.map((r) => <ReleaseRow key={r.id} release={r} highlight />)
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">In progress</CardTitle>
            <CardDescription>
              Curation, sensitive content review, and ready-to-send.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {inProgress.length === 0 ? (
              <EmptyState
                title="No active releases"
                description="When a release is authorized, it lands here for curation."
              />
            ) : (
              inProgress.map((r) => <ReleaseRow key={r.id} release={r} />)
            )}
          </CardContent>
        </Card>
      </div>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Recent transmissions</CardTitle>
          <CardDescription>
            Sent and delivered packets — confirmation receipts attach automatically
            via Direct Trust.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {SAMPLE.filter((r) => r.stage === "transmitted" || r.stage === "delivered").map(
            (r) => (
              <ReleaseRow key={r.id} release={r} />
            )
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

/**
 * Reference card for the practice's release-of-information policy. Driven
 * by `evaluatePolicy` over every record category so the displayed posture
 * always matches the rules the provider-review screen enforces.
 */
function RoiPolicyCard() {
  const allCategories = Object.keys(RECORD_CATEGORY_LABELS) as RecordCategory[];
  const decision = evaluatePolicy({ categories: allCategories });

  return (
    <Card tone="raised" className="mb-8">
      <CardHeader>
        <CardTitle className="text-base">Release-of-information policy</CardTitle>
        <CardDescription>
          Which record categories release automatically once the patient
          authorization is on file, and which require provider sign-off before
          the packet goes out.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {decision.categories.map((c) => (
          <div
            key={c.category}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
          >
            <span className="text-sm text-text truncate">{c.label}</span>
            <Badge tone={policyTone(c.policy)} className="shrink-0">
              {policyLabel(c.policy)}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function policyLabel(policy: ReviewPolicy): string {
  switch (policy) {
    case "auto_release":
      return "Auto-release";
    case "needs_provider_review":
      return "Provider review";
    case "forbidden":
      return "Withheld";
  }
}

function policyTone(policy: ReviewPolicy): "success" | "warning" | "danger" {
  switch (policy) {
    case "auto_release":
      return "success";
    case "needs_provider_review":
      return "warning";
    case "forbidden":
      return "danger";
  }
}

function ReleaseRow({
  release,
  highlight = false,
}: {
  release: ReleaseRequest;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-1 md:grid-cols-[1fr_180px_160px_140px] items-center gap-3 rounded-lg px-3 py-3 " +
        (highlight ? "bg-highlight-soft/40" : "hover:bg-surface-muted")
      }
    >
      <div className="min-w-0">
        <p className="text-sm text-text">
          {release.patientName}{" "}
          <span className="text-text-subtle">→ {release.recipientName}</span>
        </p>
        <p className="text-[11px] text-text-subtle truncate">{release.reason}</p>
        <p className="text-[11px] text-text-subtle">
          {release.documentCount > 0
            ? `${release.documentCount} docs`
            : "Packet not yet built"}
          {release.hasSensitive && (
            <Badge tone="warning" className="ml-2">
              42 CFR Part 2
            </Badge>
          )}
        </p>
      </div>
      <Badge tone={stageTone(release.stage)}>{stageLabel(release.stage)}</Badge>
      <div className="text-[11px] text-text-muted space-y-0.5">
        <p>via {channelLabel(release.channel)}</p>
        <p>
          <Badge tone={priorityTone(release.priority)} className="text-[10px]">
            {release.priority.toUpperCase()}
          </Badge>
        </p>
      </div>
      <p className="text-xs text-text-subtle tabular-nums">
        {formatAge(release.ageHours)}
      </p>
    </div>
  );
}

function stageLabel(stage: ReleaseStage): string {
  switch (stage) {
    case "roi_pending":
      return "ROI pending";
    case "curation":
      return "Curating";
    case "sensitive_review":
      return "Sensitive review";
    case "ready_to_send":
      return "Ready to send";
    case "transmitted":
      return "Transmitted";
    case "delivered":
      return "Delivered";
    case "rejected":
      return "Rejected";
  }
}

function stageTone(
  stage: ReleaseStage
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (stage) {
    case "delivered":
      return "success";
    case "transmitted":
    case "ready_to_send":
      return "info";
    case "curation":
    case "sensitive_review":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

function priorityTone(
  p: ReleaseRequest["priority"]
): "danger" | "warning" | "neutral" {
  return p === "stat" ? "danger" : p === "urgent" ? "warning" : "neutral";
}

function channelLabel(c: ReleaseChannel): string {
  switch (c) {
    case "direct_trust":
      return "Direct Trust";
    case "fax":
      return "Fax";
    case "portal":
      return "Patient portal";
    case "pickup":
      return "In-office pickup";
    case "mail":
      return "USPS";
  }
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
