// Supplier-facing PO email for the PMA v1 supply ordering pipeline
// (EMR-792). Reuses the project's Resend wrapper rather than
// introducing a second transactional-email provider.
//
// Throws SupplyOrderEmailError on any failure so the Architect's state
// machine can catch and park the order in `submit_failed` for retry.

import { sendEmail } from "@/lib/email/resend";
import { poAttachmentFilename, PO_PDF_MIME } from "./pdf";
import type { SupplyOrderForEmail } from "./types";

export class SupplyOrderEmailError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "SupplyOrderEmailError";
  }
}

export interface SupplyOrderEmailResult {
  messageId: string;
  sentAt: Date;
}

const subject = (o: SupplyOrderForEmail): string =>
  `[${o.practice.name}] Purchase Order ${o.poRef}`;

const eta = (o: SupplyOrderForEmail): string =>
  o.expectedDeliveryAt
    ? o.expectedDeliveryAt.toISOString().slice(0, 10)
    : "to be confirmed";

const text = (o: SupplyOrderForEmail): string =>
  [
    `Please find attached PO ${o.poRef} for ${o.line.qty} × ${o.line.supplyName}.`,
    `Expected delivery: ${eta(o)}.`,
    `Payment terms: net ${o.paymentTermsDays}.`,
    `Reply to confirm receipt.`,
    ``,
    `— ${o.practice.name}`,
  ].join("\n");

const html = (o: SupplyOrderForEmail): string =>
  `<!doctype html><html><body style="font:14px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#111;margin:0;padding:24px;background:#fff">
<p>Please find attached PO <strong>${o.poRef}</strong> for <strong>${o.line.qty} × ${o.line.supplyName}</strong>.</p>
<p style="color:#3a3a3c">Expected delivery: ${eta(o)}.<br/>Payment terms: net ${o.paymentTermsDays}.</p>
<p>Reply to confirm receipt.</p>
<p style="color:#6e6e73;margin-top:24px">— ${o.practice.name}</p>
</body></html>`;

/**
 * Send the supplier a Purchase Order email with the PO document attached.
 *
 * Throws `SupplyOrderEmailError` on any failure; the orchestrator
 * (EMR-788) catches and parks the order in `submit_failed`.
 */
export async function sendSupplyOrderEmail(
  order: SupplyOrderForEmail,
  pdfAttachment: Buffer,
): Promise<SupplyOrderEmailResult> {
  if (!order.supplier.email) {
    throw new SupplyOrderEmailError(
      `supplier "${order.supplier.name}" has no email on file`,
      "missing-supplier-email",
    );
  }
  const result = await sendEmail({
    to: [order.supplier.email],
    replyTo: order.practice.email,
    subject: subject(order),
    text: text(order),
    html: html(order),
    attachments: [
      {
        filename: poAttachmentFilename(order.poRef),
        content: pdfAttachment,
        contentType: PO_PDF_MIME,
      },
    ],
    tags: [
      { name: "kind", value: "supply-order" },
      { name: "po_ref", value: order.poRef },
    ],
  });
  if (!result.ok) {
    throw new SupplyOrderEmailError(
      `failed to send supplier email: ${result.reason}`,
      result.reason,
    );
  }
  return { messageId: result.id, sentAt: new Date() };
}
