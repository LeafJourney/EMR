"use client";

// EMR-033 / EMR-666 — client view for the provider-to-provider portal.
//
// iMessage-style split pane: left = directory search + provider list
// (with chat indicators), right = active thread or new-conversation
// composer. Click a provider row in the left pane to open their thread,
// or click the (i) badge to surface the provider info pop-up with
// Secure Message + Secure Call actions.

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useFormState } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkifiedText } from "@/components/ui/linkified-text";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelative } from "@/lib/utils/format";
import {
  providerMatchesQuery,
  type SearchableProvider,
} from "@/lib/search/provider-search";
import {
  createProviderThread,
  sendProviderReply,
  markProviderThreadRead,
  type ActionResult,
} from "./actions";
import { CallLaunchButtons } from "@/components/communications/call-launch-buttons";
import { SplitPane } from "@/components/ui/split-pane";

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

export interface DirectoryProvider extends SearchableProvider {
  userId: string;
}

interface Props {
  threads: DecryptedThread[];
  currentUserId: string;
  directory: DirectoryProvider[];
  initialUserId?: string | null;
}

// One row in the left pane — either an existing thread (preferred) or
// a directory-only provider (no chat yet, so clicking opens compose).
type LeftPaneRow =
  | { kind: "thread"; thread: DecryptedThread; peer: DirectoryProvider | null }
  | { kind: "directory"; provider: DirectoryProvider };

type RightPane =
  | { kind: "thread"; threadId: string }
  | { kind: "compose"; prefillUserId: string | null }
  | { kind: "empty" };

export function ProviderInboxView({ threads, currentUserId, directory, initialUserId }: Props) {
  const [search, setSearch] = useState("");
  const [right, setRight] = useState<RightPane>(() => {
    if (initialUserId) {
      const existing = threads.find(
        (t) => t.participants[0]?.userId === initialUserId,
      );
      if (existing) return { kind: "thread", threadId: existing.id };
      return { kind: "compose", prefillUserId: initialUserId };
    }
    return threads[0] ? { kind: "thread", threadId: threads[0].id } : { kind: "empty" };
  });
  const [popupUserId, setPopupUserId] = useState<string | null>(null);

  // Build merged left-pane list: every existing thread first (in chat
  // order), then any directory-only providers we haven't messaged yet.
  // Filter by the same partial-match query used by /clinic/providers so
  // search feels consistent across the surface (EMR-613).
  const rows: LeftPaneRow[] = useMemo(() => {
    const peerByUserId = new Map(directory.map((p) => [p.userId, p]));
    const messagedUserIds = new Set<string>();
    const threadRows: LeftPaneRow[] = threads.map((t) => {
      const peerId = t.participants[0]?.userId ?? null;
      if (peerId) messagedUserIds.add(peerId);
      return {
        kind: "thread",
        thread: t,
        peer: peerId ? (peerByUserId.get(peerId) ?? null) : null,
      };
    });
    const directoryRows: LeftPaneRow[] = directory
      .filter((p) => !messagedUserIds.has(p.userId))
      .map((p) => ({ kind: "directory", provider: p }));
    const all = [...threadRows, ...directoryRows];
    if (!search.trim()) return all;
    return all.filter((row) => {
      if (row.kind === "thread") {
        // Subject + patient name + peer fields are all fair game.
        if (row.thread.subject.toLowerCase().includes(search.toLowerCase()))
          return true;
        if (
          row.thread.patient?.name.toLowerCase().includes(search.toLowerCase())
        )
          return true;
        return row.peer ? providerMatchesQuery(row.peer, search) : false;
      }
      return providerMatchesQuery(row.provider, search);
    });
  }, [threads, directory, search]);

  const activeThread =
    right.kind === "thread"
      ? threads.find((t) => t.id === right.threadId) ?? null
      : null;

  // Mark thread read when it becomes active.
  useEffect(() => {
    if (activeThread && activeThread.unreadCount > 0) {
      void markProviderThreadRead(activeThread.id);
    }
  }, [activeThread]);

  const popupProvider = popupUserId
    ? directory.find((p) => p.userId === popupUserId) ?? null
    : null;

  return (
    <>
    <div className="h-[640px] rounded-2xl border border-border overflow-hidden bg-surface">
      <SplitPane
        orientation="horizontal"
        defaultSize={360}
        minSize={260}
        maxSize={560}
        storageKey="providers-messages"
        ariaLabel="Resize provider directory"
      >
      {/* Left pane — directory search + chat list */}
      <aside className="h-full border-r border-border flex flex-col bg-surface-muted/40">
        <div className="p-3 border-b border-border">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, specialty, address, hospital…"
            aria-label="Search providers"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-xs text-text-subtle p-4">
              No providers match your search.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((row) => (
                <DirectoryRow
                  key={
                    row.kind === "thread"
                      ? `t-${row.thread.id}`
                      : `d-${row.provider.userId}`
                  }
                  row={row}
                  active={
                    right.kind === "thread" && row.kind === "thread"
                      ? right.threadId === row.thread.id
                      : right.kind === "compose" && row.kind === "directory"
                        ? right.prefillUserId === row.provider.userId
                        : false
                  }
                  onSelect={() => {
                    if (row.kind === "thread") {
                      setRight({ kind: "thread", threadId: row.thread.id });
                    } else {
                      setRight({
                        kind: "compose",
                        prefillUserId: row.provider.userId,
                      });
                    }
                  }}
                  onInfo={(userId) => setPopupUserId(userId)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right pane — active thread or composer */}
      <section className="h-full flex flex-col bg-surface">
        {right.kind === "compose" ? (
          <NewConversationCard
            directory={directory}
            prefillUserId={right.prefillUserId}
            onCancel={() =>
              setRight(
                threads[0]
                  ? { kind: "thread", threadId: threads[0].id }
                  : { kind: "empty" },
              )
            }
            onCreated={(threadId) =>
              setRight({ kind: "thread", threadId })
            }
          />
        ) : activeThread ? (
          <ThreadDetail
            thread={activeThread}
            currentUserId={currentUserId}
            directory={directory}
            onPeerInfo={(userId) => setPopupUserId(userId)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-8">
            <div>
              <p className="text-sm text-text-muted">
                Select a provider on the left to start or continue a
                conversation.
              </p>
              <p className="text-[11px] text-text-subtle mt-2">
                HIPAA-secure · encrypted at rest
              </p>
            </div>
          </div>
        )}
      </section>
      </SplitPane>
    </div>

      {/* Provider info pop-up */}
      <Dialog
        open={!!popupProvider}
        onOpenChange={(next) => {
          if (!next) setPopupUserId(null);
        }}
      >
        {popupProvider && (
          <ProviderInfoDialog
            provider={popupProvider}
            onMessage={() => {
              setPopupUserId(null);
              // Reuse existing thread if there is one, else compose.
              const existing = threads.find(
                (t) => t.participants[0]?.userId === popupProvider.userId,
              );
              if (existing) {
                setRight({ kind: "thread", threadId: existing.id });
              } else {
                setRight({
                  kind: "compose",
                  prefillUserId: popupProvider.userId,
                });
              }
            }}
          />
        )}
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Left-pane row
// ---------------------------------------------------------------------------

function DirectoryRow({
  row,
  active,
  onSelect,
  onInfo,
}: {
  row: LeftPaneRow;
  active: boolean;
  onSelect: () => void;
  onInfo: (userId: string) => void;
}) {
  const name =
    row.kind === "thread"
      ? row.peer
        ? `${row.peer.firstName} ${row.peer.lastName}`
        : row.thread.participants[0]?.name ?? "Provider"
      : `${row.provider.firstName} ${row.provider.lastName}`;
  const specialty =
    row.kind === "thread"
      ? row.peer?.specialties[0] ?? row.peer?.title ?? null
      : row.provider.specialties[0] ?? row.provider.title ?? null;
  const peerUserId =
    row.kind === "thread"
      ? row.thread.participants[0]?.userId ?? null
      : row.provider.userId;
  const last = row.kind === "thread" ? row.thread.messages.at(-1) : null;
  const unread = row.kind === "thread" ? row.thread.unreadCount : 0;

  return (
    <li>
      <div
        className={`relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
          active ? "bg-accent/10" : "hover:bg-surface-muted"
        }`}
        onClick={onSelect}
      >
        <Avatar
          firstName={name.split(" ")[0]}
          lastName={name.split(" ").slice(-1)[0]}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text truncate">{name}</p>
            {unread > 0 && (
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
            )}
          </div>
          {specialty && (
            <p className="text-[11px] text-text-subtle truncate">{specialty}</p>
          )}
          {last ? (
            <p className="text-xs text-text-muted mt-1 line-clamp-1">
              {last.body}
            </p>
          ) : (
            <p className="text-[11px] text-text-subtle mt-1 italic">
              No messages yet
            </p>
          )}
          {row.kind === "thread" && (
            <p className="text-[10px] text-text-subtle mt-0.5">
              {formatRelative(row.thread.lastMessageAt)}
            </p>
          )}
        </div>
        {peerUserId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInfo(peerUserId);
            }}
            aria-label={`Show provider info for ${name}`}
            className="shrink-0 h-6 w-6 rounded-full border border-border bg-surface text-text-subtle hover:text-text hover:border-accent/50 transition-colors text-[11px] font-semibold flex items-center justify-center"
          >
            i
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Provider info pop-up
// ---------------------------------------------------------------------------

function ProviderInfoDialog({
  provider,
  onMessage,
}: {
  provider: DirectoryProvider;
  onMessage: () => void;
}) {
  const fullName = `${provider.firstName} ${provider.lastName}`;
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{fullName}</DialogTitle>
        {provider.title && (
          <p className="text-sm text-text-muted">{provider.title}</p>
        )}
      </DialogHeader>

      <div className="flex items-start gap-4">
        <Avatar
          firstName={provider.firstName}
          lastName={provider.lastName}
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          {provider.specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {provider.specialties.map((s) => (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          {provider.hospitalAffiliations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {provider.hospitalAffiliations.map((h) => (
                <Badge key={h} tone="neutral">
                  {h}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {provider.practiceAddress && (
        <div className="mt-4 text-xs text-text-muted whitespace-pre-line leading-relaxed">
          {provider.practiceAddress}
        </div>
      )}

      <p className="text-[11px] text-text-subtle mt-3">
        Phone, fax, website, and profile photo populate once the provider
        completes their public-directory profile.
      </p>

      <div className="mt-5 flex items-center gap-2 justify-end">
        <CallLaunchButtons
          providerUserId={provider.userId}
          counterpartyName={fullName}
        />
        <Button onClick={onMessage}>Secure message</Button>
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// New conversation composer
// ---------------------------------------------------------------------------

function NewConversationCard({
  directory,
  prefillUserId,
  onCancel,
  onCreated,
}: {
  directory: DirectoryProvider[];
  prefillUserId: string | null;
  onCancel: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prefill = prefillUserId
    ? directory.find((p) => p.userId === prefillUserId) ?? null
    : null;

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
    <form
      action={onSubmit}
      className="flex-1 flex flex-col"
    >
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-text">
          New secure conversation
          {prefill && (
            <span className="text-text-muted font-normal">
              {" "}
              with {prefill.firstName} {prefill.lastName}
            </span>
          )}
        </h2>
        <p className="text-xs text-text-muted mt-0.5">
          Bodies are encrypted at rest. Visible only to participants in your
          organization.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Subject</label>
          <Input
            name="subject"
            required
            maxLength={200}
            placeholder="e.g. Maya Reyes — review CBD ratio"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">
            Recipients
          </label>
          <div className="border border-border rounded-md max-h-48 overflow-y-auto divide-y divide-border/60">
            {directory.length === 0 ? (
              <p className="text-xs text-text-subtle p-3">
                No other active providers in your organization.
              </p>
            ) : (
              directory.map((r) => (
                <label
                  key={r.userId}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    name="recipientUserIds"
                    value={r.userId}
                    defaultChecked={r.userId === prefillUserId}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">
                      {r.firstName} {r.lastName}
                    </p>
                    {(r.specialties[0] || r.title) && (
                      <p className="text-[11px] text-text-subtle truncate">
                        {r.specialties[0] ?? r.title}
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
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Message</label>
          <Textarea
            name="initialBody"
            required
            rows={6}
            maxLength={5000}
            placeholder="Type your secure message…"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <footer className="border-t border-border px-5 py-3 flex justify-end gap-2 bg-surface-muted/40">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </footer>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Thread detail
// ---------------------------------------------------------------------------

function ThreadDetail({
  thread,
  currentUserId,
  directory,
  onPeerInfo,
}: {
  thread: DecryptedThread;
  currentUserId: string;
  directory: DirectoryProvider[];
  onPeerInfo: (userId: string) => void;
}) {
  const oneOnOnePeer =
    thread.participants.length === 1 ? thread.participants[0] : null;
  const peerProvider = oneOnOnePeer
    ? directory.find((p) => p.userId === oneOnOnePeer.userId)
    : null;
  const peerName = oneOnOnePeer?.name ?? "Provider";
  // Auto-scroll to newest message on thread open / new reply.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread.id, thread.messages.length]);

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-5 py-3 border-b border-border flex items-center gap-3">
        <Avatar
          firstName={peerName.split(" ")[0]}
          lastName={peerName.split(" ").slice(-1)[0]}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text truncate">
              {peerName}
            </h2>
            {oneOnOnePeer && (
              <button
                type="button"
                onClick={() => onPeerInfo(oneOnOnePeer.userId)}
                aria-label={`Show provider info for ${peerName}`}
                className="h-5 w-5 rounded-full border border-border bg-surface text-text-subtle hover:text-text hover:border-accent/50 transition-colors text-[10px] font-semibold flex items-center justify-center"
              >
                i
              </button>
            )}
          </div>
          <p className="text-[11px] text-text-subtle truncate">
            {thread.subject}
            {thread.patient ? ` · Re: ${thread.patient.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {oneOnOnePeer && peerProvider && (
            <CallLaunchButtons
              providerUserId={oneOnOnePeer.userId}
              providerMessageThreadId={thread.id}
              counterpartyName={`${peerProvider.firstName} ${peerProvider.lastName}`}
            />
          )}
          <Badge tone="success">HIPAA</Badge>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-3 bg-surface-muted/30">
        {thread.messages.map((msg) => {
          const isOwn = msg.senderUserId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                  isOwn
                    ? "bg-blue-500 text-white rounded-br-sm"
                    : "bg-surface border border-border text-text rounded-bl-sm"
                }`}
              >
                <LinkifiedText
                  as="p"
                  className={`text-sm leading-relaxed whitespace-pre-wrap ${
                    isOwn ? "text-white" : "text-text"
                  }`}
                  text={msg.body}
                />
                <p
                  className={`text-[10px] mt-1 ${
                    isOwn ? "text-blue-100" : "text-text-subtle"
                  }`}
                >
                  {isOwn ? "Delivered" : msg.senderName} ·{" "}
                  {formatRelative(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <ReplyComposer threadId={thread.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reply composer (Cancel / Send pair, per ticket)
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
      className="border-t border-border p-3 flex flex-col gap-2 bg-surface"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <Textarea
        name="body"
        rows={2}
        placeholder="Type a secure reply…"
        required
        maxLength={5000}
        className="resize-none"
      />
      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-text-subtle">
          Encrypted at rest · participants only
        </p>
        <div className="flex gap-2">
          <Button
            type="reset"
            variant="secondary"
            size="sm"
          >
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Send
          </Button>
        </div>
      </div>
    </form>
  );
}
