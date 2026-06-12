# Dr. Patel Chart Revisions — Build-Out Gap Map

> **Source:** `LeafJourney Clinician Patient Chart (Clinical Side) Revisions` (Dr. Patel's living Google Doc, 148K chars / 17 page surfaces).
> **Generated:** 2026-06-10 from a 16-agent automated audit (one agent per surface) that diffed every verbatim directive against the live code.
> **What this is:** the actionable backlog for taking the revision doc down. Each gap below is a real diff between what Dr. Patel asked for and what ships today.

## Headline

**525 discrete directives** across 16 implemented surfaces:

- ✅ **240 done** (46%) — already meets the directive's intent
- 🟡 **154 partial** (29%) — exists but doesn't fully match (wrong label, missing sub-behavior, stub data)
- ⬜ **131 missing** (25%) — no implementation found

**Bottom line:** the chart is ~46% built to this doc. The remaining 54% is genuine revision + new-build work — far more than one night for *all* of it, but the front page and the high-value, low-risk gaps are very achievable. The heavy regulatory builds (live eRx/EPCS, RxNorm, renal/pediatric/oncology dosing engines, wearable/RPM pipelines, LeafAnatomy) are multi-week items flagged below — **do not** let "build the whole doc" silently ship stubs for those.

## ✅ Shipped 2026-06-10/11 (session 1 — all typecheck-clean)

~55 directives closed across 14 surfaces in one session via a front-page hand-build + three parallel "safe-gap" sweeps. Highlights:

- **Main front page:** sticky compact patient strip on scroll (name · age,sex · phone · email · 💊Rx) + fixed tab bar · large **Prescribe (Rx)** button → `/prescribe` · **Prepare for visit → "Ask Cindy (AI Helper)"** · grab-cursor → pointer · Demographics hover → 1-2 pertinent facts · **"Financial cockpit" → "Billing"** tab · Notes hover → "N notes / N attestations pending" · Correspondence hover peek removed.
- **Prepare / Cindy:** Cindy-branded idle copy · "Patient briefing" → **"Patient's Story"** · "Start visit with briefing" → **"Start Visit"** · risk-flags expand · Step-6 → "Cindy is at work!" · Intelligence Details red/yellow/green stratification + dynamic symptom-trend coloring.
- **Open Tasks:** 48-hour reappear timer · collapse/expand toggle · message rows → `/clinic/messages` · **unsigned abnormal labs** now surface as "Review abnormal {panel}" result rows (Patel: "include reviewing labs").
- **Decision Support:** green high-contrast Acknowledge + beige Dismiss · section collapse · **persisted acknowledgements** — new `CdsAcknowledgement` Prisma model (keyed by a stable `<category>::<title>` alertKey, since alert ids are volatile), `loadActiveCdsAcks`/`acknowledgeCdsAlert` server actions, 30/60/90-day snooze-by-severity so sign-offs survive reloads. **Critical alerts can't be dismissed and require a written justification** (modal, ≥10 chars, attributed to the authenticated user — no fake password gate, since Clerk auth has no in-app password to verify). Table pushed live via `db push`. Plus a **drug-allergy cross-reference** — the documented allergy profile now feeds `generateCDSAlerts`, flagging any active med that matches an allergy by exact name or drug family (penicillin→amoxicillin, sulfa, NSAID, etc.) as a critical (exact/severe) or warning (family) alert, reusing the tested `crossReferenceWithMedications`.
- **Demographics:** phone-above-email · USPSTF in-app webview modal + attribution.
- **Memory:** "notable" severity retired · emoji-only trend-bubble toggle.
- **Records:** dual-bubble modality+body-part · Save→real download · per-subtab search · Send compose modal · e-signed type filter.
- **Labs/Scores/Vitals:** tile/list toggle · clickable source filters · send composer · in-page split-pane (assessments + labs) · date/panel sort toggle.
- **Rx:** active/inactive view dropdown.
- **Images:** DICOM date MM-DD-YYYY · share/💡 by the viewer header · 3-5 bullet "Cindy Sees" · imaging-only uploads.
- **Voice-chart:** transcript speaker colors + capitalized sentence starts.
- **Billing:** "Billing" eyebrow · "Out-of-Pocket Max" · "Cindy says:" · clickable patient name · sent=green · ACH/Bitcoin payment fields · collapsible statement tiles.
- **Prescribe:** the one-screen redo (Medication left / Dosing+Notes right, dropdown+freehand dose/unit/freq/days, pharmacy popup, preview modal) was **already built** (EMR-883..893); this session added the two remaining safe diagnosis gaps — **collapsible + optional Diagnosis** section and an **ICD-10 freehand typeahead** (`src/lib/clinical/icd10-common.ts`, ~140 curated codes; "M54" → M54.5/M54.2/M54.9; also accepts any free-typed code) feeding the existing `diagnosisCodes` the action persists. *(DAW / PRN-reason intentionally skipped — the server action doesn't read them, so UI-only would be hollow.)*

**Deferred (need their own scoped pass — NOT silently stubbed):** the big rocks above, plus voice-chart save-as-draft + password finalize, Tasks/CDS-as-ribbon-tabs (an information-architecture decision), and Rx schema items (real ICD-10 + pharmacy fields, dose-log emoji persistence). *(Decision-Support critical-gating + persisted acknowledgements — shipped this session, see above.)*

## ✅ Shipped 2026-06-11 (session 2 — billing interactivity, no schema)

The billing surface's "best value/effort" interactivity targets, all typecheck-clean (sentinel-verified on `page.tsx`), eslint-clean, with a unit-tested pure helper:

- **Clickable balance + breakdown metrics → trend drill-down popups.** Total balance, Patient due, Insurance pending, Overdue (BalanceLines) and Copay collected, Patient responsibility (MiniStats) are now clickable, opening a month-to-month **cumulative graph** popup with **search + time-range (3/6/12mo/all) + min-amount filters** over the contributing activity. The trend is reconstructed from the patient's full `FinancialEvent` ledger via `buildMetricTrend` (`src/lib/domain/billing-metric-trend.ts`), where each event type's contribution to each metric is defined **explicitly** (direction × |amount|) so the running total is correct by construction — not a stub. **Deductible applied** uses a fill bar (met / total / remaining) since it's payer-reported, not event-derived. Covers ~7 directives. *(New: `metric-drilldown.tsx`, `billing-metric-trend.ts` + `.test.ts`.)*
- **Interactive Encounter Financial Timeline.** Replaced the static table with `FinancialTimeline` (`timeline.tsx`): **sortable column headers** (date/charge/insurance/adjustment/patient/balance/status), **clickable rows → claim-detail popup** (claim #, CPTs, full money breakdown, payments posted, and a **lifecycle trail** — created → submitted → denied/reimbursed → closed — built from the claim's real `submittedAt/paidAt/deniedAt/closedAt` timestamps + `denialReason`), and a **History toggle** that hides resolved/closed claims by default and reveals them on demand. Covers ~5 directives.
- **Payment Plan "Adjust" button** (active-plan card). Dialog to re-level the **installment price**, **frequency**, **autopay**, and **patient reminder cadence**, with a live updated-schedule preview. Real persistence: new `adjustPlan` engine fn (`src/lib/billing/payment-plans.ts`) + `adjustPaymentPlanAction` (org/patient-scoped, audit-logged) — reuses the $50–$500 / 3–24-installment limits, re-computes `numberOfInstallments`, and reschedules `nextPaymentDate` when cadence changes. Reminder cadence persists as a structured `REMINDER:` note tag (same convention as the engine's `MISSED:`/`PAUSED:` — no schema change). New pure helpers `computeAdjustedInstallmentCount` / `upsertNoteTag` / `parseNoteTag` are unit-tested. *(New: `payment-plan-adjust.tsx`.)*
- **Statement Print/Share + Financial Event Log section collapse.** Each statement tile now has always-visible **Print** (opens the existing branded printable invoice route `invoice/[statementId]`) and **Share** (copies an absolute invoice link; falls back to opening the invoice when the Clipboard API is unavailable) icons — restructured so they sit beside the expand toggle, not nested inside it. The Financial Event Log is now **collapsible at the section level** (`EventLogSection`), not just paginated within. *(Email/text statement delivery deferred — needs the `deliverMessage` messaging pipeline + patient-contact/PHI handling, its own pass.)*

> **UI pattern note (EMR-1125):** these + the whole billing surface (Enroll/Verify/Collect) use `ModalShell` popups. The new "Fleet Command" **no-popup rule** (CLAUDE.md) wants slide-out drawers / inline expanding rows for sub-workflows. **Owner decision: land the modal versions now** for consistency with the existing surface; convert the surface's popups → drawers in one dedicated **EMR-1125** pass (needs a net-new Drawer primitive — none exists yet). Do NOT drawer-ify these piecemeal.

**Still open on billing (own pass):** Generate Tax Documents (1099/W9) + email/save-to-Correspondence (M, regulatory), payment-method completions (ACH routing/account fields, Bitcoin wallet, Print/Save invoice, cash/check → Correspondence — PCI-sensitive), Insurance **Directory** + click-to-call (telephony), statement/event-log **email/text delivery** (needs `deliverMessage` pipeline), "Cindy suggests" reimbursement-probability AI panel.

## Surface scorecard

| Surface | Total | ✅ Done | 🟡 Partial | ⬜ Missing |
|---|--:|--:|--:|--:|
| main-front-page | 38 | 17 | 13 | 8 |
| voice-chart | 26 | 10 | 8 | 8 |
| prepare-for-visit-cindy | 44 | 10 | 18 | 16 |
| open-tasks | 8 | 2 | 3 | 3 |
| decision-support | 16 | 1 | 2 | 13 |
| demographics | 48 | 27 | 12 | 9 |
| Memory Tab | 35 | 25 | 7 | 3 |
| notes | 4 | 1 | 3 | 0 |
| records | 28 | 17 | 7 | 4 |
| labs-scores-vitals | 46 | 21 | 12 | 13 |
| rx-front | 52 | 30 | 16 | 6 |
| prescribe | 68 | 32 | 18 | 18 |
| private-notes | 3 | 1 | 2 | 0 |
| correspondence | 30 | 19 | 5 | 6 |
| images-leafanatomy | 25 | 13 | 10 | 2 |
| billing | 54 | 14 | 18 | 22 |
| **TOTAL** | **525** | **240** | **154** | **131** |

## Legend

`[STATUS · EFFORT · risk]` — **EFFORT**: S (<30min edit) / M (a few hrs) / L (large, multi-file or new subsystem). **risk**: low / med / high (high = clinical-safety or data-integrity sensitive — prescribing, allergies, CDS gating, attestations).

## 🔴 Big rocks — NOT one-night builds (need explicit scoping)

These appear in the doc but are full subsystems. They should be their own scoped projects, not folded into a "tonight" sweep:

- **Live eRx pipeline** — RxNorm/RxCUI/NDC drug DB, NCPDP SCRIPT v2023011 XML, Surescripts transmission, CancelRx/RxRenewal/RxChange/RxFill, EPCS (PDMP query + MFA crypto-signing + DEA audit). *(prescribe)*
- **Specialty dosing engines** — pediatric weight-based, renal (Cockcroft-Gault), oncology BSA/cycles, OB/GYN teratogen gate, REMS, compound mode, titration/taper sig builder. *(prescribe)*
- **LeafAnatomy** — Disney/Pixar-grade interactive layered anatomical model + DICOM atlas registration. *(images)*
- **Wearable / RPM / CCM ingestion** — QR + Web Bluetooth pairing, Apple Health/Fitbit/Oura/CGM, remote phone submission, de-identified LeafNerd export. *(labs, prepare, demographics)*
- **Insurance/payer real-time** — eligibility (RTPB v13), card OCR scan, payer directory + click-to-call telephony, tax-doc (1099/W9) generation. *(demographics, billing)*
- **Persisted CDS acknowledgements** — Prisma model + 30–90 day snooze by severity (today it's React state / localStorage only). *(decision-support, memory)*

## Gaps by surface

### main-front-page  ·  17✅ / 13🟡 / 8⬜

- **[MISSING · S · risk:med]** PMH and PSH subsections placed within the main Patient Chart dossier card (not just in the Demographics tab)
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — MedicalHistoryManager exists but only in DemographicsTab content. Directive places PMH/PSH as subsections of the sticky Patient Chart dossier card visible from any tab.
- **[MISSING · L · risk:low]** Right-click on a tab opens context menu with side-by-side split-pane view option (two panes, closeable with X)
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — No right-click context menu on tabs exists. No split-pane/side-by-side view is implemented anywhere on this page.
- **[MISSING · M · risk:low]** When scrolling down, Patient Chart dossier collapses but keeps name, age, sex, phone, email, and Rx emoji button fixed above the tab bar
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — No scroll-triggered collapse of the dossier card exists. No compact sticky header with name/age/sex/phone/email/Rx button is implemented anywhere.
- **[✅ LANDED 2026-06-10 · S · risk:low]** Add a large Rx emoji button below the Voice chart/Prepare for visit/Start visit buttons linking to /prescribe
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Action area has Voice chart, Prepare for visit, Start visit, Download, Print, MessageDock — no large dedicated Rx button. The FloatingActionMenu FAB has an Rx item but is not the specified location.
- **[✅ LANDED 2026-06-10 · S · risk:low]** Rename 'Prepare for visit' button to 'Ask Cindy (AI Helper)'
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Button still reads 'Prepare for visit' (line 852). No 'Ask Cindy' label anywhere in the action bar.
- **[PARTIAL · L · risk:high]** Right-click medication 'View' popup: patient info, pharmacy info (NCPDID/State Lic/DEA/NPI/address/tel/fax), prescriber info (DEA/NPI/address/tel/fax), medication info (dose/SIG/product code/qty/days supply/refills/last refill), + 2-line patient summary
  - `src/app/(clinician)/clinic/patients/[id]/current-medications-card.tsx` — Right-click shows only Renew/Edit/Discontinue — no 'View' option. No popup with pharmacy (NCPDID, DEA, NPI, fax), prescriber (DEA, NPI, fax), or full SIG/product-code/qty/days-supply detail.
- **[PARTIAL · S · risk:med]** Medications subsection shows name, dose, frequency, last refill; scrollable; left-click navigates to ?tab=rx
  - `src/app/(clinician)/clinic/patients/[id]/current-medications-card.tsx` — Card shows name + dosage (no frequency or last-refill fields in Med type or display); is scrollable; left-click opens a detail modal instead of navigating to ?tab=rx as specified.
- **[PARTIAL · M · risk:low]** Charting timer resets every 24 hours and feeds a LeafNerd analytics-lab stat for time-in-chart per provider
  - `src/app/(clinician)/clinic/patients/[id]/charting-timer.tsx` — Timer anchors to encounter startedAt with no 24-hour wall-clock reset; no analytics-lab / LeafNerd data emission exists — benchmark display is present but data is not stored or surfaced to LeafNerd.
- **[PARTIAL · M · risk:low]** Tab bar is fixed on page (does not scroll away), styled like Chrome tabs under the Patient Chart header
  - `src/app/(clinician)/clinic/patients/[id]/chart-frame.tsx` — ChartFrame renders tabs in normal page flow (flex-col). No CSS position:sticky or fixed exists — the tab bar scrolls away with the page.
- **[PARTIAL · M · risk:low]** Tasks and Clinical Decision Support as tabs on the ribbon, with red notification badge (count) on Tasks; both moveable
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — TABS array has no 'tasks' or 'cds' entries. Tasks and CDS exist as inline cards above the tab frame, not as routable ribbon tabs. Red badge on Tasks tab is absent.
- **[PARTIAL · M · risk:low]** Phone-click opens popup with real AI voice-recording transcription; copy script and create correspondence text
  - `src/app/(clinician)/clinic/patients/[id]/header-contact.tsx` — Phone modal exists with transcript and copy/log buttons, but transcript is pre-scripted fake dialogue — not real AI voice recording/transcription. No actual speech-to-text integration.
- **[✅ LANDED 2026-06-10 · S · risk:low]** Change tab cursor from grab-hand to regular pointer that can also indicate drag
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — Tab links still use 'cursor-grab active:cursor-grabbing' (line 368). Dr. Patel explicitly asked to replace the grab-hand cursor with a regular cursor.
- **[PARTIAL · S · risk:low]** Care Plan section moved from Demographics tab into a Clinical Decision Support tab in the ribbon
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — CarePlanSection lives inside DemographicsTab. No CDS ribbon tab exists — CDS is a floating CDSPanel card above the tab bar, not a dedicated tab with the Care Plan content inside it.
- **[PARTIAL · S · risk:low]** Patient avatar photo synced / linked from /portal/profile
  - `src/app/(clinician)/clinic/patients/[id]/patient-avatar.tsx` — PatientAvatar supports upload via AvatarUpload but does not sync or link from the patient portal profile at /portal/profile.
- **[PARTIAL · S · risk:low]** Hover over a Demographics tab shows 1-2 pertinent clinical facts (not a list)
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — Hover peek shows 3 separate DOB/email/phone list rows on Demographics — not a tightly composed 1-2 line clinical summary as directed.
- **[PARTIAL · S · risk:low]** Care Plan box in Patient Chart dossier covering: Care Plan, Presenting Concerns, Treatment Goals, Preventative Screenings Due, Working Towards
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Presenting Concerns and Treatment Goals are in CarePlanSection (Demographics tab). ScreeningsPanel is a separate card. 'Working Towards' field is absent. These are fragmented across cards rather than unified in one Care Plan box in the dossier header.
- **[PARTIAL · S · risk:low]** If two-row tab bar exists, all tabs line up properly
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — Horizontal tabs use 'flex-wrap' with min-w-[160px] per tab which biases toward two rows, but there is no explicit grid alignment to guarantee rows snap cleanly in all viewport sizes.

  **Top build targets (best value/effort):**
  1. Sticky/fixed dossier strip on scroll — name, age, sex, phone, email, Rx button — plus fixed tab bar (affects every chart open, zero-risk build)
  1. Tasks and CDS ribbon tabs with red badge on Tasks; move Care Plan content into CDS tab
  1. Large Rx emoji button + rename Prepare for visit to Ask Cindy (AI Helper) — single-file, small effort, high visibility
  1. Medication card: add frequency + last-refill fields, fix left-click to navigate ?tab=rx, add 'View' right-click with pharmacy/prescriber/SIG detail popup (clinical-safety risk for prescriber/pharmacy data accuracy)
  1. Charting timer 24-hour wall-clock reset + LeafNerd analytics-lab emission
  1. Right-click tab context menu with side-by-side split-pane view — large build but a headline Dr. Patel workflow feature

### voice-chart  ·  10✅ / 8🟡 / 8⬜

- **[MISSING · S · risk:high]** Finalize modal must include a 'provider password' free-text input field before sign-off
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Sign-off modal (line 1574) has Cancel/Sign & Finalize buttons but no password input field; directive requires provider password as a legal-binding confirmation gate
- **[MISSING · M · risk:med]** 'Save' button must save note as a draft to provider's inbox (linked to /clinic/sign-off), not finalize
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — No 'Save' (draft to inbox) path exists; only Sign & Finalize is offered; saveAndFinalizeNote immediately finalizes the note rather than creating a draft in the sign-off queue
- **[MISSING · M · risk:med]** 'Extend' / 'Redo' summary controls for Assessment, Plan, Subjective, and Follow-Up boxes
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — No extend/redo controls exist on any section card; blocks are editable via textarea but no AI-driven regeneration or extension of individual sections is implemented
- **[MISSING · M · risk:med]** Follow-Up section must include structured sub-fields: next steps, preventative measures, labs to order, med changes (increase/decrease/stop/add), when to return (1 week/1 month/3 months)
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Follow-Up is a single free-text textarea populated by AI body text; no structured sub-fields for labs, med adjustments, return interval are rendered or enforced
- **[MISSING · M · risk:med]** 'Open in note editor' button must navigate to an APSO-formatted editable note view where every section can be edited before finalizing
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — handleOpenNote() (line 855) is defined but never attached to any rendered button in JSX — it's dead code; the note editor it routes to (/notes/[noteId]) may not render APSO format
- **[MISSING · M · risk:low]** Transcript must be exportable via email, print, and fax
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — No export controls exist in the transcript accordion; email/print/fax actions are entirely absent
- **[MISSING · S · risk:low]** Transcript: every timestamp segment must start with a capitalized complete sentence (no continuation sentences across timestamps)
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Transcript rendering (line 1556) displays raw segment text with no capitalization enforcement or sentence-boundary validation
- **[MISSING · S · risk:low]** Transcript: highlight patient vs. provider speaker labels in different colors for visual separation
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Speaker label spans (line 1561) use a single class 'text-text-muted' for both patient and clinician; no per-speaker color differentiation is applied
- **[PARTIAL · M · risk:med]** Concerns block must show a 2-line AI-generated summary of the full medical chart (main issues, main meds, etc.)
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/page.tsx` — page.tsx passes raw presentingConcerns string from the patient row; no full-chart synthesis (medications, diagnoses, allergies) is assembled or passed to VoiceRecorder
- **[PARTIAL · M · risk:med]** Draft Note tab must render a properly formatted APSO or SOAP note (matching the Progress Note example), not a raw markdown textarea
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Draft Note tab (line 1429) shows a read-only markdown textarea concatenating section bodies; no APSO-formatted note layout matching the referenced progress note example
- **[PARTIAL · M · risk:med]** 'Ask Cindy' panel must generate AI-driven 5-10 bullet action plan from the actual visit transcript, not hardcoded recommendations
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Ask Cindy panel (line 1383) renders a hardcoded 3-item array of static cannabis dosing suggestions; no API call is made to generate per-visit recommendations from the transcript
- **[PARTIAL · S · risk:med]** Assessment box: AI must actively filter/remove subjective wording (stubborn, irritated, etc.) for objective clinical tone
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/actions.ts` — Tone selection via toneId shapes the prompt (line 144) but there is no post-processing filter or explicit prompt instruction to scrub subjective adjectives from the Assessment block
- **[PARTIAL · M · risk:low]** Waveform bars must sync with real mic audio, not random values
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — WaveformBars (line 371) drives bar heights via Math.random() on a 150ms interval — no Web Audio API AnalyserNode hookup to the live MediaStream
- **[PARTIAL · M · risk:low]** Volume meter (DecibelMeter) must detect real decibel level from the microphone; green/yellow/red color scheme
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — DecibelMeter component (line 447) simulates dB via Math.random() scaled by volume state — no real AudioContext/AnalyserNode connection to the live track
- **[PARTIAL · M · risk:low]** Section reordering must support drag-and-drop (not just up/down arrow buttons)
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — moveSection() (line 811) implements up/down arrow reorder; directive asks for 'reorganize them in any order' — arrows work but drag-and-drop is not implemented
- **[PARTIAL · S · risk:low]** Channels section naming: section must be called 'Channels'; Channel 1 = 'Patient', Channel 2 = 'Provider' with labeled toggle switches (on/off)
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Right panel is labeled 'Dual-Track Audio Mixer' (line 1092), not 'Channels'; channels are labeled 'Clinician Track' / 'Patient Track'; mute uses a button not a toggle switch
- **[PARTIAL · S · risk:low]** Plan box: replace 'the clinician'/'the provider' with actual clinician name from the encounter/user record
  - `src/app/(clinician)/clinic/patients/[id]/voice-chart/voice-recorder.tsx` — Replacement is done (lines 742-747) but hardcoded to 'Dr. Amelia Patel, MD'; should use the authenticated user's display name from the session/user record

  **Top build targets (best value/effort):**
  1. Finalize modal: add provider password field (high-risk legal gate, S effort)
  1. Save as Draft to sign-off inbox: add Save button path routing to /clinic/sign-off
  1. Extend/Redo per-section AI regeneration: adds per-block server action call to re-prompt the model
  1. Ask Cindy: wire to server action using live transcript/blocks instead of hardcoded array
  1. Transcript: speaker color highlighting and export (email/print/fax) — S effort, high user value
  1. Concerns block: fetch full chart summary (meds + diagnoses) and generate synthesized 2-line summary

### prepare-for-visit-cindy  ·  10✅ / 18🟡 / 16⬜

- **[MISSING · L · risk:high]** Step 4: supplement-drug AND supplement-cannabis interactions cross-checked (when cannabis module enabled)
  - `NEW` — No interaction-checking service or data source is invoked beyond LLM general knowledge.
- **[MISSING · M · risk:high]** Step 4: Cindy suggests new supplements (OTC, teas, Chinese/Ayurvedic) with structured format: name, dosing, frequency, timing, with/without food
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — No supplement recommendation logic, prompt instruction, or output schema field. BriefingResult has no supplementSuggestions field.
- **[MISSING · M · risk:med]** Risk Flags: follow-up flags (pending specialist appts, completed PT, overdue specialist visit, goals not met)
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Agent queries openTasks but does not query referral/consult orders, specialist appointment status, or patient portal goal adherence. Follow-up intelligence is absent from the deterministic path.
- **[MISSING · M · risk:med]** Green Flags: positive vitals/labs flags (BP decreasing consider reducing lisinopril; A1C improving; weight loss by choice; LDL down)
  - `NEW` — No positive vitals/labs flag logic or output field in the agent or UI.
- **[MISSING · M · risk:med]** Selected visit type loads the appropriate note template for voice chart or freehand entry
  - `NEW` — startVisitWithBriefing (actions.ts line 188) creates an encounter with reason='Visit' regardless of type; no template routing based on visit type.
- **[MISSING · L · risk:low]** Green Flags: pull positive data from wearables and CGM devices (step streaks, goal streaks)
  - `NEW` — No wearable/CGM data integration in the agent or schema.
- **[MISSING · M · risk:low]** 'Adjust' button next to '(last 30 days)' opening popup: 'Length of Trends' dropdown (30d/60d/90d/6mo/1yr + date picker) and 'Which Trends?' free-text/dropdown
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — No 'adjust' button or trend-customization popup exists. Trend window is hardcoded to 30 days in the agent.
- **[MISSING · M · risk:low]** Trend popup 'Which Trends?': free-text specific lab selection (GFR, Lipids, A1C, LFTs, TSH, Na, K, Fasting BG, UA, PSA, Vitamin D, etc.)
  - `NEW` — No lab-specific trend filter UI or backend capability; the agent does not query lab results at all.
- **[MISSING · M · risk:low]** Trend popup: 'Remote patient management' filter (BP, glucose, weight RPM types)
  - `NEW` — No RPM data is fetched or filtered; no RPM-specific filter UI exists.
- **[MISSING · M · risk:low]** NEW 'Green Flags' section above Risk Flags covering: med compliance, lifestyle wins, goal streaks, wearable achievements, vitals/labs improvements, completed specialist appointments
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — No Green Flags section exists in briefing-console.tsx, BriefingResult type, or the agent output schema. Entirely absent.
- **[MISSING · M · risk:low]** Green Flags: positive follow-up flags (completed specialist appointments, PT graduation)
  - `NEW` — No specialist appointment completion tracking or positive follow-up flags.
- **[MISSING · M · risk:low]** 'Start Visit' button is a dropdown with visit types: nurse visit, routine follow up, acute visit, wellness exam, history and physical
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Button is a single action with no dropdown. No visit-type selection exists anywhere on this surface.
- **[MISSING · S · risk:low]** Step 6 label renamed from 'Generating intelligence briefing via LLM' to 'Cindy is at work!'
  - `src/app/(clinician)/clinic/patients/[id]/prepare/actions.ts` — STEP_LABELS[5] on line 58 still reads 'Generating intelligence briefing via LLM'. Step log message on agent line 360 also unchanged.
- **[MISSING · S · risk:low]** Risk Flags: 'expand' button to reveal additional flags beyond initial display
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Risk flags list renders all flags with no expand/collapse affordance.
- **[MISSING · S · risk:low]** 'Patient briefing' section header renamed to 'Patient's Story'
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Eyebrow on line 544 still reads 'Patient briefing' not 'Patient's Story'.
- **[MISSING · S · risk:low]** Symptom Trends section dynamically colored green (positive direction) or yellow/red (negative direction)
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — No dynamic color mapping for Symptom Trends sections based on trend direction; rendering logic only checks generic priority enum.
- **[MISSING · S · risk:low]** 'Start with visit briefing' button renamed to 'Start Visit'
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Button on line 647 reads 'Start visit with briefing' — not renamed to 'Start Visit'.
- **[PARTIAL · M · risk:high]** Step 4 medications check: covers every medication, supplement, AND cannabis product; flags side effects and contraindications for all
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Active medications and cannabis regimens are pulled. Supplements are not a distinct queried entity. No cross-check engine for drug-supplement-cannabis interactions; risk flags rely on LLM general knowledge only.
- **[PARTIAL · M · risk:high]** Step 4: Cindy suggests medications/supplements/cannabis that could be cut or removed
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — LLM prompt includes adherence data and regimen list but has no explicit instruction to output removal candidates as a structured section.
- **[PARTIAL · M · risk:high]** Risk Flags: medication+supplement+cannabis interaction examples (Eliquis+CBD, tolerance break, LFTs/statin hold)
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Vulnerability flags cover pediatric/pregnancy/psych gates only. Cannabis-drug interaction flags (Eliquis+CBD, LFTs/statin) are not deterministically generated — no structured interaction engine.
- **[PARTIAL · M · risk:high]** Risk Flags: vitals/labs flags (BP trend from RPM+clinical visits, A1C trend, unintentional weight loss)
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Generic outcomeLog trend analysis exists but uses no RPM-specific vital queries or dedicated lab panel queries. No structured vitals/labs risk flag generator.
- **[PARTIAL · L · risk:med]** Step 1 'Loading patient profile…': includes labs, consults, imaging, procedures; Cindy categorizes each separately
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Step label exists. Agent only queries patient.chartSummary and patient.medications — no lab results, consult notes, imaging, or procedure records are fetched or categorized separately.
- **[PARTIAL · L · risk:med]** Step 2 'Reviewing recent encounters…': provider-only notes (H&P, progress, nursing); Cindy learns and mirrors individual provider's documentation style
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Queries last 5 encounters/notes but does not filter by note type or provider, and the LLM prompt has no instruction to learn/mirror the individual provider's documentation style or differentiate it from consultant notes.
- **[PARTIAL · L · risk:med]** Step 3 'Analyzing outcome trends…': covers ALL lifestyle data from wearables (Apple Watch, Fitbit, Oura Ring) and portal goals/streaks/lifestyle/nutrition/fitness
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Agent queries outcomeLog only. No wearable integrations (Apple Health, Fitbit, Oura) or portal goals/streaks/lifestyle/nutrition/fitness data fetched.
- **[PARTIAL · M · risk:med]** Risk Flags: lifestyle flags from wearables (sedentary steps, poor diet from log, elevated stress via HRV, PHQ9/GAD7)
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Assessment scores (PHQ9/GAD7) are included in the prompt. Step-count, diet logs, and HRV from wearables are not fetched; no deterministic lifestyle risk flag logic.
- **[PARTIAL · M · risk:low]** Patient avatar: show photo if available, else initials
  - `src/app/(clinician)/clinic/patients/[id]/prepare/page.tsx` — Avatar component is rendered but only receives firstName/lastName (initials mode). Patient model and Avatar component do not accept a profilePictureUrl prop yet; comment on line 33-36 explicitly defers this.
- **[PARTIAL · M · risk:low]** Intelligence Details: red/yellow/green color stratification (red=top priority, yellow=watch/side-effects, green=positives/continue)
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — High=red/orange, medium=accent-green, low=gray. Directive requires: red=priority, yellow=side-effects/watch, green=positives. Medium is mapped to green not yellow; a green-for-positives tint is missing.
- **[PARTIAL · S · risk:low]** Clinical Intelligence idle body copy updated to Cindy-branded language ('Cindy will summarize Maya's chart… talking points and risk flags so you're ready')
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Idle copy on line 410-414 still reads 'The agent will synthesize…' — not updated to directive's Cindy-branded copy.
- **[PARTIAL · S · risk:low]** 'Patient's Story': 3-sentence summarized statement of total health
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — LLM prompt asks for '1-2 sentence patient overview'. Directive asks for 3 sentences covering total health.
- **[PARTIAL · S · risk:low]** 'Last visit' shows date and is a clickable link to the finalized note in the patient chart
  - `src/app/(clinician)/clinic/patients/[id]/prepare/briefing-console.tsx` — Last visit text is shown (line 549-556) but no date is surfaced and it is plain text with no hyperlink. Agent returns lastVisitSummary text only; lastVisitNoteId and lastVisitDate are not in the schema.
- **[PARTIAL · S · risk:low]** Talking Points: 5-10 numbered items covering BOTH Risk Flags AND Green Flags content
  - `src/lib/agents/pre-visit-intelligence-agent.ts` — Prompt asks for '3-5 specific talking points'. Directive requires 5-10, explicitly incorporating both risk and green flags (green flags don't exist yet).

  **Top build targets (best value/effort):**
  1. S-effort label fixes: rename Step 6 to 'Cindy is at work!', 'Patient briefing' to 'Patient’s Story', 'Start visit with briefing' to 'Start Visit', and idle Clinical Intelligence copy — four string changes across two files, instantly visible to Dr. Patel
  1. Green Flags section: add greenFlags[] to BriefingResult schema + agent output schema + LLM prompt + render a new GlassCard with green tint above Risk Flags — high clinical value, moderate effort, no data-safety risk
  1. Last visit date as clickable link: add lastVisitNoteId + lastVisitDate to agent output schema, surface as Link in briefing-console — S/M effort, concrete UX improvement Dr. Patel named explicitly
  1. 'Start Visit' visit-type dropdown: replace single action button with a split-button/select-button that captures nurse/follow-up/acute/wellness/H&P, pass type to startVisitWithBriefing and route to the correct note template
  1. Trend window 'Adjust' popup: modal with Length dropdown + date picker + Which Trends multi-select, wire trend-window param down to the agent — self-contained UI modal, unlocks all customized trend directives
  1. Intelligence Details red/yellow/green color fix + Risk Flags expand toggle: correct the medium→yellow color mapping, add a 'positive' green tier for Green Flags sections, add show-more toggle to Risk Flags list

### open-tasks  ·  2✅ / 3🟡 / 3⬜

- **[MISSING · L · risk:high]** Sign off on ancillary services: PT notes, lab clarification, home health notes
  - `NEW` — No ancillary document sign-off workflow exists. There is no query for PT/OT/home health notes pending co-signature, no lab clarification pending items, and no such category in ChartTaskList. Requires schema support (AncillaryNote model or a task sub-type) plus a query and UI row.
- **[MISSING · M · risk:high]** Include reviewing labs, consults, and assessments in Open Tasks
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — labResults and assessmentResponses are fetched server-side and shown on the Labs tab, but unreviewed/abnormal labs and pending consults are never injected into the ChartTaskList items array. Missing a 'result' and 'consult' category in the punch list.
- **[MISSING · M · risk:med]** Include Prescription Refills as an item category in Open Tasks
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — The ChartTaskCategory type has an 'order' value but no pending refill requests are queried or injected into the items array built around line 899. No refill model query exists on this page.
- **[MISSING · S · risk:med]** Dismissed section must reappear 48 hours later (at 0001 day-after-next)
  - `src/components/patient/ChartTaskList.tsx` — Dismiss stores an item-hash in localStorage and only re-shows when the item set changes. There is zero timer-based 48h expiry logic; the same task list dismissed today will never auto-resurface.
- **[PARTIAL · S · risk:low]** Open Tasks section must be collapsible (not just dismissible)
  - `src/components/patient/ChartTaskList.tsx` — Section has a Dismiss button that hides it entirely, but there is no collapse/expand toggle to temporarily hide the list body while keeping the header visible.
- **[PARTIAL · S · risk:low]** Respond-to messages from patient/ancillary/physicians as Open Task rows linking to /clinic/messages
  - `src/components/patient/UnresolvedFollowUpsPanel.tsx` — UnresolvedFollowUpsPanel surfaces some triaged message threads with links, but they link to the correspondence tab (/clinic/patients/[id]?tab=correspondence), not to /clinic/messages as specified. Message rows also appear in a separate panel rather than inside ChartTaskList proper.

  **Top build targets (best value/effort):**
  1. 48h dismiss timer: store timestamp instead of item-hash in localStorage; reappear at 00:01 day-after-next (ChartTaskList.tsx, ~20 lines)
  1. Labs/assessments in Open Tasks: inject unreviewed abnormal labResults + unscored assessmentResponses as 'result' category items in the page.tsx items array
  1. Prescription refills in Open Tasks: query pending refill requests and surface them as 'order' category items alongside the existing openTasks query
  1. Message rows link to /clinic/messages: update UnresolvedFollowUpsPanel href for message-sourced items from the correspondence tab URL to /clinic/messages
  1. Collapsible toggle: add expand/collapse chevron to ChartTaskList header that hides the list body but keeps the header visible (distinct from Dismiss)

### decision-support  ·  1✅ / 2🟡 / 13⬜

- **[MISSING · L · risk:high]** Acknowledged alerts persist to chart with 30-90 day snooze (not re-prompted during window)
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Dismissed state is React useState only — resets on every page load. No DB model for CDSAcknowledgement exists in prisma/schema.prisma. No snooze duration or urgency-based interval logic.
- **[MISSING · M · risk:high]** Renal Dosing Adjustments: calculate optimal dosages from eGFR/creatinine
  - `src/lib/domain/clinical-decision-support.ts` — The creatinine lab alert warns about elevated creatinine but does not compute adjusted dosing. No eGFR-based dose-calculation CDS alert exists.
- **[MISSING · M · risk:high]** Controlled Substance Triggers: PDMP check CDS alert before signing narcotic refill
  - `src/lib/domain/clinical-decision-support.ts` — PDMP/CURES attestation exists in the prescribe form only. No proactive CDS alert fires in CDSPanel to remind clinician to query PDMP before a narcotic is signed.
- **[MISSING · M · risk:high]** Critical acknowledge requires password modal + free text comment box
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Clicking Acknowledge on any alert (including critical) simply calls setDismissed. No modal, no password verification, no comment capture.
- **[MISSING · S · risk:high]** Dismiss allowed for warning/info only; critical alerts cannot be dismissed
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — setDismissed is called uniformly for all severities via 'Acknowledge'. No severity gate prevents critical alerts from being dismissed.
- **[MISSING · L · risk:med]** Cardiovascular Risk Calculator: auto-pull age/smoking/cholesterol into 10-year risk score
  - `NEW` — Records taxonomy labels 'ascvd' and 'framingham' exist but no actual risk-score computation exists anywhere in src/lib/cds/ or domain. No Framingham/ACC-AHA ASCVD engine.
- **[MISSING · M · risk:med]** Vaccination Schedules CDS: prompt clinician about missed/due vaccines
  - `src/lib/domain/clinical-decision-support.ts` — No vaccination alert category or logic anywhere in CDS domain or engine. USPSTF screenings component is separate and does not cover immunization schedules.
- **[MISSING · M · risk:med]** SDOH: prompt clinician to offer food/housing resources if intake flags positive
  - `src/lib/domain/clinical-decision-support.ts` — An /api/agents/sdoh-analyzer façade exists but SDOH flags are never surfaced in generateCDSAlerts or CDSPanel. No intake-flag intake-to-CDS pipeline.
- **[MISSING · M · risk:low]** Section-level collapsible + dismiss that reappears at 00:01 next day
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Panel has no collapse toggle and no section-dismiss button; dismissed state is per-alert only (no 24-hour re-show logic, no localStorage persistence).
- **[MISSING · S · risk:low]** Acknowledge button must be green with bigger font and high contrast
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Acknowledge is rendered as a plain text button with class 'text-[11px] text-text-subtle' — no green color, no size/contrast upgrade.
- **[MISSING · S · risk:low]** CV Risk Score shown as small header in Patient Chart section, next to chart readiness
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Chart header only shows completenessScore next to chart readiness. CV risk score display block is absent; would require the calculator (above) to be built first.
- **[MISSING · S · risk:low]** Separate beige 'Dismiss' button left of the Acknowledge button per alert
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Only one action button exists ('Acknowledge'). No separate Dismiss button with beige styling is rendered.
- **[PARTIAL · M · risk:high]** Allergy Triggers CDS: cross-reference prescribed items vs allergy profile
  - `src/lib/domain/clinical-decision-support.ts` — 'allergy' is typed as a CDSAlert category and has a panel icon, but generateCDSAlerts never receives or evaluates patient.allergies — no allergy cross-reference logic exists.
- **[PARTIAL · M · risk:med]** Preventative Measures CDS: cancer screenings/colonoscopy/echo as CDS alerts
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — ScreeningsPanel + dueScreenings() are rendered separately on the demographics tab but are not wired into CDSPanel as severity-graded alerts with acknowledge/dismiss flow.

  **Top build targets (best value/effort):**
  1. Allergy cross-reference logic in generateCDSAlerts (pass patient.allergies, match against prescriptions) — high clinical safety risk, M effort
  1. Critical acknowledge modal: password verification + free text comment, with severity gate blocking dismiss on critical alerts — high safety/compliance risk, M effort
  1. Persisted CDSAcknowledgement: add Prisma model, server action, 30-90 day snooze by severity — without this nothing from lines 248-253 is durable, high risk, L effort
  1. Green Acknowledge + beige Dismiss button split with severity-based dismiss gate — visible compliance gap, S effort
  1. Section-level collapse + 24-hour re-show: localStorage panel state + next-midnight re-open timer — UX directive, M effort
  1. PDMP/Controlled-Substance CDS alert: fire before the prescribe tab for any scheduled drug on the active med list — high regulatory risk, M effort

### demographics  ·  27✅ / 12🟡 / 9⬜

- **[MISSING · L · risk:high]** Screening popup: real chronological results table, click to split-pane showing actual scan report; ribbon buttons (email/save as/text) on report; abnormal findings highlighted in red
  - `src/app/(clinician)/clinic/patients/[id]/screenings-panel.tsx` — Popup exists with a sparkline placeholder and stub text ('Chronological results render here once...'). No real result data, no split-pane viewer, no actual report renderer, no ribbon share buttons, no abnormal/red highlighting. Entire document viewer sub-surface is missing.
- **[MISSING · L · risk:med]** Cannabis Qualification: clickable → AI popup with recommendations, 'More Information' button linking to state MMJ form, ability to submit form to insurance
  - `NEW` — No popup on the cannabis qualification field. No AI suggestion, no More Information button, no form submission to insurance. Entirely absent.
- **[MISSING · L · risk:med]** Insurance: click title → popup with full plan details (ID, Group, Effective, Plan type, Rx, RxBin, RxPCN for PPO; Name, Medicare number, Entitled For, Coverage Status for Medicare; Copay by visit type)
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Insurance card links to a detail page (Open ↗). No popup modal on click. Missing all extended fields: plan type, RxBin, RxPCN, copay amounts per visit type, Medicare-specific fields (Medicare number, Entitled For, Coverage Status).
- **[MISSING · L · risk:med]** Insurance card scan: AI scans patient's insurance card image and extrapolates all data into sections
  - `NEW` — No insurance card scan feature anywhere in the demographics surface. Entirely absent.
- **[MISSING · S · risk:low]** USPSTF source attribution ('obtained from US Preventative Services Task Force') at bottom of search screen
  - `src/app/(clinician)/clinic/patients/[id]/screenings-panel.tsx` — No attribution text present anywhere in the screenings panel.
- **[PARTIAL · L · risk:high]** RPM/CCM device data pulled into chart (live BP, glucose, SpO2, weight, respiratory flow, heart rate readings in columnar format)
  - `src/app/(clinician)/clinic/patients/[id]/screenings-panel.tsx` — Only static category label bubbles are rendered (RPM_CATEGORIES constant). No live data pull from any RPM/CCM source, no columnar date/result table as directed with examples like BP: 5/9/26 = 140/90.
- **[PARTIAL · M · risk:med]** AI scan documents → actually extract medications (not just a file-queue stub)
  - `src/app/(clinician)/clinic/patients/[id]/current-medications-card.tsx` — File input exists and queues a filename; scanName state just records the name. No actual AI extraction call, no suggestions returned to confirm. Directive requires Cindy to parse the doc and surface medication suggestions for provider approval.
- **[PARTIAL · M · risk:med]** Insurance section: show Plan Name and Type, differentiate Primary vs Secondary insurance
  - `src/app/(clinician)/clinic/patients/[id]/inline-demographics-card.tsx` — Only providerName, memberId, groupNumber shown inline. No plan type (PPO/HMO/EPO), no primary/secondary distinction, no 'Plan Name (Primary)' / 'Plan Name (Secondary)' pattern as directed.
- **[PARTIAL · M · risk:low]** USPSTF search button opens an in-app popup/modal embedding the USPSTF webview (https://www.uspreventiveservicestaskforce.org/webview/#!/), not an external link
  - `src/app/(clinician)/clinic/patients/[id]/screenings-panel.tsx` — Implemented as an <a href> external link to the topic_search_results page (line 68-70). Directive asks for a pop-up window with the USPSTF webview embedded and 'obtained from US Preventative Services Task Force' attribution at the bottom.
- **[PARTIAL · S · risk:low]** Phone before email in Contact section (inline card shows email first)
  - `src/app/(clinician)/clinic/patients/[id]/inline-demographics-card.tsx` — Detail-editor contact page has phone first, but InlineDemographicsCard (lines 112-163) renders Email row before Phone row. Directive says phone on top of email.
- **[PARTIAL · S · risk:low]** Alerts section renamed from 'Alerts and Allergies'; Allergies word removed from that section label
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Card title is 'Alerts' (done). However the allergies list immediately below still bears an 'Allergies:' label prefixed with uppercase text (line 789). The allergy manager/badge surface is interleaved with the alerts section. Directive says remove 'Allergies' from this section label entirely.
- **[PARTIAL · S · risk:low]** Click anywhere in Current Medications section → 'add to history'
  - `src/app/(clinician)/clinic/patients/[id]/current-medications-card.tsx` — Add-to-history button exists in the card header but is a small button, not a click-anywhere-in-section affordance. Directive asks for clicking anywhere in the section to trigger the action.
- **[PARTIAL · S · risk:low]** Cannabis Qualification: display as Yes/No with state in parentheses e.g. 'Yes (CA)'
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Shows qualified/pending/ineligible text (line 1324-1330). Directive asks for 'Yes (CA)' / 'No' format with the state abbreviation included.

  **Top build targets (best value/effort):**
  1. Insurance popup modal with full plan details (PPO: ID/Group/Effective/Plan type/Rx/RxBin/RxPCN; Medicare: Medicare number/Entitled For/Coverage Status; copay by visit type)
  1. Cannabis Qualification clickable popup with AI recommendations, More Information button linking to state MMJ form, and insurance submission
  1. USPSTF search as in-app modal embedding webview (not external link) with USPSTF attribution footer
  1. Phone before email ordering fix in InlineDemographicsCard + primary/secondary insurance differentiation in inline card
  1. AI medication document scan: wire actual Cindy extraction call on file upload, return suggestions list for provider approval
  1. Screening popup: real chronological results table with split-pane document viewer, abnormal highlighting, and report ribbon (email/save as/text)

### Memory Tab  ·  25✅ / 7🟡 / 3⬜

- **[MISSING · L · risk:low]** Consider merging Memory Tab into CDS Tab as a named subsection to reduce top-level navigation clutter
  - `src/app/(clinician)/clinic/patients/[id]/cds-panel.tsx` — Memory Tab exists as a standalone tab; cds-panel.tsx is separate. No merge or sub-tab routing exists. Requires chart-tabs.tsx restructure and CDS panel composition.
- **[MISSING · M · risk:low]** Add 'Future planning and goals' and 'Identity and Preferences' as new KIND_GROUPS subsections in What We Remember
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — KIND_GROUPS has 9 entries (line 75-148); neither 'future_planning' nor 'identity_preferences' MemoryKind values appear. Requires new Prisma enum values + KIND_GROUPS entries + blurb copy.
- **[MISSING · S · risk:low]** Provide an emoji-only display mode for trend bubbles (toggle between label+emoji vs emoji-only)
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — Emojis are rendered next to labels (passed to FilterBubble), but no toggle/preference to switch to emoji-only compact mode exists. Directive says 'have the option to only have emojis as the options instead of the actual names'.
- **[PARTIAL · M · risk:med]** Ledger sign-offs persisted to the database (not just localStorage) so acknowledged observations survive page reload across providers
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — useChartLedger (line 202) and comment at line 53 explicitly state it is localStorage-backed with 'no schema changes'. The directive says acknowledged items should be 'placed into the EMR'. Currently sign-offs vanish on different browsers/providers and are not actually written to ClinicalObservation.acknowledgedAt in the DB.
- **[PARTIAL · M · risk:low]** Move 'What the team has noticed' (observation kind) out of What We Remember into the Cindy observations panel
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — KIND_GROUPS still contains key='observation' / title='What the team has noticed' at line 119-124, rendering it inside the What We Remember window. Directive line 463 says to put it into 'Your Team Has Been Noticing' section. It should either be excluded from KIND_GROUPS or filtered out and its PatientMemory content surfaced via the Cindy panel.
- **[PARTIAL · M · risk:low]** Include pets in 'People in {firstName}'s life' subsection with dedicated pet tracking
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — Blurb text at line 130 mentions 'pets' alongside family/providers/support system. No dedicated pet data field, pet-specific PatientMemory category, or UI affordance for logging pet information exists. Pets rely on free-text entries under the relationship kind.
- **[PARTIAL · M · risk:low]** Prevent AI-generated 'Key moments' content from including provider reactions or bias (e.g. 'the note made Dr. Okafor's week')
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — No rendering-layer filter or AI prompt constraint is visible in this file. The directive requires either a content policy in the AI agent prompts that write to PatientMemory or a client-side content filter for the milestone kind.
- **[PARTIAL · S · risk:low]** Remove 'notable' severity bubble from the filter strip; only urgent/concern/info/consider should appear
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — ObsBucket type (line 174) correctly omits 'notable', and OBS_BUCKETS (line 523) has no 'notable' entry. However SEVERITY_STYLE (line 156) still maps notable → info/Notable, meaning any ClinicalObservation with severity='notable' silently falls into 'info' bucket rather than being surfaced or migrated. The Prisma ObservationSeverity enum still includes 'notable'; old data is not being remapped.
- **[PARTIAL · S · risk:low]** Observations and memories rendered as concise bullet points; avoid wordy full sentences
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — UI renders raw m.content / obs.summary strings (lines 707, 1086) as paragraph text. No enforced bullet formatting, sentence-length guardrail, or truncation-to-bullets in the rendering layer. This requires either AI content pre-processing or a display transform.
- **[PARTIAL · S · risk:low]** Avoid em-dash splits in sentence structure across all memory content rendering
  - `src/app/(clinician)/clinic/patients/[id]/memory-tab.tsx` — Comment at line 1085 notes the intent to avoid em-dash splits, but no sanitization/transform is applied to m.content or obs.summary at render time. Data arriving from AI agents may still contain ' – ' splits.

  **Top build targets (best value/effort):**
  1. Ledger sign-offs persisted to DB (acknowledgedAt written server-side) — data integrity risk and the core promise of the ack/dismiss workflow
  1. Move 'What the team has noticed' kind out of What We Remember and into Cindy panel — directly contradicts the directive and confuses the two-panel model
  1. Add Future planning and Identity/Preferences KIND_GROUPS entries with matching MemoryKind enum values — flagship AI memory expansion Dr. Patel explicitly requested
  1. Remove/migrate 'notable' severity from SEVERITY_STYLE and Prisma enum — clean up filter strip so only urgent/concern/info/consider surface as intended
  1. Emoji-only toggle for trend bubbles — small S effort, high fidelity to the Apple/fun aesthetic directive
  1. Content sanitizer or AI agent prompt constraint for Key moments to strip provider-bias phrases — protects patient-centered chart integrity

### notes  ·  1✅ / 3🟡 / 0⬜

- **[PARTIAL · L · risk:low]** Two-pane layout: chronological note list on left, full note with section-by-section editing on right pane
  - `src/app/(clinician)/clinic/patients/[id]/notes-tab.tsx` — Two-pane shell exists (left: chronological list, right: card). But the right pane shows only a preview + 'Open to edit' link that navigates to a separate page (/notes/[noteId]). Dr. Patel's directive says the full note and section-by-section editing should be in the right pane inline, not on a separate route.
- **[PARTIAL · M · risk:low]** Notes tab is a quick hub for correspondence drafts, pending attestation finalization, and chart note drafts — all in one place
  - `src/app/(clinician)/clinic/patients/[id]/notes-tab.tsx` — Tab surfaces chart note drafts and attestations correctly, but correspondence drafts live entirely in correspondence-tab.tsx and are not surfaced here. Dr. Patel says notes tab should be the quick clearing hub for all three draft types.
- **[PARTIAL · S · risk:low]** Hovering the Notes tab shows 'Number of notes pending' and 'Number of attestations pending' — minimal, at-a-glance work remaining
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — Pending-notes and pending-attestation counts are computed and displayed inside the tab body (notes-tab.tsx line 72), but the hover-peek popover (tabPeeks.notes in page.tsx) shows 5 generic recent-note rows with AI summary — not the prescribed 'X notes pending / Y attestations pending' structured summary. The popover needs a purpose-built notes pending count slot, not a recent-items list.

  **Top build targets (best value/effort):**
  1. Hover tooltip: replace generic recent-note rows with structured 'N notes pending / N attestations pending' display in TabPeekPopover for the notes tab
  1. Right-pane inline editing: embed NoteEditor (or a lightweight section-editor) directly in the right pane of notes-tab.tsx instead of linking to a separate page
  1. Correspondence drafts surfaced in notes tab: query pending/draft correspondence threads and add them to the NotesTab as a collapsible 'Correspondence drafts' section

### records  ·  17✅ / 7🟡 / 4⬜

- **[MISSING · L · risk:med]** Calculator subtab: integrate MDCalc, FACS Risk Calculator, and Medscape calculators with AI chart-data auto-fill
  - `NEW` — Taxonomy lists mdcalc/medscape/acs-risk/ascvd/framingham as tertiary labels only. No actual calculator iframe, embed, or AI-prefill component exists in records-tab.tsx or nearby. The taxonomy key exists but the Calculator subtab renders the same empty DocTile grid as every other subtab.
- **[MISSING · L · risk:low]** Provider-customizable subtab/category builder: add new categories, reorder up/down, modular and moveable
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — RECORD_SUBTABS is a hardcoded readonly constant. No UI for a provider to add custom subtabs, add custom tertiary labels, or reorder items up/down. Directive requires full modularity.
- **[MISSING · M · risk:low]** Send icon opens compose popup with subject/message/patient free-text fields
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — Send icon (✉️) in DocTile and SplitPaneViewer both call onOpen (document viewer) instead of opening a compose modal with subject, message, and searchable patient fields as directed.
- **[MISSING · S · risk:low]** Save icon should actually save/download the document
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — Save icon (💾) in DocTile calls onOpen (document viewer). Directive requires a genuine save/download action distinct from viewing.
- **[MISSING · S · risk:low]** E-signed subtab: options/filter button to filter by type (overrides, CURES, warnings, notes)
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — The e-signed subtab exists in taxonomy (4 tertiary labels). No filter/options button distinct from the shared tertiary-label bubbles exists. Directive calls for a dedicated filter emoji button that filters by e-signed document type.
- **[MISSING · S · risk:low]** Per-subtab search bar (search within a subtab, not just globally)
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — Directive specifies a search bar at top right of every subtab section. Only one global search bar exists; when active it ignores the current subtab entirely (line 77: returns hay.includes(q) without checking r.route.subtab).
- **[PARTIAL · L · risk:med]** Insurance subtab: fully automated AI-driven Peer-to-Peer Review Logs and Real-Time Eligibility Logs
  - `src/lib/clinical/records-taxonomy.ts` — Both are listed as static tertiary labels only. Directive requires automated, AI-driven log generation — no automation engine, no backend log writer, no API route exists for either.
- **[PARTIAL · M · risk:low]** AI-powered full-text search (name, specialty, date, label, labs, partial name across all document types)
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — Search bar exists (line 93) and does client-side substring match on doc.name+kind+tags. No AI semantic search, no server-side query, no cross-field search (provider name, specialty, labs). Also, when a search query is active the subtab filter is bypassed (line 77), which means the per-subtab search bar described in the directive is also missing.
- **[PARTIAL · S · risk:low]** Images subtab: modality+body-part dual-bubble display (colored modality + beige body-part secondary bubble)
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — IMAGING_MODALITIES with bodyParts is defined in records-taxonomy.ts but records-tab.tsx never imports or renders the dual-bubble layout. DocTile renders only doc.kind in a single bubble — the beige secondary body-part bubble is absent.
- **[PARTIAL · S · risk:low]** SplitPaneViewer: left pane shows simple title + right pane is 2x larger with full document display
  - `src/app/(clinician)/clinic/patients/[id]/records-tab.tsx` — Grid is col-span-1 / col-span-2 (correct 1:2 ratio). However, the left pane lists siblings from the current subtab filter state only, not all docs in the subtab. When a query is active, siblings may be empty or misrepresent the subtab list.
- **[PARTIAL · S · risk:low]** Hover tooltip on Records tab shows only 1-2 sentence fragment based on recent records
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — TabPeekPopover supports an optional peekSummaries string and records peek is wired in page.tsx. However, the summary is AI-generated at page load via loadPeekSummaries — if it fails or is absent, no fallback 1-2 sentence fragment renders. The peek shows a document list, not just a sentence fragment as directed.

  **Top build targets (best value/effort):**
  1. Send icon: compose popup with subject/message/patient fields (M, low risk, directly impacts clinician workflow)
  1. Images subtab: dual-bubble modality+beige body-part rendering using existing IMAGING_MODALITIES data (S, low risk, data is already there)
  1. Save icon: wire to actual download/save action instead of opening viewer (S, low risk, one-line fix with a download route)
  1. AI-powered search backend: server-side search across provider name, specialty, date, labs rather than client substring (M, low risk, high UX value)
  1. Per-subtab search bar: scope search to active subtab so subtab context is preserved (S, low risk)
  1. E-signed filter button: dedicated options button to filter the e-signed subtab by document type (S, low risk)

### labs-scores-vitals  ·  21✅ / 12🟡 / 13⬜

- **[MISSING · L · risk:med]** QR code at top-right of LSV tab for patient wearable data permission flow
  - `NEW` — No QR code component, no wearable OAuth/permission flow, and no patient-facing wearable link page exist anywhere in the codebase.
- **[MISSING · L · risk:med]** Bluetooth in-office pairing: patient scans or connects watch to pull wearable data
  - `NEW` — No Bluetooth/Web Bluetooth API integration or in-office pairing gateway exists. VitalsSubtab renders static catalog rows with zero live data.
- **[MISSING · L · risk:med]** Patient sends wearable data remotely from phone into EMR
  - `NEW` — No patient-side data submission flow exists. VitalsSubtab props are empty; no wearable ingest API route found.
- **[MISSING · M · risk:med]** Cannabis / Psilocybin optional module subtab (opt-in, removable per practice setting)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — No cannabis or psilocybin assessment subtab exists, and no provider module opt-in/opt-out flag gates it. The Assessment Scores subtab uses ASSESSMENTS from assessment-catalog.ts but no cannabis-specific entries or conditional rendering.
- **[MISSING · M · risk:low]** Split-pane view: left list + right 2x wider document viewer on title click
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — EMR-868 comment claims it, but lsv-tab.tsx has no split-pane layout. Title click opens href in new tab rather than an in-page split pane.
- **[MISSING · M · risk:low]** Tertiary label layer within each subtab (colored filter bubbles, three-layer nav)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — records-tab.tsx has a full three-layer nav with tertiaryLabels; lsv-tab.tsx has no tertiary label filter layer in any of its three subtabs.
- **[MISSING · M · risk:low]** Drag-and-drop file upload with Cindy auto-routing to correct subtab/category
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — No drag-and-drop upload zone and no Cindy document-routing agent integration exist in lsv-tab.tsx.
- **[MISSING · M · risk:low]** Search bar at top-right of main LSV tab and each subtab (multi-field: provider, date, lab value, symptom, etc.)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — No search input exists anywhere in lsv-tab.tsx. The directive asks for AI-powered partial-match search across all LSV fields.
- **[MISSING · M · risk:low]** Assessment Scores split-pane: click a result to open the actual survey on the right panel
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — AssessmentScores renders per-slug collapsibles showing date+score rows; clicking a row does nothing — no selected-item state or right-side survey viewer is implemented.
- **[MISSING · M · risk:low]** Vitals split-pane: click a result to open detailed vital record on right panel
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — VitalsSubtab has no selectable vital rows (no data props passed at all), and no right-panel viewer state.
- **[MISSING · S · risk:low]** List/tile view toggle — provider can switch between list and tile format
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — LabsSubtab renders a grid (md:grid-cols-2) with no toggle; no viewMode state or list/tile toggle UI exists in any subtab.
- **[MISSING · S · risk:low]** Vitals default view organized by Date and Time; can switch to organize by vital title
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — VitalsSubtab has no data and therefore no date-first default or sort toggle. The directive explicitly asks for chronological-by-date as default with a view-by-vital option.
- **[PARTIAL · L · risk:high]** Full LeafNerd de-identification pipeline: LSV data exported to LeafNerd Marketplace without PII
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — The tab header notes 'De-identified data feeds the LeafNerd analytics engine' but this is a UI label only. No actual export pipeline, de-identification transform, or LeafNerd Marketplace integration is wired from the LSV tab.
- **[PARTIAL · M · risk:med]** Wearable data populates Vitals subtab under its own 'wearables' section, organized by source
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — VITAL_SOURCES beige bubbles are rendered but static/unclickable and hold no data. VitalsSubtab takes no vitals data props; all collapsible sections are empty placeholders.
- **[PARTIAL · M · risk:med]** Overview vitals section shows real data (5 latest readings from in-office + wearables)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — Overview CollapsibleSection for vitals renders a static placeholder message ('Connect an in-office device…') rather than real data. LsvTab receives no vitals prop and none is fetched in page.tsx.
- **[PARTIAL · M · risk:low]** Tab hover popup with 1-2 sentence AI summary PLUS 2x2 mini-graphs (A1C, LDL, BP, weight)
  - `src/app/(clinician)/clinic/patients/[id]/peek-summary.ts` — peek-summary.ts generates a text-only summary for the LSV tab; TabPeekPopover in chart-tabs.tsx shows text + list entries. No mini-graphs (2x2 sparklines for A1C/LDL/BP/weight) are rendered anywhere.
- **[PARTIAL · M · risk:low]** Labs split-pane: click a structured result row to open full panel on the right
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — LabsSubtab marker rows are <li> elements with no onClick. The clickable title on lab docs opens href in new tab, not an in-page right pane. No selectedId state or right-pane viewer implemented.
- **[PARTIAL · M · risk:low]** Vitals Feather trend popups have real data series (not empty [])
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — Every FeatherTrend in VitalsSubtab is passed series={[]} (line 488-490). CindySays runs on an empty array, so Cindy's analysis is always vacuous until real vitals data is wired.
- **[PARTIAL · M · risk:low]** AI free-text time/date range query in Vitals (e.g. 'show BP 8am–10am', AI infers parameters)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — Per-title date inputs and a time free-text field exist (lines 496-513), but no AI interpretation of the free-text query is wired; input values are uncontrolled and have no effect on displayed data.
- **[PARTIAL · S · risk:low]** Source-filterable beige bubbles on Vitals (click to filter by In office / Garmin / iWatch / etc.)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — Beige Bubble components render for each source (lines 469-472), but they have no onClick filter state; clicking does nothing.
- **[PARTIAL · S · risk:low]** Send icon on each tile with popup (subject, message, patient fields — like the correspondence composer)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — LsvIconBtn renders Print (🖨️) and Download (⬇️) but no Send icon. The directive asks for a three-field compose popup triggered by a send icon on each tile.
- **[PARTIAL · S · risk:low]** Remove 'application/pdf – 240.0kb' metadata and 'lab'/'AI classified' bubbles from every tile
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — LabsSubtab tiles show no pdf size metadata and no 'AI classified' bubble — this appears clean. However the directive also applies to all subtabs; cannot verify without live data rendering the old records-style tiles.
- **[PARTIAL · S · risk:low]** Labs default view organized by Date; can switch to organize by panel title (CBC, CMP, etc.)
  - `src/app/(clinician)/clinic/patients/[id]/lsv-tab.tsx` — LabsSubtab only renders grouped-by-panel view (byPanel map). No date-first default view or sort toggle between date and panel is implemented.

  **Top build targets (best value/effort):**
  1. Split-pane viewer with selected-item state wired across all three subtabs (assessments/labs/vitals) — highest visible UX gap, M effort, unlocks the core navigation pattern
  1. Real vitals data prop + wiring in page.tsx (LsvVitalsReading type, DB query, pass to VitalsSubtab) — enables overview 5-latest, Feather trends, and source filtering in one shot
  1. Send icon + compose popup on each tile — S effort, completes the tile action trio (print/download/send), directly requested and visually obvious to clinicians
  1. Source-filterable beige bubbles + sort toggle (date vs title) for Labs and Vitals — S effort each, high day-to-day clinical utility
  1. Search bar (AI-powered multi-field) at main tab + subtab level — M effort, very high clinical efficiency win and explicitly prioritized in the directive
  1. QR code / wearable permission gateway — L effort but this is the headline feature of the redesign; stub the QR display + data-consent UI first, defer BLE/OAuth to a follow-on

### rx-front  ·  30✅ / 16🟡 / 6⬜

- **[MISSING · M · risk:med]** Right-click on any bubble opens edit/remove context menu to correct mislabeled bubble categories
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — No onContextMenu handler anywhere in rx-tab.tsx or BubbleStrip. Comment in file header claims EMR-879 right-click edit is covered but implementation is absent.
- **[MISSING · M · risk:med]** Clinician Notes: multi-note history array per regimen stored and fetched (not just most recent single note)
  - `src/app/(clinician)/clinic/patients/[id]/rx-serialize.ts` — serializeRegimen() maps one clinicianNotes/clinicianNoteAt. No history relation fetched. Full fix requires a ClinicianNote relation on DosingRegimen, serializer array, and modal rendering ordered list.
- **[MISSING · M · risk:med]** Pharmacy name/phone/fax/address fields added to RxRegimen interface and rx-serialize.ts
  - `src/app/(clinician)/clinic/patients/[id]/rx-serialize.ts` — serializeRegimen() does not join or include pharmacy data. Pharmacy exists in the prescribe flow (pharmacy-selector.tsx, e-prescribe lib) but is not surfaced back to the rx-tab display.
- **[MISSING · S · risk:med]** RxRegimen serializer carries real ICD-10 code from the DosingRegimen record
  - `src/app/(clinician)/clinic/patients/[id]/rx-serialize.ts` — serializeRegimen() has no icdCode field. RxRegimen type has no icdCode property. Hardcoded to '—' in rendered row.
- **[MISSING · M · risk:low]** Bubble system is provider-customizable: toggle individual bubble types on/off per provider preference
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — No bubble preference UI, no provider settings table, no conditional rendering based on stored bubble preferences.
- **[MISSING · M · risk:low]** Per-dose-entry Feather icon opens a graphical time-series popup with 'Cindy says:' summary for that specific product
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Section-level FeatherTrend exists on the heading. The directive also requires a per-row Feather icon on each DoseLogRow — absent from DoseLogRow component.
- **[MISSING · M · risk:low]** Dose log emoji/scale persisted back to the DoseLog record (not just recorded to the chart ledger)
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Emoji tag action only calls record() (chart correspondence ledger). No mutation updates the DoseLog row. Requires schema fields + server action + serializer update.
- **[MISSING · S · risk:low]** Active Medications section has inline active/inactive dropdown toggle (not just on the deep regimens page)
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Directive line 729 asks for an active/inactive dropdown at the top of the Active Medications section. The rx-tab shows them as two separate sections with a CollapsibleSection for inactive; no dropdown toggle.
- **[PARTIAL · S · risk:high]** Critical/red interaction rows: blocking popup with free-text justification box before allowing dismiss or acknowledge
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Bulk dismiss correctly skips red rows; isCritical is passed to AckDismissControls. Whether the component actually blocks and opens a justification popup is inside chart-kit and needs verification; the rx-tab wiring is correct but the blocking modal may be incomplete.
- **[PARTIAL · M · risk:med]** Expanded regimen row shows real ICD-10 code (not hardcoded dash) and pharmacy name/phone/fax/address
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — ICD-10 field is hardcoded to '—' (line 617). Pharmacy block entirely absent from both RxRegimen interface and rendered expanded view.
- **[PARTIAL · M · risk:med]** Clinician Notes running list popup shows ALL historical notes in chronological order, not just the latest one
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Running list modal renders exactly one <li> item (r.clinicianNotes). RxRegimen has no notes-history array; no historical array is fetched or stored.
- **[PARTIAL · S · risk:med]** Psilocybin module guard: MethodsReference panel not shown (or psilocybin methods scrubbed) when psilocybin module is off
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — MethodsReference renders the full ADMINISTRATION_METHODS list without accepting moduleFlags. No module guard wraps it; psilocybin routes shown to all providers regardless of opt-in.
- **[PARTIAL · S · risk:med]** Sig/directions field is inline-editable freehand directly in the collapsed medication row
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Sig column is display-only in the collapsed row. Directive asks for inline freehand typability (e.g. 'take at 7AM with food'). Editing requires navigating to the full prescribe page.
- **[PARTIAL · M · risk:low]** THC/CBD popup Feather shows CBG/CBC/CBN trends over time with time-range/date-range search parameters
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — FeatherTrend is present in AccountantBreakdown but only shows per-product current mg (not time-series); CBG/CBC/CBN cannabinoids absent; no time-range search.
- **[PARTIAL · M · risk:low]** Left-click on a bubble opens detail popup showing all matching entries with AI/LeafNerd Feather analytics
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — BubbleStrip left-click only toggles an inline list filter — no popup, no Feather analytics per bubble click, no detail view.
- **[PARTIAL · M · risk:low]** Feather trend in THC/CBD totals popup uses date-stamped historical time-series (not current-snapshot array)
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — AccountantBreakdown feeds rows.map(r => r.mg) — a per-product current-value array, not a historical time-series. Date hover tooltips require time-indexed data which is not passed.
- **[PARTIAL · S · risk:low]** Dose Logs Notes column displays emoji + numeric scale (e.g. 😊 7/10) from patient input visually
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Notes column renders log.note as plain text. Emoji tagging only writes to the chart ledger, not persisted to the dose log row. RxDoseLog has no emoji or scale fields.
- **[PARTIAL · S · risk:low]** Dose log detail popup includes emoji reactions and numeric scale data from patient input
  - `src/app/(clinician)/clinic/patients/[id]/rx-tab.tsx` — Detail modal exists (line 819-838) but RxDoseLog has no emojiTag or scale field; emoji/scale data is never stored or displayed.

  **Top build targets (best value/effort):**
  1. Real ICD-10 code + pharmacy name/phone/fax/address in expanded regimen view: add fields to RxRegimen interface, rx-serialize.ts join, and expanded Detail block (3 files, high clinical completeness value)
  1. Clinician Notes multi-note history: schema relation + serializer array + running-list modal ordered list (currently only the last single note is shown)
  1. Dose log emoji+scale persistence: add emojiTag/scaleValue to DoseLog schema, update serializer, render in Notes column and detail popup instead of only recording to correspondence ledger
  1. Per-row Feather trend icon on each DoseLogRow showing that product's time-series with date-hover tooltips and 'Cindy says:' summary
  1. Right-click context menu on bubble for edit/remove mislabeled categories (onContextMenu + inline edit modal in BubbleStrip/RegimenRow)
  1. MethodsReference module guard: pass moduleFlags to MethodsReference and scrub psilocybin-specific routes when psilocybin module is off

### prescribe  ·  32✅ / 18🟡 / 18⬜

- **[MISSING · L · risk:high]** Stage 8/9: NCPDP SCRIPT XML compilation, schema validation, encrypted eRx transmission, async pharmacy ACK, pending/sent/failed status badge
  - `NEW` — No NCPDP XML generation, no Surescripts/clearinghouse transmission; prescription is simply persisted to DB and marked 'sent' without a real network round-trip
- **[MISSING · L · risk:high]** Bi-directional NCPDP messages: CancelRx, RxRenewal inbound task queue, RxChange substitution, RxFill adherence alerts
  - `NEW` — None of the four inbound/outbound NCPDP transactional message types are implemented
- **[MISSING · L · risk:high]** REMS integration: background registry token check, mandatory lab validation, REMS authorization number in payload
  - `NEW` — No REMS detection or registry check; no lab-result gate for high-risk drugs like isotretinoin or clozapine
- **[MISSING · L · risk:high]** Pediatric Prescribing Engine: weight-based dose calculator from vitals, liquid-volume mL conversion, adult ceiling guardrail hard stop
  - `NEW` — No pediatric weight-based dose calculator; UI does not morph for patients under 18; pediatric-growth.ts lib exists but is not wired to prescribing
- **[MISSING · L · risk:high]** Renal Dosing Engine: auto-fetch eGFR/Creatinine for renally-cleared meds, Cockcroft-Gault CrCl calc, inline renal adjustment display with one-click apply
  - `NEW` — No renal dosing logic; no lab interrogation at order entry for renally-cleared drugs
- **[MISSING · L · risk:high]** Oncology Infusion Engine: BSA Mosteller calculation, structured regimen/cycle builder (Day 1/8/15 of 21-day cycle)
  - `NEW` — No oncology-specific dosing or regimen/cycle builder
- **[MISSING · L · risk:high]** Medication Reconciliation: automated 12-month fill history pull (RxHReq), tri-pane CONTINUE/SUSPEND/MODIFY reconciliation UI at care transitions
  - `NEW` — No med-rec UI or RxHReq transaction; no inpatient discharge reconciliation workflow
- **[MISSING · M · risk:high]** Stage 4 CDS: Drug-Allergy Interaction check (ingredient/class vs allergy profile), hard/soft stop modal with override + mandatory reason
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Allergy data is not loaded from the DB; drug-allergy cross-check is completely absent — only drug-cannabinoid interactions against patient meds are checked
- **[MISSING · M · risk:high]** Stage 4 CDS: Duplicate Therapy Check (same therapeutic class)
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — No therapeutic class grouping or duplicate therapy detection exists
- **[MISSING · M · risk:high]** Stage 4 CDS: Dose/Age/Gender checks including pediatric weight-based and Beers Criteria geriatric alerts
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — No age/weight/gender-based dosing alerts; no Beers Criteria logic in the prescribe flow (pediatric-growth lib exists but is not wired here)
- **[MISSING · M · risk:high]** Complex Titration / Taper: segmented Sig builder chaining multiple dose segments into one order
  - `NEW` — Only a single dose+frequency field pair exists; no multi-segment sig builder (e.g. Prednisone taper: 20mg x3d → 10mg x3d → 5mg x3d)
- **[MISSING · M · risk:high]** Compound Medication mode: multi-ingredient with per-ingredient RxCUI, custom base, free-text compounding instructions
  - `NEW` — No compound mode exists anywhere in the prescribing flow
- **[MISSING · M · risk:high]** Async Fax Fallback: on eRx timeout or routing error, queue authenticated electronic fax; DEA-mandated 'Copy Only' stamp on failed controlled-substance printouts
  - `NEW` — No fax fallback path; no 'Copy Only' stamping on failed controlled substance transmissions
- **[MISSING · M · risk:high]** OB/GYN Teratogen Gate: pregnancy/lactation context check for teratogenic drugs, locked signing interface with mandatory risk-benefit checkbox in audit trail
  - `NEW` — No teratogen detection; no pregnancy flag check; no PLLR warning gate
- **[MISSING · S · risk:high]** Stage 6 Step 6.3: Pharmacy type verification for EPCS (controlled substance routing capability check)
  - `src/lib/clinical/pharmacy-directory.ts` — PharmacyEntry has no EPCS-capable flag; no check that a pharmacy accepts controlled substances before routing
- **[MISSING · S · risk:high]** LASA (Look-Alike/Sound-Alike) Tall Man Lettering in search results for high-alert medications
  - `src/lib/clinical/medication-search.ts` — MedSearchEntry has no LASA flag or tall-man display formatting; search dropdown renders plain text names
- **[MISSING · S · risk:high]** Ophthalmology/Otolaryngology: mandatory laterality field (OD/OS/OU, AD/AS/AU), drop-to-mL volume conversion (20 drops/mL)
  - `NEW` — No laterality enforcement or drop-to-volume conversion for ophthalmic/otic medications
- **[MISSING · L · risk:med]** Stage 5: Real-Time Prescription Benefit (RTPB) formulary check — coverage status, patient co-pay, PA flag, therapeutic alternatives
  - `NEW` — RTPB stub route exists at /api/integrations/rtpb-optimizer but it is a facade mock; no formulary check is shown in the prescribe form at order-entry time
- **[MISSING · L · risk:med]** Stage 5: Electronic Prior Authorization (ePA) trigger when PA is required — initiate questionnaire or queue to MA
  - `NEW` — No ePA flow exists
- **[MISSING · L · risk:med]** NCPDP SCRIPT v2023011 native XML schema; RTPB v13 pricing engine
  - `NEW` — No NCPDP XML is generated at all; RTPB facade only
- **[MISSING · S · risk:med]** Stage 3: DAW (Dispense as Written) checkbox/dropdown on every prescription
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — No DAW field anywhere in v2 form or action schema
- **[MISSING · M · risk:low]** Global Favorites / Order Sets: save pre-configured prescriptions (drug+strength+sig+qty+refills) as reusable templates
  - `NEW` — No order set or favorites engine in the prescribe flow
- **[MISSING · S · risk:low]** Stage 6 Step 6.1: Auto-populate patient's preferred/default pharmacy from demographics profile
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — PharmacyPopup seeds from patient.state but does not auto-select a patient-preferred pharmacy; Patient model has no preferred pharmacy FK
- **[PARTIAL · L · risk:high]** Stage 2: Drug DB query using RxNorm/RxCUI/NDC, support brand+generic+synonyms, return structured drug concept with strength and dosage form
  - `src/lib/clinical/medication-search.ts` — Internal static MED_DIRECTORY (~80 entries) used instead of live RxNorm API; no RxCUI or NDC captured; no route constraint by dosage form; no synonym search
- **[PARTIAL · L · risk:high]** Stage 7B: EPCS full flow — PDMP auto-query logged, two-factor MFA signing modal, DEA cryptographic audit log
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — CURES attestation checklist exists for controlled substances and is digitally time-stamped; real PDMP API query, MFA challenge, and DEA cryptographic seal are all absent — DEA number is a placeholder derived from user ID
- **[PARTIAL · M · risk:high]** Stage 1: Encounter context lock — patient MPI session lock, encounter type flag, active med/allergy/problem-list background fetch displayed before prescribing
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/page.tsx` — Medications and problem-list ICD-10 codes are fetched and shown; allergy list is NOT fetched or displayed; encounter type flag is not attached; no explicit MPI cross-tab lock
- **[PARTIAL · M · risk:high]** Stage 3 Backend Validation Matrix: NCPDP Sig conversion, days-supply cross-check, PRN-reason enforcement
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/actions.ts` — Math quantity/days cross-check done; NCPDP Sig XML conversion is absent; PRN reason field is not enforced when 'as needed' is selected
- **[PARTIAL · M · risk:high]** Stage 4 CDS: Drug-Drug Interaction check using full RxCUI against all active meds
  - `src/lib/domain/drug-interactions.ts` — Cannabinoid-only interaction table exists (THC/CBD/CBN/CBG); pharmaceutical-pharmaceutical DDI check is absent; no RxCUI-based lookup
- **[PARTIAL · M · risk:high]** CURES section: linked to real CURES OAuth login (doj.ca.gov); provider stores credentials in /clinic/settings CURES opt-in section accessed via provider initials
  - `src/app/(clinician)/clinic/settings/cures-credentials-form.tsx` — CURES credentials form exists at /clinic/settings (username+password localStorage-backed, acknowledged as interim/not production-grade); real OAuth to doj.ca.gov CURES is absent; provider initials nav link to settings is not wired
- **[PARTIAL · M · risk:high]** Safety Check acknowledge/dismiss UX: once acknowledged, box removed and digitally signed+timestamped into chart; refill meds acknowledgement only once/year; red boxes require mandatory provider justification that cannot be overridden
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Acknowledge/dismiss with justification for red boxes is implemented; but chart persistence is only via useChartLedger (client-side — not server-persisted); once-per-year refill acknowledgement is absent; the directive's specific styling (lighter yellow/red box backgrounds) is partially met
- **[PARTIAL · S · risk:high]** CURES attestation text: updated full attestation sentence including drug interactions, driving, side effects, weaning, patient comprehension; each click creates digital attestation note under correspondence tab
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Attestation is split into 6 checkbox items matching the directive's full text; digital attestation is ledger-recorded client-side but is NOT posted to the correspondence tab — it uses useChartLedger which is local state only
- **[PARTIAL · S · risk:med]** Context-Aware Smart Defaulting: when drug selected, auto-configure dose unit and constrain route dropdown to valid routes for that dosage form
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — defaultSig is auto-applied to timingInstructions; dose/unit/route are NOT smart-defaulted based on the selected drug's dosage form (no route dropdown constraint)
- **[PARTIAL · M · risk:low]** Overall redesign: minimal-scroll, static single-window, fewer clicks — form must not require scrolling
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — v2 is a 2-column layout that is better, but Cannabinoids/Diagnosis/Safety/CURES cards below the fold still require scrolling; the directive asks for one non-scrollable window with Medication, Dosing, Notes, and Pharmacy all visible at once
- **[PARTIAL · M · risk:low]** ICD-10 freehand search: type partial code or symptoms → populate matching codes dropdown, including a pop-up with closest matches when clicking Add
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Diagnosis picker is pre-loaded from patient's problem list + COMMON_PROBLEMS; no freehand ICD-10 code search, no symptom-to-code mapping, no 'Add' pop-up for free-text symptom entry
- **[PARTIAL · M · risk:low]** Cannabinoids open to: move to patient intake (/portal/intake) rather than keeping it on the prescribe page
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Cannabinoids section is collapsed/secondary on the prescribe page with a comment suggesting it could move to intake; it has NOT been actually moved to /portal/intake
- **[PARTIAL · S · risk:low]** Diagnosis section: fully collapsible/expandable, marked optional (not required to prescribe)
  - `src/app/(clinician)/clinic/patients/[id]/prescribe/prescribe-form-v2.tsx` — Diagnosis section exists and is not required (blocked gate only uses coreFilled, not diagnosis); but it is NOT collapsible — it is always visible and expanded

  **Top build targets (best value/effort):**
  1. Drug-Allergy Interaction check (Stage 4.1): load patient allergies, cross-check RxNorm class, hard/soft stop modal — highest clinical safety gap
  1. DAW field + PRN-reason enforcement + route constraint (Stage 3): small but safety-critical prescription accuracy gaps, S-effort each
  1. CURES attestation → correspondence tab: wire ledger.record to a server POST so attestations actually persist in the chart as required by the directive
  1. Drug-Drug Interaction expansion: broaden from cannabis-only to full pharmaceutical DDI using a static or external drug-class table, with RxCUI mapping
  1. ICD-10 freehand search with symptom-to-code mapping and collapsible/optional diagnosis section: unblocks compliant Rx workflow without diagnosis required
  1. LASA Tall Man Lettering in search dropdown + context-aware smart defaulting (unit/route per dosage form): high-value error-prevention with S/S effort

### private-notes  ·  1✅ / 2🟡 / 0⬜

- **[PARTIAL · M · risk:med]** Show Notes tab must display notes in chronological order (oldest first); provide an 'Archive' option per note — no delete allowed
  - `src/app/(clinician)/clinic/patients/[id]/private-notes-tab.tsx` — Notes are listed newest-first (listPrivateNotes uses orderBy: createdAt desc) — directive says chronological (oldest first). More critically, there is no archive action, no archivedAt field on the AuditLog-backed store, no archive button in the UI, and no archivePrivateNote server action. The comment in private-notes-button.tsx acknowledges archive-but-no-delete intent but the feature is entirely unimplemented. Unarchived vs archived note views are also absent.
- **[PARTIAL · S · risk:low]** Remove standalone tab; surface as borderless 'Private' label on Patient Chart box that opens a popup with two internal tabs: 'Add a private note' and 'Show Notes'
  - `src/app/(clinician)/clinic/patients/[id]/private-notes-button.tsx` — Tab is correctly hidden (chart-tabs.tsx hidden:true) and a 'Private' label button on the chart card opens a ModalShell — that part matches. However, the modal renders PrivateNotesTab as a single-pane component (composer on top, list below) rather than two named tabs ('Add a private note' / 'Show Notes'). The two-tab sub-navigation inside the modal is missing.

  **Top build targets (best value/effort):**
  1. Add two-tab sub-navigation inside the modal (Add a private note / Show Notes) — small UI change to private-notes-tab.tsx or private-notes-button.tsx
  1. Implement archivePrivateNote server action in private-notes-actions.ts (add archivedAt metadata field to AuditLog store, or stub a dedicated action that writes an archive-event row)
  1. Add 'Archive' button per note row in private-notes-tab.tsx with confirmation, filtering archived notes from the default Show Notes view
  1. Flip listPrivateNotes sort to chronological order (orderBy: createdAt asc) to match directive — or expose a toggle

### correspondence  ·  19✅ / 5🟡 / 6⬜

- **[MISSING · L · risk:high]** Acknowledgment and Attestations subtab (CURES, override/dismissal/drug-interaction acknowledgments); split pane style
  - `NEW` — No AcknowledgmentsTab component, no CURES attestation records surface, and no data model for override/dismissal acknowledgments in the correspondence tab. This is clinically significant — CURES and drug-interaction overrides have compliance weight.
- **[MISSING · L · risk:med]** Home Health Therapy plans subtab (PT, OT, ST, wound care, RT, etc.) within Correspondence
  - `NEW` — No HomeHealthTab component and no home-health plan records associated with the correspondence surface. Therapy plan data (PT/OT/ST/wound care/RT) is not present anywhere in the patient chart tabs.
- **[MISSING · M · risk:med]** Simple chart note in correspondence: free-text box with name/date, attachments (PDF, JPG, DOC), save/cancel; saved as 'simple note'
  - `NEW` — No SimpleNote component, no file attachment input, and no server action to persist a chart note from the correspondence surface. Only structured thread replies exist.
- **[MISSING · M · risk:low]** Clicking any urgency/category bubble (Urgent, High, Routine, Meds, refill, etc.) filters the inbox to show only threads with that tag
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-tab.tsx` — No activeFilter state, no filter controls above the inbox, and no filtering logic on visibleThreads for urgency/category bubble clicks. Bubbles in InboxRow are purely decorative.
- **[MISSING · M · risk:low]** Sub-ribbon of subtabs on the Correspondence Tab: 'Conversations' as a named subtab
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-tab.tsx` — No subtab ribbon exists under the Correspondence Tab. Other tabs (LSV, Images, Records) already implement this pattern via a local subtab state — correspondence has none.
- **[MISSING · M · risk:low]** Conversations subtab: 4 collapsible sections by communication type (staff-patient, provider-staff, provider-patient, provider-pharmacy) with named dividers and chronological order
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-tab.tsx` — All threads are shown in a flat inbox with no type-based grouping or collapsible section dividers. No participant-role metadata on threads to classify them.
- **[PARTIAL · S · risk:low]** Remove hover popup/summary when hovering over the Correspondence Tab
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — chart-tabs.tsx still fires peek popover (openKey state, onMouseEnter) for the correspondence tab when tabPeeks.correspondence is populated in page.tsx (line 472-477). Directive says remove this completely.
- **[PARTIAL · S · risk:low]** Subject field must appear ABOVE the To field in the composer
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-composer.tsx` — Directive specifies Subject above To. Composer renders To first (line 189), then Subject (line 245) — ordering is inverted.
- **[PARTIAL · S · risk:low]** Message box expandable by clicking/dragging the bottom-right corner (free-hand resize)
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-composer.tsx` — Directive asks for a bottom-right drag handle for free-hand expansion. Composer uses a toggle button ('Expand'/'Shrink') that switches between 4 and 12 rows — not a corner drag-resize.
- **[PARTIAL · S · risk:low]** Draft label 'DRAFT' shown in bottom-RIGHT of the inbox bubble for saved drafts
  - `src/app/(clinician)/clinic/patients/[id]/correspondence-tab.tsx` — Draft bubble (✏️ Draft) is rendered in the bubble strip row at left. Directive says the word DRAFT should appear in the bottom-right corner of the inbox message bubble itself, not as a left-aligned bubble chip.

  **Top build targets (best value/effort):**
  1. Clickable bubble filtering for inbox (Urgent/High/Routine/Meds/beige tags filter visibleThreads) — high UX value, low risk, self-contained state change in correspondence-tab.tsx
  1. Sub-ribbon 'Conversations' subtab with 4 collapsible communication-type sections — structural redesign that unlocks the section-divider layout directive
  1. Remove correspondence tab-level hover peek from chart-tabs.tsx — one-liner exclusion in the peek condition, directive is explicit
  1. Simple chart note with file attachment (PDF/JPG/DOC) — new composer mode + server action; needed for provider-side clinical documentation workflow
  1. Fix composer field order: Subject above To, and replace toggle expand with CSS resize or a bottom-right drag handle
  1. Acknowledgment and Attestations subtab (CURES + drug-interaction override log) — highest clinical/compliance risk gap on this surface

### images-leafanatomy  ·  13✅ / 10🟡 / 2⬜

- **[MISSING · L · risk:low]** DICOM image tracking to anatomical model location (atlas cross-reference while viewing DICOM)
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — No tracking logic exists — only a placeholder text string in the anatomy modal. Directive calls for active atlas registration: as provider views a DICOM, the anatomical model highlights the corresponding body region.
- **[MISSING · M · risk:low]** Non-DICOM images (PDF, JPG, PNG) should open in the same DICOM viewer box with zoom and annotation tools
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — ImageTile links to /documents/{id}/view in a new tab. There is no logic to detect file type and render PDF/JPG inside the DicomViewerPro box. Requires an inline PDF/image renderer with the same tools belt.
- **[PARTIAL · M · risk:med]** Right windowpane shows the full associated report attached to the image, not just a summary
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — The right pane (line 166-173) shows only CindySays 1-2 bullet summary and a note. Directive says the right pane should display the full report text associated with the selected image. Report content fetch/render is absent.
- **[PARTIAL · L · risk:low]** LeafAnatomy: visually stunning art-style anatomical model rivaling Disney/Pixar quality with real layer rendering
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — LeafAnatomyModal is a scaffold — a single 🧍 emoji with text placeholder (line 500-508). Layer checkboxes exist but do not alter the visual. Directive calls for a detailed, interactive multi-layer anatomical model. This is the largest missing visual deliverable.
- **[PARTIAL · M · risk:low]** Lightbulb/light toggle turns entire page background black in dark mode; light emoji shows 'on' state when background is light
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — Dark toggle only changes the viewer container div's background (bg-black vs bg-[#f5efe2]). The directive requires the whole page background to go dark. The emoji logic (💡 Light / 🌙 Dark) is close but icon semantics differ from doc spec — doc says 💡 'on' when light is on.
- **[PARTIAL · M · risk:low]** Annotation tools (label, mark, circle, highlight) on the anatomical model that persist alongside the image
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — There is a free-text annotation textarea in LeafAnatomyModal but no actual drawing/markup tools on the visual model. Saving routes through useChartLedger record() — no image-level persistence linking annotation to a specific image document.
- **[PARTIAL · S · risk:low]** Remove the 'upload' button from the Upload subsection
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — ImageDropZone still renders <ClinicianUploadForm> (line 305), which adds a full browse-and-upload control below the drag zone. Directive says remove the upload button; the header 'Upload an image' also persists.
- **[PARTIAL · S · risk:low]** Only .PNG, .JPG, .PDF, .TIFF, .HEIC, and DICOM files accepted — no non-imaging files
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — ImageDropZone correctly restricts to IMAGE_EXT, but ClinicianUploadForm (line 305) still uses the broad ACCEPT list including .doc, .xls, .csv, .txt etc., bypassing the imaging-only restriction.
- **[PARTIAL · S · risk:low]** Place share emoji and lightbulb emoji next to the DICOM Viewer section header (not in toolbar ribbon)
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — Both Share (📤) and dark-mode toggle (💡) are in the tools ribbon row, not adjacent to the h3 'DICOM Viewer' heading as the directive specifies.
- **[PARTIAL · S · risk:low]** Date format in DICOM viewer overlay must be MM-DD-YYYY not YYYY-MM-DD
  - `src/app/(clinician)/clinic/patients/[id]/dicom-viewer.tsx` — dicom-viewer.tsx line 241 renders studyDate as the raw ISO string (e.g. '2026-04-12'). The mmddyyyy helper exists in images-tab.tsx but is not imported or applied inside DicomViewer.
- **[PARTIAL · S · risk:low]** Replace dropdown menu for MR/modality selection in DICOM viewer with type-based categorization tabs/buttons
  - `src/app/(clinician)/clinic/patients/[id]/dicom-viewer.tsx` — dicom-viewer.tsx lines 167–183 render a <select> dropdown for study selection. Directive says remove dropdown and use categorized image type buttons instead.
- **[PARTIAL · S · risk:low]** 'Cindy Sees' in LeafAnatomy and DICOM context must be 3-5 bullet points covering AI interpretation, suggestions, and recommendations
  - `src/app/(clinician)/clinic/patients/[id]/images-tab.tsx` — cindyImageRead returns up to 5 bullets (.slice(0,5)) and uses voice:'sees'. However, the right-pane CindySays (line 167) uses cindyListSummary with voice:'says' and is described as '1–2 bullet' in line 169 — mismatched with the directive's 3-5 bullet spec for the imaging context.

  **Top build targets (best value/effort):**
  1. Date format fix in dicom-viewer.tsx (MM-DD-YYYY overlay, S effort, unambiguous)
  1. Move share+lightbulb icons next to DICOM Viewer h3 header (S effort, matches exact spec)
  1. Restrict ClinicianUploadForm in images context to imaging-only MIME types and remove upload button (S effort)
  1. Render non-DICOM files (PDF/JPG) inline inside DicomViewerPro box instead of external tab (M effort)
  1. Right pane: load and display the full attached report for the selected image (M effort, med risk for clinical data completeness)
  1. Cindy Sees right-pane: switch from cindyListSummary/1-2 bullets to cindyImageRead/3-5 bullets matching the imaging directive (S effort)

### billing  ·  14✅ / 18🟡 / 22⬜

- **[MISSING · M · risk:med]** Generate Tax Documents button at bottom of billing tab with popup (1099, W9, IRS health/payment forms)
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No 'Generate tax documents' button exists anywhere in billing/page.tsx. No 1099, W9, or IRS form generation UI anywhere in the patient billing surface.
- **[MISSING · M · risk:med]** Tax documents sendable via email and saveable to Correspondence tab
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No tax document generation feature exists at all; send + save-to-correspondence flow cannot be evaluated.
- **[MISSING · L · risk:low]** Encounter Financial Timeline row popup: 'Cindy suggests' AI panel (feather icon → probability of reimbursement/denial/resubmission)
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No AI suggestions panel exists anywhere in the billing surface.
- **[MISSING · L · risk:low]** Click-to-call and call waiting/hold-back feature in payer directory
  - `NEW` — No call feature at all. This requires telephony integration (WebRTC or PSTN relay) — no such infrastructure exists in the billing surface.
- **[MISSING · M · risk:low]** Click Insurance Pending header to open popup showing all claims from owner portal with status
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — The 'Insurance pending' BalanceLine (line 178) is a static display element with no onClick. No claims detail popup is attached to it.
- **[MISSING · M · risk:low]** Click Total Balance to open month-to-month cumulative graph popup with search and time/amount filter options
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — BalanceLine for 'Total balance' is a static server-rendered div. No onClick, no modal, no historical graph anywhere in the billing surface.
- **[MISSING · M · risk:low]** Click Patient Due to open month-to-month cumulative graph popup with search and time/amount filter options
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Same as Total Balance — static BalanceLine, no interactive popup or historical graph.
- **[MISSING · M · risk:low]** Click Overdue to open month-to-month cumulative graph popup with search and time/amount filter options
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Same pattern — Overdue BalanceLine is static, no popup or graph.
- **[MISSING · M · risk:low]** Credit Card: Print and Save buttons to the right of Amount box; Print generates formatted invoice with provider header, invoice number, date, amount, reference
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — Amount field has no Print or Save buttons. No invoice printing capability in collect-payment-form.
- **[MISSING · M · risk:low]** ACH: Print and Save buttons next to Amount; Print generates invoice with provider header, invoice number, date, amount, reference
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — No print/save capability for ACH payments.
- **[MISSING · M · risk:low]** CoPay Collected box: clickable, opens month-to-month cumulative graph popup with search and time/amount filters
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — MiniStat 'Copay collected' (line 243) is a static server component div. No onClick, no modal, no graph.
- **[MISSING · M · risk:low]** Patient Responsibility box: clickable, opens month-to-month cumulative graph popup with search and time/amount filters
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — MiniStat 'Patient responsibility' (line 263) is static. No interactive popup or graph.
- **[MISSING · M · risk:low]** Encounter Financial Timeline: click any row to open full detail popup
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Table rows (line 326) have hover styling but no onClick handler or modal. Rows are not clickable.
- **[MISSING · M · risk:low]** Encounter Financial Timeline: History button top-right showing resolved/closed claims
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No History button on the timeline section. Closed/resolved claims are included in the main query without being filtered out or separated.
- **[MISSING · M · risk:low]** Encounter Financial Timeline: Claims #, full status history (submission → processing → reimbursed → closed) in row detail
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Table shows current status only. No claim lifecycle history trail. Claim # column not present in the table.
- **[MISSING · M · risk:low]** Encounter Financial Timeline: click column headers to sort chronologically or numerically
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Column headers are static th elements (lines 300-309). No sort state, no onClick, no client-side sorting.
- **[MISSING · M · risk:low]** Insurance & Benefits: 'Directory' button to the right of Verify; popup showing payer department contacts with click-to-call phone numbers
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No Directory button. No payer department contact directory UI anywhere in the insurance section.
- **[MISSING · M · risk:low]** Payment Plan: 'Adjust' button that opens popup to adjust installment price, frequency, and patient reminder frequency
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — When a plan exists, the plan card (lines 491-535) shows plan details and progress bar but no Adjust button. PaymentPlanForm only appears when no active plan exists (line 538).
- **[MISSING · M · risk:low]** Statement History: click STMT header to open popup with full statement notice and details
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Statement rows have a 'View invoice →' link (line 612) but the statementNumber itself is not clickable for a popup. A link to an invoice sub-route exists but that is separate from a popup.
- **[MISSING · M · risk:low]** Statement History: collapsible tile view showing statement name, date, and amount when collapsed
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Statements render as flat cards (lines 561-634). No collapse/expand toggle per statement. EventLog has a global expand-all, but individual statement tiles have no collapsible state.
- **[MISSING · M · risk:low]** Statement History: share and print icons per statement (send via email, text, or print/save)
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — No share or print icons on any statement card. The invoice link goes to a separate route but does not expose email/text/print from the billing page itself.
- **[MISSING · M · risk:low]** Financial Event Log: share and print icons at right edge (send via email, text, or print/save the full log)
  - `src/app/(clinician)/clinic/patients/[id]/billing/event-log.tsx` — No share or print icons anywhere in the EventLog component or its wrapper in billing/page.tsx.
- **[MISSING · S · risk:low]** ACH payment: routing number, account number, bank name fields
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — ACH is listed as a method button but selecting it shows no additional fields — no routing number, account number, or bank name inputs.
- **[MISSING · S · risk:low]** Bitcoin payment option: add patient's crypto wallet and necessary fields
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — Bitcoin is not in the payment method list at all ('card', 'ach', 'cash', 'check' only, line 107).
- **[MISSING · S · risk:low]** Statement History: change 'plain language summary' label to 'Cindy says:'
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Section header reads 'Plain language summary' (line 623). Directive requires 'Cindy says:'.
- **[PARTIAL · M · risk:med]** Responsibility Breakdown: ensure no overlap between 'Patient due' in Current Balance and 'Patient responsibility' in breakdown
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Both fields exist (currentDueCents vs patientResponsibilityCents from getPatientFinancialSummary). Without reviewing the billing domain logic, there is no documented de-duplication guarantee between these two fields; they derive from different data paths (outstanding balance vs adjudicated claim responsibility).
- **[PARTIAL · M · risk:med]** Insurance & Benefits: 'Verify' button that, when verified, auto-populates the verification date
  - `src/app/(clinician)/clinic/patients/[id]/billing/insurance-verify.tsx` — InsuranceVerify component (line 458-469 in page.tsx) opens a popup with deterministic eligibility checks. However it is labeled 'Verify & cross-reference' and the checks are client-side derived from existing data — it does not trigger a live eligibility call or auto-update the eligibilityLastCheckedAt date.
- **[PARTIAL · M · risk:low]** Credit Card payment: 'Use card on file' and ability to add full card info (billing address, name, zip, number, expiry)
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — 'Use card on file' note is shown (line 126-128) but there is no form to add a new card with billing address, name, zip, card number, and expiry. Method selector exists but card entry fields are absent.
- **[PARTIAL · M · risk:low]** Cash payment: save to Correspondence tab for history/documentation, smaller receipt box, Print and Save buttons, invoice print
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — Cash method shows a Reference input (line 138-148). No auto-save to Correspondence tab, no receipt box (big or small), no Print/Save buttons, no invoice generation.
- **[PARTIAL · M · risk:low]** Check payment: save to Correspondence tab for history, smaller check# box, Print and Save buttons, invoice print
  - `src/app/(clinician)/clinic/patients/[id]/billing/collect-payment-form.tsx` — Check method shows a 'Check #' input (line 138-148). No auto-save to Correspondence, no Print/Save buttons, no invoice generation.
- **[PARTIAL · M · risk:low]** Deductible Applied box: clickable popup graph + fill bar showing remaining deductible
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Deductible progress bar exists (lines 436-456 in Insurance & Benefits, not in the Responsibility Breakdown section). But the deductible_applied MiniStat itself (line 255) is not clickable and has no popup graph.
- **[PARTIAL · S · risk:low]** Change 'Financial Cockpit' tab label to 'Billing'
  - `src/app/(clinician)/clinic/patients/[id]/chart-tabs.tsx` — Tab label in TABS array is 'Financial cockpit' (line 41) and the eyebrow in billing/page.tsx (line 115) reads 'Financial cockpit'. The h1 says 'Billing — …' but the tab chip and eyebrow still say 'Financial cockpit'.
- **[PARTIAL · S · risk:low]** Billing tab hover shows Total Balance, Patient Due, Insurance Pending (simple, no more info)
  - `src/app/(clinician)/clinic/patients/[id]/page.tsx` — Current peek popover (line 485-492) shows claim rows (payer name + billed amount + status). Directive says show only the three summary metrics. Peek data is claim list, not the three financial summary fields.
- **[PARTIAL · S · risk:low]** Patient name in billing header is clickable and navigates back to patient chart front page
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — A 'Back to chart' button exists (line 125-129) but the patient name (line 117) itself is not a link — it's plain text in an h1. Directive specifically requests clicking the patient name.
- **[PARTIAL · S · risk:low]** Current Balance bubble colors: Card on File=green, No Card on File=red, Cash only=yellow, Bitcoin=blue, On Payment Plan=beige
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Card on File shows tone='success' (green, line 161) and payment plan shows tone='accent' (not beige, line 163). 'No Card on File', 'Cash only', and 'Bitcoin' badge states do not exist — only Card/ACH/Cash/Check pills without red/yellow/blue color coding per directive.
- **[PARTIAL · S · risk:low]** Rename 'OOP Max' to 'Out-of-Pocket Max'
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Label is 'OOP max' (lowercase, line 429). Directive specifies 'Out-of-Pocket Max' (full expansion, title case).
- **[PARTIAL · S · risk:low]** Statement History: bubble colors — Sent=green, Pending=yellow
  - `src/app/(clinician)/clinic/patients/[id]/billing/page.tsx` — Badge tones: 'paid'=success (green), 'overdue'=danger (red), 'viewed'=accent (purple), default=warning (yellow lines 587-597). 'sent' status maps to no explicit case — would fall through to 'warning'. Directive requires 'Sent'=green specifically.
- **[PARTIAL · S · risk:low]** Financial Event Log: make entire section collapsible
  - `src/app/(clinician)/clinic/patients/[id]/billing/event-log.tsx` — EventLog has expand/collapse for items beyond initialVisible=5 (line 39), but the directive asks the entire section to be collapsible from a section-level toggle, not just paginated within the section.

  **Top build targets (best value/effort):**
  1. Clickable balance metrics (Total Balance, Patient Due, Insurance Pending, Overdue) with month-to-month graph popups and search/filter — covers 4 directives in one shared modal pattern
  1. Generate Tax Documents button + popup (1099, W9, IRS health forms) with email/save-to-Correspondence capability
  1. Encounter Financial Timeline interactivity: row click popup with full claim detail + history, sortable column headers, history button for resolved claims
  1. Payment Center completions: ACH routing/account/bank fields, Bitcoin crypto wallet option, Print/Save invoice buttons for all methods, cash/check save to Correspondence
  1. Statement History: collapsible tiles, 'Cindy says:' label rename, correct 'Sent'=green bubble, per-statement share+print actions
  1. Payment Plan: Adjust button on active plans (price, frequency, reminder cadence); Insurance Directory button with payer department contacts
