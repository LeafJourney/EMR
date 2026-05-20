# Maya Reyes — SOAP Exemplar (Pain Management, v1, full)

> Acceptance fixture for EMR-700. Demonstrates ICD-10 capture per problem,
> A+P merge for chronic conditions, vital-sign repeat-reading syntax,
> medication category bubbles, lab trending current-vs-previous, slash-command
> education rendering, and health-maintenance items with due-dates.

**Patient:** Maya Reyes (35, F)
**Visit:** Chronic follow-up — HTN / DM / HLD + L shoulder pain
**Date:** 2026-05-16
**ICD-10 problems:** I10, E11.9, E78.00, M25.512

---

## Subjective

35F here for f/u of HLD, HTN, DM, all stable on current regimen. Reports
adherence with meds and home BP cuff. Walking 30 minutes 4x/week. Diet
generally low-carb. Sleep ~6 hours nightly. No new symptoms.

One week of L shoulder pain after playing pickleball last Sunday. Pain 5/10
with overhead reach, 2/10 at rest. No numbness or weakness. ROM mildly
reduced. Tried OTC ibuprofen 400mg with partial relief.

PMHx: HLD, HTN, DM (type 2, no complications), anxiety.
PSHx: None.
NKDA.

## Objective

**Vitals:**
- Blood Pressure (BP): 134/82 >> (repeat) 120/80 (Right arm, sitting)
- HR: 72
- T: 98.6
- RR: 14
- Wt: 142 lb

**Exam:** NCAT. HEENT WNL. CV: S1/S2 RRR, no murmur. Lungs CTA bilaterally.
Abd soft, non-tender. L shoulder: tenderness over supraspinatus insertion,
ROM 0–160° abduction with discomfort at terminal range. Neurovascularly
intact. Skin: no rashes.

**Labs:**
- Hemoglobin A1c: 7.4% (5/16). Previous: 7.1% (2/14).
- BMP — Sodium: 139 mEq/L; Potassium: 4.2 mEq/L; Creatinine: 0.9 mg/dL;
  eGFR: 88 mL/min/1.73m²; Fasting Glucose: 142 mg/dL.
- Lipid panel — Total Cholesterol: 198; HDL: 52; VLDL: 18; LDL: 128;
  ApoB: 96; LpA: 18 mg/dL.

## Assessment + Plan

### 1. Essential Hypertension (I10) — chronic, A+P merged

Stable on lisinopril 20mg qday. Home BP log shows averages 128/78. Continue
current regimen. `/blood pressure`

### 2. Type 2 DM without complications (E11.9) — chronic, A+P merged

A1c uptrending 7.1 → 7.4. Continue metformin 1000mg BID. Add SGLT2
inhibitor (empagliflozin 10mg qday). Return in 4 weeks for repeat BMP if
starting SGLT2 inhibitor. Chronic care visit in 3 months to recheck HbA1c.
`/blood glucose`

### 3. Hyperlipidemia (E78.00) — chronic, A+P merged

LDL 128, ApoB 96 — at goal on atorvastatin 20mg qHS. Continue.
`/cholesterol`

### 4. L Shoulder Pain (M25.512) — acute

**Assessment:** Pt with one week of L shoulder pain after playing pickleball.

**Plan:** Voltaren gel BID PRN, Sensur Oil roll on, ROM/stretching exercises.
Start PT for L shoulder if still in pain after 1 month. `/shoulder pain`
`/shoulder stretch exercises`

### Anxiety (F41.1) — chronic

Stable. Alprazolam 0.5mg PRN (≤2/week reported). Continue.

---

## Medications (with category bubbles)

| # | Name | Dose | SIG | Categories |
| --- | --- | --- | --- | --- |
| 1 | Lisinopril | 20mg | qday | Rx |
| 2 | Metformin | 1000mg | BID | Rx |
| 3 | Atorvastatin | 20mg | qHS | Rx |
| 4 | Empagliflozin | 10mg | qday | Rx |
| 5 | Voltaren gel | 1% | BID PRN | Rx |
| 6 | Vitamin D3 | 2000 IU | qday | supplement |
| 7 | Omega 3 | 1g | qday | supplement |
| 8 | Camino edibles (CBD/THC 2:1) | 5mg | PRN sleep | cannabis |
| 9 | PhytoRx CBD tincture | 25mg | qHS | cannabis |
| 10 | Alprazolam | 0.5mg | PRN | Controlled, Rx |
| 11 | Zolpidem | 5mg | qHS PRN | Controlled, Rx |
| 12 | Ibuprofen | 400mg | q6h PRN | OTC |
| 13 | Acetaminophen | 500mg | q6h PRN | OTC |
| 14 | Cardio Platinum (K2 + D3) | 1 cap | qday | supplement |

---

## Health Maintenance / Preventive Care

- Urine Microalbumin/Cr ratio screening — for early diabetic nephropathy
  (E11.9). Due: annual (next 2026-08-01).
- Annual Ophthalmology dilated comprehensive eye exam (E11.9). Due: 2026-08-01.
- Podiatry referral — diabetic foot/nail care, new sensory loss (E11.9).
  Status: ordered.
- Colonoscopy. Due: 2027-05-16.
- Mammogram follow-up. Due: 2026-09-01.

## Follow-up

- Repeat BMP in 4 weeks (if SGLT2 started).
- Chronic care visit in 3 months — recheck HbA1c.
- PT for L shoulder if persists > 1 month.
