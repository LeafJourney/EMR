"use client";

import Link from "next/link";
import { type ReactElement } from "react";
import { HoverCard } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils/format";
import { usePreviewFetch } from "./use-preview-fetch";

// ---------------------------------------------------------------------------
// ThreadHoverCard — hover preview for a message thread reference. Works
// against either MessageThread (patient↔clinic) or ProviderMessageThread
// (provider↔provider) — pass kind="provider" for the latter.
// ---------------------------------------------------------------------------

interface PatientThreadPreview {
  kind: "patient";
  id: string;
  subject: string;
  patientName: string;
  patientId: string;
  messageCount: number;
  participantCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  triageUrgency: string | null;
  unreadCount: number;
}

interface ProviderThreadPreview {
  kind: "provider";
  id: string;
  subject: string;
  participantCount: number;
  participants: Array<{ userId: string; name: string }>;
  patientName: string | null;
  patientId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

type ThreadPreview = PatientThreadPreview | ProviderThreadPreview;

export interface ThreadHoverCardProps {
  threadId: string;
  kind?: "patient" | "provider";
  children: ReactElement;
}

function urgencyTone(u: string | null): "neutral" | "warning" | "danger" {
  if (u === "emergency") return "danger";
  if (u === "high") return "warning";
  return "neutral";
}

function ThreadPreviewBody({
  threadId,
  kind,
}: {
  threadId: string;
  kind: "patient" | "provider";
}) {
  const { data, loading, error } = usePreviewFetch<ThreadPreview>(
    `/api/threads/${threadId}/preview?kind=${kind}`,
  );

  if (loading && !data) {
    return (
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface" />
        <div className="h-2.5 w-full animate-pulse rounded bg-surface" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface" />
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

  const isPatient = data.kind === "patient";
  const href = isPatient
    ? `/clinic/messages?thread=${data.id}`
    : `/clinic/provider-messages/${data.id}`;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm font-medium leading-snug text-text">
          {data.subject || "(no subject)"}
        </p>
        {data.unreadCount > 0 ? (
          <Badge tone="accent" className="text-[10px]">
            {data.unreadCount} unread
          </Badge>
        ) : null}
      </div>

      <p className="text-[11px] text-text-subtle">
        {isPatient
          ? data.patientName
          : data.patientName
            ? `Re: ${data.patientName}`
            : data.participants.map((p) => p.name).join(", ") ||
              "Provider thread"}
        {" · "}
        {data.participantCount} participant
        {data.participantCount === 1 ? "" : "s"}
      </p>

      {data.lastMessagePreview ? (
        <p className="line-clamp-3 rounded-md bg-surface p-2 text-[12px] text-text-muted">
          {data.lastMessagePreview}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-[11px] text-text-subtle">
        <span>Updated {formatRelative(data.lastMessageAt)}</span>
        {isPatient && data.triageUrgency ? (
          <Badge tone={urgencyTone(data.triageUrgency)} className="text-[10px] capitalize">
            {data.triageUrgency}
          </Badge>
        ) : null}
      </div>

      <Link
        href={href}
        className="inline-block text-[12px] font-medium text-accent hover:underline focus:outline-none focus-visible:underline"
      >
        Open thread →
      </Link>
    </div>
  );
}

export function ThreadHoverCard({
  threadId,
  kind = "patient",
  children,
}: ThreadHoverCardProps) {
  return (
    <HoverCard content={<ThreadPreviewBody threadId={threadId} kind={kind} />}>
      {children}
    </HoverCard>
  );
}
