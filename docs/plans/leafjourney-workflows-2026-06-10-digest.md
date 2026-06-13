# LeafJourney WorkFlows — Owner Directive Digest (2026-06-10)

> **Status:** Documented (repo digest complete). **Linear filing resolved (2026-06-11):**
> reconciled into the existing **"WorkFlows Revisions — Zero-Click Ambient Intelligence"**
> project — its 6 greenfield capstone epics (`EMR-1118..1123`) were annotated with
> gap-verify-vs-`main` comments, and the two omitted net-new clusters were added as
> `EMR-1163` (Cannabis Compounding & Botanical Order Builder ⭐) and `EMR-1164`
> (Lifestyle & Protocol Prescribing). No duplicate project was created. The ranked
> clusters below are the backlog map for those epics' children. See [Gap Analysis](#gap-analysis).
>
> This is a **read/aggregate digest**, not a build order. The owner prompt is
> explicitly an *aggregation* directive ("use ALL data… remove all repetitive
> and superfluous data… merge and synchronize"), so most of what it describes
> overlaps work already shipped or already ingested (Patel chart revisions,
> Owner Portal revisions, the megasprint tracks). Treat every line as **gap-verify
> against `main` first**, not greenfield. See `MEMORY.md` for the prior-work map.

## Source & baseline

| Field | Value |
|---|---|
| Title | **LeafJourney WorkFlows** ("…Workflows Revisions") |
| Received | 2026-06-10 (iMessage attachment) |
| Original file | `LeafJourney Workflows Revisions.docx` (~2.07 MB, embedded diagram images) |
| Source md5 | `b25512d9129cb6182868adeaf9e1be9d` |
| Extracted text (canonical) | `docs/directives/leafjourney-workflows/2026-06-10.txt` (2,294 lines, ~38k words) |
| From | Owners — Neal & Scott (`neal@leafjourney.com`, `scott@leafjourney.com`) |

Extraction: `textutil -convert txt`. Note the `.docx` embeds ASCII flow diagrams
and several formula/table figures rendered as images; a few `[blank]` bullets in
the text correspond to images/figures that did not survive plain-text conversion
(formulas, FHIR-mapping tables, the compounding yield equation, etc.).

## The owner directive (verbatim prompt)

> as LeafJourney is starting to develop into a fully stand alone and functioning
> EMR, it is imperative that all AI agents are skilled and adept at being able to
> understand every workflow that is needed and having the ability and intelligence
> to execute, communicate amongst other AI agents and work collaboratively and
> collectively to make sure all workflows are smooth, efficient, and with as few
> glitches as possible. It is crucial that the EMR has all of these current
> workflows in place and to include all workflows from all of the revision word
> documents that have been sent already. Make sure to study and analyze these
> workflows in great detail and test drive it to make sure it actually works in
> real time. Now the bottom information is a detailed outline, but the AI agents
> must have the individual intellectual capacity to scour the internet for any
> issues and glitches that occur once the workflows are implemented and then test
> them. All errors and issues that occur should be documented and be filed into a
> PDF report that is then sent to the owners' emails at: neal@leafjourney.com and
> scott@leafjourney.com. … LeafJourney should be a beautiful, aesthetically
> pleasing, exciting, and engaging platform … If any workflows can be improved
> from an efficiency standpoint, then the AI agents shall make those changes and
> report them as well. … the other word documents and revision documents have
> already been working on the workflows for different aspects. The goal is for the
> AI agents to use ALL data and aggregate it, remove all repetitive and
> superfluous data and prompts, and to merge and synchronize all of the
> recommendations to provide a very robust, task oriented workflow for every part
> of our EMR. … the ultimate goal is to make all workflows to be with as few
> scrolls and as few clicks as possible for anyone using it. Make sure the AI
> agents have fun with this project and really use their creativity to make
> LeafJourney stand out and be a revolutionary new EMR.

### Standing instructions extracted from the prompt
1. **Aggregate, don't duplicate** — merge this with all prior revision docs; strip repeats. (Aligns with our gap-verify discipline.)
2. **Test-drive each workflow in real time** — verify behavior, not just code presence.
3. **Error-report obligation** — implementation issues should be compiled into a **PDF report emailed to neal@ + scott@leafjourney.com.** ⚠️ This is an outward-facing send; do **not** auto-email — surface findings to Scott for review/approval first.
4. **Efficiency mandate** — "as few scrolls and as few clicks as possible"; improvements are in-scope and should be reported.
5. **Aesthetic mandate** — Apple-grade, delightful (consistent with CLAUDE.md Dr. Patel directive).

---

## The 8 workflow domains

The body specs eight end-to-end domains. Each named sub-workflow below is
described in the doc as a 5–6 "Phase" pipeline with FHIR resource mappings,
terminology code bindings (ICD-10-CM / SNOMED-CT / LOINC / RxNorm / HCPCS),
EDI/X12 + NCPDP transactions, AI/NLP extraction layers, and cryptographic
sign-off. Line numbers reference the canonical extracted text.

### 1. Administrative & Patient Access (Front Desk) — line 6
Patient entry: identity, scheduling, financial clearing.
- **Patient Registration & Onboarding** (9) — OCR/vision ID + insurance-card capture → FHIR `Patient`/`Coverage`; dynamic context-aware intake → `QuestionnaireResponse`; unstructured legacy-record ingestion (PDF/C-CDA → NLP → ICD-10/SNOMED/LOINC/RxNorm) → dedup "Patient Knowledge Graph"; background RTE clearing; geofenced/QR arrival → AI pre-visit brief.
- **Insurance Eligibility Verification** (64) — EDI 270/271 RTE → AI "Cost Matrix" (copay/deductible/coinsurance); CPT-vs-payer pre-auth flagging. *(Largely a repeat of Reg phases 1–5.)*
- **Intake & Digital Consents** (119) — rule-engine consent-packet generation; SHA-256 signed FHIR `Consent`; conversational ROS intake; real-time conflict/completeness guardrails; chart hydration into draft note.
- **Scheduling & Appointment Management** (172) — dynamic variable slot-duration engine; FHIR `Schedule`/`Slot`/`Appointment` matrix; ML no-show scoring + soft double-booking; autonomous waitlist liquidation (top-3 SMS); lifecycle state machine; care-plan→appointment continuity loop.

### 2. Pre-Encounter & Clinical Intake (Nursing / MA) — line 226
Waiting room → exam room baseline.
- **Patient Rooming & Intake Queue** (228) — BLE/RFID room allocation; auto FHIR `Encounter` (in-progress); room-time timers.
- **Vitals & Anthropometric Capture** (310) — IoT cuff pairing (QR/NFC, IEEE 11073 / Welch Allyn Connex) → FHIR `Observation` stream w/ LOINC+UCUM; BMI/WHtR calc; Z-score outlier detection; critical-threshold alert router.
- **Allergy & Medication Reconciliation** (423) — PBM/HIE fill ingestion → RxNorm/UNII/SNOMED; RXCUI clustering; 3-pillar reconcile table; drug-allergy cross-reactivity (NDF-RT/MED-RT); botanical/lifestyle interaction screening.
- **Clinical Screenings** (465) — auto-injected PHQ-9 / GAD-7 / AUDIT / MMSE, LOINC-coded, auto-scored; PHQ-9 >10 → safety alert + prepended suicide-risk module.

### 3. The Clinical Encounter (Provider / Physician) — line 518
- **Chart Review / Longitudinal View** (520) — vector-embedding knowledge graph; natural-language chart query → cited AI synthesis; external-doc timeline pinning w/ hover summaries.
- **Clinical Charting & Note Generation** (564) — ambient AI scribe (TLS1.3 WebSocket, speaker diarization), OLDCARTS HPI/ROS, verbal-exam scribing; SHA-256 sign+lock → `Composition.final`; auto E&M (e.g., 99214) → EDI 837; patient CarePlan release.
- **Laboratory & Imaging Orders** (615) — ambient order extraction → LOINC/CPT staged checkout; ICD-10 medical-necessity cross-check (LCD/NCD); prior-auth resolver; order state-machine tracking; results triage (normal/abnormal/critical-value alarm loop).
- **Referrals** (663) — ambient referral harvest → SNOMED; in-network/sub-specialty/velocity/proximity matching; HIPAA-minimized C-CDA/FHIR packet; Da Vinci CRD/PAS auth; `ServiceRequest`+`Task` state machine; inbound loop-closure ingestion.
- **E-Prescribing (eRx) & Medication Management** (714) — ambient → RxNorm SCD; CDS Hooks renal (Cockcroft-Gault) + hepatic/CYP botanical filters; RTBC (NCPDP/Surescripts) + ePA; EPCS (IAL3, dual-factor, FIPS 140-2); FHIR `MedicationRequest`; RxFill closed-loop adherence.
- **Formulary & RTBC** (759) — async <1.8s benefit broker; copay transparency matrix; therapeutic-alternative swaps; QL/AR/ST utilization flags + step-therapy auto-bypass; `CoverageEligibilityResponse`/`MedicationKnowledge` logging. *(Heavy overlap with eRx Phase 2.)*
- **Diagnostics & Results Review Queue** (809) — HL7 ORU/FHIR ingestion + deterministic MPI matching; OCR/NLP of unstructured reports; FIB-4 & kinetic-delta calculators; urgency escalation matrix; single-pane sparkline workspace; FHIR `Provenance` sign-off (MIPS #122).

### 4. Post-Encounter & Care Coordination — line 852
- **Patient Discharge & Clinical Summaries (AVS)** (855) — auto-harvest med-changes/pending-dx/careplan/follow-ups; health-literacy translation (sig→plain language); color-coded med-recon grid; print + portal omnichannel; localization; FHIR `DocumentReference`; MIPS PI 24-hr attestation.
- **Encounter Sign-off & Locking** (896) — pre-flight integrity/coding/co-sign checks; AAL3 dual-factor; PKI (ECDSA/RSA) SHA-256 signature; immutable state transition + ACL/WORM lockdown; downstream event fan-out; non-destructive addenda (`relatesTo`).
- **Care Tracking & Task Management** (943) — ambient task extraction → SNOMED activity codes; protocol compound-task bundles; role/workload routing matrix; zero-search context cards; FHIR `Task` lifecycle; SLA escalation governance.

### 5. Revenue Cycle Management (RCM) & Billing — line 983
- **Charge Capture & Superbill Generation** (986) — ambient tri-vocabulary mapping (ICD-10-CM/CPT/HCPCS); MDM-based E&M leveling (99202–99215); NCCI PTP bundling + modifier optimization; FHIR `Claim` linkage; one-click authorize→billing queue.
- **Coding & Claim Scrubbing** (1042) — draft `Claim` instantiation; NCCI/LCD/NCD/MUE + commercial payer rule scrub; severity-sorted coder workspace; FHIR object lineage.
- **Claims EDI Transmission** (1084) — FHIR `Claim` → X12 837P compile; SHA-256 envelope → clearinghouse; 5-tier SNIP validation; async retry queue w/ exponential backoff; 277 status tracking.
- **Payment Posting & Denial Management** (1146) — 835 ERA parse; BPR-to-bank treasury reconciliation; CLP/MPI/DOS/NPI identifier matching; CARC/RARC denial routing → appeals queue; one-click appeal packet; clean-claim refactoring.

### 6. Interoperability & Platform Administration — line 1213
- **Role-Based Access Control (RBAC)** (1217) — JWT context eval; active-encounter relationship gating; HL7 sensitivity labels (e.g., behavioral-health) w/ care-team override.
- **Break-the-Glass Emergency Access** (1272) — standardized justification + AAL3 re-auth; ephemeral SMART-on-FHIR scoped JWT; CISO/privacy-officer paging; 4-hr auto-revoke + UI eviction; 24-hr reconciliation form.
- **Interoperability & Data Portability** (1320) — C-CDA R2.1 Schematron parse + OID sharding; NDC→RxNorm / LOINC / SNOMED normalization; dedup filter; SMART-on-FHIR OAuth2 scoped API; FHIR Bulk `$export` (NDJSON).
- **Patient-Generated Health Data (PGHD) Ingestion** (1547) — HealthKit/Google Fit/CGM/smart-scale/sleep pulls; downsampling; FHIR `Observation` trends.

*(The back third of this domain blends in platform-architecture recommendations:
**FHIR-Native Data Pipeline** (~1978) and **Open API & Plug-and-Play Integration**
(~2017, developer hub / sandbox keys / live "try-it-out" terminals / retry policies).)*

### 7. Complex & Non-Traditional Prescribing — line 1710  ⭐ cannabis-specific
Where standard eRx "stumbles": compound/botanical/cannabinoid medicine.
- **Custom Compound & Botanical Order Builder** (1713) — constituent-nesting ratio matrix (e.g., CBD:THC:CBN 20:1:2 @ 50 mg/mL/30 mL with auto raw-ingredient yield calc); multi-phase titration/taper orchestrator; reusable "Formulation Blueprints"; **jurisdictional THC mass / daily-supply guardrails**; dual-channel delivery (compounding-pharmacy eFax PDF **vs.** dispensary/e-commerce webhook API → Shopify Plus/ERP, SMS checkout link); nested FHIR `Medication`; patient visio-timeline + PROMs pulse surveys.
- **Lifestyle & Protocol Prescribing** (1768) — "prescribe" structured fasting/diet/mindfulness protocols with contraindication screening (e.g., block prolonged fast for ED/pregnancy history); programmatic fasting regimens (TRF, prolonged water fast w/ electrolyte + refeeding rules); macronutrient apportionment; autonomic/breathwork dosing table; phase-locked LMS content + knowledge-check gating; FHIR `CarePlan`+`Goal`+`ServiceRequest`; wearable-driven objective adherence score → drop-off flags.

### 8. Proactive Care Management & Asynchronous — line 1837
- **Automated Post-Encounter "Check-ins"** (1838) — DB-trigger enrollment on `MedicationRequest`/`CarePlan` active; per-therapy cadence (metabolic med day 3/7/14; fasting day 1/3/5; tincture day 3/14); SMS NLU → SNOMED/SIDER extraction → urgency score `Us` (Class 0 silent-chart / Class 1 low-pri / Class 2 red-flag escalation); FHIR `CommunicationRequest`/`Communication`/`Task`.
- **Asynchronous Care Pipelines** (1917) — store-and-forward photo/text submissions (skin lesion, home BP logs → MAP extraction); security broker; triage tiers; single-click sign-off macros; cumulative time-grouping for async billing; FHIR `DiagnosticReport`/`Media`/`Observation`.
- **External Document Ingestion** (2180) — 50-page outside-record OCR+LLM; layout-aware ICR; parallel templated extraction (surgical/specialist-impression/rare-condition); confidence-scored discrepancy queue → one-click ledger update (`DetectedIssue`→resolved).
- *(Also folds in a clinical **RAG / semantic-retrieval** pipeline — section-aware chunking, 512-token sliding windows, 1536-dim embeddings, hybrid dense+BM25 retrieval, source-validation reconciliation → `ClinicalImpression`/`Evidence`.)*

---

## Capstone future-state vision (doc tail)

A closing "north-star" section restates the AI thesis as four clusters (these are
re-summaries of the domains above, not new workflows):
1. **The Cognitive Clinical Co-Pilot** — inline non-interruptive insights (predictive insulin-resistance scoring from labs+wearables); prescription safety/optimization against multi-omic profile.
2. **Autonomous Revenue Cycle Management** — predictive denial auditing pre-837; automated prior-auth routing.
3. **Intelligent Patient Remote Orchestration** — async triage / smart check-ins w/ drafted responses; dynamic patient-facing AVS at the patient's literacy level + language.
4. **The "Zero-Click" Clinical Encounter Pipeline** — ambient synthesis to structured FHIR fields; autonomous order/script drafting (review-and-authorize only); real-time HCC/ICD-10 code justification.

---

## Cross-cutting technical themes (recurring across all 8 domains)
- **FHIR-native** resource modeling (Patient, Coverage, Encounter, Observation, MedicationRequest, ServiceRequest, Task, Consent, Composition, DocumentReference, Provenance, CarePlan, Claim).
- **Terminology binding** everywhere: ICD-10-CM, SNOMED-CT, LOINC, UCUM, RxNorm, HCPCS, RadLex, NDC, CARC/RARC.
- **Transactions:** EDI X12 270/271, 837P, 277, 835; NCPDP SCRIPT/RTBC/ePA; Surescripts RxFill; HL7 v2 ORU; C-CDA R2.1; Da Vinci CRD/PAS.
- **Ambient AI extraction → staged "unverified" candidates → one-click clinician reconcile** is the single most repeated pattern.
- **Cryptographic sign-off:** SHA-256 hash + AAL3/IAL3 dual-factor + PKI (ECDSA/RSA) + WORM/immutability + addenda-not-edits.
- **Closed loops:** referral loop, RxFill adherence, results sign-off, task SLA escalation, check-in escalation.
- **UX north star:** fewest scrolls/clicks; single-pane workspaces; no pop-ups.

---

## Gap Analysis

**Headline finding (gap-verified 2026-06-11 via 8 parallel code-search sweeps):**
the codebase already implements an estimated **~70–80%** of this doc. Every domain
has shipped engines/UI; the doc is a re-statement of largely-built work, exactly as
its "aggregate, don't duplicate" prompt implies. Genuine net-new work clusters into
(a) **Domain 7 cannabis/botanical compounding + lifestyle-protocol prescribing**,
(b) **stub→real integrations** (270/271, RTBC, Surescripts/EPCS, SMART-on-FHIR,
break-the-glass), and (c) **a clinical RAG/semantic layer**.

Verdict legend: ✅ DONE · 🟡 PARTIAL · ❌ MISSING. Evidence paths in the per-domain
sub-sections below the table.

| # | Domain | Sub-workflow verdicts | Net-new gaps (candidate work) |
|---|---|---|---|
| 1 | Front Desk | Registration ✅ · Eligibility 🟡 · Consents ✅ · Scheduling ✅ | **270/271 is mocked** (`eligibility-client.ts` simulates); no multi-provider calendar render; SHA-256 consent hashing not wired; no legacy PDF/C-CDA ingest executor; ID-card vision not production-wired |
| 2 | Pre-Encounter Intake | Rooming ✅ · Vitals 🟡 · Med/Allergy Recon 🟡 · Screenings ✅ | Vitals **LOINC/UCUM coding + adult BMI/WHtR + Z-score outliers + critical-vital CDS**; no height field; PBM/HIE med ingestion + RxNorm/UNII mapping + dedup clustering; PHQ-9>10 safety alert |
| 3 | Clinical Encounter | Charting ✅ · Chart Review 🟡 · Lab/Img Orders ✅ · Referrals 🟡 · eRx 🟡 · RTBC ❌ · Results ✅ | **RTBC real benefit check** (stub only); eRx **CDS renal/hepatic/CYP-cannabis** safety; **EPCS** controlled-substance signing; **ePA**; **Da Vinci CRD/PAS** + C-CDA referral packet + inbound loop closure; ambient continuous scribe; semantic chart query (RAG); LCD/NCD necessity check; FIB-4/kinetic-delta calculators |
| 4 | Post-Encounter | AVS 🟡 · Sign-off/Lock 🟡 · Task mgmt 🟡 | AVS **med-recon grid + auto portal delivery + MIPS 24-hr attestation** (+ localization); clinician-note **PKI signature + AAL3 step-up at sign**; WORM/addenda(`relatesTo`) model; task **SLA escalation** + ambient extraction |
| 5 | RCM & Billing | Charge capture ✅ · Scrubbing ✅ · EDI tx ✅ · Payment/Denial ✅ | (most mature domain) **LCD/NCD commercial-payer scrub** (only Medicare-CBD today); **coder workspace UI**; **algorithmic MDM E&M leveling**; FHIR `Claim` export; 999 AK9 auto-retry |
| 6 | Interop & Platform Admin | RBAC ✅ · Privacy/sensitivity ✅ · FHIR R4 ✅ · PGHD ✅ · Dev hub/webhooks ✅ · Break-glass 🟡 · SMART-on-FHIR ❌ · Bulk $export 🟡 · C-CDA 🟡 | **Break-the-Glass full workflow** (justification + re-auth + ephemeral token + CISO alert); **SMART-on-FHIR OAuth2 launch**; **C-CDA generate + parse** (Schematron); bulk `$export` beyond Patient/sync; NDC→RxNorm lookup; live API "try-it-out" console |
| 7 | Complex/Non-Traditional Rx ⭐ | Compound builder ❌ · Ratio/yield 🟡 · Titration 🟡(stub EMR-272) · Blueprints ❌ · THC guardrails 🟡 · Dual-channel 🟡 · Lifestyle Rx 🟡 | **THE BIG NET-NEW.** `CompoundFormulation`/`FormulationBlueprint` models + ratio builder UI (CBD:THC:CBN) + yield calc; **finish `TitrationScheduleItem` (EMR-272 is an empty stub)**; `LifestyleProtocol` model + FHIR `CarePlan`/`Goal`/`ServiceRequest`; `CompoundingPharmacyOrder` eFax + dispensary/Shopify webhook; jurisdictional THC-mass limit enforcement; adherence PROM + wearable scoring |
| 8 | Proactive/Async | Check-ins 🟡 · SMS NLU 🟡 · Escalation ✅ · Async pipelines ❌ · Ext-doc ingest ✅ · RAG ❌ · Async billing ❌ | **Async care pipeline** (patient photo/BP submission + image broker + review macros + cumulative-time async billing codes); **Clinical RAG/semantic retrieval** (embeddings + hybrid dense/BM25 + source-validation → `ClinicalImpression`/`Evidence`); med/CarePlan-triggered check-in enrollment + SNOMED/SIDER NLU; `DetectedIssue` reconcile queue |

### Per-domain evidence (selected)
- **D1:** `eligibility-client.ts:41` mock 800ms; `EligibilitySnapshot` schema ✓; `registration-packet.tsx`, `consent-view.tsx` ✓; `scheduling/{no-show-model,waitlist,intake-gate,previsit-readiness}.ts` ✓; `domain/ensure-encounter.ts` ✓.
- **D2:** `domain/queue-board.ts`+`visit-state.ts` ✓; `clinical/vitals-catalog.ts` (no LOINC/height); `clinical/allergy-profile.ts` (8-family keyword cross-react only); `intake/{phq9,gad7,cudit}-screener.tsx` + `assessment-catalog.ts` ✓ (no >10 alert in `cds/alerts.ts`).
- **D3:** `notes/[noteId]/note-editor.tsx` + `agents/scribe-agent.ts` + `clinical/voice-dictation.ts` ✓; `api/integrations/rtpb/route.ts` skeleton; `api/integrations/surescripts/transmit/route.ts` stub; `domain/referral-packet.ts` ✓ (no Da Vinci); `clinical/result-signoff.ts` ✓.
- **D4:** `leaflet/{page,actions}.tsx` + `domain/plain-language.ts` ✓ (no med-recon grid / auto-send); `NoteStatus` lock ✓ but `auth/mfa-gate.ts` not tied to sign; `ops/tasks` + `Task` model ✓ (no SLA auto-escalation).
- **D5:** `billing/{scrub,ncci-mue,edi/edi-837p,era-parser,remittance,appeal-tracker}.ts` + `clearinghouse/gateway.ts` ✓; `medicare-cbd-rules.ts` only (no commercial LCD/NCD).
- **D6:** `rbac/permissions.ts` (6+ roles, chart-restriction, sensitivity) ✓; `platform/fhir.ts` (5 resources) ✓; `integrations/{healthkit-normalizer,dexcom-client,libre-api,eversense-parser}.ts` ✓; `developer/*` hub ✓; `api/emergency/[token]/route.ts` partial break-glass; `api/integrations/fhir-bulk/route.ts` Patient-only.
- **D7:** `CannabisRx`(THC+CBD only)/`DosingRegimen`/`DoseLog` schema; `agents/titration-scheduler-agent.ts` = stub (EMR-272); `cannabis-dosing-protocols.ts` hardcoded; **no** `CompoundFormulation`/`FormulationBlueprint`/`LifestyleProtocol` models; FHIR `CarePlan`/`Goal`/`ServiceRequest` mappers absent.
- **D8:** `api/cron/post-op-checker/route.ts` + `scheduling/send-reminders.ts` ✓; `domain/smart-inbox.ts` keyword triage; `agents/message-urgency-observer-agent.ts` ✓; `clinical/ocr-extract.ts` ✓; **no** vector/embedding/BM25/RAG anywhere; **no** patient async photo/BP submission API.

### Standing-instruction status (from owner prompt)
- **Error→PDF→email owners:** mechanism not built; and it's an outward-facing auto-send — recommend a *reviewed* report, not an automated email. ❌ (by design — hold for Scott's call)
- **"Few scrolls/few clicks" efficiency + Apple aesthetic:** ongoing program (Owner Portal Slice-2 copy/color sweep, doc cockpit). 🟡

## Net-new gap register → candidate Linear issues

> **Filing discipline (task #4):** before creating ANY issue, search Linear for an
> existing ticket/project. Several gaps map to existing tickets — enrich those, don't
> duplicate. **No bulk auto-creation** — confirm the filing list with Scott first
> (outward-facing).
>
> **Linear recon (2026-06-11) — existing tickets that net-new gaps must dedup against:**
> - **EMR-146** "BIG: Cannabis Pharmacology + Prescription Module" — *Done*; natural **parent** for Domain-7 compounding work.
> - **EMR-272** "Cannabis Pharmacology Fleet (12 agents)" — *Done*; its `titrationScheduler` is a **stub agent** (so a real titration/taper orchestrator = net-new, relates to EMR-272/146).
> - **EMR-10** (EMR-154) "FDA Rx + Cannabis Rx + Supplement modules" — *Backlog*; relates to compound builder.
> - **EMR-37** "Multi-Medication Prescribing + Double-Check" — *Backlog*.
> - **EMR-664** "/clinic/sign-off/refills split-pane + e-sign" — *Done*.
> - **EMR-396** "Three-tier AI treatment: lifestyle / OTC / Rx" + **EMR-5** "LIFESTYLE module" (*Done*) — relate to **Lifestyle/Protocol Prescribing** gap.
> - **EMR-840 / EMR-841 / EMR-846** (`patel-directive`) — clinical interaction/risk-flag/Cindy pipeline; overlap Domain-2/3 CDS gaps.
> - **EMR-192** ambient prescription-safety agent — *Done*; relates to eRx CDS gap.
>
> **Labels:** `patel-directive` exists (Patel doc pattern); no `owner-portal`/`workflows-directive` label surfaced — would create `workflows-directive` to match the established per-directive label convention.
> **Projects:** issues live in **Clinician Workflow Streamline v1**, **Marketplace v1**, web-polish, etc. Per prior pattern a dedicated **"LeafJourney Workflows Revisions"** project + label is the clean home for net-new gap tickets — but since the user chose *gap-only*, an alternative is to file gaps into the existing relevant projects linked to the parents above.

Ranked clusters (highest net-new value first):
1. **Cannabis Compounding & Botanical Rx (Domain 7)** — compound formulation/ratio builder + blueprints + yield calc; finish titration (EMR-272); jurisdictional THC guardrails; dual-channel delivery (eFax + dispensary/Shopify webhook). *Most net-new; aligns with CLAUDE.md product thesis.*
2. **Lifestyle / Protocol Prescribing (Domain 7)** — `LifestyleProtocol` model, fasting/diet/mindfulness builder, phase-locked LMS, FHIR CarePlan/Goal/ServiceRequest, wearable adherence score.
3. **Stub→real integrations** — live 270/271 eligibility; RTBC; Surescripts/EPCS/ePA; SMART-on-FHIR OAuth2; full break-the-glass workflow; C-CDA generate+parse.
4. **Clinical safety/CDS gaps** — eRx renal/hepatic/CYP-cannabis checks; vitals LOINC + critical-vital alerts; PHQ-9>10 safety alert; LCD/NCD medical-necessity.
5. **Clinical RAG / semantic layer (Domain 8)** — embeddings + hybrid retrieval + source-validated synthesis (powers chart-query + ambient + denial-prediction).
6. **Async care pipeline (Domain 8)** — patient photo/BP store-and-forward + review macros + cumulative-time async billing.
7. **Post-encounter polish** — AVS med-recon grid + auto portal delivery + 24-hr attestation; clinician-note PKI signature + AAL3 step-up; task SLA escalation.

### Prior directive ingestions this overlaps (do not re-file)
- **Patel chart revisions** — `docs/plans/patel-chart-revisions-buildout.md` (525-directive gap map).
- **Owner Portal revisions** — `docs/plans/owner-portal-revisions-2026-06-10-diff-analysis.md` + `docs/directives/owner-portal/2026-06-10.txt`.
- **Megasprint tracks** (clinical chart kit, billing/EDI, scheduling, infra) — see `MEMORY.md`.
