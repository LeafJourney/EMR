// Thin Resend transactional-email wrapper.
//
// Uses Resend's HTTP API directly (no new npm dependency). When
// `RESEND_API_KEY` is unset, `sendEmail` returns `{ ok: false, reason:
// "no-api-key" }` so callers can fall back to a log-only path without
// throwing — useful in dev, CI, and any deploy that hasn't been wired
// up yet. When the key IS present, the caller can trust that a
// `{ ok: false }` result means the send genuinely failed and should be
// surfaced to the user (EMR-594 acceptance).
//
// No logger import here on purpose — `@/lib/observability/log` is
// server-only and would block this module from running in vitest. The
// route handler that calls this wrapper is responsible for logging the
// result.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Default to Resend's universal test sender so the route works the moment
// an API key is added, even before the team verifies a sending domain.
// Production overrides this with a verified `whispers@leafjourney.com` once
// SPF + DKIM are in place.
const DEFAULT_FROM = "Leafjourney <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string[];
  subject: string;
  /** Plain-text body. */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /** Optional override of `From:`. Falls back to `EMAIL_FROM` env / Resend default. */
  from?: string;
  /** Optional reply-to header. */
  replyTo?: string;
  /** Optional tag set (Resend supports custom tags for searching). */
  tags?: Array<{ name: string; value: string }>;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-api-key" }
  | { ok: false; reason: "http-error"; status: number; message: string }
  | { ok: false; reason: "network-error"; message: string };

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "no-api-key" };
  }

  const body = {
    from: input.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    reply_to: input.replyTo,
    tags: input.tags,
  };

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, reason: "network-error", message };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      reason: "http-error",
      status: res.status,
      message: text || `HTTP ${res.status}`,
    };
  }

  // Resend returns { id: "re_..." } on success.
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id ?? "unknown" };
}
