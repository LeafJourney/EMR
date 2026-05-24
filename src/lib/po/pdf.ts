// Purchase-order "PDF" renderer for the Practice Manager Agent v1
// supply-ordering pipeline (EMR-792).
//
// No PDF library is installed (checked package.json: no
// @react-pdf/renderer, pdfkit, pdf-lib, puppeteer). Per the spec we
// ship HTML-only for v1 and document the missing dep as a follow-up.
// The function still returns a Buffer so the public surface won't
// change when a real PDF renderer lands.
//
// TODO(EMR-792-followup): swap the HTML emitter for @react-pdf/renderer.

import type { SupplyOrderForPdf } from "./types";

export const PO_PDF_MIME = "text/html; charset=utf-8";

const esc = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

function renderHtml(order: SupplyOrderForPdf): string {
  const { practice, supplier, line, expectedDeliveryAt, paymentTermsDays } =
    order;
  const lineTotal = line.qty * line.unitCostCents;
  const address = practice.addressLines.map(esc).join("<br/>");
  const supplierBlock = [
    `<strong>${esc(supplier.name)}</strong>`,
    supplier.contactName && esc(supplier.contactName),
    supplier.email && esc(supplier.email),
    supplier.phone && esc(supplier.phone),
  ]
    .filter(Boolean)
    .join("<br/>");
  const eta = expectedDeliveryAt
    ? `<div><span class="label">Expected delivery</span> ${ymd(expectedDeliveryAt)}</div>`
    : "";
  const notes = order.notes
    ? `<section class="notes"><h3>Notes</h3><p>${esc(order.notes)}</p></section>`
    : "";

  // Apple-iOS aesthetic per CLAUDE.md: system font, soft greys, no chrome.
  const css = `*{box-sizing:border-box}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#111;margin:0;padding:48px;background:#fff}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e5e5ea;padding-bottom:24px;margin-bottom:32px}header h1{font-size:24px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}.ref{text-align:right;font-size:13px;color:#6e6e73}.ref strong{display:block;color:#111;font-size:18px;margin-top:2px}.logo{width:40px;height:40px;border-radius:10px;background:#f2f2f7;margin-bottom:12px}.blocks{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}.block h3,.notes h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6e6e73;margin:0 0 8px;font-weight:600}.block p{margin:0}table{width:100%;border-collapse:collapse;margin-bottom:24px}thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6e6e73;padding:8px 12px;border-bottom:1px solid #e5e5ea;font-weight:600}tbody td{padding:14px 12px;border-bottom:1px solid #f2f2f7;vertical-align:top}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tfoot td{padding:14px 12px;font-weight:600}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:24px 0;font-size:13px}.meta .label{display:inline-block;min-width:140px;color:#6e6e73}.notes{background:#f8f8fa;border-radius:12px;padding:16px 20px;margin-top:24px}.notes p{margin:0;white-space:pre-wrap}footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e5ea;font-size:12px;color:#6e6e73}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Purchase Order ${esc(order.poRef)}</title><style>${css}</style></head><body>
<header><div><div class="logo" aria-hidden="true"></div><h1>${esc(practice.name)}</h1><p style="margin:0;color:#6e6e73;font-size:13px">${address}</p></div><div class="ref">Purchase Order<strong>${esc(order.poRef)}</strong>${ymd(order.createdAt)}</div></header>
<div class="blocks"><div class="block"><h3>Bill to / Ship to</h3><p><strong>${esc(practice.name)}</strong><br/>${address}</p></div><div class="block"><h3>Supplier</h3><p>${supplierBlock}</p></div></div>
<table><thead><tr><th>Item</th><th>SKU</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Line total</th></tr></thead>
<tbody><tr><td>${esc(line.supplyName)}</td><td>${line.sku ? esc(line.sku) : "—"}</td><td class="num">${line.qty}</td><td class="num">${money(line.unitCostCents)}</td><td class="num">${money(lineTotal)}</td></tr></tbody>
<tfoot><tr><td colspan="4" class="num">Total</td><td class="num">${money(lineTotal)}</td></tr></tfoot></table>
<section class="meta"><div><span class="label">Payment terms</span> Net ${paymentTermsDays}</div>${eta}</section>
${notes}
<footer>Generated ${ymd(order.createdAt)} by Leafjourney Practice Manager. Reply to <a href="mailto:${esc(practice.email ?? "")}">${esc(practice.email ?? "the practice")}</a> with questions.</footer>
</body></html>`;
}

/**
 * Render a Purchase Order as a printable document.
 *
 * v1 returns an HTML document encoded as a UTF-8 Buffer. Swappable for
 * a real PDF later without changing this signature.
 */
export async function generateSupplyOrderPdf(
  order: SupplyOrderForPdf,
): Promise<Buffer> {
  return Buffer.from(renderHtml(order), "utf8");
}

/** Filename for the email attachment. `.html` in v1; flip to `.pdf` later. */
export function poAttachmentFilename(poRef: string): string {
  return `${poRef}.html`;
}
