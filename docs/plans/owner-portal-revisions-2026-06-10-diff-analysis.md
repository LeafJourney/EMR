# Owner Portal Revisions — Diff / Gap Analysis (v3, 2026-06-10)

**Source:** `Scott - LeafJourney Owner Portal Revisions.docx`
**Author:** Neal Patel · **Created/Modified:** 2026-06-10 · **Size:** 107 pages / ~32,773 words / 1,764 directive lines
**docx md5:** `8d84e66348b336bdb370fb237e062697` · **extracted-text md5:** `98a7afb2364c4a12ad321dabdee0ca90`
**Supersedes:** v1 (6.1.2026 → ingested as EMR-919..986) and v2 delta (6.5.2026 → EMR-1002..1074). This is the **cumulative master doc**, not a delta — it restates everything plus refinements.

> ⚠️ This is a desktop-only pass (`www.LeafJourney.com/ops`). Mobile is explicitly deferred ("Once this is fully cleaned up… I will begin going through the mobile site").

---

## 1. Reality check on scope

Every `/ops` page the document references **already exists** — the codebase has **123 `/ops` route pages** under `src/app/(operator)/ops/`. So this document is overwhelmingly a **revision/refinement pass on existing pages**, not a greenfield build. The exceptions are a handful of net-new backend "engines" (native clearinghouse/EDI, unified prior-auth, pre/post-service appeals, RCM analytics) that are partially present already (billing/EDI scaffolding shipped Phase 9 + Megasprint).

The directives fall into four very different buckets, and conflating them is the main risk:

| Bucket | What it is | Codeable now? | Volume |
|---|---|---|---|
| **A. Cross-cutting UI primitives ("MASTER prompt")** | Collapsible sections, sortable/movable tables, sidebar-autohide, autocomplete dropdowns, hover-tooltip charts, table export, AI search bars | ✅ Yes — build once, reuse everywhere. Highest leverage. | ~10 primitives × ~30 pages |
| **B. Per-page copy / color / layout tweaks** | Renames, bubble color systems, font sizes, "stop sidebar opening on button click", truncate+expand lists, move/merge tiles | ✅ Yes — cheap, mechanical, high volume | ~hundreds of small edits |
| **C. Backend mega-engines** | Native clearinghouse (X12 270/271/276/277/278/275/837P/835/999/277CA), unified prior-auth, appeals engines, RCM analytics, OCR document routing, QuickBooks bookkeeping/import | ⚠️ Partially exists; each is a multi-PR program of work | ~8 programs |
| **D. Non-codeable / administrative** | Medicare/UHC/Aetna/Cigna/BCBS direct EDI credentialing (30–90 days **per payer**), Submitter/Receiver IDs, BAAs, EHNAC/DirectTrust accreditation, SOC 2, mTLS cert provisioning, Surescripts/EPCS enrollment | ❌ Not something an agent can "implement" — these are legal/business onboarding tasks | ~6 items |

**Implication for "implement each change":** Buckets A + B are genuinely shippable in sprints and are where the visible "cleaned up, de-bugged, operational" payoff lives. Bucket C is real engineering but should be tracked as named programs, much of it already scaffolded. Bucket D must be surfaced honestly as out-of-scope-for-code (business/legal blockers), with code stubs + fallback (aggregator) paths where applicable — consistent with the "honest registry stubs" approach already taken (EMR-1096).

---

## 2. The MASTER prompt — global UI contract (Bucket A)

These recur on nearly every page; the doc explicitly says the MASTER prompt "merges or overrides" any conflicting per-page note. Build these as **shared primitives** once, then adopt per page. This is the single highest-value workstream.

| # | Primitive | Spec | Reuse target |
|---|---|---|---|
| G1 | **Collapsible sections** | Every "section" expandable/collapsible (title-only collapsed state) | All pages |
| G2 | **Sidebar overlay + autohide** | Sidebar layers on top (never hidden behind content) when viewport is narrowed/half-screen; **autohides** on every navigation and on forward/back; never re-expands when clicking in-page buttons (Log, Add, Delete, Generate, Archive…) | Global layout |
| G3 | **Autocomplete dropdowns everywhere** | Every search bar / dropdown / searchable field auto-populates **7** top page-specific matches as you type; site-specific, not global | Every input |
| G4 | **Global "search everything"** | A search icon at bottom-left of every page = full-directory query (search the whole "computer" vs one "folder") | Global layout |
| G5 | **Sortable table columns** | Click any column header to sort (chronological / hi-lo / alphabetical, type-appropriate) | Every table |
| G6 | **Table send/print/download** | Export any table (incl. column + row titles) | Every table |
| G7 | **Movable/rearrangeable tiles** | Drag-reorder every tile/section/table (the green-header boxes); add/remove columns | Every dashboard |
| G8 | **Per-section AI date/param search bar** | Search bar at far right across from each section header; AI-driven (Cindy) chronological/param filtering | Every section |
| G9 | **Compare mode** | Small checkbox top-right of each box → select ≥2 → "Compare" button appears across from header → popup overlays the measures on one chart | Every metric box |
| G10 | **Beautify popups + "feather" button** | Click a box → popup with full historical/chronological data, beautiful charts; "feather" icon re-beautifies / cycles chart types | Every metric box |
| G11 | **Hover tooltips on all charts** | Every graph: hover a datapoint → show value + time (X/Y), Google-Finance style. Applies to patient/owner/provider portals everywhere | Every chart |
| G12 | **Chrome-style tabs** | Any "tabs" should look/behave like the `/ops/cfo` tab strip (simple clickable Chrome-tab layout) | Pages w/ tabs |
| G13 | **Bubble color system** | Recurring semantics: green = active/positive/in-stock, yellow = caution/off-goal/medium, red = inactive/negative/critical, orange = low-confidence, purple = on-goal, blue = new-coverage | Every status bubble |
| G14 | **Truncate + expand lists** | Long lists show N (10/20/30) then truncate with an "expand/show more" that pages in +50 until fully shown | Every long list |
| G15 | **Archive pattern** | Resolved/aged items move to an Archive (button bottom-right) that pages 50 at a time + has its own MASTER-prompt search | Many pages |
| G16 | **"Cindy says/suggests" blocks** | AI analytics rendered under a labeled "Cindy suggests" header (2–4 short bullets), distinct from raw stats | Many pages |
| G17 | **Calendar-picker + free date range** | Date fields get a calendar icon + manual range entry | Many forms |
| G18 | **Educational content = "an experience"** | Training/policy/module content must be engaging; each module emits a 1-page fun printable summary (artwork + mnemonic devices: homonyms/anagrams/palindromes) | Training/Policies |

**Status:** Several of these exist in pockets (recent PRs hardened denials/scrub/billing dashboards, added schedule drag-to-reschedule). There is **no single shared primitive set** adopted uniformly — that's the gap. Recommend a `components/ops/master/` kit: `<CollapsibleSection>`, `<SortableTable>` (sort+export+column DnD), `<MetricBox>` (compare+beautify+popup), `<AutocompleteInput>`, `<ArchiveDrawer>`, `<CindyBlock>`, `<HoverChart>`, plus a layout fix for sidebar overlay/autohide.

---

## 3. Page-by-page catalog (status + key gaps)

Legend: **EXISTS** = route built; **REV** = revision/refinement requested; **GAP** = net-new behavior; status reflects codebase survey + prior ingestion (EMR-919..986 / 1002..1074), not line-level verification.

### Mission Control — `/ops/mission-control` · EXISTS · REV
- "Needs Approval" box links to `?tab=approval`; All Jobs sorted chronological; hover-explain each workflow job in plain terms.
- Need-Approval tab: **Approve all / Reject all**; per-workflow **default approve/reject** rule.
- Agent Fleet: bigger "Actions:" text; hover 1-sentence 3rd-grade summary per agent; a tab to toggle **each agent on/off** without harming platform integrity. *(ties to AgentSetting model, Megasprint P2 T4)*

### Schedule — `/ops/schedule` · EXISTS · REV
- Click every ribbon box (This week/Today/Confirmed…) → drill into Week View; Week-View **title changes** to the clicked box.
- Patient name → patient chart home; right-click row → "schedule" → `/clinic/schedule`; filter button (date/time range) far right.
- "Providers This Week" → click provider → snapshot in Week View, title → provider name. Keep on one static no-scroll page. *(drag-to-reschedule shipped #628)*

### Patients — `/ops/patients` · EXISTS · REV
- Right-click row → status change (Prospect/Active/Inactive) with bubbles (green/yellow/red).
- Expand row → click full name → chart front page; show age under name ("38F"); click email → draft/save/send popup; click phone → call; click "missing fields" → jump to that chart area.

### Command — `/clinic/command` · EXISTS · REV (structural)
- Consider **merging** `/clinic/command` content into `/ops`; remove the "Overview" tab, merge into Command Center tab. *(architectural — needs design decision)*

### Billing — `/ops/billing` · EXISTS · REV *(dashboards hardened #617/#630)*
- Rename "Billing workqueue" → **"Billing Dashboard"**.
- Total Billed / Collected / Pending Revenue / Outstanding boxes: click → LeafNerd analytics popup (per day/week/month/year); enlarge the sub-labels; copy fix "process"→"progress".
- KPI ribbon buttons: every count-bubble needs a word label; remove word-less buttons; drag/rearrange/add/remove categories; **Denied stays red** even unselected; others light green on click; **fix sluggish click responsiveness**.
- Column headers sortable (type-appropriate); drag/add/remove columns.
- Denied section: bigger denial-reason font; expand row → full claim history/audit trail; **"Take action"** → respond/refute/adjust, connect to payer dept, compose justification, send → audit trail into chart **Correspondence** tab.

### Scrub & Auths — `/ops/scrub` · EXISTS · REV + GAP *(Prior-Auth hub partly shipped, EMR-927..986)*
- Rename "Scrub" → **"Scrub and Auths"**; becomes the central hub for claims **and** prior authorizations.
- "Prior Authorization" button → fully modular PA form with API plug-ins: **Availity, CoverMyMeds, Innovaccer, Insight Health, ScribeRunner**.
- Copy: "clean and ready"→"reviewed and ready" (green); lighter-yellow Warnings; clickable summary boxes scroll to matching lower section + retitle it; filter popup; hover-explain root causes (incl. "Cindy is learning"); click bubbles → populate occurrences + retitle.
- Big embedded spec: **end-to-end billing pipeline** (RTE → auth → estimate → signed note → CCI scrub → payer-rule check → clean-claim). → Bucket C.

### Denials Command Center — `/ops/denials` · EXISTS · REV *(hardened #579)*
- 4 top boxes clickable (open denials → scroll; high urgency → filter red; total at risk / recovery → filter popup w/ time params; recovery target vs **actual recovered** dual-graph).
- Denial Root Cause / Denial Mix by Payer: click count → detailed claims; click cause/payer → graph popup + **"Cindy says"** (2–4 bullets) + provider-vs-peer comparison; hover one-phrase explainers; scroll-inside-box.
- Detailed claims: collapse urgency words; verbatim payer-letter italics; "suggested action"→**"Cindy suggests"** (≤3 words, tighter bubbles); **Take action** popup → 3 paths (corrected claim / fix coding / peer-to-peer); beige **History** audit bubble (denied→appeal→corrections→resolved timeline).

### Aging Workbench — `/ops/aging` · EXISTS · REV
- Top boxes drive Aging-buckets titles; feather→LeafNerd graph popup + filter; fix horizontal bar graphs; move Insurance/Patient A/R under the distribution title.
- Filter: collapse Insurance/Patient-only into an "All" dropdown; add **Days** dropdown (0-30/31-60…) synced with bucket clicks; add **% recoverable** dropdown.
- Worklist boxes: beige days-in-denial bubble; remove Ins/Pt split; insurance(yellow)/patient(purple) bubble; expand → audit history timeline.

### Eligibility — `/ops/eligibility` · EXISTS · REV + GAP
- Rename "cannabis eligibility checker"→"eligibility checker"; default to **insurance** eligibility (not cannabis); hide all cannabis/psilocybin UI if module opted out.
- Separate **"cannabis eligibility"** button (state MMJ-license likelihood) from insurance check; bubbles green/yellow/red = active/check/not-active.
- Embedded full **270/271 eligibility lifecycle** spec (service-type-code-by-specialty, AAA/EB/REF parsing, 3 triggers: schedule / 48h CRON / on-demand). → Bucket C.
- Findings: leaf-icon US legal-status map popup; qualifying-conditions top-10 list; ICD-10 search popup (autocomplete, add-to-dx); state MMJ application deep links; reflect deductible/coinsurance/visit-limits into `/portal/billing` "Your Insurance".

### Documents (Mail-Fax OCR) — `/ops/mail-fax` · EXISTS · REV + GAP *(documents hardened #579)*
- Rename "Mail & Fax OCR Inbox" → **"Documents Inbox and Outbox"**; two tabs **Inbox / Outbox**; outbox chronological w/ identifiers; top **Send** button (name + fax/email + message + attach → send, 90-day history).
- **Scan** + **Deleted items** (30-day recover/permanent-delete) buttons above "flagged for review".
- AI document routing: one centralized inbox auto-classifies type + patient + DOB + date → files into chart. → Bucket C.
- Box-click filters; collapsible OCR detail windows; approve/edit/delete (edit popup re-routes); MRN→**MLN** ("Medical Life number"); bubble colors (green/yellow/orange/red/blue); "insurance" jump button; "view raw OCR text"→"view actual text" (full-size PDF/JPG/DOCX, collapsible).

### Billing Agents — `/ops/billing-agents` · EXISTS · REV
- Add **light mode** (default light, not only dark). Defer LeafNerd integration until rest of EMR stable.

### Revenue — `/ops/revenue` · EXISTS · REV (heavy)
- Two tabs: **Claims billing** / **Product billing** (dispensary gross/net moves under Product).
- All subsections collapsible + draggable (Claims funnel, AR aging, Dispensary, Denial queue, Claim status breakdown, Provider productivity, Payer mix, Top billed codes).
- Top boxes → analytics popups (5-yr range) + "details" deep-links into `/ops/billing?status=…`; Outstanding aggregates submitted+partial+denied.
- Dispensary: SKU bubble thresholds (≤5 red / ≤20 yellow / ≥21 green); inventory units; merge Top-SKU into Inventory-on-hand; AI SKU search (phytocannabinoid/terpene/type/strain); wholesale-vs-retail popup; per-SKU sales analytics + product image; Gross/Refunds(reasons)/Tax(**QuickBooks-style** + IRS doc generator)/Net breakdown pages.
- Provider productivity list + feather-graph + compare; payer mix → also on `/ops/billing`, per-payer trend popups; Top billed CPT **and** new Top billed ICD-10 section.

### CFO suite — `/ops/cfo` (+ `/pnl /cash-flow /balance-sheet /expenses /cash /assets /liabilities /equity /goals /reports`) · EXISTS · REV (heavy) *(v2 ingest EMR-1002..1074)*
- **New `/ops/cfo/bookkeeping`** tab (QuickBooks-style ledger; upload `.QBW/.QBB/.QBM/.QBX/.QBA/.QBY`; export `.CSV/.XLS/.XLSX/.QIF/.IIF`; moves "Log New Expense"→"Log New Expense/Income"; income/expense bubbles green/red; "Recent income and expenses" 20+expand). → Bucket C-lite.
- CFO Briefing: stats-as-chart (gross margin/revenue/EBITDA/bank/working-capital), sentences become "Cindy suggests"; feather popup; strip `agent:cfo@1.0.0`.
- Headline KPIs: spell out KPI; per-section AI date search; compare-mode; beautify popups + hover tooltips; bubble colors (red/green/yellow/purple); collapsible + movable.
- Merge Anomalies&Flags into CFO Briefing; remove standalone graphs / "Revenue vs EBITDA 13wk"; promote P&L/Cash-Flow/Balance-Sheet to top.
- Recurring across every CFO subpage: top tiles under a **"Dashboard"/"Financial Dashboard"** header; MASTER-prompt compliance; **stop sidebar opening** on Log/Add/Delete/Generate/Archive; dropdown "Other → free text"; autocomplete remembered fields; delete-confirm popups; truncate+expand ledgers; remove stray green borders; runway happy/sad emoji + inline trend; reconciliation up/down arrows; rename "salvage"→"residual", "last synced"→"last reconciled"; assets/liabilities/equity tile groupings + column popups + sortable headers; reports print/download PDF + cadence dropdown.

### Staff Schedule — `/ops/staff-schedule` · EXISTS · REV
- One large block per shift (remove dots); larger headers; 24h Add-Shift range; per-employee colors; fix blank Print (green blocks must render); **flip axes** (employees as columns, dates as rows); click employee/type → "All shifts this week" retitles; remove-confirm popup; clickable week title + calendar picker.

### Time Clock — `/ops/time-clock` · EXISTS · REV + GAP
- **Clock keeps running after sign-off**; only "Clock out" stops it (server-side timer). MASTER prompt on tiles; Recent Activity 30+truncate + calendar search; export timesheet columns (time/type/date/hours in 0.1h).

### Training — `/ops/training` · EXISTS · REV + GAP
- Engaging content + 1-page printable summaries (Bucket-A G18); >1yr → Archive; **fix "Demo: assigned HIPAA Basics" error**; bubble colors (not-started/yellow/green/red); completed cert popup = beautiful PDF (Egyptian/Hindu-inspired border, official LeafJourney seal) — downloadable/printable/sendable; assign only to practice-linked people.

### Policies — `/ops/policies` · EXISTS · REV
- "All" → green check for completed (nothing for pending); MASTER-prompt search; **fix "Create New Policy" error** (Title/Description/Category + save/cancel; chronological insert); engaging content + printables.

### Incidents — `/ops/incidents` · EXISTS · REV
- Severity bubbles (critical red / high orange / low yellow/blue); MASTER prompt; click Title → full report popup (reported/resolved dates, resolver, resolution); resolved → archive (button + searchable archive); New Report color match; Category "Other → free text → 'Other (Clerical)'"; remove "short summary" placeholder.

### Supplies — `/ops/supplies` · EXISTS · REV
- Back-office/staff **Request** button (popup: request + dollar amount); MASTER-prompt search; 10+truncate w/ Archive (50 at a time); per-entry review/approve/cancel/modify + comments + send/cancel/resolve; show requester + time.

### Vendors — `/ops/vendors` · EXISTS · REV + GAP
- MASTER prompt; "Expiring < 30" → dropdown (≤60/≤90/custom numeric-only); click vendor → full info popup + payment/invoice history + **Tax documents** (W-9/1099, 10-yr); click phone/email → call/email; ordered contact display (title/phone/email, editable); category color assignment popup; brighter renew-soon red; date format dd-mm-yyyy; Add-Vendor Description field; new **Contract Started** column (+ days-in-contract); expiring tile 30→60 days.

### Feedback — `/ops/feedback` · EXISTS · REV
- Separate closeable tag bubbles; spell out **NPS**; 1-10 scale ↔ 3-4 emoji levels (numerically rankable); long-explanation popup; "action taken" tag → free-text staff name; Respond → **Send** button (real send); **Resolved** → archive (50 at a time).

### Marketing — `/ops/marketing` · EXISTS · REV
- MASTER prompt; colored "patients by source"; move CAC to its own tile (note: doc mislabels CAC as "Cash on Cash" — CAC = Customer Acquisition Cost; confirm intent); darker green conversion funnel; **fix Monthly-Trend graph not rendering**; ROI calculator monthly/quarterly/yearly options; **fix Spend not calculating**; **fix revenue==net bug**; AI suggestion block.

### Announcements — `/ops/announcements` · EXISTS · REV
- MASTER prompt; 7 tiles + see-more; expandable scrollable message thread (timestamps); hover emoji-reaction → who voted (one vote per person); archive/delete (manager/owner only); pinned-first chronological; Post Announcement Category "Other → free text".

### Analytics — `/ops/analytics` · EXISTS · REV (external doc)
- Defers to a separate **"LeafJourney Data Usage Revisions.docx"** (not in scope of this file) + MASTER prompt.

### Onboarding — `/ops/onboarding` · EXISTS · REV + GAP (large)
- Cross-check against the embedded **two full onboarding programs** (Process 1: compliance/identity/EDI/eRx/RBAC/templates/migration/training/go-live; Process 2: 6-phase 30-day timeline). Send discrepancies to neal@ + scott@leafjourney.com. → Bucket C/D (mostly process + integration enrollment).
- Green-button deep-links into the specific onboarding step; sidebar always autohide.

### Practice Launch — `/ops/launch` · EXISTS · REV + GAP
- Fix Refresh (real recompute); sidebar autohide; readiness/blockers/next-steps clickable deep-links; 15-day countdown drill-ins; collapsible printable Compliance checklist (clickable complete); rename exit→goal, blocker→blocked (+ explainer popups); Launch-day runbook color-coded roles + green-check/yellow-warn + download/print; merge in **WORKFLOW ONE** (7-step encounter→claim lifecycle) + **WORKFLOW TWO** (hour-by-hour go-live playbook incl. technical stress tests + downtime/Go-No-Go contingencies) without duplicating existing steps.

### Intake Builder — `/ops/intake-builder` · EXISTS · REV + GAP
- "add field"→"add new"; menu dismiss-on-click-away; placeholder titles; drag-reorder sections (hand icon) + delete-confirm; **Forms** button (saved templates, delete/archive→unusable); working field drag; adjacent "Edit field" tile; new "Section Heading" assignment dropdown (+ add-new) removed from field-type list; field-type shows actual symbols; required→"(optional)" label; Save Template → preview/print/download/share + edit round-trip.

### Data Export — `/ops/export` · EXISTS · REV + GAP
- Archive of past export cohorts (3-yr retention, then purge); **Other** format options (Protobuf/Avro/Parquet); searchable custom **Outcome Metrics** ("constipation"/"neuropathy"…) and **Additional Data** ("labs"/"vitals"/"age range") tiles via LeafNerd.

---

## 4. Backend mega-engines (Bucket C) — named programs

These are embedded multi-page technical specs. Much is already scaffolded (billing/EDI shipped Phase 9; prior-auth hub EMR-927..986; ERA/EOB/denials routes exist). Treat each as its own program, gap-fill against what's on `main`:

1. **Native Clearinghouse / X12 EDI engine** — direct payer connections; 270/271, 276/277, 277CA, 278, 275, 837P, 835, 999, TA1; AS2 + SFTP + CAQH CORE SOAP/REST; WEDI SNIP L1–7 validation; smart routing w/ aggregator fallback; payer connection registry. *(Routes present: `/ops/era`, `/ops/eob`, `/ops/billing/*`, `/ops/prior-auth`. Verify engine coverage in `src/lib/billing|edi|clearinghouse`.)*
2. **End-to-end billing pipeline** (Scrub spec) — RTE → auto-auth → estimate → signed-note → specialty CCI scrub → payer-rule check → clean-claim → submit; E/M & time-based calculators; 120h encounter-lock; NCCI/MUE; custom payer rule builder.
3. **Unified Prior-Auth engine** — Rule engine + criteria engine + transmission hub; **Medication PA** (NCPDP SCRIPT ePA via Surescripts/CoverMyMeds) and **Procedure PA** (X12 278 + 275 attachment); auth-expiration monitor; PA dashboard.
4. **Pre-service Auth Appeals engine** — 278-denial ingestion, urgency triage, peer-to-peer scheduler, InterQual/MCG guideline checklists.
5. **Post-service Claim Denials engine** — 835 ingestion, CARC→queue matrix, corrected-claim frequency-7 formatter, single-click appeal packet generator (835→chart mapping, AI argument generator, split-screen review, HIPAA 275 / e-fax / portal-RPA transmission, appeal clock tracker).
6. **RCM analytics** — Days-in-AR (<35), NCR (>96%), CCR (>98%); CARC/RARC heatmap; predictive scrubbing; RVU tracking; contractual underpayment engine. → LeafNerd.
7. **OCR document routing** — centralized inbox auto-classify (type/patient/DOB/date) → chart filing.
8. **Bookkeeping** — QuickBooks-style ledger, file import/export, IRS doc generation, P&L/deductions.

---

## 5. Non-codeable / administrative (Bucket D) — surface as blockers, not code

- Direct-EDI **payer credentialing** with Medicare (CMS MACs), UHC, Aetna, Cigna, Anthem BCBS — 30–90 days **each**.
- Production **Submitter/Receiver IDs**; **BAAs**; **EHNAC/DirectTrust** accreditation; **SOC 2 Type II**.
- **mTLS X.509** cert provisioning per payer; Surescripts/**EPCS** identity proofing (NIST 800-63B, ID.me); merchant onboarding (Stripe/Square).

Recommended handling: code the engines against a **sandbox/aggregator fallback** (Availity/Change Healthcare) so the product works end-to-end before direct connections are credentialed — exactly the "Hybrid Architecture" the doc itself prescribes. Keep registry/stubs honest (no fake "connected" states).

---

## 6. ⚠️ This doc is ALREADY ingested into Linear (verified 2026-06-10)

**Key correction:** This 6.10 file is the *same* cumulative doc (identical filename "Scott - LeafJourney Owner Portal Revisions.docx") already ingested into Linear as the **Owner Portal Revisions v1** project (`090120c2-…`): **EMR-919..986** (v1, 6.1 baseline) + **EMR-1002..1074** (v2, 6.5 delta) — **~141 cards, all in Backlog**. Cards are page+section granular, each with a `Directive ID`, source attribution, and an **"Accommodation / diff (current state)"** block that already cites the exact `src/app/(operator)/ops/...` files and line numbers.

Spot-checks confirming near-complete coverage of this doc:
- MASTER prompt → **EMR-1072**; hover-tooltips → **EMR-1073**; Chrome tab-layout → **EMR-1074**.
- staff-schedule **print fix** + per-employee colors → **EMR-1043**; axis flip → **EMR-1053**.
- time-clock persistent clock → **EMR-1062**; timesheet export columns → **EMR-1069**.
- revenue rename "Billing Workqueue→Billing Dashboard" → **EMR-1015**; tabs → **EMR-1034**.
- cfo cash-flow runway emoji → **EMR-1065**; bubble colors → **EMR-1071**.

**Implication:** Re-ingesting would **duplicate**, not enrich. The premise that this needed ticketing is false — the actual gap is **implementation** (the ~141 cards sit in Backlog). The right Linear action is to move the cards this work implements to In Progress/Done and comment the commit, **not** create new cards. New cards are warranted only for genuinely-missing items verified during implementation (e.g. Marketing ROI calc bugs, Training "Demo: assigned" stub, Policies "Create New Policy" error, the `/ops/cfo/bookkeeping` net-new tab).

> Baseline stored at `docs/directives/owner-portal/2026-06-10.txt` (md5 `98a7afb2…`) so the next revision can be diffed mechanically against this one.

---

## 7. Recommended implementation plan (sliced & prioritized)

**Slice 1 — MASTER-prompt primitive kit (Bucket A).** Build `components/ops/master/` (CollapsibleSection, SortableTable+export+column-DnD, MetricBox compare/beautify popup, AutocompleteInput, ArchiveDrawer, CindyBlock, HoverChart) + global sidebar overlay/autohide + "don't reopen sidebar on in-page button click". Highest leverage; unblocks every page. *(Buckets A)*

**Slice 2 — Cheap per-page copy/color/bug fixes (Bucket B).** Mechanical sweep: renames (Billing Dashboard, Scrub and Auths, Documents Inbox/Outbox, eligibility checker, MLN, residual/last-reconciled, process→progress), bubble color systems, font sizes, delete/remove confirm popups, truncate+expand, calendar pickers, and the explicit **bug fixes** (Training demo error, Create-New-Policy error, Marketing graph/Spend/revenue==net, staff-schedule blank print, time-clock server timer). Fast, visible "de-bugged + operational" wins.

**Slice 3 — Per-page interaction adoption.** Page-by-page adoption of the Slice-1 kit + the click-to-drill / popup-analytics behaviors, prioritized: Billing → Denials → Scrub → Aging → Revenue → CFO suite → Schedule/Patients → remaining ops pages.

**Slice 4 — Backend programs (Bucket C).** Gap-fill each engine against `main` (clearinghouse/EDI, prior-auth, appeals, RCM analytics, OCR routing, bookkeeping) — separate PRs, separate tickets, sandbox/aggregator fallback.

**Slice 5 — Administrative (Bucket D).** Track as business/legal blockers; not code.

**Linear:** do **not** re-ingest — this doc is already the Owner Portal Revisions v1 project (EMR-919..986 + EMR-1002..1074, all Backlog; see §6). As work lands, move the matching existing cards to In Progress/Done and comment the commit. Create new cards **only** for items verified absent (Marketing ROI calc bugs, Training "Demo: assigned" stub, Policies "Create New Policy" error, `/ops/cfo/bookkeeping`).
