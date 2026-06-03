/* LEAFNERD — shared widgets: InsightCard, PatientTable, RiskBadge */
function RiskBadge({ risk }) {
  const map = { Critical:"rose", High:"rose", Moderate:"amber", Low:"green" };
  return <Badge tone={map[risk] || "gray"}>{risk}</Badge>;
}
window.RiskBadge = RiskBadge;

window.InsightCard = function InsightCard({ ins, onEvidence, toast }) {
  const kindMap = {
    risk:    { ic:"pulse", bg:"var(--rose-soft)",   fg:"var(--rose)",   label:"Risk signal" },
    quality: { ic:"check", bg:"var(--canopy-soft)", fg:"var(--canopy)", label:"Quality opportunity" },
    data:    { ic:"layers",bg:"var(--indigo-soft)", fg:"var(--indigo)", label:"Data integrity" },
  };
  const k = kindMap[ins.kind];
  const confTone = ins.conf >= 0.85 ? "green" : ins.conf >= 0.7 ? "amber" : "gray";
  return (
    <div className="card lift insight">
      <div className="insight-head">
        <span className="insight-kind" style={{ background:k.bg, color:k.fg }}><Icon name={k.ic} size={16} /></span>
        <span className="t">{k.label}</span>
        <span style={{ marginLeft:"auto" }}><Badge tone={confTone} dot={false}>{ins.confidence} confidence</Badge></span>
      </div>
      <div className="insight-body">
        <p className="insight-finding">{ins.finding}</p>
        <div className="insight-row">
          <span className="lbl">Why it matters</span>
          <span className="val">{ins.why}</span>
        </div>
        <div className="insight-row">
          <span className="lbl">Evidence</span>
          <span className="val">
            <div className="evidence-pills">
              {ins.evidence.map((e,i) => <Badge key={i} tone="gray" mono dot={false}>{e}</Badge>)}
            </div>
          </span>
        </div>
      </div>
      <div className="insight-foot">
        <button className="insight-action" onClick={() => toast(`Queued: ${ins.action}`)}>
          <Icon name="bolt" size={14} />{ins.action}
        </button>
        <span className="dismiss" onClick={() => onEvidence(ins)}>Show receipts</span>
      </div>
    </div>
  );
};

window.PatientTable = function PatientTable({ patients, onOpen }) {
  const [dense, setDense] = React.useState(false);
  const [sort, setSort] = React.useState({ key:"score", dir:-1 });
  const sorted = [...patients].sort((a,b) => {
    const av = a[sort.key], bv = b[sort.key];
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
  });
  const setSortKey = k => setSort(s => s.key === k ? { key:k, dir:-s.dir } : { key:k, dir:-1 });
  const caret = k => sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "↕";
  const cols = [
    { k:"name", t:"Patient" }, { k:"cohort", t:"Cohort" }, { k:"risk", t:"Risk" },
    { k:"score", t:"Risk score", num:true }, { k:"hcc", t:"HCC", num:true },
    { k:"gaps", t:"Care gaps", num:true }, { k:"source", t:"Source" },
    { k:"match", t:"Identity", num:true }, { k:"lastEnc", t:"Last enc." },
  ];
  return (
    <div className="tbl-wrap">
      <div className="tbl-tools">
        <button className="chip on">Risk ≥ Moderate <span className="x">×</span></button>
        <button className="chip"><Icon name="plus" size={13} />Add filter</button>
        <div style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:11.5, color:"var(--muted)" }}>Density</span>
          <div className="density-toggle">
            <button className={!dense?"on":""} onClick={()=>setDense(false)}>Comfortable</button>
            <button className={dense?"on":""} onClick={()=>setDense(true)}>Compact</button>
          </div>
          <button className="cmd-ctrl" style={{ height:30 }}><Icon name="download" size={14} />Export</button>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className={`tbl ${dense?"dense":""}`}>
          <thead>
            <tr>
              {cols.map(c => <th key={c.k} onClick={()=>setSortKey(c.k)} style={{ textAlign:c.num?"right":"left" }}>
                {c.t}<span className="sortcaret">{caret(c.k)}</span>
              </th>)}
              <th style={{ width:32 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id} onClick={()=>onOpen(p)}>
                <td>
                  <div className="pt-name">{p.name}</div>
                  <div className="pt-id">{p.id} · {p.age}{p.sex}</div>
                </td>
                <td><span style={{ fontSize:12.5, color:"var(--ink-2)" }}>{p.cohort}</span></td>
                <td><RiskBadge risk={p.risk} /></td>
                <td style={{ textAlign:"right" }} className="tnum"><b style={{ fontWeight:600 }}>{p.score.toFixed(2)}</b></td>
                <td style={{ textAlign:"right" }} className="tnum">{p.hcc.toFixed(2)}</td>
                <td style={{ textAlign:"right" }} className="tnum">{p.gaps>0 ? <span style={{ color: p.gaps>=3?"var(--amber)":"var(--ink)" }}>{p.gaps}</span> : <span className="muted">0</span>}</td>
                <td><Badge tone={p.source==="EHR"?"green":p.source==="Claims"?"indigo":p.source==="Wearable"?"amber":"gray"} dot={false}>{p.source}</Badge></td>
                <td style={{ textAlign:"right" }}><div style={{ display:"inline-flex" }}><Conf value={p.match} showPct={false} /></div></td>
                <td><span className="muted" style={{ fontSize:12.5 }}>{p.lastEnc} ago</span></td>
                <td><span className="row-action"><Icon name="chevR" size={15} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
