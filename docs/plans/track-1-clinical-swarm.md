# Claude Code Swarm Instructions: Track 1 — Clinical Core & AI Visit Completion

You are assigned to **Track 1: Clinical Core & AI Visit Completion**. Your primary focus is on clinician-facing views, note-taking modules, prescription pipelines, and visual/interactive clinical features.

## Swarm Operational Directives

### 1. Launch Command
Execute your development sessions using the following run command:
```bash
claude --dangerously-skip-permissions
```

### 2. Clinical Core Philosophy (Dr. Patel & AGENTS.md Directives)
- **Human-in-the-Loop Validation:** All AI suggestions (treatment plans, scribe drafts, note content, anatomy annotations) MUST follow the strict human-in-the-loop paradigm. AI must never automatically finalize, sign, or submit clinical artifacts on its own. Clinicians must explicitly review, edit, and click "Finalize/Sign" or "Acknowledge/Approve".
- **Apple iOS Aesthetic:** Interface elements should feel clean, premium, and interactive, using responsive layouts, rounded corners, drop shadows, and subtle micro-interactions.
- **Vanilla CSS styling:** Do not add arbitrary Tailwind styles. Rely on `DESIGN_SYSTEM.md` styling variables or standard CSS files in `src/app/globals.css` and local stylesheets.

---

## Technical Goals & Target Paths

Most of your changes will target:
- `src/app/(clinician)/clinic/patients/[id]/` (Patient Chart cards, Tabs, Demographics)
- `src/app/(clinician)/clinic/notes/` (APSO note builder, clinical documentation)
- `src/app/(clinician)/clinic/prescribe/` (Prescribing workspace, Rx lists, pharmacies)
- `src/app/(clinician)/clinic/sign-off/` (Clinician note-sign flow)

---

## 50 Backlog Cards Specification

Execute development and logical fixes for the following cards:

1. **EMR-016 (Full Prescription Form):** Provide clean drop-downs for cannabis/psilocybin/conventional classes, combined with a manual text fallback.
2. **EMR-020 (APSO Note Format):** Restructure the note editor into the APSO (Assessment, Plan, Subjective, Objective) layout, exposing data pipelines for wearable metrics.
3. **EMR-021 (AI-Recommended Treatment Plan):** Draft initial recommendations using patient intake signals. Must display an "AI Recommendation" badge and requires clinician approval.
4. **EMR-052 (Clinical Trial Matching):** Connect to mock clinical trial databases to display eligibility suggestions on the patient's chart.
5. **EMR-899 (LeafAnatomy Model):** Render an annotated visual anatomical model (SVG-based mapping tool) where clinicians can plot symptoms or pain nodes with "Cindy Sees" annotation sidebar.
6. **EMR-897 (Fixed Provider Colors):** Assign permanent color tokens and initials/avatars to staff to identify who made note edits.
7. **EMR-896 (New Message Composer):** Multi-modal composer popup supporting directory searches, call/video buttons, file attachments, and background auto-save drafts.
8. **EMR-895 (Correspondence Inbox):** Split-pane workspace where summaries are never clipped. Implement bubble-style notification counts.
9. **EMR-894 (Private Notes Relocation):** Remove the dedicated 'Private Notes' tab. Surface them as an inline card labelled 'Private' with auth-gated access in the patient chart.
10. **EMR-893 (Med Summary & DEA Display):** Co-locate patient medical summary with the Prescription Preview, and dynamically display controlled DEA license numbers for verified providers.
11. **EMR-892 (Pharmacy Split-Pane Picker):** Implement a split-pane search dialog filtering pharmacies by zip code, address, and name, with one-click selection.
12. **EMR-891 (Med/Dosing Notes Co-location):** Merge dosage recommendations directly next to active prescriptions and display clean "clinician tips" copy.
13. **EMR-889 (CURES Integration Settings):** Settings panel to input PDMP/CURES state registry login credentials with detailed attestation checkbox text.
14. **EMR-888 (Safety Check Refresh):** Dynamic colored bars indicating severity (Yellow/Orange/Red). Force clinicians to write a 10+ character justification for overriding high-risk Red warnings.
15. **EMR-887 (Restructure Dosing):** Split dosage instructions into structured drop-downs (dose, unit, frequency, days) alongside a fallback raw-text field.
16. **EMR-886 (Cannabinoid Intake Relocation):** Remove "Cannabinoids open to" from the active clinician chart view and place it inside the intake/onboarding demographics folder.
17. **EMR-885 (Smart Product Dropdown):** Replace the text-subtraction search interface with an autocomplete drop-down grouped by drug/herb category.
18. **EMR-884 (Prescribe Patient Subsection):** Top banner showing patient portrait, contact shortcuts, and MRN.
19. **EMR-883 (Prescribe Module Redesign):** Streamline prescribing into a unified grid, reducing clicks. Include 2-3 preset dosage template buttons.
20. **EMR-882 (Patient Instructions Clean-Up):** Clean up clinician notes and date-stamp instructions given to patient.
21. **EMR-881 (Recent Dose Logs):** Render dose outcomes using emoji symptom faces, powered by Feather visual metrics.
22. **EMR-880 (Methods of Administration Taxonomy):** Group cannabis/psilocybin by delivery route (Inhalation, Oral, Sublingual, Topical) using color-coded headers.
23. **EMR-879 (Active Regimen Bubble System):** Standardize active medication pills with hover edit triggers.
24. **EMR-878 (Collapsible Active Regimens):** Let clinicians toggle rows between a collapsed 4-column summary and an expanded view showing batch details.
25. **EMR-877 (Floating '+' Action Menu):** Add a floating action button (FAB) in the lower-right corner of the patient chart to quickly prescribe, draft a note, or log a phone call.
26. **EMR-876 (Active Medications Table):** Rename "Active Regimens" to "Active Medications" and implement inline row editing.
27. **EMR-875 (Interaction Check Actions):** Acknowledge drug/cannabis interactions row-by-row or in bulk. Require justification text for clinical bypasses.
28. **EMR-874 (THC/CBD Calculator):** Accumulate prescribed cannabinoids to display aggregate daily milligram totals with visual alert thresholds.
29. **EMR-873 (Modular Rx Renaming):** Rename "Cannabis Rx" tab to "Prescriptions" or "Rx" to support broader modular medicine (psilocybin, herbs, conventional).
30. **EMR-872 (Vitals Subtab & Sources):** Render vitals logs with indicators (Apple Watch, Whoop, Fitbit, manual) and filterable calendar charts.
31. **EMR-871 (Labs Subtab):** Tabulate Quest and LabCorp results chronologically, highlighting outliers in bold red.
32. **EMR-870 (Assessment Scores Subtab):** Plot clinical scores (PHQ-9, GAD-7, MMSE, pain scale) on interactive line graphs.
33. **EMR-869 (LSV Tile Cleanup):** Streamline Labs, Scores, and Vitals card UI with actions to print, download, or return to queue.
34. **EMR-868 (LSV 3-Layer Nav):** Multi-level folder navigation for laboratory documents, featuring side-by-side hover graphs.
35. **EMR-866 (Labs Tab Renaming):** Rename "Labs" to "Labs, Scores, and Vitals" and show a summary of the 5 most recent entries.
36. **EMR-865 (AI Records Search):** Implement an AI-powered text search across clinical PDF uploads, showing matching snippets.
37. **EMR-864 (Record Note Tiles):** Refactor document cards with consistent dates, file type icons, and status badges.
38. **EMR-863 (Drag-and-Drop Auto-routing):** Drag-and-drop document upload interface with automated classification suggestions, requiring clinician approval.
39. **EMR-862 (Records 3-Layer Nav):** Standardize clinical documents layout under Tab > Subtab > Tertiary File grouping.
40. **EMR-861 (Notes Tab Restriction):** Restrict Notes tab strictly to provider-authored notes, using a side-by-side editor/previewer.
41. **EMR-860 (Maya's Story Consolidation):** Consolidate longitudinal context "What We Remember About Maya" into a collapsible, editable summary.
42. **EMR-859 (Trend Bubbles & Emojis):** Display patient symptom trends with colored tags and optional emoji-only cards.
43. **EMR-858 (Team Observations card):** Bulleted list of care team alerts with a "Dismiss All" button.
44. **EMR-856 (Expandable Longitudinal Memory):** Expandable grid tiles that pop open to view historical note fragments.
45. **EMR-855 (Preventative Screenings):** Display USPSTF screening requirements (Mammogram, Colonoscopy, etc.) with color-coded due dates (Green/Yellow/Red).
46. **EMR-854 (Clinical Decision Support tab):** Relocate "Presenting Concerns" and "Treatment Goals" from details into the Decision Support tab.
47. **EMR-852 (Current Medications Merge):** Merge prior medications into the active chart card with edit triggers on click.
48. **EMR-851 (MR Monogram Alerts):** Move critical safety flags directly under the patient's MRN monogram, clicking opens an alert popover.
49. **EMR-850 (Identity Demographics Rework):** Add emergency contacts and rename patient ID to standard MRN fields.
50. **EMR-848 (Demographics Detail Pages):** Make each demographics grid section link to its own edit page.

---

## Verification Commands

Always run these commands before pushing any changes to confirm build integrity:
```bash
npm run typecheck
npm run lint
npx vitest run
```
