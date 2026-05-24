"use client";

/**
 * In-app help drawer.
 *
 * Surface (ux/help-docs-drawer-v2):
 *   - Floating `?` trigger button in the TOP-right of the viewport.
 *     We sit at top-right because the bottom-right corner is
 *     already occupied by the Whisper FAB / Quote popup / Ask Cindy
 *     / Consciousness overlay stack. Trigger button is z-30 so it
 *     never sits above an active modal.
 *   - 420px right-side panel slides in with a dimmed backdrop.
 *   - Closes on Esc, click on backdrop, or X.
 *   - Top: search input.
 *   - Grouped article index, each article opens inline with a back
 *     arrow to return to the index.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`.
 *   - Focus is moved to the first focusable element on open.
 *   - A simple focus trap keeps Tab/Shift+Tab inside the panel.
 *   - On close we restore focus to the trigger button.
 *
 * The component manages its own `open` state so it can be mounted
 * once in the clinician layout without any prop wiring.
 */

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  HelpCircle,
  Keyboard,
  Search,
  X,
} from "lucide-react";
import {
  HELP_ARTICLES,
  HELP_GROUPS,
  articleById,
  articlesByGroup,
  searchHelp,
  type HelpArticle,
  type HelpGroupId,
  type HelpSearchHit,
} from "@/lib/help";
import { MarkdownLite } from "@/components/help/markdown-lite";
import { cn } from "@/lib/utils/cn";

/** Tailwind selector for things we consider focusable inside the drawer. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type View =
  | { kind: "index" }
  | { kind: "article"; id: string }
  | { kind: "search" };

export function HelpDrawer() {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>({ kind: "index" });
  const [query, setQuery] = React.useState("");

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const titleId = React.useId();

  // Reset internal state every time the drawer closes so the user
  // sees a clean index when they re-open.
  React.useEffect(() => {
    if (!open) {
      setView({ kind: "index" });
      setQuery("");
    }
  }, [open]);

  // Body scroll lock.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc + focus management.
  React.useEffect(() => {
    if (!open) return;

    const prevActive = document.activeElement as HTMLElement | null;
    // Snapshot the trigger button ref so the cleanup function uses
    // a stable reference, not a ref that may have changed by the
    // time the effect re-runs.
    const triggerSnapshot = triggerRef.current;

    // Defer focus until after the slide-in transition starts so
    // screen readers announce the dialog title.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 30);

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("data-focus-trap-ignore"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKey);
      // Restore focus to the trigger (or whatever opened the
      // drawer), per WAI-ARIA dialog pattern.
      const target = triggerSnapshot ?? prevActive;
      target?.focus?.();
    };
  }, [open]);

  // Switch to "search" view as soon as the user types.
  React.useEffect(() => {
    if (!open) return;
    if (query.trim().length > 0) {
      setView({ kind: "search" });
    } else if (view.kind === "search") {
      setView({ kind: "index" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const searchHits: HelpSearchHit[] = React.useMemo(
    () => (view.kind === "search" ? searchHelp(query) : []),
    [view, query],
  );

  function openArticle(id: string) {
    setQuery("");
    setView({ kind: "article", id });
    // Scroll the panel back to the top when navigating in.
    requestAnimationFrame(() => {
      panelRef.current?.querySelector("[data-help-body]")?.scrollTo({ top: 0 });
    });
  }

  function backToIndex() {
    setView({ kind: "index" });
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open help drawer"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed top-4 right-4 z-30",
          "h-10 w-10 rounded-full",
          "bg-surface-raised/90 backdrop-blur border border-border",
          "shadow-md hover:shadow-lg",
          "flex items-center justify-center",
          "text-text-muted hover:text-text",
          "transition-all hover:scale-105 active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <HelpDrawerPanel
          ref={panelRef}
          titleId={titleId}
          view={view}
          query={query}
          searchInputRef={searchInputRef}
          searchHits={searchHits}
          onClose={() => setOpen(false)}
          onQueryChange={setQuery}
          onOpenArticle={openArticle}
          onBackToIndex={backToIndex}
        />
      ) : null}
    </>
  );
}

interface PanelProps {
  titleId: string;
  view: View;
  query: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchHits: HelpSearchHit[];
  onClose: () => void;
  onQueryChange: (q: string) => void;
  onOpenArticle: (id: string) => void;
  onBackToIndex: () => void;
}

const HelpDrawerPanel = React.forwardRef<HTMLDivElement, PanelProps>(
  function HelpDrawerPanel(
    {
      titleId,
      view,
      query,
      searchInputRef,
      searchHits,
      onClose,
      onQueryChange,
      onOpenArticle,
      onBackToIndex,
    },
    ref,
  ) {
    const activeArticle: HelpArticle | undefined =
      view.kind === "article" ? articleById(view.id) : undefined;

    const headerTitle =
      view.kind === "article" && activeArticle
        ? activeArticle.title
        : "Help & docs";

    return (
      <div
        className="fixed inset-0 z-40"
        // Outer div is the backdrop + container. We avoid `role`
        // here and put the dialog semantics on the inner panel.
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Close help drawer"
          onClick={onClose}
          data-focus-trap-ignore="true"
          tabIndex={-1}
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-[2px]",
            "animate-in fade-in duration-200",
          )}
        />

        {/* Panel */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "absolute top-0 right-0 h-full w-[420px] max-w-[100vw]",
            "bg-surface border-l border-border shadow-2xl",
            "flex flex-col",
            "animate-in slide-in-from-right duration-200",
          )}
        >
          <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
            {view.kind === "article" ? (
              <button
                type="button"
                aria-label="Back to help index"
                onClick={onBackToIndex}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center",
                  "text-text-muted hover:text-text hover:bg-surface-raised",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                )}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <HelpCircle
                className="h-5 w-5 text-text-muted ml-1"
                aria-hidden="true"
              />
            )}
            <h2
              id={titleId}
              className="flex-1 text-sm font-semibold text-text truncate"
            >
              {headerTitle}
            </h2>
            <button
              type="button"
              aria-label="Close help drawer"
              onClick={onClose}
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                "text-text-muted hover:text-text hover:bg-surface-raised",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          {view.kind === "article" && activeArticle ? (
            <ArticleView article={activeArticle} />
          ) : (
            <IndexAndSearchView
              query={query}
              searchInputRef={searchInputRef}
              searchHits={searchHits}
              isSearching={view.kind === "search"}
              onQueryChange={onQueryChange}
              onOpenArticle={onOpenArticle}
            />
          )}
        </div>
      </div>
    );
  },
);

interface IndexProps {
  query: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchHits: HelpSearchHit[];
  isSearching: boolean;
  onQueryChange: (q: string) => void;
  onOpenArticle: (id: string) => void;
}

function IndexAndSearchView({
  query,
  searchInputRef,
  searchHits,
  isSearching,
  onQueryChange,
  onOpenArticle,
}: IndexProps) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border">
        <label className="relative block">
          <span className="sr-only">Search help articles</span>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            placeholder={`Search ${HELP_ARTICLES.length} articles…`}
            onChange={(e) => onQueryChange(e.target.value)}
            className={cn(
              "w-full rounded-lg border border-border bg-bg",
              "pl-9 pr-3 py-2 text-sm text-text",
              "placeholder:text-text-muted",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
            )}
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto" data-help-body>
        {isSearching ? (
          <SearchResults hits={searchHits} onOpenArticle={onOpenArticle} />
        ) : (
          <GroupIndex onOpenArticle={onOpenArticle} />
        )}
      </div>
    </>
  );
}

function SearchResults({
  hits,
  onOpenArticle,
}: {
  hits: HelpSearchHit[];
  onOpenArticle: (id: string) => void;
}) {
  if (hits.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-text-muted">
        No articles match your search.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {hits.map((hit) => (
        <li key={hit.article.id}>
          <button
            type="button"
            onClick={() => onOpenArticle(hit.article.id)}
            className={cn(
              "w-full text-left px-4 py-3",
              "hover:bg-surface-raised",
              "focus:outline-none focus-visible:bg-surface-raised",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">
                  {hit.article.title}
                </p>
                {hit.snippet ? (
                  <p className="mt-1 text-xs text-text-muted line-clamp-2">
                    {hit.snippet}
                  </p>
                ) : null}
              </div>
              <ChevronRight
                className="h-4 w-4 text-text-muted shrink-0 mt-0.5"
                aria-hidden="true"
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GroupIndex({
  onOpenArticle,
}: {
  onOpenArticle: (id: string) => void;
}) {
  return (
    <div className="py-2">
      {HELP_GROUPS.map((group) => {
        const items = articlesByGroup(group.id);
        return (
          <section
            key={group.id}
            className="px-4 py-2"
            aria-labelledby={`help-group-${group.id}`}
          >
            <h3
              id={`help-group-${group.id}`}
              className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1 mb-1"
            >
              {group.label}
            </h3>
            {group.id === "shortcuts" ? (
              <ShortcutsGroupEntry onOpenArticle={onOpenArticle} />
            ) : (
              <ul className="space-y-0.5">
                {items.map((article) => (
                  <li key={article.id}>
                    <button
                      type="button"
                      onClick={() => onOpenArticle(article.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-2 flex items-center justify-between gap-2",
                        "text-sm text-text hover:bg-surface-raised",
                        "focus:outline-none focus-visible:bg-surface-raised",
                      )}
                    >
                      <span className="truncate">{article.title}</span>
                      <ChevronRight
                        className="h-4 w-4 text-text-muted shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <footer className="px-4 py-4 border-t border-border mt-2">
        <p className="text-xs text-text-muted">
          Looking for something else?  Email{" "}
          <a
            href="mailto:support@leafjourney.com"
            className="text-accent hover:underline"
          >
            support@leafjourney.com
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

/**
 * Special entry for the keyboard shortcuts group: in addition to
 * the article (which is a primer), we expose a quick "open cheat
 * sheet" action that fires the global `?` shortcut.
 *
 * We dispatch a regular `keydown` Shift+/ event on `document`
 * rather than reach into the `KeyboardShortcuts` API directly —
 * that way this stays decoupled from the PR #443 implementation.
 */
function ShortcutsGroupEntry({
  onOpenArticle,
}: {
  onOpenArticle: (id: string) => void;
}) {
  function openCheatSheet() {
    const event = new KeyboardEvent("keydown", {
      key: "?",
      shiftKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }
  const article = articleById("keyboard-shortcuts");
  return (
    <ul className="space-y-0.5">
      <li>
        <button
          type="button"
          onClick={openCheatSheet}
          className={cn(
            "w-full text-left rounded-md px-2 py-2 flex items-center justify-between gap-2",
            "text-sm text-text hover:bg-surface-raised",
            "focus:outline-none focus-visible:bg-surface-raised",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Keyboard className="h-4 w-4 text-text-muted" aria-hidden="true" />
            Open the full cheat sheet
          </span>
          <kbd className="text-[10px] font-mono text-text-muted bg-surface-raised border border-border rounded px-1.5 py-0.5">
            ?
          </kbd>
        </button>
      </li>
      {article ? (
        <li>
          <button
            type="button"
            onClick={() => onOpenArticle(article.id)}
            className={cn(
              "w-full text-left rounded-md px-2 py-2 flex items-center justify-between gap-2",
              "text-sm text-text hover:bg-surface-raised",
              "focus:outline-none focus-visible:bg-surface-raised",
            )}
          >
            <span className="truncate">{article.title}</span>
            <ChevronRight
              className="h-4 w-4 text-text-muted shrink-0"
              aria-hidden="true"
            />
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function ArticleView({ article }: { article: HelpArticle }) {
  const group = HELP_GROUPS.find((g) => g.id === article.group);
  return (
    <div className="flex-1 overflow-y-auto" data-help-body>
      <article className="px-5 py-5">
        {group ? (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            {group.label}
          </p>
        ) : null}
        <h1 className="text-lg font-semibold text-text mb-3">{article.title}</h1>
        <MarkdownLite body={article.body} />
        {article.tags.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] text-text-muted bg-surface-raised border border-border rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
}
