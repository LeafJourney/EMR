# LeafJourney Patient Chart Revisions — Round 1 (Desktop)

**Source:** Dr. N. Patel (founder, clinical lead) — customer development working document
**Date captured:** 2026-05-16
**Doc type:** Heterogeneous product feedback (patient chart pages walkthrough)
**Scope:** Desktop only. Patient chart main page + voice-chart (recording/insights/draft note) + voice-chart Prepare For Visit. Example patient: Maya Reyes (`cmo37j5gt000el82q44u6x1sv`).
**Status:** Captured as-written. The `voice-chart (PREPARE FOR VISIT)` section is intentionally a header-only placeholder — body content is a **WIP on Dr. Patel's end**, not a paste/truncation error. Append the body when she writes it.

**Cross-references:**
- Doc 2 covers the rest of `/clinic/*` (saved 2026-05-16). Doc 3 dives specifically into the patient chart.
- The "Draft Note" feature references the Doc 1 SOAP Progress Note exemplar (Maya Reyes HTN/DM/HLD/L shoulder follow-up) as the target format for APSO/SOAP output.

---

## Page: `https://leafjourney.com/clinic/patients/cmo37j5gt000el82q44u6x1sv` (main front-facing chart page)

### Patient Chart header

- **Age + sex next to patient name.** Example: `Maya Reyes (35, F)`.
- **"+ Add tag" dropdown** — currently not displaying the tag list properly. Fix the dropdown rendering.
- **Allergies row:**
  - Prefix the row currently starting with "ibuprofen" with the label `Allergies:`
  - Add `Add allergies` button next to `+ Add tag`
  - **Add allergies popup:**
    - `Drug name` free-text field with dropdown — partial or full search of drug/allergen names (penicillin, ciprofloxacin, dander, bananas)
    - `Reaction` field with dropdown — nausea, vomiting, hives, etc. Free-text also allowed.
    - `Save` and `Cancel` buttons (bottom-right)
    - On save → adds an allergy bubble next to existing ones (ibuprofen, amoxicillin, etc)
  - **Allergy bubble color system:**
    - **Red bubble** — true allergies that cause hives, angioedema
    - **Yellow bubble** — adverse reactions (not true allergies): nausea, vomiting, body aches, weakness, etc
  - **Hover** on any allergy/reaction bubble → small popup with the cause + the reaction
- **Patient avatar (circle with initials):**
  - Small `+` symbol at bottom-right allows provider/staff to upload a photo
  - Link photo to/from `/portal/profile`

### Contact row (next to DOB)

- Add patient's primary telephone number next to DOB + email
- **Click on email** → popup with:
  - `Subject` free-text + `Message` free-text
  - `+` to attach documents (`.JPG`, `.PDF`, `.DOC` only) — drag-and-drop also supported
  - `Send` + `Cancel` buttons (bottom-right)
  - On send → message saved in `correspondence` tab in patient's chart
- **Click on phone number** → popup that allows call. Includes the voice-chart ability: AI records the conversation, writes out the script in a box, provider can copy the script and create a `correspondence` text.

### New subsections within the main chart section

- **Past Medical History** — scrollable list of pertinent chronic conditions (DM, HLD, HTN, cancers, COPD, etc)
- **Past Surgical History** — scrollable list of surgeries (TKA, cholecystectomy, appendectomy, etc)
- **Medications** — list of all current meds, each row showing:
  - Name (lisinopril, atorvastatin, metformin, Eliquis, etc)
  - Dose (20mg, 5mL, 3 drops, etc)
  - Frequency (qDay, BID, TID, PRN, etc)
  - Last refill
  - **Left-click** any medication → navigates to `/clinic/patients/[id]?tab=rx` (Rx tab)
  - **Right-click** any medication → dropdown with `View`:
    - `View` opens a popup with a beautiful one-page non-scrollable summary showing:
      - **Patient info:** Name (first+last), Gender (M/F), DOB, Address, Phone, Last appt date, Next appt date
      - **Pharmacy info:** NCPDPID, State License #, DEA #, NPI #, Name, Address, Telephone, Fax
      - **Prescriber info:** DEA #, NPI #, Name, Address, Telephone, Fax
      - **Medication info:** Name, Dose, SIG (instructions), Product code, Quantity, Days supply, # refills, Last refill date

### Two-line chart summary

- Under the patient name, render a **2-line summary** of the patient's entire chart — main issues, main meds, etc. Anyone unfamiliar with the patient should grasp what's going on at a glance.

---

## Page: `https://leafjourney.com/clinic/patients/cmo37j5gt000el82q44u6x1sv/voice-chart`

### Voice recording UI

- **Waveform graphic syncs with actual voices** of patient and provider in real time
- **Make the voice recording box ≥100% bigger** — fill more of the webpage
- **DOB format under name** — change from `year–month–date` to `month-date-year`
- **Concerns section** — 2-line chart summary (main issues, main meds) for anyone-can-read context
- **New section above Concerns: `Last Visit`** — 2 bullets summarizing the most recent visit. Always render this section, even if no acute issues came up.
- **Decibel volume meter graphic** inside the recording box — green/yellow/red color scheme showing patient + provider loudness
- **Channels panel (right of recording box):**
  - **Channel 1: `Patient`** — on/off toggle (kills patient recording) + volume slider (raise or lower the patient's recorded audio)
  - **Channel 2: `Provider`** — on/off toggle (kills provider recording) + volume slider (raise or lower the provider's recorded audio)

### Rename: "Extracted Notes" → `Insights`

After recording + transcription completes, the section labeled `Extracted Notes` is renamed to `Insights` with two clickable bubbles below.

- Render the `Concerns` and `Last Visit` sections inside `Insights` so the provider doesn't have to leave the page to see them.

### Bubble 1: `Summary of Encounter`

Holds the summarized SOAP/APSO paragraphs.

- **Maintain `Assessment`, `Plan`, `Subjective`, and `Follow Up` boxes**
- **REMOVE `Objective` section** — this is a HUMAN-ONLY section. No AI can do this part yet (except possibly vitals; leave all of it out for now). *[This is a load-bearing product rule — also referenced in Doc 1.]*
- **Allow reordering of `Assessment`, `Plan`, `Follow Up`, `Subjective` boxes** — provider drags them into any order

#### Assessment box
- Strip subjective language ("stubborn", "irritated", "angered", etc) — note must be objective; this becomes part of the medical record
- `Extend` or `Redo` summary buttons for fuller/more detailed Assessment

#### Plan box
- Replace "the clinician" with the **actual name of the clinician** seeing the patient (more personable)
- `Extend` or `Redo` summary buttons
- **`Ask Cindy` green clickable phrase** at the bottom of Plan
  - On click → produces a 5-10 bullet AI-driven action plan with recommendations and suggestions based on the visit
  - Renders in a split right-side pane, aesthetically clean

#### Subjective box
- `Extend` or `Redo` summary buttons

#### Follow-Up box
- `Extend` or `Redo` summary buttons
- Content should include: next steps, preventative measures pending, labs to order next time, meds to increase/decrease/stop/add, when patient should be seen again (1 week, 1 month, 3 months, etc), and other pertinent segments

### `View Full Transcript` section
- Every timestamp must start with a **capitalized full sentence**. No sentence runs across timestamps.
- Export the full transcript via **email / print / fax**
- **Highlight each speaker title in different colors** (e.g., "patient" and "provider") so it's easy to follow

### Bubble 2: `Draft Note` (to the right of `Summary of Encounter`)

Clicking produces a full APSO or SOAP note draft. Format target = the SOAP Progress Note exemplar from Doc 1 (Maya Reyes HTN/DM/HLD/L shoulder follow-up).

- **Right-side split pane** lists all ICD-10 codes and CPT codes (billed at the highest level)
- **AI billing suggestions box** — recommendations to improve coding and documentation for highest ethical billing, including up-coding suggestions
- **Bottom buttons: `Finalize` / `Save` / `Cancel`**
  - **`Finalize`** → popup with `provider password` free-text + `Cancel` / `Finalize note` buttons
    - `Cancel` → back to previous window
    - Password + `Finalize note` → note lands in `/clinic/patients/[id]?tab=notes`
  - **`Save`** → note becomes a draft in the provider's sign-off inbox (`/clinic/sign-off`) for later review
  - **`Cancel`** → discard
- **`Open in note editor`** → opens the same APSO format but fully editable (erase/delete/type any section). Finalization rules same as above.

---

## Page: `https://leafjourney.com/clinic/patients/cmo37j5gt000el82q44u6x1sv/voice-chart` (PREPARE FOR VISIT)

📝 **WIP on Dr. Patel's end.** The header was authored intentionally; body content not yet written. Append when she completes the section.
