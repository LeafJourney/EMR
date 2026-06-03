/* LEAFNERD — mock data (de-identified, plausible clinical shapes) */
window.LN = (function () {

  /* ---- Executive metrics ---- */
  const metrics = [
    { id:"patients", label:"Active patients", value:"48,210", unit:"", icon:"users", tone:"green",
      delta:"+3.1%", dir:"up", cmp:"vs. last 30d",
      insight:"Panel grew by 1,440 after onboarding Northbay Clinic's roster on May 18.",
      prov:"Patient · Coverage", spark:[38,40,41,40,43,45,44,47,48,48] },
    { id:"completeness", label:"Data completeness", value:"92.4", unit:"%", icon:"shield", tone:"green",
      delta:"+1.8 pts", dir:"up", cmp:"vs. last 30d",
      insight:"Demographics and encounters near-complete; social history remains the weakest domain at 61%.",
      prov:"7 domains scored", spark:[86,87,88,88,89,90,90,91,92,92] },
    { id:"mapping", label:"FHIR mapping health", value:"87.6", unit:"%", icon:"git", tone:"amber",
      delta:"-2.4 pts", dir:"down", cmp:"vs. last 30d",
      insight:"New Northbay feed introduced 312 unmapped MedicationRequest codes pending review.",
      prov:"R4 · US Core 6.1", spark:[91,90,91,89,90,88,89,88,87,87] },
    { id:"caregaps", label:"Open care gaps", value:"2,847", unit:"", icon:"target", tone:"amber",
      delta:"-6.0%", dir:"up", cmp:"closing", good:true,
      insight:"HbA1c overdue accounts for 38% of open gaps; outreach closed 184 this week.",
      prov:"Quality measures · 9", spark:[31,30,30,29,30,29,28,29,28,28] },
    { id:"risk", label:"High-risk cohort", value:"1,206", unit:"", icon:"pulse", tone:"rose",
      delta:"+42", dir:"down", cmp:"new this week",
      insight:"Rising-risk diabetes sub-cohort drove the increase; 42 patients newly crossed threshold.",
      prov:"HCC + utilization model", spark:[112,114,113,116,115,118,117,119,120,121] },
  ];

  /* ---- Anomalies (recent) ---- */
  const anomalies = [
    { id:"a1", sev:"high", title:"Lab Observation volume dropped 41% from Riverside Lab",
      when:"2h ago", detail:"Expected ~1,200/day, received 710 on Jun 1. Possible interface outage.",
      source:"Observation", confidence:0.91 },
    { id:"a2", sev:"med", title:"312 MedicationRequest codes unmapped after Northbay onboarding",
      when:"6h ago", detail:"RxNorm mapping confidence below 0.6 for new source vocabulary.",
      source:"MedicationRequest", confidence:0.84 },
    { id:"a3", sev:"med", title:"Encounter discharge timestamps missing for 4.2% of records",
      when:"yesterday", detail:"Period.end absent on inpatient encounters from Source: HL7v2 feed.",
      source:"Encounter", confidence:0.77 },
    { id:"a4", sev:"low", title:"Duplicate Patient identities flagged by match engine",
      when:"yesterday", detail:"58 candidate pairs above 0.85 similarity awaiting steward review.",
      source:"Patient", confidence:0.88 },
  ];

  /* ---- Top operational opportunities ---- */
  const opportunities = [
    { id:"o1", title:"Close 184 HbA1c care gaps before quarter end", impact:"+0.6 pts on HEDIS CDC", effort:"Low", value:92 },
    { id:"o2", title:"Re-map Northbay medication vocabulary", impact:"Restores 312 records to mapped", effort:"Medium", value:78 },
    { id:"o3", title:"Outreach to 42 newly rising-risk diabetics", impact:"Avoid ~$310K ED utilization", effort:"Medium", value:74 },
    { id:"o4", title:"Resolve 58 duplicate patient identities", impact:"Improves panel accuracy", effort:"Low", value:61 },
  ];

  /* ---- Data freshness (24 hourly buckets) ---- */
  const freshness = [62,70,74,80,78,84,90,96,99,97,94,92,88,90,86,40,44,70,82,88,91,93,95,90]
    .map((v,i)=>({h:i, v, state: v<50?"gap": v<75?"stale":"ok"}));

  /* ---- Completeness by domain ---- */
  const domains = [
    { name:"Demographics", pct:99 }, { name:"Encounters", pct:96 }, { name:"Conditions", pct:94 },
    { name:"Medications", pct:88 }, { name:"Lab results", pct:90 }, { name:"Vitals", pct:85 },
    { name:"Social history", pct:61 },
  ];

  /* ---- High-risk patient table ---- */
  const patients = [
    { name:"Marcus Delgado", id:"PT-40291", age:67, sex:"M", risk:"Critical", score:0.94, hcc:4.21, gaps:3, cohort:"CHF · CKD", lastEnc:"3d", source:"EHR", match:0.99 },
    { name:"Yuki Tanaka", id:"PT-39114", age:58, sex:"F", risk:"High", score:0.81, hcc:2.88, gaps:2, cohort:"Diabetes", lastEnc:"11d", source:"EHR", match:0.97 },
    { name:"Priya Nair", id:"PT-41003", age:72, sex:"F", risk:"High", score:0.79, hcc:3.10, gaps:4, cohort:"COPD", lastEnc:"6d", source:"Claims", match:0.86 },
    { name:"Andre Boucher", id:"PT-38820", age:61, sex:"M", risk:"High", score:0.77, hcc:2.41, gaps:1, cohort:"Diabetes · HTN", lastEnc:"19d", source:"EHR", match:0.95 },
    { name:"Sofia Romano", id:"PT-40550", age:69, sex:"F", risk:"Moderate", score:0.63, hcc:1.92, gaps:2, cohort:"CKD", lastEnc:"4d", source:"EHR", match:0.92 },
    { name:"Hassan Ali", id:"PT-41277", age:54, sex:"M", risk:"Moderate", score:0.58, hcc:1.55, gaps:3, cohort:"Diabetes", lastEnc:"22d", source:"Wearable", match:0.71 },
    { name:"Grace Okoro", id:"PT-39902", age:63, sex:"F", risk:"Moderate", score:0.55, hcc:1.40, gaps:1, cohort:"HTN", lastEnc:"8d", source:"EHR", match:0.96 },
    { name:"Daniel Kim", id:"PT-40788", age:60, sex:"M", risk:"Moderate", score:0.52, hcc:1.33, gaps:0, cohort:"Obesity", lastEnc:"31d", source:"Claims", match:0.83 },
  ];

  /* ---- AI insights ---- */
  const insights = [
    { id:"i1", kind:"risk",
      finding:"Medication adherence risk is elevated in the diabetes cohort",
      why:"This cohort shows 22% higher ED utilization and incomplete follow-up encounters over the last 90 days.",
      evidence:["MedicationRequest ×312","Encounter ×1,044","Observation: HbA1c ×640"],
      action:"Review 42 patients with missing refill events",
      actionCount:42, confidence:"High", conf:0.88,
      source:"Diabetes cohort · n=3,210 · refreshed 2h ago" },
    { id:"i2", kind:"quality",
      finding:"HbA1c testing gap is concentrated in 3 primary care sites",
      why:"Northbay, Riverside, and Cedar account for 71% of overdue HbA1c despite holding 44% of the panel.",
      evidence:["Quality measure: CDC","Encounter ×2,180","Observation gaps ×1,083"],
      action:"Generate outreach list for 184 reachable patients",
      actionCount:184, confidence:"High", conf:0.91,
      source:"HEDIS CDC measure · refreshed today" },
    { id:"i3", kind:"data",
      finding:"Riverside Lab interface likely dropped overnight",
      why:"Observation throughput fell 41% against a stable 30-day baseline, isolated to one source endpoint.",
      evidence:["Observation throughput","Source: Riverside HL7v2","Baseline ×30d"],
      action:"Open interface incident & notify integration team",
      actionCount:1, confidence:"Medium", conf:0.74,
      source:"Ingestion monitor · 710 of ~1,200 expected" },
  ];

  /* ---- FHIR Explorer resources ---- */
  const fhirResources = [
    { id:"obs-1", type:"Observation", label:"HbA1c 8.2%", patient:"Marcus Delgado", status:"final",
      mapping:0.98, valid:"pass", profile:"US Core Laboratory Result",
      code:"4548-4 · Hemoglobin A1c/Hemoglobin.total", date:"2026-05-28",
      json:{
        resourceType:"Observation", id:"obs-1", status:"final",
        category:[{coding:[{system:"http://terminology.hl7.org/CodeSystem/observation-category",code:"laboratory",display:"Laboratory"}]}],
        code:{coding:[{system:"http://loinc.org",code:"4548-4",display:"Hemoglobin A1c/Hemoglobin.total in Blood"}],text:"HbA1c"},
        subject:{reference:"Patient/PT-40291",display:"Marcus Delgado"},
        effectiveDateTime:"2026-05-28T09:14:00Z",
        valueQuantity:{value:8.2,unit:"%",system:"http://unitsofmeasure.org",code:"%"},
        interpretation:[{coding:[{code:"H",display:"High"}]}],
        performer:[{reference:"Organization/riverside-lab",display:"Riverside Lab"}]
      },
      related:[{t:"Patient",l:"Marcus Delgado"},{t:"Encounter",l:"Office visit · 05-28"},{t:"DiagnosticReport",l:"Comprehensive metabolic"}],
      provenance:[
        {t:"Recorded at source", m:"Riverside Lab · HL7v2 ORU · 2026-05-28 09:16"},
        {t:"Ingested", m:"Leafnerd pipeline · 2026-05-28 09:31"},
        {t:"Mapped to FHIR R4", m:"LOINC 4548-4 · confidence 0.98"},
        {t:"Validated", m:"US Core 6.1 · 0 errors"},
      ] },
    { id:"obs-2", type:"Observation", label:"Blood pressure 148/92", patient:"Andre Boucher", status:"final",
      mapping:0.96, valid:"warn", profile:"US Core Blood Pressure",
      code:"85354-9 · Blood pressure panel", date:"2026-05-30",
      json:{resourceType:"Observation",id:"obs-2",status:"final",code:{text:"Blood pressure"},subject:{reference:"Patient/PT-38820"},valueString:"148/92 mmHg"},
      related:[{t:"Patient",l:"Andre Boucher"},{t:"Encounter",l:"Telehealth · 05-30"}],
      provenance:[{t:"Recorded at source",m:"Northbay EHR · 2026-05-30"},{t:"Ingested",m:"2026-05-30 14:02"},{t:"Mapped to FHIR R4",m:"confidence 0.96"},{t:"Validated",m:"1 warning · missing component code"}] },
    { id:"cond-1", type:"Condition", label:"Type 2 diabetes mellitus", patient:"Marcus Delgado", status:"active",
      mapping:0.99, valid:"pass", profile:"US Core Condition",
      code:"44054006 · SNOMED CT", date:"2024-03-11",
      json:{resourceType:"Condition",id:"cond-1",clinicalStatus:{coding:[{code:"active"}]},code:{coding:[{system:"http://snomed.info/sct",code:"44054006",display:"Type 2 diabetes mellitus"}]},subject:{reference:"Patient/PT-40291"}},
      related:[{t:"Patient",l:"Marcus Delgado"},{t:"MedicationRequest",l:"Metformin 1000mg"}],
      provenance:[{t:"Recorded at source",m:"Northbay EHR · problem list"},{t:"Ingested",m:"2024-03-11"},{t:"Mapped to FHIR R4",m:"SNOMED 44054006 · 0.99"},{t:"Validated",m:"0 errors"}] },
    { id:"med-1", type:"MedicationRequest", label:"Metformin 1000mg", patient:"Marcus Delgado", status:"active",
      mapping:0.58, valid:"err", profile:"US Core MedicationRequest",
      code:"unmapped · local vocab 'MTF1000'", date:"2026-05-12",
      json:{resourceType:"MedicationRequest",id:"med-1",status:"active",intent:"order",medicationCodeableConcept:{text:"MTF1000",coding:[]},subject:{reference:"Patient/PT-40291"}},
      related:[{t:"Patient",l:"Marcus Delgado"},{t:"Condition",l:"Type 2 diabetes"}],
      provenance:[{t:"Recorded at source",m:"Northbay EHR · local code MTF1000"},{t:"Ingested",m:"2026-05-12"},{t:"Mapping attempted",m:"RxNorm match 0.58 — below threshold"},{t:"Validation failed",m:"1 error · no recognized coding system"}] },
    { id:"enc-1", type:"Encounter", label:"Office visit", patient:"Yuki Tanaka", status:"finished",
      mapping:0.94, valid:"pass", profile:"US Core Encounter",
      code:"AMB · ambulatory", date:"2026-05-22",
      json:{resourceType:"Encounter",id:"enc-1",status:"finished",class:{code:"AMB",display:"ambulatory"},subject:{reference:"Patient/PT-39114"},period:{start:"2026-05-22T10:00:00Z",end:"2026-05-22T10:25:00Z"}},
      related:[{t:"Patient",l:"Yuki Tanaka"},{t:"Observation",l:"HbA1c 7.1%"}],
      provenance:[{t:"Recorded at source",m:"Cedar Clinic EHR"},{t:"Ingested",m:"2026-05-22"},{t:"Mapped to FHIR R4",m:"0.94"},{t:"Validated",m:"0 errors"}] },
    { id:"pat-1", type:"Patient", label:"Marcus Delgado", patient:"Marcus Delgado", status:"active",
      mapping:0.99, valid:"pass", profile:"US Core Patient",
      code:"MRN 40291 · identity 0.99", date:"2024-01-02",
      json:{resourceType:"Patient",id:"PT-40291",identifier:[{system:"urn:mrn",value:"40291"}],name:[{family:"Delgado",given:["Marcus"]}],gender:"male",birthDate:"1958-07-19"},
      related:[{t:"Coverage",l:"Medicare Advantage"},{t:"Condition",l:"3 active"}],
      provenance:[{t:"Identity resolved",m:"Match engine · 2 sources merged · 0.99"},{t:"Ingested",m:"2024-01-02"},{t:"Mapped to FHIR R4",m:"0.99"},{t:"Validated",m:"0 errors"}] },
  ];

  /* counts for tree groups */
  const fhirCounts = { Patient:48210, Encounter:214880, Observation:1840221, Condition:98442, MedicationRequest:142300, DiagnosticReport:64110, Coverage:51200 };

  /* navigation */
  const nav = [
    { group:null, items:[ {id:"overview", label:"Overview", icon:"grid"} ] },
    { group:"Clinical", items:[
      {id:"patients", label:"Patients", icon:"users"},
      {id:"encounters", label:"Encounters", icon:"calendar"},
      {id:"observations", label:"Observations", icon:"activity"},
      {id:"conditions", label:"Conditions", icon:"clipboard"},
      {id:"medications", label:"Medications", icon:"pill"},
      {id:"labs", label:"Labs", icon:"flask"},
      {id:"claims", label:"Claims", icon:"receipt"},
    ]},
    { group:"Intelligence", items:[
      {id:"quality", label:"Quality", icon:"check"},
      {id:"risk", label:"Risk", icon:"pulse", badge:"42", badgeTone:"rose"},
      {id:"analytics", label:"Analytics", icon:"chart"},
      {id:"ai", label:"AI Insights", icon:"spark", badge:"3", badgeTone:"amber"},
    ]},
    { group:"Data", items:[
      {id:"fhir", label:"FHIR Explorer", icon:"git"},
      {id:"admin", label:"Admin", icon:"gear"},
    ]},
  ];

  return { metrics, anomalies, opportunities, freshness, domains, patients, insights, fhirResources, fhirCounts, nav };
})();
