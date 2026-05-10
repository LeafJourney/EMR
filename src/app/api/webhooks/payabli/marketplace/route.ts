// EMR-232 — marketplace-side Payabli webhook endpoint.
//
// Sibling to /api/webhooks/payabli (clinical billing). The hemp Pay
// Point's webhook target is configured to deliver here so marketplace
// transactions don't get tangled in the clinical Claim/Payment flow.
//
// Pipeline:
//   1. Read raw body before parsing JSON (signature is over raw bytes).
//   2. HMAC-SHA256 verify against PAYABLI_WEBHOOK_SECRET via
//      timingSafeEqual.
//   3. Parse JSON, dispatch to the handler registered for the event
//      type in src/lib/leafmart/payabli/webhook.ts.
//   4. Respond 200 quickly so Payabli doesn't retry; the handler can
//      fan out async work.

import { NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  dispatchWebhookEvent,
} from "@/lib/leafmart/payabli/webhook";
import type { PayabliWebhookEvent } from "@/lib/leafmart/payabli/types";
import { logger } from "@/lib/observability/log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.PAYABLI_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: better to reject than silently accept unsigned events.
    return NextResponse.json(
      { error: "webhook_secret_not_configured" },
      { status: 503 },
    );
  }

  const signatureHeader =
    req.headers.get("x-payabli-signature") ??
    req.headers.get("x-payabli-webhook-signature");

  // Read the raw body before parsing.
  const rawBody = await req.text();

  const verification = verifyWebhookSignature({
    rawBody,
    signatureHeader,
    secret,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { error: "invalid_signature", reason: verification.reason },
      { status: 401 },
    );
  }

  let event: PayabliWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayabliWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!event?.eventType) {
    return NextResponse.json({ error: "missing_event_type" }, { status: 400 });
  }

  try {
    await dispatchWebhookEvent(event);
  } catch (err) {
    // eslint-disable-next-line no-console
    logger.error({
      event: "webhook.payabli.marketplace.handler_failed",
      eventType: event.eventType,
      message: err instanceof Error ? err.message : String(err),
    });
    // 500 so Payabli retries — process twice rather than miss.
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
