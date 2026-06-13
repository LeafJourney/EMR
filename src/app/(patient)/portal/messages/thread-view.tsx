"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxZeroIllustration } from "@/components/ui/empty-illustrations";
import { ReplyCompose, NewThreadCompose } from "./compose";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        "transition-transform duration-200",
        open ? "rotate-90" : "rotate-0",
      )}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface MessageData {
  id: string;
  body: string;
  status: string;
  senderUserId: string | null;
  sender: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface ThreadData {
  id: string;
  subject: string;
  lastMessageAt: string;
  messages: MessageData[];
}

interface Props {
  threads: ThreadData[];
  currentUserId: string;
}

function CareTeamReviewingCard() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2.5 max-w-[80%]">
        <div
          aria-hidden="true"
          className="h-7 w-7 rounded-full bg-accent-soft border border-accent/25 flex items-center justify-center shrink-0 mt-1"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
        </div>
        <div>
          <div className="rounded-xl px-4 py-2.5 bg-accent-soft/60 border border-accent/20 text-sm leading-relaxed text-text italic">
            Your care team is reviewing your message. Typical response time is
            within 24 hours — sooner for anything urgent.
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-subtle">Care team</span>
            <span className="text-[10px] text-accent uppercase tracking-wider">
              · reviewing
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  currentUserId,
  isOpen,
  onToggle,
}: {
  thread: ThreadData;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [callToast, setCallToast] = useState<string | null>(null);
  const lastMsg = thread.messages[0];
  const chronological = [...thread.messages].reverse();
  const lastChrono = chronological[chronological.length - 1];
  const awaitingReply =
    lastChrono != null && lastChrono.senderUserId === currentUserId;

  function pingCallToast(label: string) {
    setCallToast(label);
    setTimeout(() => setCallToast(null), 2500);
  }

  return (
    <div
      className={cn(
        "border-b border-border last:border-b-0 transition-colors",
        isOpen
          ? "bg-surface-muted/40 border-l-2 border-l-accent"
          : "border-l-2 border-l-transparent hover:bg-surface-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`thread-${thread.id}-panel`}
        className="w-full text-left px-5 py-4 flex items-start gap-3"
      >
        <span className="mt-1 text-text-subtle shrink-0">
          <ChevronIcon open={isOpen} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p
              className={cn(
                "text-sm line-clamp-2 break-words",
                isOpen ? "font-semibold text-text" : "font-medium text-text",
              )}
            >
              {thread.subject}
            </p>
            <span className="text-[11px] text-text-subtle whitespace-nowrap">
              {formatRelative(thread.lastMessageAt)}
            </span>
          </div>
          {lastMsg && !isOpen && (
            <p className="text-xs text-text-muted mt-1 line-clamp-1">
              {lastMsg.body}
            </p>
          )}
        </div>
      </button>

      {isOpen && (
        <div id={`thread-${thread.id}-panel`} className="px-5 pb-5">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
                Conversation
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => pingCallToast("Voice calling coming soon")}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
                  aria-label="Voice call"
                >
                  <PhoneIcon />
                </button>
                <button
                  type="button"
                  onClick={() => pingCallToast("Video calling coming soon")}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
                  aria-label="Video call"
                >
                  <VideoIcon />
                </button>
              </div>
            </div>

            {callToast && (
              <div className="mx-4 mt-3 text-xs text-text-muted bg-surface-muted rounded-lg px-3 py-2 text-center">
                {callToast}
              </div>
            )}

            <div className="px-4 py-4 space-y-4 max-h-[420px] overflow-y-auto">
              {chronological.map((msg) => {
                const isOwn = msg.senderUserId === currentUserId;
                const senderName = isOwn
                  ? "You"
                  : msg.sender
                    ? `${msg.sender.firstName} ${msg.sender.lastName}`
                    : "Care Team";

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      isOwn ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "flex gap-2.5 max-w-[80%]",
                        isOwn ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      {!isOwn && (
                        <Avatar
                          firstName={msg.sender?.firstName ?? "C"}
                          lastName={msg.sender?.lastName ?? "T"}
                          size="sm"
                          className="mt-1 shrink-0"
                        />
                      )}
                      <div>
                        <div
                          className={cn(
                            "rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                            isOwn
                              ? "bg-accent-soft text-text"
                              : "bg-surface-raised text-text border border-border/60",
                          )}
                        >
                          {msg.body}
                        </div>
                        <div
                          className={cn(
                            "flex items-center gap-2 mt-1",
                            isOwn ? "justify-end" : "justify-start",
                          )}
                        >
                          <span className="text-xs text-text-subtle">
                            {senderName}
                          </span>
                          <span className="text-xs text-text-subtle">
                            {formatRelative(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {awaitingReply && <CareTeamReviewingCard />}
            </div>

            <ReplyCompose threadId={thread.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PatientMessagesView({ threads, currentUserId }: Props) {
  const [showCompose, setShowCompose] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(
    threads[0]?.id ?? null,
  );

  function toggleThread(id: string) {
    setOpenThreadId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <NewThreadCompose
        open={showCompose}
        onClose={() => setShowCompose(false)}
      />

      {threads.length === 0 && !showCompose ? (
        <EmptyState
          illustration={<InboxZeroIllustration />}
          title="Your secure mailbox is ready"
          description="This is the safest way to reach your care team for non-urgent questions. They'll usually reply within one business day."
          primaryAction={
            <Button onClick={() => setShowCompose(true)}>Start a message</Button>
          }
          tips={[
            "Use messages for refill requests, follow-up questions, or sharing symptoms",
            "For anything urgent or after-hours, please call your care team or 911",
            "Attachments and photos are end-to-end encrypted in transit",
          ]}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium text-text">
              {threads.length} conversation{threads.length === 1 ? "" : "s"}
            </p>
            <Button size="sm" onClick={() => setShowCompose(true)}>
              New message
            </Button>
          </div>
          <div>
            {threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                currentUserId={currentUserId}
                isOpen={openThreadId === t.id}
                onToggle={() => toggleThread(t.id)}
              />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
