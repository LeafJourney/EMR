"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { NavItemBadge, navItemAriaLabel } from "./NavSections";
import { itemMatchesPath, type NavSection } from "./nav-sections";

export interface ContextDrawerProps {
  section: NavSection | null;
  pathname: string;
  onClose: () => void;
  pinned: boolean;
  /** True when overlay is forced by a narrow viewport (G2) — pinning is N/A. */
  narrow?: boolean;
  onTogglePin: () => void;
}

export function ContextDrawer({ section, pathname, onClose, pinned, narrow = false, onTogglePin }: ContextDrawerProps) {
  const open = section !== null;
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open || pinned) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current && ref.current.contains(target)) return;
      const el = target as HTMLElement;
      if (el.closest?.("[data-nav-rail]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open, onClose, pinned]);

  React.useEffect(() => {
    if (!open || pinned) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, pinned]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={section?.label ?? "Navigation"}
      aria-hidden={!open}
      className={cn(
        "hidden md:flex flex-col border-border bg-surface",
        "transition-all duration-300 ease-smooth",
        pinned
          ? "relative border-r w-60 opacity-100"
          : "absolute left-16 top-0 bottom-0 z-50 border-r shadow-2xl w-60",
        pinned && !open && "w-0 border-r-0 opacity-0 pointer-events-none",
        !pinned && !open && "-translate-x-full opacity-0 pointer-events-none border-r-0"
      )}
    >
      {section && (
        <>
          <div className="px-4 pt-6 pb-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
              {section.label ?? "Menu"}
            </p>
          </div>
          <nav
            aria-label={`${section.label ?? "Pillar"} navigation`}
            className="flex-1 overflow-y-auto px-2 pb-4"
          >
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = itemMatchesPath(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-label={navItemAriaLabel(item)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm",
                        "transition-colors duration-200 ease-smooth",
                        isActive
                          ? "bg-surface-muted text-text"
                          : "text-text-muted hover:bg-surface-muted hover:text-text",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-1 w-1 rounded-full transition-colors",
                          isActive
                            ? "bg-accent"
                            : "bg-border-strong group-hover:bg-accent",
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      <NavItemBadge item={item} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          
          {/* Monday.com-style Pin Footer. Hidden when a narrow viewport forces
              overlay mode (G2) — pinning the drawer into the layout isn't an
              option until the window widens again. */}
          {!narrow && (
            <div className="mt-auto border-t border-border/80 p-3">
              <button
                type="button"
                onClick={onTogglePin}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-surface-muted/50 py-2 text-xs font-medium text-text-subtle hover:bg-surface-muted hover:text-text transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={cn("transition-transform duration-200", !pinned && "rotate-45")}
                >
                  <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                </svg>
                {pinned ? "Collapse sidebar" : "Pin sidebar"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
