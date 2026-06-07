# Claude Code Swarm Instructions: Track 2 — Scheduling Command Center & Operations

You are assigned to **Track 2: Scheduling Command Center & Operations**. Your primary focus is on self-serve scheduling portals, waitlist workflows, drag-and-drop calendars, lobby kiosk interfaces, and onboarding pipelines.

## Swarm Operational Directives

### 1. Launch Command
Execute your development sessions using the following run command:
```bash
claude --dangerously-skip-permissions
```

### 2. Operational Rules & Security (AGENTS.md & QA Directives)
- **Kiosk Route Security:** Kiosk check-in routes (under `src/app/kiosk/`) must never leak internal patient chart data or authenticated clinician views. They are public-facing/semi-public and must only present constrained check-in screens.
- **Handoff Token Idempotency:** The QR-triggered `validateHandoffToken` action must be strictly idempotent and become invalid immediately upon consumption.
- **Lobby Duplication Prevention:** Double-clicking "Accept Lobby Submission" or "Submit Intake" must block concurrent submissions to prevent duplicate patient record creation.
- **Vanilla CSS styling:** Rely on standard CSS variables (`DESIGN_SYSTEM.md`). Do not add new styling utilities.

---

## Technical Goals & Target Paths

Most of your changes will target:
- `src/app/(clinician)/clinic/schedule/` & `src/app/(operator)/ops/schedule/` (Calendar grid, views, block creation)
- `src/app/kiosk/` (Check-in screens, QR code handoff)
- `src/app/(operator)/ops/waitlist/` (Waitlist queues, slot recommenders)
- `src/app/(clinician)/clinic/lobby-submissions/` (Merging intake data)
- Onboarding directories (`src/app/(clinician)/clinic/settings/onboarding`, etc.)

---

## 50 Backlog Cards Specification

Execute development and logical fixes for the following cards:

1. **EMR-206 (Self-Serve Online Scheduling):** Embedded public widget allowing patients to select clinicians, times, and enter booking details.
2. **EMR-207 (No-Show Prediction Model UI):** UI warnings displaying risk percentages next to patients with high cancellation histories.
3. **EMR-208 (Follow-Up Cadence UI):** Condition-specific follow-up duration selectors (e.g. 14 days, 30 days) that auto-fill appointment recommendations.
4. **EMR-209 (Smart Slot Recommender UI):** Interactive panels displaying recommended calendar slots based on clinician load and patient preferences.
5. **EMR-210 (Intelligent Waitlist UI):** Command panel displaying waitlist candidates with action to text/email slot offer links.
6. **EMR-211 (Multi-Channel Reminder Dashboard):** Settings page for setting patient reminder rules (SMS, email, calls) and quiet hours.
7. **EMR-212 (Intake-to-Visit Gate UI):** Pipeline visual tracker (similar to Trello/Kanban) displaying intake completion statuses before visits are scheduled.
8. **EMR-213 (Group Visit & Block Booking UI):** Multi-patient scheduling dialog supporting group blocks and recurring reservation slots.
9. **EMR-214 (Burnout Guardrails UI):** Settings to enforce maximum consecutive patient slots or required buffer times.
10. **EMR-215 (Scheduling Analytics Cockpit):** Operations dashboard graphing slot utilization, cancellation ratios, and peak hour distributions.
11. **EMR-912 (Kiosk Handoff QR view):** Patient-facing kiosk screen displaying a QR code that hands off forms to the patient's mobile phone.
12. **EMR-936 (Providers Week View):** side-by-side calendar snapshots comparing calendars for up to 5 providers.
13. **EMR-930 (Schedule Filter button):** Drop-down button filtering schedule views by provider, clinical modality, or visit type.
14. **EMR-927 (Schedule Right-Click Menu):** Context menu on calendar blocks allowing operators to check-in, cancel, or re-schedule.
15. **EMR-919 (Labeled KPI Metrics):** Header indicators showing active metrics (e.g., "In Office: 12", "Virtual: 8") that filter the calendar on click.
16. **EMR-921 (Week View Overhauls):** Redesign week view calendar rows to support grid sizing and block dragging.
17. **EMR-923 (Calendar Patient Link):** Patient names in the calendar must click through to their clinical chart home page.
18. **EMR-920 (Eligibility Checker Layout):** Place "Verify Insurance" helper tags directly inline on scheduled patient blocks.
19. **EMR-918 (Visit Release Payload Validation):** Panel warning clinicians of incomplete chart documentation before finalizing a visit.
20. **EMR-943 (Status Bubbles):** Color-coded status pills next to patient names (Active/Inactive/Prospect).
21. **EMR-950 (Expanded Patient Chart Link):** Ensure all secondary list search results click through to patient profiles.
22. **EMR-964 (Clickable Contact Overlays):** Interactive call/email overlays inside search results allowing quick copy or trigger-dial.
23. **EMR-967 (Missing Demographics Warning):** Warning banner showing fields missing in onboarding that links directly to the demographics form.
24. **EMR-939 (Right-Click Status Menu):** Let operators update patient status (Active, Inactive, Blocked) directly from the list right-click menu.
25. **EMR-579 (Schedule Date Format):** Format the main schedule header date as a clean `MM-DD-YYYY` label.
26. **EMR-578 (Drag-to-Rearrange):** Enable calendar blocks rearrangement across Day, Week, and List views.
27. **EMR-577 (Right-Click New Block Menu):** Right-click on empty calendar grid spaces to quickly create a "New Appointment" or "Time Block".
28. **EMR-574 (Widget Restoration):** Re-embed the mini-scheduler calendar and clinician inbox widgets directly onto the EMR dashboard landing page.
29. **EMR-568 (Clickable Dashboard KPIs):** Clinician landing page top stats (e.g., "Unsigned Notes") filter patient queues when clicked.
30. **EMR-829 (DOB Date Format):** Enforce `MM-DD-YYYY` date-of-birth displays under all patient profile names.
31. **EMR-826 (Demographics Contact Icons):** Place click-to-call phone and mail icons next to contact details in demographics view.
32. **EMR-825 (Demographics Photo Upload):** Render a "+" hover overlay on the patient photo card to upload custom JPG files.
33. **EMR-827 (Scrollable Medical Lists):** Ensure past medical history (PMH), surgical history (PSH), and active allergies lists are contained in scrollable boxes.
34. **EMR-817 (Demographics Tab Hover):** Hovering over the demographics tab exposes a popover summary of primary contact information.
35. **EMR-816 (Reset Schedule Metrics):** Ensure scheduled dashboard metrics clear and update automatically at midnight daily.
36. **EMR-388 (Calendar Share Buttons):** Add iCal and Google Calendar invite generation buttons inside visit confirmation overlays.
37. **EMR-399 (Address Autocomplete check-in):** Add Google Maps API autocomplete capabilities to patient address input boxes.
38. **EMR-489 (Digital Onboarding Packets):** Patient onboarding portal pages showing signed consent progress.
39. **EMR-487 (Intake Scoring Sliders):** Visual sliders for rating pain, sleep, and mood (1-10) using smile/frown face anchors.
40. **EMR-422 (Care Model Picker):** A user-friendly select screen letting onboarding patients choose their care pathway (Conventional vs Cannabinoid).
41. **EMR-419 (Onboarding Admin Wizard):** Step-by-step progress tracker for clinic setup showing progress checkmarks.
42. **EMR-595 (Telehealth Schedule Popup):** Dialog allowing staff to create virtual video rooms when scheduling visits.
43. **EMR-596 (Video Launch Buttons):** Place an active camera icon button directly on scheduled telehealth appointments to launch Zoom/Google Meet.
44. **EMR-571 (Priority Queue Lists):** Reorder today's patient queue lists dynamically based on acuity rating.
45. **EMR-564 (Sticky Sidebar Scheduler):** Lock the vertical calendar navigation ribbon on the left side of the dashboard.
46. **EMR-567 (RELAX Mindfulness Modal):** Add a decorative 'RELAX' button to the clinic layout that pops open a breathing exercise window.
47. **EMR-573 (Quick Research Search):** Sidebar search input with a toggle to search conventional medicines vs cannabinoid references.
48. **EMR-926 (Overview Tabs Merge):** Combine redundant scheduling dashboard overview tabs into a single unified summary page.
49. **EMR-924 (Cannabis Eligibility Layout):** Visual indicators displaying state-by-step legality checklists when screening patients.
50. **EMR-922 (Root Page Restorations):** Confirm all operations dashboards resolve standard loading boundaries without empty blank pages.

---

## Verification Commands

Run these verification suites before declaring task completion:
```bash
npm run typecheck
npm run lint
npx vitest run
```
