# SOAP Progress Note Exemplar — Maya Reyes (HTN / DM / HLD / L Shoulder Pain)

**Source:** Dr. N. Patel (founder, clinical lead) — customer development working document
**Date captured:** 2026-05-16
**Doc type:** Heterogeneous product feedback — defines the **output target** the EMR must produce, embedded inside a fully-worked clinical exemplar
**Distinction from Docs 2/3:** Docs 2 and 3 are page-by-page UI walkthroughs ("change this button", "add this dropdown"). Doc 1 is different — it's a target artifact. It says: "When the EMR generates a finalized progress note, it must look and read like this." The product requirements are inline parentheticals; the surrounding text is the example.

**Cross-references:**
- The voice-chart `Draft Note` bubble (EMR-697, Doc 3) cites this exemplar as its output target.
- The "Objective section is human-only" rule (EMR-695, EMR-697, [memory](../../../../../.claude/projects/-Users-scottwayman-ANTIGRAVITY/memory/objective_section_human_only.md)) originates partly from this doc.

**Candidate use:** Strip the cannabis medications (#8 and #9 in the med list) and this becomes the **golden fixture for the Pain Management non-cannabis v1 acceptance gate** referenced in the Practice Onboarding Controller project (EMR-407..479).

---

## How to read this document

The clinical narrative is preserved verbatim as Dr. Patel wrote it. **Embedded product requirements** — Dr. Patel's inline parentheticals about what the EMR must do — are visually marked in two ways:

- Inline parentheticals: kept exactly as written, e.g. `(be able to use "/___" prompt...)`
- Block-level requirements (the "(...)" that span multiple lines or describe a whole system): pulled out below the narrative section they appear in, marked **▸ REQ:**

After the narrative, an **Extracted Requirements Catalog** groups every embedded requirement by theme, with Linear issue pointers.

---

# Comprehensive "Progress Note" Outpatient SOAP Note: Hypertension & Type 2 Diabetes Follow-Up (EXAMPLE)

- Date: May 16, 2026
- Patient Name: Maya Reyes
- DOB: 4/12/1986 (Age 40)
- Provider: Dr. N. Patel, DO
- Clinic: LeafJourney Clinic, Long Beach, CA

## Subjective (S)

- **Chief Complaint:** "Here for my routine 3-month checkup for my blood pressure and sugar."
- **Allergies:** No Known Drug Allergies (NKDA).
- **History of Present Illness (HPI):** 40 year old F with PMHx of HLD, HTN, DM (allow for abbreviations based on https://oems.nc.gov/wp-content/uploads/2024/11/NCCEP-Approved-Medical-Abbreviations-2023.pdf, https://www.tabers.com/tabersonline/view/Tabers-Dictionary/767492/all/Medical_Abbreviations, https://skriber.com/blog/soap-note, https://www.heidihealth.com/en-us/blog/soap-note-template-with-examples) presents for a scheduled follow up.

▸ **REQ (abbreviations):** Support medical abbreviations in note authoring. Source corpus from NCCEP-Approved-Medical-Abbreviations-2023, Taber's Medical Dictionary, skriber.com, heidihealth.com.

  - **Hypertension:** Patient reports good adherence to Lisinopril. She checks her blood pressure at home 3 times per week; states home readings average (130/80 mmHg). Denies chest pain, palpitations, shortness of breath, or headaches.
  - **Diabetes:** Patient reports adherence to Metformin. Home fingerstick blood glucose logs range from 110 mg/dL to 140 mg/dL fasting levels. She reports a mild, constant tingling sensation in her bilateral distal toes for the past month. Denies polydipsia, polyuria, polyphagia, or visual changes.
  - **L Shoulder Pain:** Patient complains of new onset L shoulder pain after playing pickle ball and reaching for ball with outstretched L hand and then falling and landing on her L shoulder. She states the pain is 3/10, constant, radiates to her front, is sharp and stabbing in nature. She has not tried any "over the counter, topicals". She denies any weakness or numbness or tingling.

- **Review of Systems (ROS):**
  - Constitutional: Negative for fatigue, fevers, chills, or unexpected weight changes.
  - Cardiovascular/Respiratory: Negative for orthopnea, dyspnea on exertion, or ankle swelling.
  - Neurological: Positive for mild bilateral toe numbness/tingling. Negative for focal weakness or dizziness.
  - Skin: Negative for non-healing foot ulcers, redness, or breakdown.
  - Musculoskeletal: shoulder pain, decreased range of motion

- **Current Medications, OTC, and supplements:** (be able to use "/___" prompt to pull in medications as well from chart. Create "bubbles" for "Rx", "cannabis", "OTC", "supplement", and "Controlled" that is listed next to each medication in a different color based on the category so it can be easily visualized and sorted by the type of pill or medication it is)

▸ **REQ (medications — slash-pull + category bubbles):**
- Provider types `/___` (e.g., `/medications`) in note authoring → AI pulls patient's medications from chart into the note
- Each medication renders with a colored "bubble" tag indicating its category: `Rx`, `cannabis`, `OTC`, `supplement`, `Controlled`
- Categories can stack on a single medication (note items #10 and #11 below have BOTH `Controlled` and `Rx`)
- Different color per category, visually distinct, sortable

  1. Lisinopril 20mg PO qday (Rx)
  2. Metformin 1000mg PO BID (Rx)
  3. Atorvastatin 20mg PO qday (Rx)
  4. Meloxicam 15mg PO qday PRN pain (Rx)
  5. Ondansetron 4mg PO q8hrs PRN nausea and vomiting (Rx)
  6. L-Theanine 200mg PO qHS (supplement)
  7. Turmeric 500mg PO qday (supplement)
  8. Camino THC: CBD 5:1 "relax" edibles BID (cannabis)
  9. PhytoRx 50mg CBD: 25mg CBG 1 pump BID (cannabis)
  10. Alprazolam 0.25mg PO qHS PRN anxiety (controlled) (Rx)
  11. Zolpidem 5mg PO qHS (controlled) (Rx)
  12. Claritin 10mg PO qDay (OTC)
  13. Tylenol 500mg PO TID (OTC)
  14. Omega 3 Fatty Acids 1200mg PO BID (supplement)

- **Social History:** Denies tobacco or recreational drug use. Drinks 1–2 beers on weekends. Walks for 20 minutes 3 times per week. Exercises and does weight training 2x/week, mainly sedentary for work. Stressed due to increased responsibilities at work and needing to take care of mother.

## Objective (O)

▸ **REQ (Objective is human-only):** This part should be removed from the "Insights" since this is something that ONLY the human can do. NO AI can do this part. *(See [objective_section_human_only.md memory](../../../../../.claude/projects/-Users-scottwayman-ANTIGRAVITY/memory/objective_section_human_only.md), EMR-695, EMR-697.)*

- **Vital Signs:**
  - Blood Pressure (BP): 134/82 >> (repeat) 120/80 (Right arm, sitting)

▸ **REQ (vital-sign repeat-reading pattern):** Vitals must support a `original >> (repeat) new` pattern for repeated measurements, e.g., `134/82 >> (repeat) 120/80`. Captures that the first reading was elevated and a repeat was taken.

  - Heart Rate (HR): 72 bpm (Regular)
  - Temperature (T): 98.4 degrees F
  - Respiratory Rate (RR): 14 breaths/min
  - Weight (Wt): 155lbs

- **Physical Examination:**
  - General: Well-groomed, alert, oriented x 3, in no acute distress.
  - HEENT: NCAT, no cataracts visualized, external ear and nose appear normal, hearing intact
  - Cardiovascular: Regular rate and rhythm. Normal S1 and S2. No peripheral pitting edema. No murmurs, no gallops, or rubs noted.
  - Respiratory: Lungs clear to auscultation bilaterally. Normal respiratory effort. No rales, rhonchi, or wheezing
  - Abdomen: Soft, non-distended, non-tender. Normal bowel sounds. Bowel sounds x 4, no rebounding or guarding
  - Neurological/Foot Exam:
    - Sensation: decreased sensation of right upper extremity. Left upper and lower extremities sensation intact bilaterally
    - Strength: adequate strength of upper and lower extremities bilaterally
    - + fluency, follows commands, steady gait
  - Skin:
    - Skin is intact without erythema, calluses, or ulcerations bilaterally. No abrasions or open lesions

- **Recent Laboratory Data** (be able to use "/___" prompt to pull in any type of labs from chart) ("month/date"):

▸ **REQ (labs — slash-pull + trending):**
- Provider types `/___` (e.g., `/labs`, `/HbA1c`) → AI pulls labs from chart into note
- Each lab value includes its capture date (`"month/date"`)
- Trended values render current AND previous side-by-side, e.g., `Hemoglobin A1c: 7.4% (5/16). Previous: 7.1% (2/14).`

  - Hemoglobin A1c: 7.4% ("month/date"). Previous: 7.1% ("month/date").
  - Basic Metabolic Panel (BMP):
    - Sodium: 139 mEq/L
    - Potassium: 4.2 mEq/L
    - Creatinine: 0.92 mg/dL
    - eGFR: 85 mL/min/1.73m^2
    - Fasting Glucose: 126 mg/dL
  - Lipid Panel:
    - Total Cholesterol: 139 mg/dL
    - HDL: 99 mg/dL
    - VLDL: 55 mg/dL
    - LDL: 77 mg/dL
    - ApoB: 126 mg/dL
    - LpA: 20 mg/dL

▸ **REQ (lab panel structure):** Common panels must be modeled as first-class structured objects with their marker children — at minimum: HbA1c, BMP (Na, K, Cr, eGFR, fasting glucose), Lipid panel (TC, HDL, VLDL, LDL, ApoB, LpA).

## Assessment (A) and Plan (P)

▸ **REQ (A+P merge for chronic conditions):** Consider merging "Assessment and Plan" for chronic conditions and all ICD-10 related conditions related.

▸ **REQ (ICD-10 capture per problem):** Each problem in the Assessment must carry an ICD-10 code (e.g., Essential Hypertension → I10).

- **1. Essential Hypertension (ICD-10: I10):**
  - Chronic, stable, in range
  - Well-controlled on current therapy.
  - Clinic and home readings are close to target (130/80 mmHg).
  - BMP shows stable renal function and normal potassium levels while taking an ACE inhibitor.
  - If blood pressure goes above 140>90, consider starting beta blocker (such as metoprolol 25mg PO qday or carvedilol 6.25mg PO qday)
  - Continue to have patient monitor blood pressure at home
    - Use "/___" prompt to allow for "education on___ (subject)," for example type in "/blood pressure" and have it pull in educational data for patient to know how to properly take blood pressure and for other educational recommendations as an example below:
    - Advised to check BPs at home at least 3-4x/week ideally twice daily, randomly with proper technique including keeping feet planted on floor/cuff at level of heart/ legs uncrossed, emptying out bladder before checking, using proper cuff size and cuff placement on bare skin, cutting down on overall stress, decreasing salt intake, reducing caffeine intake, limiting alcohol consumption if drinks, lose weight, make sure to get adequate and restful sleep, take 2 readings (wait 1-2 minutes between them and record the average), importance of consistency since "trends are your friends."
  - Continue to monitor and adjust medication regimen accordingly

▸ **REQ (slash-command education library — generic engine):** A general-purpose `/[topic]` slash-command engine in the Plan/Education sections of note authoring. Typing `/<topic>` injects a pre-written patient-education block. The system must be extensible — Dr. Patel's note demonstrates four initial topics (`/blood pressure`, `/blood glucose`, `/shoulder pain`, `/cholesterol`) plus a stretches variant (`/shoulder stretch exercises`).

▸ **REQ (initial education content — Blood Pressure):** Seed `/blood pressure` content as shown above (cuff technique, twice-daily timing, salt/caffeine/alcohol/sleep, two-reading averaging, "trends are your friends").

- **2. Type 2 Diabetes Mellitus without complications (ICD-10: E11.9):**
  - Chronic, stable, sub optimally controlled.
  - A1C rising slightly (7.4%) when previously 7.1
  - Continue with metformin 1000mg PO qday
  - Home glucose readings are above target (110 mg/dL)
  - Continue to have patient monitor blood glucose at home
    - Use "/___" prompt to allow for "education on___ (subject)," for example type in "/blood glucose" and have it pull in educational data for patient to know how to properly take blood glucose and for other educational recommendations as an example below:
    - Advised to to f/u dentist qYear
    - Advised to to f/u retinal screening qYear
    - Consider trying natural remedies such as fenugreek seeds (soak and drink in morning), cinnamon, turmeric, ginger, etc
    - Encourage foot care and monitoring for ulcers and sensation
  - Continue to monitor and adjust medication regimen accordingly

▸ **REQ (initial education content — Blood Glucose):** Seed `/blood glucose` content: annual dental f/u, annual retinal screening, natural remedies (fenugreek, cinnamon, turmeric, ginger), foot care + sensation monitoring.

- **3. L Shoulder Pain (ICD-10: M25.512):**
  - Acute, stable, symptomatic.
  - Pt with one week of L shoulder pain after playing pickleball (summarize the subjective into about 5-10 words)

▸ **REQ (5-10 word Assessment summary):** Acute-issue Assessment lines should summarize the Subjective HPI into ~5–10 words (e.g., "Pt with one week of L shoulder pain after playing pickleball").

  - Continue with meloxicam 15mg PO qday PRN pain
    - Use "/___" prompt to allow for "education on___ (subject)," for example type in "/shoulder pain" and have it pull in educational data for patient to know how to properly manage shoulder pain and for other educational recommendations as an example below:
    - Advised to try Voltaren gel, Sensur Oil roll on (Ayurvedic), magnesium oil (Art Natural) capsaicin cream, ROM/stretching/strength exercises along with acupuncture mat, heat, TENS Unit, NeuroMD device, Theracane, Med Massager, zero gravity chair or Theragun PRN as tolerated, consider exploring store, "Relax The Back" for different, comfortable furniture along with stretching exercises and services such as Stretch Lab, consider doing ARP wave therapy, red light therapy, Gyrotonic method, X-iser machine, www.startx39now.com (electromagnetic feedback)
    - Consider PT if persist
    - "/ shoulder stretch exercises" (have it pull about 5 shoulder stretch exercises that patient can do simply at home, etc)
    - Continue to monitor

▸ **REQ (initial education content — Shoulder Pain):** Seed `/shoulder pain` content with the brand/product list above (Voltaren gel, Sensur Oil, magnesium oil, capsaicin cream, TENS, NeuroMD, Theracane, Med Massager, zero gravity chair, Theragun, "Relax The Back", Stretch Lab, ARP wave, red light, Gyrotonic, X-iser, startx39now.com), and a PT referral consideration.

▸ **REQ (slash-command for exercises):** `/<topic> stretch exercises` (e.g., `/shoulder stretch exercises`) injects ~5 simple at-home stretch exercises for that body region. Generalize to other regions.

- **4. Hyperlipidemia (ICD-10: E78.00):**
  - Chronic, stable, sub optimally controlled.
  - LDL rising slightly 77 mg/dL when previously 55 mg/dL
  - Continue with atorvastatin 20mg PO qday
    - Use "/___" prompt to allow for "education on___ (subject)," for example type in "/cholesterol" and have it pull in educational data for patient to know how to properly manage cholesterol and for other educational recommendations as an example below:
    - Continue to encourage lifestyle changes via dietary modifications (decreasing carbohydrate intake such as juices, breads, pastas, etc, junk foods, along with portion control and adequate hydration of minimum 64oz of water per day, increase soluble fiber, increase extra virgin olive oil, reduce meat protein and substitute for plant proteins), increasing exercise frequency (at least 150 minutes/ week of aerobic exercise + minimum of 2 days of strength/resistance training) as tolerated, weighing self at least once per week; advise intermittent fasting (doing 16:8, 12:12 ratios, skipping meals, doing 24 hour fasts, pro-longed fasting); advised to take vitamin K2 + D3 (Cardio Platinum, Kyoloic), Omega 3, consider trying Oculus VR system as alternative motivation for activity and exercise; advised to review supplements and nutraceuticals using website (www.examine.com); advised on importance of stress management and not to neglect stressors
  - Continue to monitor and adjust medication regimen accordingly

▸ **REQ (initial education content — Cholesterol):** Seed `/cholesterol` content with the full dietary/lifestyle list above (carb reduction, hydration, soluble fiber, EVOO, plant proteins, 150min/wk aerobic + 2 days strength, weekly self-weighing, intermittent fasting variants, K2+D3 / Omega 3 / Cardio Platinum / Kyoloic, Oculus VR motivation, examine.com supplement review, stress management).

## Maintenance and Follow-Up

▸ **REQ (consider merging A+P for chronic + related):** Already noted above — consider merging "Assessment and Plan" for chronic conditions and all ICD-10 related conditions related.

- **Health Maintenance & Referrals:**
  - Order screening for Urine Microalbumin/Creatinine ratio to check for early diabetic nephropathy (missed at lab draw).
  - Refer patient to Ophthalmology for an annual dilated comprehensive eye exam.
  - Refer patient to Podiatry for professional comprehensive diabetic foot and nail care due to new sensory loss.
  - Patient is due for colonoscopy in 2027
  - Follow up Mammogram (9/2026)

▸ **REQ (health maintenance scheduler):** Note authoring must produce structured health-maintenance items with explicit due-dates and referral targets (Urine Microalbumin/Cr, annual Ophthalmology, Podiatry for sensory loss, colonoscopy by year, Mammogram by month/year). These should populate the patient's chart preventive-care/screening surface, not just sit as note text.

- **Follow-Up:**
  - Return to the outpatient clinic in 4 weeks for a repeat Basic Metabolic Panel (BMP) to check renal function if starting the SGLT2 inhibitor.
  - Schedule a regular chronic care visit in 3 months to recheck Hemoglobin A1c.
  - Start PT for L shoulder if still in pain after 1 month

---

# Extracted Requirements Catalog

Each requirement is themed and mapped to its Linear issue once created. Use this section as the engineering-facing source of truth; the narrative above is the clinical-facing source.

## 1. Medication category bubbles + slash-pull (Linear: EMR-701)
- Slash-command `/medications` (or `/___`) injects patient's chart medications inline
- Color-coded category bubbles per medication: `Rx`, `cannabis`, `OTC`, `supplement`, `Controlled`
- Categories STACK — `Controlled` is additive to `Rx` (see note items #10 and #11)
- Visually distinct color per category; sortable / filterable

## 2. Lab slash-pull + trending + panel structure (Linear: EMR-702)
- Slash-command `/labs` (or `/HbA1c`, `/BMP`, `/lipid`) pulls lab values from chart
- Each value carries its capture date
- Trended values render `current` AND `previous` side-by-side
- First-class structured panels: HbA1c, BMP (Na, K, Cr, eGFR, fasting glucose), Lipid (TC, HDL, VLDL, LDL, ApoB, LpA)

## 3. Slash-command education library (engine + seed content) (Linear: EMR-703)
- Generic `/<topic>` slash engine for Plan / Education sections
- Extensible — Dr. Patel's note demonstrates 5 initial topics
- Seed content for:
  - `/blood pressure` — cuff technique, twice-daily timing, salt/caffeine/alcohol/sleep, two-reading averaging, "trends are your friends"
  - `/blood glucose` — annual dental + retinal screening, fenugreek/cinnamon/turmeric/ginger natural remedies, foot care
  - `/shoulder pain` — Voltaren gel, Sensur Oil, magnesium oil, capsaicin cream, TENS, NeuroMD, Theracane, Med Massager, zero gravity chair, Theragun, "Relax The Back", Stretch Lab, ARP wave, red light, Gyrotonic, X-iser, startx39now.com, PT consideration
  - `/cholesterol` — carb reduction, hydration, soluble fiber, EVOO, plant proteins, 150min/wk aerobic + 2 days strength, weekly weighing, intermittent fasting, K2+D3 / Omega 3 / Cardio Platinum / Kyoloic, Oculus VR, examine.com, stress management
  - `/shoulder stretch exercises` — ~5 simple at-home stretches (generalize to other body regions)

## 4. Note structure rules (Linear: EMR-704)
- **A+P merge** — for chronic conditions and all ICD-10-related conditions, merge Assessment and Plan
- **ICD-10 capture per problem** — every problem carries an ICD-10 code in the Assessment header
- **Vital-sign repeat-reading pattern** — `original >> (repeat) new`, e.g., `BP 134/82 >> (repeat) 120/80`
- **5-10 word Assessment summary for acute issues** — e.g., "Pt with one week of L shoulder pain after playing pickleball"
- **`Objective` section is HUMAN-ONLY** *(cross-link to EMR-695 / EMR-697; do not duplicate this work)*

## 5. Health maintenance / preventive-care scheduler (Linear: EMR-705)
- Note authoring produces structured health-maintenance items with explicit due-dates + referral targets
- Items populate the patient's chart preventive-care surface (not just note text)
- Demonstrated items: Urine Microalbumin/Cr screening, annual Ophthalmology dilated exam, Podiatry referral for sensory loss, colonoscopy by year (2027), Mammogram by month/year (9/2026)
- Follow-up scheduling: "4 weeks for repeat BMP", "3 months for HbA1c recheck", "PT for L shoulder if not improved in 1 month"

## 6. Medical abbreviation support (Linear: EMR-706)
- Recognize and expand standard medical abbreviations in note authoring
- Source corpus: NCCEP-Approved-Medical-Abbreviations-2023, Taber's Medical Dictionary, skriber.com SOAP-note glossary, heidihealth.com SOAP-note template

## 7. Golden fixture preservation (Linear: EMR-700)
- The Maya Reyes case (this document, with cannabis meds #8 and #9 stripped) becomes the **golden fixture for the Pain Management non-cannabis v1 acceptance gate**
- Used to verify: voice-chart Draft Note output matches this format, slash-command education renders, ICD-10 capture, A+P merge, vitals repeat pattern, lab trending
- Lives as a versioned fixture in the repo (path TBD by engineer)

---

# Carry-forward links

- Doc 2 (clinic website revisions): EMR-678
- Doc 3 (patient chart revisions): EMR-695
- Practice Onboarding Controller v1 (specialty-adaptive shell): EMR-407..479
- Memory: [customer_dev_working_docs.md](../../../../../.claude/projects/-Users-scottwayman-ANTIGRAVITY/memory/customer_dev_working_docs.md), [product_feedback_docs_location.md](../../../../../.claude/projects/-Users-scottwayman-ANTIGRAVITY/memory/product_feedback_docs_location.md), [objective_section_human_only.md](../../../../../.claude/projects/-Users-scottwayman-ANTIGRAVITY/memory/objective_section_human_only.md)
