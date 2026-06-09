"use client";

import { Button } from "@/components/ui/button";

// EMR-906 — triggers the browser print dialog for the branded invoice sheet.
export function PrintInvoiceButton() {
  return (
    <Button size="sm" onClick={() => window.print()} data-no-print>
      Print invoice
    </Button>
  );
}
