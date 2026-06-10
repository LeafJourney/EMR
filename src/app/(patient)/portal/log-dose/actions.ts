"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { recordDailyCheckIn } from "@/lib/gamification/streaks";
import {
  EMOJI_RATING_SCORE,
  POST_DOSE_SCALE_METRICS,
  SIDE_EFFECT_OPTIONS,
  emojiRatingToMoodValue,
  postDoseScaleToOutcomeValue,
} from "@/lib/domain/emoji-outcomes";

/**
 * EMR-1113 (PJ-1) — persist the full post-dose quick-log flow.
 *
 * The QuickDoseLogger (product → emoji → 3 anchored scales → side-effect grid)
 * used to discard everything at the celebration screen. This action writes:
 *
 *  - a DoseLog row (regimen-linked dose, route, estimated mg, side effects,
 *    and a structured `[post_dose] product=… regimenId=…` note), and
 *  - OutcomeLog rows for the emoji (mood, via the same normalization the
 *    follow-up check-in uses) and each completed scale (pain/sleep/anxiety),
 *    attributed to the product via the `regimenId=` note marker so the
 *    per-product efficacy dashboard and the /portal/outcomes trends pick
 *    them up.
 *
 * Then it fires recordDailyCheckIn (streaks + badge evaluation) exactly like
 * the weekly check-in at outcomes/new does.
 */

const VALID_SIDE_EFFECT_IDS = new Set(SIDE_EFFECT_OPTIONS.map((o) => o.id));

const logDoseSchema = z.object({
  regimenId: z.string().trim().min(1).max(64),
  feeling: z.enum(
    Object.keys(EMOJI_RATING_SCORE) as [
      keyof typeof EMOJI_RATING_SCORE,
      ...Array<keyof typeof EMOJI_RATING_SCORE>,
    ]
  ),
  scales: z
    .array(
      z.object({
        metric: z.enum(POST_DOSE_SCALE_METRICS),
        value: z.coerce.number().int().min(1).max(10),
      })
    )
    .max(POST_DOSE_SCALE_METRICS.length)
    .default([]),
  sideEffects: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  // Optional inhalation estimate (vape carts / flower) from the EMR-003
  // puff estimator — overrides the regimen's per-dose volume when present.
  inhaled: z
    .object({
      puffs: z.coerce.number().int().min(1).max(100),
      estimatedThcMg: z.coerce.number().min(0).max(1000),
      estimatedCbdMg: z.coerce.number().min(0).max(1000),
    })
    .optional()
    .nullable(),
});

export type LogDoseInput = z.input<typeof logDoseSchema>;

export type LogDoseResult =
  | { ok: true; newlyEarnedBadges?: any[] }
  | { ok: false; error: string };

export async function logDose(input: LogDoseInput): Promise<LogDoseResult> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const parsed = logDoseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid dose log — please try again." };
  }
  const { regimenId, feeling, scales, sideEffects, inhaled } = parsed.data;

  // The picked product must be one of THIS patient's regimens (active or
  // paused — the picker lets patients log against rotated-off products).
  const regimen = await prisma.dosingRegimen.findFirst({
    where: { id: regimenId, patientId: patient.id },
    include: { product: { select: { name: true, route: true } } },
  });
  if (!regimen) {
    return { ok: false, error: "Product not found on your chart." };
  }

  // De-dupe scales (last value wins) and normalize side effects: drop the
  // "none" sentinel and anything that isn't a known quick-pick id.
  const scaleByMetric = new Map(scales.map((s) => [s.metric, s.value]));
  const effects = [...new Set(sideEffects)].filter(
    (id) => id !== "none" && VALID_SIDE_EFFECT_IDS.has(id)
  );

  const productName = regimen.product.name;
  const emojiScore = EMOJI_RATING_SCORE[feeling];
  const attribution = `product=${productName} regimenId=${regimen.id}`;

  const usedPuffEstimate = inhaled && inhaled.puffs > 0;
  const doseNoteParts = [
    "[post_dose]",
    attribution,
    `emoji=${emojiScore}`,
    usedPuffEstimate ? `puffs=${inhaled.puffs}` : null,
  ].filter(Boolean);

  const outcomeWrites = [
    // Emoji → mood data point (same convention as createFollowUpLog so the
    // per-product efficacy dashboard attributes it via `regimenId=`).
    prisma.outcomeLog.create({
      data: {
        patientId: patient.id,
        metric: "mood" as const,
        value: emojiRatingToMoodValue(feeling),
        note: `[post_dose_feeling] ${attribution} emoji=${emojiScore}`,
      },
    }),
    // Each completed scale → its own OutcomeLog row. Pain/anxiety are
    // captured relief-framed (10 = best) and stored severity-framed to match
    // the trends; the raw relief value rides in the note for research export.
    ...[...scaleByMetric.entries()].map(([metric, raw]) =>
      prisma.outcomeLog.create({
        data: {
          patientId: patient.id,
          metric,
          value: postDoseScaleToOutcomeValue(metric, raw),
          note: `[post_dose_scale] ${attribution} scale=${metric} raw=${raw}`,
        },
      })
    ),
  ];

  await prisma.$transaction([
    prisma.doseLog.create({
      data: {
        patientId: patient.id,
        regimenId: regimen.id,
        actualVolume: usedPuffEstimate ? inhaled.puffs : regimen.volumePerDose,
        volumeUnit: usedPuffEstimate ? "puffs" : regimen.volumeUnit,
        estimatedThcMg: usedPuffEstimate
          ? inhaled.estimatedThcMg
          : regimen.calculatedThcMgPerDose,
        estimatedCbdMg: usedPuffEstimate
          ? inhaled.estimatedCbdMg
          : regimen.calculatedCbdMgPerDose,
        route: regimen.product.route,
        note: doseNoteParts.join(" "),
        sideEffects: effects,
      },
    }),
    ...outcomeWrites,
    prisma.auditLog.create({
      data: {
        organizationId: patient.organizationId,
        actorUserId: user.id,
        action: "patient.dose.logged",
        subjectType: "Patient",
        subjectId: patient.id,
        metadata: {
          regimenId: regimen.id,
          product: productName,
          emoji: emojiScore,
          scales: Object.fromEntries(scaleByMetric),
          sideEffects: effects,
        },
      },
    }),
  ]);

  // Streak + badge evaluation, exactly like the weekly check-in.
  const checkIn = await recordDailyCheckIn(patient.id);

  revalidatePath("/portal");
  revalidatePath("/portal/log-dose");
  revalidatePath("/portal/dose-history");
  revalidatePath("/portal/outcomes");
  revalidatePath("/portal/efficacy");
  revalidatePath("/portal/weekly-recap");

  return { ok: true, newlyEarnedBadges: checkIn.newlyEarnedBadges };
}

/**
 * Post-dose follow-up check-in action.
 *
 * After a patient logs a dose, they can opt to set a timer (30m / 1h / 2h / 4h)
 * to be reminded to check back in on how the dose felt. When that timer fires
 * the client renders an emoji modal and POSTs the chosen rating here.
 *
 * The OutcomeMetric enum doesn't have a dedicated `post_dose_feeling` value,
 * so we record the data point under the existing `mood` metric and stash the
 * structured marker (regimen + raw 1-5 emoji rating) inside `note` for later
 * reconstruction. This keeps the data queryable / exportable for research
 * (per the Patel directive) without requiring a schema migration.
 */

const followUpSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  productName: z.string().trim().min(1).max(200),
  regimenId: z.string().trim().max(64).optional().nullable(),
  delayMinutes: z.coerce.number().int().min(1).max(720).optional().nullable(),
});

export type FollowUpResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createFollowUpLog(input: {
  rating: number;
  productName: string;
  regimenId?: string | null;
  delayMinutes?: number | null;
}): Promise<FollowUpResult> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid follow-up rating." };
  }

  const { rating, productName, regimenId, delayMinutes } = parsed.data;

  // Convert 1-5 emoji rating to a 0-10 mood-style value so it lines up
  // with the rest of the OutcomeLog series.
  // 1=terrible -> 1, 2=bad -> 3, 3=neutral -> 5, 4=good -> 7, 5=great -> 9
  const normalized = rating * 2 - 1;

  const noteParts = [
    "[post_dose_feeling]",
    `product=${productName}`,
    regimenId ? `regimenId=${regimenId}` : null,
    `emoji=${rating}`,
    delayMinutes ? `delay=${delayMinutes}m` : null,
  ].filter(Boolean);

  await prisma.outcomeLog.create({
    data: {
      patientId: patient.id,
      metric: "mood",
      value: normalized,
      note: noteParts.join(" "),
    },
  });

  revalidatePath("/portal/log-dose");
  revalidatePath("/portal/outcomes");
  revalidatePath("/portal/efficacy");
  revalidatePath("/portal/weekly-recap");

  return { ok: true };
}
