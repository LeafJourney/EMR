import { NextResponse } from "next/server";
import {
  classifyWhisper,
  validateSubmission,
  type ClassifiedWhisper,
} from "@/lib/domain/whisper-feedback";
import { getCurrentUser } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/resend";
import { logger } from "@/lib/observability/log";

// EMR-128 — Whisper inbox + EMR-594 founder email fan-out + EMR-640 explicit
// founder routing for every submission.
//
// In-memory ring buffer until persistence lands. The route validates the
// FAB's submission contract end-to-end, classifies the whisper, and emails
// both founders (Scott + Neal) on EVERY submission so the AC for EMR-640
// ("a whisper from any page lands in both inboxes") is unconditional —
// area-specialised inboxes still get a Cc when the classifier picks up a
// clinical or billing signal, but they no longer replace the founder
// recipients. If the send fails for any reason other than a missing API
// key the route logs the failure but returns 200 because the ring buffer
// still has the suggestion for replay (silent loss is the anti-acceptance,
// surfacing a transient HTTP wobble to the user is worse than a missed
// email we can replay).
const RING_CAP = 500;
const ring: ClassifiedWhisper[] = [];

// EMR-640: founders are unconditional recipients on every whisper.
// Order intentionally stable so the To: line reads `scott, neal` across
// providers. Email casing follows the founder bootstrap allowlist
// (`SUPER_ADMIN_BOOTSTRAP_EMAILS`) — see leafjourney_founders memory.
const FOUNDER_RECIPIENTS: readonly string[] = [
  "scott@leafjourney.com",
  "neal@leafjourney.com",
];

// Area-specialised inboxes that get Cc'd when the classifier picks a
// signal. Keeping them as a Cc (vs. swapping the To:) ensures founders
// always see traffic flowing to ops queues — critical for the v1
// "founders triage everything" stage.
const AREA_CC: Partial<Record<ClassifiedWhisper["area"], string>> = {
  billing: "billing@leafjourney.com",
  medications: "clinical@leafjourney.com",
};

function getRecipients(whisper: ClassifiedWhisper): {
  to: string[];
  cc?: string[];
} {
  const cc = AREA_CC[whisper.area];
  return { to: [...FOUNDER_RECIPIENTS], cc: cc ? [cc] : undefined };
}

// EMR-640: server-side rate limit + spam guard. The whisper endpoint is
// public (signed-out leafmart and marketing surfaces both mount the FAB)
// so we key on IP rather than user. 10/min/IP is generous for a human
// typing into a textarea and stops a noisy script cold. In-memory only;
// see lib/auth/rate-limit.ts for the Upstash swap point.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function checkRateLimit(
  ip: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

function formatRoles(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return "(no role)";
  return roles.join(", ");
}

function buildEmail(
  whisper: ClassifiedWhisper,
  user: { firstName: string; lastName: string; email: string; roles: string[] } | null,
): { subject: string; text: string; html: string } {
  const userBlock = user
    ? `${user.firstName} ${user.lastName} <${user.email}> — ${formatRoles(user.roles)}`
    : "Anonymous (signed-out surface)";
  const subject = `Whisper · ${whisper.area ?? "general"} · ${whisper.sentiment ?? "neutral"}`;

  const text = [
    `New Whisper feedback`,
    ``,
    `From:        ${userBlock}`,
    `Page:        ${whisper.pageUrl}`,
    `Timestamp:   ${whisper.receivedAt}`,
    `Sentiment:   ${whisper.sentiment ?? "—"}`,
    `Area:        ${whisper.area ?? "—"}`,
    `C-Suite:     ${whisper.cSuiteRoute ?? "—"}`,
    whisper.voiceMemoUrl ? `Voice Memo:  ${whisper.voiceMemoUrl} (retained for 30 days)` : "",
    ``,
    `Comment:`,
    whisper.comment,
    ``,
    `— Leafjourney Whisper bot`,
  ].join("\n");

  // Light HTML rendering so the inbox surfaces a readable card without
  // forcing a templating dependency.
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2a24;line-height:1.5">
      <h2 style="margin:0 0 12px 0;font-weight:600">New Whisper feedback</h2>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0;color:#5b6b62">From</td><td>${escape(userBlock)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5b6b62">Page</td><td><a href="${escape(whisper.pageUrl)}">${escape(whisper.pageUrl)}</a></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5b6b62">Time</td><td>${escape(whisper.receivedAt)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5b6b62">Sentiment</td><td>${escape(whisper.sentiment ?? "—")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#5b6b62">Area</td><td>${escape(whisper.area ?? "—")}</td></tr>
        ${whisper.voiceMemoUrl ? `<tr><td style="padding:2px 12px 2px 0;color:#5b6b62">Voice Memo</td><td><a href="${escape(whisper.voiceMemoUrl)}">Listen to audio</a> (retained 30 days)</td></tr>` : ""}
      </table>
      <div style="margin-top:16px;padding:12px 14px;background:#f3f5f3;border-radius:8px;border:1px solid #e3e8e3;white-space:pre-wrap;font-size:14px">
        ${escape(whisper.comment)}
      </div>
      <p style="margin-top:18px;font-size:12px;color:#6b7873">— Leafjourney Whisper bot</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function POST(req: Request) {
  // EMR-640 — rate limit before parsing to keep abuse cheap. Done in-line
  // (no requireApiAuth) because the FAB is mounted on signed-out surfaces.
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many whispers — give us a moment to read what you sent." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = validateSubmission(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const classified = classifyWhisper(parsed.value);
  // Newest first; cap the buffer.
  ring.unshift(classified);
  if (ring.length > RING_CAP) ring.length = RING_CAP;

  // EMR-594 — fan out to the founder inboxes. `getCurrentUser` is best-effort
  // because the FAB renders on signed-out surfaces (leafmart, marketing) too.
  const currentUser = await getCurrentUser().catch(() => null);
  const { subject, text, html } = buildEmail(classified, currentUser);
  const recipients = getRecipients(classified);

  const send = await sendEmail({
    to: recipients.to,
    cc: recipients.cc,
    subject,
    text,
    html,
    replyTo: currentUser?.email,
    tags: [
      { name: "kind", value: "whisper" },
      { name: "area", value: classified.area ?? "general" },
      { name: "sentiment", value: classified.sentiment ?? "neutral" },
    ],
  });

  // EMR-640 — every whisper is logged with the suggestion id, page, and
  // user identity so the founders can follow up even if the email leg
  // fails. Email outcome ride-along is just a tag on the same record.
  if (send.ok) {
    logger.info({
      event: "whisper.received",
      whisperId: classified.id,
      page: classified.pageUrl,
      area: classified.area,
      sentiment: classified.sentiment,
      userId: currentUser?.id ?? null,
      userEmail: currentUser?.email ?? null,
      to: recipients.to,
      cc: recipients.cc ?? [],
      emailId: send.id,
    });
  } else if (send.reason === "no-api-key") {
    // Dev / un-provisioned deploy. The ring buffer still holds it for the
    // operator inbox; log loudly so the team knows email isn't wired up.
    logger.warn({
      event: "whisper.email_skipped_no_api_key",
      whisperId: classified.id,
      page: classified.pageUrl,
      area: classified.area,
      userId: currentUser?.id ?? null,
      to: recipients.to,
      cc: recipients.cc ?? [],
    });
  } else {
    // Genuine failure (HTTP or network) — the whisper is already in the
    // in-memory ring buffer so the operator inbox still has it for replay.
    // We log the error but return 200 so the user sees a success screen
    // instead of a confusing red error for a transient send issue.
    logger.error({
      event: "whisper.email_failed",
      whisperId: classified.id,
      page: classified.pageUrl,
      area: classified.area,
      userId: currentUser?.id ?? null,
      to: recipients.to,
      cc: recipients.cc ?? [],
      reason: send.reason,
    });
  }

  return NextResponse.json({
    ok: true,
    id: classified.id,
    sentiment: classified.sentiment,
    area: classified.area,
    cSuiteRoute: classified.cSuiteRoute,
    emailed: send.ok,
  });
}

// GET is intentionally limited to the most recent N entries and stripped of
// the annotation data URL — the operator inbox component fetches full
// records server-side, not from this public-ish endpoint.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "20"));
  const items = ring.slice(0, limit).map((w) => ({
    id: w.id,
    receivedAt: w.receivedAt,
    sentiment: w.sentiment,
    area: w.area,
    cSuiteRoute: w.cSuiteRoute,
    pageUrl: w.pageUrl,
    excerpt: w.comment.length > 240 ? `${w.comment.slice(0, 237)}…` : w.comment,
  }));
  return NextResponse.json({ items, total: ring.length });
}
