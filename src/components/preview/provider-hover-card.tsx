"use client";

import Link from "next/link";
import { type ReactElement } from "react";
import { HoverCard } from "@/components/ui/hover-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils/format";
import { usePreviewFetch } from "./use-preview-fetch";

// ---------------------------------------------------------------------------
// ProviderHoverCard — hover preview for any clinician/staff reference.
// Shows avatar, name, title, role, NPI, last login.
// ---------------------------------------------------------------------------

interface UserPreview {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  title: string | null;
  specialties: string[];
  npi: string | null;
  active: boolean;
  lastLoginAt: string | null;
}

export interface ProviderHoverCardProps {
  userId: string;
  children: ReactElement;
}

function UserPreviewBody({ userId }: { userId: string }) {
  const { data, loading, error } = usePreviewFetch<UserPreview>(
    `/api/users/${userId}/preview`,
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
          {data.title ? (
            <p className="text-[11px] text-text-subtle">{data.title}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone="accent" className="text-[10px] capitalize">
              {data.role.replace(/_/g, " ")}
            </Badge>
            {!data.active && (
              <Badge tone="neutral" className="text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
        </div>
      </div>

      {data.specialties.length > 0 ? (
        <p className="text-[11px] text-text-muted">
          {data.specialties.slice(0, 3).join(" · ")}
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        {data.npi ? (
          <>
            <dt className="text-text-subtle">NPI</dt>
            <dd className="font-mono text-text">{data.npi}</dd>
          </>
        ) : null}
        <dt className="text-text-subtle">Last login</dt>
        <dd className="text-text">
          {data.lastLoginAt ? formatRelative(data.lastLoginAt) : "Never"}
        </dd>
      </dl>

      <Link
        href={`/clinic/messages/compose?to=${data.id}`}
        className="inline-block text-[12px] font-medium text-accent hover:underline focus:outline-none focus-visible:underline"
      >
        Send message →
      </Link>
    </div>
  );
}

export function ProviderHoverCard({
  userId,
  children,
}: ProviderHoverCardProps) {
  return (
    <HoverCard content={<UserPreviewBody userId={userId} />}>
      {children}
    </HoverCard>
  );
}
