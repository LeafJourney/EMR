"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NavSections } from "./NavSections";
import type { NavItem, NavSection } from "./nav-sections";

interface MobileNavProps {
  /**
   * Preferred grouped sections. When both `sections` and the legacy `nav`
   * prop are provided, `sections` wins.
   */
  sections?: NavSection[];
  /** Legacy flat nav list, wrapped in a single unlabeled section. */
  nav?: NavItem[];
}

export function MobileNav({ sections, nav }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  const resolved: NavSection[] = React.useMemo(() => {
    if (sections && sections.length > 0) return sections;
    if (nav && nav.length > 0) return [{ items: nav }];
    return [];
  }, [sections, nav]);

  // Close drawer on route change (link click)
  const closeDrawer = () => setOpen(false);

  // MASTER-prompt G2 — autohide on EVERY navigation, including browser
  // back/forward, which a link-click handler alone wouldn't catch. usePathname
  // updates on all of them, so collapse whenever the route changes.
  const firstPath = React.useRef(true);
  React.useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-11 h-11 rounded-md text-text-muted hover:text-text hover:bg-surface-muted active:scale-[0.96] transition-all"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-smooth",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-label="Navigation menu"
        aria-modal={open ? "true" : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-surface border-r border-border flex flex-col",
          // Safe-area-inset so the drawer header clears the notch and the
          // bottom doesn't underlap the home indicator on iOS.
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          "transition-transform duration-300 ease-smooth",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-border/80">
          <span className="text-sm font-medium text-text">Menu</span>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={closeDrawer}
            className="flex items-center justify-center w-11 h-11 rounded-md text-text-muted hover:text-text hover:bg-surface-muted active:scale-[0.96] transition-all"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav
          aria-label="Mobile navigation"
          className="flex-1 overflow-y-auto px-3 py-3"
        >
          <NavSections
            sections={resolved}
            onItemClick={closeDrawer}
            variant="drawer"
          />
        </nav>
      </div>
    </>
  );
}
