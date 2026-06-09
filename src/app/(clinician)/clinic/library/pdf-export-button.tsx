"use client";

import { PrintLinkButton } from "@/components/print/PrintLinkButton";

export function PdfExportButton() {
  return (
    <PrintLinkButton
      href="/clinic/library/print"
      label="Export to PDF"
      variant="secondary"
    />
  );
}
