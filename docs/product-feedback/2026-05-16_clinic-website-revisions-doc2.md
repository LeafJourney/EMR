# LeafJourney /clinic Website Revisions — Round 1 (Desktop)

**Source:** Dr. N. Patel (founder, clinical lead) — customer development working document
**Date captured:** 2026-05-16
**Doc type:** Heterogeneous product feedback (page-by-page website review)
**Scope:** Desktop / computer site only. Mobile site comes after desktop is cleaned up.
**Status:** TRUNCATED — original message ended mid-`/clinic/communications/fax` page. Remainder to be appended when received.

---

## Source preface (verbatim)

> I will begin going through every single page of our www.LeafJourney.com/clinic website and will go over the suggestions and what we need to clean up. This will be strictly for the desktop and computer site. Once this is fully cleaned up, de-bugged, and operational, I will begin going through the mobile site.

---

## Cross-cutting / global behaviors

These apply across the entire EMR (patient portal, clinician portal, owner/practice management portal) — not specific to any one page.

- **"Send Whisper" comment-bubble routing.** For every page that has the small green-circle "comment bubble" in the bottom-left corner, the "Send Whisper" button must email the suggestion to `neal@leafjourney.com` AND `scott@leafjourney.com`.
- **Required-field validation pattern.** For any required text field left empty or incorrectly filled: show small-font message "please complete each field" AND highlight each unfilled field with a bright red border. **Applies across entire EMR** — patient portal, clinician portal, owner/practice management portal.
- **Leaf-emoji substitution for status bubbles.** Across the entire EMR, replace red/yellow/green status "bubbles" with larger red leaf / yellow leaf / green leaf emojis. Hover (desktop) and tap (iPhone/iPad) reveal a small popup with the meaning.
- **Audio retention policy (MAKE EXPLICIT TO ALL AI AGENTS).** LeafJourney does NOT store any audio anywhere in the system for more than 30 days. All servers across all platforms must auto-delete audio. This is to protect voice signatures of patients/staff/users.

---

## Page: `https://leafjourney.com/clinic` (main page)

- Left-side ribbon menu must scroll with the page — entire ribbon visible regardless of scroll position.
- **"New Visit" box** — clicking opens a modal:
  - Free-text "Patient name" field
  - "DOB" field that auto-populates based on patient name
  - "Type of visit" dropdown: History and Physical, Follow Up, New Patient, Custom (free text)
  - "Date" field: free-typeable (e.g. `08/12/1990`) OR opens iOS-style mini calendar with clickable month/day
  - **Duplicate-resolution flow:** If name or DOB matches multiple patients, open a second popup listing them as rows with columns: Patient Name, DOB, Age, Phone Number, Address — to prevent wrong-patient selection
  - Each popup needs an X at top-right OR click-outside-to-close; either action triggers a "Are you sure you want to leave?" confirm to guard against accidental exit
  - Bottom-right buttons: `Cancel` (left) and `Create` (right). Clicking Create populates the visit into `https://leafjourney.com/clinic/schedule`
- **"RELAX" button** in top ribbon next to "Hello, Dr. Lena". Opens a popup with rotating mindfulness options (X to close or click outside). Refresh button to rotate.
  - **Breathing exercises** (4-4 box, 4-7-8, etc) — each has a small visual: a ball moving up/down or in a box to follow the breath
  - **Calming artwork** — Thomas Kinkade, Picasso, Rembrandt, Van Gogh, Michelangelo, etc. **DO NOT generate AI artwork for this.**
  - **Movement exercises** — 5:00 minute timer displayed at top
    - Option: movement bubble with cartoon to follow
    - Option: exercises (squats, push ups, walk, calf raises) with cartoon demos
    - Option: simple seated or standing stretches (hamstring, calf, back, shoulder) with cartoon demos
  - **Music** — ambient binaural beats (alpha waves), wind chimes, ocean waves; OR 3-5 minute classical clips (Beethoven, Mozart, Bach)
  - **Games** — simple AI-generated games (Jezzball-style, ski slope, Wordle-style) — must be unique, no copyright conflicts. Playable with mouse or arrow keys only.
- **Top-ribbon links** (must be clickable):
  - "patients today" → `https://leafjourney.com/clinic/schedule`
  - "notes to sign" → `https://leafjourney.com/clinic/sign-off`
  - "approvals" → `https://leafjourney.com/clinic/approvals`
  - "threads" → leave unlinked for now
- **"Search patients" box** — support partial name, phone (with or without hyphens), DOB, full last name, full first name, medical life number. Add a "search" button to the left of "new visit".
- **"Today's Queue"** — use AI/agents to categorize urgent vs regular based on chart context. Include important labs, consult docs, and images. Surface urgent messages (callbacks vs clarifications), urgent meds (travel, ran out, sick/needs antibiotics).
- **Move to `/clinic/command`:** "this week" visits box, "finalized notes this week" box, "visits – last 7 days" box.
- **"Quick research" bar at bottom** — remove if provider does not practice cannabis. Make this part of the modular onboarding selection.

---

## Page: `https://leafjourney.com/clinic/command`

- Move "schedule" and "messages" to the `/clinic` page.
- "Clinical flow" and "clinical discovery" reset daily at 11:59 PM.
- "Clinical flow" and "clinical discovery" need a `more` button — opens popup with graph toggling Week / Month / Year tracking over that span.

---

## Page: `https://leafjourney.com/clinic/schedule`

- Right-click anywhere on schedule → dropdown menu with `new` option. Schedule new block options:
  - Time block: 5-min interval increments (5, 10, 15, …) OR customizable. Populates a same-sized box on the schedule. Free-text "notes" box. Free-text "reason" box.
  - Schedule patient (search by phone with/without hyphens, DOB, last name, first name)
  - Schedule "meeting"
  - Schedule "vacation"
  - Schedule "do not book"
- Drag-and-drop rearrange on `day`, `week`, and `list` tabs.
- Header currently shows `May 17 – 2026 (day:23)`. Remove `(Day:23)`. Replace with day-of-week: `May 17 – 2026 (Sunday)`.
- Incorporate the New Visit box behaviors described in the main-page section.

---

## Page: `https://leafjourney.com/telehealth`

- Add large video/plus icon to right of "Video Visits" → opens popup with free-text search: name, phone, DOB, partial name, OR email (emails patient a HIPAA-compliant clickable telemed link).
- Inside the call, small microphone icon toggles ambient AI scribe — takes notes without recording personal data.
- **Pre-visit checklist** — every bullet must be something the EMR can actually verify.
  - Verified/working bullets render in **green** font with a small **green leaf** icon
  - Failing bullets render in **red** font with a **dried brown leaf** icon
  - Both colors must be relatively dark and readable in bright environments

---

## Page: `https://leafjourney.com/clinic/patients`

- Remove "active" box.
- Remove "inactive" button.
- Search-by-name box: partial first name, partial last name, DOB, phone (full or partial).
- **"+ New Patient"** opens popup with:
  - All fields from "Personal Information" section of `/portal/profile` (including photo), EXCLUDING the "About you" section
  - **Emergency contact section** — name, phone, email, relationship (brother, sister, spouse, father, mother, etc). Support 3 emergency contacts.
  - **Insurance Information tab** — Name of insurance (BlueShield, Blue Cross, United HealthCare, etc), Insurance card number

---

## Page: `https://leafjourney.com/clinic/messages`

- **"New Message" button** to right of "search patient or message" box. Opens popup:
  - Free-text `name` (searchable by partial last name, partial first name, DOB; dropdown shows full name + DOB + years old)
  - Free-text `message`
  - `Send` and `Cancel` at bottom
- **Hover on initials circle** (e.g., "MR" for Maya Reyes) reveals: current meds (scrollable to save space).
- **Patient name in message window is a clickable link** to chart front page (e.g., `https://leafjourney.com/clinic/patients/cmo37j5gt000el82q44u6x1sv`).
- **On patient chart, the message thread becomes a Gmail-style pop-up/docked compose** at bottom-right. Scrollable, send button bottom-right. Reference: https://www.cnet.com/tech/services-and-software/gmail-rolls-out-new-pop-out-window-for-composing-emails/
  - Pop-up mode: freely draggable within the chart
  - Docked mode: static bottom-right
- **Memo and Rx icons** in message window, to the right of the video icon.
  - **Rx icon** → links to patient's prescribe page (e.g., `/clinic/patients/.../prescribe`) while keeping the message box pop-up/docked
  - **Memo icon** → internal-only message (pop-up/docked). Recipients: staff, MA, front office, back office, provider (other practice providers). Header shows patient's name + DOB. `Cancel` (deletes) or `Send` (lands in recipient inbox).
- **Slash-command referral system** — use `/__` in message thread to refer to ancillary services (PT, OT, ST, etc).
  - Full referral system: provider maintains preferred ancillary provider list (OT, PT, ST, dental, cardiology, optometry, etc) with name, office number, fax, email, address
  - Phrases like `/refer to PT` or `/refer to Dr. Patel` use AI to pull the right data
  - Produces simple printout, OR can be emailed/texted directly to patient
  - Information flows into centralized portal for patient + provider
- **Right-click inbox** → mark as `read` / `unread`. Unread gets green dot on left of patient name.
- **Auto-save drafts** (Gmail-style). Patient name shows `(Draft)` suffix in left pane when there's an unsent message.
- **Message thread elongation cap** — extends, but stops before forcing the whole page to scroll. Page has its own scroll bar AND message thread has its own scroll bar.
- **Call/video log inside the thread** (WhatsApp-style) — actual time spent, missed audio call, missed facetime call, etc. References:
  - https://blog.whatsapp.com/new-feature-roundup-missed-call-messages-new-status-stickers-and-more
  - https://www.reddit.com/r/whatsapp/comments/17wbo9d/whatsapp_calls_showing_as_chat_bubbles_inside/
- **In-thread search box** next to subject/patient name. Search words, numbers, partial numbers, date/time.
- **Attachments** — PDF, Word, JPEG. Open in split-window view with annotation tools (draw, highlight, circle, erase). Save or Discard. Annotation toolkit should be extensive like Zoom/Google but easy to navigate. Saved annotations are downloadable/shareable. Discard keeps only the original.
- **"Resolved" button** next to Send. Marking resolved drops a "resolved message" bubble with timestamp into the thread.
  - Click out anytime → message auto-saves as draft (same as Gmail)
  - New messages after resolution continue under the resolved bubble
  - One long continuous HIPAA-compliant thread per patient with everything (resolved msgs, audio calls, video calls, all timestamped)
  - Resolved threads drop out of the smart inbox until a new message reactivates them
- **Patient name dropdown → `Export`** opens popup:
  - Date range (calendar + freehand entry)
  - Send via: email / text (READ-ONLY web link) / print / fax / save as PDF (freehand text box, auto-populating where possible)

---

## Page: `https://leafjourney.com/clinic/sign-off`

- **Same split-pane layout as `/clinic/messages`** — inbox left, full thread/document right.
- Left pane shows patient `Name` + `type` of sign-off required.
- **In `/clinic/labs-review`,** clicking a patient's labs or `review` opens a popup:
  - Rename "looks good – draft outreach" → `draft message`
  - Each lab marker is clickable → opens split pane in popup showing a clean graphical trend over the past year (3mo/6mo/12mo/2yr toggle, custom range). Must include actual numerical values.
  - **Patient Message box** — 1-2 word trend sentence; for high/low/abnormal labs, explain plan of action so patient isn't worried; end with: "don't forget to watch your diet and continue exercising! Call or message us with any questions. Thank you!" (warm/friendly tone)
  - **MA task box** — keep current recommendations
  - **Chart note box** — keep the one-liner, state "labs reviewed" + communicated to patient
  - Option to send labs WITH patient message via `Send` button — routes to phone (text) or email per `Communication Preferences` in `/portal/profile`
  - **Patient-facing PDF format** — one-page printable/shareable. Includes "Results", "What these mean", "Patient message" sections. Every marker has a plain-language explanation: what it means, what it does in the body, what high/low/abnormal results mean. AI must reliably tag markers as high/low/abnormal.
  - Right-pane document view: full expanded, scrollable, zoomable, OCR-compliant, highlightable
  - Right-pane top ribbon (consistent): initials avatar, patient name (links to chart front page), call/video/message/Rx icons
  - **Message icon → internal messaging** to staff/MA/front office/back office/provider (e.g. "make an appointment", "do blood work before sending Rx", reasons meds were denied)

- **REMOVE "Approvals" entirely.** Replace with this structure under `/clinic/sign-off`. Each subpage lists everything in that category in time-of-import order, with sort options for date / time / alphabetical:
  - **Clinical Encounter Documentation** → `/clinic/sign-off/clinicdocs`
    - Progress Notes (SOAP)
    - History & Physical (H&P) — required within 30 days prior or 24 hours after admission
    - Consultation Reports
    - Procedure/Operative Reports
    - Discharge Summaries
    - Follow-up Plans
  - **Orders and Interventions** → `/clinic/sign-off/orders`
    - Medication Orders
    - Imaging/Lab Orders
    - Referrals
    - Dietary and Nursing Orders
  - **Results and Review** → `/clinic/sign-off/results`
    - Laboratory Results
    - Imaging Reports (Radiology, MRI, CT)
    - Electrodiagnostic Reports (ECG, EEG)
  - **Administrative and Compliance** → `/clinic/sign-off/administrative`
    - Informed Consent Forms
    - Attestations (work of residents / non-physician practitioners)
    - Problem List Updates
    - Patient Instructions
  - **Refills** → `/clinic/sign-off/refills`

- **Refills page** — same split-pane layout. Right pane shows full Rx/refill module for the selected medication. Information density is high; design for visual clarity, consider trimming if needed:
  - **Patient info:** Name (first+last), Gender (M/F), DOB, Address, Phone, Last appt date, Next appt date
  - **Pharmacy info:** NCPDPID, State License #, DEA #, NPI #, Name, Address, Telephone, Fax
  - **Prescriber info:** DEA #, NPI #, Name, Address, Telephone, Fax
  - **Medication info:** Name, Dose, SIG, Product code, Quantity, Days supply, Refill count, Last refill date
  - **`Prescribe` and `Deny` buttons** bottom-right:
    - `Prescribe` → e-sign with 4-digit provider passcode tied to NPI
    - `Deny` → rejection sent to pharmacy AND documented in chart
    - Provider can use message icon afterward to ping internal staff (MA/front/back office/nurse)
  - Clicking patient name in Refill Queue opens popup where:
    - Patient name links to chart front page
    - Section labeled `REFILLS`
    - `Edit` button to LEFT of `Deny` and `Approve & Send to Pharmacy`
    - `Edit` → links to patient's cannabis prescription page (e.g., `/clinic/patients/cmo37joir0048l82qqlzr322j/prescribe`)
    - If provider sends from there, the refill disappears from the Refill Queue

---

## Page: `https://leafjourney.com/clinic/providers`

- **Provider-to-provider secure messaging via SMS.** Send a text saying "secure message from Dr. Patel" with a 24-hour-expiring HIPAA-compliant link to a web-based secure messaging site.
  - Option to save or not save the conversation to patient chart
    - Saved → goes into chart as "chart note" or "correspondence"
    - Not saved → lives only in `/clinic/providers/messages`
- `/clinic/providers/messages` layout = iMessage style. Left pane = list of contacts; right pane = full thread.
- **Left-pane search** — partial first name, partial last name, specialty (endocrinology, cardiology, rheumatology, etc).
- **Opt-in/opt-out for SMS** — directory contacts must consent to texting.
- **Attachments via `/_`** — e.g. `"Hi Dr. Patel, it's Dr. Daliwala. I just saw your patient and got the /X-ray of chest results."` Slash-command pulls the impression of the X-ray; the phrase becomes a hyperlink to the image or finalized radiology report.
- **Provider name popup** — clicking name shows: provider name, clinic address, clinic phone, clinic fax, picture, website. Close via X or click-outside.
- **"Secure message" opens Gmail-style pane** — contact list left, thread right. Running dialogue. Secure message + secure call available.
  - Each provider opts in/out of call AND message independently
  - Opt-out providers can still choose which info appears in directory (e.g., opt out of calls/msgs, opt in to practice address, phone, fax)
  - Pane buttons: `Cancel` / `Send`
- **Under "view and contact providers in your organization"** — full search by last name, first name, practice address, specialty, hospital affiliation, etc.
- **New section: "Ancillary Services"** parallel to Provider Directory — dental clinics, OT, PT, ST, home care placement agencies, home health agencies, hospice agencies, optometrists, podiatrists, etc. Same info fields as providers.

---

## Page: `https://leafjourney.com/clinic/research`

- **Search must work for any number of words** — "sleep" vs "insomnia in people with OSA" both return results. Cannabis-related; search engine needs to be bolstered.
- Result titles are PubMed hyperlinks → open in new tab.
- **"Cannabis Combo Wheel" and "Search the evidence" sections** show only for cannabis-practicing providers. Removed for opt-out practices.
- **Search-the-evidence sources to integrate** (all providers/practices):
  - https://www.uptodate.com/contents/search
  - https://online.lexi.com/lco/action/login
  - https://www.openevidence.com/
  - https://www.medlineplus.gov/
  - https://www.nccih.nih.gov/
  - https://www.ncbi.nlm.nih.gov/
  - https://www.ema.europa.eu/en/homepage
  - https://esmed.org/
  - https://www.merckmanuals.com/professional
- **"Recent queries"** — keep 5 saved searches (not 8).
- **"ChatCB" output format** — pulls data into a conversational text-message-bubble style. Cited per line with clickable references. Voice: dynamic, positive, intelligent — channel Louise Hay / Norman Vincent Peale / Theodore Roosevelt energy, but coherent and educational.
  - Clicking a reference triggers leave-site warning popup: `Proceed` or `Cancel`. Proceed opens new tab; Cancel returns to search bar.

---

## Page: `https://leafjourney.com/clinic/library`

- Page must be PDF-saveable and printable as a one-page document.
- **New category after "cannabinoid pharmacology": "terpene pharmacology"** — same style, top 6-10 terpenes from terpene cannabis wheel.
- **Drug Interaction Reference** — red/yellow/green bubbles are clickable → popup with full medication list in that category. Include as many pharmaceutical AND nutraceutical meds as possible.
- **Drug interaction sources to integrate:**
  - https://www.drugs.com/drug-interactions/cannabis.html
  - https://cann-dir.psu.edu/drug-research/select
  - https://cannabishealthreport.colorado.gov/drug-interaction-table
- **Drug interactions module must be:**
  - Fully integrated into ChatCB
  - Standalone on the `/education` tab as `drug mix` — free-typeable text box; patients enter meds + supplements to see green/yellow/red cannabis interaction
  - Instruction text above box: "add all of your medications and supplements to see if they interact with cannabis."
- Rename "research corpus" → "research database".

---

## Page: `https://leafjourney.com/clinic/communications`

- **Reword:** "AI transcription captures only pertinent clinical info; personal data is discarded before persistence." → "AI transcription captures only pertinent clinical info. Personal data is discarded before documented."
- **Remove the word "Zoom" everywhere in the EMR.** Avoid copyright infringement.
  - Replace with `Beam` (or another nature-themed word that reads as "video call")
- **All summary boxes must be clickable** — `CALLS (7 DAYS)`, `BEAM UPCOMING` (was ZOOM), `NEW VOICEMAILS`, `TRANSCRIPTS TO REVIEW`, `FAXES IN FLIGHT`, `ACTIVE OUTREACH`. Clicking opens a fixed-size popup with scroll bar.
  - **CALLS (7 DAYS)** → opens a new page. Columns: pending date, first/last name, DOB, gender (M/F), phone number, small phone icon to dial directly.
    - **Call Log** sub-feature (iPhone-style) — chronological list of made/missed/placed calls. Calls dial out using the practice's office number, not the provider's personal number. Lives in the Calls box.
  - **BEAM UPCOMING** → pending date, first/last name, DOB, gender, phone, video icon to call directly.
  - **NEW VOICEMAILS** → date, first/last name, DOB, gender, phone. Play/pause button with scrubbable horizontal bar. iOS visual-voicemail feel. Reference: https://imaginewireless.ca/new-device/iphone-vvm/. Phone icon to call back.
  - **TRANSCRIPTS TO REVIEW** → pending date, first/last name, DOB, gender, chart icon → chart link. Clicking a transcript expands a scrollable fixed-text box; `Send` (commits to chart with e-signature) or `Edit` (provider edits inline then sends/saves).
  - **FAXES IN FLIGHT** → date, time, first/last name, DOB, gender, `Send` (re-prioritize) or `Cancel` (delete from queue).
  - **ACTIVE OUTREACH** → pending date, first/last name, DOB, gender, phone, message icon to text directly.
- Rename "Provider channel" → "provider chats".
- Rename "Zoom telehealth" → "Beam telehealth".
- **Reword:** "HIPAA-compliant Zoom video visits — E2EE, waiting room, no cloud recording" → "HIPAA-compliant video visits — E2EE, waiting room, no cloud recording."

---

## Page: `https://leafjourney.com/clinic/communications/zoom` → `https://leafjourney.com/clinic/communications/beam`

- **Rename the URL** (and route) `/communications/zoom` → `/communications/beam`.
- **Topic** dropdown options: follow up, med refill, same day clinic, other.
- **Start Time:**
  - Hours dropdown: 1–12, no infinite scroll. Scroll bar visible (1 to 12).
  - Minutes dropdown: 1–59, no infinite scroll. Scroll bar visible (1 to 59).
- **Duration (minutes):** dropdown in 5-min increments (5, 10, 15, 20, …) up to 60 max. Continue to allow freehand entry.
- Rename "Counterparty" → `Connect With`.
- **Connect With:** patient AND provider/support staff can both be selected (group calls). HIPAA-compliant encrypted care-team call, up to 10 total members.
  - Selected buttons highlight green for easy ID
  - Selecting "patient" relabels "Patient ID" → `Patient Name`. Search by full/partial name, DOB, phone.
  - Selecting "provider/support staff" — text box searches by full/partial provider name, specialty, or phone.
- **"Schedule HIPAA Zoom" button currently broken — fix it.** When clicked:
  - Visit lands in `/clinic/schedule` in same bubble format as a regular appt
  - Still shown in Upcoming Visits on `/communications/beam`
  - On completion, visit moves to Recent Visits
- **Recent Visits relabel:** "last 12 completed or past Beam visits" → "last 10 completed or past Beam visits". Both Upcoming and Recent boxes stay static-size with internal scroll bars.

---

## Page: `https://leafjourney.com/clinic/communications/voicemail`

- **Inbound voicemails** — when patients call the provider's number and leave a message, populate inbox with: time received, patient name, DOB, phone number.
- Clicking a voicemail expands a collapsible drop-down showing the full AI transcript.
- **"Create Greeting" button** to right of "Voicemail":
  - Popup with free-text box → AI voice generation of greeting
  - Microphone button → voice-record the greeting directly
  - `Save` (stores to practice's individual LeafJourney server/account) or `Cancel` (deletes, returns to main page)
  - Re-opening "Create Greeting" later shows the saved greeting; provider can edit
- **"Log a voicemail" box:**
  - **Reword:** "Front-desk capture path — the transcript is redacted before persistence, so PHI never lands in the database raw." → "The front desk removes private health information from the notes before saving them so no personal information is stored in the EMR."
  - **From field** — freehand phone entry without country code/hyphens; system formats with country code + hyphens automatically
  - Rename "Patient ID" → `Patient Info`. Search by phone (with/without hyphens), DOB, full last name, full first name, medical life number.
  - If multiple matches → dropdown labeled `multiple` opens popup with pending date, first/last name, DOB, gender, phone; clicking a row populates Patient Info
  - **Duration field** — dropdown (no more up/down arrows): `5s, 10s, 15s, …, 55s, 1m, 1m 5s, 1m 10s, …, 3m`. Freehand entry still allowed.
  - **Clarify "audio storage key"** — explicitly to ALL AI agents: LeafJourney does NOT store any audio anywhere for more than 30 days. All servers auto-delete audio. Voice signatures must not be compromised.
  - Rename "Assign to (optional)" → `Assign to` (REQUIRED, not optional). Dropdown of all providers + support staff (MAs, nurses, front office, back office).
  - Clicking `Log voicemail` sends it to the assigned staff member's inbox.
- **Archived** — keep last 10 voicemails. Auto-delete after 30 days from recording date.

---

## Page: `https://leafjourney.com/clinic/communications/transcripts`

- **Justify-or-archive.** Reason for this page is unclear. AI agents must produce a one-paragraph justification for keeping this page. Otherwise archive it.

---

## Page: `https://leafjourney.com/clinic/communications/fax`

- **"Send a fax" box:**
  - **To field** — type without country code/hyphens; dropdown of matched contacts. Searchable by: fax number, provider/support staff name, department (e.g., "UCLA Neurology", "UCLA Cardiology"). All fax numbers must be mapped per organization using LeafJourney.
  - **From field** — defaults to the practice's fax number, auto-populated.
    - Small dropdown arrow → `other` option opens popup with `Fax #:` free-text field
- **Recent Activity box:**
  - Rename "Last 50 inbound and outbound transmissions" → "Last 50 inbound and outbound faxes."
  - After 50 messages → archive older entries for 7 full years (2,555 days) per medical records statute of limitations.
  - Both inbound and outbound faxes organized by **timestamp** (sent or received)
  - Toggle **ascending / descending** order
  - Two buttons on the right side of the box: `Sent` and `Received`
    - `Sent` → organize all sent faxes by send timestamp
    - `Received` → organize all received faxes by receive timestamp
  - **Status bubbles** on the right side of each fax:
    - `Queued` — blue
    - `Received` — red
    - `Error` — black
    - `Sent` — red
  - *Note: original doc lists both `Received` and `Sent` as red; flag for Dr. Patel — likely a typo.*
  - If a fax is `Error`, provide a **resend** action
  - When a transmission succeeds, transition `Queued` → `Sent` AND append a timestamp page at the end of the transmitted fax PDF
  - **Click any fax row** → drop-down expands the full PDF inline using the Adobe PDF reader API plugin so provider/staff can see exactly what was sent and when. Include a `Resend` button on the expanded view.

- **Pages (was "Pages"):**
  - Rename `Pages` → `Pages (optional)`
  - Drop-down menu: `1` through `10`. Freehand typing still allowed.

- **Patient Info (was "Patient ID (optional)"):**
  - Rename → `Patient Info`
  - **Mandatory** (no longer optional)
  - Search by phone (with/without hyphens), DOB, full last name, full first name, medical life number
  - If multiple matches → dropdown labeled `multiple` opens popup with pending date, first/last name, DOB, gender, phone — clicking a row populates Patient Info

- **Cover note (optional):**
  - Keep the free-text box as-is
  - Below the free-text box: **green `Upload Cover Note` button**
    - `Title` field — free-text for the cover note's name; saved to the practice's LeafJourney account
    - Clicking a saved cover note title → popup with full Adobe PDF API view (zoom + scroll). Bottom-right: `Cancel` / `Edit` (edit the PDF OR rename the title)
    - **Upload UX:** popup with `Upload here` box, beautiful aesthetically-pleasing leaf in middle, label `PDF only`. Drag-and-drop a PDF OR click `Upload` → file picker (Dropbox / Google Drive style).
    - Once uploaded, displays under Cover note showing only the **title** (clickable → PDF view popup as above)
  - **Maximum 3 cover notes saved** — provider picks which to send based on fax type

---

## Page: `https://leafjourney.com/clinic/communications/broadcasts`

### Patient list builder (new)
- **`Create patient list` button** to the LEFT of `Create campaign`
- Clicking opens a popup with:
  - `Patient info` title + free-text search box — partial name, phone (with/without hyphens), DOB, full last name, full first name, medical life number
  - `Add` button to the right of search (or `Enter` on keyboard)
  - `Patient list` box below — rows: First name, Last name, DOB, Phone, Email
  - **Trash icon** per row → confirm popup: `Cancel` (back to popup) / `Delete` (removes patient from list)

### Channel
- Add `SMS and Text` option to the Channel dropdown

### New Campaign box

- **Audience dropdown:**
  - `Active patients`
  - `All patients`
  - `Custom` — option label is replaced by the **name of the saved patient list** (from the new list builder above)
- **Message Body:** keep `Hi {first name}!, just a reminder, …` template
- **Schedule for (optional):**
  - Hours dropdown: `1`–`12`, no infinite scroll, scroll bar visible (1 to 12)
  - Minutes dropdown: `1`–`59`, no infinite scroll, scroll bar visible (1 to 59)
  - Continue to allow full freehand date/time entry
- **Frequency (optional)** — NEW header next to Schedule for
  - Determines how often messages send to the Audience
  - Free-hand text box with options: `once per week`, `once per day`, `once per month`
  - **Maximum twice per day**
  - Time picker mirroring the Schedule-for hours/minutes pattern
  - `Save` / `Cancel` — save schedules the recurrence; cancel removes it
- **End Campaign** — NEW header below Schedule for
  - Same calendar UX as `Schedule for`
  - Cutoff date when campaign automatically stops pushing messages

### Recent Campaigns box
- List in **created-at order**. Click any campaign → drop-down expands the full New Campaign details, reviewable / editable.
  - `Edit` button to modify details
- **Airplane (send) icon** per campaign row → immediate send. Confirm popup `Send message?` with `Send` / `Cancel`.
- **Status bubbles** per campaign:
  - `Active` — green
  - `Scheduled` — yellow
  - `Completed` — red
- **Right-click campaign** → `Delete` option

---

## Page: `https://leafjourney.com/clinic/morning-brief`

Three possible dispositions, in order of preference:

1. **Merge into `/clinic/messages`** — add a new category next to `all`, `urgent`, `high`, etc called `brief`
2. **Justify keeping** — AI agents produce a one-paragraph justification for why this page stays
3. **Archive** — if neither merge nor justification holds

Dr. Patel preference: lean toward merge.

---

**✅ DOC 2 COMPLETE.** Received in two parts (initial 2026-05-16, remainder 2026-05-17). All pages captured.
