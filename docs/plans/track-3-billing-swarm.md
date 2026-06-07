# Claude Code Swarm Instructions: Track 3 — Billing & Financial Dashboards

You are assigned to **Track 3: Billing & Financial Dashboards**. Your primary focus is on billing workqueues, denial workflows, OCR document reviews, accounts receivable (AR) aging charts, and invoice printing utilities.

## Swarm Operational Directives

### 1. Launch Command
Execute your development sessions using the following run command:
```bash
claude --dangerously-skip-permissions
```

### 2. Operational Rules & Security (RCM & Hardening Directives)
- **Standardized Identification:** Ensure MRN (Medical Record Number), MLN (Medicare Learning Network reference), and claim ID numbers are formatted consistently across views with security hashes on export.
- **Audit-grade Histories:** All billing adjustments, claim rewrites, and ledger edits MUST populate a chronological log showing which clinician/operator initiated the transaction.
- **Vanilla CSS styling:** Rely on standard CSS variables (`DESIGN_SYSTEM.md`). Do not import new grid styling plugins or frameworks.

---

## Technical Goals & Target Paths

Most of your changes will target:
- `src/app/(operator)/ops/denials/` (Denial workflow, modal dialogs, graphs)
- `src/app/(operator)/ops/aging/` & `src/app/(operator)/ops/cfo/` (AR aging timelines, statistics)
- `src/app/(operator)/ops/scrub/` (Claim validation widgets, billing rules)
- `src/app/(operator)/ops/mail-fax/` (OCR text overlays, image viewer)
- `src/app/(operator)/ops/billing/` (Payment methods, invoices, payment plans)

---

## 50 Backlog Cards Specification

Execute development and logical fixes for the following cards:

1. **EMR-986 (OCR Text Viewer Layouts):** Side-by-side split screen showing uploaded fax scan on the left, and parsed OCR text fields on the right.
2. **EMR-985 (Denials Audit Timeline):** Vertical timeline tracking claim revisions, submissions, rejections, and appeals history.
3. **EMR-984 (Denials Claim Card UI):** Redesign claim cards in the denial queue to display rejection codes, patient name, and total cost clearly.
4. **EMR-983 (Manual Insurance Link):** Add a button on OCR document pages to directly search and link the doc to a patient's insurance details.
5. **EMR-982 (Denials 3-Option Action Modal):** Overlay popup for resolving denied claims (Claim Correction / Coding Fix / Peer-to-Peer Appeal).
6. **EMR-981 (MLN/MRN Confidence Bubbles):** Colored badges showing OCR parse confidence levels (Green > 90%, Yellow 70-90%, Red < 70%).
7. **EMR-980 (Denial Response Overlays):** Interactive sliders to write off balances or adjust claim charges.
8. **EMR-979 (Claim Scrub Top Issues Widget):** A weekly breakdown dashboard card highlighting the top 5 clearinghouse rule violations.
9. **EMR-978 (Urgent Claim Indicators):** Display red badges on claims approaching submission limits (e.g., within 30 days of filing deadline).
10. **EMR-977 (Documents Action Routes):** Modals to Approve, Edit, or delete incoming clearinghouse messages.
11. **EMR-976 (AR Audit History):** Display full ledger history detailing edits to patient balances.
12. **EMR-975 (Claims Search Filters):** Chronological filter dropdowns to query claims by status, date range, or billing group.
13. **EMR-973 (Denied Claim Row Expander):** Expandable rows in the claim table to display specific ERA error text inline.
14. **EMR-972 (Aging Balance Beige Restyling):** Update aging buckets (30/60/90 days) using premium cream/beige colors matching Apple guidelines.
15. **EMR-971 (Denials Category Dropdowns):** Multi-select filters categorized by rejection cause (e.g., Eligibility, Authorization, Coding).
16. **EMR-970 (Documents Detail Pane Resizing):** Draggable divider allowing operators to resize the split-pane image viewer.
17. **EMR-968 (Stat Tiles List Drivers):** Clicking top stats cards (e.g., "Ready to Scrape") automatically updates the query filters on the list below.
18. **EMR-966 (Documents Inbox Filtering):** Filter incoming documents by source (Fax, Upload, Mail).
19. **EMR-965 (Denial Peer Benchmark Line):** Line graph comparing current practice denial ratios against regional averages.
20. **EMR-963 (Claims Sortable/Draggable headers):** Let operators drag table headers to customize column order on billing tables.
21. **EMR-962 (Reviewed Status Bins):** Section gathering claims reviewed by AI that are ready for clinician sign-off.
22. **EMR-961 (Recoverable Percent Bubbles):** Badges showing estimated cash recovery potential on denied items.
23. **EMR-956 (Payer Denial Mix Dashboards):** Pie chart illustrating total billing rejections grouped by insurance carrier (Blue Cross, Medicare, etc.).
24. **EMR-954 (AR distribution Legends):** Add detailed explanations of colors used in the Accounts Receivable graphs.
25. **EMR-953 (Labeled RCM Filter Chips):** Pill-style filters to toggle views between "Paid", "Pending", and "Rejected" billing lines.
26. **EMR-952 (Prior Auth Hub Modals):** Central popup workspace displaying pre-authorization requests needing clinician signatures.
27. **EMR-948 (30-Day Trash Bins):** Trash manager route showing deleted claims and files, supporting restore functionality before permanent purge.
28. **EMR-947 (Denial Root Cause Graphs):** Bar graphs comparing rejection count by billing code categories.
29. **EMR-946 (Billing Aging Popups):** Clickable chart nodes triggering overlays containing LeafNerd historical data.
30. **EMR-945 (KPI Hints Text Adjustments):** Info tooltips explaining what metrics like "Days in AR" represent.
31. **EMR-944 (Scrub Dashboards Renaming):** Rename "Claims Verification" to "Claims Scrubbing and Auth Hub".
32. **EMR-942 (Legality Map Overlay):** Map visualization highlighting state cannabinoid rules relevant to patient locations.
33. **EMR-941 (Aging Stat Tiles filter):** Filter list displays on the fly by clicking the "90+ Days" AR metric card.
34. **EMR-938 (Outbox Composer Modals):** Composer window allowing operators to compose and fax appeals directly from the claims list.
35. **EMR-937 (Billing KPI Popups):** Detailed financial summaries that pop open when selecting dashboard metrics.
36. **EMR-935 (Recovery Target Graphs):** Goal-tracking bars showing progress toward the practice's monthly collections target.
37. **EMR-934 (Outbox History Lists):** Document timeline of outbound fax transmissions and receipts.
38. **EMR-933 (Eligibility Status Badges):** Inline green/red/yellow indicator lights showing if a patient has active insurance cover.
39. **EMR-932 (Denials Hero Card Clicks):** Make key cards click-through to filtered list pages.
40. **EMR-931 (Billing Workqueue Renaming):** Rename "Billing Operations" tab to "Billing Dashboard".
41. **EMR-928 (Documents Inbox & Outbox Tabs):** Add a tabbed layout to swap between incoming files and sent files.
42. **EMR-925 (Documents Inbox Renaming):** Standardize name to "Documents Processing Center".
43. **EMR-903 (Billing Title Simplification):** Simplify dashboard page headers to "Billing and Claims".
44. **EMR-905 (Balance Bubble Toggles):** Update patient balance pills and add credit card / cash / ACH toggles.
45. **EMR-906 (Branded Invoice Print page):** A clean print-friendly invoice stylesheet containing practice logo and payment instructions.
46. **EMR-907 (Financial Timelines summary):** Chronological log of charges, payments, and adjustments.
47. **EMR-908 (Insurance Verify Overlays):** Modal allowing staff to cross-reference patient info with provider network directories.
48. **EMR-909 (Payment Plan Setup):** Dialog settings to configure installment amounts, start dates, and auto-pay limits.
49. **EMR-910 (Collapsible Event Logs):** Let operators collapse older transaction list records.
50. **EMR-376 (Coding Scrape Pane):** Sidebar displaying AI-parsed billing codes suggested from clinical notes.

---

## Verification Commands

Run these verification suites before declaring task completion:
```bash
npm run typecheck
npm run lint
npx vitest run
```
