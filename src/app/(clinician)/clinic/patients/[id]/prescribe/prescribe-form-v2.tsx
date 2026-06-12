"use client";

/**
 * Prescribe form — v2 (EMR-883..893)
 *
 * Dr. Patel's redesign: one fixed, minimal-scroll window. Medication search on
 * the LEFT, dosing & directions + notes on the RIGHT, pharmacy + safety inline.
 * The medication/sig/quantity review moves out into a "Prescription Preview"
 * modal that opens once the core fields are filled.
 *
 * This component fully preserves the `createPrescriptionAction` submit contract
 * (see ./actions.ts) — every field name/type it reads is emitted here, either
 * as a controlled input or a hidden mirror.
 *
 * The original ./prescribe-form.tsx is intentionally left in place (unreferenced)
 * as a fallback while this redesign beds in.
 */

import { useFormState, useFormStatus } from "react-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { createPrescriptionAction, type PrescribeResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  AckDismissControls,
  useChartLedger,
  type ResolveAction,
} from "../chart-kit";
import {
  searchMedications,
  type MedSearchEntry,
  type MedClass,
} from "@/lib/clinical/medication-search";
import {
  searchPharmacies,
  type PharmacyEntry,
} from "@/lib/clinical/pharmacy-directory";
import { ADMINISTRATION_METHODS } from "@/lib/clinical/methods-of-administration";
import type { ModuleFlags } from "@/lib/clinical/module-opt-in";
import {
  checkInteractions,
  inferCannabinoidsFromName,
  type DrugInteraction,
} from "@/lib/domain/drug-interactions";
import {
  classifyDEASchedule,
  DEA_SCHEDULE_LABEL,
  DEA_SCHEDULE_TONE,
} from "@/lib/domain/dea-schedule";
import {
  assessHighRiskAttestation,
  psychiatricComorbidityLabels,
} from "./high-risk-attestation";
import type {
  GuardrailFinding,
  RxSafetyEvaluation,
} from "@/lib/clinical/rx-safety/types";
import {
  RxGuardrailCard,
  type GuardrailAdjustment,
} from "./rx-guardrail-card";
import { evaluateDraftRxAction, acceptRxSafetyRecommendationAction } from "./rx-safety-actions";

/* ── Types ──────────────────────────────────────────────────── */

interface Product {
  id: string;
  name: string;
  brand: string | null;
  productType: string;
  route: string;
  thcConcentration: number | null;
  cbdConcentration: number | null;
  cbnConcentration: number | null;
  cbgConcentration: number | null;
  thcCbdRatio: string | null;
  concentrationUnit: string;
}

interface Medication {
  id: string;
  name: string;
  genericName: string | null;
  dosage: string | null;
  active: boolean;
}

interface ContraindicationMatch {
  id: string;
  label: string;
  severity: "absolute" | "relative" | "caution";
  rationale: string;
  requiresOverride: boolean;
  matchedOn: string;
}

interface CoSignerOption {
  id: string;
  label: string;
}

// EMR-1098 (M2) — initial values mapped from a saved CannabisRecommendation
// (built server-side in ./page.tsx#buildRecommendationPrefill). `summary` is
// the raw recommendation text shown in the "Pre-filled" note.
export interface RecommendationPrefill {
  id: string;
  createdAt: string; // ISO
  productType: string;
  dose: string | null;
  unit: string | null;
  frequencyPerDay: number | null;
  timingInstructions: string | null;
  summary: {
    productType: string;
    cannabinoidRatio: string;
    startingDoseMg: string;
    deliveryMethod: string;
    frequency: string;
  };
}

// EMR-1099 (M4) — ICD-10 option for the diagnosis picker. `fromChart` marks
// codes pulled from the patient's documented problem list.
export interface DiagnosisOption {
  code: string;
  label: string;
  fromChart: boolean;
}

export interface PrescribeFormV2Props {
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  patientPhotoUrl: string | null;
  patientState?: string;
  /** Patient age in years (WS-C task 3 — gates the high-risk attestation for
   *  older adults). Null when DOB is unknown. */
  patientAge?: number | null;
  providerName: string;
  deaNumber: string;
  moduleFlags: ModuleFlags;
  heading: string;
  products: Product[];
  medications: Medication[];
  contraindicationMatches?: ContraindicationMatch[];
  eligibleCoSigners?: CoSignerOption[];
  recommendationPrefill?: RecommendationPrefill | null;
  diagnosisOptions?: DiagnosisOption[];
}

/* ── Constants ──────────────────────────────────────────────── */

// EMR-887 — dose dropdown + unit dropdown, each with a free-text fallback.
const DOSE_PRESETS = ["0.25", "0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0"];
const UNIT_PRESETS = [
  "mg", "mcg", "g", "mL", "L", "gtt", "tablets", "capsules",
  "suppositories", "%", "tube", "cartridge", "application",
];
// Times-per-day presets map a label to a frequency-per-day integer that the
// server action expects (frequencyPerDay 1..12). "Every N hours" → 24/N.
const FREQUENCY_PRESETS: Array<{ label: string; perDay: number }> = [
  { label: "Every 2 hours", perDay: 12 },
  { label: "Every 4 hours", perDay: 6 },
  { label: "Every 6 hours", perDay: 4 },
  { label: "Every 8 hours", perDay: 3 },
  { label: "Every 12 hours", perDay: 2 },
  { label: "1x per day", perDay: 1 },
  { label: "2x per day", perDay: 2 },
  { label: "3x per day", perDay: 3 },
  { label: "4x per day", perDay: 4 },
  { label: "6x per day", perDay: 6 },
  { label: "As needed (PRN)", perDay: 1 },
];
const DAYS_SUPPLY_PRESETS = ["30", "60", "90"];

// EMR-1098 (M2) — flat list of the Type dropdown's preset values, used to
// decide whether a recommendation prefill lands in preset or free-text mode.
const TYPE_PRESET_VALUES = ADMINISTRATION_METHODS.flatMap((m) => m.examples);

const FREE_TEXT = "__free__";

const SELECT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 " +
  "disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";

const TEXT_INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "placeholder:text-text-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const FIELD_LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";

const MED_CLASS_TONE: Record<MedClass, "neutral" | "highlight" | "success" | "info" | "warning"> = {
  pharmaceutical: "info",
  cannabis: "success",
  nutraceutical: "highlight",
  otc: "neutral",
  psilocybin: "warning",
};

/* ── Submit button ──────────────────────────────────────────── */

function SubmitButton({
  disabled,
  alert,
}: {
  disabled?: boolean;
  /** EMR-1135 — the order button changes color while a guardrail
   *  modification recommendation is pending (Phase 6, status tokens). */
  alert?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      variant={alert ? "secondary" : "primary"}
      className={cn(
        "rounded-xl h-12 px-8 font-semibold",
        alert &&
          "bg-status-alert-bg text-status-alert-fg border-[color:var(--status-alert-fg)]/30 " +
            "hover:bg-status-alert-bg hover:text-status-alert-fg hover:border-[color:var(--status-alert-fg)]/50",
      )}
      disabled={pending || disabled}
    >
      {pending ? "Signing & sending..." : "Sign & send ℞"}
    </Button>
  );
}

/* ── Main form ──────────────────────────────────────────────── */

export function PrescribeFormV2(props: PrescribeFormV2Props) {
  const {
    patientId,
    patientFirstName,
    patientLastName,
    patientEmail,
    patientPhone,
    patientPhotoUrl,
    patientState,
    patientAge = null,
    providerName,
    deaNumber,
    moduleFlags,
    heading,
    products,
    medications,
    contraindicationMatches = [],
    eligibleCoSigners = [],
    recommendationPrefill: prefill = null,
    diagnosisOptions = [],
  } = props;

  // EMR-1098 (M2) — resolve which frequency preset (if any) a prefilled
  // doses-per-day count maps to; otherwise the field opens in free-text mode.
  const prefillFreqLabel =
    prefill?.frequencyPerDay != null
      ? (FREQUENCY_PRESETS.find(
          (f) => f.perDay === prefill.frequencyPerDay && f.label.endsWith("per day"),
        )?.label ?? null)
      : null;

  const patientName = `${patientFirstName} ${patientLastName}`.trim();
  const ledger = useChartLedger(patientId);

  const [state, formAction] = useFormState<PrescribeResult | null, FormData>(
    createPrescriptionAction,
    null,
  );

  /* ── Medication ───────────────────────────────────────────── */
  // medSelection mirrors what we submit: either a formulary productId or a
  // free-text customProductName. The typeahead drives both.
  const [medQuery, setMedQuery] = useState("");
  const [medOpen, setMedOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customProductName, setCustomProductName] = useState("");
  const medBoxRef = useRef<HTMLDivElement>(null);

  // EMR-885 — psilocybin only appears in results when the module is opted in.
  const enabledClasses = useMemo<MedClass[]>(() => {
    const base: MedClass[] = ["pharmaceutical", "cannabis", "nutraceutical", "otc"];
    if (moduleFlags.psilocybin) base.push("psilocybin");
    return base;
  }, [moduleFlags.psilocybin]);

  const medResults = useMemo(
    () => searchMedications(medQuery, { classes: enabledClasses, limit: 8 }),
    [medQuery, enabledClasses],
  );

  // Formulary products matching the same query (so the org's own catalog also
  // surfaces in the dropdown alongside the directory).
  const formularyResults = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 4);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)),
      )
      .slice(0, 4);
  }, [medQuery, products]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (medBoxRef.current && !medBoxRef.current.contains(e.target as Node)) {
        setMedOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pickDirectoryEntry(entry: MedSearchEntry) {
    setSelectedProductId("");
    const strength = entry.strengths[0] ? ` ${entry.strengths[0]}` : "";
    setCustomProductName(`${entry.name}${strength}`.trim());
    setMedQuery(`${entry.name}${strength}`.trim());
    setMedOpen(false);
    if (entry.defaultSig) setTimingInstructions(entry.defaultSig);
  }

  function pickFormularyProduct(p: Product) {
    setSelectedProductId(p.id);
    setCustomProductName("");
    setMedQuery(p.name);
    setMedOpen(false);
  }

  const medicationName = selectedProduct
    ? selectedProduct.name
    : customProductName.trim() || "Not selected";
  const hasMedication = !!selectedProductId || customProductName.trim().length > 0;

  // EMR-885 — Type field: MoA options + free text.
  // EMR-1098 (M2) — initial values come from the saved recommendation when
  // the page was opened via "Apply to prescription" (?rec=…).
  const [productType, setProductType] = useState(prefill?.productType ?? "");
  const [productTypeMode, setProductTypeMode] = useState<"preset" | "free">(
    prefill?.productType && !TYPE_PRESET_VALUES.includes(prefill.productType)
      ? "free"
      : "preset",
  );

  /* ── Dosing (EMR-887) ─────────────────────────────────────── */
  const [doseValue, setDoseValue] = useState(prefill?.dose ?? "0.5");
  const [doseMode, setDoseMode] = useState<"preset" | "free">(
    prefill?.dose && !DOSE_PRESETS.includes(prefill.dose) ? "free" : "preset",
  );
  const [unitValue, setUnitValue] = useState(prefill?.unit ?? "mg");
  const [unitMode, setUnitMode] = useState<"preset" | "free">(
    prefill?.unit && !UNIT_PRESETS.includes(prefill.unit) ? "free" : "preset",
  );
  const [freqLabel, setFreqLabel] = useState(prefillFreqLabel ?? "1x per day");
  const [freqMode, setFreqMode] = useState<"preset" | "free">(
    prefill?.frequencyPerDay != null && !prefillFreqLabel ? "free" : "preset",
  );
  const [freqFreeText, setFreqFreeText] = useState(
    prefill?.frequencyPerDay != null && !prefillFreqLabel
      ? String(prefill.frequencyPerDay)
      : "",
  );
  const [daysSupply, setDaysSupply] = useState("30");
  const [daysMode, setDaysMode] = useState<"preset" | "free">("preset");
  const [quantity, setQuantity] = useState("");
  const [quantityManual, setQuantityManual] = useState(false);
  const [refills, setRefills] = useState("0");
  const [timingInstructions, setTimingInstructions] = useState(
    prefill?.timingInstructions ?? "",
  );

  // Resolve frequency-per-day integer for the server action.
  const frequencyPerDay = useMemo(() => {
    if (freqMode === "free") {
      const n = parseInt(freqFreeText, 10);
      return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1;
    }
    return FREQUENCY_PRESETS.find((f) => f.label === freqLabel)?.perDay ?? 1;
  }, [freqMode, freqFreeText, freqLabel]);

  // Auto-calc quantity = dose × freq × days, unless manually overridden.
  useEffect(() => {
    if (quantityManual) return;
    const dose = parseFloat(doseValue);
    const days = parseInt(daysSupply, 10);
    if (Number.isFinite(dose) && dose > 0 && Number.isFinite(days) && days > 0) {
      const calc = dose * frequencyPerDay * days;
      setQuantity(calc.toFixed(2).replace(/\.?0+$/, ""));
    }
  }, [doseValue, frequencyPerDay, daysSupply, quantityManual]);

  /* ── Notes (EMR-891) ──────────────────────────────────────── */
  const [noteToPatient, setNoteToPatient] = useState("");
  const [noteToPharmacy, setNoteToPharmacy] = useState("");

  /* ── Cannabinoids open to (EMR-886, pushed lower/secondary) ── */
  const [openCannabinoids, setOpenCannabinoids] = useState<string[]>(["THC", "CBD"]);
  const CANNABINOIDS = ["THC", "CBD", "CBDA", "CBG", "THCV", "CBDV", "CBC", "CBN", "CBGA"];

  /* ── Diagnosis codes (EMR-1099 M4) ────────────────────────── */
  // Same toggle-chip pattern as the referral form's diagnosis picker.
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<
    { code: string; label: string }[]
  >([]);

  function toggleDiagnosis(diag: { code: string; label: string }) {
    setSelectedDiagnoses((prev) =>
      prev.some((d) => d.code === diag.code)
        ? prev.filter((d) => d.code !== diag.code)
        : [...prev, diag],
    );
  }

  /* ── Pharmacy (EMR-892) ───────────────────────────────────── */
  const [pharmacy, setPharmacy] = useState<PharmacyEntry | null>(null);
  const [pharmacyOpen, setPharmacyOpen] = useState(false);

  /* ── Contraindications (EMR-088 preserved) ────────────────── */
  const blockingContraindications = contraindicationMatches.filter(
    (m) => m.requiresOverride,
  );
  const hasBlockingContraindication = blockingContraindications.length > 0;
  const hasAbsoluteContraindication = contraindicationMatches.some(
    (m) => m.severity === "absolute",
  );
  const [contraindicationOverrideReason, setContraindicationOverrideReason] = useState("");
  const [contraindicationAcknowledged, setContraindicationAcknowledged] = useState(false);
  const [contraindicationCoSignerUserId, setContraindicationCoSignerUserId] = useState("");

  /* ── Controlled / DEA (EMR-350, EMR-893) ──────────────────── */
  const controlledMatch = useMemo(() => {
    const name = selectedProduct?.name ?? customProductName;
    return name ? classifyDEASchedule(name) : null;
  }, [selectedProduct, customProductName]);
  const isControlled = !!controlledMatch;

  /* ── Interactions / Safety check (EMR-888) ────────────────── */
  const cannabinoidsForCheck = useMemo(() => {
    if (selectedProduct) {
      const c: string[] = [];
      if ((selectedProduct.thcConcentration ?? 0) > 0) c.push("THC");
      if ((selectedProduct.cbdConcentration ?? 0) > 0) c.push("CBD");
      if ((selectedProduct.cbnConcentration ?? 0) > 0) c.push("CBN");
      if ((selectedProduct.cbgConcentration ?? 0) > 0) c.push("CBG");
      return c;
    }
    // WS-C task 2: custom/free-text products have no structured profile —
    // infer a best-effort one from the name + "open to" hints so the same
    // interaction screen (and acknowledgment gate) runs as for formulary
    // products. Mirrors the server in createPrescriptionAction.
    if (customProductName.trim()) {
      return inferCannabinoidsFromName(customProductName, openCannabinoids);
    }
    return [];
  }, [selectedProduct, customProductName, openCannabinoids]);

  const interactions = useMemo<DrugInteraction[]>(() => {
    if (cannabinoidsForCheck.length === 0 || medications.length === 0) return [];
    return checkInteractions(
      medications.map((m) => m.name),
      cannabinoidsForCheck,
    );
  }, [cannabinoidsForCheck, medications]);

  // Per-box resolution state (EMR-888). Keyed by a stable signature.
  type Resolution = { action: ResolveAction; justification?: string; at: string };
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});

  const safetyBoxes = useMemo(() => {
    const boxes: Array<{
      key: string;
      tier: "green" | "yellow" | "red";
      title: string;
      detail: string;
    }> = [];
    if (cannabinoidsForCheck.length > 0 && medications.length > 0 && interactions.length === 0) {
      boxes.push({
        key: "ok",
        tier: "green",
        title: "No interactions found",
        detail: `Checked against ${medications.length} medication${medications.length !== 1 ? "s" : ""} on file.`,
      });
    }
    for (const i of interactions) {
      boxes.push({
        key: `${i.drug}__${i.cannabinoid}`,
        tier: i.severity === "red" ? "red" : i.severity === "yellow" ? "yellow" : "green",
        title: `${i.drug} + ${i.cannabinoid}`,
        detail: i.recommendation,
      });
    }
    return boxes;
  }, [cannabinoidsForCheck.length, medications.length, interactions]);

  const visibleSafetyBoxes = safetyBoxes.filter((b) => !resolved[b.key]);

  function resolveBox(box: { key: string; tier: string; title: string }, action: ResolveAction, justification?: string) {
    const at = new Date().toISOString();
    setResolved((prev) => ({ ...prev, [box.key]: { action, justification, at } }));
    ledger.record({
      kind: action === "acknowledge" ? "acknowledge" : "dismiss",
      source: "Safety check",
      subject: box.title,
      justification,
    });
  }

  function dismissAllSafety() {
    const next: Record<string, Resolution> = { ...resolved };
    for (const b of visibleSafetyBoxes) {
      if (b.tier === "red") continue; // red requires individual justification
      next[b.key] = { action: "dismiss", at: new Date().toISOString() };
      ledger.record({ kind: "dismiss", source: "Safety check", subject: b.title });
    }
    setResolved(next);
  }

  // Red interaction boxes still gate the submit until resolved.
  const unresolvedRed = visibleSafetyBoxes.some((b) => b.tier === "red");
  const interactionAcknowledged =
    interactions.some((i) => i.severity === "red" || i.severity === "yellow") &&
    !visibleSafetyBoxes.some((b) => b.tier === "red" || b.tier === "yellow");

  /* ── Ambient Optimization Canvas (EMR-1131/EMR-1135) ──────────
     Guardrail engine evaluation of the drafted order against the patient's
     multi-omic profile (PGx / organ clearance / botanical). Runs debounced
     ~400ms after the drug name or dose configuration settles; findings render
     as the inline card beside the medication fields — never a pop-up. */
  const draftDrugName = selectedProduct
    ? selectedProduct.name
    : customProductName.trim();

  // Structured total daily dose in mg, when the form can compute it.
  const draftDailyDoseMg = useMemo(() => {
    const dose = parseFloat(doseValue);
    if (!Number.isFinite(dose) || dose <= 0) return undefined;
    if (unitValue.trim().toLowerCase() !== "mg") return undefined;
    return dose * frequencyPerDay;
  }, [doseValue, unitValue, frequencyPerDay]);

  const draftFrequency = freqMode === "free" ? freqFreeText.trim() : freqLabel;

  const [rxSafety, setRxSafety] = useState<RxSafetyEvaluation | null>(null);
  const [rxSafetyEvaluating, setRxSafetyEvaluating] = useState(false);
  const [rxSafetyAccepting, setRxSafetyAccepting] = useState(false);
  // Monotonic sequence guards against out-of-order responses.
  const rxSafetySeq = useRef(0);

  useEffect(() => {
    if (!draftDrugName || draftDrugName.length < 3) {
      rxSafetySeq.current += 1;
      setRxSafety(null);
      setRxSafetyEvaluating(false);
      return;
    }
    const seq = ++rxSafetySeq.current;
    setRxSafetyEvaluating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await evaluateDraftRxAction(patientId, {
          drugName: draftDrugName,
          dose: `${doseValue} ${unitValue}`.trim(),
          route: productType.trim() || undefined,
          frequency: draftFrequency || undefined,
          dailyDoseMg: draftDailyDoseMg,
        });
        if (seq !== rxSafetySeq.current) return;
        setRxSafety(res.ok ? res.evaluation : null);
      } catch {
        if (seq === rxSafetySeq.current) setRxSafety(null);
      } finally {
        if (seq === rxSafetySeq.current) setRxSafetyEvaluating(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    patientId,
    draftDrugName,
    doseValue,
    unitValue,
    productType,
    draftFrequency,
    draftDailyDoseMg,
  ]);

  const rxSafetyBlocking = rxSafety?.hasBlockingFinding ?? false;
  // Hard stops disable signing entirely until the conflict is resolved
  // (swap accepted or medication changed → re-evaluation clears the card).
  const rxSafetyHardStop =
    rxSafety?.findings.some((f) => f.kind === "hard_stop") ?? false;

  const rxAdjustmentContext = useMemo(
    () => ({ doseValue, unitValue, frequencyPerDay }),
    [doseValue, unitValue, frequencyPerDay],
  );

  // One-click accept — applies the suggested swap/dose adjustment into the
  // DRAFT fields only (provider still signs), records the acceptance in the
  // chart ledger + server AuditLog, and lets the debounced effect re-run the
  // evaluation so the card clears itself.
  function handleGuardrailAccept(
    finding: GuardrailFinding,
    adjustment: GuardrailAdjustment,
  ) {
    const before = {
      drugName: draftDrugName,
      dose: `${doseValue} ${unitValue}`.trim(),
    };
    let after = before;
    if (adjustment.type === "swap") {
      setSelectedProductId("");
      setCustomProductName(adjustment.drugName);
      setMedQuery(adjustment.drugName);
      after = { ...before, drugName: adjustment.drugName };
    } else {
      setDoseMode("free");
      setDoseValue(adjustment.dose);
      if (adjustment.unit && adjustment.unit !== unitValue) {
        setUnitMode("preset");
        setUnitValue(adjustment.unit);
      }
      setQuantityManual(false); // let quantity re-derive from the new dose
      after = {
        ...before,
        dose: `${adjustment.dose} ${adjustment.unit || unitValue}`.trim(),
      };
    }

    ledger.record({
      kind: "acknowledge",
      source: "Rx guardrail",
      subject: `${finding.ruleId} — ${adjustment.label}`,
      justification: finding.recommendation,
    });

    setRxSafetyAccepting(true);
    void acceptRxSafetyRecommendationAction(patientId, {
      ruleId: finding.ruleId,
      kind: finding.kind,
      layer: finding.layer,
      recommendation: finding.recommendation,
      adjustmentLabel: adjustment.label,
      before,
      after,
      requiredFollowUp: finding.requiredFollowUp ?? [],
    }).finally(() => setRxSafetyAccepting(false));
  }

  /* ── CURES attestation (EMR-889) ──────────────────────────── */
  const CURES_ATTESTATIONS = [
    "Queried the CURES/PDMP database for this patient.",
    "Discussed potential drug-drug interactions.",
    "Advised against driving or operating heavy machinery.",
    "Discussed side effects, risks, and benefits.",
    "Discussed the importance of weaning off when appropriate.",
    "Confirmed the patient comprehended the above.",
  ];
  const [curesChecked, setCuresChecked] = useState<boolean[]>(
    () => CURES_ATTESTATIONS.map(() => false),
  );
  function toggleCures(idx: number) {
    setCuresChecked((prev) => {
      const next = [...prev];
      const nowChecked = !next[idx];
      next[idx] = nowChecked;
      // EMR-889 — each attestation click records a digital attestation note.
      if (nowChecked) {
        ledger.record({
          kind: "note",
          source: "CURES attestation",
          subject: CURES_ATTESTATIONS[idx],
          justification: "Digital attestation recorded",
        });
      }
      return next;
    });
  }
  const curesAcknowledged = isControlled ? curesChecked.every(Boolean) : true;

  /* ── High-risk attestation (WS-C task 3) ──────────────────────
     A documented acknowledgment is owed for high-risk NON-controlled Rx too
     (high-dose THC, age ≥ 65, psychiatric comorbidity). Controlled substances
     are already covered by the CURES attestation above, so we only surface
     this gate when the Rx is not controlled. Mirrors the server gate in
     createPrescriptionAction; the server re-validates the acknowledgment. */
  const thcMgPerDayForRisk = useMemo(() => {
    if (!selectedProduct) return null;
    if (
      selectedProduct.concentrationUnit !== "mg/mL" &&
      selectedProduct.concentrationUnit !== "mg/unit"
    )
      return null;
    const conc = selectedProduct.thcConcentration ?? 0;
    const dose = parseFloat(doseValue);
    if (conc <= 0 || !(dose > 0)) return null;
    return conc * dose * frequencyPerDay;
  }, [selectedProduct, doseValue, frequencyPerDay]);

  const psychiatricLabels = useMemo(
    () =>
      psychiatricComorbidityLabels(
        contraindicationMatches.map((m) => ({ id: m.id, label: m.label })),
      ),
    [contraindicationMatches],
  );

  const highRiskReasons = useMemo(
    () =>
      isControlled
        ? []
        : assessHighRiskAttestation({
            thcMgPerDay: thcMgPerDayForRisk,
            patientAge,
            psychiatricComorbidities: psychiatricLabels,
          }),
    [isControlled, thcMgPerDayForRisk, patientAge, psychiatricLabels],
  );
  const highRiskAttestationRequired = highRiskReasons.length > 0;
  const [highRiskAcknowledged, setHighRiskAcknowledged] = useState(false);

  /* ── Submit gating ────────────────────────────────────────── */
  const mustAckContraindication =
    hasBlockingContraindication &&
    (!contraindicationAcknowledged || contraindicationOverrideReason.trim().length < 20);

  const coreFilled =
    hasMedication &&
    productType.trim().length > 0 &&
    parseFloat(doseValue) > 0 &&
    unitValue.trim().length > 0 &&
    parseInt(daysSupply, 10) > 0 &&
    parseFloat(quantity) > 0;

  // EMR-1099 (M3): an Rx can't be signed without a routing target — the
  // pharmacy selection now gates Sign & send.
  const blocked =
    !coreFilled ||
    !pharmacy ||
    unresolvedRed ||
    mustAckContraindication ||
    // EMR-1135: hard-stop guardrail findings disable signing until resolved.
    rxSafetyHardStop ||
    (isControlled && !curesAcknowledged) ||
    (highRiskAttestationRequired && !highRiskAcknowledged);

  /* ── Preview modal (EMR-893) ──────────────────────────────── */
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewReady =
    hasMedication &&
    parseFloat(doseValue) > 0 &&
    parseInt(daysSupply, 10) > 0 &&
    !!pharmacy;

  const sigSummary = `${doseValue} ${unitValue} ${
    freqMode === "free" ? freqFreeText || "as directed" : freqLabel
  }${timingInstructions ? ` — ${timingInstructions}` : ""}`;

  return (
    <form action={formAction} className="space-y-4">
      {/* ── Hidden inputs preserving the action contract ──────── */}
      <input type="hidden" name="patientId" value={patientId} />
      {/* WS-C task 1: marks this as the v2 path so the server enforces the
          pharmacy routing target (legacy v1 / batch flows are exempt). */}
      <input type="hidden" name="rxFormVersion" value="v2" />
      {selectedProductId && (
        <input type="hidden" name="productId" value={selectedProductId} />
      )}
      {!selectedProductId && (
        <input type="hidden" name="customProductName" value={customProductName} />
      )}
      <input type="hidden" name="productType" value={productType} />
      <input type="hidden" name="volumePerDose" value={doseValue} />
      <input type="hidden" name="volumeUnit" value={unitValue} />
      <input type="hidden" name="frequencyPerDay" value={String(frequencyPerDay)} />
      <input type="hidden" name="daysSupply" value={daysSupply} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="refills" value={refills} />
      <input type="hidden" name="timingInstructions" value={timingInstructions} />
      <input type="hidden" name="noteToPatient" value={noteToPatient} />
      <input type="hidden" name="noteToPharmacy" value={noteToPharmacy} />
      {/* EMR-1099 (M4): ICD-10 linkage — serialized for actions.ts#diagnosisCodes */}
      {selectedDiagnoses.length > 0 && (
        <input
          type="hidden"
          name="diagnosisCodes"
          value={JSON.stringify(selectedDiagnoses)}
        />
      )}
      <input type="hidden" name="openCannabinoids" value={JSON.stringify(openCannabinoids)} />
      {pharmacy && (
        <>
          <input type="hidden" name="pharmacyId" value={pharmacy.id} />
          <input type="hidden" name="pharmacyName" value={pharmacy.name} />
        </>
      )}
      {interactionAcknowledged && (
        <input type="hidden" name="interactionAcknowledged" value="true" />
      )}
      {highRiskAttestationRequired && highRiskAcknowledged && (
        <>
          <input type="hidden" name="highRiskAttestationAcknowledged" value="true" />
          <input
            type="hidden"
            name="highRiskReasons"
            value={JSON.stringify(highRiskReasons.map((r) => r.kind))}
          />
        </>
      )}
      {isControlled && curesAcknowledged && (
        <>
          <input type="hidden" name="curesAcknowledged" value="true" />
          <input type="hidden" name="curesQueriedAt" value={new Date().toISOString()} />
        </>
      )}
      {contraindicationAcknowledged && (
        <>
          <input type="hidden" name="contraindicationAcknowledged" value="true" />
          <input type="hidden" name="contraindicationOverrideReason" value={contraindicationOverrideReason} />
          <input type="hidden" name="contraindicationIds" value={JSON.stringify(blockingContraindications.map((c) => c.id))} />
          {contraindicationCoSignerUserId && (
            <input type="hidden" name="contraindicationCoSignerUserId" value={contraindicationCoSignerUserId} />
          )}
        </>
      )}

      {/* ── EMR-884: Patient subsection ───────────────────────── */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <PatientAvatar
                firstName={patientFirstName}
                lastName={patientLastName}
                photoUrl={patientPhotoUrl}
              />
              <div className="min-w-0">
                <Link
                  href={`/clinic/patients/${patientId}`}
                  className="text-lg font-semibold text-accent hover:underline tracking-tight"
                >
                  {patientName}
                </Link>
                <p className="text-xs text-text-muted">
                  Date of prescription:{" "}
                  {new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* EMR-884 — call / email / telehealth shortcuts */}
              <ContactShortcut
                href={patientPhone ? `tel:${patientPhone}` : undefined}
                emoji="📞"
                label="Call patient"
              />
              <ContactShortcut
                href={patientEmail ? `mailto:${patientEmail}` : undefined}
                emoji="✉️"
                label="Email patient"
              />
              <ContactShortcut
                href={`/clinic/patients/${patientId}?tab=telehealth`}
                emoji="📹"
                label="Telehealth visit"
                isInternal
              />
            </div>
          </div>
          <h1 className="sr-only">{heading}</h1>
        </CardContent>
      </Card>

      {/* ── EMR-1098 (M2): pre-filled from AI recommendation ───── */}
      {prefill && (
        <Card className="rounded-2xl border-accent/30 bg-accent-soft/30 shadow-sm">
          <CardContent className="py-3">
            <details>
              <summary className="text-sm font-medium text-text cursor-pointer">
                <span aria-hidden>✨</span> Pre-filled from AI recommendation (
                {new Date(prefill.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                ) — view what was applied
              </summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <PreviewRow label="Product type" value={prefill.summary.productType || "—"} />
                <PreviewRow label="Cannabinoid ratio" value={prefill.summary.cannabinoidRatio || "—"} />
                <PreviewRow label="Starting dose" value={prefill.summary.startingDoseMg || "—"} />
                <PreviewRow label="Delivery method" value={prefill.summary.deliveryMethod || "—"} />
                <PreviewRow label="Frequency" value={prefill.summary.frequency || "—"} />
              </div>
              <p className="text-[11px] text-text-subtle mt-3 leading-snug">
                Type, dose, and frequency below were seeded from this saved
                recommendation (low end of any range). Review and adjust before
                signing — the recommendation is decision support, not an order.
              </p>
            </details>
          </CardContent>
        </Card>
      )}

      {/* ── EMR-088: contraindication banner (kept, condensed) ─── */}
      {contraindicationMatches.length > 0 && (
        <Card
          className={cn(
            "rounded-2xl shadow-sm",
            hasBlockingContraindication
              ? "border-l-4 border-l-danger bg-danger/[0.04]"
              : "border-l-4 border-l-[color:var(--highlight-hover)] bg-highlight-soft/40",
          )}
        >
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-semibold text-text flex items-center gap-2">
              <span aria-hidden>⚠️</span>
              Contraindication{contraindicationMatches.length !== 1 ? "s" : ""} detected
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {contraindicationMatches.map((m) => (
                <div key={m.id} className="rounded-lg bg-white border border-border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-text">{m.label}</p>
                    <Badge
                      tone={m.severity === "absolute" ? "danger" : m.severity === "relative" ? "warning" : "neutral"}
                      className="text-[10px] uppercase shrink-0"
                    >
                      {m.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted leading-snug">{m.rationale}</p>
                </div>
              ))}
            </div>
            {hasBlockingContraindication && (
              <div className="border-t border-border pt-3">
                <label className={FIELD_LABEL}>Override reasoning (min 20 chars)</label>
                <textarea
                  value={contraindicationOverrideReason}
                  onChange={(e) => setContraindicationOverrideReason(e.target.value)}
                  rows={2}
                  placeholder="Clinical reasoning for prescribing despite the contraindication."
                  className="w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                  <span className="text-[10px] text-text-subtle">
                    {contraindicationOverrideReason.trim().length}/20
                  </span>
                  <label className="flex items-center gap-2 text-xs text-text">
                    <input
                      type="checkbox"
                      checked={contraindicationAcknowledged}
                      onChange={(e) => setContraindicationAcknowledged(e.target.checked)}
                      disabled={contraindicationOverrideReason.trim().length < 20}
                      className="h-4 w-4 rounded border-border-strong accent-accent disabled:opacity-50"
                    />
                    I take clinical responsibility for this override
                  </label>
                </div>
                {hasAbsoluteContraindication && eligibleCoSigners.length > 0 && (
                  <div className="mt-3">
                    <label className={FIELD_LABEL}>Optional dual sign-off</label>
                    <select
                      value={contraindicationCoSignerUserId}
                      onChange={(e) => setContraindicationCoSignerUserId(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      <option value="">No co-signer</option>
                      {eligibleCoSigners.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── EMR-883: 2-column window (Medication | Dosing+Notes) ─ */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* LEFT — Medication + Ambient Optimization Canvas */}
        <div className="space-y-4">
        <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              Medication
              {controlledMatch && (
                <Badge
                  tone={DEA_SCHEDULE_TONE[controlledMatch.schedule]}
                  className="text-[10px] uppercase tracking-wider"
                >
                  Controlled · {DEA_SCHEDULE_LABEL[controlledMatch.schedule]}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* EMR-885 — typeahead dropdown */}
            <div className="relative" ref={medBoxRef}>
              <label className={FIELD_LABEL}>Search medications</label>
              <input
                value={medQuery}
                onChange={(e) => {
                  setMedQuery(e.target.value);
                  setMedOpen(true);
                  // typing a custom name clears any formulary selection
                  if (!selectedProductId) setCustomProductName(e.target.value);
                }}
                onFocus={() => setMedOpen(true)}
                placeholder='Type "lisin" for Lisinopril…'
                className={TEXT_INPUT_CLASS}
                autoComplete="off"
              />
              {medOpen && (medResults.length > 0 || formularyResults.length > 0) && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-border-strong bg-white shadow-lg max-h-72 overflow-y-auto">
                  {formularyResults.length > 0 && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                      Your formulary
                    </p>
                  )}
                  {formularyResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickFormularyProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-accent-soft/40 flex items-center justify-between gap-2"
                    >
                      <span className="text-sm text-text">{p.name}</span>
                      <Badge tone="accent" className="text-[10px]">formulary</Badge>
                    </button>
                  ))}
                  {medResults.length > 0 && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                      Directory
                    </p>
                  )}
                  {medResults.map((entry) => (
                    <button
                      key={`${entry.name}-${entry.medClass}`}
                      type="button"
                      onClick={() => pickDirectoryEntry(entry)}
                      className="w-full text-left px-3 py-2 hover:bg-accent-soft/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-text font-medium">{entry.name}</span>
                        <Badge tone={MED_CLASS_TONE[entry.medClass]} className="text-[10px]">
                          {entry.medClass}
                        </Badge>
                      </div>
                      {entry.strengths.length > 0 && (
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {entry.strengths.join(" · ")}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected medication chip */}
            {hasMedication && (
              <div className="rounded-xl border border-accent/30 bg-accent-soft/30 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text truncate">{medicationName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductId("");
                    setCustomProductName("");
                    setMedQuery("");
                  }}
                  className="text-xs text-text-muted hover:text-danger"
                >
                  Clear
                </button>
              </div>
            )}

            {/* EMR-885 — Or Enter Manually */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-[10px] text-text-subtle font-medium uppercase tracking-wider">
                or enter manually
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Custom medication name and dose</label>
              <input
                value={selectedProductId ? "" : customProductName}
                onChange={(e) => {
                  setSelectedProductId("");
                  setCustomProductName(e.target.value);
                  setMedQuery(e.target.value);
                }}
                placeholder="e.g. Lisinopril 10 mg tablet"
                className={TEXT_INPUT_CLASS}
              />
            </div>

            {/* EMR-885 — Type: MoA options + free text */}
            <div>
              <label className={FIELD_LABEL}>Type / method of administration</label>
              {productTypeMode === "preset" ? (
                <select
                  value={productType}
                  onChange={(e) => {
                    if (e.target.value === FREE_TEXT) {
                      setProductTypeMode("free");
                      setProductType("");
                    } else {
                      setProductType(e.target.value);
                    }
                  }}
                  className={SELECT_CLASS}
                >
                  <option value="">Select type…</option>
                  {ADMINISTRATION_METHODS.map((m) => (
                    <optgroup key={m.key} label={m.label}>
                      {m.examples.map((ex) => (
                        <option key={ex} value={ex}>{ex}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={FREE_TEXT}>Other (free text)…</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    placeholder="Free-text type"
                    className={TEXT_INPUT_CLASS}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => { setProductTypeMode("preset"); setProductType(""); }}
                    className="text-xs text-text-muted hover:text-text shrink-0 px-2"
                  >
                    Presets
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* EMR-1131/EMR-1135 — inline optimization card beside the
            medication fields. Renders nothing for a clean order; height
            animates so the column never jumps. */}
        <RxGuardrailCard
          evaluation={rxSafety}
          evaluating={rxSafetyEvaluating}
          adjustmentContext={rxAdjustmentContext}
          onAccept={handleGuardrailAccept}
          accepting={rxSafetyAccepting}
        />
        </div>

        {/* RIGHT — Dosing & directions + Notes (EMR-887, EMR-891) */}
        <div className="space-y-4">
          <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dosing &amp; directions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Dose (EMR-887 — dropdown + free text, no arrows) */}
                <PresetOrFree
                  label="Dose"
                  presets={DOSE_PRESETS}
                  value={doseValue}
                  mode={doseMode}
                  onPreset={(v) => setDoseValue(v)}
                  onFreeToggle={() => { setDoseMode("free"); }}
                  onPresetToggle={() => { setDoseMode("preset"); setDoseValue("0.5"); }}
                  onFreeChange={(v) => setDoseValue(v)}
                  freePlaceholder="e.g. 12.5"
                  freeType="number"
                />
                {/* Unit */}
                <PresetOrFree
                  label="Unit"
                  presets={UNIT_PRESETS}
                  value={unitValue}
                  mode={unitMode}
                  onPreset={(v) => setUnitValue(v)}
                  onFreeToggle={() => { setUnitMode("free"); }}
                  onPresetToggle={() => { setUnitMode("preset"); setUnitValue("mg"); }}
                  onFreeChange={(v) => setUnitValue(v)}
                  freePlaceholder="custom unit"
                />
              </div>

              {/* Times per day (EMR-887) */}
              <div>
                <label className={FIELD_LABEL}>Times per day</label>
                {freqMode === "preset" ? (
                  <select
                    value={freqLabel}
                    onChange={(e) => {
                      if (e.target.value === FREE_TEXT) {
                        setFreqMode("free");
                      } else {
                        setFreqLabel(e.target.value);
                      }
                    }}
                    className={SELECT_CLASS}
                  >
                    {FREQUENCY_PRESETS.map((f) => (
                      <option key={f.label} value={f.label}>{f.label}</option>
                    ))}
                    <option value={FREE_TEXT}>Other (free text)…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={freqFreeText}
                      onChange={(e) => setFreqFreeText(e.target.value)}
                      placeholder="e.g. q36h (enter doses/day below)"
                      className={TEXT_INPUT_CLASS}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setFreqMode("preset"); setFreqFreeText(""); }}
                      className="text-xs text-text-muted hover:text-text shrink-0 px-2"
                    >
                      Presets
                    </button>
                  </div>
                )}
                {freqMode === "free" && (
                  <p className="text-[10px] text-text-subtle mt-1">
                    Resolves to {frequencyPerDay} dose(s)/day for quantity math.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Days supply (EMR-887) */}
                <div>
                  <label className={FIELD_LABEL}>Days supply</label>
                  {daysMode === "preset" ? (
                    <select
                      value={daysSupply}
                      onChange={(e) => {
                        if (e.target.value === FREE_TEXT) {
                          setDaysMode("free");
                        } else {
                          setDaysSupply(e.target.value);
                        }
                      }}
                      className={SELECT_CLASS}
                    >
                      {DAYS_SUPPLY_PRESETS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      <option value={FREE_TEXT}>Other…</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={daysSupply}
                      onChange={(e) => setDaysSupply(e.target.value)}
                      className={TEXT_INPUT_CLASS}
                      autoFocus
                    />
                  )}
                </div>
                {/* Quantity (auto-calc + override) */}
                <div>
                  <label className={FIELD_LABEL}>
                    Quantity{" "}
                    <span className="font-normal normal-case text-text-subtle">
                      {quantityManual ? "(manual)" : "(auto)"}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={quantity}
                    onChange={(e) => { setQuantity(e.target.value); setQuantityManual(true); }}
                    className={TEXT_INPUT_CLASS}
                    placeholder="auto"
                  />
                </div>
                {/* Refills (unchanged) */}
                <div>
                  <label className={FIELD_LABEL}>Refills</label>
                  <select
                    value={refills}
                    onChange={(e) => setRefills(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {Array.from({ length: 13 }, (_, i) => i).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Timing instructions (unchanged) */}
              <div>
                <label className={FIELD_LABEL}>Timing instructions</label>
                <input
                  value={timingInstructions}
                  onChange={(e) => setTimingInstructions(e.target.value)}
                  placeholder="Morning and 1 hour before bed"
                  className={TEXT_INPUT_CLASS}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes (EMR-891) — co-located, same window */}
          <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className={FIELD_LABEL}>Note to patient</label>
                <textarea
                  value={noteToPatient}
                  onChange={(e) => setNoteToPatient(e.target.value)}
                  rows={2}
                  placeholder="Take with food. Avoid driving for 2 hours after dose."
                  className="w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                {/* EMR-891 — darker/larger, tip removed */}
                <p className="text-sm font-medium text-text-muted mt-1">
                  Shown to the patient on their medications page
                </p>
              </div>
              <div>
                <label className={FIELD_LABEL}>Note to pharmacy</label>
                <textarea
                  value={noteToPharmacy}
                  onChange={(e) => setNoteToPharmacy(e.target.value)}
                  rows={2}
                  placeholder="Brand medically necessary. Do not substitute."
                  className="w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                {/* EMR-891 — darker/larger, tip removed */}
                <p className="text-sm font-medium text-text-muted mt-1">
                  Internal only — not shown to patient
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── EMR-1099 (M4): diagnosis codes (ICD-10 linkage) ────── */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diagnosis codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-text-muted">
            Link the ICD-10 diagnoses this prescription treats. Codes from the
            patient&apos;s problem list are marked{" "}
            <span className="font-medium text-accent">chart</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            {diagnosisOptions.map((diag) => {
              const selected = selectedDiagnoses.some((d) => d.code === diag.code);
              return (
                <button
                  key={diag.code}
                  type="button"
                  onClick={() => toggleDiagnosis({ code: diag.code, label: diag.label })}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    selected
                      ? "bg-accent/10 text-accent border-accent/30"
                      : "bg-surface-muted text-text-muted border-border hover:border-accent/30",
                  )}
                >
                  <span className="font-mono text-[10px]">{diag.code}</span>
                  <span>{diag.label}</span>
                  {diag.fromChart && (
                    <Badge tone="accent" className="text-[9px] uppercase">
                      chart
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── EMR-892: Pharmacy (moved up, next to the window) ───── */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => setPharmacyOpen(true)}
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent hover:underline"
            >
              Pharmacy
            </button>
            {pharmacy ? (
              <p className="text-sm text-text mt-1">
                <span className="font-medium">{pharmacy.name}</span>
                {" — "}
                {pharmacy.address}, {pharmacy.city}
              </p>
            ) : (
              // EMR-1099 (M3): pharmacy is now required to sign & send.
              <p className="text-sm text-danger mt-1">
                Required — select where to send this ℞ before signing.
              </p>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => setPharmacyOpen(true)}>
            {pharmacy ? "Change pharmacy" : "Select pharmacy"}
          </Button>
        </CardContent>
      </Card>

      {/* ── EMR-888: Safety check ─────────────────────────────── */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            Safety check
            {visibleSafetyBoxes.some((b) => b.tier !== "red") && (
              <button
                type="button"
                onClick={dismissAllSafety}
                className="text-xs font-medium text-text-muted hover:text-text"
              >
                Dismiss all
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!hasMedication && (
            <p className="text-sm text-text-subtle italic">
              Select a medication to run the interaction check.
            </p>
          )}
          {hasMedication && cannabinoidsForCheck.length === 0 && (
            <p className="text-sm text-text-subtle italic">
              No cannabinoid content to screen for interactions.
            </p>
          )}
          {visibleSafetyBoxes.map((box) => (
            <SafetyBox
              key={box.key}
              tier={box.tier}
              title={box.title}
              detail={box.detail}
              resolution={resolved[box.key] ?? null}
              onResolve={(action, justification) => resolveBox(box, action, justification)}
            />
          ))}
          {hasMedication && cannabinoidsForCheck.length > 0 && visibleSafetyBoxes.length === 0 && safetyBoxes.length > 0 && (
            <p className="text-sm text-success">All safety items resolved.</p>
          )}
        </CardContent>
      </Card>

      {/* ── EMR-889: CURES attestation (controlled only) ──────── */}
      {isControlled && (
        <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CURES / controlled-substance attestation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-text-muted">
              Required for {DEA_SCHEDULE_LABEL[controlledMatch!.schedule]}. Each box
              records a time-stamped digital attestation.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CURES_ATTESTATIONS.map((text, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2 text-sm text-text rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={curesChecked[idx]}
                    onChange={() => toggleCures(idx)}
                    className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent"
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            <Link
              href="/clinic/settings"
              className="inline-block text-xs text-accent hover:underline mt-1"
            >
              Store your CURES credentials in Settings →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── WS-C task 3: high-risk clinical attestation (non-controlled) ── */}
      {highRiskAttestationRequired && (
        <Card className="rounded-2xl bg-amber-50/60 border-amber-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900">
              High-risk prescription — clinical attestation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-amber-800">
              This prescription is flagged high-risk for the reason
              {highRiskReasons.length === 1 ? "" : "s"} below. Acknowledge that
              you have weighed the risks and benefits before signing.
            </p>
            <ul className="space-y-1.5">
              {highRiskReasons.map((r) => (
                <li
                  key={r.kind}
                  className="flex items-start gap-2 text-sm text-amber-900"
                >
                  <Badge tone="warning" className="text-[10px] shrink-0 mt-0.5">
                    {r.label}
                  </Badge>
                  <span className="text-amber-800">{r.detail}</span>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-sm text-amber-900 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 cursor-pointer hover:bg-white">
              <input
                type="checkbox"
                checked={highRiskAcknowledged}
                onChange={() => {
                  setHighRiskAcknowledged((prev) => {
                    const next = !prev;
                    if (next) {
                      ledger.record({
                        kind: "acknowledge",
                        source: "High-risk attestation",
                        subject: highRiskReasons.map((r) => r.label).join(", "),
                        justification: "Clinician acknowledged high-risk prescription",
                      });
                    }
                    return next;
                  });
                }}
                className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600"
              />
              <span>
                I have reviewed the risks and benefits and judge this
                prescription clinically appropriate for this patient.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {/* ── EMR-886: Cannabinoids open to (secondary, lower) ──── */}
      {moduleFlags.cannabis && (
        <details className="rounded-2xl bg-surface-muted/40 border border-border/60 px-4 py-3">
          <summary className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle cursor-pointer">
            Cannabinoids open to
          </summary>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CANNABINOIDS.map((c) => {
              const selected = openCannabinoids.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setOpenCannabinoids((prev) =>
                      prev.includes(c) ? prev.filter((k) => k !== c) : [...prev, c],
                    )
                  }
                  className={cn(
                    "px-3 py-1 rounded-full border text-xs font-medium transition-colors",
                    selected
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-text-muted border-border hover:border-accent/50",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-text-subtle mt-2">
            Secondary preference. This control can also live on{" "}
            <span className="font-medium">/portal/intake</span> so patients set it themselves.
          </p>
        </details>
      )}

      {/* ── Actions ───────────────────────────────────────────── */}
      {state?.ok === false && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link href={`/clinic/patients/${patientId}?tab=rx`}>
          <Button type="button" variant="ghost">Cancel</Button>
        </Link>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!previewReady}
            onClick={() => setPreviewOpen(true)}
          >
            Prescription preview
          </Button>
          <SubmitButton disabled={blocked} alert={rxSafetyBlocking} />
        </div>
      </div>
      {/* EMR-1135: ambient hint while a guardrail conflict blocks signing */}
      {rxSafetyHardStop && (
        <p className="text-[11px] text-status-alert-fg text-right">
          A safety hard stop is active — resolve the conflict in the
          optimization card to enable Sign &amp; send.
        </p>
      )}
      {/* EMR-1099 (M3): visible hint when the pharmacy gate blocks signing */}
      {!pharmacy && (
        <p className="text-[11px] text-danger text-right">
          Select a pharmacy to enable Sign &amp; send — every ℞ needs a routing
          target.
        </p>
      )}
      {!previewReady && (
        <p className="text-[11px] text-text-subtle text-right">
          Fill medication, dosing, notes &amp; pharmacy to open the preview.
        </p>
      )}

      {/* ── EMR-892: Pharmacy split-pane popup ────────────────── */}
      <PharmacyPopup
        open={pharmacyOpen}
        onClose={() => setPharmacyOpen(false)}
        patientState={patientState}
        onSelect={(p) => {
          setPharmacy(p);
          setPharmacyOpen(false);
        }}
      />

      {/* ── EMR-893: Prescription Preview modal ───────────────── */}
      <ModalShell
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        eyebrow="Review"
        title="Prescription preview"
        placement="center"
        maxWidth="max-w-xl"
      >
        <div className="px-6 py-5 space-y-4">
          <PreviewRow label="Patient" value={patientName} />
          <PreviewRow label="Medication" value={medicationName} />
          <PreviewRow label="Type" value={productType || "—"} />
          <PreviewRow label="Sig" value={sigSummary} mono />
          <div className="grid grid-cols-3 gap-3">
            <PreviewRow label="Quantity" value={`${quantity || "—"} ${unitValue}`} />
            <PreviewRow label="Days supply" value={daysSupply || "—"} />
            <PreviewRow label="Refills" value={refills} />
          </div>
          {/* EMR-1099 (M4): linked ICD-10 diagnoses */}
          {selectedDiagnoses.length > 0 && (
            <PreviewRow
              label="Diagnosis codes"
              value={selectedDiagnoses
                .map((d) => `${d.code} ${d.label}`)
                .join(" · ")}
            />
          )}
          <PreviewRow
            label="Interaction status"
            value={
              interactions.length === 0
                ? "No interactions detected"
                : `${interactions.filter((i) => i.severity === "red").length} contraindicated, ${interactions.filter((i) => i.severity === "yellow").length} caution`
            }
          />
          {pharmacy && (
            <PreviewRow
              label="Send to pharmacy"
              value={`${pharmacy.name} — ${pharmacy.address}, ${pharmacy.city}${pharmacy.fax ? ` · Fax ${pharmacy.fax}` : ""}`}
            />
          )}
          {/* Note to Patient, then Note to Pharmacy beneath it (EMR-893) */}
          {noteToPatient && <PreviewRow label="Note to patient" value={noteToPatient} />}
          {noteToPharmacy && <PreviewRow label="Note to pharmacy" value={noteToPharmacy} />}

          {/* Prescriber block + DEA for controlled (EMR-893) */}
          <div className="border-t border-border pt-3">
            <PreviewRow label="Prescriber" value={providerName} />
            {isControlled && (
              <p className="text-xs text-text-muted mt-1">
                DEA #: <span className="font-mono">{deaNumber}</span>{" "}
                <span className="text-text-subtle">(interim placeholder)</span>
              </p>
            )}
          </div>
        </div>
      </ModalShell>
    </form>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function PatientAvatar({
  firstName,
  lastName,
  photoUrl,
}: {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
}) {
  const init = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-accent-soft to-highlight-soft text-accent font-display font-medium ring-1 ring-inset ring-border shrink-0">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={`${firstName} ${lastName}`} className="h-full w-full object-cover" />
      ) : (
        init
      )}
    </div>
  );
}

function ContactShortcut({
  href,
  emoji,
  label,
  isInternal,
}: {
  href?: string;
  emoji: string;
  label: string;
  isInternal?: boolean;
}) {
  const cls =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-base hover:bg-accent-soft/50 transition-colors";
  if (!href) {
    return (
      <span
        className={cn(cls, "opacity-40 cursor-not-allowed")}
        title={`${label} (unavailable)`}
        aria-label={`${label} (unavailable)`}
      >
        <span aria-hidden>{emoji}</span>
      </span>
    );
  }
  if (isInternal) {
    return (
      <Link href={href} className={cls} title={label} aria-label={label}>
        <span aria-hidden>{emoji}</span>
      </Link>
    );
  }
  return (
    <a href={href} className={cls} title={label} aria-label={label}>
      <span aria-hidden>{emoji}</span>
    </a>
  );
}

/** Dose/unit field that toggles between a preset dropdown and a free-text input. */
function PresetOrFree({
  label,
  presets,
  value,
  mode,
  onPreset,
  onFreeToggle,
  onPresetToggle,
  onFreeChange,
  freePlaceholder,
  freeType = "text",
}: {
  label: string;
  presets: string[];
  value: string;
  mode: "preset" | "free";
  onPreset: (v: string) => void;
  onFreeToggle: () => void;
  onPresetToggle: () => void;
  onFreeChange: (v: string) => void;
  freePlaceholder?: string;
  freeType?: "text" | "number";
}) {
  return (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      {mode === "preset" ? (
        <select
          value={presets.includes(value) ? value : presets[0]}
          onChange={(e) => {
            if (e.target.value === FREE_TEXT) onFreeToggle();
            else onPreset(e.target.value);
          }}
          className={SELECT_CLASS}
        >
          {presets.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value={FREE_TEXT}>Other…</option>
        </select>
      ) : (
        <div className="flex gap-1">
          <input
            type={freeType}
            step={freeType === "number" ? "0.01" : undefined}
            value={value}
            onChange={(e) => onFreeChange(e.target.value)}
            placeholder={freePlaceholder}
            className={TEXT_INPUT_CLASS}
            autoFocus
          />
          <button
            type="button"
            onClick={onPresetToggle}
            className="text-[10px] text-text-muted hover:text-text shrink-0 px-1"
            title="Back to presets"
          >
            ↩
          </button>
        </div>
      )}
    </div>
  );
}

/** EMR-888 — a single safety box: tiered colour, top-right Acknowledge/Dismiss. */
function SafetyBox({
  tier,
  title,
  detail,
  resolution,
  onResolve,
}: {
  tier: "green" | "yellow" | "red";
  title: string;
  detail: string;
  resolution: { action: ResolveAction; justification?: string; at: string } | null;
  onResolve: (action: ResolveAction, justification?: string) => void;
}) {
  const toneClass =
    tier === "red"
      ? "border-red-200 bg-red-50/70"
      : tier === "yellow"
        ? "border-amber-200 bg-amber-50/60"
        : "border-emerald-200 bg-emerald-50/50";
  const dot =
    tier === "red" ? "🔴" : tier === "yellow" ? "🟡" : "🟢";
  return (
    <div className={cn("rounded-xl border p-3 flex items-start justify-between gap-3", toneClass)}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text flex items-center gap-1.5">
          <span aria-hidden>{dot}</span>
          {title}
        </p>
        <p className="text-xs text-text-muted mt-0.5">{detail}</p>
      </div>
      <div className="shrink-0">
        <AckDismissControls
          isCritical={tier === "red"}
          resolved={resolution}
          onResolve={onResolve}
        />
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-0.5">{label}</p>
      <p className={cn("text-sm text-text", mono && "font-mono")}>{value}</p>
    </div>
  );
}

/* ── EMR-892: split-pane pharmacy popup ─────────────────────── */

function PharmacyPopup({
  open,
  onClose,
  onSelect,
  patientState,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (p: PharmacyEntry) => void;
  patientState?: string;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(patientState ?? "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const results = useMemo(() => searchPharmacies(submitted, 12), [submitted]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Send to pharmacy"
      title="Find a pharmacy"
      placement="center"
      maxWidth="max-w-3xl"
    >
      <div className="grid md:grid-cols-[280px_1fr] gap-0 min-h-[360px]">
        {/* LEFT pane — search */}
        <div className="border-r border-border p-5 space-y-3">
          <label className={FIELD_LABEL}>Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setSubmitted(query);
              }
            }}
            placeholder="Name, address, zip, city, state, county, phone…"
            className={TEXT_INPUT_CLASS}
            autoFocus
          />
          <Button
            type="button"
            className="w-full"
            onClick={() => setSubmitted(query)}
          >
            Search
          </Button>
          {patientState && (
            <p className="text-[11px] text-text-subtle">
              Pre-seeded with patient state: {patientState}
            </p>
          )}
        </div>

        {/* RIGHT pane — collapsible results */}
        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <p className="text-sm text-text-muted py-6 text-center">
              No pharmacies match. Try a name, zip, or city.
            </p>
          )}
          {results.map((p) => {
            const isOpen = expanded[p.id];
            return (
              <div key={p.id} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{p.name}</p>
                    <p className="text-xs text-text-muted">
                      {p.address}, {p.city}, {p.state} {p.zip}
                    </p>
                    <p className="text-xs text-text-subtle">{p.phone}</p>
                  </div>
                  <span
                    className={cn(
                      "text-text-subtle transition-transform shrink-0 mt-0.5",
                      isOpen && "rotate-90",
                    )}
                    aria-hidden
                  >
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-0 space-y-1 border-t border-border/60">
                    {p.fax && (
                      <p className="text-xs text-text-muted mt-2">
                        Fax: <span className="text-text">{p.fax}</span>
                      </p>
                    )}
                    {p.npi && (
                      <p className="text-xs text-text-muted">
                        NPI: <span className="text-text font-mono">{p.npi}</span>
                      </p>
                    )}
                    {p.county && (
                      <p className="text-xs text-text-muted">County: {p.county}</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => onSelect(p)}
                    >
                      Select this pharmacy
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
