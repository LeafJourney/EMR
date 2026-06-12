/**
 * Denial-probability pre-flight engine (EMR-1137 / EMR-1138, epic EMR-1120)
 * -------------------------------------------------------------------------
 * Deterministic pre-submission gate per the RCM red-text spec
 * (docs/product-feedback/2026-06-12_workflows-revisions-red-text.md,
 * "Autonomous Revenue Cycle Management", Phases 2–4):
 *
 *   features.ts    — feature extraction (xCci, modifierGap, vPayer,
 *                    deltaLcd, phiNarrative)
 *   score.ts       — computePDenial: logistic P_denial in [0,1];
 *                    ≥0.35 hold, <0.10 green release
 *   attribution.ts — ranked root-cause findings with typed remediation
 *   remediate.ts   — pure one-click fix helpers (fix → re-run → green)
 *   engine.ts      — runPreflight orchestration
 *   rules.ts       — seedable NCCI pair + LCD coverage tables
 *
 * Wiring (TODO — see engine.ts header for the full plan): intercept
 * between superbill signing and buildClaimEdi() — a `preflight` RCM
 * stage between "coding_scrub" and "submission", plus a hold-guard in
 * the clearinghouse submission agent.
 */

export * from "./rules";
export * from "./features";
export * from "./score";
export * from "./attribution";
export * from "./remediate";
export * from "./engine";
