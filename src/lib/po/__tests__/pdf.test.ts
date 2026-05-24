import { describe, expect, it } from "vitest";

import { generateSupplyOrderPdf, poAttachmentFilename } from "../pdf";
import type { SupplyOrderForPdf } from "../types";

const base: SupplyOrderForPdf = {
  poRef: "PO-acme-0042",
  practice: {
    name: "Acme Pain Clinic",
    addressLines: ["123 Mission St", "San Francisco, CA 94103"],
    email: "billing@acmepain.example",
  },
  supplier: { name: "Henry Schein Medical", email: "orders@hs.example" },
  line: {
    supplyName: "Nitrile Exam Gloves, M",
    sku: "HS-NEG-M-1000",
    qty: 4,
    unitCostCents: 1875,
  },
  expectedDeliveryAt: new Date("2026-06-01T00:00:00Z"),
  paymentTermsDays: 30,
  notes: "Loading dock open 9–4.",
  createdAt: new Date("2026-05-22T17:00:00Z"),
};

const fixture = (o: Partial<SupplyOrderForPdf> = {}): SupplyOrderForPdf => ({
  ...base,
  ...o,
});

describe("generateSupplyOrderPdf", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generateSupplyOrderPdf(fixture());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it("embeds PO ref, supply name, supplier, and practice", async () => {
    const text = (await generateSupplyOrderPdf(fixture())).toString("utf8");
    expect(text).toContain("PO-acme-0042");
    expect(text).toContain("Nitrile Exam Gloves, M");
    expect(text).toContain("Henry Schein Medical");
    expect(text).toContain("Acme Pain Clinic");
  });

  it("renders line total = qty × unit cost", async () => {
    const text = (await generateSupplyOrderPdf(fixture())).toString("utf8");
    // 4 × $18.75 = $75.00 — appears twice (line + footer).
    expect(text.match(/\$75\.00/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renders payment terms from the supplier default", async () => {
    const text = (
      await generateSupplyOrderPdf(fixture({ paymentTermsDays: 45 }))
    ).toString("utf8");
    expect(text).toContain("Net 45");
  });

  it("escapes user-supplied text to defeat HTML injection", async () => {
    const text = (
      await generateSupplyOrderPdf(
        fixture({ notes: "<script>alert(1)</script>" }),
      )
    ).toString("utf8");
    expect(text).not.toContain("<script>alert(1)</script>");
    expect(text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("omits the notes section when no notes are supplied", async () => {
    const text = (
      await generateSupplyOrderPdf(fixture({ notes: undefined }))
    ).toString("utf8");
    expect(text).not.toContain(">Notes<");
  });

  it("filename uses the PO ref", () => {
    expect(poAttachmentFilename("PO-acme-0042")).toBe("PO-acme-0042.html");
  });
});
