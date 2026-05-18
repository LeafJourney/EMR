import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";

// ---------------------------------------------------------------------------
// Competitive Analysis Report: Leafjourney vs ArfinnMed
// ---------------------------------------------------------------------------
// Generates a structured JSON report comparing our feature set against
// ArfinnMed (the leading cannabis-specific EMR). This can be rendered as
// a PDF via a client-side library or printed from the UI.
//
// ArfinnMed features sourced from: arfinnmed.com/features, Capterra,
// SoftwareFinder, and cannabis industry publications.
// ---------------------------------------------------------------------------

interface FeatureComparison {
  category: string;
  feature: string;
  arfinnMed: "yes" | "no" | "partial" | "unknown";
  leafjourney: "yes" | "no" | "partial" | "planned";
  priority: "critical" | "high" | "medium" | "low";
  notes: string;
}

const COMPARISON: FeatureComparison[] = [
  // ── Scheduling & Intake ──────────────────────────
  { category: "Scheduling & Intake", feature: "Online appointment booking", arfinnMed: "yes", leafjourney: "planned", priority: "high", notes: "ArfinnMed has full patient self-scheduling. Our EMR-155 ticket covers this." },
  { category: "Scheduling & Intake", feature: "Automated appointment reminders", arfinnMed: "yes", leafjourney: "partial", priority: "high", notes: "We have agent-based reminders via Scheduling Agent; needs SMS/email integration." },
  { category: "Scheduling & Intake", feature: "Patient pre-registration / intake forms", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Our intake system is comprehensive with progressive disclosure and cannabis history." },
  { category: "Scheduling & Intake", feature: "Custom intake form builder", arfinnMed: "yes", leafjourney: "no", priority: "medium", notes: "ArfinnMed allows custom intake forms. We use a fixed schema. Consider a form builder." },
  { category: "Scheduling & Intake", feature: "Rebooking emails", arfinnMed: "yes", leafjourney: "no", priority: "medium", notes: "Automated re-engagement when patients miss follow-ups." },
  { category: "Scheduling & Intake", feature: "Prepaid appointment options", arfinnMed: "yes", leafjourney: "no", priority: "low", notes: "ArfinnMed supports prepayment at booking time." },
  { category: "Scheduling & Intake", feature: "No-show tracking", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "Our Morning Brief surfaces no-shows. ArfinnMed has automated no-show workflows." },

  // ── Clinical Charting ────────────────────────────
  { category: "Clinical Charting", feature: "Chart templates", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "We have 5 clinical note templates. ArfinnMed has state-specific templates." },
  { category: "Clinical Charting", feature: "State-specific form automation", arfinnMed: "yes", leafjourney: "no", priority: "critical", notes: "ArfinnMed auto-populates state-required cannabis forms. CRITICAL GAP — needed for compliance." },
  { category: "Clinical Charting", feature: "Voice-to-text / dictation", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "ArfinnMed has voice-to-text. We have Voice-to-Chart (EMR-156) — more advanced with AI extraction." },
  { category: "Clinical Charting", feature: "AI scribe / note generation", arfinnMed: "no", leafjourney: "yes", priority: "critical", notes: "Our Scribe Agent drafts structured SOAP notes from context. ArfinnMed does not have this." },
  { category: "Clinical Charting", feature: "SOAP / APSO note format", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Both support structured note formats. We use APSO ordering per Dr. Patel's preference." },
  { category: "Clinical Charting", feature: "Pre-visit intelligence briefing", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "Our Pre-Visit Intelligence Agent generates talking points, risk flags. Unique advantage." },
  { category: "Clinical Charting", feature: "Drug interaction checking", arfinnMed: "partial", leafjourney: "yes", priority: "critical", notes: "We have a comprehensive cannabis-drug interaction database. ArfinnMed has basic checking." },
  { category: "Clinical Charting", feature: "Contraindication screening", arfinnMed: "partial", leafjourney: "yes", priority: "critical", notes: "Full contraindication database with severity levels and override workflow." },
  { category: "Clinical Charting", feature: "Clinical decision support alerts", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "EMR-166 CDS Panel — real-time alerts in chart. ArfinnMed does not have this." },

  // ── Cannabis-Specific ────────────────────────────
  { category: "Cannabis-Specific", feature: "Cannabis dosing protocols", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Both have dosing guidance. Ours includes AI-powered titration recommendations." },
  { category: "Cannabis-Specific", feature: "Dosing / efficacy reports", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "ArfinnMed generates dosing reports. We have outcome tracking with trend visualization." },
  { category: "Cannabis-Specific", feature: "Patient efficacy tracking", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Both track patient-reported outcomes. We have 9 metrics with longitudinal trends." },
  { category: "Cannabis-Specific", feature: "Cannabis product formulary", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "We have CannabisProduct model with full cannabinoid profiles, terpenes, and PK data." },
  { category: "Cannabis-Specific", feature: "Cannabis ICD-10 coding", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "33 conditions in our cannabis-icd10 database with CPT codes and evidence levels." },
  { category: "Cannabis-Specific", feature: "Cannabis pharmacology database", arfinnMed: "partial", leafjourney: "yes", priority: "high", notes: "Route PKs, adverse effects, overdose protocols, CYP interactions — comprehensive." },
  { category: "Cannabis-Specific", feature: "Strain/product recommendations", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "AI-powered dosing recommendation agent considers condition, weight, tolerance." },
  { category: "Cannabis-Specific", feature: "Cannabis education for patients", arfinnMed: "partial", leafjourney: "yes", priority: "high", notes: "Searchable education database: cannabinoids, terpenes, conditions, delivery methods." },

  // ── E-Prescribe ──────────────────────────────────
  { category: "E-Prescribe", feature: "Electronic prescribing", arfinnMed: "partial", leafjourney: "yes", priority: "critical", notes: "EMR-169: Full e-prescribe with pharmacy selection, Rx preview, e-signature." },
  { category: "E-Prescribe", feature: "Pharmacy integration", arfinnMed: "partial", leafjourney: "partial", priority: "high", notes: "We have pharmacy selector. Full NCPDP integration needed for production." },
  { category: "E-Prescribe", feature: "Prescription history", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "DosingRegimen model tracks full prescription history per patient." },
  { category: "E-Prescribe", feature: "Refill management", arfinnMed: "yes", leafjourney: "partial", priority: "high", notes: "Smart Inbox detects refill requests. Automated refill workflow needed." },

  // ── Telehealth ───────────────────────────────────
  { category: "Telehealth", feature: "Integrated video visits", arfinnMed: "yes", leafjourney: "planned", priority: "critical", notes: "ArfinnMed has built-in telehealth. We need video integration — EMR-163." },
  { category: "Telehealth", feature: "Phone visit support", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "Encounter modality supports phone visits." },

  // ── Patient Portal ───────────────────────────────
  { category: "Patient Portal", feature: "Patient dashboard", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Modular dashboard with health grade, lifestyle bars, mood tracking, AI tips." },
  { category: "Patient Portal", feature: "Secure messaging", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Full threaded messaging with AI triage (Smart Inbox)." },
  { category: "Patient Portal", feature: "Document upload", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "Document upload with AI classification via Document Organizer Agent." },
  { category: "Patient Portal", feature: "Outcome self-reporting", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "9 outcome metrics (pain, sleep, anxiety, mood, etc.) with trend charts." },
  { category: "Patient Portal", feature: "Care plan visibility", arfinnMed: "partial", leafjourney: "yes", priority: "high", notes: "Patients can view their care plan, dosing recommendations, and treatment goals." },
  { category: "Patient Portal", feature: "Assessment completion (PHQ-9, GAD-7)", arfinnMed: "partial", leafjourney: "yes", priority: "high", notes: "Validated clinical assessments with scoring and interpretation." },

  // ── Billing & Payments ───────────────────────────
  { category: "Billing & Payments", feature: "Claims management", arfinnMed: "no", leafjourney: "yes", priority: "critical", notes: "ArfinnMed does NOT provide billing. We have a full RCM fleet with 23 billing agents." },
  { category: "Billing & Payments", feature: "Payment processing", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "ArfinnMed has prepaid options. We have payment processing with Payabli gateway." },
  { category: "Billing & Payments", feature: "Insurance billing / 837P", arfinnMed: "no", leafjourney: "yes", priority: "critical", notes: "Full claim construction and clearinghouse submission. Major advantage over ArfinnMed." },
  { category: "Billing & Payments", feature: "Superbill generation", arfinnMed: "no", leafjourney: "planned", priority: "high", notes: "EMR-177: Superbill generation from encounter data." },
  { category: "Billing & Payments", feature: "Year-end tax summary", arfinnMed: "no", leafjourney: "yes", priority: "medium", notes: "Patient-facing tax summary for healthcare expense deductions." },
  { category: "Billing & Payments", feature: "Patient payment portal", arfinnMed: "partial", leafjourney: "yes", priority: "high", notes: "Patient billing page with balance, statements, and payment plans." },

  // ── Compliance & Legal ───────────────────────────
  { category: "Compliance & Legal", feature: "HIPAA compliance", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Both are HIPAA-aligned. Ours has full audit logging." },
  { category: "Compliance & Legal", feature: "E-consent generation", arfinnMed: "yes", leafjourney: "planned", priority: "high", notes: "ArfinnMed has customizable e-consent forms. EMR-179: Consent Forms ticket." },
  { category: "Compliance & Legal", feature: "State compliance reporting", arfinnMed: "yes", leafjourney: "no", priority: "critical", notes: "CRITICAL GAP — ArfinnMed auto-generates state-required cannabis reports." },
  { category: "Compliance & Legal", feature: "Audit trail", arfinnMed: "partial", leafjourney: "yes", priority: "critical", notes: "Comprehensive AuditLog with actor tracking for every sensitive operation." },
  { category: "Compliance & Legal", feature: "Role-based access control", arfinnMed: "yes", leafjourney: "yes", priority: "critical", notes: "Patient, clinician, operator, practice_owner, system roles." },

  // ── AI & Automation ──────────────────────────────
  { category: "AI & Automation", feature: "AI agent orchestration", arfinnMed: "no", leafjourney: "yes", priority: "critical", notes: "40+ specialized AI agents. This is our core differentiator." },
  { category: "AI & Automation", feature: "Agent approval workflow", arfinnMed: "no", leafjourney: "yes", priority: "critical", notes: "Every AI output requires clinician review. No agent sends without sign-off." },
  { category: "AI & Automation", feature: "Patient memory / longitudinal understanding", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "PatientMemory + ClinicalObservation models for longitudinal context." },
  { category: "AI & Automation", feature: "Morning brief / daily checklist", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "Daily quality checklist: unsigned notes, no-shows, messages, worsening patients." },
  { category: "AI & Automation", feature: "AI message triage (Nurse Nora)", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "Correspondence Nurse Agent triages incoming messages, drafts responses." },
  { category: "AI & Automation", feature: "Research synthesis", arfinnMed: "no", leafjourney: "yes", priority: "medium", notes: "Research Synthesizer Agent retrieves and summarizes cannabis evidence." },

  // ── Marketplace ──────────────────────────────────
  { category: "Marketplace", feature: "Physician-curated product marketplace", arfinnMed: "no", leafjourney: "yes", priority: "medium", notes: "Leafjourney Marketplace — clinician-recommended cannabis products." },
  { category: "Marketplace", feature: "Product catalog with cannabinoid profiles", arfinnMed: "no", leafjourney: "yes", priority: "medium", notes: "12 products with THC/CBD/terpene profiles, dosage guidance, reviews." },

  // ── Practice Management ──────────────────────────
  { category: "Practice Management", feature: "Practice launch wizard", arfinnMed: "partial", leafjourney: "yes", priority: "medium", notes: "Practice Launch Agent evaluates readiness and generates next steps." },
  { category: "Practice Management", feature: "Provider management", arfinnMed: "yes", leafjourney: "yes", priority: "high", notes: "Provider directory with specialties, bios, and scheduling." },
  { category: "Practice Management", feature: "Mission Control / ops dashboard", arfinnMed: "no", leafjourney: "yes", priority: "high", notes: "Real-time visibility into all agent activity, approvals, and job queue." },
];

export async function GET(req: Request) {
  // Internal competitive analysis — admin-only. Find-and-fix pass 4
  // found this route returning the full report to anonymous callers,
  // exposing our internal feature scoring against competitors.
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;

  // Compute summary stats
  const total = COMPARISON.length;
  const ourYes = COMPARISON.filter((c) => c.leafjourney === "yes").length;
  const ourPartial = COMPARISON.filter((c) => c.leafjourney === "partial").length;
  const theirYes = COMPARISON.filter((c) => c.arfinnMed === "yes").length;
  const gaps = COMPARISON.filter((c) => c.leafjourney === "no" || c.leafjourney === "planned");
  const criticalGaps = gaps.filter((g) => g.priority === "critical");
  const highGaps = gaps.filter((g) => g.priority === "high");
  const advantages = COMPARISON.filter(
    (c) => c.leafjourney === "yes" && (c.arfinnMed === "no" || c.arfinnMed === "partial")
  );

  const report = {
    title: "Competitive Analysis: Leafjourney vs ArfinnMed",
    generatedAt: new Date().toISOString(),
    summary: {
      totalFeaturesCompared: total,
      leafjourney: { yes: ourYes, partial: ourPartial, no: total - ourYes - ourPartial },
      arfinnMed: { yes: theirYes, partial: COMPARISON.filter((c) => c.arfinnMed === "partial").length, no: total - theirYes - COMPARISON.filter((c) => c.arfinnMed === "partial").length },
      leafjourneyScore: Math.round(((ourYes + ourPartial * 0.5) / total) * 100),
      arfinnMedScore: Math.round(((theirYes + COMPARISON.filter((c) => c.arfinnMed === "partial").length * 0.5) / total) * 100),
    },
    criticalGaps: criticalGaps.map((g) => ({
      feature: g.feature,
      category: g.category,
      notes: g.notes,
    })),
    highPriorityGaps: highGaps.map((g) => ({
      feature: g.feature,
      category: g.category,
      notes: g.notes,
    })),
    ourAdvantages: advantages.map((a) => ({
      feature: a.feature,
      category: a.category,
      notes: a.notes,
    })),
    fullComparison: COMPARISON,
    recommendations: [
      "1. STATE COMPLIANCE REPORTING — Most urgent gap. ArfinnMed auto-generates state-required cannabis forms. Build state form templates and auto-population.",
      "2. TELEHEALTH VIDEO — ArfinnMed has built-in video visits. Integrate a video provider (Daily.co, Twilio) into the encounter workflow.",
      "3. ONLINE SCHEDULING — ArfinnMed has patient self-scheduling with prepaid options. Build the scheduling calendar (EMR-155).",
      "4. E-CONSENT FORMS — ArfinnMed has customizable e-consent. Build consent form builder (EMR-179).",
      "5. CUSTOM INTAKE BUILDER — ArfinnMed allows custom intake forms. Consider a drag-and-drop form builder.",
      "6. REBOOKING AUTOMATION — ArfinnMed sends automated rebooking emails. Wire up the Patient Outreach Agent for re-engagement.",
    ],
    verdict: "Leafjourney significantly outperforms ArfinnMed in AI capabilities (40+ agents vs none), billing/RCM (full pipeline vs none), clinical decision support, and the e-prescribe workflow. ArfinnMed's key advantages are state compliance reporting, integrated telehealth, and scheduling — all of which are addressable with targeted development. Our AI orchestration layer is a fundamental architectural advantage that ArfinnMed cannot easily replicate.",
  };

  return NextResponse.json(report, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="leafjourney-vs-arfinnmed-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
