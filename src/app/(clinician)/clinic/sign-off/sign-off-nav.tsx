"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export type NavSection = {
  label: string;
  href: string;
  count: number;
  hasUrgent: boolean;
};

export function SignOffNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {sections.map((s) => {
        const isAll = s.href === "/clinic/sign-off";
        const active = isAll
          ? pathname === "/clinic/sign-off"
          : pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              active
                ? "bg-accent/10 text-accent"
                : "text-text hover:bg-surface-muted"
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {s.hasUrgent && (
                <span className="h-1.5 w-1.5 rounded-full bg-danger shrink-0" aria-label="urgent items" />
              )}
              {s.label}
            </span>
            {s.count > 0 && (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                  active
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-muted text-text-subtle"
                )}
              >
                {s.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
