"use client";

// EMR-033 — client view for the provider-to-provider portal.
// Renders the thread list / detail panes and the "new conversation"
// composer. Plays the same role as `smart-inbox.tsx` does for the
// patient inbox.

import { useState, useTransition, useRef, useEffect } from "react";
import { useFormState } from "react-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LeafSprig } from "@/components/ui/ornament";
import { formatRelative } from "@/lib/utils/format";
import {
  createProviderThread,
  sendProviderReply,
  markProviderThreadRead,
  type ActionResult,
} from "./actions";
import { CallLaunchButtons } from "@/components/communications/call-launch-buttons";

export interface DecryptedThread {
  id: string;
  subject: string;
  lastMessageAt: string;
  patient: { id: string; name: string } | null;
  participants: { userId: string; name: string }[];
  unreadCount: number;
  messages: {
    id: string;
    senderUserId: string;
    senderName: string;
    body: string;
    createdAt: string;
  }[];
}

interface RecipientOption {
  userId: string;
  name: string;
  title: string | null;
}

interface Props {
  threads: DecryptedThread[];
  currentUserId: string;
  recipientOptions: RecipientOption[];
}

export function ProviderInboxView({
  threads,
  currentUserId,
  recipientOptions,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null);
  const [composing, setComposing] = useState(false);

  const active = threads.find((t) => t.id === activeId) ?? null;

  // Mark thread read when a thread becomes active.
  useEffect(() => {
    if (active && active.unreadCount > 0) {
      void markProviderThreadRead(active.id);
    }
  }, [active]);

  if (threads.length === 0 && !composing) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No provider conversations yet"
          description="Start a secure conversation with another provider in your organization."
        />
        <div className="flex justify-center">
          <Button onClick={() => setComposing(true)}>Start a conversation</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6 min-h-[600px]">
      {/* Thread list */}
      <div className="col-span-4 flex flex-col gap-4">
        <Button onClick={() => setComposing(true)} variant="primary">
          New conversation
        </Button>
        <Card tone="raised" className="flex-1 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <LeafSprig size={14} className="text-accent" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-2 max-h-[640px] overflow-y-auto">
            {threads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const peerName = t.participants[0]?.name ?? "Provider";
              const isActive = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setComposing(false);
                    setActiveId(t.id);
                  }}
                  className={`w-full text-left rounded-xl px-4 py-3 transition-all ${
                    isActive && !composing
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-surface-muted border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      firstName={peerName.split(" ")[0]}
                      lastName={peerName.split(" ").slice(-1)[0]}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-text truncate">
                          {peerName}
                        </p>
                        {t.unreadCount > 0 && (
                          <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-text-subtle truncate">
                        {t.subject}
                      </p>
                      {last && (
                        <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
                          {last.body}
                        </p>
                      )}
                      <p className="text-[10px] text-text-subtle mt-1">
                        {formatRelative(t.lastMessageAt)}
                        {t.patient ? ` · ${t.patient.name}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Right pane: compose or thread detail */}
      <div className="col-span-8 flex flex-col">
        {composing ? (
          <NewConversationCard
            recipientOptions={recipientOptions}
            onCancel={() => setComposing(false)}
            onCreated={(threadId) => {
              setComposing(false);
              setActiveId(threadId);
            }}
          />
        ) : active ? (
          <ThreadDetail
            thread={active}
            currentUserId={currentUserId}
            recipientOptions={recipientOptions}
          />
        ) : (
          <Card tone="raised" className="flex-1 flex items-center justify-center">
            <p className="text-sm text-text-muted">
              Select a conversation to view messages.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New conversation composer
// ---------------------------------------------------------------------------

function NewConversationCard({
  recipientOptions,
  onCancel,
  onCreated,
}: {
  recipientOptions: RecipientOption[];
  onCancel: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createProviderThread(formData);
      if (result.ok) {
        onCreated(result.data.threadId);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card tone="raised" className="flex-1 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">New secure conversation</CardTitle>
        <CardDescription className="text-xs">
          Pick at least one provider in your organization. Bodies are encrypted
          at rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <form action={onSubmit} className="space-y-4 flex-1 flex flex-col">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">Subject</label>
            <Input name="subject" required maxLength={200} placeholder="e.g. Maya Reyes — review CBD ratio" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">
              Recipients
            </label>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border/60">
              {recipientOptions.length === 0 ? (
                <p className="text-xs text-text-subtle p-3">
                  No other active providers in your organization.
                </p>
              ) : (
                recipientOptions.map((r) => (
                  <label
                    key={r.userId}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      name="recipientUserIds"
                      value={r.userId}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text truncate">{r.name}</p>
                      {r.title && (
                        <p className="text-[11px] text-text-subtle truncate">
                          {r.title}
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">
              Patient context (optional)
            </label>
            <Input
              name="patientId"
              placeholder="Patient ID (optional)"
              maxLength={64}
            />
            <p className="text-[10px] text-text-subtle">
              When attached, the conversation is linked to that chart for the
              audit log.
            </p>
          </div>

          <div className="flex-1 flex flex-col space-y-1.5">
            <label className="text-xs font-medium text-text-muted">Message</label>
            <Textarea
              name="initialBody"
              required
              rows={6}
              maxLength={5000}
              placeholder="Type your secure message…"
              className="flex-1"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Thread detail
// ---------------------------------------------------------------------------

function ThreadDetail({
  thread,
  currentUserId,
  recipientOptions,
}: {
  thread: DecryptedThread;
  currentUserId: string;
  recipientOptions: RecipientOption[];
}) {
  const peerName = thread.participants[0]?.name ?? "Provider";
  // For 1:1 threads, take the call counterparty as the other participant.
  const oneOnOnePeer =
    thread.participants.length === 1 ? thread.participants[0] : null;
  const peerProvider = oneOnOnePeer
    ? recipientOptions.find((r) => r.userId === oneOnOnePeer.userId)
    : null;

  return (
    <Card tone="raised" className="flex-1 flex flex-col">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar
            firstName={peerName.split(" ")[0]}
            lastName={peerName.split(" ").slice(-1)[0]}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{thread.subject}</CardTitle>
            <CardDescription className="text-xs">
              {thread.participants.map((p) => p.name).join(", ")}
              {thread.patient && (
                <>
                  <span className="mx-1">·</span>
                  <span>Re: {thread.patient.name}</span>
                </>
              )}
            </CardDescription>
          </div>
            <div className="flex items-center gap-2">
            {oneOnOnePeer && peerProvider && (
              <CallLaunchButtons
                providerUserId={oneOnOnePeer.userId}
                providerMessageThreadId={thread.id}
                counterpartyName={peerProvider.name}
              />
            )}
            <Badge tone="success">HIPAA Secure</Badge>
            <Badge tone="neutral">Encrypted at rest</Badge>
            <label className="flex items-center gap-1.5 ml-2 cursor-pointer border border-border px-2 py-1 rounded-full bg-surface">
              <input type="checkbox" className="h-3 w-3 accent-emerald-600" defaultChecked />
              <span className="text-[10px] font-medium text-text">SMS Opt-In</span>
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-6 space-y-4">
        {thread.messages.map((msg) => {
          const isOwn = msg.senderUserId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
            >
              <Avatar
                firstName={msg.senderName.split(" ")[0] ?? "P"}
                lastName={msg.senderName.split(" ").slice(-1)[0] ?? ""}
                size="sm"
              />
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                  isOwn
                    ? "bg-blue-500 text-white rounded-tr-sm"
                    : "bg-surface-raised border border-border text-text rounded-tl-sm"
                }`}
              >
                <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isOwn ? "text-white" : "text-text"}`}>
                  {msg.body}
                </p>
                <p className={`text-[10px] mt-1.5 ${isOwn ? "text-blue-100" : "text-text-subtle"}`}>
                  {isOwn ? "Delivered" : msg.senderName} ·{" "}
                  {formatRelative(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>

      <ReplyComposer threadId={thread.id} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reply composer (uses sendProviderReply server action)
// ---------------------------------------------------------------------------

function ReplyComposer({ threadId }: { threadId: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    sendProviderReply,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-t border-border p-4 flex flex-col gap-2"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <div className="flex gap-3 items-end">
        <Textarea
          name="body"
          rows={2}
          placeholder="Type a secure reply…"
          required
          maxLength={5000}
          className="flex-1 resize-none"
        />
        <Button type="submit" size="md">
          Send
        </Button>
      </div>
      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      <p className="text-[10px] text-text-subtle">
        Encrypted at rest. Visible only to participants in your organization.
      </p>
    </form>
  );
}
