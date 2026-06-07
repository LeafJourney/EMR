# EMR Megasprint Phase 2 — 200 Card Backlog Division

This plan partitions the 200 high-priority backlog cards for the operations, RCM, and scheduling sprint into four isolated execution tracks.

---

## Track 1: Claude Code (A) — Clinical Core & AI Visit Completion (50 Cards)
*Focus: Clinician-facing views, voice charting UI, prescription overrides, and post-finalization care plan release triggers.*

1. **EMR-016**: Full Prescription Form with Dropdowns + Manual Input
2. **EMR-020**: APSO Note Format with Wearable Integration
3. **EMR-021**: AI-Recommended Initial Treatment Plan
4. **EMR-052**: Clinical Trial Matching
5. **EMR-899**: Build LeafAnatomy: imaging+annotated anatomical model with 'Cindy Sees' AI
6. **EMR-897**: Assign each provider/staff a fixed color/avatar across the chart
7. **EMR-896**: New-message composer with directory search, call/video, attachments, draft save
8. **EMR-895**: Correspondence inbox split-pane with no-truncation summaries and bubble system
9. **EMR-894**: Remove Private Notes tab; surface as 'Private' label on Patient Chart card
10. **EMR-893**: Move med summary into Prescription Preview; show DEA on controlled prescribers
11. **EMR-892**: Pharmacy split-pane picker popup with address/phone/zip search
12. **EMR-891**: Co-locate Notes with Medication/Dosing and clean tip copy
13. **EMR-889**: CURES integration via provider login in clinic Settings + expanded attestation
14. **EMR-888**: Safety Check refresh: tiered colors, per-row acknowledge, justified red overrides
15. **EMR-887**: Restructure Dosing & Directions (drop-downs for dose/unit/frequency/days, free-text fallback)
16. **EMR-886**: Demote/relocate 'Cannabinoids open to' to patient intake
17. **EMR-885**: Replace product search subtraction with smart drop-down (all classes)
18. **EMR-884**: Prescribe Patient subsection: clickable name, photo, call/email shortcuts
19. **EMR-883**: Redesign prescribe module to be fewer clicks, fixed page, 2-3 mocks
20. **EMR-882**: Trim Patient Instructions and date Clinician Notes
21. **EMR-881**: Recent Dose Logs: emoji symptom tracker, Feather analytics, cannabis-only
22. **EMR-880**: Methods of Administration taxonomy (color-coded headers, beige examples)
23. **EMR-879**: Standardize Active Regimen bubble color/edit system
24. **EMR-878**: Collapsible Active Regimen rows: 4-column collapsed view, expanded prescription details
25. **EMR-877**: Floating '+' action menu (Rx/Note/Phone) on every chart page
26. **EMR-876**: Rename 'Active Regimens' to 'Active Medications' with editable rows
27. **EMR-875**: Interaction Check: per-row and bulk acknowledge/dismiss with justification
28. **EMR-874**: THC/CBD totals: accountant-style breakdown popups and Feather analytics
29. **EMR-873**: Rename 'Cannabis Rx' to 'Rx'; make cannabis/psilocybin fully modular
30. **EMR-872**: Vitals subtab with source bubbles (in-office/iWatch/Whoop/CGM/RPM) and date-range filters
31. **EMR-871**: Labs subtab with Quest/LabCorp directories and chronological breakouts
32. **EMR-870**: Assessment Scores subtab (GAD-7/PHQ-9/Pain VAS/MMSE/MOCA/etc.)
33. **EMR-869**: LSV tile cleanup (icons, date, send/print/save, return-to-route)
34. **EMR-868**: LSV 3-layer nav, hover graphs, split-pane viewer
35. **EMR-866**: Rename Labs tab to 'Labs, Scores, and Vitals' with latest-5 front view
36. **EMR-865**: Records search bar (AI-powered) and full subtab taxonomy
37. **EMR-864**: Clean up record note tiles (icons, date placement, color labels)
38. **EMR-863**: Drag-and-drop uploads with Cindy auto-routing and provider override
39. **EMR-862**: Records: 3-layer nav (Tab > Subtab > Tertiary Label) with split-pane viewer
40. **EMR-861**: Restrict Notes tab to provider notes with 2-pane editor and hover summary
41. **EMR-860**: Consolidate 'What We Remember About Maya' with collapse and personalization
42. **EMR-859**: Rename and add trend bubbles with emoji-only option
43. **EMR-858**: Rework 'Your Team Has Been Noticing' with bullets, colored bubbles, dismiss-all
44. **EMR-856**: Make Longitudinal Memory expandable with bubble drill-in popups
45. **EMR-855**: Preventative Screenings: USPSTF A/B grades, color coding, drill-in popups
46. **EMR-854**: Move Presenting Concerns and Treatment Goals into Clinical Decision Support tab
47. **EMR-852**: Merge Current Medications into chart card with click/right-click actions and new bubbles
48. **EMR-851**: Move Alerts under MR monogram with clickable popup + reminder use
49. **EMR-850**: Identity/Contact rework: SSN, rename Patient ID, emergency contact
50. **EMR-848**: Open each Demographics subsection in its own editable detail page

---

## Track 2: Claude Code (B) — Scheduling Command Center & Operations (50 Cards)
*Focus: Self-serve patient scheduler, waitlist logic, lobby check-in views, and scheduling dashboards.*

1. **EMR-206**: Self-Serve Online Scheduling (widget, inputs, and confirmations)
2. **EMR-207**: No-Show Prediction Model & Risk Warnings UI
3. **EMR-208**: Follow-Up Cadence UI configuration per condition
4. **EMR-209**: Smart Slot Recommender UI panels
5. **EMR-210**: Intelligent Waitlist UI & offers workflow
6. **EMR-211**: Multi-Channel Reminder Dashboard & preferences panel
7. **EMR-212**: New-Patient Intake-to-Visit Gate Pipeline UI
8. **EMR-213**: Group Visit, Block & Recurring Scheduling UI
9. **EMR-214**: Provider Preference Engine & Burnout Guardrails UI
10. **EMR-215**: Scheduling Analytics Cockpit dashboard
11. **EMR-912**: Pre-Visit Readiness & Kiosk → Phone Hand-off QR trigger view
12. **EMR-936**: Providers Week View provider schedule snapshots
13. **EMR-930**: Schedule Filter button & timeframe selectors
14. **EMR-927**: Schedule patient right-click context menu options
15. **EMR-919**: Labeled KPI metrics driving schedule view filters
16. **EMR-921**: Week View schedule overhauls (square drag, views)
17. **EMR-923**: Scheduled patient name links to chart
18. **EMR-920**: Insurance-first "Eligibility Checker" text layouts
19. **EMR-918**: Visit release completion payload validation screen
20. **EMR-943**: Color-coded patient status bubbles (active/inactive/prospect)
21. **EMR-950**: Expanded patient name links to chart home page
22. **EMR-964**: Clickable email/phone overlays inside search rows
23. **EMR-967**: Missing-fields warnings linking to demographics editor
24. **EMR-939**: Right-click patient status change context menus
25. **EMR-579**: Schedule header MM-DD-YYYY label update
26. **EMR-578**: Drag-to-rearrange blocks on Day/Week/List views
27. **EMR-577**: Right-click Schedule "New" block context menu
28. **EMR-574**: Return Schedule + Messages widgets to clinic main page
29. **EMR-568**: Clickable clinician dashboard top KPI tiles
30. **EMR-829**: DOB format changes to MM-DD-YYYY under patient name
31. **EMR-826**: Click-to-call/email demographics icons placement
32. **EMR-825**: Demographics patient photo upload via "+" overlay
33. **EMR-827**: Demographics PMH/PSH/Medications scrollable lists
34. **EMR-817**: Hover demographics popup overlays on tab
35. **EMR-816**: Reset schedule day metrics daily at 23:59
36. **EMR-388**: iCal/Google Calendar appointment share buttons
37. **EMR-399**: Address autocompletion on check-in forms
38. **EMR-489**: Onboarding digital packet registration screens
39. **EMR-487**: Patient intake screener scoring sliders
40. **EMR-422**: Care model onboarding type picker steps
41. **EMR-419**: Onboarding admin wizard progress layout
42. **EMR-595**: Telehealth new visit scheduling popups
43. **EMR-596**: Telehealth add-visit icon and video launch buttons
44. **EMR-571**: Today's queue clinical prioritization lists
45. **EMR-564**: Sticky left sidebar scheduler ribbons
46. **EMR-567**: RELAX button + rotating mindfulness modal
47. **EMR-573**: Quick research bar (cannabis/conventional toggle)
48. **EMR-926**: Merge command center Overview tabs
49. **EMR-924**: Cannabis eligibility check buttons layout
50. **EMR-922**: Operations main root page restoration checks

---

## Track 3: Claude Code (C) — Billing & Financial Dashboards (50 Cards)
*Focus: Denial management, clean claim scrubbing workbench, AR timelines, and mail/fax OCR processing interfaces.*

1. **EMR-986**: OCR actual text document viewer layouts
2. **EMR-985**: Denials audit timeline history bubbles
3. **EMR-984**: Denials claim card readability improvements
4. **EMR-983**: Extracted documents manual insurance deep-link buttons
5. **EMR-982**: Denials 3-option Action Modal (Claim Correction/Coding Fix/Peer-to-Peer)
6. **EMR-981**: Standardized MLN/MRN billing identifiers and confidence bubbles
7. **EMR-980**: Denial response/adjust overlays
8. **EMR-979**: Claim scrub top issues weekly widgets
9. **EMR-978**: Urgent claim card indicators and Cindy Suggests panels
10. **EMR-977**: Documents inbox Approve/Edit/Delete action modal routes
11. **EMR-976**: Accounts Receivable audit-grade histories
12. **EMR-975**: Claims search filters and chronological modals
13. **EMR-973**: Denied claim row expanders
14. **EMR-972**: Aging balance boxes beige restyling
15. **EMR-971**: Denials category dropdowns
16. **EMR-970**: Documents detail pane resizing
17. **EMR-968**: Stat tiles driving lower list selections
18. **EMR-966**: Documents inbox stat tiles filtering
19. **EMR-965**: Denial graph provider-vs-peer benchmark lines
20. **EMR-963**: Claims tables sortable and draggable headers
21. **EMR-962**: Reviewed and ready green status bins
22. **EMR-961**: Aging filter dropdowns and recoverable percent bubbles
23. **EMR-956**: Payer denial mix dashboards
24. **EMR-954**: Aging distribution AR legends placement
25. **EMR-953**: Labeled RCM filter chips
26. **EMR-952**: Prior Authorization Hub modal components
27. **EMR-948**: 30-day trash bins for documents and claims
28. **EMR-947**: Denial root cause comparative graphs
29. **EMR-946**: Billing aging LeafNerd analytics popups
30. **EMR-945**: Billing KPI hints text adjustments
31. **EMR-944**: Scrub and Auths dashboards page renaming
32. **EMR-942**: Cannabis legality state map overlays
33. **EMR-941**: Aging stat tiles driving list filtering
34. **EMR-938**: Outbox document composer modals
35. **EMR-937**: Billing KPI metrics popups
36. **EMR-935**: Denials recovery metrics targets graphs
37. **EMR-934**: Outbox document history lists
38. **EMR-933**: Insurance eligibility status badges
39. **EMR-932**: Denials hero metric cards clicking
40. **EMR-931**: Billing workqueue to Billing Dashboard renaming
41. **EMR-928**: Documents Inbox & Outbox tabs
42. **EMR-925**: Documents Inbox page renaming
43. **EMR-903**: Billing module title simplification
44. **EMR-905**: Balance bubble colors & payment method toggles
45. **EMR-906**: Branded invoice printing page
46. **EMR-907**: Financial timelines & patient liability summaries
47. **EMR-908**: Insurance verify directories overlays
48. **EMR-909**: Payment plan configuration adjustments
49. **EMR-910**: Collapsible Financial Event Logs
50. **EMR-376**: Billing & coding module AI scrape pane

---

## Track 4: Codex — Infrastructure, Compliance, DB Schemas & APIs (50 Cards)
*Focus: Prisma database migrations, X12 claim generators, ERA parsers, API gateway clients, and wearables rules engines.*

1. **EMR-216**: Real EDI 837P generator (ANSI X12 v5010)
2. **EMR-217**: Clearinghouse gateway client (Availity / Waystar / Change Healthcare)
3. **EMR-218**: Payer rules → DB model + admin editor
4. **EMR-219**: Secondary claim filing (Loop 2320 CAS)
5. **EMR-220**: Provider + Organization NPI + Tax ID schema
6. **EMR-221**: ERA / 835 raw-file ingestion pipeline
7. **EMR-222**: Full NCCI / MUE reference table (CMS quarterly)
8. **EMR-223**: Per-payer contract allowable tables
9. **EMR-224**: Lockbox / bank deposit matching
10. **EMR-225**: Patient statement auto-generator + e-delivery
11. **EMR-226**: Payment plan engine + card-on-file autopay
12. **EMR-227**: NSF / chargeback handler
13. **EMR-228**: Appeal tracker + outcome learning loop
14. **EMR-229**: Prior-auth workflow + payer portal adapters
15. **EMR-230**: RCM daily-close report + exception dashboard
16. **EMR-974**: [ops/mission-control] Agent Fleet tab + AgentSetting schemas
17. **EMR-969**: [ops/mission-control] Agent Fleet hover summary API
18. **EMR-960**: [ops/mission-control] Default approve/reject decisions per job type
19. **EMR-958**: [ops/mission-control] Bulk Approve All / Reject All handlers
20. **EMR-951**: [ops/mission-control] All Jobs chronological database indexes
21. **EMR-940**: [ops/mission-control] Metric tiles navigation API routes
22. **EMR-788**: Domain model + Prisma schema for Supply + SupplyOrder
23. **EMR-789**: supplyReorderAgent — observe low stock, draft SupplyOrder
24. **EMR-790**: practiceManagerAgent meta-orchestrator
25. **EMR-411**: Epic 5 — Shell Rendering Engine
26. **EMR-409**: Epic 3 — Practice Configuration Object
27. **EMR-408**: Epic 2 — Specialty Template Registry
28. **EMR-410**: Epic 4 — Modality Control Layer
29. **EMR-407**: Epic 1 — Practice Onboarding Controller (wizard + state machine)
30. **EMR-472**: Rollback action — create draft from prior version
31. **EMR-471**: Version history list + diff view
32. **EMR-470**: Audit log — every state transition + field change
33. **EMR-441**: Server-side modality gate for routes & APIs
34. **EMR-428**: RBAC — restrict controller to Super Admin and Implementation Admin
35. **EMR-724**: E6 — SaaS Billing + AI Model Brokering (v2)
36. **EMR-723**: E5 — Audit & Versioning Surface
37. **EMR-421**: Step 2 — Select primary specialty
38. **EMR-636**: Compliance: cloud-only architecture verification + DR/BCP
39. **EMR-635**: Compliance: Medicare annual security assessment artifact
40. **EMR-633**: Compliance: HIPAA Privacy Rule + Breach Notification
41. **EMR-632**: Compliance: HIPAA Security Rule alignment + audit
42. **EMR-629**: Credentialing: continuous OIG/SAM/license monitoring + alerts
43. **EMR-628**: Credentialing: payer enrollment workflow per provider × payer
44. **EMR-627**: Credentialing: re-credentialing scheduler + document expiration tracking
45. **EMR-625**: Credentialing: provider profile + primary-source verification (PSV)
46. **EMR-622**: Clearinghouse: claim scrubbing / edits engine (CCI + payer-specific)
47. **EMR-621**: Clearinghouse: 276/277 claim status + 999/277CA acknowledgments
48. **EMR-619**: Clearinghouse: 835 ERA ingestion + auto-posting
49. **EMR-618**: Clearinghouse: 837P/837I claim submission engine
50. **EMR-581**: Wearables CDS — alert router with 24h Task deduplication (routeCDSTriggers)
51. **EMR-580**: Wearables CDS — pure-function rules engine (evaluatePatientCDS)
52. **EMR-582**: Wearables CDS — sync daemon cron route (Whoop → CDS engine → alert router)
53. **EMR-469**: Version snapshot table + write-on-publish
54. **EMR-457**: Source connectors — CSV upload + FHIR R4 stub
55. **EMR-456**: Import job runner (idempotent, resumable)
56. **EMR-453**: MigrationProfile schema + persistence
57. **EMR-444**: Module descriptor registry
58. **EMR-439**: isModalityEnabled — server + client check
59. **EMR-438**: Modality registry + slug enum
60. **EMR-436**: Status state machine + publish single-tenant constraint
61. **EMR-435**: Configuration CRUD API
62. **EMR-434**: PracticeConfiguration schema + migration
63. **EMR-430**: Registry service: list / get / applyTemplate
64. **EMR-429**: Specialty template schema + manifest format
65. **EMR-418**: Controller state machine + draft persistence (15 steps)
