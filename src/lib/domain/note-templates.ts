// Clinical Note Templates — EMR-174
// Reusable templates for common visit types. AI fills in patient-specific details.

export interface NoteTemplate {
  id: string;
  name: string;
  visitType: string;
  emoji: string;
  blocks: Array<{ type: string; heading: string; body: string }>;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "cannabis-initiation",
    name: "Cannabis Initiation Visit",
    visitType: "New cannabis patient",
    emoji: "\uD83C\uDF3F",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for initial cannabis medicine consultation. Chief complaint: [presenting concern]. Duration: [duration]. Prior treatments tried: [prior treatments]. Cannabis experience: [naive/experienced]. Current medications: [current meds]. Allergies: [allergies]." },
      { type: "assessment", heading: "Assessment", body: "[Age]-year-old [sex] presenting with [condition] suitable for cannabis therapy trial. [Supporting clinical reasoning]. Risk-benefit discussion completed. Patient understands start-low-go-slow approach." },
      { type: "plan", heading: "Plan", body: "1. Initiate cannabis therapy: [product type] [route]\n2. Starting dose: [THC mg] THC + [CBD mg] CBD, [frequency]\n3. Titration schedule: increase by [increment] every [interval] as tolerated\n4. Patient education provided: dosing, side effects, driving restrictions, storage\n5. Follow-up in 2 weeks to assess tolerance and efficacy\n6. Outcome tracking: daily pain/sleep/anxiety logging in portal" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], Wt [weight]\nGeneral: [appearance]\nPsych: [mood/affect]\nRelevant exam: [focused exam findings]" },
    ],
  },
  {
    id: "pain-followup",
    name: "Pain Management Follow-Up",
    visitType: "Follow-up",
    emoji: "\uD83E\uDE7C",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient returns for pain management follow-up. Current pain: [0-10]/10 (was [prior score] at last visit). Location: [location]. Character: [character]. Aggravating factors: [factors]. Current regimen: [current cannabis regimen]. Adherence: [good/fair/poor]. Side effects reported: [any side effects]. Sleep quality: [0-10]/10. Functional status: [improved/stable/declined]." },
      { type: "assessment", heading: "Assessment", body: "Chronic pain [improving/stable/worsening] on current cannabis regimen. Pain score [direction] from [old] to [new]. [Additional assessment]. Treatment goals [being met / partially met / not met]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/Adjust] current regimen: [details]\n2. [Any dose changes with rationale]\n3. Continue outcome logging\n4. Follow-up in [interval]\n5. [Any additional interventions: PT referral, lifestyle modifications, etc.]" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR]\nPain assessment: [location, tenderness, ROM]\nFunctional: [gait, grip strength, etc.]\nMood/affect: [observation]" },
    ],
  },
  {
    id: "mental-health-checkin",
    name: "Mental Health Check-In",
    visitType: "Follow-up",
    emoji: "\uD83E\uDDD8",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for mental health follow-up. Mood: [description]. Sleep: [quality, duration]. Anxiety level: [0-10]/10. PHQ-9: [score] (was [prior]). GAD-7: [score] (was [prior]). Stressors: [current stressors]. Coping: [strategies in use]. Cannabis use: [current regimen adherence]. Side effects: [any]. Suicidal ideation: [denied/present — if present, assess safety]." },
      { type: "assessment", heading: "Assessment", body: "[Diagnosis] — [improving/stable/worsening]. PHQ-9 [direction] from [old] to [new]. GAD-7 [direction] from [old] to [new]. [Clinical interpretation]. No acute safety concerns [or describe safety plan if applicable]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/Adjust] CBD regimen: [current dose and any changes]\n2. [Any THC considerations — note anxiety risk]\n3. Reassess PHQ-9 and GAD-7 in 4 weeks\n4. [Therapy referral if applicable]\n5. [Lifestyle: exercise, sleep hygiene, mindfulness]\n6. Follow-up in [interval]\n7. Safety plan reviewed: [yes/no/updated]" },
      { type: "objective", heading: "Objective", body: "Appearance: [grooming, eye contact]\nBehavior: [cooperative, anxious, withdrawn]\nMood: [stated]\nAffect: [observed — congruent/incongruent, range]\nThought process: [linear, goal-directed]\nThought content: [no SI/HI, no delusions]\nCognition: [alert, oriented]" },
    ],
  },
  {
    id: "medication-adjustment",
    name: "Medication Adjustment",
    visitType: "Follow-up",
    emoji: "\u2696\uFE0F",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for medication adjustment. Current regimen: [product, dose, frequency]. Reason for adjustment: [inadequate relief / side effects / tolerance / patient preference]. Current symptom status: [symptoms and severity]. Duration on current dose: [duration]. Adherence: [assessment]." },
      { type: "assessment", heading: "Assessment", body: "Current cannabis regimen [subtherapeutic / causing side effects / appropriate but needs fine-tuning]. [Clinical rationale for change]. Drug interaction check: [clear / flagged — detail if flagged]. Contraindication screen: [clear / noted]." },
      { type: "plan", heading: "Plan", body: "1. Adjust regimen:\n   - Previous: [old dose/product]\n   - New: [new dose/product]\n   - Rationale: [why]\n2. Titration: [schedule if applicable]\n3. Monitor for: [specific things to watch]\n4. Follow-up in [interval] to reassess\n5. Patient instructed on new dosing schedule" },
      { type: "objective", heading: "Objective", body: "Vitals: [relevant vitals]\nRelevant exam: [focused findings]\nCurrent labs if applicable: [lab values]" },
    ],
  },
  {
    id: "wellness-exam",
    name: "Annual Wellness Exam",
    visitType: "Wellness",
    emoji: "\uD83C\uDF1F",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for annual wellness exam. General health status: [good/fair/poor]. New concerns since last visit: [any]. Preventive care: [vaccinations, screenings due]. Lifestyle: sleep [hours], exercise [frequency], diet [quality], stress [level]. Cannabis use: [current regimen summary]. Substance use: [tobacco, alcohol, other]. Social history updates: [any changes]." },
      { type: "assessment", heading: "Assessment", body: "1. [Primary diagnosis] — [status]\n2. [Secondary diagnosis if applicable] — [status]\n3. Preventive care: [up to date / overdue items]\n4. Cannabis therapy: [effective/needs adjustment]\n5. Overall health trajectory: [improving/stable/declining]" },
      { type: "plan", heading: "Plan", body: "1. Continue current care plan: [summary]\n2. Preventive: [screenings/labs ordered]\n3. Cannabis: [continue/adjust — detail]\n4. Lifestyle goals: [specific recommendations]\n5. Referrals: [any needed]\n6. Follow-up: routine in [interval]" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], Wt [weight], BMI [BMI]\nGeneral: [appearance]\nHEENT: [findings]\nCardiovascular: [findings]\nRespiratory: [findings]\nAbdomen: [findings]\nMusculoskeletal: [findings]\nNeuro: [findings]\nPsych: [mood, affect]\nSkin: [findings]" },
    ],
  },
  {
    id: "cannabis-initial-consult",
    name: "Cannabis Initial Consult",
    visitType: "New cannabis patient",
    emoji: "\uD83C\uDF31",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for initial cannabis medicine consultation. Qualifying condition: [condition]. Symptom severity: [0-10]. Prior treatments: [list]. Cannabis exposure history: [naive / prior use / current use]. Goals for cannabis therapy: [goals]. Concerns: [driving, work, family, cost]. Informed consent reviewed: [yes]." },
      { type: "assessment", heading: "Assessment", body: "[Age]-year-old [sex] with [condition] appropriate for cannabis-based therapy per state guidelines and patient goals. Risk factors reviewed: [cardiac, psych, substance-use, pregnancy]. No absolute contraindications identified [or note exceptions]. Patient qualifies under [state program]." },
      { type: "plan", heading: "Plan", body: "1. Certify cannabis qualification and issue recommendation\n2. Start low, go slow: [THC mg] + [CBD mg] at bedtime, titrate weekly\n3. Route: [oral/sublingual/inhaled]\n4. Educational packet delivered (dosing, storage, drug interactions, driving restrictions)\n5. Outcome logging set up in patient portal (pain / sleep / anxiety / mood)\n6. Follow-up in 2 weeks" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], Wt [weight]\nGeneral: [appearance, distress]\nPsych: [mood, affect, thought process]\nFocused exam: [relevant to qualifying condition]" },
    ],
  },
  {
    id: "anxiety-followup",
    name: "Anxiety Follow-Up",
    visitType: "Follow-up",
    emoji: "\uD83E\uDDD8",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient returns for anxiety management follow-up. GAD-7 today: [score] (prior [prior]). Panic attacks: [freq/severity]. Sleep: [hours], [quality]. Avoidance behaviors: [describe]. Current regimen: [CBD dose], [THC considerations]. Side effects: [any]. Substance use: [caffeine/alcohol]. Work/school functioning: [improved/stable/impaired]." },
      { type: "assessment", heading: "Assessment", body: "Generalized anxiety [improving/stable/worsening]. GAD-7 trend [direction]. CBD dosing appears [subtherapeutic/therapeutic/supratherapeutic]. [Any THC tolerability notes]. No safety concerns." },
      { type: "plan", heading: "Plan", body: "1. [Continue/Adjust] CBD regimen: [details]\n2. Consider [THC-sparing / low-THC ratios]\n3. Behavioral: mindfulness app, CBT referral if indicated\n4. Sleep hygiene reinforced\n5. Reassess GAD-7 in 4 weeks\n6. Follow-up in [interval]" },
      { type: "objective", heading: "Objective", body: "Appearance: [calm/anxious]\nAffect: [observed range]\nThought process: [linear]\nThought content: [no SI/HI]\nVitals if checked: [BP, HR]" },
    ],
  },
  {
    id: "chronic-pain-followup",
    name: "Chronic Pain Follow-Up",
    visitType: "Follow-up",
    emoji: "\uD83E\uDE7C",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Chronic pain follow-up. Pain score today: [0-10] (prior [prior]). Location: [site]. Character: [burning/aching/sharp]. Activity tolerance: [steps, hours]. Opioid MME/day: [value]. Current cannabis regimen: [product/dose/freq]. Side effects: [any]. PEG score: [value]." },
      { type: "assessment", heading: "Assessment", body: "Chronic pain [diagnosis] — [improving/stable/worsening] on current multimodal regimen. Pain score [direction]. Opioid reduction: [yes/no, MME change]. Cannabis appears to be [opioid-sparing/not opioid-sparing]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/adjust] cannabis regimen — details\n2. Opioid plan: [taper/stable/refill]\n3. Non-pharm: PT, acupuncture, mindfulness\n4. Activity goals: [specific target]\n5. Outcome logging continued\n6. Follow-up in [interval]" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR]\nPain exam: [location, ROM, tenderness]\nFunctional: [gait, transfers]\nNeuro: [strength, sensation]" },
    ],
  },
  {
    id: "sleep-evaluation",
    name: "Sleep Evaluation",
    visitType: "New problem",
    emoji: "\uD83D\uDECC",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for sleep concerns. Chief complaint: [difficulty falling asleep / staying asleep / early awakening / non-restorative]. Duration: [weeks/months]. Sleep latency: [minutes]. Total sleep: [hours]. Awakenings: [number]. Daytime sleepiness (ESS): [score]. STOP-BANG: [score]. Prior sleep meds: [list]. Sleep hygiene: [assessment]. Shift work / jet lag: [yes/no]." },
      { type: "assessment", heading: "Assessment", body: "[Insomnia subtype / suspected OSA / circadian disorder]. Contributing factors: [anxiety, pain, substance use]. Sleep study indicated: [yes/no]. Cannabis may be adjunctive via [CBN/CBD/low-dose THC]." },
      { type: "plan", heading: "Plan", body: "1. Sleep hygiene bundle (fixed wake time, dim lights 2h before bed, no screens)\n2. Trial [CBN product or low-THC sleep formula] 1h before bed\n3. [Sleep study referral if OSA suspected]\n4. Consider CBT-I referral\n5. Reassess in 3 weeks with sleep diary\n6. Avoid benzodiazepines if possible" },
      { type: "objective", heading: "Objective", body: "General: [appearance, alertness]\nHEENT: [Mallampati, neck circumference]\nVitals: [BP, HR, BMI]" },
    ],
  },
  {
    id: "ptsd-checkin",
    name: "PTSD Check-In",
    visitType: "Follow-up",
    emoji: "\uD83D\uDEE1\uFE0F",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "PTSD follow-up. PCL-5 today: [score] (prior [prior]). Re-experiencing: [frequency]. Avoidance: [description]. Hyperarousal: [startle, irritability]. Sleep: [quality, nightmares]. Triggers this period: [list]. Current cannabis regimen: [details]. Therapy engagement: [attending/not]. Substance use: [assess]. Safety: [SI/HI screen]." },
      { type: "assessment", heading: "Assessment", body: "PTSD — [improving/stable/worsening]. PCL-5 [direction]. Cannabis appears [helpful/neutral/harmful] for [nightmares/hyperarousal/avoidance]. No acute safety concerns [or describe plan]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/Adjust] cannabis regimen — [CBD/low THC at bedtime]\n2. Continue trauma-focused therapy (CPT/EMDR)\n3. Grounding techniques reviewed\n4. Crisis plan: [988 / local crisis line]\n5. Reassess PCL-5 in 4 weeks\n6. Follow-up in [interval]" },
      { type: "objective", heading: "Objective", body: "Appearance: [grooming, eye contact]\nAffect: [range, congruence]\nThought content: [flashbacks, dissociation]\nSafety: [no SI/HI]" },
    ],
  },
  {
    id: "oncology-support",
    name: "Oncology Support Visit",
    visitType: "Follow-up",
    emoji: "\uD83C\uDF97\uFE0F",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Oncology support follow-up. Primary diagnosis: [cancer type, stage]. Current oncology treatment: [chemo/radiation/immuno]. Symptoms: nausea [0-10], pain [0-10], appetite [poor/fair/good], fatigue [0-10], anxiety [0-10]. Weight: [trend]. Current cannabis regimen: [details]. Side effects: [any]. Coordination with oncologist: [yes/no]." },
      { type: "assessment", heading: "Assessment", body: "Patient undergoing [treatment] for [diagnosis]. Cannabis being used as adjunct for [CINV / pain / appetite / anxiety / sleep]. Symptom control: [improved/stable/declined]. No interactions with [chemotherapy agents] identified per current literature [or list concerns]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/adjust] cannabis: [product, dose]\n2. CINV: consider [THC-dominant pre-chemo]\n3. Appetite: [low-dose THC at meals]\n4. Pain: [multimodal approach]\n5. Coordinate with oncology team — note sent\n6. Palliative care referral if indicated\n7. Follow-up in [interval]" },
      { type: "objective", heading: "Objective", body: "General: [cachexia, distress]\nVitals: [BP, HR, Wt, trend]\nHEENT: [mucositis]\nAbdomen: [tenderness, organomegaly]\nSkin: [pallor, rash]" },
    ],
  },
  {
    id: "pediatric-epilepsy",
    name: "Pediatric Epilepsy Visit",
    visitType: "Follow-up",
    emoji: "\uD83E\uDDE0",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Pediatric epilepsy follow-up. Age: [age]. Seizure type: [focal/generalized/drop]. Frequency this period: [count] (baseline [prior]). Duration: [seconds]. Triggers: [identified]. Current AEDs: [list]. CBD regimen: Epidiolex [dose mg/kg/day] or custom [product/dose]. Side effects: [somnolence, diarrhea, LFT concerns]. Developmental milestones: [on track / delayed]. School: [attendance, accommodations]." },
      { type: "assessment", heading: "Assessment", body: "[Diagnosis: Dravet / LGS / TSC / refractory epilepsy]. Seizure frequency [improved/stable/worsened] on current regimen. Pharmacoresistant: [yes/no]. CBD [therapeutic/subtherapeutic/supratherapeutic]. LFTs: [stable/elevated]. Drug-drug interactions reviewed (especially valproate, clobazam)." },
      { type: "plan", heading: "Plan", body: "1. [Continue/titrate] CBD to [target mg/kg/day]\n2. Monitor LFTs q[interval] — next due [date]\n3. Review AED levels: [as applicable]\n4. Seizure diary / video log continued\n5. School plan updated\n6. Neurology coordination — note sent\n7. Follow-up in [interval]" },
      { type: "objective", heading: "Objective", body: "General: [appearance, alertness, development]\nVitals: BP [BP], HR [HR], Wt [weight], growth percentile\nNeuro: [focal findings, gait, tone, reflexes]\nSkin: [neurocutaneous stigmata]" },
    ],
  },
  {
    id: "geriatric-cannabis-eval",
    name: "Geriatric Cannabis Evaluation",
    visitType: "New cannabis patient",
    emoji: "\uD83D\uDC75",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Geriatric patient (age [age]) presents for cannabis evaluation. Target symptoms: [pain/sleep/anxiety/appetite/neuropathy]. Polypharmacy: [number] medications (Beers list reviewed). Falls history: [number past 6mo]. Cognitive baseline: [MoCA/MMSE if done]. Orthostatic symptoms: [yes/no]. Cardiac history: [CAD, arrhythmia]. Caregiver present: [yes/no]. Driving status: [active/retired]." },
      { type: "assessment", heading: "Assessment", body: "[Age]-year-old with [primary condition] considering cannabis adjunct. Geriatric considerations: higher sensitivity to THC, fall risk, orthostasis, cognitive effects, drug interactions (warfarin, statins, SSRIs). CBD-forward approach preferred. Caregiver support available: [yes/no]." },
      { type: "plan", heading: "Plan", body: "1. Start very low, go very slow: CBD [5 mg BID], titrate q2wk\n2. If THC needed: max [2.5 mg] evening dose\n3. Fall-prevention education\n4. Review all meds against cannabis interaction list\n5. Orthostatics at next visit\n6. Caregiver education provided\n7. Follow-up in 2 weeks" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [sit/stand], HR, Wt\nGeneral: [frailty, grooming]\nMSK: [gait, Tinetti]\nNeuro: [cognition, coordination]\nCV: [rhythm, edema]" },
    ],
  },
  {
    id: "cannabis-tapering",
    name: "Cannabis Tapering Visit",
    visitType: "Follow-up",
    emoji: "\uD83D\uDCC9",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for cannabis tapering/discontinuation visit. Reason for taper: [side effects / patient preference / tolerance / pregnancy planning / employment / resolved indication]. Current regimen: [details]. Duration of use: [months/years]. Prior taper attempts: [success/failure]. Withdrawal symptoms expected: [sleep, irritability, appetite]. Support system: [family, therapy]." },
      { type: "assessment", heading: "Assessment", body: "Patient motivated for [partial reduction / full discontinuation] of cannabis. Risk factors for withdrawal: daily use, high THC, long duration. Original indication: [resolved/ongoing]. Alternative management plan needed for: [pain/sleep/anxiety]." },
      { type: "plan", heading: "Plan", body: "1. Taper schedule: reduce [THC mg] by [25%] every [2 weeks]\n2. CBD may be maintained to ease transition\n3. Symptom management during taper:\n   - Sleep: [sleep hygiene, CBT-I]\n   - Anxiety: [breathing, therapy]\n   - Pain: [multimodal]\n4. Monitor for withdrawal (irritability, insomnia, appetite loss) — peaks day 2-6\n5. Follow-up in 1 week, then biweekly\n6. Crisis plan if increased distress" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR]\nMood/affect: [baseline]\nNo signs of active intoxication\nWithdrawal scale: [if applicable]" },
    ],
  },
  {
    id: "workers-comp-followup",
    name: "Workers' Comp Injury Follow-Up",
    visitType: "Follow-up",
    emoji: "\uD83E\uDE7A",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Workers' comp follow-up. Date of injury: [DOI]. Mechanism: [mechanism]. Body part(s): [parts]. Claim number: [claim#]. Employer: [employer]. Current symptoms: pain [0-10], ROM [limited/full], numbness [yes/no]. Work status: [off work / modified duty / full duty]. Modified restrictions: [list]. PT sessions completed: [number]. Cannabis use: [current regimen]. Functional goals: [return-to-work]." },
      { type: "assessment", heading: "Assessment", body: "[Injury] from work-related event — [improving/stable/worsening]. Current MMI status: [not at MMI / approaching MMI / at MMI]. Impairment rating pending: [yes/no]. Cannabis [appropriate / contraindicated given job safety requirements]. Coordination with case manager: [current]." },
      { type: "plan", heading: "Plan", body: "1. [Continue/adjust] cannabis regimen considering job safety (no safety-sensitive work while using THC)\n2. PT: [continue X sessions]\n3. Imaging: [if indicated]\n4. Work status: [off / modified: specific restrictions / full duty]\n5. Expected duration of restrictions: [weeks]\n6. Coordinate with case manager and employer\n7. Follow-up in [interval]\n8. Work Ability report completed" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR]\nFocused exam: [inspection, palpation, ROM, strength, neuro]\nProvocative tests: [relevant special tests]\nFunctional: [lift, carry, bend]" },
    ],
  },
  // ─── Internal Medicine templates (EMR-468) ───────────────────────
  // Five default IM visit types with structured fields covering problem
  // list, medications, vitals, ROS, and plan. The picker automatically
  // surfaces these alongside the cannabis-medicine templates above.

  {
    id: "im-new-patient",
    name: "IM — New Patient Visit",
    visitType: "New patient",
    emoji: "🩺",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient is a [age]-year-old [sex] establishing primary care. Chief complaint: [reason for visit]. HPI: [duration, character, severity, modifying factors].\n\nPast medical history: [chronic conditions, prior hospitalizations, surgeries].\n\nMedications: [current list with dose + frequency]. Allergies: [list with reaction]. Immunization status: [up-to-date / overdue items].\n\nFamily history: [first-degree relatives — cardiovascular, cancer, diabetes, mental health].\n\nSocial history: tobacco [pack-years], alcohol [drinks/week], substance use [list], occupation [job], living situation, exercise [type/freq], diet [pattern].\n\nReview of systems:\n• Constitutional: [fevers, weight change, fatigue]\n• HEENT: [vision, hearing, dentition]\n• Cardiovascular: [chest pain, palpitations, edema]\n• Respiratory: [cough, dyspnea, wheeze]\n• GI: [appetite, reflux, bowel changes]\n• GU: [urinary symptoms, sexual health]\n• Musculoskeletal: [pain, stiffness, swelling]\n• Neurological: [headache, weakness, numbness]\n• Psychiatric: [mood, sleep, anxiety]\n• Skin: [rashes, lesions, changes]\n• Endocrine: [polyuria, polydipsia, heat/cold]\n• Heme/lymph: [bleeding, lumps]" },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], RR [RR], T [T °F], SpO2 [SpO2 %], Wt [weight], Ht [height], BMI [BMI].\n\nGeneral: [appearance, distress level]\nHEENT: [PERRLA, EOMI, oropharynx, neck]\nCardiovascular: [rate, rhythm, S1S2, murmurs, peripheral pulses]\nLungs: [breath sounds, adventitious sounds]\nAbdomen: [bowel sounds, tenderness, organomegaly]\nMSK: [gait, ROM, deformities]\nNeuro: [CN II-XII, motor 5/5, sensation, reflexes 2+]\nSkin: [color, lesions, turgor]\nPsych: [mood, affect, thought process]" },
      { type: "assessment", heading: "Assessment", body: "Problem list:\n1. [Active problem #1] — [status]\n2. [Active problem #2] — [status]\n3. [Health maintenance gap if present]\n\nClinical impression: [synthesis paragraph linking HPI/exam/risk factors to the active problems and what's driving today's visit]." },
      { type: "plan", heading: "Plan", body: "By problem:\n\n1. [Problem #1]\n   - Diagnostic: [labs/imaging]\n   - Therapeutic: [med adjustments]\n   - Patient education: [topic]\n\n2. [Problem #2]\n   - [same structure]\n\nPreventive care:\n• Vaccines due: [list]\n• Screenings due: [colon, mammo, bone density, etc.]\n• Counseling: [tobacco, alcohol, diet, exercise]\n\nReferrals: [specialty, reason]\nMedication reconciliation: [changes documented]\nFollow-up: [interval]\nPatient portal: lab/result follow-up plan documented." },
    ],
  },

  {
    id: "im-annual-wellness",
    name: "IM — Annual Wellness Visit (AWV)",
    visitType: "Annual",
    emoji: "🪓",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient presents for Medicare/commercial annual wellness visit. Interval history since last AWV: [any new diagnoses, hospitalizations, ER visits, falls, advanced care planning changes].\n\nHealth Risk Assessment completed: [yes/no].\n\nFunctional status:\n• ADLs: [independent / needs assistance — specify]\n• IADLs: [independent / needs assistance — specify]\n• Mobility: [independent / cane / walker / wheelchair]\n• Hearing: [no problems / hearing aids / impaired]\n• Vision: [no problems / corrected / impaired]\n\nDepression screen (PHQ-2/-9): [score, classification]\nCognitive screen (Mini-Cog or similar): [score, classification]\nFall risk screen: [number of falls in past 12 months, gait assessment]\n\nLifestyle:\n• Tobacco: [status]\n• Alcohol: [drinks/week]\n• Diet: [pattern]\n• Physical activity: [minutes/week]\n• Sleep: [hours/night, quality]\n\nAdvance care planning: [POLST, healthcare proxy, prior conversations]." },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], BMI [BMI], waist circumference [cm].\n\nFocused exam appropriate for age/risk:\n• Cardiovascular: [rhythm, murmurs, pulses]\n• Respiratory: [breath sounds]\n• Skin: [skin cancer screen, lesions]\n• MSK: [gait, balance — Timed Up and Go if fall risk]\n• Neuro: [if cognitive screen flagged]" },
      { type: "assessment", heading: "Assessment", body: "Annual wellness assessment.\n\nProblem list reviewed and updated. Health maintenance status:\n• Vaccines: [status — flu, Tdap, shingles, pneumococcal, COVID, RSV]\n• Cancer screening: [colon, breast, cervical, prostate, lung, skin]\n• Cardiovascular screening: [BP, lipids, diabetes, AAA if indicated]\n• Bone health: [DEXA status]\n• Behavioral health: [depression, anxiety, alcohol, tobacco screens]\n\nGaps identified: [list]\nNew problems uncovered today: [if any]." },
      { type: "plan", heading: "Plan", body: "Personalized prevention plan:\n\n1. Address screening gaps:\n   - [Order/refer for each gap]\n2. Vaccines today: [list]\n3. Lifestyle counseling provided: [topics]\n4. Medication reconciliation completed.\n5. Advance care planning: [conversation documented / referral made / forms updated]\n6. Care plan summary handed to patient (CMS requirement for AWV).\n\nFollow-up: [interval — typically annual, sooner if new findings]." },
    ],
  },

  {
    id: "im-chronic-followup",
    name: "IM — Chronic Disease Follow-Up",
    visitType: "Follow-up",
    emoji: "🩼",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Patient returns for [primary condition(s)] follow-up. Interval: [time since last visit].\n\nSymptom diary / patient-reported outcomes since last visit:\n• [Symptom 1]: [trend]\n• [Symptom 2]: [trend]\n\nMedication adherence: [good/fair/poor — specifics]\nSide effects: [list]\nSelf-monitoring: home BP [readings], home glucose [readings], peak flows [if applicable].\n\nLifestyle factors since last visit: diet [change], exercise [change], weight [change], sleep [change], stress [change].\n\nReview of systems pertinent to active problems: [focused ROS]." },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP] (target [target]), HR [HR], BMI [BMI], Wt [weight] (Δ from last visit [delta]).\n\nProblem-focused exam:\n• [Relevant system #1]: [findings]\n• [Relevant system #2]: [findings]\n\nLab/study results reviewed today: [A1c, lipids, BMP, microalbumin, etc. with values and dates].\n\nIn-office tests: [foot exam for diabetes, monofilament, etc.]" },
      { type: "assessment", heading: "Assessment", body: "1. [Chronic problem #1] — [at goal / above goal / worsening]. Target: [target]. Most recent value: [value].\n2. [Chronic problem #2] — [at goal / above goal / worsening].\n3. [Comorbid issue if relevant].\n\nDrivers of any uncontrolled markers: [adherence, lifestyle, intercurrent illness, side effect, etc.]." },
      { type: "plan", heading: "Plan", body: "By problem:\n\n1. [Problem #1]\n   - Continue [med] at [dose] / increase [med] to [dose] / start [med] [dose]\n   - Rationale: [why]\n   - Labs at next visit: [list]\n   - Lifestyle goal for this period: [specific, measurable]\n\n2. [Problem #2]\n   - [same structure]\n\nPreventive care opportunities this visit: [vaccines, screenings]\nReferrals: [specialty, reason]\nPatient education provided: [topic]\nFollow-up: [interval, sooner if new symptoms]\nPatient understands when to seek urgent care: [yes — specific red flags reviewed]." },
    ],
  },

  {
    id: "im-acute-visit",
    name: "IM — Acute Visit",
    visitType: "Acute",
    emoji: "⚡️",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "[Age]-year-old [sex] presents with [chief complaint] x [duration].\n\nHPI:\n• Onset: [sudden / gradual] [time]\n• Location: [where]\n• Duration: [how long]\n• Character: [quality]\n• Aggravating: [factors]\n• Relieving: [factors / what's been tried]\n• Timing: [pattern]\n• Severity: [0-10 / impact on function]\n• Associated symptoms: [list]\n\nPertinent context:\n• Recent travel / exposures: [yes/no]\n• Sick contacts: [yes/no]\n• Recent procedures or new meds: [yes/no]\n• Pregnancy status if applicable: [yes/no/unknown]\n• Anticoagulation: [yes/no]\n\nPertinent past medical history: [conditions that change differential — cardiac, immunocompromised, etc.]\nCurrent medications + allergies confirmed.\n\nFocused ROS: [system-specific positives and pertinent negatives]." },
      { type: "objective", heading: "Objective", body: "Vitals: BP [BP], HR [HR], RR [RR], T [T °F], SpO2 [SpO2 %], pain [0-10].\n\nGeneral: [acute distress / non-toxic / ill-appearing]\nFocused exam by system:\n• [System #1 based on CC]: [detailed findings]\n• [System #2]: [detailed findings]\n• [System #3]: [detailed findings]\n\nIn-office tests / point-of-care: [strep, flu, UA, EKG, blood glucose, etc. with results]." },
      { type: "assessment", heading: "Assessment", body: "[Primary diagnosis or differential]: [reasoning].\n\nDifferential considered: [list with reasoning for/against each].\nRed flag features assessed: [list and rule-in/out].\nClinical decision: [diagnosis confirmed / requires workup / requires escalation]." },
      { type: "plan", heading: "Plan", body: "1. Treatment:\n   - [Medication, dose, duration]\n   - [Non-pharmacologic interventions]\n\n2. Workup if indicated:\n   - [Labs / imaging / referrals]\n\n3. Return precautions reviewed:\n   - Worsening or new [specific symptoms] → ED or call clinic immediately\n\n4. Follow-up:\n   - [Interval] for recheck or sooner PRN\n   - Specific instructions on completing course of treatment\n\n5. Work / school note: [yes/no — duration]\n\n6. Documentation of shared decision-making and verbal teach-back of plan." },
    ],
  },

  {
    id: "im-telehealth-followup",
    name: "IM — Telehealth Follow-Up",
    visitType: "Telehealth",
    emoji: "💻",
    blocks: [
      { type: "subjective", heading: "Subjective", body: "Telehealth follow-up via [audio-video / audio-only] platform. Patient identity verified by [DOB + photo ID / known clinician relationship]. Patient location at start of visit: [state, address as required by state law]. Patient consents to telehealth visit and understands limitations of remote exam.\n\nReason for visit: [follow-up of {condition} / specific concern].\n\nInterval history: [what's changed since last visit].\nMedication adherence + tolerance: [report].\nHome monitoring data: [BP readings, glucose, weight — patient-reported or device-uploaded].\n\nSymptom review: [focused to the follow-up topic]." },
      { type: "objective", heading: "Objective", body: "Visual assessment via video: [general appearance, work of breathing, distress, skin if visible].\nPatient-reported vitals: BP [BP], HR [HR], Wt [weight], home glucose [if applicable].\n\nLimitations of telehealth exam documented: [no hands-on auscultation, palpation, neuro exam]. Components requiring in-person follow-up: [list if any].\n\nIn-platform tools used: [shared screen for lab review, e-prescribe, patient portal walk-through]." },
      { type: "assessment", heading: "Assessment", body: "[Condition] — [stable / improving / worsening] based on history + visual assessment + patient-reported objective data.\n\nClinical judgment that this visit can be completed via telehealth: [yes — rationale / no — in-person scheduling indicated]." },
      { type: "plan", heading: "Plan", body: "1. Medication / treatment plan:\n   - [Continue/adjust] [med, dose, route]\n   - E-prescription sent to [pharmacy] if applicable\n\n2. Labs / studies ordered: [list, where to obtain]\n\n3. Patient education provided via [verbal review / portal message / shared resource link].\n\n4. Return precautions: when to seek in-person care, when to call clinic.\n\n5. Follow-up: [next visit type — in-person vs telehealth — and interval]\n\n6. Telehealth-specific documentation:\n   - Originating site, distant site, modality, consent obtained, duration of visit [min]\n   - CPT codes appropriate to time/MDM" },
    ],
  },
];

export function getTemplate(id: string): NoteTemplate | null {
  return NOTE_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function getAllTemplates(): NoteTemplate[] {
  return [...NOTE_TEMPLATES];
}
