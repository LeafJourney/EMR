// EMR-143 — HIPAA-compliant Zoom integration.
//
// HIPAA Zoom accounts ship with a stricter default config than the
// consumer product: end-to-end encryption is on, cloud recording is
// disabled, and waiting rooms / passcodes are required. This module
// centralises that config so every meeting we schedule from the EMR
// inherits the same posture.
//
// In production this calls the Zoom REST API with a short-lived
// server-to-server JWT. In dev (or when the API credentials are
// missing) it returns deterministic placeholder values so the rest
// of the flow — DB write, UI render, audit log — works end-to-end
// without pinging Zoom.
//
// The HIPAA Business Associate Agreement (BAA) only applies if the
// account is on the paid Healthcare tier; we surface that explicitly
// in the UI ("HIPAA Zoom — BAA in place") rather than silently
// trusting that the operator picked the right plan.

import { randomBytes } from "crypto";

export interface ZoomMeetingConfig {
  topic: string;
  scheduledFor: Date;
  durationMinutes: number;
  // The host's Zoom user id / email — usually the clinician scheduling.
  hostEmail?: string;
}

export interface ScheduledZoomMeeting {
  meetingId: string;
  topic: string;
  joinUrl: string;
  hostJoinUrl: string;
  // Plaintext passcode — the caller is responsible for encrypting it
  // before persisting (see message-crypto.encryptMessageBody).
  passcode: string;
  startTime: Date;
  durationMinutes: number;
}

// Zoom meeting settings the EMR always insists on. Each entry maps to
// a Zoom REST API field; documented inline so a future maintainer can
// reason about *why* the toggle is the way it is.
const HIPAA_MEETING_SETTINGS = {
  // Per-meeting end-to-end encryption (Zoom's "type 3" security
  // setting). Required for HIPAA — see Zoom's BAA addendum.
  encryption_type: "enhanced_encryption" as const,
  // Waiting room blocks rogue join attempts that bypassed the ICS link.
  waiting_room: true,
  // Cloud recording is OFF. Local recording also OFF — the recording
  // surface is the *EMR's* AI transcript review queue, not Zoom's.
  auto_recording: "none" as const,
  cloud_recording: false,
  // Force a passcode. Zoom rejects the create call without one.
  password_required: true,
  // Disable join-before-host so PHI can't leak in early-arrival chat.
  join_before_host: false,
  // Mute participants on join — operator can unmute when ready.
  mute_upon_entry: true,
  // Require either authenticated Zoom users or our own SSO link.
  meeting_authentication: true,
} as const;

function generatePasscode(): string {
  // Zoom passcodes are alphanumeric, 1–10 chars. We use 8 bytes of
  // randomness, base32-ish encode (no I/O/0/1 to avoid OCR confusion),
  // and trim to 10.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out.slice(0, 10);
}

function generateMeetingId(): string {
  // Zoom meeting IDs are 10–11 digits; we mimic the shape so the UI
  // and copy-paste flows behave the same in dev.
  const digits = "0123456789";
  const bytes = randomBytes(11);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += digits[bytes[i] % 10];
  }
  return out;
}

/**
 * Create a Zoom meeting with HIPAA-compliant defaults baked in. In
 * production this would POST to /v2/users/{userId}/meetings; in dev
 * we synthesise plausible-looking identifiers so the rest of the
 * flow exercises end-to-end without external dependencies.
 *
 * Surfaces a clear flag (`mode`) so callers / UI / logs can tell
 * whether the meeting is real or a dev shim.
 */
export async function scheduleHipaaZoomMeeting(
  config: ZoomMeetingConfig,
): Promise<ScheduledZoomMeeting & { mode: "live" | "dev-shim" }> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    return { ...buildShimMeeting(config), mode: "dev-shim" };
  }

  try {
    const token = await fetchServerToServerToken({
      accountId,
      clientId,
      clientSecret,
    });
    const userIdentifier = config.hostEmail ?? "me";
    const response = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(userIdentifier)}/meetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: config.topic,
          // type=2 → scheduled meeting (vs instant=1, recurring=8).
          type: 2,
          start_time: config.scheduledFor.toISOString(),
          duration: config.durationMinutes,
          timezone: "UTC",
          password: generatePasscode(),
          settings: HIPAA_MEETING_SETTINGS,
        }),
      },
    );
    if (!response.ok) {
      // Fail safe — never let a Zoom outage stop the clinician from
      // scheduling a visit. Fall back to the shim and flag it.
      console.error(
        "[zoom] meeting create failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return { ...buildShimMeeting(config), mode: "dev-shim" };
    }
    const data = (await response.json()) as {
      id: number | string;
      topic: string;
      join_url: string;
      start_url: string;
      password: string;
      start_time: string;
      duration: number;
    };
    return {
      meetingId: String(data.id),
      topic: data.topic,
      joinUrl: data.join_url,
      hostJoinUrl: data.start_url,
      passcode: data.password,
      startTime: new Date(data.start_time),
      durationMinutes: data.duration,
      mode: "live",
    };
  } catch (err) {
    console.error("[zoom] meeting create threw", err);
    return { ...buildShimMeeting(config), mode: "dev-shim" };
  }
}

function buildShimMeeting(config: ZoomMeetingConfig): ScheduledZoomMeeting {
  const meetingId = generateMeetingId();
  const passcode = generatePasscode();
  return {
    meetingId,
    topic: config.topic,
    joinUrl: `https://zoom.us/j/${meetingId}?pwd=${passcode}`,
    hostJoinUrl: `https://zoom.us/s/${meetingId}?zak=dev-host-token`,
    passcode,
    startTime: config.scheduledFor,
    durationMinutes: config.durationMinutes,
  };
}

interface S2SCreds {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

async function fetchServerToServerToken(creds: S2SCreds): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
    "base64",
  );
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`zoom oauth failed: ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Format a Zoom meeting id (e.g. 81234567890) as the
 * "812 3456 7890" layout Zoom uses in its emails.
 */
export function formatZoomMeetingId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length <= 6) return digits;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}
