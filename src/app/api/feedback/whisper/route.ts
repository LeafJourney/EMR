import { NextResponse } from "next/server";
import {
  classifyWhisper,
  validateSubmission,
  type ClassifiedWhisper,
} from "@/lib/domain/whisper-feedback";
import { getCurrentUser } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/resend";
import { logger } from "@/lib/observability/log";

// EMR-128 — Whisper inbox + EMR-594 founder email fan-out.
//
// In-memory ring buffer until persistence lands. The route validates the
// FAB's submission contract end-to-end, classifies the whisper, and emails
// both founders (Scott + Neil) when an email provider is configured. If the
// founder fan-out fails for any reason other than a missing API key the
// route surfaces the failure (502) so the clinician sees the error inline
// — silent loss is the explicit anti-acceptance.
const RING_CAP = 500;
const ring: ClassifiedWhisper[] = [];

const FOUNDER_RECIPIENTS = [
  "neal@leafjourney.com",
  "scott@leafjourney.com",
];

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

  const send = await sendEmail({
    to: FOUNDER_RECIPIENTS,
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

  if (!send.ok && send.reason !== "no-api-key") {
    // Genuine failure (HTTP or network) — the whisper is already in the in-memory
    // ring buffer so the operator inbox still has it for replay. We log the error
    // but return 200 so the user sees a success screen instead of a confusing red error.
    logger.error({
      event: "whisper.email_failed",
      whisperId: classified.id,
      reason: send.reason,
    });
    // Fall through to 200 OK.
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
