/* LEAFNERD — global right drawer (the "aperture") + JSON viewer */
function syntaxJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  const esc = json.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc.replace(/("(\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*(e[+-]?\d+)?/gi,
    (m, str, _i, colon, kw, _n) => {
      if (str !== undefined && colon) return `<span class="k">${str}</span>${colon}`;
      if (str !== undefined) return `<span class="s">${str}</span>`;
      if (kw) return `<span class="b">${kw}</span>`;
      return `<span class="n">${m}</span>`;
    });
}
window.JsonView = function JsonView({ data }) {
  return <pre className="json" dangerouslySetInnerHTML={{ __html: syntaxJSON(data) }} />;
};

function ValItem({ kind, children }) {
  const ic = kind === "ok" ? "check" : kind === "warn" ? "alert" : "x";
  return <div className={`validation-item ${kind}`}><span className="vi-ic"><Icon name={ic} size={15} /></span><div>{children}</div></div>;
}

function ProvSteps({ steps }) {
  return <div style={{ marginTop:4 }}>
    {steps.map((s,i) => (
      <div key={i} className="prov-step">
        <span className="prov-dot"><Icon name={i===steps.length-1 ? "check" : "dot"} size={12} /></span>
        <div><div className="ps-t">{s.t}</div><div className="ps-m">{s.m}</div></div>
      </div>
    ))}
  </div>;
}

window.Drawer = function Drawer({ payload, onClose, toast }) {
  const [tab, setTab] = React.useState(payload.tab || "summary");
  React.useEffect(() => {
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const tabsFor = {
    fhir:    [["summary","Normalized"],["raw","Raw JSON"],["prov","Provenance"],["valid","Validation"]],
    patient: [["summary","Summary"],["prov","Provenance"],["raw","FHIR"]],
    metric:  [["summary","Detail"],["prov","Provenance"]],
    anomaly: [["summary","Detail"],["prov","Provenance"]],
    insight: [["summary","Evidence"],["prov","Lineage"]],
  }[payload.kind] || [["summary","Detail"]];

  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            <div className="dh-tag">{payload.tag}</div>
            <h3>{payload.title}</h3>
            {payload.sub && <div style={{ fontSize:12.5, color:"var(--muted)", marginTop:4, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>{payload.sub}</div>}
          </div>
          <button className="drawer-close" onClick={onClose}><Icon name="x" size={17} /></button>
        </div>
        <div className="drawer-tabs">
          {tabsFor.map(([id,label]) => <div key={id} className={`drawer-tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{label}</div>)}
        </div>
        <div className="drawer-body">
          {payload.render(tab, toast)}
        </div>
      </aside>
    </React.Fragment>
  );
};

/* ---- Drawer payload builders ---- */
window.buildDrawer = {
  fhir(r) {
    return {
      kind:"fhir", tag:`FHIR · ${r.type}`, title:r.label,
      sub:<React.Fragment><Badge tone="indigo" mono dot={false}>{r.type}</Badge><span className="mono" style={{fontSize:11.5,color:"var(--muted)"}}>{r.id}</span><span className="dotsep">·</span>{r.date}</React.Fragment>,
      render(tab) {
        if (tab === "raw") return <JsonView data={r.json} />;
        if (tab === "prov") return <ProvSteps steps={r.provenance} />;
        if (tab === "valid") {
          if (r.valid === "pass") return <React.Fragment>
            <ValItem kind="ok">Conforms to <b>{r.profile}</b> · US Core 6.1</ValItem>
            <ValItem kind="ok">All required elements present</ValItem>
            <ValItem kind="ok">Terminology bindings resolved</ValItem>
          </React.Fragment>;
          if (r.valid === "warn") return <React.Fragment>
            <ValItem kind="ok">Conforms to base FHIR R4 structure</ValItem>
            <ValItem kind="warn">Missing <b>component.code</b> for one blood-pressure reading</ValItem>
            <ValItem kind="ok">Subject reference resolves to known Patient</ValItem>
          </React.Fragment>;
          return <React.Fragment>
            <ValItem kind="err">No recognized coding system on <b>medicationCodeableConcept</b></ValItem>
            <ValItem kind="warn">RxNorm match confidence 0.58 — below 0.80 threshold</ValItem>
            <ValItem kind="ok">Subject & intent are valid</ValItem>
          </React.Fragment>;
        }
        // summary / normalized
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">Normalized view</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Resource</dt><dd>{r.type}</dd>
                <dt>Status</dt><dd><Badge tone={r.status==="active"||r.status==="final"||r.status==="finished"?"green":"gray"} dot={false}>{r.status}</Badge></dd>
                <dt>Patient</dt><dd>{r.patient}</dd>
                <dt>Code</dt><dd className="mono">{r.code}</dd>
                <dt>Effective</dt><dd>{r.date}</dd>
                <dt>Profile</dt><dd>{r.profile}</dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Mapping confidence</div>
            <div className="norm-card" style={{ display:"flex", alignItems:"center", gap:14 }}>
              <Conf value={r.mapping} />
              <span style={{ fontSize:12.5, color:"var(--ink-2)" }}>
                {r.mapping >= .85 ? "High-confidence mapping. Safe for analytics & quality measures."
                  : r.mapping >= .65 ? "Acceptable mapping. Spot-check recommended."
                  : "Below threshold. Excluded from measures until reviewed."}
              </span>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Related resources</div>
            <div className="wrap-gap">
              {r.related.map((x,i) => <button key={i} className="chip"><Icon name="git" size={13} />{x.t}: {x.l}</button>)}
            </div>
          </div>
        </React.Fragment>;
      }
    };
  },
  patient(p) {
    const r = window.LN.fhirResources.find(x => x.type === "Patient") || {};
    return {
      kind:"patient", tag:"Patient intelligence", title:p.name,
      sub:<React.Fragment><span className="mono" style={{fontSize:11.5,color:"var(--muted)"}}>{p.id}</span><span className="dotsep">·</span>{p.age}{p.sex}<span className="dotsep">·</span>{p.cohort}</React.Fragment>,
      render(tab, toast) {
        if (tab === "raw") return <JsonView data={r.json || {resourceType:"Patient",id:p.id}} />;
        if (tab === "prov") return <ProvSteps steps={[
          {t:"Identity resolved", m:`Match engine · ${Math.round(p.match*100)}% confidence`},
          {t:"Sources merged", m:`Primary: ${p.source}`},
          {t:"Risk scored", m:`HCC ${p.hcc.toFixed(2)} + utilization model`},
          {t:"Gaps computed", m:`${p.gaps} open against 9 quality measures`},
        ]} />;
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">AI patient summary</div>
            <div className="norm-card" style={{ background:"var(--sage-tint)", borderColor:"var(--line-sage)" }}>
              <div style={{ fontSize:13.5, lineHeight:1.55, color:"var(--ink)" }}>
                {p.name} is a {p.age}-year-old with <b>{p.cohort}</b>, scored <b>{p.risk.toLowerCase()}</b> risk ({p.score.toFixed(2)}). {p.gaps>0 ? `${p.gaps} open care gap${p.gaps>1?"s":""} including overdue HbA1c. ` : "No open care gaps. "}Last encounter {p.lastEnc} ago.
              </div>
              <div className="m-prov" style={{ marginTop:8 }}><Icon name="spark" size={11} /> Synthesized from {p.source} · 14 resources</div>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Risk & identity</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Risk score</dt><dd><b>{p.score.toFixed(2)}</b> · <RiskBadge risk={p.risk} /></dd>
                <dt>HCC score</dt><dd className="tnum">{p.hcc.toFixed(2)}</dd>
                <dt>Open care gaps</dt><dd>{p.gaps}</dd>
                <dt>Identity match</dt><dd><span style={{display:"inline-flex"}}><Conf value={p.match} /></span></dd>
                <dt>Primary source</dt><dd><Badge tone="green" dot={false}>{p.source}</Badge></dd>
              </dl>
            </div>
          </div>
          <div className="norm-section">
            <div className="nh">Encounter timeline</div>
            <div className="norm-card" style={{ padding:"6px 0" }}>
              {[
                {d:p.lastEnc+" ago", t:"Office visit", s:p.source, m:"final"},
                {d:"6 wk ago", t:"Lab — HbA1c panel", s:"Riverside Lab", m:"final"},
                {d:"3 mo ago", t:"Telehealth follow-up", s:p.source, m:"final"},
              ].map((e,i) => (
                <div key={i} className="prov-step" style={{ padding:"0 16px 16px" }}>
                  <span className="prov-dot" style={{ background:"var(--indigo-soft)", color:"var(--indigo)" }}><Icon name="calendar" size={11} /></span>
                  <div>
                    <div className="ps-t">{e.t}</div>
                    <div className="ps-m">{e.d} · {e.s} · <Badge tone="green" dot={false}>{e.m}</Badge></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="insight-action" style={{ width:"100%", justifyContent:"center" }} onClick={()=>toast("Opening full patient record…")}>
            <Icon name="eye" size={15} />Open full patient view
          </button>
        </React.Fragment>;
      }
    };
  },
  metric(m) {
    return {
      kind:"metric", tag:"Metric provenance", title:m.label,
      sub:<React.Fragment><span className="tnum" style={{fontWeight:600,color:"var(--ink)"}}>{m.value}{m.unit}</span><span className="dotsep">·</span>{m.delta} {m.cmp}</React.Fragment>,
      render(tab) {
        if (tab === "prov") return <ProvSteps steps={[
          {t:"Source resources queried", m:`Source: ${m.prov}`},
          {t:"Aggregated", m:"Nightly batch · 02:00 UTC"},
          {t:"Compared to baseline", m:"Trailing 30-day window"},
          {t:"Published", m:"Refreshed 14 min ago"},
        ]} />;
        return <React.Fragment>
          <div className="norm-section">
            <div className="nh">Trend</div>
            <div className="norm-card"><AreaChart data={m.spark} w={400} h={150} color="var(--c-canopy)" /></div>
          </div>
          <div className="norm-section">
            <div className="nh">What this means</div>
            <div className="norm-card"><div style={{ fontSize:13.5, lineHeight:1.55 }}>{m.insight}</div>
            <div className="m-prov" style={{ marginTop:8 }}><Icon name="layers" size={11} /> Source: {m.prov}</div></div>
          </div>
        </React.Fragment>;
      }
    };
  },
  anomaly(a) {
    return {
      kind:"anomaly", tag:"Anomaly detail", title:a.title,
      sub:<React.Fragment><Badge tone={a.sev==="high"?"rose":a.sev==="med"?"amber":"gray"} dot={false}>{a.sev} severity</Badge><span className="dotsep">·</span>{a.when}</React.Fragment>,
      render(tab, toast) {
        if (tab === "prov") return <ProvSteps steps={[
          {t:"Detected", m:`Source: ${a.source} · ${a.when}`},
          {t:"Baseline compared", m:`Confidence ${Math.round(a.confidence*100)}%`},
          {t:"Flagged for review", m:"Routed to integration queue"},
        ]} />;
        return <React.Fragment>
          <div className="norm-section"><div className="nh">Detail</div>
            <div className="norm-card"><div style={{ fontSize:13.5, lineHeight:1.55 }}>{a.detail}</div></div></div>
          <div className="norm-section"><div className="nh">Signal</div>
            <div className="norm-card"><dl className="kv">
              <dt>Resource</dt><dd><Badge tone="indigo" mono dot={false}>{a.source}</Badge></dd>
              <dt>Detection conf.</dt><dd><span style={{display:"inline-flex"}}><Conf value={a.confidence} /></span></dd>
              <dt>First seen</dt><dd>{a.when}</dd>
            </dl></div></div>
          <button className="insight-action" style={{ width:"100%", justifyContent:"center" }} onClick={()=>toast("Incident opened · integration team notified")}>
            <Icon name="bolt" size={15} />Open incident
          </button>
        </React.Fragment>;
      }
    };
  },
  insight(ins) {
    return {
      kind:"insight", tag:"AI insight · receipts", title:ins.finding,
      sub:<React.Fragment><Badge tone={ins.conf>=.85?"green":"amber"} dot={false}>{ins.confidence} confidence</Badge><span className="dotsep">·</span>{Math.round(ins.conf*100)}%</React.Fragment>,
      render(tab, toast) {
        if (tab === "prov") return <ProvSteps steps={[
          {t:"Signals gathered", m:ins.source},
          {t:"Model reasoning", m:"Cohort comparison vs. 90-day baseline"},
          {t:"Evidence assembled", m:`${ins.evidence.length} resource groups`},
          {t:"Recommendation ranked", m:`Impact-scored · action affects ${ins.actionCount}`},
        ]} />;
        return <React.Fragment>
          <div className="norm-section"><div className="nh">Why it matters</div>
            <div className="norm-card"><div style={{ fontSize:13.5, lineHeight:1.55 }}>{ins.why}</div></div></div>
          <div className="norm-section"><div className="nh">Evidence ({ins.evidence.length})</div>
            <div className="norm-card"><div className="wrap-gap">{ins.evidence.map((e,i)=><Badge key={i} tone="indigo" mono dot={false}>{e}</Badge>)}</div>
            <div className="m-prov" style={{ marginTop:10 }}><Icon name="layers" size={11} /> {ins.source}</div></div></div>
          <div className="norm-section"><div className="nh">Recommended action</div>
            <button className="insight-action" style={{ width:"100%", justifyContent:"center" }} onClick={()=>toast(`Queued: ${ins.action}`)}>
              <Icon name="bolt" size={15} />{ins.action}
            </button></div>
        </React.Fragment>;
      }
    };
  },
};
