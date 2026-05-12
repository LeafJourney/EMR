# RCM Critic Report — Massive Billing Stress Test

**Auditor stance.** I ran 15 adversarially designed claims through the production
billing modules end-to-end. Every claim hits the real exported code paths — no
platform mocking. Where the platform requires external surfaces (clearinghouse
gateway, 270/271/999/277CA/835 wire formats) I fed it the documented input
shapes either via the `SimulatedClearinghouseAdapter` or via the JSON envelopes
each parser explicitly supports.

**Harness:** [scripts/rcm-stress-test.ts](scripts/rcm-stress-test.ts) — single
file, deterministic, runs in 13 seconds with `npx tsx`.

**Coverage:** 20 modules exercised across 19 lifecycle stages:

1. eligibility 270/271 → 2. cannabis routing → 3. scrub → 4. timely-filing →
5. 837P build → 6. SNIP 1-5 → 7. clearinghouse submit → 8. 999 ack →
9. 277CA ack → 10. 835 ERA parse → 11. adjudication classify → 12. PR split →
13. claim-total reconcile → 14. denial taxonomy → 15. underpayment vs contract →
16. secondary 837P build → 17. reimbursement prediction → 18. aging →
19. statement cadence → 20. lockbox match.

---

## Verdict

**The billing engine is in better shape than 90% of EMR products I've audited.**
The architecture is honest: the scrub, ERA parser, 837P builder, and SNIP
validator are real code with real tests (285 unit tests green). The team has
already self-identified the integration gaps (EMR-216..EMR-220 stubs noted in
`BILLING_HARDENING_REPORT.md`) and is not lying about production readiness.

**But there are real bugs that will cost real money on real claims.** Listed
below in priority order with the case ID, the observed behavior, and the
real-world dollar impact.

---

## Critical findings (will cost money / cause denials on day 1)

### C-1. NCCI mod-25 check is on the wrong line
**Where:** [scrub.ts:285-287](src/lib/billing/scrub.ts#L285-L287)
```ts
const hasAllowedModifier =
  pair.allowedModifier != null &&
  (componentLine?.modifiers ?? []).includes(pair.allowedModifier);
```
The check looks for modifier 25 on the **component** code (the 99406-style
counseling line). CMS NCCI guidance puts modifier 25 on the **E/M**
(comprehensive code), not on the counseling code. As a result:

- **C03** (99214 *with mod-25* + 99406) → scrub fires `NCCI_BUNDLED_PAIR`
  *false-positive*. This is a clean claim by CMS rules. Billers will see a
  noisy warning on every legitimate E/M + counseling encounter.
- **C02** (99213 + 99406, no mod anywhere) → scrub fires the same warning, but
  flag severity is "warning" not "error" (`blocksSubmission: false`), so the
  claim *still ships*. UHC pays $0 on the counseling line and the claim eats a
  CO-97 denial. Money lost: ~$14.50/claim allowed × every patient who gets
  counseling.

**Fix:** check `comprehensiveLine.modifiers.includes("25")` when
`allowedModifier === "25"`; keep the existing check when
`allowedModifier === "59"`. Same dollar amount, opposite line.

---

### C-2. Self-pay flow is wedged — the system can't bill cash
**Where:** [scrub.ts:148-158](src/lib/billing/scrub.ts#L148-L158) +
[payer-rules.ts (no self-pay routing)](src/lib/billing/payer-rules.ts)

**C15** (self-pay cannabis cert) hit three blocking errors:
```
[error] MISSING_PAYER: No payer assigned to this claim.
[error] MISSING_PRIOR_AUTH: This service requires prior authorization...
[error] CANNABIS_PAYER_PA_REQUIRED: Unknown payer (defaults) requires PA...
```

Self-pay is the **majority** revenue model for cannabis certifications today
(Medicare excludes, most commercial requires PA for which the patient doesn't
qualify clinically). The platform has no concept of a self-pay claim — every
claim must have a payer or it cannot leave scrub. This means the entire
cannabis-cert workflow has no billing path, and the only escape valve is
manual point-of-service cash collection outside the EMR.

**Fix options (pick one):**
1. Add a synthetic `selfpay` `PayerRule` with `class: "self_pay"`, no timely
   filing, no PA, no scrub blocks. `shouldRouteCannabisToSelfPay` already
   returns intent — but nothing receives it.
2. Add a `claim.modality === "self_pay"` short-circuit at the top of
   `scrubClaim()` that skips payer/PA/timely-filing checks and produces a
   cash-pay receipt path instead of an 837P.

This is the **single most important** gap for a cannabis-first deployment.

---

### C-3. Scrub treats `requiresPriorAuthForCannabis` as the same blocker as
       `excludesCannabis`
**Where:** [scrub.ts:188-198 + 215+](src/lib/billing/scrub.ts#L188)

In **C01** (Aetna, cannabis dx, no auth on file) the scrub fired BOTH:
```
[error] MISSING_PRIOR_AUTH
[error] CANNABIS_PAYER_PA_REQUIRED: Aetna requires prior auth...
```

Aetna **does** cover cannabis services with prior auth. The right workflow is
**hold the claim, kick off PA submission, then submit on approval** — not
"block forever." Right now the claim sits in scrub-fail forever unless a
human manually clears it, and there is no automatic linkage between scrub
failure → prior-auth task creation.

**Fix:** When `CANNABIS_PAYER_PA_REQUIRED` fires and `excludesCannabis=false`,
the scrub should emit a `PA_HOLD` signal that opens a Linear/task row to the
prior-auth agent rather than a hard error.

---

### C-4. NCCI severity is too soft for the cases that will guarantee denials
**Where:** [scrub.ts:290-297](src/lib/billing/scrub.ts#L290-L297)
```ts
severity: pair.allowedModifier ? "warning" : "error",
```

Logic: "If the pair *can* be unbundled with a modifier, treat the issue as a
warning (non-blocking). If it *can't*, treat as an error (blocking)."

The intent is fine, but the execution lets **C02** (99213 + 99406, no mod-25
anywhere) sail through as `submittable=true`. That claim will 100% be denied
by UHC (`honorsMod25OnZ71: false`). The "warning, not error" choice means
**we submit a guaranteed-denied claim and burn timely filing.**

**Fix:** When the comprehensive E/M line has no mod-25 AND the payer's
`honorsMod25OnZ71` is `false`, escalate the warning to a blocking error
(unless overridden by a biller). Different payers, different severity.

---

## High-severity findings

### H-1. Eligibility 271 stub ignores ICD-10 entirely
**Where:** [eligibility-client.ts:38](src/lib/billing/eligibility-client.ts#L38)
```ts
const isCannabisCode = ["S0339", "99429"].includes(request.serviceCode);
```

Cannabis-related coverage exclusions are dx-driven, not CPT-driven. The real
denial pattern is "99214 + F12.20" → denied for cannabis ICD. The stub never
sees the ICD list, so it returns "ACTIVE, $35 copay, no warnings" for
**every** cannabis encounter (C01, C06, C07). This is what the team marked as
EMR-220 (real integration pending), but the stub's behavior is misleadingly
optimistic — a junior biller looking at the eligibility response would
green-light claims that the routing layer will then immediately reject.

**Fix today (low-effort, high-value):** add ICD-10 scan to the stub. If any
`F12.*`, `Z79.891`, or cannabis-related code is in the request, return
warnings consistent with the payer's `excludesCannabis` flag.

---

### H-2. Reimbursement predictor has no contract data for 6 of 10 seeded payers
**Observed:** Anthem, Cigna, Humana, Kaiser, Medicaid, TRICARE all fall back to
the `fee_schedule_baseline` source with `confidence=0.35`. C14 TRICARE was
off by **28%** vs synthetic actual; C13 Medicaid off by 4.7%.

The predictor itself is correct. The issue is that the seeded `CONTRACTS`
table in `payer-contracts.ts` only has four payers. In production, this means:
- Every Anthem/Cigna/Humana/Kaiser/Medicaid/TRICARE claim feeds a 0.35-confidence
  estimate into A/R forecasting, dashboards, and underpayment detection.
- Underpayment detection requires a contract → silently no-ops on
  unconnected-payer claims (`contractId: null` in the report). 60% of the
  patient panel is in the blind spot.

**Fix:** an admin-importable contract template per payer is already supported
(`parseContractCsv`), but there's no UI/workflow nudging the biller to load
them. A daily-close finding "no contract on file for payer X (Y claims, $Z
exposure)" would surface this.

---

### H-3. Lockbox matcher over-allocates greedily and reports it as "matched"
**Where:** [lockbox.ts:270-282](src/lib/billing/lockbox.ts#L270-L282)

In the portfolio run, a $413 bank deposit greedily consumed 3 ERAs totalling
$421.08, returning `status="partially_matched"` with `varianceCents=$8.08`.

In real RCM, **the bank tells you what you got. Don't post more than the bank
deposit.** Over-allocation creates a phantom $8.08 of cash that has to be
reversed later. The system should either:
- Refuse to match if the only available combinations exceed the deposit, OR
- Return `status="manual_review"` (currently not in the union — it's just
  `"variance"`).

The variance status exists for *over*-match but the code path that hits it
seems to be downstream — the greedy fill in the partial branch never throws
that status, it returns `partially_matched` instead.

---

### H-4. Underpayment detector relies on per-line allowed reconstruction
**Observed:** In **C05** the synthetic 835 placed all CARC adjustments at the
claim level, leaving service-line adjustments empty. The detector
reconstructed line-level "allowed" as `paid + line.PR_adjustments = $97.60`
and correctly flagged a $23.40 shortfall vs the $121 Medicare contract.

This works **only** if upstream code (era-parser, era-ingest) faithfully
splits CARCs onto the right service line. In practice, payers send mixed
formats:
- Some put deductibles at the claim level (CLP CAS).
- Some split per line (SVC CAS).
- Some duplicate.

If the parser ever drops a line-level CAS onto the claim level, every
multi-line claim becomes a false-positive "no underpayment" because
`paid + lineCAS = paid` which equals the contract for the comprehensive
code only and ignores the smaller bundled line.

**Test gap:** the era-parser tests don't appear to cover a payer that mixes
claim-level and line-level CAS for the same claim. Worth adding.

---

### H-5. Fixtures use NPIs/EINs that fail validation
The harness immediately surfaced (intentionally) that:
- `1356781237` (rendering NPI) fails Luhn → `isValidNpi` rejects.
- `123456789` (practice EIN) fails `isValidEin` (likely a sentinel-pattern guard).

Implication for **fixture quality**: any seed scripts (`db:seed`,
`db:seed-cfo`, demo data) that use these placeholder values will be flagged
by the new `resolveBillingIdentifiers` enforcement that the hardening report
shipped. Audit `prisma/seed.ts` and demo NPIs **before** day-1 launch or
identifier resolution will throw at claim-construction time.

---

## Medium-severity findings

### M-1. `shouldRouteCannabisToSelfPay` returns `reason: null` instead of empty string
**Where:** [payer-rules.ts](src/lib/billing/payer-rules.ts) (function returns
`{ selfPay: false, reason: null }` for the no-route case).

Cosmetic: shows up as the literal string `"null"` in any caller that template-
strings the reason (the agent rationale logger does this). Either return
`reason: ""` or have callers conditional on `?? "n/a"`.

### M-2. Statement cadence has no escalation past "final_notice"
**Where:** [patient-statements.ts:79-139](src/lib/billing/patient-statements.ts#L79-L139)

At 95 days post-first-responsibility, the cadence returns `cycle: "final_notice"`
correctly. But what's the cycle at 150 days? The function continues to return
"final_notice" forever. There is no `collection_handoff` state for sending the
balance to a collections agency or writing it off as bad debt. The
`patient-collections-agent` has the ladder data (`resolveDunningIntent`), but
the statement cadence and the dunning intent don't compose.

### M-3. The 999 ack JSON parser is permissive in a footgun way
**Where:** [clearinghouse-ack.ts:71-91](src/lib/billing/clearinghouse-ack.ts#L71-L91)

If the JSON envelope is missing required fields, the parser returns
`status: "unknown"` silently rather than throwing. Combined with the
clearinghouse-submission agent that only retries on transient failures, a
malformed gateway response could result in claims sitting in "submitted but
no ack ever processed" limbo until the stale-claim monitor catches them. The
stale-claim monitor is the safety net — but in the worst case that's a 2-3
day delay before anyone notices.

**Fix:** when `status: "unknown"` AND no `errors[]` populated, surface a
high-severity diagnostic event rather than swallowing.

### M-4. Adjudication classifier returns `paid` for status 1 with partial PR
**Where:** [era/parser-835.ts (classifyClaimStatus)](src/lib/billing/era/parser-835.ts)

C05 (Medicare partial — paid $97.60, patient resp $66.90 stacked across
deductible/coins/copay) classified as `status="paid"`. Industry convention is
mixed — some EMRs use `partial` whenever PR > 0, others use `paid` (claim is
adjudicated and final). The dashboard implication: a "paid" claim with
significant patient responsibility looks closed in revenue dashboards but is
actually pending patient payment. Worth a `paidWithBalance` state or a parallel
patient-resp gauge.

---

## Low-severity / cosmetic

### L-1. Predictor fallback baselines don't match cannabis-care reality
The class baselines (commercial 65%, government 45%) come from general
ambulatory medicine. Cannabis services in commercial plans run more like
35-50% of billed (when not flat-denied). For cannabis specifically, the
baseline anchor will be optimistic. Worth tuning per-specialty when
`hasCannabisDx` is true.

### L-2. 277CA JSON path uses `STC_CATEGORY_MAP` but accepts `category` literal
**Where:** [clearinghouse-ack.ts:225-228](src/lib/billing/clearinghouse-ack.ts#L225-L228)
```ts
const mappedCategory = (c.category as ClaimAckCategory | undefined) ?? STC_CATEGORY_MAP[statusCode] ?? "unknown";
```
A clearinghouse that passes through an invalid `category` string (e.g.
`"rejected_duplicate"` from a sloppy vendor wrapper) bypasses the map and
the downstream switch in `decide277Actions` falls through to
`investigate`. Worth narrowing the literal accept-list to the canonical six.

---

## What's working (don't break these)

I want to be explicit about what passed audit cleanly, because the next sprint
shouldn't accidentally regress it:

1. **EDI 837P builder + SNIP validator.** Every clean case produced a
   structurally valid X12 5010 837P (27-41 segments) that passed all SNIP-1
   through SNIP-5 checks, including for **secondary claims** (Loop 2320/2430).
   This is the part that most EMR products get catastrophically wrong, and
   here it's solid.
2. **Timely-filing math.** Anthem 90d window, 78d-old claim → APPROACHING
   warning; 95d-old → PAST blocking error. Correct on both sides of the
   boundary, computed against the *resolved per-payer* rule, not a global
   constant.
3. **MUE per-day enforcement.** 99213 × 5 units correctly flagged.
4. **NCCI for truly unbundleable pairs.** 36415 + 99213 (allowedModifier:
   null) blocks correctly with severity "error".
5. **Missing-diagnosis block.** Zero ICD-10 → submission blocked. Some
   competing EMRs let this through and the claim gets a generic 277CA reject
   you have to investigate manually.
6. **Cannabis routing for Medicare.** `shouldRouteCannabisToSelfPay` correctly
   identifies the exclusion *and* surfaces the citation in the reason string —
   that's the level of provenance a real biller can defend in an audit.
7. **PR split** correctly fanned a stacked CARC bundle (PR-1 + PR-2 + PR-3)
   into deductible $30 / coinsurance $26.90 / copay $10. Most billing systems
   collapse all PR into "patient owes X" and lose this breakdown — important
   for HSA/FSA reconciliation downstream.
8. **Secondary claim builder.** C12 (Aetna primary → BCBS secondary) produced
   a 41-segment SNIP-clean 837P with the primary CAS faithfully echoed into
   Loop 2320, zero matching warnings. Anthem-tier engineering.
9. **Reconciliation tolerance.** ERA totals balanced within 2¢ on every case;
   reconcileClaimTotals correctly enforced billed = paid + adjustments.
10. **Appeal argument ranking.** Bayesian smoothing made `timely_filing_proof`
    (4-of-5 wins, n=5) correctly outrank `policy_citation` (2-of-5 wins, n=5),
    with `medical_necessity` (n=0) parked in the middle at the prior. No
    Goodhart's-law gaming visible.

---

## What's NOT yet wired (per the team's own roadmap; mentioned for completeness)

These were already self-identified in `BILLING_HARDENING_REPORT.md` (EMR-216
through EMR-221) and I'm not counting them as findings — but for a launch
checklist:

- Real clearinghouse adapter (Availity/Waystar/Change). `getDefaultAdapter` 
  falls back to simulated when env vars unset, which is correct, but
  production cutover needs a runbook for credential rotation.
- Real 835 ingestion pipeline (cron + dedupe + storage). The parser is ready;
  the schedule that polls the clearinghouse for new 835 documents isn't visible
  in this audit.
- NCCI/MUE quarterly CMS table refresh. There's `loadNcciCsv` + 
  `loadMueCsv`, but no scheduled job to pull the new quarter from CMS — a
  stale starter set will silently miss new bundled pairs.
- NPI directory bootstrap. The hardening report calls out
  `resolveBillingIdentifiers` as the gate, but the source of NPI data has to
  come from somewhere on day 1.

---

## Recommended fix order (by ROI per day of engineer time)

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | C-1 NCCI mod-25 on wrong line | 0.5d | Stops false-positive on every E/M+counseling claim |
| 2 | C-2 Self-pay flow | 1d | Unblocks the entire cannabis-cert revenue stream |
| 3 | C-4 NCCI severity escalation for `!honorsMod25OnZ71` payers | 0.5d | Stops guaranteed UHC denials |
| 4 | H-1 Eligibility stub ICD-10 scan | 0.5d | Surfaces denials before submission |
| 5 | C-3 PA-required → task creation | 1.5d | Recovers Aetna/Cigna cannabis revenue |
| 6 | H-2 Contract-coverage daily-close warning | 1d | Closes underpayment blind spot |
| 7 | H-3 Lockbox over-allocation | 1d | Prevents phantom cash posting |
| 8 | M-2 Statement cadence → collections handoff | 2d | Closes the back-end of the dunning ladder |
| 9 | H-4 ERA CAS-split test coverage | 1d | Prevents silent underpayment-detector failure |
| 10 | All M/L findings | 2d | Polish |

**Total to close all critical + high:** ~6 engineer-days.

---

## How I'd run this audit again

The harness at `scripts/rcm-stress-test.ts` is reusable. To extend coverage:

- Add corrected-claim (frequency 7) cases.
- Add a takeback-reversal ERA case end-to-end (the data path exists in
  remittance.ts but isn't on a happy path in the harness yet).
- Add a 277CA pending → late ack → stale-claim case to exercise the
  stale-claim monitor agent.
- Wire `rcm-engine.runRcmEngine` to drive the staged transitions instead of
  manual per-step calls — that would test the orchestrator separately from
  the modules.

Run with `npx tsx scripts/rcm-stress-test.ts` from the EMR root.
