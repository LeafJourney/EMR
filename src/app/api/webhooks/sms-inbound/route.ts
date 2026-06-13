import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizePhoneDigits } from "@/lib/onboarding/phone";
import {
  ingestInboundMessage,
  normalizeInboundMessage,
} from "@/lib/triage/gateway";

/**
 * Inbound SMS webhook (EMR-1145 — Asynchronous Triage Phase 1 + 4.1).
 *
 * Accepts a Twilio-shaped payload (JSON or application/x-www-form-urlencoded):
 *   From       — sender phone (E.164 or US 10-digit)
 *   Body       — message text
 *   MessageSid — provider message id (idempotency key; Twilio retries)
 *
 * Verification (fail-closed, mirroring webhooks/payabli):
 *   - SMS_WEBHOOK_SECRET env var MUST be set, or the route refuses (503).
 *   - The `x-sms-webhook-secret` header MUST match (timing-safe), or 401.
 *
 * Patient matching: `From` is reduced to its 10 significant digits via the
 * shared onboarding/phone normalizer (same digits-only matching philosophy
 * as the EMR-646 universal patient search), then compared against
 * Patient.phone digits-for-digits. Exactly one match → verified sender.
 * Zero or ambiguous matches → the gateway quarantines to the AuditLog
 * dead-letter (never silently dropped) and we still return 200 so the
 * provider doesn't retry forever.
 */

const SECRET_HEADER = "x-sms-webhook-secret";

function secretMatches(provided: string, expected: string): boolean {
  // Hash both sides so timingSafeEqual gets equal-length buffers regardless
  // of attacker-controlled input length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

interface SmsPayload {
  from: string;
  body: string;
  messageSid: string | null;
}

async function parsePayload(req: Request): Promise<SmsPayload | null> {
  const contentType = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> = {};
  try {
    if (contentType.includes("application/json")) {
      raw = (await req.json()) as Record<string, unknown>;
    } else {
      // Twilio default: application/x-www-form-urlencoded
      const params = new URLSearchParams(await req.text());
      raw = Object.fromEntries(params.entries());
    }
  } catch {
    return null;
  }
  const from = typeof raw.From === "string" ? raw.From.trim() : "";
  const body = typeof raw.Body === "string" ? raw.Body : "";
  const messageSid =
    typeof raw.MessageSid === "string" && raw.MessageSid.trim()
      ? raw.MessageSid.trim()
      : null;
  if (!from || !body.trim()) return null;
  return { from, body, messageSid };
}

/** Exact digits-for-digits patient match on the sender phone. */
async function matchPatientByPhone(
  from: string,
): Promise<{ patientId: string | null; reason: string | null }> {
  const digits = normalizePhoneDigits(from);
  if (digits.length !== 10) {
    return { patientId: null, reason: "unparseable_phone" };
  }

  // Prisma can't strip separators in SQL, so narrow with a cheap `contains`
  // on the last four digits, then do the exact normalized comparison in
  // memory — the same digits-only matching the universal patient search uses.
  const candidates = await prisma.patient.findMany({
    where: { phone: { contains: digits.slice(-4) } },
    select: { id: true, phone: true },
    take: 50,
  });

  const exact = candidates.filter(
    (p) => p.phone && normalizePhoneDigits(p.phone) === digits,
  );
  if (exact.length === 1) return { patientId: exact[0].id, reason: null };
  if (exact.length === 0) return { patientId: null, reason: "no_patient_match" };
  // Two patients sharing a phone (household): never guess whose chart to write.
  return { patientId: null, reason: "ambiguous_phone_match" };
}

export async function POST(req: Request) {
  // ── Shared-secret verification (fail-closed) ──────────────────────
  const expected = process.env.SMS_WEBHOOK_SECRET;
  if (!expected) {
    console.error(
      "[webhook/sms-inbound] refusing webhook — SMS_WEBHOOK_SECRET is not configured",
    );
    return NextResponse.json(
      { ok: false, error: "webhook_not_configured" },
      { status: 503 },
    );
  }
  const provided = req.headers.get(SECRET_HEADER) ?? "";
  if (!provided || !secretMatches(provided, expected)) {
    console.warn("[webhook/sms-inbound] invalid shared secret", {
      headerPresent: !!provided,
    });
    return NextResponse.json(
      { ok: false, error: "invalid_secret" },
      { status: 401 },
    );
  }

  // ── Payload ───────────────────────────────────────────────────────
  const payload = await parsePayload(req);
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", hint: "From and Body are required" },
      { status: 400 },
    );
  }

  // ── Sender verification by phone match ────────────────────────────
  const match = await matchPatientByPhone(payload.from);

  const normalized = normalizeInboundMessage({
    patientId: match.patientId,
    channel: "sms",
    rawBody: payload.body,
    senderVerified: match.patientId !== null,
    externalId: payload.messageSid,
  });

  try {
    const result = await ingestInboundMessage(normalized, {
      quarantineContext: {
        // Dead-letter context so staff can follow up with the sender.
        from: payload.from,
        matchFailure: match.reason,
      },
    });

    // In dev, run the agent queue inline (mirrors the portal send path) so
    // correspondence drafts + the portal-side safety check appear without a
    // worker heartbeat.
    if (result.status === "ingested" && process.env.NODE_ENV !== "production") {
      try {
        const { runTick } = await import("@/lib/orchestration/runner");
        await runTick("inline-dev", 4);
      } catch {
        // Dev-only convenience; never fail the webhook for it.
      }
    }

    // 200 for quarantine/duplicate too — the message is persisted (dead-letter
    // or original row); retrying wouldn't change the outcome.
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("[webhook/sms-inbound] ingest failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // 500 so the provider retries — ingest is idempotent on MessageSid.
    return NextResponse.json(
      { ok: false, error: "ingest_failed" },
      { status: 500 },
    );
  }
}
