"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * Global ⌘K command palette — Linear-tier polish.
 *
 * Listens for ⌘K / Ctrl+K anywhere in the app, opens a centered modal with
 * a search field and a grouped list of commands. Fuzzy-ranks across name +
 * description + tags. Arrow keys to navigate, Enter to fire, Esc to dismiss.
 *
 * Polish moves vs. the prior version:
 *   • Linear-style ranker — token-aware, exact-prefix > word-start >
 *     contiguous > subsequence, weighted by name > description > tag.
 *   • Recents — last 5 invoked items, persisted to localStorage as
 *     `emr.cmdk.recents.<userId>`. Shown first when query is empty.
 *   • Async patient search — when query looks like a name (≥3 chars, mostly
 *     letters), call `/api/patients/search?q=` and inject rows into a
 *     "Patients" group.
 *   • Default actions — first-class verbs (New patient, Compose message,
 *     Open queue, Schedule visit, Go to sign-off, Open settings) routed
 *     per-role.
 *   • Subtle icons left, kbd shortcut right; backdrop blur; centered 600px
 *     card; entrance scales in (fade-only under prefers-reduced-motion).
 *
 * Commands are split by role — clinician, operator, patient — so the
 * palette shows only the routes the current shell can reach. A role-less
 * render (no `role` prop) includes the union for dev convenience.
 */

export type CommandPaletteRole = "clinician" | "operator" | "patient";

type CommandGroup =
  | "Recents"
  | "Navigate"
  | "Patients"
  | "Actions"
  | "Search"
  | "Billing"
  | "Office of the CFO"
  | "Operations"
  | "Practice Setup"
  | "Intelligence"
  | "System"
  | "Help";

interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  group: CommandGroup | string;
  /** Which role(s) this command applies to. Omit for role-agnostic. */
  roles?: CommandPaletteRole[];
  /** Optional shortcut shown right-aligned (e.g. "G T"). Purely cosmetic. */
  shortcut?: string;
  /** Single-glyph icon. Kept as a string so we don't pull in an icon dep. */
  icon?: string;
  /** Either a route or a function. */
  href?: string;
  run?: (router: ReturnType<typeof useRouter>, query: string) => void;
  keywords?: string[];
}

// ───────────────────────────────────────── Clinician
export const CLINICIAN_COMMANDS: CommandDef[] = [
  // Default actions (verbs) — surfaced first per the Linear pattern.
  {
    id: "c-new-patient",
    label: "New patient",
    hint: "Create a new chart",
    icon: "+",
    href: "/clinic/patients?action=new",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["create", "add", "chart", "intake", "new"],
  },
  {
    id: "c-compose-message",
    label: "Compose message",
    hint: "Start a new patient thread",
    icon: "✎",
    href: "/clinic/messages?action=compose",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["message", "compose", "thread", "send", "new"],
  },
  {
    id: "c-open-queue",
    label: "Open queue",
    hint: "Today's patient queue",
    icon: "⋮",
    href: "/clinic",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["queue", "today", "list", "next"],
  },
  {
    id: "c-schedule-visit",
    label: "Schedule visit",
    hint: "Book an appointment",
    icon: "◷",
    href: "/clinic/schedule?action=new",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["schedule", "appointment", "visit", "book", "calendar"],
  },
  {
    id: "c-go-sign-off",
    label: "Go to sign-off",
    hint: "Pending notes to sign",
    icon: "✓",
    href: "/clinic/sign-off",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["sign", "off", "attest", "approve", "encounter", "notes"],
  },
  {
    id: "c-open-settings",
    label: "Open settings",
    hint: "Account & preferences",
    icon: "⚙",
    href: "/settings/preferences",
    group: "Actions",
    roles: ["clinician"],
    keywords: ["settings", "preferences", "account", "profile"],
  },

  // Navigation
  { id: "c-go-today", label: "Go to Today", icon: "○", href: "/clinic", group: "Navigate", roles: ["clinician"], keywords: ["home", "dashboard"] },
  { id: "c-go-command", label: "Open Command Center", icon: "◉", href: "/clinic/command", group: "Navigate", roles: ["clinician"], keywords: ["ops", "bridge"] },
  { id: "c-go-patients", label: "Go to Roster", icon: "☷", href: "/clinic/patients", group: "Navigate", roles: ["clinician"], keywords: ["roster", "list", "patients"] },
  { id: "c-go-messages", label: "Open Inbox", icon: "✉", href: "/clinic/messages", group: "Navigate", roles: ["clinician"], keywords: ["inbox", "threads", "messages"] },
  { id: "c-go-morning-brief", label: "Open morning brief", icon: "☀", href: "/clinic/morning-brief", group: "Navigate", roles: ["clinician"], keywords: ["agenda", "today", "brief"] },
  { id: "c-go-approvals", label: "Open approvals", icon: "✓", href: "/clinic/approvals", group: "Navigate", roles: ["clinician"], keywords: ["drafts", "review", "approve"] },
  { id: "c-go-labs", label: "Review labs", icon: "⚗", href: "/clinic/sign-off/labs", group: "Navigate", roles: ["clinician"], keywords: ["labs", "results"] },
  { id: "c-go-refills", label: "Review refills", icon: "℞", href: "/clinic/sign-off/refills", group: "Navigate", roles: ["clinician"], keywords: ["refill", "rx", "prescription"] },
  { id: "c-go-providers", label: "Providers directory", icon: "☷", href: "/clinic/providers", group: "Navigate", roles: ["clinician"], keywords: ["directory", "colleagues"] },
  { id: "c-go-research", label: "Research feed", icon: "✦", href: "/clinic/research", group: "Navigate", roles: ["clinician"], keywords: ["pubmed", "papers"] },
  { id: "c-go-library", label: "Education library", icon: "❦", href: "/clinic/library", group: "Navigate", roles: ["clinician"], keywords: ["leaflet", "library", "handouts"] },
  { id: "c-go-audit", label: "Open audit trail", icon: "❒", href: "/clinic/audit-trail", group: "Navigate", roles: ["clinician"], keywords: ["history", "log", "audit"] },

  // Legacy "Actions" — kept under a tighter set of keywords so they don't drown
  // out the verb-style default actions above.
  { id: "c-start-note", label: "Start new note", hint: "Resume the current in-progress encounter", icon: "✎", href: "/clinic/morning-brief?action=resume-note", group: "Actions", roles: ["clinician"], keywords: ["scribe", "draft", "soap", "note"] },
  { id: "c-voice-chart", label: "Start voice-to-chart", icon: "◍", href: "/clinic/morning-brief?action=voice-chart", group: "Actions", roles: ["clinician"], keywords: ["dictate", "speech", "ambient", "voice"] },
  { id: "c-new-rx", label: "Add new prescription", icon: "℞", href: "/clinic/patients?action=new-rx", group: "Actions", roles: ["clinician"], keywords: ["medication", "regimen", "cannabis", "dose"] },
  { id: "c-leaflet", label: "Generate leaflet", icon: "❦", href: "/clinic/library?action=leaflet", group: "Actions", roles: ["clinician"], keywords: ["handout", "education", "patient", "print"] },

  // Help
  { id: "c-help-shortcuts", label: "Show keyboard shortcuts", icon: "?", href: "/clinic?help=shortcuts", group: "Help", roles: ["clinician"], keywords: ["shortcuts", "keys", "help"] },
];

// ───────────────────────────────────────── Operator
export const OPERATOR_COMMANDS: CommandDef[] = [
  // Default actions
  { id: "o-new-patient", label: "New patient", hint: "Create a new chart", icon: "+", href: "/ops/patients?action=new", group: "Actions", roles: ["operator"], keywords: ["create", "add", "patient", "new"] },
  { id: "o-open-queue", label: "Open queue", icon: "⋮", href: "/ops/queue", group: "Actions", roles: ["operator"], keywords: ["queue", "today", "list"] },
  { id: "o-schedule-visit", label: "Schedule visit", icon: "◷", href: "/ops/schedule?action=new", group: "Actions", roles: ["operator"], keywords: ["schedule", "appointment", "book"] },
  { id: "o-open-settings", label: "Open settings", icon: "⚙", href: "/ops/settings/ai-config", group: "Actions", roles: ["operator"], keywords: ["settings", "preferences", "account"] },

  // Navigation
  { id: "o-overview", label: "Overview", icon: "○", href: "/ops", group: "Navigate", roles: ["operator"], keywords: ["home", "dashboard"] },
  { id: "o-mission", label: "Mission Control", icon: "◉", href: "/ops/mission-control", group: "Navigate", roles: ["operator"], keywords: ["agents", "fleet"] },
  { id: "o-schedule", label: "Schedule", icon: "◷", href: "/ops/schedule", group: "Navigate", roles: ["operator"], keywords: ["calendar", "appts"] },
  { id: "o-patients", label: "Patients", icon: "☷", href: "/ops/patients", group: "Navigate", roles: ["operator"], keywords: ["roster"] },
  { id: "o-command", label: "Command Center (clinic)", icon: "◉", href: "/clinic/command", group: "Navigate", roles: ["operator"], keywords: ["bridge", "clinic"] },

  { id: "o-billing", label: "Billing hub", icon: "$", href: "/ops/billing", group: "Billing", roles: ["operator"], keywords: ["billing", "rcm"] },
  { id: "o-scrub", label: "Scrub claims", icon: "$", href: "/ops/scrub", group: "Billing", roles: ["operator"], keywords: ["scrub", "claims", "clean"] },
  { id: "o-denials", label: "Work denials", icon: "$", href: "/ops/denials", group: "Billing", roles: ["operator"], keywords: ["denials", "deny", "work"] },
  { id: "o-aging", label: "Aging buckets", icon: "$", href: "/ops/aging", group: "Billing", roles: ["operator"], keywords: ["aging", "ar", "receivable"] },
  { id: "o-billing-agents", label: "Billing agents", icon: "$", href: "/ops/billing-agents", group: "Billing", roles: ["operator"], keywords: ["agents", "fleet", "rcm"] },
  { id: "o-revenue", label: "Revenue", icon: "$", href: "/ops/revenue", group: "Billing", roles: ["operator"], keywords: ["revenue", "collections"] },
  { id: "o-eligibility", label: "Eligibility checks", icon: "$", href: "/ops/eligibility", group: "Billing", roles: ["operator"], keywords: ["eligibility", "verify", "insurance"] },

  { id: "o-cfo", label: "CFO overview", icon: "◈", href: "/ops/cfo", group: "Office of the CFO", roles: ["operator"], keywords: ["cfo", "finance", "controller", "books"] },
  { id: "o-cfo-pnl", label: "P&L", icon: "◈", href: "/ops/cfo/pnl", group: "Office of the CFO", roles: ["operator"], keywords: ["pnl", "profit", "loss", "income statement"] },
  { id: "o-cfo-cash-flow", label: "Cash flow statement", icon: "◈", href: "/ops/cfo/cash-flow", group: "Office of the CFO", roles: ["operator"], keywords: ["cash flow", "statement", "burn", "runway"] },
  { id: "o-cfo-balance-sheet", label: "Balance sheet", icon: "◈", href: "/ops/cfo/balance-sheet", group: "Office of the CFO", roles: ["operator"], keywords: ["balance sheet", "assets", "liabilities", "equity"] },
  { id: "o-cfo-expenses", label: "Expenses", icon: "◈", href: "/ops/cfo/expenses", group: "Office of the CFO", roles: ["operator"], keywords: ["expenses", "bills", "vendors"] },
  { id: "o-cfo-cash", label: "Cash & banks", icon: "◈", href: "/ops/cfo/cash", group: "Office of the CFO", roles: ["operator"], keywords: ["cash", "bank", "checking", "merchant"] },
  { id: "o-cfo-assets", label: "Fixed assets", icon: "◈", href: "/ops/cfo/assets", group: "Office of the CFO", roles: ["operator"], keywords: ["assets", "equipment", "depreciation"] },
  { id: "o-cfo-liabilities", label: "Liabilities", icon: "◈", href: "/ops/cfo/liabilities", group: "Office of the CFO", roles: ["operator"], keywords: ["liabilities", "loans", "debt", "credit"] },
  { id: "o-cfo-equity", label: "Equity", icon: "◈", href: "/ops/cfo/equity", group: "Office of the CFO", roles: ["operator"], keywords: ["equity", "capital", "distributions", "owner"] },
  { id: "o-cfo-goals", label: "Financial goals", icon: "◈", href: "/ops/cfo/goals", group: "Office of the CFO", roles: ["operator"], keywords: ["goals", "targets", "kpi"] },
  { id: "o-cfo-reports", label: "Reports archive", icon: "◈", href: "/ops/cfo/reports", group: "Office of the CFO", roles: ["operator"], keywords: ["reports", "archive", "history"] },

  { id: "o-staff-schedule", label: "Staff schedule", icon: "☷", href: "/ops/staff-schedule", group: "Operations", roles: ["operator"], keywords: ["shifts", "staff"] },
  { id: "o-time-clock", label: "Time clock", icon: "◷", href: "/ops/time-clock", group: "Operations", roles: ["operator"], keywords: ["clock", "punch", "timesheet"] },
  { id: "o-training", label: "Training", icon: "❦", href: "/ops/training", group: "Operations", roles: ["operator"], keywords: ["learn", "compliance"] },
  { id: "o-policies", label: "Policies", icon: "❒", href: "/ops/policies", group: "Operations", roles: ["operator"], keywords: ["policy", "sop"] },
  { id: "o-incidents", label: "Incidents", icon: "△", href: "/ops/incidents", group: "Operations", roles: ["operator"], keywords: ["incident", "report"] },
  { id: "o-supplies", label: "Supplies", icon: "□", href: "/ops/supplies", group: "Operations", roles: ["operator"], keywords: ["inventory", "order"] },
  { id: "o-vendors", label: "Vendors", icon: "☷", href: "/ops/vendors", group: "Operations", roles: ["operator"], keywords: ["vendor", "supplier"] },
  { id: "o-feedback", label: "Feedback", icon: "✎", href: "/ops/feedback", group: "Operations", roles: ["operator"], keywords: ["feedback", "review"] },
  { id: "o-marketing", label: "Marketing", icon: "✦", href: "/ops/marketing", group: "Operations", roles: ["operator"], keywords: ["campaign", "market"] },
  { id: "o-announcements", label: "Announcements", icon: "✦", href: "/ops/announcements", group: "Operations", roles: ["operator"], keywords: ["announce", "post"] },

  { id: "o-onboarding", label: "Onboarding", icon: "✦", href: "/ops/onboarding", group: "Practice Setup", roles: ["operator"], keywords: ["setup", "onboard"] },
  { id: "o-launch", label: "Practice launch", icon: "✦", href: "/ops/launch", group: "Practice Setup", roles: ["operator"], keywords: ["launch", "go-live"] },
  { id: "o-intake-builder", label: "Intake Builder", icon: "✎", href: "/ops/intake-builder", group: "Practice Setup", roles: ["operator"], keywords: ["intake", "form", "builder"] },
  { id: "o-export", label: "Export data", icon: "↓", href: "/ops/export", group: "Practice Setup", roles: ["operator"], keywords: ["export", "download", "csv"] },

  { id: "o-analytics", label: "Analytics", icon: "◈", href: "/ops/analytics", group: "Intelligence", roles: ["operator"], keywords: ["dashboard", "metrics"] },
  { id: "o-analytics-lab", label: "Analytics Lab", icon: "◈", href: "/ops/analytics-lab", group: "Intelligence", roles: ["operator"], keywords: ["lab", "analytics"] },
  { id: "o-population", label: "Population health", icon: "◈", href: "/ops/population", group: "Intelligence", roles: ["operator"], keywords: ["cohort", "population"] },

  { id: "o-ai-config", label: "AI Config", icon: "⚙", href: "/ops/settings/ai-config", group: "System", roles: ["operator"], keywords: ["ai", "llm", "settings"] },
  { id: "o-webhooks", label: "Webhooks", icon: "⚙", href: "/ops/webhooks", group: "System", roles: ["operator"], keywords: ["webhook", "integration"] },
  { id: "o-api-keys", label: "API keys", icon: "⚙", href: "/ops/api-keys", group: "System", roles: ["operator"], keywords: ["api", "keys", "token"] },
  { id: "o-performance", label: "Performance", icon: "◈", href: "/ops/performance", group: "System", roles: ["operator"], keywords: ["perf", "monitor"] },
  { id: "o-feature-flags", label: "Feature flags", icon: "⚙", href: "/ops/feature-flags", group: "System", roles: ["operator"], keywords: ["flag", "feature", "toggle"] },
  { id: "o-backups", label: "Backups", icon: "⚙", href: "/ops/backups", group: "System", roles: ["operator"], keywords: ["backup", "restore"] },
];

// ───────────────────────────────────────── Patient
export const PATIENT_COMMANDS: CommandDef[] = [
  { id: "p-home", label: "Home", icon: "○", href: "/portal", group: "Navigate", roles: ["patient"], keywords: ["home", "dashboard"] },
  { id: "p-log-dose", label: "Log Dose", icon: "+", href: "/portal/log-dose", group: "Navigate", roles: ["patient"], keywords: ["dose", "log", "intake"] },
  { id: "p-health", label: "My Records", icon: "❒", href: "/portal/records", group: "Navigate", roles: ["patient"], keywords: ["records", "health", "results"] },
  { id: "p-journey", label: "My Garden", icon: "❦", href: "/portal/garden", group: "Navigate", roles: ["patient"], keywords: ["journey", "lifestyle", "garden"] },
  { id: "p-chatlearn", label: "Chat & Learn", icon: "✦", href: "/portal/community", group: "Navigate", roles: ["patient"], keywords: ["community", "chat", "learn", "research", "chatcb", "wheel"] },
  { id: "p-schedule", label: "Schedule", icon: "◷", href: "/portal/schedule", group: "Navigate", roles: ["patient"], keywords: ["appointment", "book"] },
  { id: "p-messages", label: "Messages", icon: "✉", href: "/portal/messages", group: "Navigate", roles: ["patient"], keywords: ["message", "inbox", "chat"] },
  { id: "p-qa", label: "Q&A", icon: "?", href: "/portal/qa", group: "Navigate", roles: ["patient"], keywords: ["question", "answer", "faq"] },
  { id: "p-account", label: "Account", icon: "⚙", href: "/portal/profile", group: "Navigate", roles: ["patient"], keywords: ["profile", "settings", "account"] },
];

const ALL_COMMANDS: CommandDef[] = [
  ...CLINICIAN_COMMANDS,
  ...OPERATOR_COMMANDS,
  ...PATIENT_COMMANDS,
];

export const AUTHENTICATED_COMMANDS: CommandDef[] = ALL_COMMANDS;

// ───────────────────────────────────────── Ranker
//
// Score components (higher = better):
//   +1000  exact-prefix match on label
//   +800   word-start match on label
//   +500   contiguous substring in label
//   +300   word-start match in description (hint)
//   +200   contiguous substring in description
//   +120   word-start match in any tag
//   +80    contiguous substring in any tag
//   +40    subsequence match in label
//   length-penalty: −0.5 * label.length to prefer terser hits
//
// Returns -Infinity if no field matches at all so the row is dropped.
//
// Empty query returns 0 across the board.

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_/.,()&]+/).filter(Boolean);
}

function subseq(q: string, t: string): boolean {
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function rank(query: string, cmd: CommandDef): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const label = cmd.label.toLowerCase();
  const desc = (cmd.hint ?? "").toLowerCase();
  const tagList = (cmd.keywords ?? []).map((k) => k.toLowerCase());

  let score = -Infinity;

  // Label hits.
  if (label.startsWith(q)) score = Math.max(score, 1000 - label.length * 0.5);
  if (tokens(label).some((w) => w.startsWith(q))) score = Math.max(score, 800 - label.length * 0.5);
  if (label.includes(q)) score = Math.max(score, 500 - label.indexOf(q));

  // Description hits.
  if (desc) {
    if (tokens(desc).some((w) => w.startsWith(q))) score = Math.max(score, 300);
    if (desc.includes(q)) score = Math.max(score, 200);
  }

  // Tag hits.
  for (const tag of tagList) {
    if (tag.startsWith(q)) {
      score = Math.max(score, 120);
      break;
    }
    if (tag.includes(q)) score = Math.max(score, 80);
  }

  // Subsequence fallback on label.
  if (score === -Infinity && subseq(q, label)) score = 40 - label.length * 0.2;

  return score;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

// ───────────────────────────────────────── Recents (localStorage)

const RECENTS_LIMIT = 5;

function recentsKey(userId: string | undefined): string {
  return `emr.cmdk.recents.${userId ?? "anon"}`;
}

function readRecents(userId: string | undefined): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentsKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

function writeRecents(userId: string | undefined, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(recentsKey(userId), JSON.stringify(ids.slice(0, RECENTS_LIMIT)));
  } catch {
    /* swallow */
  }
}

// ───────────────────────────────────────── Patient search shape

interface PatientHit {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
}

function looksLikeName(q: string): boolean {
  if (q.length < 3) return false;
  // ≥70% of non-space chars are letters.
  const chars = q.replace(/\s+/g, "");
  if (chars.length === 0) return false;
  const letters = chars.replace(/[^a-zA-Z]/g, "").length;
  return letters / chars.length >= 0.7;
}

// ───────────────────────────────────────── Reduced motion

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

// ───────────────────────────────────────── Component

export interface CommandPaletteProps {
  /**
   * Current role. Filters the command list so each shell only sees its own
   * routes. Omit to include the full union (useful in dev / storybook).
   */
  role?: CommandPaletteRole;
  /**
   * Per-user recents key. When omitted, recents are scoped to `anon`.
   * Threaded in from the (server-rendered) layout via `user.id`.
   */
  userId?: string;
}

export function CommandPalette({ role, userId }: CommandPaletteProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  // Hydrate recents on mount (client-only).
  useEffect(() => {
    setRecentIds(readRecents(userId));
  }, [userId]);

  // Global open/close hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open && !isTypingTarget(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Reset state when the modal opens, focus the input on next tick.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setPatientHits([]);
      // Pull fresh recents (in case another tab updated them).
      setRecentIds(readRecents(userId));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, userId]);

  // Body scroll lock while open, plus restore on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const scoped = useMemo(() => {
    if (!role) return ALL_COMMANDS;
    return ALL_COMMANDS.filter((c) => !c.roles || c.roles.includes(role));
  }, [role]);

  // Patient search — debounced, only when query looks like a name and
  // the role is one that can fetch this endpoint (clinician/operator).
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!looksLikeName(trimmed) || role === "patient") {
      setPatientHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/patients/search?q=${encodeURIComponent(trimmed)}`, {
        signal: ctrl.signal,
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : { patients: [] }))
        .then((data: { patients?: PatientHit[] }) => {
          setPatientHits(Array.isArray(data.patients) ? data.patients : []);
        })
        .catch(() => {
          /* aborted / network — silent */
        });
    }, 160);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open, role]);

  // Build patient command rows from API hits.
  const patientCommands = useMemo<CommandDef[]>(() => {
    const target = role === "operator" ? "/ops/patients" : "/clinic/patients";
    return patientHits.map((p) => {
      const name = `${p.firstName} ${p.lastName}`.trim() || "Unnamed patient";
      const meta = [p.dateOfBirth, p.email, p.phone].filter(Boolean).join(" · ");
      return {
        id: `patient:${p.id}`,
        label: name,
        hint: meta || undefined,
        icon: "☺",
        group: "Patients" as const,
        href: `${target}/${p.id}`,
      } satisfies CommandDef;
    });
  }, [patientHits, role]);

  const results = useMemo(() => {
    const trimmed = query.trim();

    // Empty query — show recents first, then default actions, then the
    // remaining set in natural order.
    if (!trimmed) {
      const byId = new Map(scoped.map((c) => [c.id, c]));
      const recents = recentIds
        .map((id) => byId.get(id))
        .filter((c): c is CommandDef => Boolean(c))
        .map((c) => ({ ...c, group: "Recents" as const }));
      const seenRecent = new Set(recents.map((c) => c.id));
      const rest = scoped.filter((c) => !seenRecent.has(c.id));
      return [...recents, ...rest];
    }

    // Active query — fuzzy-rank.
    const scored = scoped
      .map((cmd) => ({ cmd, score: rank(trimmed, cmd) }))
      .filter((c) => c.score > -Infinity);
    scored.sort((a, b) => b.score - a.score);
    const out: CommandDef[] = scored.map((s) => s.cmd);

    // Role-aware search passthrough. Clinician gets the existing roster
    // filter; operator gets the ops patients list; patient has nothing
    // searchable of that shape so no passthrough there.
    //
    // Clinic-floor roles ALSO get a top-of-list "Search everything" entry
    // that hands the query off to the /search global results page — that's
    // the deeper-search counterpart to ⌘K's quick-jump posture.
    if (trimmed.length > 0) {
      if (role === "clinician" || role === undefined) {
        out.unshift({
          id: "search-all-results",
          label: `Search everything: "${trimmed}"`,
          hint: "Open /search — patients, messages, notes, audit",
          group: "Search",
          run: (r, q) => r.push(`/search?q=${encodeURIComponent(q)}`),
        });
        out.unshift({
          id: "search-clinician-patients",
          label: `Search patients: "${trimmed}"`,
          hint: "Open the roster filtered by this query",
          icon: "⌕",
          group: "Search",
          run: (r, q) =>
            r.push(`/clinic/patients?q=${encodeURIComponent(q)}`),
        });
      } else if (role === "operator") {
        out.unshift({
          id: "search-operator-patients",
          label: `Search patients: "${trimmed}"`,
          hint: "Open the ops roster filtered by this query",
          icon: "⌕",
          group: "Search",
          run: (r, q) =>
            r.push(`/ops/patients?q=${encodeURIComponent(q)}`),
        });
      }
    }

    // Inject async patient hits up top under their own group (above the
    // search passthroughs since concrete matches are most useful).
    if (patientCommands.length > 0) {
      out.unshift(...patientCommands);
    }
    return out;
  }, [query, scoped, role, recentIds, patientCommands]);

  // Keep highlight in range when results shrink.
  useEffect(() => {
    if (highlight >= results.length) setHighlight(0);
  }, [results.length, highlight]);

  const pushRecent = useCallback(
    (id: string) => {
      // Skip ephemeral rows (search passthrough, patient hits) — only static
      // commands belong in recents (they're stable across sessions).
      if (id.startsWith("search-") || id.startsWith("patient:")) return;
      setRecentIds((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENTS_LIMIT);
        writeRecents(userId, next);
        return next;
      });
    },
    [userId],
  );

  const fire = useCallback(
    (cmd: CommandDef) => {
      setOpen(false);
      pushRecent(cmd.id);
      if (cmd.run) {
        cmd.run(router, query.trim());
      } else if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [pushRecent, router, query],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[highlight];
      if (cmd) fire(cmd);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  // Group results by group for a sectioned list. Preserve insertion order.
  const grouped: { group: string; items: CommandDef[] }[] = [];
  for (const cmd of results) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === cmd.group) last.items.push(cmd);
    else grouped.push({ group: cmd.group, items: [cmd] });
  }

  // Reduced motion → collapse entrance animation to fade-only.
  const entranceClass = reduceMotion
    ? "motion-reduce:animate-none animate-[cmdkFade_120ms_ease-out]"
    : "animate-[cmdkPop_140ms_cubic-bezier(0.16,1,0.3,1)]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-text/40 backdrop-blur-md"
      onClick={() => setOpen(false)}
    >
      {/* Local keyframes — kept inline so we don't depend on Tailwind config edits. */}
      <style>{`
        @keyframes cmdkPop {
          from { opacity: 0; transform: translateY(-4px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes cmdkFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <Card
        tone="raised"
        className={cn(
          "w-full max-w-[600px] overflow-hidden shadow-2xl",
          entranceClass,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-3 py-2 flex items-center gap-2">
          <span aria-hidden="true" className="text-text-subtle text-sm select-none">
            ⌘K
          </span>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="border-0 focus:ring-0 focus:border-0 h-9 px-1 text-base"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-sm text-text-subtle text-center py-8">
              No commands match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="mb-2 last:mb-0">
                <p className="px-4 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                  {section.group}
                </p>
                <ul>
                  {section.items.map((cmd) => {
                    const idx = results.indexOf(cmd);
                    const isActive = idx === highlight;
                    return (
                      <li key={cmd.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => fire(cmd)}
                          className={cn(
                            "w-full text-left px-4 py-2 flex items-center justify-between gap-3 transition-colors",
                            isActive
                              ? "bg-accent-soft text-accent"
                              : "hover:bg-surface-muted/60 text-text",
                          )}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "shrink-0 w-5 text-center text-[13px] leading-none select-none",
                                isActive ? "text-accent" : "text-text-subtle",
                              )}
                            >
                              {cmd.icon ?? "·"}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm truncate">{cmd.label}</p>
                              {cmd.hint && (
                                <p className="text-[11px] text-text-subtle truncate">
                                  {cmd.hint}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {cmd.shortcut && (
                              <kbd
                                className={cn(
                                  "text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5 border",
                                  isActive
                                    ? "border-accent/40 text-accent"
                                    : "border-border text-text-subtle",
                                )}
                              >
                                {cmd.shortcut}
                              </kbd>
                            )}
                            {isActive && (
                              <span
                                aria-hidden="true"
                                className="text-[11px] text-accent"
                              >
                                ↵
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-surface-muted/40 text-[11px] text-text-subtle flex items-center justify-between gap-3">
          <span>↑ ↓ navigate · ↵ select</span>
          {query.trim().length > 0 && (role === "clinician" || role === undefined) ? (
            <span>↵ on top row to search all results · esc to close</span>
          ) : (
            <span>esc to close</span>
          )}
        </div>
      </Card>
    </div>
  );
}
