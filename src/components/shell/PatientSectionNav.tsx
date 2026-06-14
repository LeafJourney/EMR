"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Patient section sub-navigation.
 *
 * Horizontal tab bar within a patient portal section (My Records, My Garden,
 * Account, Chat & Learn). Mirrors the clinician chart tabs — a consistent,
 * scannable row one click deep from the sidebar.
 *
 * `health` (My Records) renders as a two-row collapsible ribbon per EMR-195
 * (Dr. Patel whiteboard): a primary row with the most-trafficked links and
 * a secondary "More" row that expands on demand. Other sections render as
 * a single row.
 */

interface TabDef {
  label: string;
  href: string;
}

interface SectionDef {
  title: string;
  primary: TabDef[];
  secondary?: TabDef[];
}

const SECTIONS: Record<string, SectionDef> = {
  // EMR-195: "My Records" with two collapsible ribbons. Primary keeps the
  // most-trafficked destinations; secondary collapses behind a "More" toggle
  // so the 9-tab ribbon doesn't overwhelm on first paint.
  // EMR-355: Medications + Dosing plan are merged.
  // EMR-361: "Log dose" lives under My Health (was a truncated "Lo" link
  //          dangling off /portal/outcomes — now points at /portal/log-dose).
  health: {
    title: "My Health",
    primary: [
      { label: "My Records", href: "/portal/records" },
      // EMR-355: "Dosing plan" was merged into Medications; the dosing
      // recommendation now lives at the bottom of /portal/medications
      // under the #dosing-plan anchor.
      { label: "Medications & Dosing", href: "/portal/medications" },
      { label: "Log dose", href: "/portal/log-dose" },
      { label: "Labs", href: "/portal/labs" },
    ],
    secondary: [
      { label: "Visit summaries", href: "/portal/visit-summary" },
      { label: "Assessments", href: "/portal/assessments" },
      { label: "Check-in history", href: "/portal/outcomes" },
      { label: "Dose history", href: "/portal/dose-history" },
      { label: "Care plan", href: "/portal/care-plan" },
      { label: "Care guide", href: "/portal/education" },
    ],
  },
  // EMR-196: "My Journey" → "My Garden". Cannabis Combo Wheel moved to
  // Chat & Learn (EMR-200).
  garden: {
    title: "My Garden",
    primary: [
      { label: "Lifestyle", href: "/portal/lifestyle" },
      { label: "My Garden", href: "/portal/garden" },
      { label: "Storybook", href: "/portal/storybook" },
      { label: "Roadmap", href: "/portal/roadmap" },
    ],
  },
  // EMR-199: Account ribbon must fit one row at 375px. Community moved to
  // Chat & Learn (EMR-200).
  account: {
    title: "Account",
    primary: [
      { label: "Profile", href: "/portal/profile" },
      { label: "Billing", href: "/portal/billing" },
      { label: "Intake", href: "/portal/intake" },
      { label: "Settings", href: "/portal/settings" },
      { label: "Security", href: "/portal/security" },
    ],
  },
  // EMR-200: Chat & Learn ribbon — community plus the public-style
  // education surfaces.
  // EMR-124: prior "Research" label was misleading — /portal/learn is
  // the educational library (cannabinoids/terpenes/conditions). Renamed
  // to "Learn" so the label matches the destination.
  chatLearn: {
    title: "Chat & Learn",
    primary: [
      { label: "Community", href: "/portal/community" },
      { label: "Cannabis Combo Wheel", href: "/portal/combo-wheel" },
      { label: "ChatCB", href: "/portal/chatcb" },
      { label: "Learn", href: "/portal/learn" },
    ],
  },
};

// Existing pages pass `section="journey"`. EMR-196 renamed the section to
// `garden`; the alias keeps those callers working until they're updated.
const SECTION_ALIAS: Record<string, keyof typeof SECTIONS> = {
  journey: "garden",
};

function Tab({ tab, pathname }: { tab: TabDef; pathname: string }) {
  const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
  return (
    <Link
      href={tab.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2.5 text-sm transition-colors rounded-t-md whitespace-nowrap shrink-0",
        isActive
          ? "text-accent font-semibold"
          : "text-text-muted font-medium hover:text-text hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
          isActive ? "bg-accent" : "bg-border-strong/50",
        )}
      />
      {tab.label}
      {isActive && (
        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
      )}
    </Link>
  );
}

export function PatientSectionNav({ section }: { section: string }) {
  const pathname = usePathname();
  const resolved =
    (SECTION_ALIAS[section] as keyof typeof SECTIONS) ??
    (section as keyof typeof SECTIONS);
  const config = SECTIONS[resolved];
  const secondary = config?.secondary ?? [];
  // Start "More" expanded if the active page lives in the secondary row —
  // otherwise the user lands on an empty-looking primary ribbon with no
  // indication of where they are.
  const secondaryActive = secondary.some(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
  const [moreOpen, setMoreOpen] = useState(secondaryActive);

  if (!config) return null;

  const hasSecondary = secondary.length > 0;

  return (
    // Mobile portrait fix (EMR-117): horizontal scroll instead of wrap so
    // ribbons stay a single scannable row on iPhone portrait. Right-edge
    // fade hint signals more content.
    <div className="relative -mx-4 sm:mx-0 mb-8">
      <nav
        className={cn(
          "flex items-center gap-1 border-b border-border",
          "overflow-x-auto scroll-smooth no-scrollbar",
          "px-4 sm:px-0",
        )}
        aria-label={`${config.title} sections`}
      >
        {config.primary.map((tab) => (
          <Tab key={tab.href} tab={tab} pathname={pathname} />
        ))}
        {hasSecondary && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="patient-section-nav-more"
            className={cn(
              "relative ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
              "text-text-muted hover:text-text hover:bg-surface-muted",
            )}
          >
            {moreOpen ? "Less" : "More"}
            <span
              className={cn(
                "inline-block transition-transform",
                moreOpen ? "rotate-180" : "rotate-0",
              )}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
        )}
      </nav>

      {hasSecondary && moreOpen && (
        <nav
          id="patient-section-nav-more"
          className={cn(
            "flex items-center gap-1 border-b border-border/60 bg-surface-muted/30",
            "overflow-x-auto scroll-smooth no-scrollbar",
            "px-4 sm:px-2",
          )}
          aria-label={`${config.title} more sections`}
        >
          {secondary.map((tab) => (
            <Tab key={tab.href} tab={tab} pathname={pathname} />
          ))}
        </nav>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 bottom-px w-8 bg-gradient-to-l from-bg to-transparent sm:hidden"
      />
    </div>
  );
}