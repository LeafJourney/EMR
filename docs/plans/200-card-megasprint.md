# EMR Megasprint — 200 Card Backlog Division

This plan structures a 200-card megasprint curated from the active backlog. The tasks are partitioned into four parallel execution tracks: three tailored for **Claude Code** (frontend/client logic surfaces) and one tailored for **Codex** (backend schemas, infrastructure compliance, and migrations).

---

## Track 1: Claude Code (A) — Patient Portal & Wellness (50 Cards)

*Focus: Patient-facing routes, shop logic, loyalty systems, terms pages, educational components, and checkout profiles.*

1. **EMR-910**: Financial Event Log: keep audit history, collapsible, share/print, hover summaries
2. **EMR-909**: Payment Plan adjust + Statement History tiles with Cindy Says
3. **EMR-905**: Current Balance bubble colors, payment-method status, click-through history
4. **EMR-386**: Patient portal: add an ambient AI companion and patient agent presence
5. **EMR-385**: Patient portal: add a liquid-glass shell and card foundation
6. **EMR-384**: Patient portal: stabilize navigation and remove Recent from the left rail
7. **EMR-383**: EMR/Patient app: Apple-style emergency alert with one-tap 911 speakerphone
8. **EMR-378**: EMR: Records Management tab — AI auto-routes labs/images/PDFs into modular chart taxonomy
9. **EMR-375**: Cannabis Shop: Compare products (up to 3) side-by-side
10. **EMR-374**: Cannabis Shop: Research — Analytics Lab tab with patient trend heatmap & seasonal pattern detector
11. **EMR-371**: Cannabis Shop: Dosing guide disclaimer modal
12. **EMR-339**: [Dr. Patel] LeafMart Wellness Module — mirror LeafJourney's wellness/breathing/yoga/spirituality surface
13. **EMR-328**: [Dr. Patel] Advocacy tab: integrate Bizfed into LeafMart + LeafJourney advocacy surface
14. **EMR-289**: [Dr. Patel] SMS-driven post-purchase survey API (LeafMart)
15. **EMR-288**: [Dr. Patel] Education hub: cannabis outcomes, economic impact, alcohol/pharma comparisons
16. **EMR-314**: Rebrand rewards lexicon — "Seed Trove" system, "seeds" as currency, nurture/harvest/fruit metaphors
17. **EMR-313**: Loyalty/rewards system — points for purchases & surveys, unlock bonuses + spendable currency + gift cards
18. **EMR-545**: /education: default landing tab is the Cannabis Combo Wheel
19. **EMR-536**: Integrate cannabinoid + terpene wheels into single Cannabis Combo Wheel surface (cross-modality selection)
20. **EMR-556**: /terms: e-signature capture + DB record (signed copy, timestamp, IP, user)
21. **EMR-554**: /terms: AI-generated per-section summaries + total summary at end
22. **EMR-525**: Footer › Legal: wire Terms → /terms
23. **EMR-538**: /about: build per-role Apply pages for every Open Seat (route + JD + contact form)
24. **EMR-522**: Footer › Company: wire Careers → /contact-careers (founder email destination)
25. **EMR-558**: Contact form: backend /api/contact — email delivery to neal@ + scott@ and DB write
26. **EMR-557**: Contact form: build reusable component (Subject, Message, Send + honeypot)
27. **EMR-553**: /terms: draft full ToS body covering all 8 required sections
28. **EMR-544**: /education: rename "Chat & Learn Hub" → "Chat & Learn"
29. **EMR-543**: /about: remove "Interested in a leadership seat?" closing paragraph
30. **EMR-542**: /about: standardize JD + comp framework template across all C-suite seats
31. **EMR-541**: /about: add "Chief Revenue Officer" seat + write JD
32. **EMR-540**: /about: add "Chief Product Officer" seat + write JD
33. **EMR-539**: /about: replace "Chief HR Officer" with "Chief Regulatory Officer" + write JD
34. **EMR-537**: /about: attribute MyChart/MyStory quote to Dr. Neal H. Patel with em-dash
35. **EMR-535**: Build Terpene Wheel (matching cannabinoid wheel style + search) and seed terpene→strain mappings
36. **EMR-534**: Combo Wheel: add CBDV, THCA, CBDA to cannabinoid set
37. **EMR-533**: [Bug] Combo Wheel "Your Selection" panel: change font color to black so picks are visible
38. **EMR-532**: Append educational-disclaimer addendum to homepage bottom legal text
39. **EMR-531**: Copy: rename "Research corpus" → "Research Database" on homepage
40. **EMR-530**: Make LeafJourney Health header icon always link to / (home)
41. **EMR-529**: Remove "ambient noise" bubble + disable all autoplay sound on homepage
42. **EMR-528**: Wire every "Request a Demo" CTA on homepage → /sign-up
43. **EMR-526**: Age gate: remove "21+ notice" from leafjourney.com (keep on theleafmart.com)
44. **EMR-524**: Footer › Resources: wire Education → /education (every page)
45. **EMR-523**: Footer › Company: keep "Press" label, remove its hyperlink
46. **EMR-521**: Footer › Product: remove "Cannabis Combo Wheel" entry
47. **EMR-520**: Footer › Product: rename "LeafMart" → "The LeafMart" + link to theleafmart.com
48. **EMR-519**: Footer › Product: remove Operator Dashboard hyperlink
49. **EMR-517**: Footer › Product: wire Patient Portal → /sign-up
50. **EMR-516**: Footer › Product: reorder Patient Portal above Clinician Portal

---

## Track 2: Claude Code (B) — Clinician Workspace & SOAP EMR (50 Cards)

*Focus: Clinician-facing workspace (/clinic), note drafting templates, assessment dashboards, active vitals logging, longitudinal histories, and Rx flow overrides.*

1. **EMR-902**: Images subtabs with Cindy Says AI interpretation
2. **EMR-901**: DICOM viewer: share, annotate, dark mode, fullscreen, inline comments
3. **EMR-900**: Image list interactions: right-click recategorize, hover favorite, drag-and-drop uploads
4. **EMR-899**: Build LeafAnatomy: imaging+annotated anatomical model with 'Cindy Sees' AI
5. **EMR-897**: Assign each provider/staff a fixed color/avatar across the chart
6. **EMR-896**: New-message composer with directory search, call/video, attachments, draft save
7. **EMR-895**: Correspondence inbox split-pane with no-truncation summaries and bubble system
8. **EMR-894**: Remove Private Notes tab; surface as 'Private' label on Patient Chart card
9. **EMR-893**: Move med summary into Prescription Preview; show DEA on controlled prescribers
10. **EMR-892**: Pharmacy split-pane picker popup with address/phone/zip search
11. **EMR-891**: Co-locate Notes with Medication/Dosing and clean tip copy
12. **EMR-889**: CURES integration via provider login in clinic Settings + expanded attestation
13. **EMR-888**: Safety Check refresh: tiered colors, per-row acknowledge, justified red overrides
14. **EMR-887**: Restructure Dosing & Directions (drop-downs for dose/unit/frequency/days, free-text fallback)
15. **EMR-886**: Demote/relocate 'Cannabinoids open to' to patient intake
16. **EMR-885**: Replace product search subtraction with smart drop-down (all classes)
17. **EMR-884**: Prescribe Patient subsection: clickable name, photo, call/email shortcuts
18. **EMR-883**: Redesign prescribe module to be fewer clicks, fixed page, 2-3 mocks
19. **EMR-882**: Trim Patient Instructions and date Clinician Notes
20. **EMR-881**: Recent Dose Logs: emoji symptom tracker, Feather analytics, cannabis-only
21. **EMR-880**: Methods of Administration taxonomy (color-coded headers, beige examples)
22. **EMR-879**: Standardize Active Regimen bubble color/edit system
23. **EMR-878**: Collapsible Active Regimen rows: 4-column collapsed view, expanded prescription details
24. **EMR-877**: Floating '+' action menu (Rx/Note/Phone) on every chart page
25. **EMR-876**: Rename 'Active Regimens' to 'Active Medications' with editable rows
26. **EMR-875**: Interaction Check: per-row and bulk acknowledge/dismiss with justification
27. **EMR-874**: THC/CBD totals: accountant-style breakdown popups and Feather analytics
28. **EMR-873**: Rename 'Cannabis Rx' to 'Rx'; make cannabis/psilocybin fully modular
29. **EMR-872**: Vitals subtab with source bubbles (in-office/iWatch/Whoop/CGM/RPM) and date-range filters
30. **EMR-871**: Labs subtab with Quest/LabCorp directories and chronological breakouts
31. **EMR-870**: Assessment Scores subtab (GAD-7/PHQ-9/Pain VAS/MMSE/MOCA/etc.)
32. **EMR-869**: LSV tile cleanup (icons, date, send/print/save, return-to-route)
33. **EMR-868**: LSV 3-layer nav, hover graphs, split-pane viewer
34. **EMR-866**: Rename Labs tab to 'Labs, Scores, and Vitals' with latest-5 front view
35. **EMR-865**: Records search bar (AI-powered) and full subtab taxonomy
36. **EMR-864**: Clean up record note tiles (icons, date placement, color labels)
37. **EMR-863**: Drag-and-drop uploads with Cindy auto-routing and provider override
38. **EMR-862**: Records: 3-layer nav (Tab > Subtab > Tertiary Label) with split-pane viewer
39. **EMR-861**: Restrict Notes tab to provider notes with 2-pane editor and hover summary
40. **EMR-860**: Consolidate 'What We Remember About Maya' with collapse and personalization
41. **EMR-859**: Rename and add trend bubbles with emoji-only option
42. **EMR-858**: Rework 'Your Team Has Been Noticing' with bullets, colored bubbles, dismiss-all
43. **EMR-856**: Make Longitudinal Memory expandable with bubble drill-in popups
44. **EMR-855**: Preventative Screenings: USPSTF A/B grades, color coding, drill-in popups
45. **EMR-854**: Move Presenting Concerns and Treatment Goals into Clinical Decision Support tab
46. **EMR-852**: Merge Current Medications into chart card with click/right-click actions and new bubbles
47. **EMR-851**: Move Alerts under MR monogram with clickable popup + reminder use
48. **EMR-850**: Identity/Contact rework: SSN, rename Patient ID, emergency contact
49. **EMR-849**: Resize and color-code Adult/Medical-Life-Profile bubbles by sex
50. **EMR-848**: Open each Demographics subsection in its own editable detail page

---

## Track 3: Claude Code (C) — Practice Operations & Billing (50 Cards)

*Focus: Document inbox/outbox processing (/ops/documents), denial workflows, claim scrubbing, weekly schedules, and eligibility details.*

1. **EMR-986**: [ops/documents] Rename "View raw OCR text" to "View actual text" with full-size document + OCR viewer
2. **EMR-985**: [ops/denials] Add a beige "history" bubble that expands an audit timeline of every step since the denial
3. **EMR-984**: [ops/scrub] Improve "Claims requiring review" card legibility — larger/darker date·insurance·CLM, larger CPT codes, plain-language explainers, deep-link fix suggestions
4. **EMR-983**: [ops/documents] Add Insurance button on Extracted section linking to manual insurance entry
5. **EMR-982**: [ops/denials] Wire the "Take action" button to a 3-option modal (corrected claim, fix coding, peer-to-peer)
6. **EMR-981**: [ops/documents] Rename MRN bubble to MLN and standardize confidence/error/coverage bubble colors
7. **EMR-980**: [ops/billing] "Take action" on a denied claim: respond/refute/adjust + insurance routing, logged to patient Correspondence
8. **EMR-979**: [ops/scrub] "Top issues this week" — root-cause hover explainers, clickable bubbles that filter review list
9. **EMR-978**: [ops/denials] Tighten claim cards: fit urgency/green bubbles, drop redundant reason, verbatim payer letter, Cindy suggests
10. **EMR-977**: [ops/documents] Per-document Approve / Edit / Delete actions with route modal and 30-day trash
11. **EMR-976**: [ops/aging] Expand a Worklist balance box into an audit-grade A/R history timeline
12. **EMR-975**: [ops/scrub] Add filter affordance on "Claims requiring review" with historical/chronological search modal
13. **EMR-973**: [ops/billing] Expandable denied-claim rows with larger denial reason and full audit/history trail
14. **EMR-972**: [ops/aging] Restyle Worklist balance boxes: beige days-in-denial + colored insurance/patient bubbles, drop Ins/Pt amounts
15. **EMR-971**: [ops/denials] Rebuild detailed-claims filter bar: category dropdown + date + insurance + urgency bubbles
16. **EMR-970**: [ops/documents] Make OCR detail windows expandable/collapsible with clickable patient name → chart
17. **EMR-968**: [ops/scrub] Make stat tiles clickable — scroll to and re-title the lower review section
18. **EMR-967**: [ops/patients] Make missing fields clickable, deep-linking to that section of the patient chart
19. **EMR-966**: [ops/documents] Make stat tiles clickable to drill into filtered scan lists below
20. **EMR-965**: [ops/denials] Add provider-vs-peer comparative benchmarks to the payer denial graph
21. **EMR-964**: [ops/patients] Clickable email (draft/save/send popup) and phone (call now) in expanded row
22. **EMR-963**: [ops/billing] Make claims-table column headers sortable and columns draggable/add/removable
23. **EMR-962**: [ops/scrub] Rename "Clean & ready" to "Reviewed and ready" (green) + lighter-yellow Warnings box
24. **EMR-961**: [ops/aging] Rebuild Filter section: All dropdown, Days bubble, % recoverable bubble with bucket click-sync
25. **EMR-956**: [ops/denials] Denial Mix by Payer: clickable count → claims, payer graph + Cindy says popup, hover tooltips, in-box scroll
26. **EMR-955**: [ops/patients] Show patient age + sex under their name (e.g. "38F")
27. **EMR-954**: [ops/aging] Move Insurance A/R and Patient A/R legend under the distribution subtitle
28. **EMR-953**: [ops/billing] Rework status filter ribbon: labeled chips, persistent-red Denied, green active state, drag to reorder/add/remove
29. **EMR-952**: [ops/scrub] Build Prior Authorization hub: button + dynamic PA form + PA-engine plug-in registry
30. **EMR-950**: [ops/patients] Make expanded patient full name link to their chart home page
31. **EMR-949**: [ops/eligibility] Recommended Next Steps: clickable card-application link + deferred scheduling link
32. **EMR-948**: [ops/documents] Add Scan and Deleted Items buttons above Flagged-for-review (30-day trash with recover/delete)
33. **EMR-947**: [ops/denials] Denial Root Cause section: clickable count → claims, click-for-graph + Cindy says popup, hover tooltips
34. **EMR-946**: [ops/aging] Add feather-icon LeafNerd analytics popup with date/$ filters beside Aging buckets
35. **EMR-945**: [ops/billing] Enlarge KPI hint text and fix "process" → "progress" copy
36. **EMR-944**: [ops/scrub] Rename "Scrub" to "Scrub and Auths" across nav + page
37. **EMR-943**: [ops/patients] Color-code status bubbles (active=green, prospect=yellow, inactive=red)
38. **EMR-942**: [ops/eligibility] Findings: leaf-icon popups for USA cannabis-legality map and top-10 qualifying conditions
39. **EMR-941**: [ops/aging] Make the four KPI stat boxes clickable to drive the Aging buckets section
40. **EMR-938**: [ops/documents] Add Send button + compose modal with fax/email, attachments, and 90-day history
41. **EMR-937**: [ops/billing] Make the four KPI stat boxes clickable with LeafNerd-powered drilldown popups
42. **EMR-936**: [ops/schedule] Make "Providers This Week" cards clickable for a provider schedule snapshot in the Week View
43. **EMR-935**: [ops/denials] Recovery tile: graph recovery target vs actual recovered over adjustable ranges
44. **EMR-934**: [ops/documents] Render Outbox as chronological list with inbox-style identifiers
45. **EMR-933**: [ops/eligibility] Eligibility Result: default to insurance, add green/yellow/red status bubble
46. **EMR-932**: [ops/denials] Make the four hero KPI tiles clickable with scroll/filter/popup behaviors
47. **EMR-931**: [ops/billing] Rename "Billing workqueue" to "Billing Dashboard"
48. **EMR-930**: [ops/schedule] Add a filter button to the right of the Week View for date/time-frame range
49. **EMR-928**: [ops/documents] Add Inbox / Outbox tab structure
50. **EMR-927**: [ops/schedule] Right-click a patient row for a "Schedule" option that jumps to /clinic/schedule

---

## Track 4: Codex — Infrastructure, Compliance, DB Schemas & APIs (50 Cards)

*Focus: Database migrations, tenant boundaries, onboarding state wizards, modality configuration layers, HIPAA security checks, clearinghouse formats, and AI agent settings.*

1. **EMR-974**: [ops/mission-control] Add an Agent Fleet tab with a safe per-agent on/off toggle for every AI agent
2. **EMR-969**: [ops/mission-control] Agent Fleet — enlarge the Actions text and add a plain-language hover summary
3. **EMR-960**: [ops/mission-control] Let owners set default approve/reject decisions per workflow or job type
4. **EMR-958**: [ops/mission-control] Add Approve All / Reject All bulk actions to the Needs Approval tab
5. **EMR-951**: [ops/mission-control] All Jobs tab — chronological ordering plus plain-language hover tooltips
6. **EMR-940**: [ops/mission-control] Make status metric tiles clickable, linking Needs Approval to the approval tab
7. **EMR-788**: Domain model + Prisma schema for Supply + SupplyOrder
8. **EMR-790**: practiceManagerAgent meta-orchestrator
9. **EMR-789**: supplyReorderAgent — observe low stock, draft SupplyOrder
10. **EMR-411**: Epic 5 — Shell Rendering Engine
11. **EMR-409**: Epic 3 — Practice Configuration Object
12. **EMR-408**: Epic 2 — Specialty Template Registry
13. **EMR-410**: Epic 4 — Modality Control Layer
14. **EMR-407**: Epic 1 — Practice Onboarding Controller (wizard + state machine)
15. **EMR-472**: Rollback action — create draft from prior version
16. **EMR-471**: Version history list + diff view
17. **EMR-470**: Audit log — every state transition + field change
18. **EMR-441**: Server-side modality gate for routes & APIs
19. **EMR-428**: RBAC — restrict controller to Super Admin and Implementation Admin
20. **EMR-724**: E6 — SaaS Billing + AI Model Brokering (v2)
21. **EMR-723**: E5 — Audit & Versioning Surface
22. **EMR-421**: Step 2 — Select primary specialty
23. **EMR-636**: Compliance: cloud-only architecture verification + DR/BCP
24. **EMR-635**: Compliance: Medicare annual security assessment artifact
25. **EMR-633**: Compliance: HIPAA Privacy Rule + Breach Notification
26. **EMR-632**: Compliance: HIPAA Security Rule alignment + audit
27. **EMR-629**: Credentialing: continuous OIG/SAM/license monitoring + alerts
28. **EMR-628**: Credentialing: payer enrollment workflow per provider × payer
29. **EMR-627**: Credentialing: re-credentialing scheduler + document expiration tracking
30. **EMR-625**: Credentialing: provider profile + primary-source verification (PSV)
31. **EMR-622**: Clearinghouse: claim scrubbing / edits engine (CCI + payer-specific)
32. **EMR-621**: Clearinghouse: 276/277 claim status + 999/277CA acknowledgments
33. **EMR-619**: Clearinghouse: 835 ERA ingestion + auto-posting
34. **EMR-618**: Clearinghouse: 837P/837I claim submission engine
35. **EMR-581**: Wearables CDS — alert router with 24h Task deduplication (routeCDSTriggers)
36. **EMR-580**: Wearables CDS — pure-function rules engine (evaluatePatientCDS)
37. **EMR-582**: Wearables CDS — sync daemon cron route (Whoop → CDS engine → alert router)
38. **EMR-469**: Version snapshot table + write-on-publish
39. **EMR-457**: Source connectors — CSV upload + FHIR R4 stub
40. **EMR-456**: Import job runner (idempotent, resumable)
41. **EMR-453**: MigrationProfile schema + persistence
42. **EMR-444**: Module descriptor registry
43. **EMR-439**: isModalityEnabled — server + client check
44. **EMR-438**: Modality registry + slug enum
45. **EMR-436**: Status state machine + publish single-tenant constraint
46. **EMR-435**: Configuration CRUD API
47. **EMR-434**: PracticeConfiguration schema + migration
48. **EMR-430**: Registry service: list / get / applyTemplate
49. **EMR-429**: Specialty template schema + manifest format
50. **EMR-418**: Controller state machine + draft persistence (15 steps)
