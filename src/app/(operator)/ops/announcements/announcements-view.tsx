"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, Input, Textarea } from "@/components/ui/input";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils/cn";

export type AnnouncementCategory = "Clinical" | "Ops" | "Celebrations" | "Reminders";

export interface AnnouncementComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  category: AnnouncementCategory;
  createdAt: string;
  pinned: boolean;
  reactions: Record<string, number>;
  comments: AnnouncementComment[];
}

const REACTIONS = ["👍", "❤️", "🎉"] as const;
const CATEGORIES: AnnouncementCategory[] = ["Clinical", "Ops", "Celebrations", "Reminders"];

const CATEGORY_TONES: Record<AnnouncementCategory, "accent" | "info" | "highlight" | "warning"> = {
  Clinical: "accent",
  Ops: "info",
  Celebrations: "highlight",
  Reminders: "warning",
};

export function AnnouncementsView({
  initialAnnouncements,
  currentAuthor,
}: {
  initialAnnouncements: Announcement[];
  currentAuthor: string;
}) {
  const [items, setItems] = useState<Announcement[]>(initialAnnouncements);
  const [filter, setFilter] = useState<"all" | AnnouncementCategory>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    category: "Ops" as AnnouncementCategory,
    pinned: false,
  });
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [items, filter]);

  function react(id: string, emoji: string) {
    setItems((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, reactions: { ...a.reactions, [emoji]: (a.reactions[emoji] ?? 0) + 1 } }
          : a,
      ),
    );
  }

  function postComment(id: string) {
    const text = (commentDraft[id] ?? "").trim();
    if (!text) return;
    const c: AnnouncementComment = {
      id: `c-${Date.now()}`,
      author: currentAuthor,
      text,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, comments: [...a.comments, c] } : a)));
    setCommentDraft({ ...commentDraft, [id]: "" });
  }

  function publish() {
    if (!draft.title.trim()) return;
    const a: Announcement = {
      id: `a-${Date.now()}`,
      title: draft.title.trim(),
      body: draft.body.trim(),
      author: currentAuthor,
      category: draft.category,
      createdAt: new Date().toISOString(),
      pinned: draft.pinned,
      reactions: {},
      comments: [],
    };
    setItems((prev) => [a, ...prev]);
    setComposeOpen(false);
    setDraft({ title: "", body: "", category: "Ops", pinned: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", ...CATEGORIES] as const).map((c) => {
            const active = filter === c;
            const count = c === "all" ? items.length : items.filter((i) => i.category === c).length;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-surface text-text-muted border-border hover:bg-surface-muted",
                )}
              >
                {c === "all" ? "All" : c}
                <span className={cn("ml-2 tabular-nums", active ? "text-white/80" : "text-text-subtle")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          Post announcement
        </Button>
      </div>

      <div className="space-y-4">
        {visible.map((a) => (
          <Card key={a.id} tone="raised" className={cn(a.pinned && "ring-1 ring-accent/25")}>
            <CardContent className="py-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge tone={CATEGORY_TONES[a.category]}>{a.category}</Badge>
                    {a.pinned && <Badge tone="warning">Pinned</Badge>}
                  </div>
                  <h3 className="font-display text-lg text-text">{a.title}</h3>
                  <p className="text-[11px] text-text-subtle mt-1">
                    by {a.author} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <LinkifiedText
                as="p"
                className="text-sm text-text-muted whitespace-pre-line"
                text={a.body}
              />
              <div className="flex items-center gap-2">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(a.id, emoji)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-surface-muted hover:bg-accent-soft transition-colors"
                  >
                    <span>{emoji}</span>
                    <span className="text-xs text-text-muted tabular-nums">
                      {a.reactions[emoji] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="pt-3 border-t border-border/60 space-y-2">
                {a.comments.length > 0 && (
                  <ul className="space-y-2">
                    {a.comments.map((c) => (
                      <li key={c.id} className="text-xs">
                        <span className="font-medium text-text">{c.author}</span>{" "}
                        <span className="text-text-subtle">
                          · {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                        <LinkifiedText
                          as="p"
                          className="text-text-muted mt-0.5"
                          text={c.text}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Write a comment…"
                    value={commentDraft[a.id] ?? ""}
                    onChange={(e) => setCommentDraft({ ...commentDraft, [a.id]: e.target.value })}
                    className="flex-1"
                  />
                  <Button size="sm" variant="secondary" onClick={() => postComment(a.id)}>
                    Post
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setComposeOpen(false)}
        >
          <Card tone="raised" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">New post</p>
                <h3 className="font-display text-lg text-text">Share with the team</h3>
              </div>
              <FieldGroup label="Title">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g., New insomnia dosing protocol"
                />
              </FieldGroup>
              <FieldGroup label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as AnnouncementCategory })}
                  className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Body">
                <Textarea
                  rows={6}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </FieldGroup>
              <label className="flex items-center gap-2 text-sm text-text-muted">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                  className="h-4 w-4"
                />
                Pin to top of feed
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setComposeOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={publish} disabled={!draft.title.trim()}>
                  Publish
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
