/* LEAFNERD — App shell, router, command bar */
const { useState, useEffect, useCallback } = React;

function Rail({ active, setActive }) {
  const D = window.LN;
  return (
    <nav className="rail">
      <div className="rail-head">
        <span className="brand-mark">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <rect width="30" height="30" rx="8" fill="#1B3025"/>
            <path d="M15 7c-4 0-7 3-7 7 0 4.5 3.5 8 9 8.5C16.5 18 13 15.5 11 14c3 .5 6 2.5 7 6 1.2-1.4 2-3.3 2-5.5C20 10 18 7 15 7z" fill="#6FA52A"/>
            <path d="M15 22.5C15 18 13 15 11 14" stroke="#1B3025" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </span>
        <div>
          <div className="brand-name">Leaf<b>nerd</b></div>
          <div className="rail-sub">FHIR Intelligence</div>
        </div>
      </div>
      <div className="rail-scroll">
        {D.nav.map((grp,gi) => (
          <div key={gi} className="nav-group">
            {grp.group && <div className="nav-group-label">{grp.group}</div>}
            {grp.items.map(it => (
              <div key={it.id} className={`nav-item ${active===it.id?"active":""}`} onClick={()=>setActive(it.id)}>
                <span className="ic"><Icon name={it.icon} size={17} /></span>
                {it.label}
                {it.badge && <span className={`nav-badge ${it.badgeTone==="amber"?"amber":""}`}>{it.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <div className="rail-user">
          <span className="avatar">DR</span>
          <div><div className="nm">Dr. Reyes</div><div className="rl">Population Health Lead</div></div>
        </div>
      </div>
    </nav>
  );
}

function CommandBar() {
  return (
    <header className="cmdbar">
      <div className="search">
        <Icon name="search" size={16} />
        <input placeholder="Search patients, resources, cohorts…" />
        <span className="kbd">⌘K</span>
      </div>
      <div className="cmd-spacer"></div>
      <button className="cmd-ctrl"><Icon name="source" size={15} /><span className="mut">Sources</span><b>4 active</b><Icon name="chevD" size={13} /></button>
      <button className="cmd-ctrl"><Icon name="clock" size={15} /><b>Last 30 days</b><Icon name="chevD" size={13} /></button>
      <span className="fhir-chip"><Icon name="git" size={14} />FHIR R4 · US Core 6.1</span>
      <span className="sync"><span className="dot"></span>Synced 14m</span>
      <button className="ai-btn"><Icon name="spark" size={15} className="spark" />Ask Leafnerd</button>
    </header>
  );
}

function Placeholder({ id }) {
  const titles = {
    patients:"Patients", encounters:"Encounters", observations:"Observations", conditions:"Conditions",
    medications:"Medications", labs:"Labs", claims:"Claims", quality:"Quality measures",
    risk:"Risk stratification", analytics:"Analytics Workbench", admin:"Administration",
  };
  const blurbs = {
    analytics:"Build cohorts, pick measures, and watch trends resolve into exportable insight — select population → measure → trend → anomaly → save.",
    risk:"Stratify the panel by HCC and utilization models, with explainable drivers behind every score.",
    quality:"Track HEDIS & CMS measures with gap lists, provenance, and one-click outreach cohorts.",
  };
  return (
    <div className="page">
      <div className="page-head" style={{ marginBottom:0 }}>
        <div>
          <div className="eyebrow">{titles[id]}</div>
          <h1 className="page-title">{titles[id]}</h1>
        </div>
      </div>
      <div className="empty">
        <div>
          <div className="e-ic"><Icon name="layers" size={28} /></div>
          <h3>{titles[id]} lives here</h3>
          <p>{blurbs[id] || `The ${titles[id]} surface inherits the same aperture pattern — summary insight up top, consumable analytics in the middle, inspectable detail and provenance one click away.`}</p>
          <div className="wrap-gap" style={{ justifyContent:"center" }}>
            <Badge tone="green" dot={false}>Same shell</Badge>
            <Badge tone="indigo" dot={false}>Provenance drawer</Badge>
            <Badge tone="amber" dot={false}>In this prototype: Overview & FHIR Explorer</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiPage({ openDrawer, toast }) {
  const D = window.LN;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Insights</div>
          <h1 className="page-title">A smart analyst, with receipts</h1>
          <p className="page-lede">Every finding shows why it matters, the evidence behind it, a recommended action, and a confidence level. No magic — just traceable reasoning over your FHIR data.</p>
        </div>
        <div className="page-head-actions">
          <button className="cmd-ctrl"><Icon name="filter" size={15} />All types<Icon name="chevD" size={13} /></button>
        </div>
      </div>
      <div className="grid g-3" style={{ marginTop:18 }}>
        {D.insights.map(ins => <InsightCard key={ins.id} ins={ins} onEvidence={openDrawer.insight} toast={toast} />)}
      </div>
      <div className="sec-title"><h2>How Leafnerd reasons</h2></div>
      <div className="grid g-3">
        {[
          {ic:"layers", t:"Grounded in FHIR", d:"Findings cite the exact Observation, Condition, and Encounter resources behind them."},
          {ic:"shield", t:"Confidence, always", d:"Every recommendation carries a calibrated confidence and the baseline it was measured against."},
          {ic:"git", t:"Traceable lineage", d:"Open any insight to walk the lineage from raw source feed to published recommendation."},
        ].map((c,i)=>(
          <div key={i} className="card card-pad">
            <span className="m-ic" style={{ background:"var(--indigo-soft)", color:"var(--indigo)", width:30, height:30 }}><Icon name={c.ic} size={16} /></span>
            <div style={{ fontSize:15, fontWeight:600, marginTop:12 }}>{c.t}</div>
            <div style={{ fontSize:13, color:"var(--ink-2)", lineHeight:1.5, marginTop:6 }}>{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [active, setActive] = useState("overview");
  const [drawer, setDrawer] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(window.__lnT);
    window.__lnT = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const openDrawer = {
    fhir:    r => setDrawer(window.buildDrawer.fhir(r)),
    patient: p => setDrawer(window.buildDrawer.patient(p)),
    metric:  m => setDrawer(window.buildDrawer.metric(m)),
    anomaly: a => setDrawer(window.buildDrawer.anomaly(a)),
    insight: i => setDrawer(window.buildDrawer.insight(i)),
  };

  useEffect(() => { document.querySelector(".content")?.scrollTo(0,0); }, [active]);

  let body;
  if (active === "overview") body = <OverviewPage openDrawer={openDrawer} toast={toast} />;
  else if (active === "fhir") body = <FhirPage openRaw={openDrawer.fhir} toast={toast} />;
  else if (active === "ai") body = <AiPage openDrawer={openDrawer} toast={toast} />;
  else body = <Placeholder id={active} />;

  const fullBleed = active === "fhir";

  return (
    <div className="app">
      <Rail active={active} setActive={setActive} />
      <div className="main">
        <CommandBar />
        <div className="content" style={ fullBleed ? { overflow:"auto", display:"block" } : {} }>
          {body}
        </div>
      </div>
      {drawer && <Drawer payload={drawer} onClose={()=>setDrawer(null)} toast={toast} />}
      <div className={`toast ${toastMsg?"show":""}`}>
        <Icon name="spark" size={15} className="spark" />{toastMsg}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
