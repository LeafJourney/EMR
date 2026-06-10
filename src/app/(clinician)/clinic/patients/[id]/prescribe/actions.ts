"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  checkInteractions,
  inferCannabinoidsFromName,
} from "@/lib/domain/drug-interactions";
import { recommendNarcan } from "@/lib/domain/cures";
import { classifyDEASchedule } from "@/lib/domain/dea-schedule";
import { checkContraindications } from "@/lib/domain/contraindications";
import {
  assessHighRiskAttestation,
  ageFromDob,
  psychiatricComorbidityLabels,
} from "./high-risk-attestation";
import { dispatch } from "@/lib/orchestration/dispatch";
import { logger } from "@/lib/observability/log";

const schema = z.object({
  patientId: z.string(),
  productId: z.string().optional(),
  customProductName: z.string().max(200).optional(),
  productType: z.string().min(1),
  volumePerDose: z.coerce.number().positive(),
  volumeUnit: z.string().min(1),
  frequencyPerDay: z.coerce.number().int().min(1).max(12),
  daysSupply: z.coerce.number().int().min(1).max(365),
  quantity: z.coerce.number().positive(),
  refills: z.coerce.number().int().min(0).max(12),
  timingInstructions: z.string().max(500).optional(),
  // WS-C task 1: marks the v2 prescribe form so the server can require a
  // pharmacy routing target on that path without breaking legacy/batch callers.
  rxFormVersion: z.string().max(10).optional(),
  // WS-C task 2: cannabinoid hints from the "open to" picker — used to infer a
  // profile for custom/free-text products so interactions are still screened.
  openCannabinoids: z.string().optional(), // JSON array of cannabinoid names
  diagnosisCodes: z.string().optional(), // JSON-encoded array of {code, label}
  // EMR-1099 (M3): pharmacy routing target. The form requires a selection
  // before "Sign & send"; optional here so legacy callers keep working.
  pharmacyId: z.string().max(100).optional(),
  pharmacyName: z.string().max(200).optional(),
  noteToPatient: z.string().max(2000).optional(),
  noteToPharmacy: z.string().max(2000).optional(),
  interactionAcknowledged: z.string().optional(), // "true" if acknowledged
  // EMR-088: contraindication override fields
  contraindicationAcknowledged: z.string().optional(),
  contraindicationOverrideReason: z.string().max(2000).optional(),
  contraindicationIds: z.string().optional(), // JSON array of ids
  contraindicationCoSignerUserId: z.string().optional(),
  // EMR-781: CURES + Narcan attestation fields
  curesAcknowledged: z.string().optional(),
  curesQueriedAt: z.string().optional(),
  curesFlags: z.string().optional(), // JSON array of PdmpFlag
  curesMmePerDay: z.coerce.number().nonnegative().optional(),
  narcanCoPrescribe: z.string().optional(),
  narcanDeclineReason: z.string().max(2000).optional(),
  // WS-C task 3: clinician acknowledgment of a high-risk (non-controlled)
  // prescribing scenario — high-dose THC, age >= 65, psychiatric comorbidity.
  highRiskAttestationAcknowledged: z.string().optional(), // "true" if acknowledged
  highRiskReasons: z.string().optional(), // JSON array of HighRiskKind
});

export type PrescribeResult = { ok: true } | { ok: false; error: string };

export async function createPrescriptionAction(
  _prev: PrescribeResult | null,
  formData: FormData
): Promise<PrescribeResult> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    patientId: formData.get("patientId"),
    productId: formData.get("productId") || undefined,
    customProductName: formData.get("customProductName") || undefined,
    productType: formData.get("productType"),
    volumePerDose: formData.get("volumePerDose"),
    volumeUnit: formData.get("volumeUnit"),
    frequencyPerDay: formData.get("frequencyPerDay"),
    daysSupply: formData.get("daysSupply"),
    quantity: formData.get("quantity"),
    refills: formData.get("refills"),
    timingInstructions: formData.get("timingInstructions") || undefined,
    rxFormVersion: formData.get("rxFormVersion") || undefined,
    openCannabinoids: formData.get("openCannabinoids") || undefined,
    diagnosisCodes: formData.get("diagnosisCodes") || undefined,
    pharmacyId: formData.get("pharmacyId") || undefined,
    pharmacyName: formData.get("pharmacyName") || undefined,
    noteToPatient: formData.get("noteToPatient") || undefined,
    noteToPharmacy: formData.get("noteToPharmacy") || undefined,
    interactionAcknowledged: formData.get("interactionAcknowledged") || undefined,
    contraindicationAcknowledged:
      formData.get("contraindicationAcknowledged") || undefined,
    contraindicationOverrideReason:
      formData.get("contraindicationOverrideReason") || undefined,
    contraindicationIds: formData.get("contraindicationIds") || undefined,
    contraindicationCoSignerUserId:
      formData.get("contraindicationCoSignerUserId") || undefined,
    curesAcknowledged: formData.get("curesAcknowledged") || undefined,
    curesQueriedAt: formData.get("curesQueriedAt") || undefined,
    curesFlags: formData.get("curesFlags") || undefined,
    curesMmePerDay: formData.get("curesMmePerDay") || undefined,
    narcanCoPrescribe: formData.get("narcanCoPrescribe") || undefined,
    narcanDeclineReason: formData.get("narcanDeclineReason") || undefined,
    highRiskAttestationAcknowledged:
      formData.get("highRiskAttestationAcknowledged") || undefined,
    highRiskReasons: formData.get("highRiskReasons") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "Please fill all required fields with valid values." };
  }

  const {
    patientId,
    productId,
    customProductName,
    productType,
    volumePerDose,
    volumeUnit,
    frequencyPerDay,
    daysSupply,
    quantity,
    refills,
    timingInstructions,
    diagnosisCodes,
    pharmacyId,
    pharmacyName,
    noteToPatient,
    noteToPharmacy,
    interactionAcknowledged,
  } = parsed.data;

  // Must have either a product from formulary or a custom name
  if (!productId && !customProductName) {
    return { ok: false, error: "Please select a product or enter a custom medication name." };
  }

  // WS-C task 1: the v2 prescribe form collects a pharmacy routing target and
  // gates "Sign & send" on it client-side (EMR-1099/M3). Enforce that contract
  // server-side too — the client gate is a convenience, not the boundary. The
  // legacy v1 form and the batch flow (separate action, formulary bulk
  // authorization with no per-item routing) don't collect a pharmacy and are
  // intentionally exempt: they omit the `rxFormVersion=v2` marker.
  if (parsed.data.rxFormVersion === "v2" && !pharmacyId) {
    return {
      ok: false,
      error: "Select a pharmacy before signing & sending the prescription.",
    };
  }

  // Verify patient belongs to org
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // Load the product — required for formulary selections, resolved for custom entries
  let product = null;
  let resolvedProductId = productId;

  if (productId) {
    product = await prisma.cannabisProduct.findFirst({
      where: { id: productId, organizationId: user.organizationId!, active: true },
    });
    if (!product) return { ok: false, error: "Product not found or inactive." };
  } else if (customProductName) {
    // For custom/manual entries, create an ad-hoc product record so the FK is satisfied
    product = await prisma.cannabisProduct.create({
      data: {
        organizationId: user.organizationId!,
        name: customProductName,
        productType: (["oil", "tincture", "capsule", "flower", "vape_cartridge", "edible", "topical", "suppository", "spray", "other"].includes(productType ?? "") ? productType : "other") as any,
        route: "oral",
        concentrationUnit: "mg/unit",
        active: true,
      },
    });
    resolvedProductId = product.id;
  }

  // Parse the cannabinoid "open to" hints once — used to infer a profile for
  // custom/free-text products (WS-C task 2).
  let openCannabinoidsHint: string[] = [];
  if (parsed.data.openCannabinoids) {
    try {
      const raw = JSON.parse(parsed.data.openCannabinoids);
      const result = z.array(z.string()).safeParse(raw);
      openCannabinoidsHint = result.success ? result.data : [];
    } catch {
      openCannabinoidsHint = [];
    }
  }

  // Check for drug interactions server-side for BOTH formulary and custom
  // products. Formulary products read their structured cannabinoid profile;
  // custom/free-text products (no concentration data) get a best-effort profile
  // inferred from the name + hints so the screen still runs and red/yellow
  // interactions block until acknowledged regardless of product source.
  if (product) {
    const patientMeds = await prisma.patientMedication.findMany({
      where: { patientId, active: true },
    });

    if (patientMeds.length > 0) {
      let cannabinoids: string[];
      if (productId) {
        cannabinoids = [];
        if (product.thcConcentration && product.thcConcentration > 0) cannabinoids.push("THC");
        if (product.cbdConcentration && product.cbdConcentration > 0) cannabinoids.push("CBD");
        if (product.cbnConcentration && product.cbnConcentration > 0) cannabinoids.push("CBN");
        if (product.cbgConcentration && product.cbgConcentration > 0) cannabinoids.push("CBG");
      } else {
        cannabinoids = inferCannabinoidsFromName(
          customProductName ?? product.name,
          openCannabinoidsHint,
        );
      }

      const medNames = patientMeds.map((m) => m.name);
      const interactions = checkInteractions(medNames, cannabinoids);
      const hasWarnings = interactions.some((i) => i.severity === "red" || i.severity === "yellow");

      if (hasWarnings && interactionAcknowledged !== "true") {
        return {
          ok: false,
          error: "Drug interactions detected. You must acknowledge the interaction warnings before prescribing.",
        };
      }
    }
  }

  // EMR-781: Narcan safety check — if the prescribed medication or any
  // active patient medication is an opioid, the prescriber must record
  // a Narcan decision (co-prescribe or declined-with-reason).
  const candidateMedNameForNarcan =
    product?.name ?? customProductName ?? null;
  const narcanScopeNames: string[] = [];
  if (candidateMedNameForNarcan) narcanScopeNames.push(candidateMedNameForNarcan);
  const activePatientMeds = await prisma.patientMedication.findMany({
    where: { patientId, active: true },
    select: { name: true },
  });
  for (const m of activePatientMeds) narcanScopeNames.push(m.name);

  const narcanRec = recommendNarcan(narcanScopeNames);
  const narcanCoPrescribe = parsed.data.narcanCoPrescribe === "true";
  const narcanDeclineReason = parsed.data.narcanDeclineReason?.trim() ?? "";

  if (narcanRec.recommended) {
    if (!narcanCoPrescribe && narcanDeclineReason.length === 0) {
      return {
        ok: false,
        error:
          "Opioid detected. Document your Narcan (naloxone) decision before signing — either co-prescribe Narcan or provide a clinical reason for declining.",
      };
    }
    if (!narcanCoPrescribe && narcanDeclineReason.length < 10) {
      return {
        ok: false,
        error:
          "Narcan decline reason must be at least 10 characters describing the clinical rationale.",
      };
    }
  }

  // Auto-calculate mg per dose and per day
  let thcMgPerDose: number | null = null;
  let cbdMgPerDose: number | null = null;

  if (product) {
    if (product.concentrationUnit === "mg/mL" || product.concentrationUnit === "mg/unit") {
      thcMgPerDose = product.thcConcentration ? product.thcConcentration * volumePerDose : null;
      cbdMgPerDose = product.cbdConcentration ? product.cbdConcentration * volumePerDose : null;
    }
  }

  const thcMgPerDay = thcMgPerDose !== null ? thcMgPerDose * frequencyPerDay : null;
  const cbdMgPerDay = cbdMgPerDose !== null ? cbdMgPerDose * frequencyPerDay : null;

  // Parse diagnosis codes with validation
  const diagnosisSchema = z.array(z.object({ code: z.string(), label: z.string() }));
  let parsedDiagnoses: { code: string; label: string }[] = [];
  if (diagnosisCodes) {
    try {
      const raw = JSON.parse(diagnosisCodes);
      const result = diagnosisSchema.safeParse(raw);
      parsedDiagnoses = result.success ? result.data : [];
    } catch {
      parsedDiagnoses = [];
    }
  }

  // EMR-781: parse CURES snapshot fields for the structured notes
  let curesFlagsParsed: string[] = [];
  if (parsed.data.curesFlags) {
    try {
      const raw = JSON.parse(parsed.data.curesFlags);
      const result = z.array(z.string()).safeParse(raw);
      curesFlagsParsed = result.success ? result.data : [];
    } catch {
      curesFlagsParsed = [];
    }
  }

  const curesSummary = {
    acknowledged: parsed.data.curesAcknowledged === "true",
    queriedAt: parsed.data.curesQueriedAt ?? null,
    flags: curesFlagsParsed,
    mmePerDay: parsed.data.curesMmePerDay ?? null,
  };

  // ── WS-C task 3: high-risk attestation gate ──────────────────────────────
  // A documented acknowledgment is owed not only for DEA-controlled substances
  // but for high-risk non-controlled scenarios too. The risk is recomputed
  // server-side; the client gate is a convenience, never the enforcement point.
  const candidateRxName = product?.name ?? customProductName ?? "";
  const deaMatch = candidateRxName ? classifyDEASchedule(candidateRxName) : null;
  const isControlledRx = !!deaMatch;

  // Controlled substances: enforce the CURES/PDMP attestation server-side (the
  // v2 form gates it client-side — mirror that here so the API can't be driven
  // around the UI).
  if (isControlledRx && !curesSummary.acknowledged) {
    return {
      ok: false,
      error: "Controlled substance: complete the CURES/PDMP attestation before signing.",
    };
  }

  // Non-controlled high-risk scenarios (high-dose THC, age ≥ 65, documented
  // psychiatric comorbidity) require the clinical risk attestation. Controlled
  // substances are already covered by the CURES gate above.
  let highRiskSummary: { reasons: string[]; acknowledged: true } | null = null;
  if (!isControlledRx) {
    const chartSummary = await prisma.chartSummary.findUnique({
      where: { patientId },
      select: { summaryMd: true },
    });
    const contraindicationMatches = checkContraindications({
      dateOfBirth: patient.dateOfBirth,
      presentingConcerns: patient.presentingConcerns,
      intakeAnswers: patient.intakeAnswers,
      medicationNames: activePatientMeds.map((m) => m.name),
      historyText: chartSummary?.summaryMd ?? null,
    });
    const highRiskReasons = assessHighRiskAttestation({
      thcMgPerDay,
      patientAge: ageFromDob(patient.dateOfBirth),
      psychiatricComorbidities: psychiatricComorbidityLabels(
        contraindicationMatches.map((m) => ({
          id: m.contraindication.id,
          label: m.contraindication.label,
        })),
      ),
    });
    if (highRiskReasons.length > 0) {
      if (parsed.data.highRiskAttestationAcknowledged !== "true") {
        return {
          ok: false,
          error:
            "High-risk prescription (" +
            highRiskReasons.map((r) => r.label).join(", ") +
            "). Acknowledge the clinical risk attestation before signing.",
        };
      }
      highRiskSummary = {
        reasons: highRiskReasons.map((r) => r.kind),
        acknowledged: true,
      };
    }
  }

  const narcanSummary = narcanRec.recommended
    ? {
        recommended: true,
        opioids: narcanRec.opioids,
        decision: narcanCoPrescribe ? ("co_prescribe" as const) : ("declined" as const),
        declineReason: narcanCoPrescribe ? null : narcanDeclineReason,
      }
    : { recommended: false as const };

  // Build structured clinician notes with metadata
  const structuredNotes = JSON.stringify({
    noteToPharmacy: noteToPharmacy || null,
    diagnosisCodes: parsedDiagnoses,
    daysSupply,
    quantity,
    refills,
    productType,
    customProductName: customProductName || null,
    interactionAcknowledged: interactionAcknowledged === "true",
    cures: curesSummary,
    narcan: narcanSummary,
    highRisk: highRiskSummary,
  });

  // Auto-generate patient instructions if not provided
  const productName = product ? product.name : customProductName || "medication";
  const autoInstructions =
    noteToPatient ||
    generateInstructions(
      productName,
      volumePerDose,
      volumeUnit,
      frequencyPerDay,
      thcMgPerDose,
      cbdMgPerDose,
      timingInstructions
    );

  // EMR-088: persist contraindication override if present
  let contraindicationOverride: any = undefined;
  if (parsed.data.contraindicationAcknowledged === "true") {
    const reason = parsed.data.contraindicationOverrideReason?.trim() ?? "";
    if (reason.length < 20) {
      return {
        ok: false,
        error:
          "Contraindication override requires at least 20 characters of clinical reasoning.",
      };
    }
    let ids: string[] = [];
    try {
      const raw = JSON.parse(parsed.data.contraindicationIds ?? "[]");
      const result = z.array(z.string()).safeParse(raw);
      ids = result.success ? result.data : [];
    } catch {
      ids = [];
    }
    // Optional dual sign-off: validate the co-signer is a real provider in
    // the same org and is not the prescriber themselves. We only attach the
    // co-signer when both checks pass — silently dropping an invalid id is
    // fine because dual sign-off is optional.
    let coSigner: { userId: string; cosignedAt: string } | null = null;
    const coSignerId = parsed.data.contraindicationCoSignerUserId?.trim();
    if (coSignerId && coSignerId !== user.id) {
      const cosigner = await prisma.user.findFirst({
        where: {
          id: coSignerId,
          memberships: {
            some: {
              organizationId: user.organizationId!,
              role: "clinician",
            },
          },
        },
        select: { id: true },
      });
      if (cosigner) {
        coSigner = { userId: cosigner.id, cosignedAt: new Date().toISOString() };
      }
    }
    contraindicationOverride = {
      contraindicationIds: ids,
      reason,
      overriddenByUserId: user.id,
      overriddenAt: new Date().toISOString(),
      ...(coSigner ? { coSigner } : {}),
    };
  }

  try {
    const regimen = await prisma.dosingRegimen.create({
      data: {
        patientId,
        productId: resolvedProductId!,
        prescribedById: user.id,
        volumePerDose,
        volumeUnit,
        frequencyPerDay,
        timingInstructions: timingInstructions || null,
        calculatedThcMgPerDose: thcMgPerDose,
        calculatedCbdMgPerDose: cbdMgPerDose,
        calculatedThcMgPerDay: thcMgPerDay,
        calculatedCbdMgPerDay: cbdMgPerDay,
        patientInstructions: autoInstructions,
        clinicianNotes: structuredNotes,
        active: true,
        contraindicationOverride,
        // EMR-1099 (M3): persist the routing target instead of silently
        // dropping the hidden pharmacyId/pharmacyName inputs.
        pharmacyId: pharmacyId || null,
        pharmacyName: pharmacyName || null,
      },
    });

    // Audit log the override if present — clinical safety requires this
    if (contraindicationOverride) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorUserId: user.id,
          action: "cannabis.contraindication.override",
          subjectType: "DosingRegimen",
          subjectId: regimen.id,
          metadata: contraindicationOverride,
        },
      });
    }

    // EMR-781: audit the Narcan decision whenever an opioid was in scope.
    if (narcanRec.recommended) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorUserId: user.id,
          action: narcanCoPrescribe
            ? "prescribing.narcan.co_prescribed"
            : "prescribing.narcan.declined",
          subjectType: "DosingRegimen",
          subjectId: regimen.id,
          metadata: {
            opioids: narcanRec.opioids,
            rationale: narcanRec.rationale,
            ...(narcanCoPrescribe
              ? {}
              : { declineReason: narcanDeclineReason }),
          },
        },
      });
    }

    // EMR-781: audit the CURES review whenever the snapshot was acknowledged.
    if (curesSummary.acknowledged) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorUserId: user.id,
          action: "prescribing.cures.reviewed",
          subjectType: "DosingRegimen",
          subjectId: regimen.id,
          metadata: {
            queriedAt: curesSummary.queriedAt,
            flags: curesSummary.flags,
            mmePerDay: curesSummary.mmePerDay,
          },
        },
      });
    }

    // WS-C task 3: audit the high-risk attestation whenever it was required
    // and acknowledged — the clinician's documented acknowledgment of a
    // high-dose THC / elderly / psychiatric-comorbidity prescription.
    if (highRiskSummary) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorUserId: user.id,
          action: "prescribing.high_risk.attested",
          subjectType: "DosingRegimen",
          subjectId: regimen.id,
          metadata: { reasons: highRiskSummary.reasons },
        },
      });
    }

    // Hand the regimen off to the prescription-safety agent. It runs
    // a cold-temperature interaction + contraindication scan in the
    // background and posts ClinicalObservations into the Command
    // Center's Discovery tile when it finds something.
    await dispatch({
      name: "dosing.regimen.created",
      regimenId: regimen.id,
      patientId,
      productId: resolvedProductId!,
      organizationId: user.organizationId!,
      prescribedById: user.id,
    });
  } catch (err) {
    logger.error({ event: "clinic.prescribe.regimen_create_failed", err });
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Failed to save prescription: ${err.message}`
          : "Failed to save prescription. Please try again.",
    };
  }

  revalidatePath(`/clinic/patients/${patientId}`);
  redirect(`/clinic/patients/${patientId}?tab=rx`);
}

/**
 * EMR-169: Sign and send a prescription electronically.
 * Marks the dosing regimen as signed and records the e-signature.
 */
export async function signPrescription(regimenId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const regimen = await prisma.dosingRegimen.findFirst({
    where: { id: regimenId },
    include: { patient: true },
  });

  if (!regimen || regimen.patient.organizationId !== user.organizationId) {
    return { ok: false, error: "Prescription not found." };
  }

  await prisma.dosingRegimen.update({
    where: { id: regimenId },
    data: {
      clinicianNotes: `${regimen.clinicianNotes ?? ""}\n[E-SIGNED by ${user.firstName ?? ""} ${user.lastName ?? ""} at ${new Date().toISOString()}]`.trim(),
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "prescription.signed",
      subjectType: "DosingRegimen",
      subjectId: regimenId,
      metadata: {
        patientId: regimen.patientId,
        signedAt: new Date().toISOString(),
      },
    },
  });

  revalidatePath(`/clinic/patients/${regimen.patientId}`);
  return { ok: true };
}

function generateInstructions(
  productName: string,
  volume: number,
  unit: string,
  frequency: number,
  thcMg: number | null,
  cbdMg: number | null,
  timing: string | undefined
): string {
  const freqText =
    frequency === 1
      ? "once daily"
      : frequency === 2
        ? "twice daily"
        : `${frequency} times daily`;
  const mgParts: string[] = [];
  if (thcMg !== null && thcMg > 0) mgParts.push(`${thcMg.toFixed(1)} mg THC`);
  if (cbdMg !== null && cbdMg > 0) mgParts.push(`${cbdMg.toFixed(1)} mg CBD`);
  const mgText = mgParts.length > 0 ? ` (${mgParts.join(" + ")} per dose)` : "";
  const timingText = timing ? `. ${timing}` : "";

  return `Take ${volume} ${unit} of ${productName} ${freqText}${mgText}${timingText}.`;
}
