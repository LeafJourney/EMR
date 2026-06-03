"use client";
/* LEAFNERD — FHIR Explorer (split pane) */
import React from "react";
import { Icon, Badge, Conf } from "./primitives";
import { JsonView, ProvSteps, ValItem } from "./Drawer";
import { DEMO_DATA } from "@/lib/leafnerd/analytics";
import type { LeafnerdData } from "@/lib/leafnerd/types";

export function FhirExplorerSurface({ data = DEMO_DATA, toast }: { data?: LeafnerdData; toast: (m: string) => void }) {
  const D = data;
  const [activeId, setActiveId] = React.useState(D.fhirResources[0].id);
  const [rtab, setRtab] = React.useState("raw");
  const r = D.fhirResources.find(x => x.id === activeId)!;

  // group resources by type for the tree
  const groups: Record<string, typeof D.fhirResources> = {};
  D.fhirResources.forEach(x => { (groups[x.type] = groups[x.type] || []).push(x); });
  const typeOrder = ["Patient", "Condition", "Observation", "MedicationRequest", "Encounter"];
  const validTone: Record<string, string> = { pass: "green", warn: "amber", err: "rose" };

  return (
    <div className="explorer">
      {/* LEFT — resource tree */}
      <div className="exp-pane exp-left">
        <div className="exp-pane-head">
          <div className="t">Resource tree</div>
          <div className="search" style={{ width: "auto", marginTop: 10, padding: "6px 10px" }}>
            <Icon name="search" size={14} /><input placeholder="Filter resources…" />
          </div>
        </div>
        {typeOrder.filter(t => groups[t]).map(type => (
          <div key={type} className="tree-group">
            <div className="tree-grp-label">
              <Icon name="chevD" size={12} />{type}
              <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontWeight: 400 }}>{(D.fhirCounts[type] || groups[type].length).toLocaleString()}</span>
            </div>
            {groups[type].map(x => (
              <div key={x.id} className={`tree-item ${x.id === activeId ? "active" : ""}`} onClick={() => setActiveId(x.id)}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: `var(--${x.valid === "pass" ? "canopy" : x.valid === "warn" ? "amber" : "rose"})` }}
                  className="dotc"></span>
                <span className="lbl">{x.label}</span>
                <span className="rtype">{Math.round(x.mapping * 100)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* CENTER — normalized human-readable */}
      <div className="exp-pane exp-center">
        <div className="exp-pane-head" style={{ background: "var(--cream)" }}>
          <div className="between">
            <div className="t">Normalized view</div>
            <div className="wrap-gap">
              <Badge tone="indigo" mono dot={false}>{r.type}</Badge>
              <Badge tone={validTone[r.valid]} dot={false}>{r.valid === "pass" ? "Validated" : r.valid === "warn" ? "1 warning" : "1 error"}</Badge>
            </div>
          </div>
        </div>
        <div className="exp-body">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>{r.label}</div>
            <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{r.type}/{r.id} · {r.patient}</div>
          </div>

          <div className="norm-section">
            <div className="nh">Clinical detail</div>
            <div className="norm-card">
              <dl className="kv">
                <dt>Status</dt><dd><Badge tone={["active", "final", "finished"].includes(r.status) ? "green" : "gray"} dot={false}>{r.status}</Badge></dd>
                <dt>Code</dt><dd className="mono">{r.code}</dd>
                <dt>Effective date</dt><dd>{r.date}</dd>
                <dt>Subject</dt><dd>{r.patient}</dd>
                <dt>Profile</dt><dd>{r.profile}</dd>
              </dl>
            </div>
          </div>

          <div className="norm-section">
            <div className="nh">Mapping confidence</div>
            <div className="norm-card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Conf value={r.mapping} />
              <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>
                {r.mapping >= .85 ? "High-confidence mapping — included in analytics and quality measures."
                  : r.mapping >= .65 ? "Acceptable mapping — periodic spot-check recommended."
                    : "Below 0.80 threshold — excluded from measures until a steward reviews the code."}
              </span>
            </div>
          </div>

          <div className="norm-section">
            <div className="nh">Related resources</div>
            <div className="wrap-gap">
              {r.related.map((x, i) => {
                const tgt = D.fhirResources.find(rr => rr.type === x.t);
                return <button key={i} className="chip" onClick={() => tgt && setActiveId(tgt.id)}>
                  <Icon name="git" size={13} />{x.t}: {x.l}
                </button>;
              })}
            </div>
          </div>

          {r.valid === "err" && (
            <div className="norm-section">
              <div className="nh" style={{ color: "var(--rose)" }}>Action needed</div>
              <div className="norm-card" style={{ background: "var(--rose-soft)", borderColor: "#e3c3bb" }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#7c2f22" }}>
                  This MedicationRequest uses an unrecognized local code (<b className="mono">MTF1000</b>). Map it to RxNorm to restore it to analytics.
                </div>
                <button className="insight-action" style={{ marginTop: 12, background: "var(--rose)" }} onClick={() => toast("Opened RxNorm mapping assistant…")}>
                  <Icon name="bolt" size={14} />Map to RxNorm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — raw JSON / provenance / validation */}
      <div className="exp-pane exp-right">
        <div className="exp-pane-head">
          <div className="drawer-tabs" style={{ margin: "-13px -15px", padding: "0 15px", background: "transparent", border: "none" }}>
            {([["raw", "Raw JSON"], ["prov", "Provenance"], ["valid", "Validation"]] as [string, string][]).map(([id, l]) =>
              <div key={id} className={`drawer-tab ${rtab === id ? "on" : ""}`} onClick={() => setRtab(id)}>{l}</div>)}
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {rtab === "raw" && <React.Fragment>
            <div className="between" style={{ marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>FHIR R4 · {r.type}</span>
              <button className="icbtn" style={{ width: 28, height: 28 }} onClick={() => toast("Resource JSON copied")}><Icon name="code" size={14} /></button>
            </div>
            <JsonView data={r.json} />
          </React.Fragment>}
          {rtab === "prov" && <ProvSteps steps={r.provenance} />}
          {rtab === "valid" && <React.Fragment>
            {r.valid === "pass" && <React.Fragment>
              <ValItem kind="ok">Conforms to <b>{r.profile}</b></ValItem>
              <ValItem kind="ok">All required (1..*) elements present</ValItem>
              <ValItem kind="ok">Terminology bindings resolved</ValItem>
              <ValItem kind="ok">Subject reference resolves</ValItem>
            </React.Fragment>}
            {r.valid === "warn" && <React.Fragment>
              <ValItem kind="ok">Conforms to base FHIR R4</ValItem>
              <ValItem kind="warn">Missing <b>component.code</b> on one reading</ValItem>
              <ValItem kind="ok">Subject reference resolves</ValItem>
            </React.Fragment>}
            {r.valid === "err" && <React.Fragment>
              <ValItem kind="err">No coding system on <b>medicationCodeableConcept</b></ValItem>
              <ValItem kind="warn">RxNorm match 0.58 — below 0.80 threshold</ValItem>
              <ValItem kind="ok">Subject &amp; intent valid</ValItem>
            </React.Fragment>}
          </React.Fragment>}
        </div>
      </div>
    </div>
  );
}
