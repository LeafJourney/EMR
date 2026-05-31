"use server";

import type { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  validateHandoffToken,
  consumeHandoffToken,
} from "@/lib/check-in/kiosk-handoff";
import { issueOtpCode, verifyOtpCode } from "@/lib/check-in/otp";
import { DEFAULT_TEMPLATES } from "@/lib/domain/consent-forms";
import { intakeHasContent } from "@/lib/check-in/lobby-submission-review";
import {
  createKioskLobbySession,
  setKioskLobbyCookie,
  getLobbyScopeFor,
} from "@/lib/check-in/kiosk-lobby-session";

/** Constant-time string equality; rejects empty / length-mismatched inputs. */
function timingSafeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Server actions for the public kiosk→phone LOBBY.
//
// SECURITY MODEL — read before touching:
//   - There is NO Clerk session here. Authorization comes from (a) the handoff
//     token in the URL for the challenge, and (b) the path-scoped lobby cookie
//     thereafter. Both are re-derived server-side every call.
//   - The challenge re-validates the token (without consuming), issues/verifies
//     an SMS OTP, and checks DOB against the patient record. Only on success do
//     we consume the token (atomic single-use) and mint the scoped session.
//   - Completion actions NEVER trust a client patientId: they read the lobby
//     cookie, re-derive patientId + org, and re-check the workflow scope.
//   - Submissions STAGE to KioskLobbySubmission (a review queue). They never
//     overwrite the chart. Audit rows are PHI-free.

// ── Challenge: issue OTP ─────────────────────────────────────────────────────

export interface LobbySendCodeResult {
  ok: boolean;
  error?: string;
}

/**
 * Issue an SMS OTP to the patient's phone on file for this hand-off token.
 * Re-validates the token first (does NOT consume). The token, not a client id,
 * names the patient — so a patient can't request a code for anyone else.
 */
export async function lobbySendCode(token: string): Promise<LobbySendCodeResult> {
  const v = await validateHandoffToken(token);
  if (!v.ok) {
    return { ok: false, error: "This check-in link has expired. Please see the front desk." };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: v.patientId, organizationId: v.organizationId, deletedAt: null },
    select: { phone: true },
  });
  if (!patient) {
    return { ok: false, error: "We couldn't find your record. Please see the front desk." };
  }

  const issued = await issueOtpCode({
    patientId: v.patientId,
    organizationId: v.organizationId,
    purpose: "kiosk_lobby_handoff",
    phone: patient.phone,
  });

  if (!issued.ok) {
    if (issued.reason === "no_phone") {
      return { ok: false, error: "No phone number on file. Please see the front desk to continue." };
    }
    if (issued.reason === "rate_limited") {
      return { ok: false, error: "Too many code requests. Please wait a few minutes and try again." };
    }
    return { ok: false, error: "We couldn't send a code right now. Please see the front desk." };
  }

  return { ok: true };
}

// ── Challenge: verify DOB + OTP, mint scoped session ─────────────────────────

const verifySchema = z.object({
  token: z.string().min(1),
  dateOfBirth: z.string().min(1).max(40),
  code: z.string().min(1).max(12),
});

export interface LobbyVerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Verify the DOB + SMS code for the hand-off token. On success: consume the
 * token (atomic) and mint a scoped lobby session cookie. The patient is
 * re-identified from the token, never from client input.
 */
export async function lobbyVerifyIdentity(
  _prev: LobbyVerifyResult | null,
  formData: FormData,
): Promise<LobbyVerifyResult> {
  const parsed = verifySchema.safeParse({
    token: formData.get("token"),
    dateOfBirth: formData.get("dateOfBirth"),
    code: formData.get("code"),
  });
  if (!parsed.success) return { ok: false, error: "Please enter your date of birth and code." };
  const { token, dateOfBirth, code } = parsed.data;

  const v = await validateHandoffToken(token);
  if (!v.ok) {
    return { ok: false, error: "This check-in link has expired. Please see the front desk." };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: v.patientId, organizationId: v.organizationId, deletedAt: null },
    select: { dateOfBirth: true },
  });
  if (!patient || !patient.dateOfBirth) {
    return { ok: false, error: "We couldn't verify your details. Please see the front desk." };
  }

  // Two independent factors, checked separately for clarity (EMR-915 review):
  //   1. DOB — a low-entropy possession-adjacent check, compared constant-time.
  //   2. The SMS code — the real credential, with bounded/expiring attempts
  //      accounted in verifyOtpCode.
  const expectedDob = patient.dateOfBirth.toISOString().slice(0, 10);
  if (!timingSafeStrEqual(dateOfBirth.trim(), expectedDob)) {
    await auditLobby(v.organizationId, v.patientId, "kiosk.lobby.identity.failed", {
      step: "dob",
    });
    return { ok: false, error: "That date of birth or code didn't match. Please try again." };
  }

  const otp = await verifyOtpCode({
    patientId: v.patientId,
    organizationId: v.organizationId,
    purpose: "kiosk_lobby_handoff",
    attemptCode: code,
  });
  if (!otp.ok) {
    return {
      ok: false,
      error:
        otp.reason === "too_many_attempts"
          ? "Too many tries. Please request a new code."
          : otp.reason === "expired"
            ? "That code expired. Please request a new one."
            : "That date of birth or code didn't match. Please try again.",
    };
  }

  // Atomic single-use: only the winner of the redeem race mints a session.
  const consumed = await consumeHandoffToken(token);
  if (!consumed) {
    return { ok: false, error: "This check-in link was already used. Please see the front desk." };
  }

  const { token: sessionToken, expiresAt } = await createKioskLobbySession({
    patientId: v.patientId,
    organizationId: v.organizationId,
  });
  await setKioskLobbyCookie(sessionToken, expiresAt);

  await auditLobby(v.organizationId, v.patientId, "kiosk.lobby.session.minted", {
    channel: "phone_handoff",
  });

  return { ok: true };
}

// ── Completion: stage intake ─────────────────────────────────────────────────

const intakeSchema = z.object({
  presentingConcerns: z.string().max(2000).optional(),
  treatmentGoals: z.string().max(2000).optional(),
  priorUse: z.boolean(),
  formats: z.string().max(500).optional(),
  reportedBenefits: z.string().max(500).optional(),
});

export type LobbySubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Stage the patient's intake for staff review. Reads the lobby session for the
 * patientId (never the client) and re-checks scope. Writes a pending
 * KioskLobbySubmission — it does NOT overwrite the chart.
 */
export async function lobbySubmitIntake(
  _prev: LobbySubmitResult | null,
  formData: FormData,
): Promise<LobbySubmitResult> {
  const identity = await getLobbyScopeFor("intake");
  if (!identity) return { ok: false, error: "Your session has expired. Please scan the code again." };

  const parsed = intakeSchema.safeParse({
    presentingConcerns: (formData.get("presentingConcerns") as string) ?? "",
    treatmentGoals: (formData.get("treatmentGoals") as string) ?? "",
    priorUse: formData.get("priorUse") === "on",
    formats: (formData.get("formats") as string) ?? "",
    reportedBenefits: (formData.get("reportedBenefits") as string) ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Please check your answers and try again." };

  const cannabisHistory = {
    priorUse: parsed.data.priorUse,
    formats: splitList(parsed.data.formats),
    reportedBenefits: splitList(parsed.data.reportedBenefits),
  };

  const intakePayload = {
    presentingConcerns: parsed.data.presentingConcerns || null,
    treatmentGoals: parsed.data.treatmentGoals || null,
    cannabisHistory,
  };

  // Reject a wholly-empty intake before staging: it satisfies no readiness
  // requirement and would only add a noise row to the staff queue while telling
  // the patient they finished a task that did nothing (EMR-915 review).
  if (!intakeHasContent(intakePayload)) {
    return { ok: false, error: "Please tell us a little about why you're here before submitting." };
  }

  // Idempotent: a re-submit supersedes the prior un-reviewed intake rather than
  // piling up pending rows for staff (EMR-915 review — single pending per kind).
  // Supersede + create run in one transaction so a failed create can't leave the
  // patient with neither their old nor their new submission.
  await prisma.$transaction([
    prisma.kioskLobbySubmission.deleteMany({
      where: {
        patientId: identity.patientId,
        organizationId: identity.organizationId,
        kind: "intake",
        status: "pending",
      },
    }),
    prisma.kioskLobbySubmission.create({
      data: {
        patientId: identity.patientId,
        organizationId: identity.organizationId,
        kind: "intake",
        status: "pending",
        payload: intakePayload,
      },
    }),
  ]);

  await auditLobby(identity.organizationId, identity.patientId, "kiosk.lobby.submission.staged", {
    kind: "intake",
  });

  return { ok: true };
}

// ── Completion: stage consent ────────────────────────────────────────────────

const consentSchema = z.object({
  templateId: z.string().min(1).max(120),
  responses: z.record(z.union([z.string(), z.boolean()])),
  // Typical canvas signatures are well under this; the cap stops payload bloat.
  signatureData: z.string().max(200_000).optional(),
});

/**
 * Stage a signed consent for staff review. Same scope/identity discipline as
 * intake; never trusts a client patientId; writes a pending submission rather
 * than a SignedConsent row.
 */
export async function lobbySubmitConsent(
  input: unknown,
): Promise<LobbySubmitResult> {
  const identity = await getLobbyScopeFor("consent");
  if (!identity) return { ok: false, error: "Your session has expired. Please scan the code again." };

  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please complete the required fields." };

  // The template must be a real, current one — never trust a client-supplied
  // templateId/name/version (EMR-915 review). Name + version are resolved from
  // the catalog so the staged record + audit reflect exactly what was presented.
  const template = DEFAULT_TEMPLATES.find((t) => t.id === parsed.data.templateId);
  if (!template) {
    return { ok: false, error: "That consent form isn't recognized. Please see the front desk." };
  }

  // Idempotent per template: a re-sign of the SAME form supersedes its prior
  // un-reviewed submission; different forms each keep their own pending row.
  // Supersede + create run in one transaction so a failed create can't drop the
  // patient's prior signed consent without recording the new one.
  await prisma.$transaction([
    prisma.kioskLobbySubmission.deleteMany({
      where: {
        patientId: identity.patientId,
        organizationId: identity.organizationId,
        kind: "consent",
        status: "pending",
        payload: { path: ["templateId"], equals: template.id },
      },
    }),
    prisma.kioskLobbySubmission.create({
      data: {
        patientId: identity.patientId,
        organizationId: identity.organizationId,
        kind: "consent",
        status: "pending",
        payload: {
          templateId: template.id,
          templateName: template.name,
          version: template.version,
          responses: parsed.data.responses,
          signatureData: parsed.data.signatureData ?? null,
        },
      },
    }),
  ]);

  await auditLobby(identity.organizationId, identity.patientId, "kiosk.lobby.submission.staged", {
    kind: "consent",
    // PHI-free: which template + version (for reconstruction), not its contents.
    templateId: template.id,
    templateName: template.name,
    version: template.version,
  });

  return { ok: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitList(raw: string | undefined): string[] {
  return raw?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

async function auditLobby(
  organizationId: string,
  patientId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
): Promise<void> {
  // PHI-free metadata only.
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: null,
      action,
      subjectType: "Patient",
      subjectId: patientId,
      metadata,
    },
  });
  logger.info({ event: action, orgScoped: true });
}
