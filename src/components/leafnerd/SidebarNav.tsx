"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNav() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/leafnerd" },
    { name: "Cohort Simulator", href: "/leafnerd/cohorts" },
    { name: "Claims Auditor", href: "/leafnerd/claims" },
  ];

  return (
    <nav className="flex-1 px-4 space-y-2 mt-4">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2.5 rounded-lg font-medium text-sm transition-all border ${
              isActive
                ? "bg-accent-strong/10 text-accent-strong border-accent-strong/20 shadow-sm font-semibold"
                : "text-text-muted border-transparent hover:text-text hover:bg-bg-highlight/5"
            }`}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
