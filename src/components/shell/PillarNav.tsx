"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { IconRail } from "./IconRail";
import { ContextDrawer } from "./ContextDrawer";
import { pillarId, sectionContainsPath, type NavSection } from "./nav-sections";

const LAST_PILLAR_KEY = "nav:lastPillar:v1";

export interface PillarNavProps {
  sections: NavSection[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function PillarNav({ sections, header, footer }: PillarNavProps) {
  const pathname = usePathname() ?? "";

  const pathPillar = React.useMemo(() => {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s.icon) continue;
      if (sectionContainsPath(s, pathname)) return pillarId(s, i);
    }
    return null;
  }, [sections, pathname]);

  const [activePillar, setActivePillar] = React.useState<string | null>(
    pathPillar,
  );

  const [pinned, setPinned] = React.useState<boolean>(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("nav:drawerPinned");
      if (stored !== null) {
        setPinned(stored === "true");
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleTogglePin = () => {
    const next = !pinned;
    setPinned(next);
    try {
      window.localStorage.setItem("nav:drawerPinned", String(next));
    } catch {
      /* non-fatal */
    }
  };

  // Open the active pillar's drawer ONLY when the route's pillar actually
  // changes (a real navigation). A same-route re-render — e.g. a server action
  // revalidating the page, which hands PillarNav a fresh `sections` array
  // reference — must NOT re-open a drawer the user just collapsed. That was the
  // "sidebar pops back open when I click Log / Add / Delete / Generate" bug
  // (Owner Portal Revisions, MASTER prompt G2).
  const prevPathPillar = React.useRef<string | null>(pathPillar);
  React.useEffect(() => {
    if (pathPillar && pathPillar !== prevPathPillar.current) {
      setActivePillar(pathPillar);
    }
    prevPathPillar.current = pathPillar;
  }, [pathPillar]);

  // On mount only: if the current route isn't under any pillar, restore the
  // last-used pillar so the drawer isn't empty on a neutral landing page.
  // Deliberately mount-only — re-running on every `sections` change would
  // re-open a dismissed drawer (the bug guarded against above).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathPillar) return;
    try {
      const stored = window.localStorage.getItem(LAST_PILLAR_KEY);
      if (!stored) return;
      const exists = sections.some(
        (s, i) => s.icon && pillarId(s, i) === stored,
      );
      if (exists) setActivePillar(stored);
    } catch {
      /* private mode — non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activePillar) {
        window.localStorage.setItem(LAST_PILLAR_KEY, activePillar);
      }
    } catch {
      /* non-fatal */
    }
  }, [activePillar]);

  const onSelect = (id: string) => {
    setActivePillar((prev) => (prev === id ? null : id));
  };

  const activeSection = React.useMemo(() => {
    if (!activePillar) return null;
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s.icon) continue;
      if (pillarId(s, i) === activePillar) return s;
    }
    return null;
  }, [sections, activePillar]);

  return (
    <div className="flex h-full" data-nav-rail>
      <aside className="relative z-50 flex w-16 shrink-0 flex-col items-center border-r border-border bg-surface">
        {header}
        <div className="flex-1 w-full min-h-0 overflow-y-auto">
          <IconRail
            sections={sections}
            activePillar={activePillar}
            pathPillar={pathPillar}
            onSelect={onSelect}
            pathname={pathname}
          />
        </div>
        {footer}
      </aside>
      <ContextDrawer
        section={activeSection}
        pathname={pathname}
        onClose={() => setActivePillar(null)}
        pinned={pinned}
        onTogglePin={handleTogglePin}
      />
    </div>
  );
}
