"use client";

import Link from "next/link";
import { type ReactElement } from "react";
import { HoverCard } from "@/components/ui/hover-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { usePreviewFetch } from "./use-preview-fetch";

// ---------------------------------------------------------------------------
// PatientHoverCard — wraps a clickable patient reference with a GitHub-
// style preview card. Hover (or focus) reveals avatar, name, DOB,
// presenting concern, last visit, primary provider, and a deep link to
// the chart.
//
// Mount cost on a list with 50 references: 50 hover handlers + 50
// portals are *not* created up front — only the trigger wrappers exist
// until the user actually hovers a row, at which point HoverCard mounts
// its portal lazily.
// ---------------------------------------------------------------------------

interface PatientPreview {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  status: string;
  qualificationStatus: string;
  presentingConcerns: string | null;
  lastVisitAt: string | null;
  primaryProviderName: string | null;
  primaryProviderTitle: string | null;
  chartRestricted: boolean;
}

export interface PatientHoverCardProps {
  patientId: string;
  /** Single ReactElement child — the trigger (usually a link or button). */
  children: ReactElement;
}

function PatientPreviewBody({ patientId }: { patientId: string }) {
  const { data, loading, error } = usePreviewFetch<PatientPreview>(
    `/api/patients/${patientId}/preview`,
  );

  if (loading && !data) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-surface" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-surface" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-surface" />
          </div>
        </div>
        <div className="h-2.5 w-full animate-pulse rounded bg-surface" />
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-[12px] text-text-subtle">
        Preview unavailable
        {error ? ` (${error})` : null}.
      </p>
    );
  }

  const fullName = `${data.firstName} ${data.lastName}`.trim();
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        <Avatar firstName={data.firstName} lastName={data.lastName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-medium leading-snug text-text">
            {fullName}
          </p>
          <p className="text-[11px] text-text-subtle">
            {data.dateOfBirth ? `DOB ${formatDate(data.dateOfBirth)}` : "DOB —"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone="neutral" className="text-[10px] capitalize">
              {data.status}
            </Badge>
            {data.qualificationStatus !== "unknown" && (
              <Badge tone="neutral" className="text-[10px] capitalize">
                {data.qualificationStatus}
              </Badge>
            )}
            {data.chartRestricted && (
              <Badge tone="warning" className="text-[10px]">
                Restricted
              </Badge>
            )}
          </div>
        </div>
      </div>

      {data.presentingConcerns ? (
        <p className="line-clamp-2 text-[12px] text-text-muted">
          {data.presentingConcerns}
        </p>
      ) : data.chartRestricted ? (
        <p className="text-[12px] italic text-text-subtle">
          Clinical details restricted.
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-text-subtle">Last visit</dt>
        <dd className="text-text">
          {data.lastVisitAt ? formatRelative(data.lastVisitAt) : "—"}
        </dd>
        <dt className="text-text-subtle">Provider</dt>
        <dd className="text-text">
          {data.primaryProviderName ?? "—"}
          {data.primaryProviderTitle ? (
            <span className="text-text-subtle"> · {data.primaryProviderTitle}</span>
          ) : null}
        </dd>
      </dl>

      <Link
        href={`/clinic/patients/${data.id}`}
        className="inline-block text-[12px] font-medium text-accent hover:underline focus:outline-none focus-visible:underline"
      >
        Open chart →
      </Link>
    </div>
  );
}

export function PatientHoverCard({
  patientId,
  children,
}: PatientHoverCardProps) {
  return (
    <HoverCard content={<PatientPreviewBody patientId={patientId} />}>
      {children}
    </HoverCard>
  );
}
