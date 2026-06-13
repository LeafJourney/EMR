"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

// The tax-summary page is a Server Component (it runs Prisma queries), so the
// window.print() handler can't live there — passing an onClick to a button from
// a Server Component throws "Event handlers cannot be passed to Client Component
// props" at render. This tiny client island carries the handler.
type PrintButtonProps = Omit<ComponentProps<typeof Button>, "onClick">;

export function PrintButton({ children = "Print or save as PDF", ...props }: PrintButtonProps) {
  return (
    <Button
      {...props}
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      {children}
    </Button>
  );
}
