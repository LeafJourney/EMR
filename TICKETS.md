# EMR Platform — Ticket Backlog

> Source: Dr. Neal Patel's product prompts + Justin Kander's clinical feedback
> Priority: 1=Urgent, 2=High, 3=Normal, 4=Low
> Status: backlog | ready | in_progress | done

---

## Epic: Cannabis Pharmacology & Prescribing

### EMR-001: Cannabis Combo Wheel
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create an interactive cannabis combo wheel where clinicians can combine different cannabinoids (THC, CBD, CBN, CBG, THCA, CBDA), terpenes (myrcene, limonene, linalool, pinene, caryophyllene, humulene), and flavonoids — then see the resulting therapeutic profile, target symptoms, risks, benefits, and evidence strength.

The wheel should be visual and interactive — not a table. Think of a circular composition tool where you add cannabinoids to the center and the outer rings show symptom matches, delivery recommendations, and dosing ranges from the research corpus.

**Acceptance criteria:**
- Interactive UI component (client-side)
- Cannabinoid + terpene + flavonoid selection
- Shows target symptoms, evidence strength, risks/benefits
- Pulls data from `data/cannabis-research-corpus.json`
- Available in clinician workspace (research section or chart sidebar)

---

### EMR-002: Dispensary Integration & Product SKU Scanning
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a prescription module that ties into dispensaries where they scan every SKU of every product. The EMR recommends the right products based on SKU availability within a 30-mile radius. Create an internal purchasing store where patients can buy products directly from the EMR, which then documents and creates a paper trail.

**Phases:**
1. Dispensary product catalog API (ingest SKU data)
2. Geolocation-based dispensary lookup (30-mile radius)
3. Product recommendation engine (match patient regimen to available SKUs)
4. In-app purchasing flow (patient buys from EMR → dispensary fulfills)
5. Paper trail / audit log for all purchases

**Acceptance criteria:**
- Dispensary can register and sync product catalog
- Patient sees available products near them matching their Rx
- Purchase creates a documented trail in the patient record
- Clinician can see what the patient purchased

---

### EMR-003: Milligram-Based Dosing Display (Justin Kander)
**Priority:** 2 — High
**Source:** Justin Kander
**Description:**
When analyzing data, the most important insight is mg of cannabinoids, not volumes. Patient instructions should show both volumes AND mg. If the product changes but the mg dose stays the same, the patient should see that clearly.

Track: product types, concentrations, volumes, and doses. For inhalation, track puffs + product concentration and estimate mg via algorithm.

**Status:** Partially done — DosingRegimen model has calculatedThcMgPerDose/Day. Need to enhance the patient-facing display and add inhalation estimation.

**Remaining work:**
- Patient medications page: show "0.5 mL = 2.5 mg THC + 2.5 mg CBD" more prominently
- Inhalation dose estimator: puffs × estimated mg/puff from product concentration
- When product changes, show "Your mg dose stays the same, only the volume changed"

---

### EMR-004: Dosing Recommendation Engine
**Priority:** 3 — Normal
**Source:** Justin Kander + Dr. Patel
**Description:**
Deploy a seamless recommendation engine for products, cannabinoid ratios, doses, and dominant terpenes. Use Justin's research corpus as the evidence base. Separate PRO-dosing insights from research-insights since the data sources are different.

**Architecture:**
- New AI agent: `dosingRecommendation` — takes patient symptoms + outcomes and queries the research corpus
- Returns: recommended cannabinoid ratios, dose ranges, delivery methods, terpene profiles
- Shows evidence tier: "Based on RCT" vs "Based on PRO" vs "Based on clinical experience"
- Surfaces in the clinician chart during prescribing and in the scribe note

---

## Epic: Billing & Coding

### EMR-005: AI-Powered Billing & CPT/ICD-10 Coding
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a billing structure where AI generates the clinical note, extrapolates all pertinent data to code at the highest CPT code, and links with proper ICD-10 codes. Have AI understand current ICD-10 coding guidelines for all cannabis applications.

**Status:** Partially done — Coding Readiness Agent v2 generates ICD-10 + E&M suggestions. Need to expand to full CPT coding and billing workflow.

**Remaining work:**
- CPT code suggestion (not just E&M level but specific procedure codes)
- Cannabis-specific ICD-10 guidance (F12.x series, Z71.89 counseling, etc.)
- Billing worksheet generation (CPT + ICD-10 linked, ready for submission)
- Superbill / CMS-1500 scaffold
- Revenue tracking dashboard in ops

---

## Epic: Lifestyle Care Plan

### EMR-006: LIFESTYLE Module — Cornerstone of EMR
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Description:**
Create a LIFESTYLE-based care plan that revolves around:
- **Sleep**: sleep hygiene, simple tricks to improve sleep
- **Food**: meal plan based on medical history (diabetes, heart disease, dementia)
- **Exercise**: regimen tailored to condition and ability
- **Stress reduction**: techniques, mindfulness, breathing exercises
- **Family dynamics**: social support considerations
- **Habit formation**: behavioral change framework
- **Social connectivity**: community, support groups

Make LIFESTYLE the CORNERSTONE of the EMR. Make it fun — with pictures, colors, and interaction with the patient. Cater to patient's socioeconomic status, gender, and precautions.

**Acceptance criteria:**
- New route: `/portal/lifestyle` for patients, `/clinic/patients/[id]` tab for clinicians
- AI-generated personalized plans based on patient data
- Visual, colorful, interactive — NOT a clinical printout
- Covers all 7 domains (sleep, food, exercise, stress, family, habits, social)
- Printable / shareable (like My Story)

---

## Epic: Supply Store & DME

### EMR-007: AI-Powered Supply Store
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Create a supply store and chain where AI can summarize patient data and recommend durable medical equipment, products, and OTC medications for standard issues like cough, cold, insomnia, pain.

**Features:**
- Product catalog (DME, OTC, supplements, wellness products)
- AI recommendation agent based on patient conditions + outcomes
- In-app ordering with delivery tracking
- Integration with patient's care plan and medication list
- Revenue model for the practice

---

## Epic: Patient Experience & Education

### EMR-008: Educational Library
**Priority:** 2 — High
**Source:** Justin Kander
**Description:**
Educational libraries for patients and physicians covering:
- What the endocannabinoid system is
- Understanding dosing (mg, volumes, ratios)
- Benefits of different cannabinoids
- Potential adverse effects
- How to optimize therapy (minimum effective THC dose)

**Routes:** `/portal/learn` (patient), `/clinic/library` (clinician)

---

### EMR-009: 3rd-Grade Reading Level Patient Explainer
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Explain a patient's medical history and diagnoses at a 3rd-grade reading level for easier comprehension. AI agent that takes clinical data and rewrites it in plain, warm, simple language.

**Implementation:** New narrative function in `narrative.ts` or a dedicated "plain language" agent that rewrites chart summaries, note blocks, and care plans at a simplified reading level.

---

### EMR-010: Visual Health Roadmap
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a visual roadmap of the patient's past history, current history, and future trajectory. Allow multiple pathway options showing risks, benefits, and effects of each choice.

Example: Patient is overweight, no exercise →
- **Path 1** (status quo): trajectory shows declining quality of life
- **Path 2** (add exercise): trajectory shows better weight and improvement in 6 months

**Implementation:** Interactive visualization (could use SVG or a charting library). AI generates the pathway projections based on patient data + clinical evidence.

---

### EMR-011: Personal Vitals & History (Warmer Wording)
**Priority:** 4 — Low
**Source:** Dr. Patel
**Description:**
Vitals, allergies, past medical history, past surgical history — change wording to be more personal. Instead of "PMH: HTN, DM2, CAD" → "Your health story includes high blood pressure, type 2 diabetes, and heart disease."

**Implementation:** Update the chart summary, My Story, and care plan pages to use warm, personal language. Extend the narrative.ts module.

---

## Epic: Scheduling & Communications

### EMR-012: Scheduling Module with SMS Reminders
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a scheduling module for follow-up appointments that notifies patients via automated text 7 days, 2 days, and 1 day before scheduled appointment time. Allow patient to cancel and reschedule directly from the EMR app.

**Components:**
- Appointment booking UI (patient + operator)
- SMS integration (Twilio or similar)
- Automated reminder workflow (7d, 2d, 1d)
- Cancel/reschedule from the patient portal
- Calendar view for clinician and operator

**Status:** Partially done — Appointment model exists, scheduling agent creates reminders as Tasks. Need real SMS integration and self-service cancel/reschedule.

---

## Epic: EMR Integration & Interoperability

### EMR-013: Conventional EMR Integration
**Priority:** 3 — Normal
**Source:** Justin Kander
**Description:**
Consider integration with other EMRs or replacing them entirely. Most doctors use another EMR for conventional procedures and pharmaceutical management. If this EMR can track conventional treatments as well, it greatly expands the user base.

**Architecture:**
- HL7 FHIR adapter for bidirectional data exchange
- Medication reconciliation (cannabis + conventional)
- Problem list sync
- Encounter/note import
- CCD/CDA document support

---

## Epic: Infrastructure & Platform

### EMR-014: DICOM Viewer & PACS Integration
**Priority:** 4 — Low
**Source:** Product vision
**Description:**
Implement DICOM image viewing so physicians don't need a separate PACS system. Images viewable directly in the patient chart.

**Status:** Images tab exists with DICOM-ready placeholder. Need actual DICOM parsing + viewer component.

---

### EMR-015: Justin's UI Feedback
**Priority:** 3 — Normal
**Source:** Justin Kander
**Status:** Partially done
**Remaining:**
- [x] Remove duplicate "Log a check-in" on Outcomes page
- [x] Better hover effects on primary buttons
- [ ] More pronounced hover effects across all interactive elements
- [ ] General UX polish pass based on Justin's testing

---

---

## Epic: Prescribing Module v2

### EMR-016: Full Prescription Form with Dropdowns + Manual Input
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Description:**
Prescription module with all dropdown menus AND manual data input:
- NAME of medication (searchable dropdown + free text)
- Dose (mg, mL, etc.)
- Sig = amount to take and how many times daily
- Days supply
- Quantity
- Type (tablet, tincture, edible, gummy, flower, grams, mL)
- Refills (number)
- Drug interaction warning popup (YELLOW or RED) that MUST be acknowledged and signed off before final submission
- Two note boxes: "Note to patient" + "Note to pharmacy (internal)"
- Diagnosis linking button: link cannabis medication to ICD-10 diagnosis (GAD F41.1, MDD F32.9, HTN I10, HLD E78.00, Insomnia G47.00, etc.)
- On final Rx send: automated text message to patient with exact name/brand, dosing, amount prescribed, and PICKUP LOCATION (store name, address, phone, hours)

---

### EMR-017: Dispensary Locator with Google Maps
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a Google Maps inlay that locates:
- All local dispensaries
- All local cannabis healthcare providers
Embedded map component with pins, info cards, and directions.

---

### EMR-018: Leafly Strain Database Integration
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Map most common medical issues that cannabis is used for (sleep, anxiety, insomnia, stress, pain, cancer) and map to ALL strains of flower from the Leafly database. Include terpene profiles and cannabinoid profiles for each strain. Create a searchable strain finder that matches patient symptoms to optimal strains.

---

## Epic: Patient Demographics & Identity

### EMR-019: Full Demographics Tab
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Demographics tab including:
- DOB, age (auto-calculated), SSN (encrypted), sex, race/ethnicity, marital status
- Home address, email, phone number
- Alert box (allergies, critical info)
- Picture box for identity photo
- 1 unique thing about them (personal touch)
- "Medical Life Number" (NOT medical record number — find the right term for a lifelong identifier)
- Insurance information with backend eligibility checking to determine coverage for products

---

## Epic: Clinical Notes & Documentation

### EMR-020: APSO Note Format with Wearable Integration
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create a SOAP note but in the order of: Assessment, Plan, Subjective, Objective (APSO).
- Allow vital input from wearable technology: Apple Watch, Whoop, Oura Ring
- Create correlations and extrapolate trends based on cannabis intake and vitals
- "They are not a patient. This is human care."
- "They are not the system, they are a story, and every story deserves to be heard."

---

### EMR-021: AI-Recommended Initial Treatment Plan
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create an AI-prompted and recommended initial care plan that physicians can use as a starting point, modify, and then sign off on before giving to patient. The AI uses research corpus + patient data + outcomes to generate evidence-based recommendations. Physician has final authority.

---

## Epic: Gamification & Patient Engagement

### EMR-022: Cannabis Plant Health Companion
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a virtual cannabis plant that GROWS or DIES based on how well the patient takes care of their health:
- Exercise done 2x/week = new leaves
- Exercise done 1 month in a row = new stems
- Lost 5 lbs in one month = new flowers
- Water intake = leaves turn yellow (dehydrated) or green (hydrated)
- Doctor visit completed = new fertilizer
- Preventive care done (colonoscopy, mammogram, bone density) = more stems, leaves
- Eat poorly, poor sleep, poor water, stress = plant starts dying

This is the gamification of health. Visual, interactive, emotional.

---

### EMR-023: Gamify Health (Apple Rings Style)
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Gamify health metrics like Apple's activity rings:
- Exercise workouts completed
- Water intake
- Weight trends
- Vitals comparison (BP, HR, weight, MOOD over time)
- Streaks, achievements, milestones
- Cannabis-specific tracking rings (doses taken, outcomes logged)

---

### EMR-024: Positive Input Requirement
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
For every "problem" a patient inputs (poor sleep, pain, stress, digestive issues), prompt that they MUST input one POSITIVE thing about their life/health — family, finance, weather, gratitude, etc.
"They don't have problems, this is a process."
Patients should focus on both challenges AND positives.

---

## Epic: Design & Branding

### EMR-025: Cannabis-Themed Design Palette
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Design updates:
- Cannabis plants in light shade in background
- Main colors: green, white, purple (similar to cannabis plants)
- Accents of orange
- Try different palettes
- Cannabis-specific visual language throughout

---

### EMR-026: Cannabis Emojis
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create custom cannabis emojis for use in messaging, notes, and the UI:
stems, leaves, plant, fire, tincture drop, pain icon, sleep icon, anxiety icon, depression icon, cancer ribbon

---

### EMR-027: Platform Disclaimer
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a disclaimer at the bottom of the platform:
"Cannabis should be considered a medicine so please use it carefully and judiciously. Do not abuse Cannabis and please respect the plant and its healing properties."

---

## Epic: Platform & Infrastructure

### EMR-028: Split Window / Multi-Tab View
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** done
**Description:**
Create split window ability WITHIN the EMR so up to 3 MAX tabs can be open at the same time. Makes it easier to maneuver instead of clicking back and forth. Think Bloomberg Terminal or VS Code split panes — but for clinical workflows.

---

### EMR-029: ADA Compliance
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Maintain American Disability Act (ADA) friendly website:
- WCAG 2.1 AA compliance
- Screen reader support
- Keyboard navigation for all workflows
- High contrast mode
- Focus indicators
- Alt text on all images
- Semantic HTML throughout

---

### EMR-030: Multi-Language Support
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create language conversions for:
English, Spanish, Vietnamese, Gujarati, Hindi, and more.
i18n framework with per-page translations. AI-assisted translation for dynamic content (notes, messages, care plans).

---

### EMR-031: Responsive Cross-Device Experience
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
"We want the EMR seamless from desktop, phone to iPad."
Full responsive audit and optimization across all breakpoints. Touch-friendly interactions on mobile. Consider PWA or native app wrapper.

---

### EMR-032: Patient Lab/Document Email & Print
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Allow patients to EMAIL labs, notes, chart documents AND print right from the portal in OCR PDF format. Clean, professional document formatting.

---

## Epic: Communications

### EMR-033: Physician-to-Physician Secure Portal
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create two communication portals:
1. Patient ↔ Physician portal (already exists — enhance it)
2. SECURE PRIVATE Physician ↔ Physician portal for internal communication BETWEEN providers about patient care. HIPAA-compliant, separate from patient-facing messages.

---

### EMR-034: Phone & Video Capability in Messaging
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create phone and video capability + icons within the messaging/inbox tab. Click-to-call, video visit launch, call logging.

---

## Epic: Data & Analytics

### EMR-035: Backend Data Extrapolation Dashboard
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Backend data extrapolation with BOTH identifying and de-identifying information. Allow backend user to click on all applicable fields (DOB, name, age, sex, etc.) to build custom reports and research datasets. Support for de-identified exports for research purposes.

---

## Epic: Educational Resources

### EMR-036: Justin Kander's Book & Free Resources
**Priority:** 4 — Low
**Source:** Justin Kander
**Status:** in_progress
**Description:**
Add Justin's book (FreeCannabisCancerBook.com) to the educational library as a free resource. It's the largest integration of human cases and research demonstrating how cannabis fights cancer. Good resource for patients and providers, even though dosing isn't well-characterized in all cases.

---

## Summary

| # | Title | Priority | Epic | Status |
|---|---|---|---|---|
| 001 | Cannabis Combo Wheel | High | Pharmacology | **done** |
| 002 | Dispensary Integration & SKU Scanning | High | Pharmacology | backlog |
| 003 | Milligram-Based Dosing Display | High | Pharmacology | partial |
| 004 | Dosing Recommendation Engine | Normal | Pharmacology | **done** |
| 005 | AI-Powered Billing & CPT/ICD-10 | High | Billing | **done** |
| 006 | LIFESTYLE Module | Urgent | Lifestyle | **done** |
| 007 | AI-Powered Supply Store | Normal | Supply Store | backlog |
| 008 | Educational Library | High | Education | **done** |
| 009 | 3rd-Grade Reading Level Explainer | Normal | Education | **done** |
| 010 | Visual Health Roadmap | High | Education | **done** |
| 011 | Personal Vitals Wording | Low | Education | **done** |
| 012 | Scheduling Module + SMS | High | Scheduling | partial |
| 013 | Conventional EMR Integration | Normal | Integration | backlog |
| 014 | DICOM Viewer & PACS | Low | Infrastructure | stub |
| 015 | Justin's UI Feedback | Normal | UI Polish | partial |
| 016 | Full Prescription Form (Rx v2) | Urgent | Prescribing | **done** |
| 017 | Dispensary Locator (Google Maps) | High | Prescribing | backlog |
| 018 | Leafly Strain Database Integration | Normal | Pharmacology | backlog |
| 019 | Full Demographics Tab | High | Demographics | **done** |
| 020 | APSO Note + Wearable Integration | High | Documentation | **done** |
| 021 | AI-Recommended Initial Plan | High | Documentation | **done** |
| 022 | Cannabis Plant Health Companion | High | Gamification | **done** |
| 023 | Gamify Health (Apple Rings) | Normal | Gamification | **done** |
| 024 | Positive Input Requirement | Normal | Gamification | **done** |
| 025 | Cannabis Design Palette | High | Design | **done** |
| 026 | Cannabis Emojis | Low | Design | **done** |
| 027 | Platform Disclaimer | Low | Design | **done** |
| 028 | Split Window / Multi-Tab | High | Platform | **done** |
| 029 | ADA Compliance | High | Platform | **done** |
| 030 | Multi-Language Support | Normal | Platform | **done** |
| 031 | Responsive Cross-Device | High | Platform | backlog |
| 032 | Patient Email/Print Documents | Normal | Platform | **done** |
| 033 | Physician-to-Physician Portal | High | Communications | **done** |
| 034 | Phone & Video in Messaging | Normal | Communications | **done** |
| 035 | Backend Data Dashboard | Normal | Analytics | **done** |
| 036 | Justin's Book in Library | Low | Education | **done** |

---

## Wave 8+ — Dr. Patel's Late Night Vision Drop (April 10)

### EMR-037: End-to-End Communications Overlay
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- E2E encrypted text messaging with transcription
- HIPAA-compliant video calls
- Fax capabilities (send + receive)
- HIPAA-compliant phone calls
- AI transcription for phone calls — capture only pertinent medical info, DISCARD personal data
- Full communication suite within the EMR

---

### EMR-038: Cannabis & Cancer Book Integration
**Priority:** 3 — Normal
**Source:** Dr. Patel / Justin Kander
**Status:** in_progress
**Description:**
Integrate Justin's book (Cannabis and Cancer) into the backend as a reference guide and data source. Parse and index for the Research Agent and educational library. Source: Dropbox link provided.

---

### EMR-039: Product Store with Affiliate Links
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create "Store" button on top right. Include affiliate links for product selections:
- phytorx.co
- flowerpoweredproductsllc.com
- aulv.org
Disclaimer popup on link open: "Please consult your healthcare provider before considering these products..."
Full Amazon-style store framework for cannabis products. Joint decision language.

---

### EMR-040: Cannabis Plant 101 — Front Page Feature
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a 101-word paragraph on the front page about the beauty, power, healing properties, and sacredness of the cannabis plant. Include that all who use the website shall respect the plant and use it with intention. Highlighted section with beautiful background and typography.

---

### EMR-041: Ambient Classical Music on Front Page
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Front page plays beautiful, relaxing classical music (no words) at low volume with a small mute icon. Subtle, non-intrusive. Consider autoplay policies.

---

### EMR-042: MIPS Data Extrapolation
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
AI functionality to extrapolate data from chart notes and messages to obtain MIPS (Merit-based Incentive Payment System) data. Meet all CMS data requirements. Upload entire MIPS requirements and CMS rules around cannabis as Schedule 3.

---

### EMR-043: Animated Plant Companion (Enhanced)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
The health plant needs MOTION — live cartoon feel:
- Positive actions: container pops up and pours water on plant, sun shines
- Negative: weather gets cloudy, water dries up, plant starts to wilt
- Full animation, not static SVG
- Consider Lottie or CSS animations or Canvas

---

### EMR-044: Modular Licensable EMR Framework
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Make the entire EMR built on a fully licensable, modular framework:
- Clients can buy individual modules
- API-friendly for integration with Cerner, Epic, Practice Fusion
- Reproducible for selling and scaling
- Maintains integrity while being customizable
- Full white-label capability

---

### EMR-045: Insurance Billing AI Agent System
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Build intricate backend insurance/coding/charting system with SEPARATE AI agents that communicate with each other to ensure highest possible billing amount correlating to proper documentation and coding. Maximize reimbursement rates from each major US insurance company.

---

### EMR-046: Insurance Eligibility Checker
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Built-in eligibility software to determine if patient's insurance or conditions qualify them for insurance-reimbursed cannabis products or a state medical cannabis card. Document and note in chart if eligible.

---

### EMR-047: Medicare CBD Reimbursement Framework
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create entire framework for the upcoming CMS program allowing Medicare recipients to purchase up to $500 of CBD with proper reimbursement. Track eligibility, purchases, and reimbursement status.

---

### EMR-048: About Page — Founders & Mission
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create "About" section showing:
- Scott Wayman — AI genius, successful entrepreneur, EMR savant (pull bio from LinkedIn)
- Dr. Neal H Patel — shaman, innovator, visionary, philanthropist, cannabis expert (pull from LinkedIn + PhantomMed.com)
- Include photos
- Mission statement: "As doctors and patients, we are done with the current EMR models. It's outdated, archaic, not user friendly, and intimidating. We aim to create a revolutionary new EMR from scratch... This isn't MyChart. This is MyStory. This isn't a patient's medical history. This is a patient's medical journey. This isn't a patient's problem, it's a patient's process. We will not disrupt healthcare. We will destroy it and rebuild it the right way."

---

### EMR-049: Pricing & Subscription Tiers Page
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create links or side website that breaks down EMR pricing and tiers of subscription options based on client needs. Modular pricing aligned with EMR-044's module structure.

---

### EMR-050: EMR Slogan
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a slogan for the EMR, max 10 words. Ideas to incorporate: "Personalized cannabis care at your fingertips from an EMR and providers who have heart and soul."

---

### EMR-051: Native Mobile App (iOS, iPad, Android)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create the entire EMR as a NATIVE app for iOS, iPad, and Android with proper dimensions, stretching, and seamless cross-device experience. Consider React Native, Expo, or Capacitor wrapper.

---

### EMR-052: Clinical Trial Matching
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Connect patient chart data to the largest national clinical trial databases (ClinicalTrials.gov). AI determines if patient is eligible for trials based on their data. Send recommendation directly to patient's portal, email, or text — AI-summarized trial info including website, trial type, and what it consists of.

---

### EMR-053: ProHub Integration
**Priority:** 2 — High
**Source:** Meeting notes (Ryan Castle, Jim Gerencser)
**Status:** in_progress
**Description:**
Merge the ProHub's robust backend of dynamic, validated surveys and longitudinal tracking with the EMR's frontend. ProHub was built to be modular and API-friendly. Goal: centralized one-stop shop tying ProHub + Cancer Playbook + EMR into a full ecosystem.

---

### EMR-054: Veterinary & Psilocybin Expansion
**Priority:** 4 — Low
**Source:** Meeting notes
**Status:** in_progress
**Description:**
System architecture should support replication for:
- Veterinary cannabis care
- Psilocybin-based therapy platforms
- Other conditions (breast cancer specific, etc.)
White-label + modular architecture from EMR-044 enables this.

---

### EMR-055: Data Ownership & Security Framework
**Priority:** 2 — High
**Source:** Ryan Castle
**Status:** in_progress
**Description:**
Ensure proper data ownership — not just access via AWS/GCP but actual proprietary ownership. Document data ownership agreements, implement data sovereignty controls, and ensure the platform's uniqueness is protected even when hosted on cloud infrastructure.

---

## Updated Summary

| # | Title | Priority | Status |
|---|---|---|---|
| 001-036 | Original backlog | Various | 33 done, 3 remaining |
| 037 | Communications Overlay | High | backlog |
| 038 | Cannabis Book Integration | Normal | backlog |
| 039 | Product Store + Affiliates | High | **done** |
| 040 | Cannabis Plant 101 Paragraph | Normal | **done** |
| 041 | Ambient Music | Low | **done** |
| 042 | MIPS Data Extrapolation | High | backlog |
| 043 | Animated Plant Companion | High | **done** |
| 044 | Modular Licensable Framework | Urgent | backlog |
| 045 | Insurance Billing AI Agents | High | backlog |
| 046 | Insurance Eligibility Checker | High | **done** |
| 047 | Medicare CBD Framework | Normal | **done** |
| 048 | About Page — Founders | High | **done** |
| 049 | Pricing & Tiers | Normal | **done** |
| 050 | EMR Slogan | Low | **done** |
| 051 | Native Mobile App | High | backlog |
| 052 | Clinical Trial Matching | High | **done** |
| 053 | ProHub Integration | High | backlog |
| 054 | Vet & Psilocybin Expansion | Low | backlog |
| 055 | Data Ownership Framework | High | **done** |

**Total: 55 tickets across 20+ epics. 44 shipped, 11 remaining.**

---

## Wave 14+ — Dr. Patel's Product Drop #2 (April 11)

### EMR-056: Comprehensive Product + Dosing Recommendation Engine
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Deploy a seamless recommendation engine for products, cannabinoid ratios, doses, and dominant terpenes based on ALL cannabinoid databases from online sources and well-published books. Expand beyond the current research corpus to include book references (e.g., Justin Kander's book, Russo's work, other canonical texts). AI agent cross-references patient data against the full corpus.
**Relates to:** EMR-004 (Dosing Recommendation Engine — foundation done)

---

### EMR-057: Native Mobile App with HDMI/Projector Support
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Create the entire EMR as a NATIVE app that runs on iOS, iPad, and Android with proper dimensions, stretching, and seamlessly in both portrait and landscape mode with proper zooming proportions and proper stretching when connected via a projector or HDMI.
**Expansion of:** EMR-051
**Tech:** React Native or Capacitor wrapper; responsive scaling for external displays

---

### EMR-058: Clinical Trial Auto-Recommendation Delivery
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Create full framework to connect the patient chart and all chart information to the largest national clinical trial databases (ClinicalTrials.gov) to determine eligibility. AI-summarized recommendation delivered directly to patient via portal, email, OR text — including website, trial type, and description.
**Relates to:** EMR-052 (basic matching done; needs delivery pipeline)

---

### EMR-059: Single-Page Prescription Module (No Scrolling)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Prescription module must fit on ONE page, FIXED, without scrolling. All necessary parameters visible at once: product, dose, sig, days supply, quantity, type, refills, interaction warning, note boxes, diagnosis link, patient instructions.
**Status:** Current Rx form scrolls — needs layout redesign with tighter density

---

### EMR-060: Minimum Clicks, Minimum Scrolling UX Pass
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Global EMR audit: reduce clicks between tabs, reduce scrolling to find information. Patients and providers should see all critical information in a simple, clean format on a single viewport wherever possible. Information density over whitespace where it matters (clinical screens).

---

### EMR-061: Motivational Quotes System
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Motivational quotes pop-up on login. Every page has a rotating quote that refreshes. Draw from keywords covering positive emotions: God, love, faith, emotions, energy, happiness, resilience, persistence, not giving up, etc. A curated library of 100+ quotes with themes.

---

### EMR-062: Ancillary Services EMR Module (OT, PT, Speech, Case Mgmt, Home Health)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full ancillary EMR module including Occupational Therapy, Physical Therapy, Speech Therapy, Case Management, and Home Health documentation. Sign-off workflow back to primary provider. Seamless communication between all services within the platform.

---

### EMR-063: Pharmacy Communication Module with Dual Sign-Off
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Backend pharmacy communication module — direct access to pharmacists for clarifications or recommendations. Any medication change requires BOTH pharmacist AND provider sign-off before taking effect. Audit trail captures who approved what and when.

---

### EMR-064: Audit Log PDF Export
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full running log of documentation and backend clicks: who accessed each chart, timestamps, what was viewed/modified. Exportable as a PDF for HIPAA auditing purposes. Filter by date range, user, patient.
**Status:** AuditLog model already exists; needs export UI

---

### EMR-065: AI Compliance Auditing Agent
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full automated AI agent that continuously audits all notes, labs, and communications for compliance with CMS standards. Cross-references with major insurance company auditing requirements (Aetna, BCBS, UHC, Cigna, Humana, Medicare, Medicaid). Flags gaps before submission.

---

### EMR-066: Validated Assessment Library Expansion
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Add ALL peer-reviewed validated surveys under the Assessments tab:
- Pain: BPI, PEG, McGill Pain Questionnaire
- Anxiety: GAD-7 (done), BAI, HAM-A
- Depression: PHQ-9 (done), PHQ-2, Beck Depression Inventory
- Insomnia: ISI, PSQI, Epworth Sleepiness Scale
- Stress: PSS-10, Perceived Stress Scale
- Cancer: FACT-G, EORTC QLQ-C30
- Function: PROMIS-29 (done), Oswestry Disability Index
- Cognition: MoCA, MMSE, SLUMS
- Substance: AUDIT, DAST, Cannabis Use Disorder Identification Test
- And more

---

### EMR-067: Lab Ordering Module (Quest/LabCorp) with Nature-Themed Patient View
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Direct lab ordering connected to Quest + LabCorp databases
- Cross-reference patient's ICD codes for highest-use labs
- Full searchable database (every letter searchable)
- Lab sets — save as personal favorites (e.g. "normal follow-up = E78.00, E11.9, Z79.899, I10 → CMP, CBC, Lipid, A1C, GGT")
- CRITICAL values auto-notify provider, require sign-off + documented plan
- Patient lab tab: view raw labs, print, download PDF, email, fax
- Trends visible, colorful, nature-themed: worse labs → worse weather → dying plant; better labs → better weather → thriving plant (integrates with My Garden)
- Cross-reference ordered labs with highest-use ICD codes + insurance coverage

---

### EMR-068: Patient Billing Portal with AI EOB Summaries
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Patient access to EOBs, invoices
- AI-summarized explanations in 3rd-grade language: why they got the bill, how much, what it covers, how to dispute
- Pay invoices directly in the system
- File insurance claim disputes through the portal (ties into major insurance + CMS)
- State insurance regulation compliant
- Labs shown in green/yellow/red stoplight format (like drug-drug interactions)
- AI "suggestions and recommendations" for providers based on abnormal labs

---

### EMR-069: AI Fairytale Chart Summary
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full AI-driven one-page summary of the patient's chart in a beautiful fairytale storybook format. Reads seamlessly like a book. Easy for providers to interpret at a glance AND for patients to understand. Complements the "My Story" ebook with a more narrative, literary voice.

---

### EMR-070: USPSTF Preventive Screening Reminders with Emoji Checklist
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Implement full USPSTF A and B grade recommended screening measures
- Each screening gets an emoji (pap smear, colonoscopy, mammogram, DEXA, CT chest screening, etc.)
- Emojis appear on chart if patient is DUE
- Auto pop-up: "Consider discussing screening measures" with pending emoji checklist
- Include the emoji checklist in the AI fairytale summary so patient can bring it to all providers

---

### EMR-071: AI Chatbot + DoxGPT Integration
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** AI chatbot that integrates patient information with DoxGPT to retrieve properly vetted resources and evidence-based treatments and suggestions. Physician has final say on all recommendations before they reach the patient.

---

### EMR-072: Lifestyle Checkboxes → Plant Growth
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Add checkboxes next to every aspect of the wellness toolkit on the Lifestyle tab. Growth mechanics:
- Every check = another leaf
- One check from each category in a day = new stem
- One check from each category every day for a month = flowers start blooming
Ties directly into My Garden plant companion.

---

### EMR-073: Customizable Patient Portal Layouts
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Allow patients to customize their portal:
- Organize/rearrange tabs via drag-and-drop
- Choose color palette (themes)
- Save layout preferences per user

---

### EMR-074: Music Integration (Spotify / Apple Music)
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Allow patients to connect their Spotify or Apple Music to play music while reviewing their chart. The AI fairytale summary (EMR-069) can include a soundtrack that patients can post on social media or email.

---

### EMR-075: Social Media Sharing Module
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Allow patients to share their results and progress on the Lifestyle tab and My Garden plant tab to social media. Generate beautiful share cards with stats and plant visuals.

---

### EMR-076: AI-Driven Prior Authorization
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Prior authorization framework where all medications that need a PA are initially handled by AI — pulls all data, proper coding, submits to insurance. Only on second denial does provider involvement kick in, with messaging and phone calls happening WITHIN the system.

---

### EMR-077: Full Modular EMAR Framework
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full modular API framework EMAR (Electronic Medication Administration Record) that includes ALL current prescription medications on the market — doses, standard amounts, available through all large pharmaceutical companies and pharmacy networks.

---

### EMR-078: Specialist Referral Module with AI Packet Generation
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Modular referral framework:
- Patient looks up specialists in their network by location + ratings
- One-click to create appointment request or generate message to office
- AI determines "pertinent" chart data for the referral (notes, labs, consults, images) and auto-attaches
- Seamless handoff to specialist's office

---

### EMR-079: Dementia / Alzheimer's Screening + Mindspan Integration
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Connect to Mindspan.co for self-assessment memory tests within the EMR
- Results stored in chart
- AI generates lifestyle plan to reduce dementia risk (exercise, read upside down, go outside)
- For diagnosed patients: practical quality-of-life framework

---

### EMR-080: Cannabis Education Library (Laws + Research + Data)
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Full cannabis education library:
- All peer-reviewed journal articles
- All patient data collected on cannabis
- Current legislation, rules, laws at city, county, state, federal levels
- Searchable, filterable

---

### EMR-081: OCR Scan & Auto-Populate
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Scanned documents go through OCR and auto-populate proper chart fields. Example: patient brings a two-page paper with medications, supplements, surgeries, emergency contacts → EMR extracts all data, places it in the right fields, sorts chronologically.

---

### EMR-082: Electronic Medical Record Release Between Doctors
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Electronic record release framework — doctors can request charts from other doctors, patient e-signs, provider e-signs, chart arrives seamlessly through the EMR. Replaces fax-based record requests.

---

### EMR-083: Pediatric Module
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:** Pediatric module with:
- Growth charts (height, weight, head circumference, BMI)
- Vaccine schedule tracking
- Eating habits log
- Milestone tracking
- Happy, cute cartoon theme throughout

---

### EMR-084: Military-Grade Encryption + Legal Licensing Framework
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Military-grade encryption (uncopyrightable)
- Legal framework for licensing to Epic, Cerner, outpatient clinics, PT/OT locations, hospitals
- JCAHO, CMS standards + guidelines compliance
- Patent + trademark ALL aspects of the EMR
- Sample licensing contracts

---

### EMR-085: iCal / Google Calendar Export
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:** All scheduled appointments can be exported and added directly to the patient's iCal or Google Calendar via standard ICS file. One-click "Add to calendar" button on the appointment card.

---

## Wave 15+ — Dr. Patel's Product Drop #3 (April 11, later)

### EMR-086: Community Resource Connector
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Modular framework to connect patients to trusted community resources and organizations based on their current medical conditions, within a 50-mile radius.

Example: A patient with Dementia in Orange County gets connected to:
- UCI MIND clinic
- HOAG Neurosciences
- Alzheimer's OC
- Local support groups
- Caregiver respite services

**Implementation:**
- Curated database of resource organizations keyed by condition + geography
- Geo-lookup based on patient address
- AI-generated resource packets: what the organization offers, how to connect, what to expect
- Deliverable to patient via portal, email, or SMS
- Starts with dementia + cancer + chronic pain + mental health; expands by region

---

### EMR-087: Legislative Advocacy Portal
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Patient-facing module to message and email local representatives and congress members advocating for cannabis reform.

**Features:**
- Lookup representatives by patient address (OpenStates or Google Civic API)
- AI-generated advocacy letters tailored to patient's story and condition
- Templates for different asks: reclassification, research funding, insurance coverage, patient access, veteran access
- Send via portal with one click (integrates with email/SMS)
- Track which patients have contacted which reps
- Log as audit trail to show engagement

---

### EMR-088: Cannabis Contraindication Override Warning
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Pop-up warning during prescribing when patient has a major cannabis contraindication.

**Contraindications to flag:**
- History of schizophrenia or psychotic disorder
- Bipolar disorder (especially type I)
- Severe cardiovascular disease
- Pregnancy / breastfeeding
- Active substance use disorder
- Severe liver dysfunction
- Children / adolescents (for high-THC products)
- History of cannabis hyperemesis syndrome
- Recent MI or unstable angina

**Required action:**
- Provider MUST document override reasoning before proceeding
- Override reason stored in chart + audit log
- Prescription cannot be submitted until override is signed
- Dual sign-off optional for high-risk overrides
- Integrates with existing drug-interaction stoplight system

---

### EMR-089: Cannabis-Infused Recipe Library
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Curated "food as medicine" recipe library on the Lifestyle tab. 5-20 minute recipes for breakfast, lunch, dinner, snacks, and appetizers — each infused with cannabis and aligned to a dietary philosophy.

**Dietary styles to support:**
- Mediterranean diet
- Ayurvedic diet
- Mexican cuisine
- Italian cuisine
- Vegetarian
- Vegan
- Keto / low-carb (optional)

**Each recipe includes:**
- Prep + cook time
- mg of THC/CBD per serving
- Ingredients with optional dispensary pickup
- Step-by-step instructions
- Nutrition info
- Companion education on decarboxylation + infusion basics

---

### EMR-090: ER/Hospital Admission Notification + Inpatient EMR Module
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
**Part 1 — Notification:**
- Text notification sent to the primary care provider when a patient is sent to the ER or admitted to the hospital
- Source: HL7 ADT feed, state health information exchange, or patient self-report
- Includes hospital name, chief complaint if available, admission time
- Creates a task in the provider's inbox

**Part 2 — Inpatient EMR Module:**
- Full modular hospital EMR within the Leafjourney framework
- Inpatient workflows: admission H&P, progress notes, discharge summary
- Synchronizes between outpatient and inpatient treatment — same patient, same chart, different care setting
- Care transitions automatically documented when patient moves between settings
- Inpatient medications reconciled against outpatient med list on discharge

---

### EMR-091: Medical Cannabis Dispensary Module
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Full medical-cannabis dispensary integration. **Medicinal use only — recreational is explicitly excluded.**

**Dispensary side:**
- Dispensaries can register and log in
- External link to current product inventory cross-referenced with SKU
- Budtender electronic signature required on every dispense

**Provider side:**
- Provider "prescribes" cannabis directly from the dispensary's live inventory
- Electronic Rx sent to dispensary for approval
- Running log of patient visits to dispensary (medical only)

**Patient side:**
- Must have a valid medical marijuana card to use the module
- Purchased products auto-populate into the patient's medication list
- Product name, SKU, purchase date, quantity documented
- Data forwarded to the state medical cannabis registry

**CURES integration (optional):**
- For patients at high abuse potential or on scheduled meds, run through cures.doj.gov (California CURES) to check PDMP
- Flag conflicting scripts, early refills, multiple prescribers

**What this does NOT do:**
- Recreational cannabis — completely separate, not handled by this module
- Non-card-holding patients — cannot use dispensary flow

---

### EMR-092: Dual Treatment Protocols — Western + Eastern (Holistic) Medicine
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** blocked (Needs more detail from Dr. Patel)
**Description:**
For EVERY medical diagnosis in the system, provide TWO treatment protocols side-by-side:

**1. Standard pharmaceutical algorithm:**
- Evidence-based first-line, second-line, third-line pharmacotherapy
- Dosing, titration, monitoring parameters
- Guideline source (UpToDate, ACC/AHA, USPSTF, etc.)

**2. Holistic / alternative protocol:**
- Over-the-counter products and supplements
- Lifestyle interventions (diet, exercise, sleep, stress)
- Traditional modalities: acupuncture, massage, yoga, meditation
- Herbal medicine (Ayurvedic, TCM, Western herbalism)
- Mind-body therapies (CBT, breathwork, biofeedback)

**Goal:** Comprehensive all-inclusive treatment plan that blends eastern and western medicine. Physician selects the blend that fits the patient. Patient sees both paths and can discuss preferences with their provider.

**Starts with the most common cannabis care conditions:** chronic pain, anxiety, insomnia, depression, PTSD, migraine, IBS, fibromyalgia, nausea/CINV, cancer, MS, Parkinson's, epilepsy.

---

## Updated Summary (after Wave 15 backlog expansion)

| # | Title | Priority | Status |
|---|---|---|---|
| 086 | Community Resource Connector | High | in_progress |
| 087 | Legislative Advocacy Portal | Normal | in_progress |
| 088 | Cannabis Contraindication Override | Urgent | in_progress |
| 089 | Cannabis-Infused Recipe Library | Normal | in_progress |
| 090 | ER Admission Notification + Inpatient EMR | Urgent | in_progress |
| 091 | Medical Cannabis Dispensary Module | Urgent | in_progress |
| 092 | Dual Treatment Protocols (Western + Eastern) | High | in_progress |

**Grand total: 92 tickets. ~50 shipped, 42 remaining.**

---

## Updated Summary (after Wave 14 backlog expansion)

| # | Title | Priority | Status |
|---|---|---|---|
| 001-055 | Previous waves | Various | 44 done, 11 remaining |
| 056 | Comprehensive Recommendation Engine | High | backlog |
| 057 | Native Mobile App + HDMI | High | backlog |
| 058 | Clinical Trial Delivery | High | backlog |
| 059 | Single-Page Rx (No Scrolling) | High | backlog |
| 060 | Min-Clicks UX Pass | Urgent | backlog |
| 061 | Motivational Quotes | Normal | backlog |
| 062 | Ancillary Services Module | High | backlog |
| 063 | Pharmacy Communication | High | backlog |
| 064 | Audit Log PDF Export | Normal | backlog |
| 065 | AI Compliance Auditing Agent | High | backlog |
| 066 | Validated Assessment Library Expansion | High | **done** |
| 067 | Lab Ordering (Quest/LabCorp) | High | backlog |
| 068 | Patient Billing Portal | High | backlog |
| 069 | AI Fairytale Chart Summary | High | **done** |
| 070 | USPSTF Screening Reminders | High | backlog |
| 071 | AI Chatbot + DoxGPT | Normal | backlog |
| 072 | Lifestyle Checkboxes → Plant Growth | High | backlog |
| 073 | Customizable Patient Portals | Normal | backlog |
| 074 | Spotify / Apple Music | Low | backlog |
| 075 | Social Media Sharing | Normal | backlog |
| 076 | AI Prior Authorization | High | backlog |
| 077 | Modular EMAR Framework | High | backlog |
| 078 | Referral Module + AI Packet | High | backlog |
| 079 | Dementia Screening + Mindspan | Normal | backlog |
| 080 | Cannabis Education Library | Normal | backlog |
| 081 | OCR Scan & Auto-Populate | High | in_progress |
| 082 | Electronic Record Release | High | in_progress |
| 083 | Pediatric Module | High | in_progress |
| 084 | Military Encryption + Legal Framework | Urgent | in_progress |
| 085 | iCal / Google Calendar Export | Normal | in_progress |

**Grand total: 85 tickets. 44 shipped, 41 remaining.**

### Remaining tickets (require external APIs or infrastructure):
- EMR-002: Dispensary Integration (needs dispensary API)
- EMR-013: Conventional EMR Integration (needs HL7 FHIR adapter)
- EMR-017: Dispensary Locator (needs Google Maps API key)
- EMR-018: Leafly Strain Database (needs Leafly API)
- EMR-028: Split Window / Multi-Tab (completed)
- EMR-031: Responsive Cross-Device (audit pass)
- EMR-037: Communications Overlay (needs Twilio/WebRTC)
- EMR-038: Cannabis Book Integration (needs content parsing)
- EMR-042: MIPS Data Extrapolation (needs CMS rules engine)
- EMR-044: Modular Licensable Framework (architecture documentation)
- EMR-045: Insurance Billing AI Agents (multi-agent system)
- EMR-051: Native Mobile App (React Native / Capacitor)
- EMR-053: ProHub Integration (needs ProHub API)
- EMR-054: Vet & Psilocybin Expansion (architecture only)

---

## Wave 9+ — Dr. Patel's Second Vision Drop (April 10 — expanded backlog)

### EMR-056: Seamless Recommendation Engine from All Databases
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Deploy a seamless recommendation engine for products, cannabinoid ratios, doses, and dominant terpenes based on ALL cannabinoid databases from online and well-published books. Goes beyond the current 50-study corpus to ingest:
- Leafly strain database
- Open-source cannabis pharmacology papers
- Published cannabis medicine textbooks
- International cannabinoid research databases
- Patient PRO data across the platform
Returns: cannabinoid ratios, dose ranges, terpene profiles, evidence tier (RCT vs PRO vs experience).

---

### EMR-057: Native Mobile App (iOS, iPad, Android + Projector Support)
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Create the entire EMR as a NATIVE app that runs on iOS, iPad, and Android with:
- Proper dimensions, stretching, and seamless portrait/landscape mode
- Proper zooming proportions
- Proper stretching when connected via projector or HDMI
- Full feature parity with the web app
- React Native or Capacitor wrapper
**Supersedes/extends EMR-051.**

---

### EMR-058: Clinical Trial Matching + AI Summary Delivery
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Full framework connecting patient chart to the largest national clinical trial databases (ClinicalTrials.gov). Determines eligibility from patient data and recommends trials directly via:
- Patient portal message
- Email
- SMS
Each recommendation is AI-summarized and includes website, trial type, what it consists of.
**Extends EMR-052 (which scaffolded the UI).**

---

### EMR-059: Single-Page Fixed Prescription Module (No Scroll)
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Redesign the prescription module to fit on ONE page that is FIXED without scrolling — all necessary parameters (name, dose, sig, days, qty, type, refills, diagnosis linking, interaction check, notes to patient/pharmacy) visible in a dense single-view layout.

---

### EMR-060: Zero-Scroll / Minimal-Click Information Architecture
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Audit the entire EMR to minimize clicks between tabs and eliminate scrolling wherever possible. Patients and providers should see all relevant information in a simple, clean format without scrolling up or down. Think dashboard density over portal-style pagination.

---

### EMR-061: Motivational Quote Pop-ups
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
- Pop-up motivational quote on login
- Every page has a quote that refreshes on navigation
- Keywords to sample from: God, love, faith, emotions, energy, happiness, resilience, persistence, not giving up, gratitude, healing, community
- Rotating quote library with attribution

---

### EMR-062: Ancillary Services Module (OT, PT, Speech, Case Mgmt, Home Health)
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Ancillary EMR module covering:
- Occupational therapy documentation
- Physical therapy documentation
- Speech therapy documentation
- Case management notes
- Home health notes
Modular framework that integrates into the main EMR with provider sign-off and seamless communication between all service types.

---

### EMR-063: Pharmacy Communication Module
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Backend pharmacy communication module with direct access to pharmacists for clarifications or medication recommendations. Requires both pharmacist AND provider sign-off to verify and approve any change.

---

### EMR-064: Full Audit Trail & PDF Export
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Complete running log of all documentation, backend clicks, who accessed which chart, timestamps. Exportable as PDF for auditing purposes. HIPAA-compliant audit trail that meets regulatory standards.
**Note:** AuditLog model already exists — this extends it with the PDF export + comprehensive click tracking.

---

### EMR-065: Automated Compliance Audit AI Agent
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Automated AI agent that continuously audits notes, labs, communication for compliance:
- CMS standards
- Major insurance company audit requirements
- Joint Commission (JACHO) standards
Cross-checks everything against current regulations and flags non-compliant documentation before submission.

---

### EMR-066: Complete Validated Assessment Library
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Add ALL peer-reviewed validated surveys under the Assessments tab:
- Pain (PEG, BPI, NRS)
- Anxiety (GAD-7, STAI) ✓
- Insomnia (ISI, PSQI)
- Stress (PSS)
- Cancer (FACT-G, EORTC QLQ-C30)
- Depression (PHQ-9) ✓
- Cognition (MMSE, MoCA)
- Functional (ODI, WOMAC)
- And all other medical ailment-specific PROs
Each with scoring, interpretation, and trend visualization.

---

### EMR-067: Lab Ordering Module (Quest + LabCorp Integration)
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Description:**
Full lab ordering module connected to Quest and LabCorp:
- Cross-references patient's ICD codes for highest use
- Fully searchable lab database (every letter)
- User-defined lab sets saved as personal favorites
  - Example: "normal follow up" = Dx: E78.00, E11.9, Z79.899, I10; Labs: CMP, CBC, LIPID PANEL, A1C, GGT
- CRITICAL values auto-notify provider with required sign-off + plan of action documentation
- Patient-facing labs tab: view raw labs, print, download PDF, email, fax to other providers
- Nature-themed trend visualization: worse labs → worse weather + wilting plant; better labs → better weather + thriving plant
- All orders cross-referenced with highest-use ICD-10 + insurance coverage

---

### EMR-068: Patient Billing Portal with AI-Explained EOBs
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Full patient billing portal:
- Access to EOBs and invoices
- AI summarizes bills in 3rd-grade language (why, how much, what services, how to dispute)
- Direct payment into system
- File insurance claim to refute charges (tied to major insurers + CMS)
- Compliant with state insurance regulations
- Labs shown in red/yellow/green format (like drug interactions)
- AI suggestions for abnormal labs that providers can use to guide treatment

---

### EMR-069: AI Fairytale Chart Summary
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Full AI-driven summary of patient's chart as a ONE-PAGE summary that is:
- Easy for all providers to interpret
- Easy for the patient to understand
- Formatted as a BEAUTIFUL FAIRYTALE STORY BOOK that reads seamlessly
Covers pertinent history, medications, trends, concerns. Think "My Story" but generated on demand for any provider visit.

---

### EMR-070: USPSTF A&B Screening Measures with Emoji Checklist
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
- Implement all USPSTF A and B grade recommended screening measures as part of chart review
- Each prevention screening is an emoji that shows up if patient is DUE
- Pop-up prompt to provider: "consider discussing screening measures" with emoji list of pending items (pap smear, colonoscopy, mammogram, DEXA, CT chest screening, etc.)
- Simple emoji checklist included in AI fairytale summary that patient can take to all providers

---

### EMR-071: DoxGPT AI Chatbot Integration
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
AI chatbot integrating patient information with DoxGPT to obtain properly vetted resources and evidence-based treatment suggestions. Doctor has final say on all recommendations. Tied into messaging and care planning.

---

### EMR-072: Lifestyle Checkboxes → Plant Growth
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Add checkboxes next to every item on the Lifestyle tab:
- Each check = one new leaf on the plant
- One item from each of the 7 categories in a day = new stem
- One from each category every day for a month = flowers
Ties directly into the existing plant health system. Makes engagement tangible and rewarding.

---

### EMR-073: Customizable Patient Portal
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Let patients customize their portal:
- Organize tabs (show/hide)
- Rearrange tab order
- Change color palette (preset themes or free color picker)
- Save customization to their profile

---

### EMR-074: Patient Music Integration (Spotify / Apple Music)
**Priority:** 4 — Low
**Source:** Dr. Patel
**Description:**
Allow patients to connect Spotify or Apple Music to play music while reviewing their chart. AI fairytale summary gets an accompanying soundtrack that can be posted to social media or emailed. Think "Spotify Wrapped" energy for health.

---

### EMR-075: Social Sharing Module
**Priority:** 4 — Low
**Source:** Dr. Patel
**Description:**
Allow patients to share results and progress on:
- Lifestyle tab achievements
- Plant growth milestones
- Achievement unlocks
Shareable to Instagram, Facebook, TikTok with templated graphics.

---

### EMR-076: AI-First Prior Authorization Framework
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Prior authorization module where medications requiring PA are handled by AI first:
- AI pulls all needed data and proper coding
- Submits to insurance automatically
- Only if denied a second time does provider get pulled in
- In-system messaging + calls to insurance company for escalation

---

### EMR-077: Modular EMAR API Framework (All Pharmaceuticals)
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Full modular API framework for electronic medication administration record (EMAR) including ALL current prescription medications:
- Doses, standard amounts, formulations
- Connected to major pharmaceutical companies
- Connected to pharmacy networks
- Real-time availability and pricing

---

### EMR-078: Smart Referral Module with AI Data Curation
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Referral module that lets patient look up specialists in their network by location + ratings. From within the EMR:
- Click specialist → create appointment OR generate call-patient request
- AI determines which notes, labs, consults, images are "pertinent" for the referral
- Auto-sends curated data bundle to the specialist's office

---

### EMR-079: Dementia / Alzheimer's Screening Framework (Mindspan Integration)
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Full dementia/Alzheimer's framework:
- Connects to Mindspan.co for self-assessment memory tests within the EMR
- Stores results longitudinally
- Creates lifestyle plan to reduce dementia risk (exercise, reading upside down, outdoor time, etc.)
- Post-diagnosis: practical tips for improving quality of life for diagnosed patients
- Caregiver support module

---

### EMR-080: Cannabis Education Library (Legislation + Research)
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Cannabis education library that includes:
- All peer-reviewed journal articles (extend corpus)
- All patient data collected on the platform
- Current legislation at city, county, state, and federal level
- Auto-updated legal status by patient location
- Searchable + filterable

---

### EMR-081: OCR Document Scanning with AI Data Extraction
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Scanned documents (e.g., paper med list a patient brings in) are OCR-scanned and AI extracts:
- Medications → medication list
- Supplements → supplement list
- Surgeries → surgical history
- Emergency contacts → contact fields
All populated into proper chart fields in chronological order.

---

### EMR-082: Electronic Record Release Between Providers
**Priority:** 2 — High
**Source:** Dr. Patel
**Description:**
Electronic medical record release capability between doctors:
- Seamless acquisition of patient charts from other providers
- Patient electronic signature + provider signature
- Fully within the EMR — no paper forms

---

### EMR-083: Pediatric Module
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
Pediatric module tracking:
- Growth charts (length, weight, head circumference)
- Vaccine schedule + history
- Weight and eating habits
- Developmental milestones
All visualized as a happy, cute cartoon theme — not clinical charts.

---

### EMR-084: Military-Grade Encryption, JACHO/CMS Compliance, IP Framework
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Description:**
- Military-grade encryption on the entire EMR and prompting system
- Cannot be copyrighted / reverse-engineered
- Legal framework for licensing to EPIC, Cerner, outpatient clinics, PT/OT locations, hospitals
- Meets ALL JACHO, CMS standards, regulations, guidelines for fully functional EMR
- Patents and trademarks for ALL aspects of the EMR
- Sample contracts for negotiating use with other entities

---

### EMR-085: Calendar Export (iCal, Google Calendar)
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Description:**
All scheduled appointments can be exported and added directly into patient's:
- Apple iCal
- Google Calendar
- Microsoft Outlook
ICS file generation, direct calendar sync, auto-update on reschedule.

---

## Expanded Summary

| Wave | Range | Status |
|---|---|---|
| Waves 1-7 | EMR-001 to EMR-036 (partial) | 33 done |
| Wave 8+ (Apr 10) | EMR-037 to EMR-055 | 11 done of 19 |
| Wave 9+ (Apr 10 expanded) | EMR-056 to EMR-085 | 30 new tickets |

**Total: 85 tickets across 30+ epics. 44 shipped, 41 remaining.**

**Product vision vs backlog** — several tickets in Wave 9+ are more product-vision than near-term backlog:
- EMR-057: Native mobile app (major architectural shift)
- EMR-077: Full EMAR API framework
- EMR-084: Military-grade encryption + IP / licensing framework
- EMR-076: Prior auth AI (needs insurance company integrations)
- EMR-067: Quest/LabCorp integration (needs partnership)

These are captured as tickets but flagged as strategic roadmap items, not immediate sprint work.

---

## Wave 16+ — Dr. Patel's Product Drop #4 (April 11, late)

### EMR-093: Four Pillars of Health Bar Graph
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a "Four Pillars of Health" visualization on the Lifestyle tab: Physical, Mental, Emotional, and Spiritual. Each pillar rendered as a colored bar graph whose height/fill is computed from the underlying patient data:
- **Physical**: exercise logs, vitals, dose logs, outcome pain/sleep
- **Mental**: assessment scores (PHQ-9, GAD-7, CUDIT-R), cognitive check-ins
- **Emotional**: mood outcome logs, gratitude entries, positive input check-ins
- **Spiritual**: charity work, time with family/friends, meditation, higher-power connection (from EMR-095)

The visualization surfaces which pillar has the lowest "score" so the patient and care team can focus attention. Interactive — tap a pillar to drill into what's driving the score.

---

### EMR-094: Mental Health Chart Security Overlay
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Mental health notes and chart documents must be separated from standard medical records with a security overlay. When a provider attempts to access any mental-health-tagged record, a popup requires them to electronically sign their name acknowledging HIPAA-sensitive access. Each access is logged in the immutable audit trail.

**Implementation:**
- New field on Note / Document: `sensitivity: "standard" | "mental_health" | "substance_use"`
- Access wall UI with forced e-signature
- Audit log entry for every access
- Specific providers (e.g. integrated BH) can have always-on access

Aligns with 42 CFR Part 2 substance-use confidentiality too.

---

### EMR-095: Spiritual Wellness Lifestyle Category
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Add a "Spiritual" category to the Lifestyle tab alongside sleep, nutrition, movement, stress, family, habits, and social. Tracks:
- Connection to higher power / faith practice
- Charity work and donations
- Time spent with family and friends
- Meditation / prayer / reflection time
- Nature / outdoor time

Feeds into EMR-093 (Four Pillars) and EMR-072 (lifestyle checkboxes → plant growth).

---

### EMR-096: Double-Blind Study Module
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Module that allows patient data to be incorporated into double-blind clinical studies and validated. Researcher creates a study protocol, randomizes patients (blinded), collects data from the EMR automatically, and generates results. Must preserve blinding and IRB-ready audit trail.

---

### EMR-097: Data Research & Reports Module
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
"Accounting software for clinical data." Operator can select and de-select any data point across the EMR, build custom datasets, and generate reports as:
- Bar charts
- Pie charts
- Line graphs / trends
- Projections / forecasts
- Pivot-style tables

Beautiful, graphically-pleasing interface (think Tableau meets Linear). Supports saved report templates.

---

### EMR-098: AI Coach with Personalized Style
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
AI coach that texts the patient at least 2x/day with encouragement or a push to keep going. Coach style is personalized based on the patient's emotional maturity + resilience:
- **Gentle**: warm, affirming, no pressure
- **Moderate**: balanced encouragement and challenge
- **Tough**: direct, drill-sergeant energy for patients who want accountability

Style is assessed at intake via a short questionnaire and can be changed anytime. Integrates with Twilio or similar for SMS. Coach references real patient data (today's check-ins, missed doses, goal progress).

---

### EMR-099: Endocannabinoid System Labwork Framework
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Modular labwork framework specifically for measuring the endocannabinoid system. Curated lab sets from Quest and LabCorp catalogs:
- Anandamide (AEA) levels
- 2-AG levels
- FAAH enzyme activity
- CB1/CB2 receptor expression (where available)
- Related inflammatory markers (CRP, IL-6, TNF-α)
- Cortisol (stress axis interaction)

Results flow into the patient chart with trends over time. Critical for dosing optimization and research.

---

### EMR-100: AI Tutorial Videos (30-second reels)
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
AI-generated tutorial videos for every EMR feature, delivered as short 30-second reels (Instagram-style carousel). Accessible from every page via a ? help icon. Video content auto-generated by narrating what the feature does while showing screen recordings.

---

### EMR-101: Complete CPT/ICD-10 Code Book + Superbills
**Priority:** 1 — Urgent
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
- Full integration of the ENTIRE CPT code book (all ~10,000 codes, all modifiers)
- Full ICD-10 code set (~70,000 codes)
- Fully customizable superbills by specialty: family medicine, cardiology, oncology, gastroenterology, ophthalmology, etc.
- Procedural superbills per specialty
- AI overlay agent that pulls latest codes from CMS.gov and codify.com every 24 hours
- Auto-update when codes change annually

---

### EMR-102: Novel Cannabis ICD-10 / CPT Code Proposal
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Create a brand-new classification of ICD-10 and CPT codes specifically for cannabis medicine — cannabis use disorders, cannabis therapy for approved medical conditions, cannabis product dispensing, cannabinoid titration, etc. Robust and presentable to CMS as a formal proposal for inclusion in the next ICD-10-CM update.

---

### EMR-103: Practice Analytics Deep Dive
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Analytics dashboard showing practice-wide counts and trends for:
- Labs ordered / resulted
- Patient encounters by type
- Chart notes created / finalized
- Prescriptions written / refilled
- Messages sent / received
- Assessments completed
- Check-ins logged
Broken down by provider, patient cohort, time range.

---

### EMR-104: Click Counter / Workflow Efficiency Tracking
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Real-time click counter that measures how many clicks it takes to accomplish common tasks (start visit, finalize note, send Rx, check labs, etc.). Data drives ongoing UX optimization — the goal is to make every workflow as few clicks as possible. Per-user aggregations. "Average clicks to finalize a note: 7" should be a metric we can show and improve over time.

---

### EMR-105: Philanthropy / Donations Module
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Module listing cannabis advocacy orgs and major medical charities the patient can donate to directly from the portal:
- Cannabis: Weed for Warriors, NORML, Last Prisoner Project, Sweetleaf Collective
- Medical: Susan G. Komen, Red Cross, St. Jude Children's Hospital, Cancer Research Institute
Track total donations per patient as a wellness metric (civic engagement feeds the Spiritual pillar).

---

### EMR-106: Hospital System Integration (Closed Loop)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Modular system that integrates outpatient clinics and inpatient hospitals into a closed loop. A patient's chart follows them wherever they go within the system — outpatient visit → ER admission → inpatient stay → discharge → back to outpatient follow-up. All data flows seamlessly. HL7 FHIR backbone.

---

### EMR-107: Expected Reimbursement Rate Prediction
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
For every encounter, display:
- Amount billed
- Expected to collect (based on contracted rates + historical data)
- Projection / variance explanation in 2 sentences with EOB codes
Use the information to auto-optimize coding for maximum reimbursement within compliance.

---

### EMR-108: Modular Full Revenue Cycle System
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Fully modular accounts receivable + billing/revenue cycle system based on insurance + ICD-10 + chart notes. Builds on the existing billing foundation (Phases 1-4 already shipped) but adds:
- Contracted fee schedule modeling
- Payer-specific rule packs
- Underpayment / downcode flagging at the claim level
- Cross-org benchmarking

---

### EMR-109: Age-Based Chart Overlays
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Pediatric, pregnant, adult, and geriatric chart overlays that unlock relevant features based on demographics:
- **Pediatric**: growth charts, weight/height percentiles, developmental milestones, vaccine schedule
- **Pregnant**: due date tracker, fetal growth, prenatal vitamin tracking, contraindication alerts
- **Adult**: USPSTF preventive screenings, MIPS measures
- **Geriatric**: falls risk, memory screening, balance precautions, polypharmacy review

System auto-selects based on DOB + intake answers, but provider can override.

---

### EMR-110: AI Patient Education Sheets by ICD-10
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Beautiful, colorful, one-page patient education sheets auto-generated for every ICD-10 code linked to the visit. Written at 3rd-grade reading level with pictures and practical explanations. Sharable via text, email, print, or in-portal. Provider can tweak before sending.

---

### EMR-111: Cannabis Education Database
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Proprietary cannabis education database with beautiful illustrations and simple terminology covering:
- Terpenes (profiles, effects, aromatherapy)
- Cannabinoids (THC, CBD, CBN, CBG, CBC, etc.)
- CB1 and CB2 receptors
- Dosing fundamentals
- Flavonoids
- Endocannabinoid system
Fully searchable directory. Builds on the existing Research Corpus (50+ studies already in place).

---

### EMR-112: Medication Wallet Card (Printable)
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Credit-card-sized printable card with the patient's current medications (cannabis + conventional + supplements). Auto-updates when meds change. Contains: name, strength, frequency. Portable so patients can carry it in their wallet. Downloadable PDF formatted for wallet dimensions.

---

### EMR-113: Allergies + Contraindications in Profile Tab
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Add a dedicated Allergies section and a Major Contraindications section to the Demographics/Profile tab. Currently the contraindication check runs on prescribe but the data isn't surfaced on the main chart. Make it a prominent top-of-chart alert that's visible from the first page load.

---

### EMR-114: Credit Card + ACH Payment Storage
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Secure tokenized storage of patient credit card and ACH details so they can pay bills directly from the portal. Receipts auto-generated with date, invoice number. Patient sees their credit balance (if any) or amount owed right on the billing tab. **Status: partially done — StoredPaymentMethod model exists; Payabli integration is scaffolded.**

---

### EMR-115: EOB Into Patient + Doctor Portal
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
When an EOB arrives from a payer, parse it and display it both in the patient portal (billing tab) AND the doctor's chart view. AI-summarized in plain language for patients. Shows what was billed, what was paid, what was adjusted, and what the patient owes.

---

### EMR-116: International Multi-Country Billing Framework
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Modular billing system that adapts to every country's rules, regulations, and coding system. Integrated with major insurance carriers per country. Optimized for maximum reimbursement within local compliance. Starts with US, UK, Canada, Germany, Australia.

---

### EMR-117: iOS App Portrait Mode Nav Fix
**Priority:** 3 — Normal
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
The native iOS app currently only shows the side nav options in landscape mode. Make all side options available in portrait mode as well, either via a collapsible drawer or a bottom tab bar that surfaces the most common destinations.

---

### EMR-118: Active Nav Tab Highlighting
**Priority:** 4 — Low
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
When a user clicks a side nav tab, highlight it in a different color so they know what section of the chart they're on. Simple polish. **Status: done in Wave 17.**

---

### EMR-119: Tab Consolidation — Reduce Patient Chart Tabs
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
The patient chart is accumulating tabs (Demographics, Records, Images, Labs, Notes, Correspondence, Cannabis Rx, Billing — and more coming). Too many tabs is overwhelming for providers and patients. Think through which tabs can be consolidated, grouped, or moved to secondary navigation.

Proposed grouping:
- **Overview**: Demographics + summary
- **Clinical**: Notes + Labs + Images + Cannabis Rx (segmented control)
- **Documents**: Records + Correspondence (segmented control)
- **Billing**: stays dedicated
- **Tools**: Prepare for visit, Billing workqueue, Trials (collapsed menu)

---

### EMR-120: Medicare RPM Program Integration
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Integrate Medicare RPM (Remote Patient Monitoring) programs for diabetes, hypertension, and weight monitoring. Features:
- Pull RPM data from device partners (Omron, Dexcom, etc.)
- Auto-populate into patient vitals section with trends
- Code and bill to appropriate insurance (RPM CPT codes: 99453, 99454, 99457, 99458)
- Provider notification when new RPM data arrives
- "Reviewed" checkbox → digital signature → audit log footprint
- Comment box for provider free-response notes

---

### EMR-121: Master Access Log + Click Analytics
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Immutable master log recording every single chart access:
- Who logged in
- Timestamp
- What sections they viewed
- What edits they made
- How long they spent in the chart
Plus click analytics per role (patient, provider, office manager): average clicks per session, most-clicked destinations, workflow time-on-task.

Builds on the existing AuditLog model. Export as PDF for HIPAA audits.

---

### EMR-122: In-App Translation + Live Video Captions
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Translation layer for the entire platform:
- Messaging: auto-translate incoming/outgoing messages per patient language preference
- Secure video visits: live real-time caption translation
- Documents: OCR-scan-ready translation so patients can access their records in any language
- Supports at least: English, Spanish, Vietnamese, Gujarati, Hindi, Mandarin, Arabic, French

---

### EMR-123: Researcher / Scientist Portal with De-identified Data
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Entirely new authentication role: "researcher / scientist." Features:
- Access to de-identified patient data (no names, but keep DOB, race, sex, socioeconomic status, smoking/drug history, etc.)
- Modifiable analytics dashboard — researcher chooses the fields they want
- Upload their own data into the platform for community pooling
- Full data ownership — they can share, stop sharing, or delete anytime
- Penalty system for breaking subscriber contracts
- Powerful analytics software + API plugins for use on their own sites
- Data leasing model: researcher sets paid/free at their discretion
- "Open access" pooled framework anyone can contribute to
- AI overlay for natural-language search across the data (keywords, phrases, cohort queries)
- Create custom datasets + questionnaires within the portal

This is the research ecosystem layer that turns Leafjourney into a longitudinal cannabis care research platform, not just an EMR.

---

### EMR-124: Nav Tab Reduction Proposal (UX audit)
**Priority:** 2 — High
**Source:** Dr. Patel (duplicate of EMR-119 for tracking)
**Status:** in_progress
**Description:** See EMR-119.

---

### EMR-125: Volunteer & Donation Module with Geographic Registry
**Priority:** 1 — Urgent (Constitutional Article VII)
**Source:** Scott Wayman (Constitution pledge)
**Status:** in_progress
**Description:**
The beating heart of Leafjourney's community commitment. A full volunteer and donation tracking system baked into both the patient and provider portals.

**Core mechanics:**
- **Geographic registry**: Patients and providers see vetted volunteer opportunities within a 30-mile radius of their home address
- **Charity registry**: A curated list of reputable cannabis advocacy, medical, and community charities, audited daily by an AI compliance framework to protect against fraudulent activity
- **Target**: 10–20 hours per quarter for every engaged member (patients AND providers)
- **Logging**: Self-report hours with optional proof upload (photo, letter, event verification); volunteer coordinators on the partner side can confirm hours through a lightweight portal
- **Dual-credit**: Provider hours count toward both platform discount tiers AND CME credit where applicable

**Financial integration:**
- **Patient discount framework**: Patients who complete their quarterly volunteer hours are eligible for reduced medical bills OR may elect to donate the difference directly to a charity on our registry
- **Provider platform discount**: Providers and admin staff earn reduced platform fees tied to their volunteer engagement — the more they give, the less they pay for Leafjourney
- **Insurance carrier integration**: Formal engagement with payers to recognize volunteer work as an offset against patient responsibility. Any payer denial of a volunteer offset must be justified in writing and the justification logged in the platform for advocacy and transparency tracking

**Delight + motivation:**
- **Plant-growth integration**: Each logged hour animates a visible "growing plant" on the user's dashboard — a living, breathing visualization of their contribution. Over time the plant matures, branches, flowers
- **Certification generation**: Auto-generated beautiful certificates of volunteer service, shareable to LinkedIn, printable for personal records, and annotated with Leafjourney branding
- **Leaderboards (opt-in)**: Community boards celebrating top contributors, with privacy controls

**Tagline baked into the UI**: "We are not just creating a better EMR. We are creating better humans."

This is Article VII of the Constitution in code form. Must ship before the Patient Advisory Board is seated.

---

### EMR-126: Provider CME Credits via Medical Research Searches
**Priority:** 2 — High
**Source:** Dr. Patel
**Status:** in_progress
**Description:**
Automatically award CME (Continuing Medical Education) credits to providers when they conduct cannabis-related medical research inside Leafjourney — literature searches, study reviews, research corpus queries, de-identified data exploration.

**Mechanics:**
- Each substantive research session (time-on-task, query depth, references cited) accrues CME credit at a published rate
- Provider's NPI and state license numbers are linked to the account
- Completed CME credits can be **directly submitted to the provider's licensing body and specialty board** via integration partners (AMA, AOA, state medical boards, ACCME)
- Full audit trail of every credit earned: query, time, source material, certification hash
- "CME Ledger" page in the provider portal showing earned, pending, and submitted credits
- Annual summary PDF for tax and license renewal documentation

This turns every minute a provider spends researching cannabis medicine inside Leafjourney into professional value — making the platform not just a workflow tool but a career-development engine. Also a major recruitment lever.

---

### EMR-127: Leafjourney Charitable Fund + Transparent Ledger
**Priority:** 2 — High (Constitutional Article VII, §5)
**Source:** Scott Wayman (Constitution pledge)
**Status:** in_progress
**Description:**
Leafjourney operates its **own** charitable fund. A portion of platform revenue, volunteer-offset donations, and voluntary contributions flow into the fund, which distributes to reputable cannabis advocacy organizations and medical charities globally.

**Transparency requirements:**
- **Append-only public ledger** — blockchain-style design (signed, hash-chained, immutable). Anyone on the internet can view and verify every inflow and outflow
- No login required to audit the ledger. This is public accountability as a design principle
- Every transaction shows: date, amount, source category (revenue share / volunteer offset / voluntary donation), destination charity, purpose memo, verification hash
- AI compliance framework (same one used for Article VII §4 registry audit) performs daily integrity checks on the ledger and flags any anomaly
- Annual "State of the Fund" report generated automatically, signed by the co-founders

**Distribution governance:**
- Recipient charities must already be on the EMR-125 vetted registry
- Distributions proposed by co-founders, reviewed quarterly by Patient Advisory Board + Clinical Advisory Board
- No distribution to any organization with board overlap to Leafjourney leadership (hard conflict-of-interest rule)

This is how we prove — not claim — that we are not an extraction engine. The ledger is the receipt.

---

### EMR-128: Universal Feedback Icon with Visual Annotation
**Priority:** 2 — High
**Source:** Scott Wayman
**Status:** in_progress
**Description:**
A small, ever-present feedback icon fixed in a corner of every single page of the application — portal-wide, role-wide. One click opens a feedback capture flow that includes:

**Visual annotation:**
- Automatic screenshot of the current page state
- Drawing tools overlaid on the screenshot: freehand highlight, circle, arrow, box, text callout
- User can mark exactly the element they're frustrated by, the layout that confused them, or the copy they loved
- Optional voice memo attachment

**Routing:**
- All feedback is routed directly to a dedicated **C-Suite Admin inbox**
- Dr. Patel (CEO) and Scott Wayman (CPTO) review personally during the early period
- After seating, escalations and themes go to the Patient Advisory Board for UX consent review
- Auto-tagging by role, page URL, feature area, and sentiment (AI-classified)
- SLA: first human response within 72 hours during founding period

**Why this matters:**
We are trying to build something no one has built before. The people who use this platform are our partners, not our customers. Their feedback is the compass. Hiding behind a support email means we stop listening. A visible, always-on feedback icon means we are always listening — and the path from "I'm frustrated" to "the CEO sees it" is two clicks.

---

## Wave — Patient Portal Cleanup + Reference Guide (Dr. Patel whiteboard + pamphlet prompt)

### EMR-193: Patient Portal Home → "Log Check-in" + Keep Symptom Graphs
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Rename the patient portal Home primary action to "Log Check-in." Keep the pain, sleep, anxiety, and mood graphs visible so patients see trend lines the moment they open the portal.

**Acceptance criteria:**
- Home CTA reads "Log Check-in"
- Pain / sleep / anxiety / mood sparklines render above the fold
- Tapping a graph opens detailed per-symptom history

---

### EMR-194: Log Dose Tab — Remove Ribbon, Show All Cannabis Products (Active/Inactive Filter)
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Remove all secondary ribbon tabs on Log Dose (My Results, Meds, Dosing Plan, Care Plan, Labs, Assessments, Outcomes, Care Guide, Learn). Replace with a single product list showing EVERY cannabis product tied to the patient — bought, scanned, or prescribed — with an All / Active / Inactive filter.

**Acceptance criteria:**
- Ribbon tabs removed from /patient/log-dose
- Product list includes bought + scanned + prescribed sources
- Filter chip: All / Active / Inactive
- Tap product → one-tap emoji + dose + time log flow

---

### EMR-195: Rename "My Health Records" → "My Records" + Two-Row Collapsible Ribbon
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Rename "My Health Records" to "My Records." Add TWO collapsible ribbons at the top:
- Row 1: All, Notes, Labs, Imaging, Letters, Other
- Row 2: Medications, Dosing Plan, Assessments, Outcomes, Care Plan, Care Guide, Learn

**Acceptance criteria:**
- Tab, nav, and breadcrumb renamed everywhere
- Two ribbon rows render at the top, each collapsible via chevron
- Each entry filters or deep-links to the correct sub-view

---

### EMR-196: Rename "My Journey" → "My Garden" + Top Ribbon
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Rename "My Journey" to "My Garden." Keep a top ribbon: Lifestyle • My Garden • Storybook • Roadmap. (Cannabis Wheel moves to Chat & Learn per EMR-200.)

**Acceptance criteria:**
- Tab, nav, breadcrumbs renamed to "My Garden"
- Top ribbon order: Lifestyle • My Garden • Storybook • Roadmap
- Cannabis Wheel reference removed from this page

---

### EMR-197: Messages — Highlight + Inline Expand with Video/Phone + Text Box
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
When a patient clicks a message, highlight the row and expand inline to show full thread, reply text box, and video/phone call buttons.

**Acceptance criteria:**
- Click row → highlight + inline expand
- Expanded panel: message history, text box, attach, video icon, phone icon
- Collapses cleanly when another message is opened

---

### EMR-198: Q/A Tab — Remove All Ribbon Tabs
**Priority:** 3 — Normal
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Strip all secondary ribbon tabs from the Q/A page. One clean feed.

**Acceptance criteria:**
- Q/A page renders without any secondary ribbon
- Any filters collapse into a single dropdown / chip row

---

### EMR-199: Account Ribbon — Fit One Row, Remove Community
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Fit the Account ribbon on ONE row: Profile • Billing • Intake • Settings. Remove "Community" (moves to Chat & Learn per EMR-200).

**Acceptance criteria:**
- Ribbon on a single row without horizontal scroll at 375px width
- "Community" removed from Account
- Order: Profile • Billing • Intake • Settings

---

### EMR-200: Chat & Learn — Consolidate Ribbon + Reddit-Style Community Threads
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard: CLEAN UP TABS)
**Status:** in_progress
**Description:**
Chat & Learn becomes the social + education hub. Top ribbon: Community • Cannabis Wheel • ChatCB • Research.

Clicking a Community post opens a Reddit-style thread: message/question at top, nested replies below, bottom text box with cannabis emoji picker. Indent replies, collapse threads, search posts.

**Acceptance criteria:**
- Top ribbon: Community • Cannabis Wheel • ChatCB • Research
- Community post view: header, nested replies, text box with cannabis emojis
- Reddit-like indentation + collapse
- Search bar indexes all posts

---

### EMR-201: Cannabis Combo Wheel — Colors POP + Larger Wheel & Letters
**Priority:** 2 — High
**Source:** Dr. Patel (whiteboard)
**Status:** in_progress
**Description:**
Visual tune: saturate baseline colors so they pop (vs. current muted tones), and increase wheel diameter + label type size for mobile + tablet readability.

**Acceptance criteria:**
- Baseline palette has stronger chroma / saturation
- Wheel fills viewport in mobile portrait
- Labels readable without pinch-zoom at iPhone 12 portrait width

---

### EMR-202: Education Page — Justin Kander Research PDF Under "Research" Tab
**Priority:** 3 — Normal
**Source:** Dr. Patel (whiteboard)
**Status:** in_progress
**Description:**
On the public Education page, add Justin Kander's research PDF as a downloadable resource under the "Research" tab, positioned below the "Search PubMed" text box.

**Acceptance criteria:**
- PDF hosted under /public/guides (or S3) and linked from Education → Research
- Appears directly below Search PubMed input
- Download tracked in analytics

---

### EMR-203: LeafJourney Trifold Reference Guide (Cannabinoids + Terpenes + Bioavailability + Family Tree)
**Priority:** 2 — High
**Source:** Dr. Patel (pamphlet prompt, derived from TheAmazingFlower 2024 Pocket Guide)
**Status:** in_progress
**Description:**
Three-fold reference pamphlet in the LeafJourney aesthetic — cream background, LeafJourney green accent, Apple-grade type hierarchy — usable by both providers and patients. Copy must be readable at a 3rd-grade level while remaining clinically useful. Emoji-first, color-banded, no dense tables.

**Content (three panels front, three panels back):**
- **Panel 1 — Major Cannabinoids:** CBDA, CBGA, THCA, THCVA, CBC, CBD, CBDV, CBG, CBN, Δ8-THC, Δ9-THC, THCV — each with a one-line "may help with" list in plain language.
- **Panel 2 — Terpene Spectrum:** Uplifting → Calming rainbow (Terpinolene, Ocimene, Limonene, Pinene, Caryophyllene, Linalool, Myrcene, etc.) with aroma cues and boiling points.
- **Panel 3 — Bioavailability:** Emulsion, Vapor, Smoke, Tincture, Edible — onset time, duration, absorption level.
- **Panel 4 — Cannabinoid Family Tree:** CBGA / CBGVA → heat/light/oxygen/time → daughter cannabinoids → further conversion products.
- **Panel 5 — How to Start:** "Start Low, Go Slow" message with a simple emoji-first step-by-step.
- **Panel 6 — Safety & QR:** Bi-phasic effect note, safety reminders, QR code to ChatCB.

**Output formats:**
- Print-ready PDF (US Letter, trifold, 0.25" bleed) under /public/guides/
- Web-flip version linkable from Education tab
- Screen-reader-accessible alt-text version

**Design constraints:**
- Cream background (#F5F1E8 range), LeafJourney green accent
- Apple-grade type hierarchy, no numeric codes user-facing
- 3rd-grade reading level across all copy
- Emoji-first iconography
- Dual-audience framing: the same copy serves patient and provider

---

### EMR-204: Landing Page — Fix "POTENCY 710" Label + Remove Unconfirmed Partner Brands
**Priority:** 3 — Normal
**Source:** Dr. Patel (leafjourney.com screenshot annotation)
**Status:** in_progress
**Description:**
Two marketing polish items on the public landing page:
1. The category label "POTENCY 710 · SKINCARE" above Gold Skin Serum reads like an internal SKU — replace with a human-readable category label such as "CBD SKINCARE."
2. Partner Brands section currently lists "PhytoRx" and "Flower Powered." Both flagged for removal until real, confirmed partners are in place.

**Acceptance criteria:**
- No numeric / internal codes rendered as user-facing category labels
- "PhytoRx" and "Flower Powered" removed from Partner Brands
- Partner Brands section hides gracefully (or shows "Coming soon" placeholder) if no confirmed partners remain

---

### EMR-205: P1 BUG — Patient Portal Stuck on Loading Skeleton (`/portal`)
**Priority:** 1 — Urgent
**Source:** Dr. Patel (live demo environment, 2026-04-20)
**Status:** done

**Symptom:**
Hitting `/portal` (and `/clinic` per Dr. Patel) shows the shell + sidebar + authed user correctly, but the main content area is stuck on the skeleton placeholders from `src/app/(patient)/portal/loading.tsx`. Nav items do not click — hydration never completes, so client-side Link clicks are no-ops.

**Diagnosis so far:**
Layout renders (auth + AppShell complete), so `getCurrentUser()` is fine. The server component `PatientHome` in `src/app/(patient)/portal/page.tsx:126` never returns → Suspense boundary stays on `loading.tsx` → React never hydrates → clicks dead.

**Top suspects (ordered):**
1. `prisma.patient.findUnique(...)` at `page.tsx:129` with 6 nested includes — DB pool exhaustion or unreachable DATABASE_URL yields a silent hang (not an error).
2. `computePlantHealth(patient.id)` at `page.tsx:157` — fires multiple Prisma queries; same pool exposure.
3. Clerk auth scaffolding (`commit 7bf2d4d`) — if `AUTH_PROVIDER=clerk` is set in the env but keys are missing/invalid, the dynamic import in `getCurrentUser` can hang.

**Demo-time triage (already communicated):**
1. Hard refresh (Cmd+Shift+R)
2. Sign out → sign back in
3. Redeploy (Vercel) to reset the DB pool
4. Demo from a sub-route (`/portal/log-dose`, `/portal/garden`, `/portal/combo-wheel`) which each load independently

**Fix plan (post-demo):**
- Wrap the home-page data loads in `Promise.race` with a 5s timeout + graceful empty-state fallback so a hanging DB call never wedges the whole page.
- Add query-level timeouts to `computePlantHealth`.
- Audit DB pool size vs. deployed concurrency; confirm DATABASE_URL reachable from the runtime.
- Verify `AUTH_PROVIDER` env var matches the running auth backend; fail fast if misconfigured.
- Add an observability hook (server log + Sentry) around the home-page query so the next hang surfaces with context, not silence.

**Acceptance criteria:**
- `/portal` returns content (or a graceful empty state) within 5s even if one downstream query stalls
- Hydration completes; nav links clickable
- Root cause of the hang documented and fixed at the source
- Regression test: integration test that mocks a slow Prisma response and asserts the page still renders

---

## Updated Summary (after Wave 16+ backlog expansion)

| # | Title | Priority | Status |
|---|---|---|---|
| 093 | Four Pillars Bar Graph | High | in_progress |
| 094 | Mental Health Security Overlay | Urgent | in_progress |
| 095 | Spiritual Wellness Category | Normal | in_progress |
| 096 | Double-Blind Study Module | Normal | in_progress |
| 097 | Data Research & Reports Module | High | in_progress |
| 098 | AI Coach (gentle/moderate/tough) | High | in_progress |
| 099 | Endocannabinoid Labwork | High | in_progress |
| 100 | AI Tutorial Videos | Normal | in_progress |
| 101 | Full CPT/ICD-10 Code Book + Superbills | Urgent | in_progress |
| 102 | Novel Cannabis ICD-10 Code Proposal | High | in_progress |
| 103 | Practice Analytics Deep Dive | High | in_progress |
| 104 | Click Counter / Workflow Efficiency | Normal | in_progress |
| 105 | Philanthropy / Donations Module | Low | in_progress |
| 106 | Hospital System Integration | High | in_progress |
| 107 | Expected Reimbursement Rate | High | in_progress |
| 108 | Full Revenue Cycle System | High | in_progress |
| 109 | Age-Based Chart Overlays | High | in_progress |
| 110 | AI Patient Education Sheets | High | in_progress |
| 111 | Cannabis Education Database | Normal | backlog |
| 112 | Medication Wallet Card | High | backlog |
| 113 | Allergies + Contraindications Profile | High | backlog |
| 114 | Credit Card + ACH Storage | High | partial |
| 115 | EOB Into Portals | High | backlog |
| 116 | International Multi-Country Billing | Normal | backlog |
| 117 | iOS Portrait Mode Nav | Normal | backlog |
| 118 | Active Nav Tab Highlight | Low | **done** |
| 119 | Tab Consolidation Audit | High | backlog |
| 120 | Medicare RPM Integration | High | backlog |
| 121 | Master Access Log + Click Analytics | High | backlog |
| 122 | In-App Translation + Captions | High | backlog |
| 123 | Researcher / Scientist Portal | High | backlog |
| 124 | Tab Reduction (dup of EMR-119) | High | backlog |
| 125 | Volunteer & Donation Module (Constitutional Art. VII) | Urgent | backlog |
| 126 | Provider CME Credits via Research | High | backlog |
| 127 | Leafjourney Charitable Fund + Transparent Ledger | High | backlog |
| 128 | Universal Feedback Icon with Annotation | High | backlog |
| 129 | Provider Breathing Break Popup (30-min timer) | Normal | backlog |
| 130 | My Garden Cannabis Grow Guide + Community | High | backlog |
| 131 | AI Clinic Notes with Guardrails + Snapshot + APSO | High | backlog |
| 132 | Charting Timer (selling point vs other EMRs) | Normal | backlog |
| 133 | Patient Medication Explainer (3rd grade + cartoons) | High | backlog |
| 134 | Emotional Vitals Emoji Scale in APSO Notes | Normal | backlog |
| 135 | Voice Dictation (better than Dragon) | High | backlog |
| 136 | AI Consciousness Overlay — WE ARE THE COMPETITION | Normal | backlog |
| 137 | Fitness Module with Personal Trainers + Care Team | High | backlog |
| 138 | Mindfulness Emojis for Lifestyle | Normal | backlog |
| 139 | Food Photo OCR + Barcode + Macro Tracking | High | backlog |
| 140 | DICOM Viewer with Provider Annotations | High | backlog |
| 141 | Patient Imaging Tab (Read-Only Annotations) | High | backlog |
| 142 | Legal Module + AI Medico-Legal Library | Normal | aspirational |
| 143 | HIPAA-Compliant Zoom Integration | High | backlog |
| 144 | Emergency QR Code + NFC + Apple Wallet | High | backlog |
| 145 | Cannabis Dispensary Billing + CMS $500 Reimbursement | High | backlog |
| 146 | HIPAA Voicemail with Transcript | Normal | backlog |
| 147 | Modular EMR Licensing Menu (Michelin-style PDF) | High | backlog |
| 148 | Multi-Medication Prescribing + Double-Check | High | backlog |
| 149 | Read-Only Patient Story Share Link (ER/travel) | High | backlog |
| 150 | Cannabis Combo Wheel on Patient Tab + Landing Page | High | backlog |
| 151 | Symptom/Diagnosis Supplement Combo Wheel | High | backlog |
| 152 | Heart-Centric EMR Consciousness (Art. IV) | Normal | backlog |
| 153 | Marketing + Business Plan + Target Groups | High | backlog |
| 154 | FDA Rx Database + Cannabis Rx + Supplement Rec Module | Urgent | backlog |
| 155 | Hover-Over Lab/Result Explanations (Canopy/Enterprise) | High | backlog |
| 156 | Subscription Pricing vs EPIC/Cerner/Practice Fusion | High | backlog |
| 157 | Fix Claude Processing GIF Scroll Glitch | Urgent | backlog |
| 158 | Collapsible/Expandable Patient Outcomes Check-Ins | High | backlog |
| 159 | Remove or Merge "Care Plan" Patient Tab | Normal | backlog |
| 160 | Rethink "Assessments" Tab (physician-first workflow) | Normal | backlog |
| 161 | Merge Achievements + Lifestyle + Wearable Integration | High | backlog |
| 162 | Rework My Story → Focus on Storybook | High | backlog |
| 163 | Create "My Results" Patient Tab | High | backlog |
| 164 | Imaging Access with Radiologist Report + Image Toggle | High | backlog |
| 165 | Doctor Sign-Off Workflow for Patient Results | High | backlog |
| 166 | Medical Imaging Upload Backend (CT/MRI/X-ray/US/PET) | High | backlog |
| 167 | Full Offline + Airplane Mode Operation | High | aspirational |
| 168 | International Access Regardless of Country | High | aspirational |
| 169 | Full Dentistry Module | Normal | aspirational |
| 170 | C-Suite About Page Skeleton | Normal | backlog |
| 171 | Paramedic ↔ ER System Module | Normal | aspirational |
| 172 | Patient Mail/Fax OCR Scan + Insurance Cross-Check | High | backlog |
| 173 | 15-Day Cannabis EMR Launch Readiness | Urgent | backlog |
| 174 | Direct Insurance Company Phone Lines for Patients | Normal | aspirational |
| 175 | Military-Grade Cybersecurity + AI Self-Audit Suite | High | aspirational |
| 176 | Make EMR Fun and Engaging for ALL Users | Normal | backlog |
| 177 | Patient Chart Tab Ribbon — Two Rows, No Scroll | High | backlog |
| 178 | Billing Tab → Redirect to Financial Cockpit | High | backlog |
| 179 | Research Articles Hyperlinked + Open in New Tab | High | backlog |
| 180 | Patient Chart Task List / To-Do on Open | High | backlog |
| 181 | Cannabis Combo Wheel Front and Center (Patient + Provider) | High | backlog |
| 182 | Schedule Calendar Overhaul (Square Boxes, Drag, Views) | High | backlog |
| 183 | Revenue Tab: Dispensary Inventory + Gross/Net Module | High | backlog |
| 184 | Patient Home Page: Next Appointment Card | High | **done** |
| 185 | Patient UX: Reduce Scrolling + Consolidate Data | High | backlog |
| 186 | Patient Modular Dashboard (health score, lifestyle rings, labs, AI tips, mood, cannabis intake) | Urgent | backlog |
| 187 | Landing Page: Fix Hero Demo Static Box (portrait mode) | High | **done** |
| 188 | Integrated Marketplace/Store — Amazon-style ecosystem inside EMR (ref: normalizemarketplace.com) | High | backlog |
| 189 | Landing Page: All Nav Tabs Visible in Mobile Portrait Mode | High | backlog |
| 190 | Set Up Linear for Project Management | Urgent | **done** |
| 191 | Wellness Toolkit Redesign — remove ribbon, checkbox dropdowns, health score integration | High | backlog |
| 192 | Store Overhaul — remove old products, update to real partner URLs | High | **done** |
| 193 | Patient Portal Home → "Log Check-in" + keep symptom graphs | High | backlog |
| 194 | Log Dose — remove ribbon, all cannabis products + active/inactive filter | High | backlog |
| 195 | "My Health Records" → "My Records" + two-row collapsible ribbon | High | backlog |
| 196 | "My Journey" → "My Garden" + top ribbon | High | backlog |
| 197 | Messages — highlight + inline expand with video/phone + text box | High | backlog |
| 198 | Q/A — remove all ribbon tabs | Normal | backlog |
| 199 | Account ribbon — one row, remove Community | High | backlog |
| 200 | Chat & Learn — consolidate ribbon + Reddit-style community threads | High | backlog |
| 201 | Cannabis Combo Wheel — colors POP + larger wheel & letters | High | backlog |
| 202 | Education page — Justin Kander research PDF under Research tab | Normal | backlog |
| 203 | LeafJourney Trifold Reference Guide (cannabinoids + terpenes + bioavailability) | High | backlog |
| 204 | Landing page — fix "POTENCY 710" label + remove unconfirmed partner brands | Normal | backlog |
| 205 | **P1 BUG** — Patient portal stuck on loading skeleton (`/portal` + `/clinic`) | **Urgent** | **done** |
| 206 | Self-Serve Online Scheduling | **Urgent** | backlog |
| 207 | No-Show Prediction Model + De-Risking | **Urgent** | backlog |
| 208 | Algorithmic Follow-Up Cadence per Condition | **Urgent** | backlog |
| 209 | Smart Slot Recommender | High | backlog |
| 210 | Intelligent Waitlist + Cancellation Fill | High | backlog |
| 211 | Multi-Channel Reminder Orchestration | High | backlog |
| 212 | New-Patient Intake-to-Visit Gate Pipeline | High | backlog |
| 213 | Group Visit + Block + Recurring Scheduling | Normal | backlog |
| 214 | Provider Preference Engine + Burnout Guardrails | High | backlog |
| 215 | Scheduling Analytics Cockpit | High | backlog |

---

## Wave 17 — Scheduling Command Center (EMR-206..EMR-215)

These 10 tickets turn scheduling from a stub into the practice's
competitive weapon. Tied to the v2 cadence engine (src/lib/agents/
scheduling-agent.ts) and the practice-manager hardening pass.

### EMR-206: Self-Serve Online Scheduling
**Priority:** Urgent
**Why now:** Patients expect OpenTable for their doctor. Phone-only
booking costs us new-patient conversions and burns operator time.

**Acceptance criteria:**
- Public booking URL (per-provider + per-practice) with no login wall
- Visit-type picker (new patient 60min, follow-up 30min, urgent 15min)
  drives duration + prep requirements
- Real-time slot availability respecting provider calendar, block
  rules, and intake-gate status (EMR-212)
- Insurance pre-screen step — capture member id + payer for
  eligibility check before confirmation
- Email + SMS confirmation with ICS attachment and one-tap cancel
- HIPAA-compliant form; all PII encrypted at rest
- Analytics event on every step so we can measure conversion funnel

### EMR-207: No-Show Prediction Model + De-Risking
**Priority:** Urgent
**Why now:** No-shows cost ~$200/visit in lost revenue + scheduler
reschedule burden. A probabilistic model + auto-mitigations pays for
itself in week one.

**Acceptance criteria:**
- Feature set: prior no-show rate, lead-time, visit type, weather,
  distance, insurance friction, reminder-opens
- Model trained on Appointment + Encounter history, served per-slot
- Risk tiers (low / medium / high) surfaced on the Schedule tile
- High-risk slots auto-trigger: human call nudge, deposit hold
  (if enabled), and waitlist backfill preparation
- Weekly no-show report for the practice owner
- Model retrains nightly; feature drift alerts if accuracy < baseline

### EMR-208: Algorithmic Follow-Up Cadence per Condition
**Priority:** Urgent
**Why now:** The v2 cadence engine (this sprint) resolves 7 primary
rules. EMR-208 expands it from "condition class" to "condition-level
evidence-based cadence" so cancer patients on CBD:THC 1:1 aren't on
the same cycle as a general anxiety follow-up.

**Acceptance criteria:**
- Per-condition cadence table (migraine, neuropathic pain, PTSD, CUD,
  insomnia, oncologic) with literature citations
- Cadence respects active regimen phase (titration vs. maintenance)
- Physician can override with a reason; overrides feed the model
- Outcome-driven adjustment — worsening trend shortens the cycle; a
  stable cohort lengthens it
- Export: cadence audit log per patient per quarter

### EMR-209: Smart Slot Recommender
**Priority:** High
**Why now:** Operators waste minutes per booking hunting the "right"
slot. A recommender collapses that to seconds.

**Acceptance criteria:**
- Given a patient + visit type, returns ranked slots by:
  no-show risk, travel distance, provider continuity, time-of-day
  preference (from prior bookings), and insurance-in-network status
- Explain each recommendation in one sentence ("9:30 is your usual
  slot with Dr. Patel; in-network; low no-show risk")
- Integrates with EMR-206 flow and operator booking UI
- A/B test framework to compare recommender vs. manual booking
  outcomes over 4 weeks

### EMR-210: Intelligent Waitlist + Cancellation Fill
**Priority:** High
**Why now:** A cancelled slot is revenue on the floor. Auto-fill beats
the operator scrambling to text patients manually.

**Acceptance criteria:**
- Patients can opt-in to waitlist with acceptable-window + visit-type
  preferences
- On cancellation, the engine ranks waitlisted patients by: urgency
  (cadence engine), no-show risk, flexibility score, patient VIP flag
- Sends staggered offers (top-3 parallel, then top-5, then blast)
- Operator sees status in real time; can override ordering
- Record fill-rate + fill-time metrics for weekly report

### EMR-211: Multi-Channel Reminder Orchestration
**Priority:** High
**Why now:** One-size reminders don't work. Different patients respond
to different channels; reminder fatigue drops open rates over time.

**Acceptance criteria:**
- Channels: SMS, email, voice-call (IVR), push notification, portal
  inbox
- Per-patient channel preference (with defaults by demographic)
- Cadence: T-7d, T-48h, T-24h, T-2h, plus same-day confirmation
- Content personalization: visit type, provider, prep instructions,
  copay estimate, directions
- Stops gracefully after confirmed-or-cancelled; never spams
- Delivery receipts feed the no-show model (EMR-207)

### EMR-212: New-Patient Intake-to-Visit Gate Pipeline
**Priority:** High
**Why now:** New patients who book before completing intake show up
unprepared and burn the clinician's visit time on paperwork.

**Acceptance criteria:**
- New-patient booking requires intake completion (intake agent run
  finishes) before the slot is confirmed
- Auto-generated "finish your intake" nudges at 24h, 48h, 72h
- If intake not complete 24h before slot, auto-downgrade to "pending"
  and offer a new slot after completion
- Intake captures insurance + ID + consent + state compliance form —
  all stored in the patient record before the clinician walks in
- Chart completeness score ≥ 70 required for slot to go "confirmed"

### EMR-213: Group Visit + Block + Recurring Scheduling
**Priority:** Normal
**Why now:** Group visits (education, cohort check-ins) and recurring
weekly/monthly follow-ups are standard in cannabis care. The MVP
scheduler doesn't support them.

**Acceptance criteria:**
- Block scheduling: provider can reserve a recurring block (Wed 1–3pm
  = group visit; Fri 8–10am = administrative)
- Group-visit model: multi-patient appointment with shared prep notes
  and per-patient post-visit follow-up
- Recurring series: "weekly × 8" with automatic backfill of missed
  weeks
- ICS export for the patient; portal shows the full series

### EMR-214: Provider Preference Engine + Burnout Guardrails
**Priority:** High
**Why now:** Our best asset is the provider. Over-booking clinicians
is the fastest way to lose them — and retention matters in cannabis
where specialists are scarce.

**Acceptance criteria:**
- Per-provider preference record: max patients/day, max hours/day,
  lunch block, no-urgent-after, specific visit-type caps
- Burnout index computed daily from: patient count, documentation
  backlog, message-queue depth, after-hours time
- Hard guardrails — scheduler will NOT book past max even if a slot
  appears free
- Soft nudges — when index trends high, suggest a lighter day, auto-
  decline non-essential externals
- Provider can override guardrails with a reason (logged for audit)

### EMR-215: Scheduling Analytics Cockpit
**Priority:** High
**Why now:** We can't improve what we don't measure. An analytics
cockpit turns scheduling from intuition-based to data-driven.

**Acceptance criteria:**
- Metrics: fill rate, no-show rate, cancellation rate, lead time
  distribution, new-patient conversion, revenue per slot, provider
  utilization, waitlist fill time
- Slice by: provider, visit type, payer, day-of-week, time-of-day,
  patient cohort (new / recurring / urgent)
- Forecasts: 30/60/90-day demand, bottleneck detection
- Export to CSV + weekly email digest to practice owner
- Action triggers — "fill rate < 70% for 2 weeks" opens a ticket

---

**Grand total: 215 tickets.** Product Drop #9 + Wave 17 scheduling expansion.

---

## Wave 18 — Production Billing Automation (EMR-216..EMR-230)

The night-sprint billing hardening pass shipped the foundations (payer
rules registry, remittance taxonomy, 999/277CA parsers, stale-claim
monitor). These tickets close the remaining gaps so the platform can
run an end-to-end billed patient from claim construction to ERA
posting without a biller babysitting every transition.

| # | Title | Priority | Status |
|---|---|---|---|
| 216 | Real EDI 837P generator (ANSI X12 v5010) | **Urgent** | backlog |
| 217 | Availity/Waystar/Change Healthcare gateway client | **Urgent** | backlog |
| 218 | Payer rules → DB model + admin editor | High | backlog |
| 219 | Secondary claim filing (Loop 2320 CAS) | **Urgent** | backlog |
| 220 | Provider + Organization NPI + Tax ID schema | **Urgent** | backlog |
| 221 | ERA / 835 raw-file ingestion pipeline | **Urgent** | backlog |
| 222 | Full NCCI / MUE reference table (CMS quarterly) | High | backlog |
| 223 | Per-payer contract allowable tables | High | backlog |
| 224 | Lockbox / bank deposit matching | High | backlog |
| 225 | Patient statement auto-generator + e-delivery | **Urgent** | backlog |
| 226 | Payment plan engine + card-on-file autopay | High | backlog |
| 227 | NSF / chargeback handler | Normal | backlog |
| 228 | Appeal tracker + outcome learning loop | High | backlog |
| 229 | Prior-auth workflow + payer portal adapters | High | backlog |
| 230 | RCM daily-close report + exception dashboard | **Urgent** | backlog |

### EMR-216: Real EDI 837P generator (ANSI X12 v5010)
**Priority:** Urgent
**Why now:** The current `buildEdi837Stub()` is placeholder text. Real
clearinghouses will reject it. Production billing requires a valid
X12 837P transaction set with every required loop.

**Acceptance criteria:**
- Full loop coverage: ISA/GS/ST envelope, 2000A billing provider,
  2000B subscriber/payer, 2000C patient (when subscriber ≠ patient),
  2300 claim, 2310 rendering provider, 2320 other payer (for
  secondary), 2400 service lines, 2430 line adjudication
- Segment generator handles the full data element set (BHT, HL, NM1,
  N3, N4, DMG, SBR, PAT, CLM, HI, REF, NTE, CR1, CRC, SV1, DTP, CAS)
- Delimiter / separator config (default `*` / `:` / `~`)
- Line-length + character-set enforcement (printable ASCII, 80-char
  max in strict mode)
- Generator output validated against SNIP Types 1-5 before send
- Unit tests with golden fixtures from CMS examples
- Feature-flagged alongside the existing stub until the gateway path
  (EMR-217) lands

### EMR-217: Clearinghouse gateway client (Availity / Waystar / Change Healthcare)
**Priority:** Urgent
**Why now:** The submission agent simulates success today. Production
means a real HTTP+SFTP client with auth, rate limits, retries, and
response polling.

**Acceptance criteria:**
- Adapter interface so Availity / Waystar / Change / Office Ally can
  plug in; one adapter wired as the default
- Auth: OAuth2 client-credentials or API-key; token refresh on 401
- SFTP and HTTPS ingestion paths (claims go out one way, ERAs /
  277CAs come back another)
- Rate limiting per gateway (bucket tokens, retry-after respect)
- Exponential backoff on 5xx with jitter; max 5 retries
- Response polling job polls for 277CA + 835 when async
- Complete audit trail — every request + response written to
  `ClearinghouseSubmission.ediPayload` + a new `ediResponse` field
- Error handling: network, timeouts, malformed responses → dead-letter
  queue
- Secrets in env / vault — never in code

### EMR-218: Payer rules → DB model + admin editor
**Priority:** High
**Why now:** The registry in `src/lib/billing/payer-rules.ts` is
code-resident. Operations needs to edit rules without a deploy.

**Acceptance criteria:**
- `PayerRule` Prisma model mirrors the current TypeScript shape
- Seed migration loads existing in-code rules
- `resolvePayerRule()` prefers DB then falls back to in-code defaults
- Admin UI for tier-2+ users to edit rules (timely filing, ack SLA,
  cannabis exclusions, modifier rules)
- Audit log on every edit with before/after snapshot
- "Rule is out of date" banner when a payer's last edit is > 6 months

### EMR-219: Secondary claim filing (Loop 2320 CAS)
**Priority:** Urgent
**Why now:** Primary adjudication produces the Loop 2320 CAS data the
secondary claim needs. Today the fleet only flags the situation.

**Acceptance criteria:**
- Agent `secondaryClaimAgent` wakes on primary `claim.paid` /
  `claim.partial`
- Constructs a secondary 837P with primary payer's allowed / paid /
  adjustment amounts in Loop 2320 CAS
- References the primary ERA's payer control number
- Uses secondary payer's rules (timely filing starts from primary
  ERA date, not original DOS — payer-dependent)
- Tests with golden fixtures for Medicare-secondary + commercial-
  secondary flows

### EMR-220: Provider + Organization NPI + Tax ID schema
**Priority:** Urgent
**Why now:** Claim construction escalates today because there's no
place to store NPIs. Production billing can't proceed without them.

**Acceptance criteria:**
- `Provider.npi` (10-digit validated), `Provider.taxonomyCode`
- `Organization.billingNpi`, `Organization.taxId` (EIN, encrypted),
  `Organization.billingAddress`
- `Organization.payToAddress` (if different from billing)
- Admin UI on Settings → Practice + Settings → Providers
- Validation: NPI Luhn check, EIN format
- `resolveBillingIdentifiers()` reads from DB first, env second, bio
  string last
- Seed script populates a test org / test provider with known-good
  NPIs for CI fixtures

### EMR-221: ERA / 835 raw-file ingestion pipeline
**Priority:** Urgent
**Why now:** Today `AdjudicationResult` is populated manually. Real
production ingests 835s from the clearinghouse, parses them, creates
`AdjudicationResult` rows, and kicks off the adjudication agent.

**Acceptance criteria:**
- `ErrIngest` / `EraFile` model storing raw payload + checksum
- Dedupe on (payer + checkNumber) so a retried delivery doesn't
  double-post
- ANSI X12 835 parser covering CLP / SVC / CAS / REF / DTM / PLB
  segments
- Creates `AdjudicationResult` rows + fires `adjudication.received`
  events
- Handles multi-claim payments (one check → many claims)
- PLB provider-level adjustments (refunds / forward-balance /
  takebacks) posted to the ledger
- Parser works on JSON envelopes too (commercial gateway pre-parsed
  format)
- Integration test with a real CMS-published 835 sample

### EMR-222: Full NCCI / MUE reference table
**Priority:** High
**Why now:** The scrub engine currently has a hand-written starter
set of ~10 NCCI pairs and a dozen MUE limits. CMS publishes thousands
quarterly; production billing needs the full table.

**Acceptance criteria:**
- `NcciEdit` + `MueLimit` Prisma models
- Quarterly-refresh job pulls current-quarter CSVs from CMS PTP /
  MUE public-use files
- Scrub engine reads from DB (with in-memory cache) instead of the
  code-resident starter set
- Version tag on each load so "which quarter's rules" is auditable
- Admin UI shows loaded quarter + manual refresh trigger

### EMR-223: Per-payer contract allowable tables
**Priority:** High
**Why now:** The hardened underpayment detector now scales fee
schedule by payer class (commercial/medicare). Real production
compares against each payer's CONTRACT, which the practice has
negotiated separately.

**Acceptance criteria:**
- `PayerContract` model with effective-date ranges
- `PayerContractRate` per-CPT + per-modifier allowable
- Underpayment agent flags when `allowed < contractRate * 0.95`
- Admin UI for loading contract CSVs / PDFs (OCR optional)
- Version history on contract changes

### EMR-224: Lockbox / bank deposit matching
**Priority:** High
**Why now:** The reconciliation agent matches payments to ledger
events but doesn't match bank deposits. Closing the day's books
means matching every payment to an actual deposit.

**Acceptance criteria:**
- `BankDeposit` model (date, amount, bank reference, source)
- Ingestion from the practice's bank statement CSV / OFX / BAI2
- `balanceBatchAgainstCheck()` driven by bank deposit amounts
- Variance report for unmatched deposits + unmatched payments
- Daily close report (EMR-230) shows reconciliation status

### EMR-225: Patient statement auto-generator + e-delivery
**Priority:** Urgent
**Why now:** The fleet records patient responsibility but doesn't
produce statements. No statements = no patient collections.

**Acceptance criteria:**
- `Statement` model is already in schema — build the generator
- Cadence: 30-day after first patient-responsibility posting, then
  30-day cycle until paid
- Plain-language summary (LLM-drafted, approval-gated)
- Multi-channel delivery: portal + email + SMS + paper (fallback)
- Delivery receipt tracking + open/viewed events
- Integrates with EMR-211 reminder orchestration for escalation
- Statement number format: STMT-YYYYMMDD-SEQ; unique constraint

### EMR-226: Payment plan engine + card-on-file autopay
**Priority:** High
**Why now:** Patients with >$200 balances need a path besides lump-
sum. Payment plans are referenced by the dunning ladder but the
engine doesn't exist.

**Acceptance criteria:**
- Create plan: $50-$500/mo over 3–24 months, interest-free
- Autopay: charge Payabli card on installment dates
- Default handling: 2 missed installments → escalate to final_notice
- Patient can modify / pause / cancel via portal
- PaymentPlan.paymentPlanInDefault flag feeds resolveDunningIntent()
- Notifications on each installment + default

### EMR-227: NSF / chargeback handler
**Priority:** Normal
**Why now:** A patient's card payment can bounce (NSF) or be charged
back. The ledger must handle negative payments without breaking
reconciliation.

**Acceptance criteria:**
- `Payment` can be reversed via a negative adjustment (type=takeback)
- Reverses the original FinancialEvent
- Re-opens the patient balance on affected claims
- Re-queues dunning with NSF-specific tone
- Bank fee recorded as a practice expense

### EMR-228: Appeal tracker + outcome learning loop
**Priority:** High
**Why now:** The appeals agent drafts letters but never measures
which arguments win. Missed learning opportunity.

**Acceptance criteria:**
- `AppealOutcome` records (overturned / upheld / partial)
- Learning signal: which CARC + payer + argument combination wins
- Feedback writes to `BillingMemory` so future appeals use the
  winning argument
- Dashboard shows win-rate by payer + by CARC

### EMR-229: Prior-auth workflow + payer portal adapters
**Priority:** High
**Why now:** Cannabis services require PA with most commercial payers.
The flag exists in the payer-rules registry but no PA workflow.

**Acceptance criteria:**
- `PriorAuthorization` model: patient, payer, CPT, ICD-10, status,
  submitted-at, approval-reference, expires-at
- Portal adapters for top-5 commercial payers (headless submission)
- PA packet generator (DSM-5 severity, treatment plan, prior
  failures) shared with appeals
- Claim construction checks for valid PA before submission
- Expiration alerts (14-day, 7-day, 1-day)

### EMR-230: RCM daily-close report + exception dashboard
**Priority:** Urgent
**Why now:** Operations needs a single daily view: how much was
billed, collected, outstanding, aged, appealed, written off, credited.
Today data is spread across 15 agents with no dashboard.

**Acceptance criteria:**
- Daily-close job runs at 23:59 local
- Metrics: claims created, submitted, accepted, rejected, paid,
  denied, appealed, written-off
- Dollar metrics: billed, allowed, paid, adjustments, patient resp,
  outstanding AR (by aging bucket)
- Exceptions list: stale claims, unbalanced batches, pending
  takebacks, unmatched deposits, overdue appeals
- Trend view: 7-day, 30-day, 90-day
- Export: CSV + PDF (for the practice owner)
- Email digest to practice owner the next morning

---

**Grand total: 230 tickets.** Product Drop #10 — production-billing hardening.

## Epic: E-Commerce, Identity & Content (Phase 4 Additions)

### EMR-308: [BIG] AI-generated nature/leaf "Share" button + multi-platform sharing
**Priority:** 1 — Urgent
**Status:** in_progress
**Description:**
Implement a highly aesthetic, nature/leaf themed sharing button that allows users to seamlessly share content across multiple platforms.

### EMR-312: [VERY BIG] Proprietary cannabis education curriculum (≥42 hrs, CME)
**Priority:** 1 — Urgent
**Status:** in_progress
**Description:**
Develop and integrate a massive 42+ hour proprietary education curriculum with CME tracking.

### EMR-302: Distributor model + source framework
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Build out the distributor data model and source framework for tracking product provenance.

### EMR-303: Rival Amazon / Theleafmart benchmark
**Priority:** 2 — High
**Status:** in_progress
**Description:**
UI/UX audit and feature alignment to rival Amazon's e-commerce experience on Theleafmart.

### EMR-304: AI agent differentiation guardrail questions
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Establish differentiation guardrails for the various AI agents (clinical vs consumer) using structured prompting.

### EMR-309: "Ask Cindy" highlight chatbot
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Introduce "Ask Cindy", a specialized highlight chatbot for guided user discovery.

### EMR-311: Clinician application + directory + compliance matching
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Clinician onboarding flow, directory listing, and state compliance matching engine.

### EMR-313: Loyalty/points system + gift cards
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Implement a consumer loyalty points system and gift card purchasing/redemption flow.

### EMR-314: Rebrand to "Seed Trove" / nurture-harvest-fruit lexicon
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Execute rebranding efforts shifting the platform lexicon towards "Seed Trove" and nurture-harvest-fruit terminology.

### EMR-315: Vendor tax docs + analytics dashboards
**Priority:** 2 — High
**Status:** in_progress
**Description:**
Vendor portal upgrades for tax document management and deep analytics dashboards.

### EMR-305: Product Q&A expandable tab
**Priority:** 3 — Normal
**Status:** in_progress
**Description:**
Add an interactive, expandable Q&A tab on product detail pages.

### EMR-306: Reviews with photos + AI moderation
**Priority:** 3 — Normal
**Status:** in_progress
**Description:**
Allow users to upload photos with their reviews, supported by an AI moderation pipeline.

### EMR-307: Product Details list (AI-curated specifics)
**Priority:** 3 — Normal
**Status:** in_progress
**Description:**
Display AI-curated product specifics and details in a scannable list format on PDPs.

### EMR-310: Checkout: Compare similar items + Share
**Priority:** 3 — Normal
**Status:** in_progress
**Description:**
Inject a "Compare similar items" and "Share" module directly into the checkout flow.
