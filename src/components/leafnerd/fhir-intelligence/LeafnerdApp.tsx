"use client";
/* LEAFNERD — SPA shell: rail + command bar + surface router + drawer + toast */
import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "./primitives";
import { Rail } from "./Rail";
import { CommandBar } from "./CommandBar";
import { Placeholder } from "./Placeholder";
import { Drawer, buildDrawer } from "./Drawer";
import type { DrawerPayload } from "./Drawer";
import { AiInsightsSurface } from "./AiInsights";
import { OverviewSurface } from "./Overview";
import { FhirExplorerSurface } from "./FhirExplorer";
import { CohortSurface } from "./CohortSurface";
import { ClaimsSurface } from "./ClaimsSurface";
import { PatientsSurface } from "./PatientsSurface";
import { EncountersSurface } from "./EncountersSurface";
import { ObservationsSurface } from "./ObservationsSurface";
import { ConditionsSurface } from "./ConditionsSurface";
import { MedicationsSurface } from "./MedicationsSurface";
import { LabsSurface } from "./LabsSurface";
import { QualitySurface } from "./QualitySurface";
import { AnalyticsSurface } from "./AnalyticsSurface";
import { AdminSurface } from "./AdminSurface";
import { RiskSurface } from "./RiskSurface";
import { AskLeafnerdPanel } from "./AskLeafnerdPanel";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type {
  LeafnerdAppProps,
  FhirResource,
  PatientRow,
  Metric,
  Anomaly,
  Insight,
} from "@/lib/leafnerd/types";

export function LeafnerdApp(props: LeafnerdAppProps) {
  const data = props.data ?? DEMO_DATA;
  const clinical = props.clinical;

  const [active, setActive] = useState("overview");
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  // ⌘K / Ctrl-K opens "Ask Leafnerd".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openDrawer = {
    fhir: (r: FhirResource) => setDrawer(buildDrawer.fhir(r)),
    patient: (p: PatientRow) => setDrawer(buildDrawer.patient(p, data)),
    metric: (m: Metric) => setDrawer(buildDrawer.metric(m)),
    anomaly: (a: Anomaly) => setDrawer(buildDrawer.anomaly(a)),
    insight: (i: Insight) => setDrawer(buildDrawer.insight(i)),
  };

  // Generic drawer opener for the clinical list surfaces — they build their own payload.
  const openRecord = (payload: DrawerPayload) => setDrawer(payload);

  useEffect(() => { document.querySelector(".content")?.scrollTo(0, 0); }, [active]);

  let body;
  if (active === "overview") body = <OverviewSurface data={data} openDrawer={openDrawer} toast={toast} />;
  else if (active === "fhir") body = <FhirExplorerSurface data={data} toast={toast} />;
  else if (active === "ai") body = <AiInsightsSurface data={data} openDrawer={openDrawer} toast={toast} />;
  else if (active === "claims") body = <ClaimsSurface anomalies={props.claims} />;
  else if (active === "risk") body = <RiskSurface patients={clinical?.patients ?? data.patients} openDrawer={openDrawer} toast={toast} />;
  else if (active === "simulator") body = <CohortSurface statusCounts={props.cohortStatusCounts} />;
  else if (active === "analytics") body = <AnalyticsSurface toast={toast} />;
  else if (active === "quality") body = <QualitySurface rows={props.quality} toast={toast} />;
  else if (active === "patients") body = <PatientsSurface rows={clinical?.patients} openDrawer={openDrawer} toast={toast} />;
  else if (active === "encounters") body = <EncountersSurface rows={clinical?.encounters} openRecord={openRecord} toast={toast} />;
  else if (active === "observations") body = <ObservationsSurface rows={clinical?.observations} openRecord={openRecord} toast={toast} />;
  else if (active === "conditions") body = <ConditionsSurface rows={clinical?.conditions} openRecord={openRecord} toast={toast} />;
  else if (active === "medications") body = <MedicationsSurface rows={clinical?.medications} openRecord={openRecord} />;
  else if (active === "labs") body = <LabsSurface rows={clinical?.labs} openRecord={openRecord} />;
  else if (active === "admin") body = <AdminSurface toast={toast} openRecord={openRecord} />;
  else body = <Placeholder id={active} />;

  const fullBleed = active === "fhir" || active === "claims" || active === "simulator";

  return (
    <div className="ln-root">
      <div className="app">
        <Rail nav={data.nav} active={active} setActive={setActive} userName={props.userName} />
        <div className="main">
          <CommandBar onAsk={() => setAskOpen(true)} onSources={() => setActive("admin")} toast={toast} />
          <div className="content" style={fullBleed ? { overflow: "auto", display: "block" } : {}}>
            {body}
          </div>
        </div>
        {drawer && <Drawer payload={drawer} onClose={() => setDrawer(null)} toast={toast} />}
        <AskLeafnerdPanel open={askOpen} onClose={() => setAskOpen(false)} />
        <div className={`toast ${toastMsg ? "show" : ""}`}>
          <Icon name="spark" size={15} className="spark" />{toastMsg}
        </div>
      </div>
    </div>
  );
}

export default LeafnerdApp;
