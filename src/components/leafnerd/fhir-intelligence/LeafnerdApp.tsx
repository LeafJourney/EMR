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

  const [active, setActive] = useState("overview");
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const openDrawer = {
    fhir: (r: FhirResource) => setDrawer(buildDrawer.fhir(r)),
    patient: (p: PatientRow) => setDrawer(buildDrawer.patient(p, data)),
    metric: (m: Metric) => setDrawer(buildDrawer.metric(m)),
    anomaly: (a: Anomaly) => setDrawer(buildDrawer.anomaly(a)),
    insight: (i: Insight) => setDrawer(buildDrawer.insight(i)),
  };

  useEffect(() => { document.querySelector(".content")?.scrollTo(0, 0); }, [active]);

  let body;
  if (active === "overview") body = <OverviewSurface data={data} openDrawer={openDrawer} toast={toast} />;
  else if (active === "fhir") body = <FhirExplorerSurface data={data} toast={toast} />;
  else if (active === "ai") body = <AiInsightsSurface data={data} openDrawer={openDrawer} toast={toast} />;
  else if (active === "claims") body = <ClaimsSurface anomalies={props.claims} />;
  else if (active === "risk" || active === "analytics") body = <CohortSurface statusCounts={props.cohortStatusCounts} />;
  else body = <Placeholder id={active} />;

  const fullBleed = active === "fhir" || active === "claims" || active === "risk" || active === "analytics";

  return (
    <div className="ln-root">
      <div className="app">
        <Rail nav={data.nav} active={active} setActive={setActive} userName={props.userName} />
        <div className="main">
          <CommandBar />
          <div className="content" style={fullBleed ? { overflow: "auto", display: "block" } : {}}>
            {body}
          </div>
        </div>
        {drawer && <Drawer payload={drawer} onClose={() => setDrawer(null)} toast={toast} />}
        <div className={`toast ${toastMsg ? "show" : ""}`}>
          <Icon name="spark" size={15} className="spark" />{toastMsg}
        </div>
      </div>
    </div>
  );
}

export default LeafnerdApp;
