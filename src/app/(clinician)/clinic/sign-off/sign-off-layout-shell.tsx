"use client";

import type { ReactNode } from "react";
import { SplitPane } from "@/components/ui/split-pane";

export function SignOffLayoutShell({
  nav,
  children,
}: {
  nav: ReactNode;
  children: ReactNode;
}) {
  return (
    <SplitPane
      orientation="horizontal"
      defaultSize={224}
      minSize={160}
      maxSize={320}
      storageKey="sign-off-nav"
      ariaLabel="Resize sign-off navigation"
      className="h-full min-h-[calc(100vh-4rem)]"
    >
      <div className="h-full bg-surface border-r border-border flex flex-col p-3 overflow-y-auto">
        <p className="text-[11px] font-semibold text-text-subtle uppercase tracking-[0.12em] mb-3 px-2">
          Sign-off
        </p>
        {nav}
      </div>
      <div className="h-full bg-surface-raised overflow-y-auto">{children}</div>
    </SplitPane>
  );
}
