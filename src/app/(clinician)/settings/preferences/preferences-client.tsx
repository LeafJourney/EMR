"use client";

/**
 * Clinician preferences — unified personalization surface.
 *
 * Persistence strategy:
 *   localStorage only, versioned keys prefixed `emr.prefs.v1.<key>`.
 *
 *   We deliberately do NOT post to a server action: at the time of writing
 *   the Prisma `User` model has no top-level `preferences Json` field, only
 *   `CommunicationPreference.preferences` which is a different scope
 *   (per-category transactional opt-ins). Adding a schema column is out of
 *   scope for an unticketed UX-only run.
 *
 *   TODO(EMR follow-up): add `User.preferences Json @default("{}")` and back
 *   each section with a server action that mirrors the localStorage value.
 *
 * Bootstrapping notes:
 *   - Theme is already bootstrapped at `<html data-theme>` by an inline script
 *     in `src/app/layout.tsx` reading `leafjourney-theme`. We keep that key
 *     name compatible (the existing ThemeToggle uses "light" / "dark"), and
 *     additionally support a "system" choice here that clears the key.
 *   - Density / font-size are applied on mount; no SSR flash mitigations are
 *     in place yet — that's an acceptable follow-up.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyboardHelpModal } from "@/components/ui/keyboard-help-modal";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { OBJECTIVE_DICTATION_PREF_KEY } from "@/lib/clinical/dictation-routing";
import { cn } from "@/lib/utils/cn";

// ----------------------------------------------------------------------
// Storage helpers
// ----------------------------------------------------------------------

const PREFS_NS = "emr.prefs.v1";
const THEME_LEGACY_KEY = "leafjourney-theme"; // shared with ThemeToggle bootstrap

function nsKey(suffix: string) {
  return `${PREFS_NS}.${suffix}`;
}

function readLocal<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function readLocalBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v == null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari private mode etc. — silently no-op; toast still fires so the
    // user gets feedback, the value just won't persist across reloads.
  }
}

function clearLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // see note in writeLocal
  }
}

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type Theme = "light" | "dark" | "system";
type Density = "comfortable" | "dense";
type DefaultLanding =
  | "/clinic"
  | "/clinic/command"
  | "/clinic/messages"
  | "/clinic/sign-off"
  | "/clinic/schedule";
type DefaultMessageFilter = "all" | "unread" | "ai-drafts" | "emergency";

type SectionId =
  | "profile"
  | "appearance"
  | "defaults"
  | "documentation"
  | "notifications"
  | "keyboard"
  | "privacy";

type NavItem = { id: SectionId; label: string; description: string };

const NAV: NavItem[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Photo and practice logo",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and density",
  },
  {
    id: "defaults",
    label: "Defaults",
    description: "Landing route and filters",
  },
  {
    id: "documentation",
    label: "Documentation",
    description: "Dictation and note authoring",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Toasts, bell, digests",
  },
  {
    id: "keyboard",
    label: "Keyboard",
    description: "Shortcuts and cheat sheet",
  },
  {
    id: "privacy",
    label: "Privacy & Audit",
    description: "Your activity and data",
  },
];

const LANDING_OPTIONS: Array<{ value: DefaultLanding; label: string; hint: string }> = [
  { value: "/clinic", label: "Today / Overview", hint: "Default. Daily summary card." },
  { value: "/clinic/command", label: "Command Center", hint: "Mission-control dashboard." },
  { value: "/clinic/messages", label: "Messages", hint: "Patient inbox first." },
  { value: "/clinic/sign-off", label: "Sign-off queue", hint: "Labs / refills / notes to clear." },
  { value: "/clinic/schedule", label: "Schedule", hint: "Today's appointments." },
];

const MESSAGE_FILTER_OPTIONS: Array<{ value: DefaultMessageFilter; label: string }> = [
  { value: "all", label: "All messages" },
  { value: "unread", label: "Unread" },
  { value: "ai-drafts", label: "AI drafts awaiting review" },
  { value: "emergency", label: "Emergency triage" },
];

// ----------------------------------------------------------------------
// Top-level client component
// ----------------------------------------------------------------------

export function PreferencesClient() {
  const { toast } = useToast();
  const [active, setActive] = useState<SectionId>("profile");

  // Hydration: pull values from localStorage on mount so SSR markup stays
  // identical for every user, then "snap into" the persisted choice. This
  // matches how ThemeToggle and FontSizeToggle handle the same problem.
  const [theme, setThemeState] = useState<Theme>("light");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [landing, setLandingState] = useState<DefaultLanding>("/clinic");
  const [msgFilter, setMsgFilterState] = useState<DefaultMessageFilter>("all");
  const [toasts, setToastsState] = useState(true);
  const [bell, setBellState] = useState(true);
  const [digest, setDigestState] = useState(false);
  const [kbdEnabled, setKbdEnabledState] = useState(true);
  const [dictateObjective, setDictateObjectiveState] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // Theme: legacy key may store "light" or "dark"; missing = "system".
    const legacy = readLocal<string>(THEME_LEGACY_KEY, "");
    const initialTheme: Theme =
      legacy === "dark" ? "dark" : legacy === "light" ? "light" : "system";
    setThemeState(initialTheme);

    setDensityState(readLocal<Density>(nsKey("density"), "comfortable"));
    setLandingState(readLocal<DefaultLanding>(nsKey("landing"), "/clinic"));
    setMsgFilterState(
      readLocal<DefaultMessageFilter>(nsKey("msgFilter"), "all"),
    );
    setToastsState(readLocalBool(nsKey("notif.toasts"), true));
    setBellState(readLocalBool(nsKey("notif.bell"), true));
    setDigestState(readLocalBool(nsKey("notif.digest"), false));
    setKbdEnabledState(readLocalBool(nsKey("kbd.enabled"), true));
    setDictateObjectiveState(readLocalBool(OBJECTIVE_DICTATION_PREF_KEY, false));
  }, []);

  // Apply runtime side-effects (data-attributes on <html>) whenever the
  // relevant prefs change so the rest of the app reflects the choice
  // immediately, without waiting for a reload.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      // "system" — honor prefers-color-scheme by clearing the override.
      const prefersDark =
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      root.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  // ----- setters with optimistic toast confirmation -----

  const confirm = useCallback(
    (label: string) =>
      toast({
        title: "Saved",
        description: label,
        variant: "success",
        duration: 1800,
      }),
    [toast],
  );

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      if (next === "system") {
        clearLocal(THEME_LEGACY_KEY);
      } else {
        writeLocal(THEME_LEGACY_KEY, next);
      }
      confirm(`Theme: ${next}`);
    },
    [confirm],
  );

  const setDensity = useCallback(
    (next: Density) => {
      setDensityState(next);
      writeLocal(nsKey("density"), next);
      confirm(`Density: ${next}`);
    },
    [confirm],
  );

  const setLanding = useCallback(
    (next: DefaultLanding) => {
      setLandingState(next);
      writeLocal(nsKey("landing"), next);
      const label = LANDING_OPTIONS.find((o) => o.value === next)?.label ?? next;
      confirm(`Landing: ${label}`);
    },
    [confirm],
  );

  const setMsgFilter = useCallback(
    (next: DefaultMessageFilter) => {
      setMsgFilterState(next);
      writeLocal(nsKey("msgFilter"), next);
      const label =
        MESSAGE_FILTER_OPTIONS.find((o) => o.value === next)?.label ?? next;
      confirm(`Default message filter: ${label}`);
    },
    [confirm],
  );

  const setBool = useCallback(
    (
      key: string,
      setter: (b: boolean) => void,
      label: string,
    ) => (next: boolean) => {
      setter(next);
      writeLocal(nsKey(key), next ? "1" : "0");
      confirm(`${label}: ${next ? "on" : "off"}`);
    },
    [confirm],
  );

  const setToasts = useMemo(
    () => setBool("notif.toasts", setToastsState, "Toast notifications"),
    [setBool],
  );
  const setBell = useMemo(
    () => setBool("notif.bell", setBellState, "Notification bell"),
    [setBool],
  );
  const setDigest = useMemo(
    () => setBool("notif.digest", setDigestState, "Email digest"),
    [setBool],
  );
  const setKbdEnabled = useMemo(
    () => setBool("kbd.enabled", setKbdEnabledState, "Keyboard shortcuts"),
    [setBool],
  );
  // nsKey("dictate.objective") === OBJECTIVE_DICTATION_PREF_KEY — the note
  // editor reads the same key, so this toggle governs in-visit dictation too.
  const setDictateObjective = useMemo(
    () => setBool("dictate.objective", setDictateObjectiveState, "Objective dictation"),
    [setBool],
  );

  const handleExport = useCallback(() => {
    toast({
      title: "Export queued",
      description: "Your data export is not yet implemented — this is a stub.",
      variant: "info",
    });
  }, [toast]);

  // ----- render -----

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-8">
        <SettingsNav active={active} onSelect={setActive} />

        <div className="flex-1 min-w-0 space-y-6">
          {active === "profile" && <ProfileSection />}

          {active === "appearance" && (
            <AppearanceSection
              theme={theme}
              onTheme={setTheme}
              density={density}
              onDensity={setDensity}
            />
          )}

          {active === "defaults" && (
            <DefaultsSection
              landing={landing}
              onLanding={setLanding}
              msgFilter={msgFilter}
              onMsgFilter={setMsgFilter}
            />
          )}

          {active === "documentation" && (
            <DocumentationSection
              dictateObjective={dictateObjective}
              onDictateObjective={setDictateObjective}
            />
          )}

          {active === "notifications" && (
            <NotificationsSection
              toasts={toasts}
              onToasts={setToasts}
              bell={bell}
              onBell={setBell}
              digest={digest}
              onDigest={setDigest}
            />
          )}

          {active === "keyboard" && (
            <KeyboardSection
              enabled={kbdEnabled}
              onEnabled={setKbdEnabled}
              onOpenHelp={() => setHelpOpen(true)}
            />
          )}

          {active === "privacy" && (
            <PrivacySection onExport={handleExport} />
          )}
        </div>
      </div>

      <KeyboardHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

// ----------------------------------------------------------------------
// Nav (left sidebar; horizontal pills on mobile)
// ----------------------------------------------------------------------

function SettingsNav({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav
      aria-label="Preferences sections"
      className={cn(
        // Mobile: horizontal scroller of pills.
        "flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible",
        "lg:w-56 lg:shrink-0 lg:sticky lg:top-20 lg:self-start",
        "pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0",
      )}
    >
      {NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 lg:shrink text-left rounded-md transition-colors",
              "px-3 py-2 text-sm",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              isActive
                ? "bg-surface-raised border border-border-strong/70 text-text shadow-sm"
                : "text-text-muted hover:bg-surface-muted hover:text-text border border-transparent",
            )}
          >
            <span className="block font-medium leading-tight">{item.label}</span>
            <span className="hidden lg:block text-xs text-text-subtle mt-0.5">
              {item.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ----------------------------------------------------------------------
// Shared bits
// ----------------------------------------------------------------------

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        {description && (
          <p className="text-xs text-text-subtle mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border bg-surface-raised p-0.5 shadow-sm"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 h-8 text-xs font-medium rounded transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              isActive
                ? "bg-surface text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
        "transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        checked ? "bg-accent" : "bg-surface-muted border border-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0",
          "transition duration-200 ease-out",
          checked ? "translate-x-5" : "translate-x-0.5",
          "mt-0.5",
        )}
      />
    </button>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-9 rounded-md border border-border-strong/70 bg-surface-raised px-3 text-sm text-text shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ----------------------------------------------------------------------
// Sections
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Profile (provider avatar + practice logo)
// ----------------------------------------------------------------------
//
// TODO(EMR follow-up): when `User.imageUrl` and `Organization.logoUrl`
// columns land in Prisma, swap the localStorage shims for server actions
// + cache revalidation. The AvatarUpload primitive already handles the
// onUpload(dataUrl, file) handoff — only the persistence layer changes.

const PROFILE_PHOTO_KEY = nsKey("profile.photo");
const PRACTICE_LOGO_KEY = nsKey("practice.logo");

function ProfileSection() {
  const { toast } = useToast();
  const [photo, setPhoto] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setPhoto(window.localStorage.getItem(PROFILE_PHOTO_KEY));
      setLogo(window.localStorage.getItem(PRACTICE_LOGO_KEY));
    } catch {
      // Safari private mode — silently fall through, picker still works.
    }
  }, []);

  const persist = useCallback(
    (key: string, dataUrl: string) => {
      try {
        window.localStorage.setItem(key, dataUrl);
      } catch (err) {
        // QuotaExceededError on browsers with tiny localStorage budgets
        // (Safari ~5MB). Surface a real error so the optimistic preview
        // rolls back via the AvatarUpload toast.
        throw new Error(
          err instanceof Error && err.name === "QuotaExceededError"
            ? "This browser ran out of room to store the image."
            : "Couldn’t save the image to this browser.",
        );
      }
    },
    [],
  );

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your photo appears in messages and chart notes. The practice logo
          shows on patient-facing PDFs and the portal header.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          <div className="flex flex-col items-center gap-2">
            <AvatarUpload
              initialSrc={photo}
              size={112}
              variant="circle"
              onUpload={async (dataUrl) => {
                persist(PROFILE_PHOTO_KEY, dataUrl);
                setPhoto(dataUrl);
              }}
            />
            <p className="text-xs text-text-muted text-center max-w-[14rem]">
              Your provider headshot
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <AvatarUpload
              initialSrc={logo}
              size={112}
              variant="rounded"
              helperText={logo ? "Drag or tap to change logo" : "Drag or tap to add logo"}
              onUpload={async (dataUrl) => {
                persist(PRACTICE_LOGO_KEY, dataUrl);
                setLogo(dataUrl);
              }}
            />
            <p className="text-xs text-text-muted text-center max-w-[14rem]">
              Practice logo
            </p>
          </div>
        </div>
        <p className="mt-6 text-[11px] text-text-subtle leading-relaxed">
          Saved to this browser only — a server-side photo store is on the
          roadmap.{" "}
          <button
            type="button"
            className="underline hover:text-text"
            onClick={() => {
              try {
                window.localStorage.removeItem(PROFILE_PHOTO_KEY);
                window.localStorage.removeItem(PRACTICE_LOGO_KEY);
              } catch {
                /* noop */
              }
              setPhoto(null);
              setLogo(null);
              toast({ title: "Cleared", variant: "info", duration: 2000 });
            }}
          >
            Clear both
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

function AppearanceSection({
  theme,
  onTheme,
  density,
  onDensity,
}: {
  theme: Theme;
  onTheme: (t: Theme) => void;
  density: Density;
  onDensity: (d: Density) => void;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Theme and information density apply across every clinic surface.
          Saved to this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="Theme"
            description="Light, dark, or follow your operating system."
          >
            <SegmentedControl<Theme>
              ariaLabel="Theme"
              value={theme}
              onChange={onTheme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </Row>

          <Row
            title="Density"
            description="Comfortable adds breathing room; Dense fits more rows on screen."
          >
            <SegmentedControl<Density>
              ariaLabel="Density"
              value={density}
              onChange={onDensity}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "dense", label: "Dense" },
              ]}
            />
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}

function DefaultsSection({
  landing,
  onLanding,
  msgFilter,
  onMsgFilter,
}: {
  landing: DefaultLanding;
  onLanding: (v: DefaultLanding) => void;
  msgFilter: DefaultMessageFilter;
  onMsgFilter: (v: DefaultMessageFilter) => void;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Defaults</CardTitle>
        <CardDescription>
          Choose where you land when you sign in and how the inbox filters
          itself by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="Default landing route"
            description="The first page after sign-in."
          >
            <Select<DefaultLanding>
              ariaLabel="Default landing route"
              value={landing}
              onChange={onLanding}
              options={LANDING_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Row>

          <Row
            title="Default message filter"
            description="Pre-applied when you open /clinic/messages."
          >
            <Select<DefaultMessageFilter>
              ariaLabel="Default message filter"
              value={msgFilter}
              onChange={onMsgFilter}
              options={MESSAGE_FILTER_OPTIONS}
            />
          </Row>
        </div>
        <p className="mt-3 text-xs text-text-subtle">
          Routes that consume these values will read{" "}
          <code className="font-mono text-[11px] bg-surface-muted px-1 rounded">
            emr.prefs.v1.landing
          </code>{" "}
          and{" "}
          <code className="font-mono text-[11px] bg-surface-muted px-1 rounded">
            emr.prefs.v1.msgFilter
          </code>{" "}
          from <code className="font-mono text-[11px]">localStorage</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function DocumentationSection({
  dictateObjective,
  onDictateObjective,
}: {
  dictateObjective: boolean;
  onDictateObjective: (b: boolean) => void;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Documentation</CardTitle>
        <CardDescription>
          How voice dictation behaves in the note editor. Saved to this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="Dictate the Objective section"
            description="Off by default — many practices have staff document vitals/Objective. Turn on to dictate Objective yourself (e.g. reading vitals aloud). AI generation for Objective stays disabled either way."
          >
            <Toggle
              ariaLabel="Dictate the Objective section"
              checked={dictateObjective}
              onChange={onDictateObjective}
            />
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsSection({
  toasts,
  onToasts,
  bell,
  onBell,
  digest,
  onDigest,
}: {
  toasts: boolean;
  onToasts: (b: boolean) => void;
  bell: boolean;
  onBell: (b: boolean) => void;
  digest: boolean;
  onDigest: (b: boolean) => void;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Master toggles for in-app and asynchronous notifications. Per-event
          routing lives inside each workflow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="Toast notifications"
            description="Transient success / error popups in the bottom-right."
          >
            <Toggle
              ariaLabel="Toast notifications"
              checked={toasts}
              onChange={onToasts}
            />
          </Row>
          <Row
            title="Notification center"
            description="The bell icon and its persistent activity panel."
          >
            <Toggle
              ariaLabel="Notification bell"
              checked={bell}
              onChange={onBell}
            />
          </Row>
          <Row
            title="Daily email digest"
            description="Once-a-day summary of inbox, sign-off queue, and labs. Coming soon."
          >
            <Toggle
              ariaLabel="Daily email digest"
              checked={digest}
              onChange={onDigest}
            />
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}

function KeyboardSection({
  enabled,
  onEnabled,
  onOpenHelp,
}: {
  enabled: boolean;
  onEnabled: (b: boolean) => void;
  onOpenHelp: () => void;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Keyboard</CardTitle>
        <CardDescription>
          Global shortcuts speed up navigation. Hit{" "}
          <kbd className="font-mono text-[11px] bg-surface-muted border border-border rounded px-1.5 py-0.5">
            ?
          </kbd>{" "}
          anywhere to open the cheat sheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="Enable keyboard shortcuts"
            description="When off, only the cheat-sheet hotkey responds."
          >
            <Toggle
              ariaLabel="Enable keyboard shortcuts"
              checked={enabled}
              onChange={onEnabled}
            />
          </Row>
          <Row
            title="Cheat sheet"
            description="See every shortcut in one place."
          >
            <Button variant="secondary" size="sm" onClick={onOpenHelp}>
              Open cheat sheet
            </Button>
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}

function PrivacySection({ onExport }: { onExport: () => void }) {
  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Privacy & Audit</CardTitle>
        <CardDescription>
          Your own activity and the data we hold about you. PHI access by other
          users lives in the org-wide audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/60">
          <Row
            title="My activity log"
            description="Every chart you've opened and every action you've taken."
          >
            <Link
              href="/clinic/audit-trail"
              className={cn(
                "inline-flex items-center justify-center h-8 px-3.5 text-sm font-medium rounded-md",
                "bg-surface-raised border border-border-strong/70 shadow-sm",
                "hover:bg-surface-muted hover:border-border-strong text-text",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
            >
              View audit log
            </Link>
          </Row>
          <Row
            title="Download my data"
            description="Stub. A JSON bundle of your account + preferences. Wiring is a follow-up."
          >
            <Button variant="secondary" size="sm" onClick={onExport}>
              Download (stub)
            </Button>
          </Row>
        </div>
      </CardContent>
    </Card>
  );
}
