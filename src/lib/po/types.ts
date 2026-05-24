// Input shapes for the PMA v1 PO generation + supplier email pipeline
// (EMR-792). Kept narrow: the Architect PR (EMR-788/789/790/794) owns
// the SupplyOrder / Supplier / Practice Prisma models and adapts them
// into these shapes when transitioning `approved` → `submitted`.
// Decoupling storage from the PDF/email surface lets v1 ship without
// taking a hard dep on the parallel Architect work.

export interface SupplyOrderForPdf {
  /** Human-facing PO ref, e.g. `PO-acme-0042`. Architect generates it. */
  poRef: string;
  practice: {
    name: string;
    addressLines: string[];
    phone?: string;
    email?: string;
  };
  supplier: {
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
  };
  /** v1 ships a single line item; PDF still renders as a table so
   * future multi-line POs slot in without re-layout. */
  line: {
    supplyName: string;
    sku?: string;
    qty: number;
    unitCostCents: number;
  };
  expectedDeliveryAt?: Date;
  /** Net-N payment terms (from `supplier.defaultPaymentTermsDays`). */
  paymentTermsDays: number;
  notes?: string;
  createdAt: Date;
}

// Identical surface in v1 — extends so callers can pass one object to
// both `generateSupplyOrderPdf` and `sendSupplyOrderEmail`.
export type SupplyOrderForEmail = SupplyOrderForPdf;
